// PDFs, with MuPDF.
// Lossless steps (always safe, nothing visible changes): tighter internal compression, unused objects removed,
// metadata / thumbnails / attachments removed, fonts trimmed to the letters used.
// Lossy steps (only when ticked): photos re-compressed, black & white, every page as one picture.
const fs = require("fs");
const { Fail, Skip } = require("./errors");

let mupdf = null;
async function lib() { if (!mupdf) mupdf = await import("mupdf"); return mupdf; }

// tried in order until the file fits the target
const LADDER = [[2200, 82], [1800, 74], [1500, 66], [1250, 58], [1050, 50], [850, 42], [700, 35]];
const PAGE_LADDER = [[150, 72], [130, 64], [110, 56], [96, 50], [80, 44], [72, 38]];
const SAVE_OPTS = "garbage=deduplicate,compress=yes,compress-fonts=yes,objstms=yes";

function openDoc(m, bytes) {
  let doc;
  try { doc = m.Document.openDocument(bytes, "application/pdf"); }
  catch (e) { throw new Fail("Couldn't open this PDF (" + (e.message || e) + ")"); }
  if (doc.needsPassword()) throw new Fail("This PDF is password-protected.");
  return doc.asPDF();
}

// ------------------------------------------------------------------ what is inside (for the tick boxes)
function isPhoto(ref) {
  const sub = ref.get("Subtype");
  if (!sub.isName() || sub.asName() !== "Image") return 0;
  const im = ref.get("ImageMask");
  if (!im.isNull() && im.asBoolean()) return 0;
  const filter = ref.get("Filter");
  const fname = filter.isName() ? filter.asName() : "";
  if (fname === "JBIG2Decode" || fname === "CCITTFaxDecode") return 0;
  const bpc = ref.get("BitsPerComponent");
  if (!bpc.isNull() && bpc.asNumber() < 8) return 0;
  const len = ref.readRawStream().getLength();
  if (len < 30000) return 0;
  const W = ref.get("Width").asNumber() || 0, H = ref.get("Height").asNumber() || 0;
  if (fname !== "DCTDecode" && fname !== "JPXDecode" && W * H < 300000) return 0;
  return len;
}
function fieldsOf(doc) {
  const form = doc.getTrailer().get("Root").get("AcroForm");
  if (form.isNull()) return { fields: 0, signed: false, sigFlags: 0 };
  const sigFlags = form.get("SigFlags").isNull() ? 0 : form.get("SigFlags").asNumber();
  let fields = 0, signed = false;
  const walk = (arr, depth) => {
    if (!arr || !arr.isArray() || depth > 8) return;
    for (let i = 0; i < arr.length; i++) {
      const f = arr.get(i);
      if (f.isNull()) continue;
      fields++;
      const ft = f.get("FT");
      if (ft.isName() && ft.asName() === "Sig" && !f.get("V").isNull()) signed = true;
      walk(f.get("Kids"), depth + 1);
    }
  };
  walk(form.get("Fields"), 0);
  return { fields, signed: signed || (sigFlags & 2) === 2, sigFlags };
}
function metaOf(doc) {
  const tr = doc.getTrailer();
  const info = tr.get("Info");
  let keys = 0;
  if (info.isDictionary()) info.forEach(() => { keys++; });
  const xmp = !tr.get("Root").get("Metadata").isNull();
  return keys > 0 || xmp;
}

async function inspect(src) {
  const m = await lib();
  const bytes = fs.readFileSync(src);
  let doc;
  try { doc = m.Document.openDocument(bytes, "application/pdf"); } catch (_) { return { unreadable: true }; }
  if (doc.needsPassword()) return { locked: true };
  doc = doc.asPDF();
  let photos = 0, photoBytes = 0, fonts = 0;
  const n = doc.countObjects();
  for (let num = 1; num < n; num++) {
    try {
      const ref = doc.newIndirect(num);
      if (ref.isStream()) { const l = isPhoto(ref); if (l) { photos++; photoBytes += l; } continue; }
      if (ref.isDictionary()) {
        const t = ref.get("Type");
        if (t.isName() && t.asName() === "FontDescriptor" && (!ref.get("FontFile").isNull() || !ref.get("FontFile2").isNull() || !ref.get("FontFile3").isNull())) fonts++;
      }
    } catch (_) { /* */ }
  }
  let thumbs = 0;
  const pages = doc.countPages();
  for (let i = 0; i < pages; i++) { try { if (!doc.findPage(i).get("Thumb").isNull()) thumbs++; } catch (_) { /* */ } }
  let attachments = 0;
  try { attachments = Object.keys(doc.getEmbeddedFiles() || {}).length; } catch (_) { /* */ }
  const f = fieldsOf(doc);
  return { pages, photos, photoBytes, fonts, thumbs, attachments, metadata: metaOf(doc), form: f.fields > 0, signed: f.signed, size: bytes.length };
}

// ------------------------------------------------------------------ building one copy
/** Re-encode the pictures of an open document (photos smaller, or everything grey). */
function rewriteImages(m, doc, { maxDim, quality, photos, gray }) {
  let count = 0;
  const n = doc.countObjects();
  for (let num = 1; num < n; num++) {
    try {
      const ref = doc.newIndirect(num);
      if (!ref.isStream()) continue;
      const sub = ref.get("Subtype");
      if (!sub.isName() || sub.asName() !== "Image") continue;
      if (!ref.get("SMask").isNull() || !ref.get("Mask").isNull()) continue;
      const im = ref.get("ImageMask");
      if (!im.isNull() && im.asBoolean()) continue;
      const bpc = ref.get("BitsPerComponent");
      if (!bpc.isNull() && bpc.asNumber() < 8) continue;
      const filter = ref.get("Filter");
      const fname = filter.isName() ? filter.asName() : "";
      if (fname === "JBIG2Decode" || fname === "CCITTFaxDecode") continue;   // black & white scans: already tiny
      const rawLen = ref.readRawStream().getLength();
      const photo = isPhoto(ref) > 0;
      if (!photo && !(gray && rawLen > 4000)) continue;                     // logos and drawings stay sharp
      const img = doc.loadImage(ref);
      const W = img.getWidth(), H = img.getHeight();
      const isGray = img.getNumberOfComponents() === 1;
      if (gray && isGray && !photos) continue;
      const s = photos && photo ? Math.min(1, maxDim / Math.max(W, H)) : 1;
      const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
      const toGray = gray || isGray;
      const pix = new m.Pixmap(toGray ? m.ColorSpace.DeviceGray : m.ColorSpace.DeviceRGB, [0, 0, w, h], false);
      pix.clear(255);
      const dev = new m.DrawDevice(m.Matrix.identity, pix);
      dev.fillImage(img, [w, 0, 0, h, 0, 0], 1);
      dev.close();
      const jpg = pix.asJPEG(photos && photo ? quality : 85);
      if (jpg.length > rawLen * 0.9 && !(gray && !isGray)) continue;
      const nref = doc.addImage(new m.Image(jpg));
      const dict = doc.newDictionary();
      nref.forEach((v, k) => { if (k !== "Length") dict.put(k, v); });
      ref.writeObject(dict);
      ref.writeRawStream(nref.readRawStream());
      count++;
    } catch (_) { /* leave this object as it is */ }
  }
  return count;
}

function cleanup(doc, o, form) {
  const done = [];
  if (o.pdfMeta) {
    try {
      const tr = doc.getTrailer();
      const info = tr.get("Info");
      if (info.isDictionary()) { const keys = []; info.forEach((_v, k) => keys.push(k)); keys.forEach(k => info.delete(k)); if (keys.length) done.push("metadata removed"); }
      const root = tr.get("Root");
      if (!root.get("Metadata").isNull()) { root.delete("Metadata"); if (!done.includes("metadata removed")) done.push("metadata removed"); }
      if (!root.get("PieceInfo").isNull()) root.delete("PieceInfo");
    } catch (_) { /* */ }
  }
  if (o.pdfExtras) {
    let k = 0;
    for (let i = 0; i < doc.countPages(); i++) {
      try { const p = doc.findPage(i); if (!p.get("Thumb").isNull()) { p.delete("Thumb"); k++; } if (!p.get("PieceInfo").isNull()) p.delete("PieceInfo"); } catch (_) { /* */ }
    }
    try { const files = Object.keys(doc.getEmbeddedFiles() || {}); files.forEach(f => doc.deleteEmbeddedFile(f)); if (files.length) done.push("attachments removed"); } catch (_) { /* */ }
    if (k) done.push("thumbnails removed");
  }
  if (o.pdfFonts && !form) {
    try { doc.subsetFonts(); done.push("fonts trimmed"); } catch (_) { /* some fonts can't be trimmed: left whole */ }
  }
  return done;
}

function build(m, bytes, o, form, pic) {
  const doc = openDoc(m, bytes);
  const done = cleanup(doc, o, form);
  let count = 0;
  if (o.pdfPhotos || o.pdfGray) count = rewriteImages(m, doc, { maxDim: pic ? pic[0] : 99999, quality: pic ? pic[1] : 85, photos: !!(o.pdfPhotos && pic), gray: !!o.pdfGray });
  const out = doc.saveToBuffer(SAVE_OPTS).asUint8Array().slice();
  return { bytes: out, count, done };
}

/** Every page becomes one JPEG picture (smallest for scans; text is no longer selectable). */
function asPictures(m, bytes, dpi, quality, gray, signal) {
  const src = openDoc(m, bytes);
  const out = new m.PDFDocument();
  for (let i = 0; i < src.countPages(); i++) {
    if (signal.aborted) throw new Skip("stopped");
    const page = src.loadPage(i);
    const [x0, y0, x1, y1] = page.getBounds();
    const pix = page.toPixmap(m.Matrix.scale(dpi / 72, dpi / 72), gray ? m.ColorSpace.DeviceGray : m.ColorSpace.DeviceRGB, false, true);
    const img = out.addImage(new m.Image(pix.asJPEG(quality)));
    const res = out.addObject({ XObject: { I0: img } });
    const w = x1 - x0, h = y1 - y0;
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 0 0 cm /I0 Do Q`;
    out.insertPage(-1, out.addPage([0, 0, w, h], 0, res, content));
  }
  return out.saveToBuffer(SAVE_OPTS).asUint8Array().slice();
}

const OPT_DEFAULTS = { pdfPhotos: true, pdfMeta: true, pdfFonts: true, pdfExtras: true, pdfGray: false, pdfAsPictures: false };

async function compress(src, out, s, target, ctx) {
  const m = await lib();
  const bytes = fs.readFileSync(src);
  const orig = bytes.length;
  const o = { ...OPT_DEFAULTS, ...s };
  ctx.stage("Reading the PDF");
  const info = await inspect(src);
  if (info.locked) throw new Fail("This PDF is password-protected.");
  if (info.unreadable) throw new Fail("Couldn't open this PDF");
  if (info.signed) throw new Skip("signed");
  let best = null;
  if (o.pdfAsPictures) {
    ctx.stage("Rebuilding pages as pictures");
    for (let k = 0; k < PAGE_LADDER.length; k++) {
      if (ctx.signal.aborted) throw new Skip("stopped");
      const [dpi, q] = PAGE_LADDER[k];
      const b = asPictures(m, bytes, dpi, q, o.pdfGray, ctx.signal);
      if (!best || b.length < best.bytes.length) best = { bytes: b, count: 1, done: ["pages as pictures"] };
      ctx.progress((k + 1) / PAGE_LADDER.length);
      if (b.length <= target) break;
      await new Promise(res => setImmediate(res));
    }
  } else {
    // 1) lossless (plus grey if ticked): never changes how the pages look
    ctx.stage("Cleaning up (no quality loss)");
    best = build(m, bytes, o, info.form, null);
    ctx.progress(0.15);
    // 2) photos, step by step, only when still above the target
    if (o.pdfPhotos && info.photos > 0 && best.bytes.length > target) {
      ctx.stage("Compressing photos");
      for (let k = 0; k < LADDER.length; k++) {
        if (ctx.signal.aborted) throw new Skip("stopped");
        const r = build(m, bytes, o, info.form, LADDER[k]);
        if (r.bytes.length < best.bytes.length) best = r;
        ctx.progress(0.15 + 0.85 * (k + 1) / LADDER.length);
        if (r.bytes.length <= target || r.count === 0) break;
        await new Promise(res => setImmediate(res));
      }
    }
  }
  if (best.bytes.length >= orig * 0.995) throw new Skip("already well compressed");
  fs.writeFileSync(out, best.bytes);
  const notes = [];
  const lossless = !o.pdfAsPictures && !(best.count && (o.pdfPhotos || o.pdfGray));
  if (lossless) notes.push("No quality lost" + (best.done.length ? ": " + best.done.join(", ") : ""));
  if (info.form && o.pdfFonts) notes.push("Fonts kept whole (fillable form)");
  if (best.bytes.length > target * 1.05) notes.push(info.photos ? "Couldn't fully reach the target without ruining the pictures" : "Text-only PDF: this is as small as it gets without quality loss");
  return { out, size: best.bytes.length, note: notes.join(". ") };
}

/** Pictures of one page, for the before/after view. */
async function renderPage(file, page, maxSide) {
  const m = await lib();
  const doc = m.Document.openDocument(fs.readFileSync(file), "application/pdf");
  const n = doc.countPages();
  const p = doc.loadPage(Math.max(0, Math.min(n - 1, page)));
  const [x0, y0, x1, y1] = p.getBounds();
  const sc = Math.min(3, maxSide / Math.max(x1 - x0, y1 - y0));
  const pix = p.toPixmap(m.Matrix.scale(sc, sc), m.ColorSpace.DeviceRGB, false, true);
  return { png: Buffer.from(pix.asPNG()), pages: n };
}

module.exports = { compress, inspect, renderPage };
