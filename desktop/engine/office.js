// Word, PowerPoint and Excel (.docx .pptx .xlsx): the pictures inside are re-compressed and the file is zipped tighter.
const fs = require("fs");
const JSZip = require("jszip");
const { Fail, Skip } = require("./errors");
const { shrinkBuffer } = require("./image");

const OFFICE_EXT = ["docx", "pptx", "xlsx", "docm", "pptm", "xlsm"];
const PICTURE = /\.(jpe?g|png|bmp|tiff?)$/i;
const MEDIA = /\.(mp4|mov|m4v|wmv|avi|mp3|m4a|wav|wma)$/i;
const LADDER = [[2200, 80], [1800, 72], [1500, 64], [1250, 56], [1000, 48], [800, 40]];

async function build(zipBytes, maxDim, quality, signal) {
  let zip;
  try { zip = await JSZip.loadAsync(zipBytes); } catch (_) { throw new Fail("This file isn't a valid Office document (or it's password-protected)."); }
  if (!zip.file("[Content_Types].xml")) throw new Fail("This file isn't a valid Office document.");
  const renames = {};
  let count = 0, media = false;
  for (const name of Object.keys(zip.files)) {
    if (signal.aborted) throw new Skip("stopped");
    const f = zip.files[name];
    if (f.dir || !/\/media\//.test(name)) continue;
    if (MEDIA.test(name)) { media = true; continue; }
    if (!PICTURE.test(name) || !maxDim) continue;
    const buf = await f.async("nodebuffer");
    if (buf.length < 40000) continue;
    let r;
    try { r = await shrinkBuffer(buf, { maxDim, quality, keepPng: false }); } catch (_) { continue; }
    if (r.buf.length >= buf.length * 0.92) continue;
    const isJpg = /\.jpe?g$/i.test(name);
    if (r.fmt === "jpg" && !isJpg) {
      // a big photo saved as PNG/BMP/TIFF: store it as JPEG and point the document to the new name
      const nn = name.replace(/\.[^.]+$/, ".jpeg");
      if (zip.file(nn)) continue;
      zip.remove(name);
      zip.file(nn, r.buf);
      renames[name.split("/").pop()] = nn.split("/").pop();
    } else if (r.fmt === "png" && isJpg) continue;
    else zip.file(name, r.buf);
    count++;
  }
  if (Object.keys(renames).length) {
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith(".rels")) continue;
      let x = await zip.file(name).async("string");
      for (const [a, b] of Object.entries(renames)) x = x.split("/" + a + '"').join("/" + b + '"').split('"' + a + '"').join('"' + b + '"').split("media/" + a).join("media/" + b);
      zip.file(name, x);
    }
    let ct = await zip.file("[Content_Types].xml").async("string");
    if (!/Extension="jpeg"/i.test(ct)) ct = ct.replace("</Types>", '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
    zip.file("[Content_Types].xml", ct);
  }
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  return { bytes: out, count, media };
}

async function compress(src, out, s, target, ctx) {
  const bytes = fs.readFileSync(src);
  ctx.stage("Compressing pictures");
  let best = null;
  const ladder = s.officePhotos === false ? [[0, 0]] : LADDER;   // 0 = pictures left alone, only packed tighter
  for (let k = 0; k < ladder.length; k++) {
    const r = await build(bytes, ladder[k][0], ladder[k][1], ctx.signal);
    if (!best || r.bytes.length < best.bytes.length) best = r;
    ctx.progress((k + 1) / ladder.length);
    if (r.bytes.length <= target || r.count === 0) break;
  }
  if (best.bytes.length >= bytes.length * 0.99) throw new Skip(best.count || s.officePhotos === false ? "already well compressed" : "There are no pictures inside to compress.");
  fs.writeFileSync(out, best.bytes);
  const notes = [];
  if (best.bytes.length > target * 1.05) notes.push("Couldn't fully reach the target without ruining the pictures.");
  if (best.media) notes.push("Videos/audio embedded in the file were left as they are.");
  return { out, size: best.bytes.length, note: notes.join(" ") };
}

async function inspect(src) {
  try {
    const zip = await JSZip.loadAsync(fs.readFileSync(src));
    let pictures = 0, big = 0, media = 0;
    for (const name of Object.keys(zip.files)) {
      const f = zip.files[name];
      if (f.dir || !/\/media\//.test(name)) continue;
      if (MEDIA.test(name)) { media++; continue; }
      if (!PICTURE.test(name)) continue;
      pictures++;
      if ((f._data && f._data.uncompressedSize || 0) >= 40000) big++;
    }
    return { pictures, big, media };
  } catch (_) { return { unreadable: true }; }
}

module.exports = { compress, inspect, OFFICE_EXT };
