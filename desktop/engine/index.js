// Runs the list one file at a time and reports progress. Used by the Windows app (main process).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Fail, Skip } = require("./errors");
const media = require("./media");
const image = require("./image");
const pdf = require("./pdf");
const office = require("./office");

const MB = 1024 * 1024;

function kindOf(file) {
  const e = path.extname(file).slice(1).toLowerCase();
  if (media.VIDEO_EXT.includes(e)) return "video";
  if (media.AUDIO_EXT.includes(e)) return "audio";
  if (image.IMAGE_EXT.includes(e)) return "image";
  if (e === "pdf") return "pdf";
  if (office.OFFICE_EXT.includes(e)) return "office";
  return null;
}

/** Files from paths the user picked or dropped (folders are opened, up to 3 levels). */
function expand(paths, depth = 0) {
  const out = [], skipped = [];
  for (const p of paths) {
    let st;
    try { st = fs.statSync(p); } catch (_) { continue; }
    if (st.isDirectory()) {
      if (depth > 2) continue;
      const base = path.basename(p);
      if (depth > 0 && (base === "Compressed" || base === "Original" || base.startsWith("."))) continue;
      let names = [];
      try { names = fs.readdirSync(p); } catch (_) { continue; }
      const r = expand(names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(n => path.join(p, n)), depth + 1);
      out.push(...r.files); skipped.push(...r.skipped);
    } else if (st.isFile()) {
      const kind = kindOf(p);
      if (kind) out.push({ path: p, name: path.basename(p), size: st.size, kind });
      else if (depth === 0) skipped.push(path.basename(p));
    }
  }
  return { files: out, skipped };
}

function uniquePath(dir, base, ext) {
  let p = path.join(dir, `${base}.${ext}`);
  for (let k = 2; fs.existsSync(p); k++) p = path.join(dir, `${base} (${k}).${ext}`);
  return p;
}
function moveFile(from, to) {
  try { fs.renameSync(from, to); }
  catch (e) {
    if (e.code !== "EXDEV") throw e;
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

// ------------------------------------------------------------------ what went wrong, in plain words
function diagnose(msg, kind) {
  const m = String(msg || "").toLowerCase();
  const D = (title, causes, tips) => ({ title, causes, tips });
  if (m.includes("ffmpeg is missing")) return D("The video engine is missing", ["The ffmpeg.exe file next to the program was removed or blocked by the antivirus."], ["Extract the whole zip again and keep every file in the folder.", "If the antivirus quarantined ffmpeg.exe, restore it and allow it."]);
  if (m.includes("password")) return D("The file is locked with a password", ["The file is protected, so its content can't be read or rewritten."], ["Open it with the password and save or print a copy without protection, then try again."]);
  if (m.includes("trim leaves")) return D("The trim is too short", ["Start and end are less than half a second apart."], ["Open the file's options and set a longer part to keep."]);
  if (m.includes("target too small")) return D("The size you picked is too small", ["At that size there are too few bits per second left for a watchable video or audio."], ["Pick a higher percentage or a bigger size in MB.", kind === "video" ? "Or lower the resolution yourself in the Video block." : "Or convert it to Opus, which sounds better at small sizes."]);
  if (m.includes("no audio") || m.includes("no streams")) return D("There's no sound in this file", ["The file has no audio track to compress or extract."], ["If it's a video, choose a video format instead of MP3/M4A."]);
  if (m.includes("couldn't read the length")) return D("The file couldn't be read", ["The file may be damaged or only partly downloaded."], ["Check that the file plays correctly in a player.", "Try 'Convert only' to MP4 first, then compress the converted file."]);
  if (m.includes("enospc") || m.includes("no space")) return D("The disk is full", ["There isn't enough free space to write the compressed copy."], ["Free up some space or choose another output folder."]);
  if (m.includes("eacces") || m.includes("eperm") || m.includes("ebusy")) return D("Windows didn't allow writing the file", ["The output folder may be read-only or protected, or the file is open in another program."], ["Close programs that use the file.", "Choose another output folder with 'Change folder'."]);
  if (m.includes("enoent")) return D("The file isn't there anymore", ["It was moved, renamed or deleted after it was added to the list."], ["Remove it from the list and add it again."]);
  if (m.includes("couldn't open this picture")) return D("The picture couldn't be opened", ["The file may be damaged, or not really an image despite its extension.", "Some rare variants (unusual TIFF or HEIC flavours) aren't supported."], ["Open it in Photos or Paint, save it again as JPG or PNG, then retry."]);
  if (m.includes("valid office")) return D("The Office file couldn't be opened", ["It may be protected with a password.", "It may be an old .doc/.ppt/.xls file renamed to .docx/.pptx/.xlsx."], ["Open it in Word, PowerPoint or Excel and save a fresh .docx/.pptx/.xlsx copy."]);
  if (m.includes("open this pdf")) return D("The PDF couldn't be opened", ["The file may be damaged or incomplete (for example an interrupted download or copy)."], ["Check that the file opens correctly in a PDF reader.", "Print it to a new PDF, then try again."]);
  if (m.includes("memory") || m.includes("allocation")) return D("Not enough memory", ["The file is very large (for example a huge photo or PDF)."], ["Close other programs and try again, or process this file on its own."]);
  if (m.includes("ffmpeg could not process")) return D("The video/audio engine couldn't read or write this file", ["It may use an unusual codec, or be copy-protected (DRM, like purchased movies).", "The file may have broken timestamps or an unusual structure."], ["Check that the file plays correctly in a player.", "Use 'Convert only' to MP4 first, then compress the converted file."]);
  return D("Something unexpected went wrong", ["The file may be damaged or in a variant the program doesn't handle."], ["Try the file again on its own."]);
}
function skipReason(msg) {
  const m = String(msg || "");
  if (m === "signed") return "Digitally signed: left untouched so the signature stays valid";
  if (m === "stopped") return "Stopped, original untouched";
  if (m === "same format") return "Already in that format";
  if (m === "below target") return "Already below the size you picked";
  if (m === "already well compressed") return "Already well compressed, couldn't make it smaller";
  if (m === "cannot convert") return "PDF and Office files can only be compressed";
  return m;
}

// ------------------------------------------------------------------ what is inside a file (for the tick boxes)
async function inspect(file, kind) {
  try {
    if (kind === "pdf") return await pdf.inspect(file);
    if (kind === "image") return await image.inspect(file);
    if (kind === "video" || kind === "audio") return await media.inspect(file);
    if (kind === "office") return await office.inspect(file);
  } catch (_) { /* */ }
  return {};
}

// ------------------------------------------------------------------ saving a result in Compressed (and the original in Original)
function finalize(it, resultPath, s) {
  const outRoot = s.outputDir;
  const compDir = path.join(outRoot, "Compressed"), origDir = path.join(outRoot, "Original");
  const ext = path.extname(it.path).slice(1).toLowerCase();
  const base = path.basename(it.path, path.extname(it.path));
  fs.mkdirSync(compDir, { recursive: true });
  const outExt = path.extname(resultPath).slice(1);
  const dest = uniquePath(compDir, base + "_compressed", outExt);
  moveFile(resultPath, dest);
  let note = "", origTo = "";
  if (s.moveOriginals) {
    try {
      fs.mkdirSync(origDir, { recursive: true });
      origTo = uniquePath(origDir, base, ext);
      moveFile(it.path, origTo);
    } catch (_) { origTo = ""; note = "Couldn't move the original into the Original folder."; }
  }
  return { dest, origTo, note };
}

/** Put the original back where it was (and remove the compressed copy if asked). */
function restore(entry, removeCopy) {
  if (entry.origTo && fs.existsSync(entry.origTo)) {
    let back = entry.path;
    if (fs.existsSync(back)) back = uniquePath(path.dirname(back), path.basename(back, path.extname(back)) + " (restored)", path.extname(back).slice(1));
    fs.mkdirSync(path.dirname(back), { recursive: true });
    moveFile(entry.origTo, back);
    entry.path = back;
  } else if (!fs.existsSync(entry.path)) throw new Error("The original isn't in the Original folder anymore.");
  if (removeCopy && entry.out && fs.existsSync(entry.out)) fs.unlinkSync(entry.out);
  return entry.path;
}

// ------------------------------------------------------------------ the runner
const PREVIEW_ROOT = path.join(os.tmpdir(), "FileCompressor-preview");

class Runner {
  constructor({ ffmpeg, send }) {
    media.setBinary(ffmpeg);
    this.send = send;
    this.ctrl = null;
    this.running = false;
  }
  abort() { if (this.ctrl) this.ctrl.abort(); }

  async start(items, base) {
    if (this.running) return;
    this.running = true;
    this.ctrl = new AbortController();
    const signal = this.ctrl.signal;
    const outRoot = base.outputDir;
    let done = 0, saved = 0;
    try {
      for (const it of items) {
        if (signal.aborted) { this.send("item", { id: it.id, status: "skipped", reason: skipReason("stopped") }); continue; }
        const s = { ...base, ...(it.over || {}), ...(it.trim || {}) };
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "FileCompressor-"));
        const send = (patch) => this.send("item", { id: it.id, ...patch });
        let lastP = -1;
        const ctx = {
          tmp, signal,
          stage: (t) => send({ status: "working", stage: t }),
          progress: (p) => { const r = Math.round(p * 100); if (r !== lastP) { lastP = r; send({ progress: p }); } },
        };
        send({ status: "working", stage: "Starting", progress: 0 });
        try {
          const st = fs.statSync(it.path);
          const ext = path.extname(it.path).slice(1).toLowerCase();
          const tmpOut = path.join(tmp, "out." + (ext || "bin"));
          const wanted = s.mode === "PERCENT" ? st.size * s.percent / 100 : s.mode === "SIZE" ? s.targetBytes : 0;
          // something else than size was asked (trim, exact pixels, no EXIF, mono, grey...): never skip as "already small"
          const extra = !!(it.trim && (it.trim.trimStart || it.trim.trimEnd)) || (it.kind === "image" && (s.photoResize || s.photoStripExif)) || (it.kind === "audio" && s.audioMono) || (it.kind === "pdf" && s.pdfGray);
          let target = wanted;
          let r;
          if (s.mode === "CONVERT") {
            if (it.kind === "pdf" || it.kind === "office") throw new Skip("cannot convert");
            r = it.kind === "video" ? await media.convertVideo(it.path, tmpOut, s, ctx)
              : it.kind === "audio" ? await media.convertAudio(it.path, tmpOut, s, ctx)
                : await image.convert(it.path, tmpOut, s, ctx);
          } else {
            if (s.mode === "SIZE" && st.size <= wanted) {
              if (s.skipSmaller !== false && !extra) throw new Skip("below target");
              target = st.size * (it.kind === "pdf" || it.kind === "office" ? 1 : 0.95);
            }
            const fn = { video: media.compressVideo, audio: media.compressAudio, image: image.compress, pdf: pdf.compress, office: office.compress }[it.kind];
            r = await fn(it.path, tmpOut, s, target, ctx);
            if (r.size >= st.size && !extra) throw new Skip("already well compressed");
          }
          done++; saved += Math.max(0, st.size - r.size);
          if (s.preview) {
            // keep the result aside until the user looks at it and says "Save"
            const keep = path.join(PREVIEW_ROOT, it.id + "-" + Date.now());
            fs.mkdirSync(keep, { recursive: true });
            const held = path.join(keep, path.basename(it.path, path.extname(it.path)) + "_compressed" + path.extname(r.out));
            moveFile(r.out, held);
            send({ status: "review", progress: 1, newSize: r.size, oldSize: st.size, held, note: r.note || "" });
          } else {
            const f = finalize(it, r.out, s);
            send({ status: "done", progress: 1, newSize: r.size, oldSize: st.size, out: f.dest, origTo: f.origTo, note: [r.note, f.note].filter(Boolean).join(". ") });
          }
        } catch (e) {
          if (e instanceof Skip) send({ status: "skipped", reason: skipReason(e.message) });
          else {
            const msg = String((e && e.message) || e);
            send({ status: "failed", error: msg, why: diagnose(msg, it.kind) });
          }
        } finally {
          fs.rm(tmp, { recursive: true, force: true }, () => {});
        }
      }
    } finally {
      this.running = false;
      this.send("finished", { done, saved, stopped: signal.aborted, outRoot, preview: !!base.preview });
      this.ctrl = null;
    }
  }
}

module.exports = { Runner, expand, kindOf, inspect, finalize, restore, moveFile, PREVIEW_ROOT };
