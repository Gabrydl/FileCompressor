// Photos, with sharp (libvips).
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { Fail, Skip } = require("./errors");
const heif = require("./heif");

sharp.cache(false);
sharp.concurrency(Math.max(1, Math.min(4, require("os").cpus().length - 1)));

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif", "avif", "bmp", "tif", "tiff", "gif", "jfif"];
const QUALITY_MIN = 30, QUALITY_FLOOR = 42, MIN_SIDE = 320;

function outFormat(ext, want, hasAlpha) {
  if (want && want !== "keep") return want;
  if (ext === "jpeg" || ext === "jfif") return "jpg";
  if (["jpg", "png", "webp"].includes(ext)) return ext;
  return hasAlpha ? "png" : "jpg";   // bmp, tiff, heic, gif, avif...
}
function encoder(img, fmt, q, palette) {
  if (fmt === "jpg") return img.flatten({ background: "#ffffff" }).jpeg({ quality: q, mozjpeg: true, chromaSubsampling: q >= 90 ? "4:4:4" : "4:2:0" });
  if (fmt === "webp") return img.webp({ quality: q, effort: 5, smartSubsample: true });
  if (fmt === "png") return palette ? img.png({ palette: true, quality: 90, colours: 256, compressionLevel: 9, effort: 8, dither: 1 }) : img.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 8 });
  throw new Fail("unknown format " + fmt);
}

/** GPS position inside the EXIF block (tag 0x8825), in either byte order. */
function hasGps(exif) {
  if (!exif || exif.length < 16) return false;
  const le = exif.indexOf(Buffer.from([0x25, 0x88, 0x04, 0x00])) >= 0, be = exif.indexOf(Buffer.from([0x88, 0x25, 0x00, 0x04])) >= 0;
  return le || be;
}

async function open(src, s = {}) {
  const strip = !!s.photoStripExif;
  if (heif.isHevcHeif(src)) {
    // iPhone HEIC: decoded with libheif (already upright); its EXIF goes back into a JPEG unless removing it was asked
    const d = await heif.decode(src);
    const meta = { width: d.width, height: d.height, hasAlpha: d.alpha, exif: d.exif, format: "heif", pages: 1 };
    const make = () => { const im = sharp(d.data, { raw: { width: d.width, height: d.height, channels: 4 }, limitInputPixels: 400e6 }); return d.alpha ? im : im.removeAlpha(); };
    const post = (buf, fmt) => (fmt === "jpg" && d.exif && !strip ? heif.jpegWithExif(buf, d.exif) : buf);
    return { meta, w: d.width, h: d.height, make, post };
  }
  try {
    const base = sharp(src, { failOn: "none", limitInputPixels: 400e6, animated: false });
    const meta = await base.metadata();
    let w = meta.width, h = meta.height;
    if (meta.orientation >= 5) [w, h] = [h, w];
    // orientation is applied to the pixels by rotate(), so dropping EXIF never turns the photo sideways
    return { meta, w, h, post: (b) => b, make: () => { const im = sharp(src, { failOn: "none", limitInputPixels: 400e6, animated: false }).rotate(); return strip ? im.keepIccProfile() : im.keepExif().keepIccProfile(); } };
  } catch (e) {
    throw new Fail("couldn't open this picture: " + (e.message || e));
  }
}

/** Largest scale (<= 1) that fits the exact size the user typed. */
function fitScale(o, s) {
  if (!s.photoResize) return 1;
  const W = +s.photoW || 0, H = +s.photoH || 0;
  let k = 1;
  if (W > 0) k = Math.min(k, W / o.w);
  if (H > 0) k = Math.min(k, H / o.h);
  return Math.min(1, k);
}

async function inspect(src) {
  try {
    if (heif.isHevcHeif(src)) {
      const m = heif.peek(src);
      return { w: m.w, h: m.h, exif: !!m.exif, gps: hasGps(m.exif), alpha: false, format: "heif" };
    }
    const meta = await sharp(src, { failOn: "none", limitInputPixels: 400e6 }).metadata();
    let w = meta.width, h = meta.height;
    if (meta.orientation >= 5) [w, h] = [h, w];
    const r = { w, h, exif: !!meta.exif, gps: hasGps(meta.exif), alpha: !!meta.hasAlpha, format: meta.format };
    if (meta.pages > 1) {
      if (meta.format === "gif" || meta.format === "webp") r.frames = meta.pages;
      else if (meta.format === "tiff") { r.pages = meta.pages; r.h = meta.pageHeight || h; }
    }
    return r;
  } catch (_) { return { unreadable: true }; }
}

async function render(o, fmt, q, scale, palette) {
  let img = o.make();
  if (scale < 1) img = img.resize(Math.max(1, Math.round(o.w * scale)), Math.max(1, Math.round(o.h * scale)), { fit: "fill", kernel: "lanczos3" });
  return o.post(await encoder(img, fmt, q, palette).toBuffer(), fmt);
}

// ---------------------------------------------------------------- animated GIF / WebP: keep every frame
// Quality steps for GIF, best first: fewer colours and more "lossy" (frames reuse the previous pixels when close enough).
const GIF_STEPS = [
  { colours: 256, frame: 0, pal: 3 }, { colours: 256, frame: 2, pal: 3 }, { colours: 256, frame: 5, pal: 4 },
  { colours: 224, frame: 8, pal: 5 }, { colours: 192, frame: 12, pal: 6 }, { colours: 160, frame: 16, pal: 8 },
  { colours: 128, frame: 22, pal: 10 }, { colours: 96, frame: 30, pal: 12 }, { colours: 64, frame: 32, pal: 16 },
];
const WEBP_STEPS = [80, 72, 64, 56, 48, 40, 32].map((q) => ({ q }));

async function animInfo(src) {
  try {
    const m = await sharp(src, { failOn: "none", limitInputPixels: false, animated: true }).metadata();
    return m.pages > 1 && (m.format === "gif" || m.format === "webp") ? m : null;
  } catch (_) { return null; }
}

async function renderAnim(src, m, fmt, step, scale) {
  const fh = m.pageHeight || m.height / m.pages;
  let img = sharp(src, { failOn: "none", limitInputPixels: false, animated: true });
  if (scale < 1) img = img.resize(Math.max(1, Math.round(m.width * scale)), Math.max(1, Math.round(fh * scale)), { fit: "fill", kernel: "lanczos3" });
  const keep = { loop: m.loop == null ? 0 : m.loop, ...(m.delay ? { delay: m.delay } : {}) };
  if (fmt === "webp") return img.webp({ quality: step.q, effort: 4, smartSubsample: true, ...keep }).toBuffer();
  return img.gif({ colours: step.colours, effort: 4, dither: 0.8, interFrameMaxError: step.frame, interPaletteMaxError: step.pal, reuse: true, ...keep }).toBuffer();
}

async function compressAnimated(src, out, s, target, ctx, m, fmt, why = "") {
  out = out.replace(/\.[^.]+$/, "." + fmt);
  const orig = fs.statSync(src).size;
  const fh = m.pageHeight || m.height / m.pages;
  const steps = fmt === "webp" ? WEBP_STEPS : GIF_STEPS;
  const cap = s.photoResize ? Math.min(1, (+s.photoW || Infinity) / m.width, (+s.photoH || Infinity) / fh) : 1;
  ctx.stage(`Compressing ${m.pages} frames`);
  let best = null, scale = cap, work = 0;
  const tick = () => ctx.progress(Math.min(0.95, 0.05 + 0.07 * ++work));
  for (let round = 0; round < 6; round++) {
    // best quality step that fits, by halving the list of steps
    let lo = 0, hi = steps.length - 1, fit = null, worst = null;
    while (lo <= hi) {
      if (ctx.signal.aborted) throw new Skip("stopped");
      const mid = (lo + hi) >> 1;
      const buf = await renderAnim(src, m, fmt, steps[mid], scale); tick();
      if (buf.length <= target) { fit = { buf, step: mid, scale }; hi = mid - 1; }
      else { if (!worst || buf.length < worst.buf.length) worst = { buf, step: mid, scale }; lo = mid + 1; }
    }
    if (fit) { best = fit; break; }
    if (!worst) break;
    if (!best || worst.buf.length < best.buf.length) best = worst;
    // even the strongest step is too big: make the frames smaller and try again
    const next = scale * Math.max(0.5, Math.min(0.92, Math.sqrt(target / best.buf.length) * 1.05));
    if (next * Math.max(m.width, fh) < 160) break;
    scale = next;
  }
  if (best.buf.length >= orig && cap >= 1) throw new Skip("already well compressed");
  fs.writeFileSync(out, best.buf);
  const notes = [why || `Animation kept (${m.pages} frames)`];
  if (best.scale < 1) notes.push(`Resized to ${Math.round(m.width * best.scale)}×${Math.round(fh * best.scale)}`);
  if (best.buf.length > target * 1.05) notes.push("Couldn't fully reach the target without ruining the animation");
  return { out, size: best.buf.length, note: notes.join(", ") };
}

// ---------------------------------------------------------------- multi-page TIFF (scans, faxes): every page is kept
async function tiffPages(src) {
  try {
    const m = await sharp(src, { failOn: "none", limitInputPixels: false }).metadata();
    return m.format === "tiff" && m.pages > 1 ? m : null;
  } catch (_) { return null; }
}
async function renderPages(src, m, scale, q, bilevel) {
  const pages = [];
  for (let p = 0; p < m.pages; p++) {
    let img = sharp(src, { failOn: "none", limitInputPixels: 400e6, page: p }).rotate();
    if (scale < 1) {
      const pm = await sharp(src, { failOn: "none", limitInputPixels: 400e6, page: p }).metadata();
      img = img.resize(Math.max(1, Math.round(pm.width * scale)), Math.max(1, Math.round(pm.height * scale)), { fit: "fill", kernel: "lanczos3" });
    }
    pages.push(await img.png().toBuffer());
  }
  let joined;
  try { joined = sharp(pages, { join: { animated: true } }); }
  catch (_) { throw new Skip("Multi-page TIFF with pages of different sizes: left untouched"); }
  const out = bilevel ? joined.toColourspace("b-w").tiff({ compression: "ccittfax4", bitdepth: 1 }) : joined.tiff({ compression: "jpeg", quality: q });
  try { return await out.toBuffer(); }
  catch (e) { if (/size|dimension|match/i.test(String(e.message))) throw new Skip("Multi-page TIFF with pages of different sizes: left untouched"); throw e; }
}
async function compressPages(src, out, s, target, ctx, m) {
  out = out.replace(/\.[^.]+$/, "." + path.extname(src).slice(1).toLowerCase());
  const orig = fs.statSync(src).size;
  const asked = s.imageFormat && s.imageFormat !== "keep" ? s.imageFormat.toUpperCase() : "";
  const bilevel = m.bitsPerSample === 1 || m.compression === "ccittfax4" || m.compression === "ccittfax3";
  ctx.stage(`Compressing ${m.pages} pages`);
  const cap = s.photoResize ? Math.min(1, (+s.photoW || Infinity) / m.width, (+s.photoH || Infinity) / (m.pageHeight || m.height)) : 1;
  let best = null, scale = cap;
  for (let round = 0; round < 6; round++) {
    if (ctx.signal.aborted) throw new Skip("stopped");
    const steps = bilevel ? [0] : [80, 68, 56, 46];
    for (const q of steps) {
      const buf = await renderPages(src, m, scale, q, bilevel);
      ctx.progress(Math.min(0.95, 0.1 + round * 0.15));
      if (!best || buf.length < best.buf.length) best = { buf, scale };
      if (buf.length <= target) break;
    }
    if (best.buf.length <= target) break;
    const next = scale * Math.max(0.5, Math.min(0.92, Math.sqrt(target / best.buf.length) * 1.05));
    if (next * m.width < 600) break;
    scale = next;
  }
  if (best.buf.length >= orig && cap >= 1) throw new Skip("already well compressed");
  fs.writeFileSync(out, best.buf);
  const notes = [`All ${m.pages} pages kept`];
  if (asked) notes.push(`kept as TIFF: ${asked} can hold only one page`);
  if (best.scale < 1) notes.push(`Resized to ${Math.round(m.width * best.scale)} px wide`);
  if (best.buf.length > target * 1.05) notes.push("Couldn't fully reach the target without ruining the pages");
  return { out, size: best.buf.length, note: notes.join(", ") };
}

async function compress(src, out, s, target, ctx) {
  const ext = path.extname(src).slice(1).toLowerCase();
  const m = await animInfo(src);
  if (m) {
    // an animation stays an animation: JPG and PNG (also when a preset like Discord asks for JPG) can't move
    const own = m.format === "webp" ? "webp" : "gif";
    const asked = !s.imageFormat || s.imageFormat === "keep" ? own : s.imageFormat;
    const fmt = asked === "gif" || asked === "webp" ? asked : own;
    const why = fmt !== asked ? `Animation kept as ${fmt.toUpperCase()} (${m.pages} frames): ${asked.toUpperCase()} can't hold an animation` : "";
    return compressAnimated(src, out, s, target, ctx, m, fmt, why);
  }
  const pg = await tiffPages(src);
  if (pg) return compressPages(src, out, s, target, ctx, pg);
  const o = await open(src, s);
  const fmt = outFormat(ext, s.imageFormat, o.meta.hasAlpha);
  out = out.replace(/\.[^.]+$/, "." + fmt);
  const orig = fs.statSync(src).size;
  ctx.stage("Compressing");
  const cap = fitScale(o, s);
  let best = null, scale = cap, palette = false, notes = [];
  for (let round = 0; round < 12; round++) {
    if (ctx.signal.aborted) throw new Skip("stopped");
    if (fmt === "png") {
      const buf = await render(o, fmt, 100, scale, palette);
      if (!best || buf.length < best.buf.length) best = { buf, scale, palette };
      if (buf.length <= target) break;
      if (!palette) { palette = true; continue; }
    } else {
      // largest quality that fits, by halving the range
      let lo = QUALITY_MIN, hi = 88, fit = null;
      const top = await render(o, fmt, hi, scale);
      if (top.length <= target) fit = { buf: top, q: hi };
      else {
        while (hi - lo > 3) {
          const mid = (lo + hi) >> 1;
          const buf = await render(o, fmt, mid, scale);
          if (buf.length <= target) { fit = { buf, q: mid }; lo = mid; } else hi = mid;
          ctx.progress(Math.min(0.95, 0.1 + round * 0.08));
        }
      }
      if (fit && (fit.q >= QUALITY_FLOOR || scale * Math.max(o.w, o.h) <= MIN_SIDE)) { best = { buf: fit.buf, scale }; break; }
      const low = fit ? fit.buf : await render(o, fmt, QUALITY_MIN, scale);
      if (!best || low.length < best.buf.length) best = { buf: low, scale };
    }
    // still too big at an acceptable quality: make the picture smaller
    const ratio = target / best.buf.length;
    const next = scale * Math.max(0.5, Math.min(0.92, Math.sqrt(ratio) * 1.05));
    if (next * Math.max(o.w, o.h) < MIN_SIDE) break;
    scale = next;
    ctx.progress(Math.min(0.95, 0.15 + round * 0.08));
  }
  const changed = cap < 1 || (s.photoStripExif && o.meta.exif);
  if (best.buf.length >= orig && fmt === (ext === "jpeg" ? "jpg" : ext) && !changed) throw new Skip("already well compressed");
  fs.writeFileSync(out, best.buf);
  if (s.photoStripExif && o.meta.exif) notes.push(hasGps(o.meta.exif) ? "GPS location and EXIF removed" : "EXIF removed");
  if (best.palette) notes.push("Reduced to 256 colors");
  if (best.scale < 1) notes.push(`Resized to ${Math.round(o.w * best.scale)}×${Math.round(o.h * best.scale)}`);
  if (best.buf.length > target * 1.05) notes.push("Couldn't fully reach the target without ruining the picture");
  return { out, size: best.buf.length, note: notes.join(", ") };
}

async function convert(src, out, s, ctx) {
  const ext = path.extname(src).slice(1).toLowerCase();
  const m = await animInfo(src);
  if (m) {
    const own = m.format === "webp" ? "webp" : "gif";
    const want = !s.imageFormat || s.imageFormat === "keep" ? own : s.imageFormat;
    if (want !== "gif" && want !== "webp") throw new Skip(`Animated ${own.toUpperCase()}: ${want.toUpperCase()} would keep only one frame, left untouched`);
    if (want === own && !s.photoResize) throw new Skip("same format");
    ctx.stage("Converting " + m.pages + " frames");
    out = out.replace(/\.[^.]+$/, "." + want);
    const fh = m.pageHeight || m.height / m.pages;
    const cap = s.photoResize ? Math.min(1, (+s.photoW || Infinity) / m.width, (+s.photoH || Infinity) / fh) : 1;
    const buf = await renderAnim(src, m, want, want === "webp" ? { q: 85 } : GIF_STEPS[0], cap);
    fs.writeFileSync(out, buf);
    return { out, size: buf.length, note: `Animation kept (${m.pages} frames)` };
  }
  const pg = await tiffPages(src);
  if (pg) {
    const want = !s.imageFormat || s.imageFormat === "keep" ? "tiff" : s.imageFormat;
    throw new Skip(want === "tiff" ? "same format" : `Multi-page TIFF (${pg.pages} pages): ${want.toUpperCase()} would keep only the first page, left untouched`);
  }
  const o = await open(src, s);
  const cap = fitScale(o, s);
  const same = !s.imageFormat || s.imageFormat === "keep" || s.imageFormat === (ext === "jpeg" ? "jpg" : ext);
  if (same && cap >= 1 && !(s.photoStripExif && o.meta.exif)) throw new Skip("same format");
  const want = outFormat(ext, s.imageFormat, o.meta.hasAlpha);
  out = out.replace(/\.[^.]+$/, "." + want);
  ctx.stage(same ? "Saving" : "Converting");
  let img = o.make();
  if (cap < 1) img = img.resize(Math.max(1, Math.round(o.w * cap)), Math.max(1, Math.round(o.h * cap)), { fit: "fill", kernel: "lanczos3" });
  const buf = o.post(await encoder(img, want, want === "webp" ? 85 : 92, false).toBuffer(), want);
  fs.writeFileSync(out, buf);
  const notes = [];
  if (cap < 1) notes.push(`Resized to ${Math.round(o.w * cap)}×${Math.round(o.h * cap)}`);
  if (s.photoStripExif && o.meta.exif) notes.push(hasGps(o.meta.exif) ? "GPS location and EXIF removed" : "EXIF removed");
  return { out, size: buf.length, note: notes.join(", ") };
}

/** Used by the PDF and Office engines: re-encode one embedded picture. */
async function shrinkBuffer(buf, { maxDim, quality, keepPng }) {
  const img = sharp(buf, { failOn: "none", limitInputPixels: 400e6 });
  const meta = await img.metadata();
  const s = Math.min(1, maxDim / Math.max(meta.width || 1, meta.height || 1));
  let p = sharp(buf, { failOn: "none", limitInputPixels: 400e6 }).rotate();
  if (s < 1) p = p.resize(Math.round(meta.width * s), Math.round(meta.height * s), { kernel: "lanczos3" });
  if (keepPng || meta.hasAlpha) return { buf: await p.png({ palette: true, quality: 90, compressionLevel: 9, effort: 7 }).toBuffer(), fmt: "png" };
  return { buf: await p.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer(), fmt: "jpg" };
}

/** A PNG of the picture (max side in px), for the before/after view. */
async function previewPng(file, maxSide) {
  if (heif.isHevcHeif(file)) {
    const o = await open(file, { photoStripExif: true });
    return o.make().resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  }
  return sharp(file, { failOn: "none", limitInputPixels: 400e6, animated: false }).rotate().resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

module.exports = { compress, convert, shrinkBuffer, inspect, previewPng, IMAGE_EXT };
