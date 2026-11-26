// iPhone photos (HEIC/HEIF with HEVC inside). The picture library (sharp) can't decode HEVC, so these are decoded
// with libheif built for WebAssembly (heic-decode), and their EXIF block (date, camera, place) is read from the file
// so it can be put back into the JPEG.
const fs = require("fs");

/** The boxes of an ISO-BMFF file (HEIC, MP4...) between start and end. */
function boxes(buf, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    let head = 8;
    if (size === 1) { if (p + 16 > end) break; size = Number(buf.readBigUInt64BE(p + 8)); head = 16; }
    else if (size === 0) size = end - p;
    if (size < head || p + size > end) break;
    out.push({ type, start: p, data: p + head, end: p + size });
    p += size;
  }
  return out;
}
function readN(buf, p, n) {
  if (n === 0) return 0;
  if (n === 4) return buf.readUInt32BE(p);
  if (n === 8) return Number(buf.readBigUInt64BE(p));
  if (n === 2) return buf.readUInt16BE(p);
  return 0;
}

/** Is this an HEIF file whose picture is HEVC (so sharp can't open it)? */
function isHevcHeif(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const b = Buffer.alloc(64);
    const n = fs.readSync(fd, b, 0, 64, 0);
    if (n < 16 || b.toString("latin1", 4, 8) !== "ftyp") return false;
    const size = Math.min(n, b.readUInt32BE(0));
    const brands = [];
    for (let p = 8; p + 4 <= size; p += 4) if (p !== 12) brands.push(b.toString("latin1", p, p + 4));
    return brands.some(x => ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(x));
  } catch (_) { return false; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (_) { /* */ } }
}

/** The raw EXIF (TIFF) block stored in the file, or null. Also the size of the main picture (ispe). */
function readMeta(buf) {
  const top = boxes(buf, 0, buf.length);
  const meta = top.find(b => b.type === "meta");
  if (!meta) return { exif: null };
  const inner = boxes(buf, meta.data + 4, meta.end);   // meta is a full box: version + flags first
  // which item is the EXIF block
  let exifId = null;
  const iinf = inner.find(b => b.type === "iinf");
  if (iinf) {
    const ver = buf[iinf.data];
    const entries = boxes(buf, iinf.data + 4 + (ver === 0 ? 2 : 4), iinf.end);
    for (const e of entries) {
      if (e.type !== "infe") continue;
      const v = buf[e.data];
      if (v < 2) continue;
      const id = v === 2 ? buf.readUInt16BE(e.data + 4) : buf.readUInt32BE(e.data + 4);
      const t = buf.toString("latin1", e.data + (v === 2 ? 8 : 10), e.data + (v === 2 ? 12 : 14));
      if (t === "Exif") { exifId = id; break; }
    }
  }
  let w = 0, h = 0, turned = false;
  const iprp = inner.find(b => b.type === "iprp");
  if (iprp) {
    const ipco = boxes(buf, iprp.data, iprp.end).find(b => b.type === "ipco");
    if (ipco) for (const p of boxes(buf, ipco.data, ipco.end)) {
      if (p.type === "irot" && (buf[p.data] & 1)) turned = true;
      if (p.type !== "ispe") continue;
      const pw = buf.readUInt32BE(p.data + 4), ph = buf.readUInt32BE(p.data + 8);
      if (pw * ph > w * h) { w = pw; h = ph; }
    }
  }
  if (turned) [w, h] = [h, w];
  if (exifId === null) return { exif: null, w, h };
  const iloc = inner.find(b => b.type === "iloc");
  if (!iloc) return { exif: null, w, h };
  const ver = buf[iloc.data];
  let p = iloc.data + 4;
  const offSize = buf[p] >> 4, lenSize = buf[p] & 15, baseSize = buf[p + 1] >> 4, idxSize = ver >= 1 ? buf[p + 1] & 15 : 0;
  p += 2;
  const count = ver < 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
  p += ver < 2 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const id = ver < 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
    p += ver < 2 ? 2 : 4;
    let method = 0;
    if (ver >= 1) { method = buf.readUInt16BE(p) & 15; p += 2; }
    p += 2;   // data reference index
    const base = readN(buf, p, baseSize); p += baseSize;
    const ext = buf.readUInt16BE(p); p += 2;
    const parts = [];
    for (let k = 0; k < ext; k++) {
      p += idxSize;
      const off = readN(buf, p, offSize); p += offSize;
      const len = readN(buf, p, lenSize); p += lenSize;
      parts.push([base + off, len]);
    }
    if (id !== exifId) continue;
    if (method !== 0) return { exif: null, w, h };   // stored inside the meta box: rare, skipped
    const data = Buffer.concat(parts.map(([o, l]) => buf.subarray(o, l ? o + l : buf.length)));
    if (data.length < 12) return { exif: null, w, h };
    // 4 bytes: where the TIFF header starts, then the TIFF block
    let t = 4 + data.readUInt32BE(0);
    if (t + 8 > data.length || !isTiff(data, t)) {
      t = -1;
      for (let k = 4; k < Math.min(data.length - 4, 64); k++) if (isTiff(data, k)) { t = k; break; }
      if (t < 0) return { exif: null, w, h };
    }
    return { exif: Buffer.from(data.subarray(t)), w, h };
  }
  return { exif: null, w, h };
}
function isTiff(b, p) {
  return (b[p] === 0x4d && b[p + 1] === 0x4d && b[p + 2] === 0 && b[p + 3] === 42) || (b[p] === 0x49 && b[p + 1] === 0x49 && b[p + 2] === 42 && b[p + 3] === 0);
}

/** The picture is already turned upright when decoded, so the EXIF must say "normal" (1) or viewers turn it again. */
function uprightExif(tiff) {
  const t = Buffer.from(tiff);
  try {
    const le = t[0] === 0x49;
    const u16 = (p) => le ? t.readUInt16LE(p) : t.readUInt16BE(p);
    const u32 = (p) => le ? t.readUInt32LE(p) : t.readUInt32BE(p);
    const ifd = u32(4);
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === 0x0112) { if (le) t.writeUInt16LE(1, e + 8); else t.writeUInt16BE(1, e + 8); }
    }
  } catch (_) { /* leave it */ }
  return t;
}

/** Puts an EXIF block into a JPEG (right after the start marker). */
function jpegWithExif(jpg, tiff) {
  if (!tiff || jpg[0] !== 0xff || jpg[1] !== 0xd8 || tiff.length + 8 > 65533) return jpg;
  const head = Buffer.from([0xff, 0xe1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  head.writeUInt16BE(tiff.length + 8, 2);
  return Buffer.concat([jpg.subarray(0, 2), head, tiff, jpg.subarray(2)]);
}

const cache = new Map();
/** Decodes the picture once (several sizes are tried from the same pixels). */
async function decode(file) {
  const st = fs.statSync(file);
  const key = file + "|" + st.size + "|" + st.mtimeMs;
  if (cache.has(key)) return cache.get(key);
  const buf = fs.readFileSync(file);
  let r;
  try { r = await require("heic-decode")({ buffer: buf }); }
  catch (e) { throw new Error("couldn't open this picture: " + (e.message || e)); }
  let alpha = false;
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i] !== 255) { alpha = true; break; }
  const m = readMeta(buf);
  const out = { width: r.width, height: r.height, data: Buffer.from(r.data.buffer, r.data.byteOffset, r.data.length), alpha, exif: m.exif ? uprightExif(m.exif) : null };
  cache.clear();
  cache.set(key, out);
  return out;
}

/** Size and EXIF without decoding the pixels (for the tick boxes). */
function peek(file) {
  const m = readMeta(fs.readFileSync(file));
  return { w: m.w, h: m.h, exif: m.exif };
}

module.exports = { isHevcHeif, decode, peek, jpegWithExif };
