// FileCompressor: the user interface. Runs in the Windows app (window.Desktop) and, in a browser, with a pretend engine for testing.
import { icon } from "./icons.js";

const VERSION = "1.7.0";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KB = 1024, MB = 1024 * 1024;
/** Sizes as people read them: small files in KB (with a decimal under 100 KB), the rest in MB/GB. */
function human(n) {
  if (n == null || isNaN(n)) return "";
  if (n < KB) return Math.round(n) + " B";
  if (n < 100 * KB) return (n / KB).toFixed(1) + " KB";
  if (n < MB) return Math.round(n / KB) + " KB";
  if (n < 1024 * MB) return (n / MB).toFixed(n < 10 * MB ? 2 : 1) + " MB";
  return (n / 1024 / MB).toFixed(2) + " GB";
}
const exact = (n) => `${human(n)} (${Math.round(n).toLocaleString("en-US")} bytes)`;
const clock = (sec) => { sec = Math.max(0, +sec || 0); const m = Math.floor(sec / 60), s = sec - m * 60; return `${m}:${s.toFixed(s % 1 ? 1 : 0).padStart(s % 1 ? 4 : 2, "0")}`; };
function parseClock(t) {
  t = String(t || "").trim().replace(",", ".");
  if (!t) return 0;
  const p = t.split(":").map(Number);
  if (p.some(isNaN)) return NaN;
  return p.reduce((a, v) => a * 60 + v, 0);
}
function storeGet(k, d) { try { const v = localStorage.getItem("gfc." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
function storeSet(k, v) { try { localStorage.setItem("gfc." + k, JSON.stringify(v)); } catch (_) { /* */ } }
const PHONE = matchMedia("(pointer: coarse)").matches && !window.Desktop;

// ================================================================== host: the computer (or a pretend one in a browser)
const H = window.Desktop || mockHost();
function mockHost() {
  let onItem = () => {}, onFin = () => {}, stop = false;
  const fake = [["Holiday in Sardinia.mp4", 812e6, "video"], ["Thesis final.pdf", 38e6, "pdf"], ["IMG_2041.jpg", 6.2e6, "image"],
    ["Lesson 4 - meteorology.m4a", 54e6, "audio"], ["Ship stability.pptx", 96e6, "office"], ["notes.pdf", 612e3, "pdf"], ["contract signed.pdf", 240e3, "pdf"]];
  const info = { video: { duration: 754, w: 1920, h: 1080, fps: 30, video: true, audio: true }, image: { w: 4032, h: 3024, exif: true, gps: true },
    audio: { duration: 2950, audio: true, mono: false }, office: { pictures: 14, big: 9 } };
  return {
    mock: true,
    pickFiles: async () => fake.map(([name, size, kind]) => ({ path: "C:\\Users\\Test\\Videos\\" + name, name, size, kind })),
    pickFolder: async () => ({ files: fake.slice(0, 3).map(([name, size, kind]) => ({ path: "D:\\Trip\\" + name, name, size, kind })), skipped: [] }),
    expand: async () => ({ files: [], skipped: [] }), pathOf: () => "",
    defaultOutDir: () => "C:\\Users\\Test\\Desktop\\FileCompressor", chooseOutDir: async () => null,
    inspect: async (list) => Object.fromEntries(list.map(f => [f.id, f.kind === "pdf"
      ? (f.name.includes("signed") ? { pages: 3, photos: 0, fonts: 2, metadata: true, signed: true } : f.name === "notes.pdf" ? { pages: 12, photos: 0, fonts: 3, metadata: true, thumbs: 0, attachments: 0 } : { pages: 48, photos: 31, fonts: 4, metadata: true, thumbs: 48, attachments: 1, form: false })
      : info[f.kind]])),
    start: async (list, s) => {
      stop = false;
      for (const it of list) {
        if (stop) { onItem({ id: it.id, status: "skipped", reason: "Stopped, original untouched" }); continue; }
        onItem({ id: it.id, status: "working", stage: "Compressing", progress: 0 });
        for (let p = 0; p <= 1.001 && !stop; p += 0.2) { onItem({ id: it.id, progress: p }); await new Promise(r => setTimeout(r, 60)); }
        if (it.name.includes("signed")) { onItem({ id: it.id, status: "skipped", reason: "Digitally signed: left untouched so the signature stays valid" }); continue; }
        const ss = { ...s, ...(it.over || {}) };
        const ns = ss.mode === "SIZE" ? Math.min(it.size * .9, ss.targetBytes * .97) : it.size * (ss.percent / 100) * .97;
        if (ss.preview) onItem({ id: it.id, status: "review", progress: 1, newSize: ns, oldSize: it.size, held: "C:\\tmp\\" + it.name, note: it.kind === "pdf" ? "No quality lost: metadata removed, fonts trimmed" : "" });
        else onItem({ id: it.id, status: "done", progress: 1, newSize: ns, oldSize: it.size, out: "C:\\out\\Compressed\\" + it.name, origTo: ss.moveOriginals ? "C:\\out\\Original\\" + it.name : "", note: "" });
      }
      onFin({ stopped: stop, outRoot: s.outputDir, preview: s.preview });
    },
    abort: () => { stop = true; },
    onItem: (cb) => { onItem = cb; }, onFinished: (cb) => { onFin = cb; },
    preview: async (it) => ({ type: it.kind === "pdf" ? "pdf" : it.kind === "image" ? "image" : it.kind, pages: 12, page: 0, before: "logo.png", after: "logo.png", info: ["4032×3024", "2016×1512"] }),
    reviewSave: async (it) => ({ ok: true, out: "C:\\out\\Compressed\\" + it.name, origTo: "" }), reviewDiscard: async () => true,
    history: async () => [{ id: "1", name: "IMG_2041.jpg", kind: "image", path: "C:\\x\\IMG_2041.jpg", out: "C:\\out\\IMG_2041_compressed.jpg", origTo: "C:\\out\\Original\\IMG_2041.jpg", oldSize: 6.2e6, newSize: 1.1e6, at: Date.now() - 3600e3 },
      { id: "2", name: "notes.pdf", kind: "pdf", path: "C:\\x\\notes.pdf", out: "C:\\out\\notes_compressed.pdf", origTo: "", oldSize: 612e3, newSize: 488e3, at: Date.now() - 86400e3 }],
    historyClear: async () => true, restore: async () => ({ ok: true, path: "C:\\x\\file" }),
    paste: async () => ({ files: [], skipped: [], empty: true }), startDrag: () => {}, notify: () => {}, focused: () => true, explorerMenu: async () => true,
    openPath: () => {}, showItem: () => {}, openFolder: () => {}, setTheme: () => {}, ready: () => {},
  };
}

// ================================================================== icons in the static page
document.querySelectorAll("[data-ic]").forEach(el => { el.outerHTML = icon(el.dataset.ic); });

// ================================================================== settings
// "comp" = how files are compressed (remembered only if "Remember the last settings" is on); "prefs" = how the program behaves (always remembered)
const COMP = { mode: "PERCENT", percent: 30, targetSize: 10, sizeUnit: "MB", resolution: "auto", fps: "auto", speed: "balanced", videoFormat: "keep",
  imageFormat: "keep", audioFormat: "keep", photoStripExif: false, photoResize: false, photoW: 1920, photoH: "", trim: false, audioMono: false,
  pdfMeta: true, pdfFonts: true, pdfExtras: true, pdfPhotos: true, pdfGray: false, pdfAsPictures: false, officePhotos: true, preset: "" };
const PREFS = { outputDir: "", moveOriginals: false, preview: false, skipSmaller: true, perFile: false, explorerMenu: false, paste: true, dragOut: true,
  notify: true, sound: true, history: true, remember: true, tab: "general" };
function loadSettings() {
  let comp = storeGet("comp", null), prefs = storeGet("prefs", null);
  if (!comp && !prefs) {
    // from 1.4.0: one "settings" object, and "MB" mode
    const old = storeGet("settings", {});
    prefs = { outputDir: old.outputDir || "", moveOriginals: !!old.moveOriginals };
    comp = { ...old };
    if (old.mode === "MB") { comp.mode = "SIZE"; comp.targetSize = old.targetMb || 10; comp.sizeUnit = "MB"; }
    delete comp.outputDir; delete comp.moveOriginals; delete comp.targetMb;
  }
  prefs = { ...PREFS, ...(prefs || {}) };
  comp = prefs.remember ? { ...COMP, ...(comp || {}) } : { ...COMP };
  return { ...comp, ...prefs };
}
const S = loadSettings();
if (!S.outputDir) S.outputDir = H.defaultOutDir();
function save() {
  storeSet("comp", Object.fromEntries(Object.keys(COMP).map(k => [k, S[k]])));
  storeSet("prefs", Object.fromEntries(Object.keys(PREFS).map(k => [k, S[k]])));
}
const targetBytes = (s) => (+s.targetSize || 0) * (s.sizeUnit === "KB" ? KB : MB);

const PRESETS = [
  { id: "WHATSAPP", label: "WhatsApp", desc: "About 15 MB per file, MP4 videos and JPG photos: fits WhatsApp's 16 MB limit.", set: { mode: "SIZE", targetSize: 15, sizeUnit: "MB", resolution: "auto", fps: "auto", videoFormat: "mp4", imageFormat: "jpg" } },
  { id: "TELEGRAM", label: "Telegram", desc: "MP4 at up to 1080p, about 40% of the original size.", set: { mode: "PERCENT", percent: 40, resolution: "1080", fps: "auto", videoFormat: "mp4", imageFormat: "keep" } },
  { id: "INSTAGRAM", label: "Instagram", desc: "1080p MP4 at 30 fps and JPG photos, about half the size.", set: { mode: "PERCENT", percent: 50, resolution: "1080", fps: "30", videoFormat: "mp4", imageFormat: "jpg" } },
  { id: "DISCORD", label: "Discord", desc: "About 19 MB per file, MP4 videos and JPG photos: fits Discord's 20 MB free upload limit.", set: { mode: "SIZE", targetSize: 19, sizeUnit: "MB", resolution: "auto", fps: "auto", videoFormat: "mp4", imageFormat: "jpg" } },
  { id: "EMAIL", label: "Email", desc: "About 18 MB per file, so it fits a 25 MB email attachment.", set: { mode: "SIZE", targetSize: 18, sizeUnit: "MB", resolution: "auto", fps: "auto", videoFormat: "mp4", imageFormat: "jpg" } },
];
// your own presets: everything in "comp" except the preset marker
let custom = storeGet("customPresets", []);
const presetKeys = Object.keys(COMP).filter(k => k !== "preset");
function allPresets() { return [...PRESETS, ...custom]; }
function presetDesc(p) {
  if (p.desc) return p.desc;
  const s = p.set;
  const size = s.mode === "PERCENT" ? `${s.percent}% of the size` : s.mode === "SIZE" ? `about ${s.targetSize} ${s.sizeUnit} per file` : "format change only";
  return `Your preset: ${size}.`;
}
function drawPresets() {
  $("presets").innerHTML = allPresets().map(p => `<button class="chip${p.custom ? " mine" : ""}" data-id="${esc(p.id)}">${esc(p.label)}</button>`).join("");
}
$("presets").onclick = (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  const p = allPresets().find(x => x.id === b.dataset.id);
  if (S.preset === p.id) S.preset = "";
  else { Object.assign(S, p.set); S.preset = p.id; }
  save(); drawSettings(); drawList();
};
$("presets").oncontextmenu = async (e) => {
  const b = e.target.closest(".chip.mine");
  if (!b) return;
  e.preventDefault();
  const p = custom.find(x => x.id === b.dataset.id);
  const v = await sheet(`<h3>${esc(p.label)}</h3><p class="sub">${esc(presetDesc(p))}</p>
    <button class="item" data-v="update">${icon("save")}<span>Replace it with the current settings</span></button>
    <button class="item danger" data-v="delete">${icon("trash")}<span>Delete this preset</span></button>`, card => card.querySelectorAll(".item").forEach(x => { x.onclick = () => closeSheet(x.dataset.v); }));
  if (v === "delete") { custom = custom.filter(x => x !== p); if (S.preset === p.id) S.preset = ""; }
  else if (v === "update") { p.set = Object.fromEntries(presetKeys.map(k => [k, S[k]])); S.preset = p.id; }
  else return;
  storeSet("customPresets", custom); save(); drawPresets(); drawSettings();
};
$("savePreset").onclick = async () => {
  const name = await sheet(`<h3>Save as a preset</h3><p class="sub">Size, formats and the options of every tab are saved under this name. Right-click one of your presets to change or delete it.</p>
    <label class="field"><span>Name</span><input type="text" id="presetName" maxlength="24" placeholder="For example: Email 300 KB"></label>
    <div class="btns"><button class="btn small ghost" data-x>Cancel</button><button class="btn small primary" data-ok>Save</button></div>`, card => {
    const inp = card.querySelector("#presetName");
    setTimeout(() => inp.focus(), 50);
    const ok = () => { const v = inp.value.trim(); if (v) closeSheet(v); };
    card.querySelector("[data-ok]").onclick = ok;
    card.querySelector("[data-x]").onclick = () => closeSheet();
    inp.onkeydown = (e) => { if (e.key === "Enter") ok(); };
  });
  if (!name) return;
  const p = { id: "C" + Date.now(), label: name, custom: true, set: Object.fromEntries(presetKeys.map(k => [k, S[k]])) };
  custom.push(p); S.preset = p.id;
  storeSet("customPresets", custom); save(); drawPresets(); drawSettings();
  toast(`Preset "${name}" saved.`);
};

/** A segmented control with a sliding marker. */
function seg(el, value, onPick) {
  el.querySelectorAll("button").forEach(b => {
    const on = b.dataset.val === String(value);
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", on);
    b.onclick = () => onPick(b.dataset.val);
  });
  placeMarker(el);
}
function placeMarker(el, snap = false) {
  const on = el.querySelector("button.on");
  if (!on || !on.offsetWidth) return;
  if (snap) el.classList.add("snap");
  el.style.setProperty("--ix", on.offsetLeft + "px");
  el.style.setProperty("--iw", on.offsetWidth + "px");
  if (snap) { void el.offsetWidth; el.classList.remove("snap"); }
}
const allSegs = () => document.querySelectorAll(".seg");
window.addEventListener("resize", () => allSegs().forEach(s => placeMarker(s, true)));
if (document.fonts) document.fonts.ready.then(() => allSegs().forEach(s => placeMarker(s, true)));

function manual(k, v) { S[k] = v; S.preset = ""; save(); drawSettings(); drawList(); }
function drawSettings() {
  document.querySelectorAll("#presets .chip").forEach(c => c.classList.toggle("on", c.dataset.id === S.preset));
  const p = allPresets().find(x => x.id === S.preset);
  $("presetHelp").textContent = p ? presetDesc(p) : "";
  seg($("modeSeg"), S.mode, v => manual("mode", v));
  document.querySelectorAll(".mode-pane").forEach(m => m.classList.toggle("on", m.dataset.mode === S.mode));
  $("percent").value = S.percent;
  $("percent").style.setProperty("--fill", ((S.percent - 5) / 85 * 100) + "%");
  $("percentOut").textContent = S.percent + "%";
  const gb = S.percent * 10.24;
  $("percentHelp").textContent = `Each file ends up at about ${S.percent}% of its size: a 1 GB video becomes about ${gb >= 1000 ? (gb / 1024).toFixed(1) + " GB" : Math.round(gb) + " MB"}, a 600 KB PDF about ${Math.round(6 * S.percent)} KB.`;
  if (document.activeElement !== $("targetSize")) $("targetSize").value = S.targetSize;
  $("targetSize").step = S.sizeUnit === "KB" ? "10" : "0.5";
  seg($("unitSeg"), S.sizeUnit, v => {
    // keep the same amount when switching unit (10 MB -> 10240 KB), rounded so it reads well
    const bytes = targetBytes(S);
    S.sizeUnit = v;
    S.targetSize = v === "KB" ? Math.max(1, Math.round(bytes / KB)) : Math.max(0.01, Math.round(bytes / MB * 100) / 100);
    S.preset = ""; save(); drawSettings(); drawList();
  });
  $("sizeHelp").textContent = `Every file is brought to about ${S.targetSize} ${S.sizeUnit}. ` + (S.skipSmaller ? "Files already smaller are skipped." : "Files already smaller are still optimized without aiming lower.");
  for (const k of ["resolution", "fps", "videoFormat", "imageFormat", "audioFormat"]) $(k).value = S[k];
  seg($("speedSeg"), S.speed, v => manual("speed", v));
  document.querySelectorAll("[data-opt]").forEach(el => { el.checked = !!S[el.dataset.opt]; });
  document.querySelectorAll("[data-pref]").forEach(el => { el.checked = !!S[el.dataset.pref]; });
  if (document.activeElement !== $("photoW")) $("photoW").value = S.photoW || "";
  if (document.activeElement !== $("photoH")) $("photoH").value = S.photoH || "";
  $("pxRow").classList.toggle("off", !S.photoResize);
  $("outPath").textContent = "\u200e" + S.outputDir;
  $("outPath").title = S.outputDir;
  $("saveHelp").textContent = "Results go in Compressed as name_compressed" + (S.moveOriginals ? ", originals in Original. Originals are moved only after their compressed copy is saved." : ", originals stay where they are.");
  seg($("themeSeg"), storeGet("theme", "auto"), v => setTheme(v));
  $("pasteHint").classList.toggle("hidden", !S.paste || PHONE);
  drawTabs();
}
function drawTabs() {
  document.querySelectorAll("#tabs button").forEach(b => { const on = b.dataset.tab === S.tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("on", p.dataset.pane === S.tab));
  requestAnimationFrame(() => document.querySelectorAll(".tab-pane.on .seg").forEach(s => placeMarker(s, true)));
}
$("tabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; S.tab = b.dataset.tab; save(); drawTabs(); };
$("percent").oninput = () => { S.percent = +$("percent").value; S.preset = ""; save(); drawSettings(); drawList(); };
$("targetSize").oninput = () => { const v = parseFloat($("targetSize").value); if (v > 0) { S.targetSize = v; S.preset = ""; save(); drawSettings(); drawList(); } };
for (const k of ["resolution", "fps", "videoFormat", "imageFormat", "audioFormat"]) $(k).onchange = () => manual(k, $(k).value);
for (const k of ["photoW", "photoH"]) $(k).oninput = () => { const v = parseInt($(k).value, 10); S[k] = v > 0 ? v : ""; S.preset = ""; save(); };
document.querySelectorAll("[data-opt]").forEach(el => { el.onchange = () => { S[el.dataset.opt] = el.checked; S.preset = ""; save(); drawSettings(); drawList(); }; });
document.querySelectorAll("[data-pref]").forEach(el => {
  el.onchange = async () => {
    const k = el.dataset.pref;
    S[k] = el.checked; save(); drawSettings(); drawList();
    if (k === "explorerMenu") {
      const ok = await H.explorerMenu(S[k]);
      toast(S[k] ? (ok ? "Added to the right-click menu." : "Couldn't add it to the right-click menu.") : "Removed from the right-click menu.");
    }
    if (k === "remember" && !S[k]) toast("From the next start, settings go back to the defaults.");
  };
});
$("changeFolder").onclick = async () => { const d = await H.chooseOutDir(S.outputDir); if (d) { S.outputDir = d; save(); drawSettings(); } };
$("defaultFolder").onclick = () => { S.outputDir = H.defaultOutDir(); save(); drawSettings(); toast("Back to the default folder."); };
$("openFolder").onclick = () => H.openFolder(S.outputDir);
$("version").textContent = "FileCompressor " + VERSION;

// ================================================================== theme
const themeMq = matchMedia("(prefers-color-scheme: dark)");
const wantsDark = (t) => t === "dark" || (t === "auto" && themeMq.matches);
function applyTheme() {
  const t = storeGet("theme", "auto"), dark = wantsDark(t);
  document.documentElement.classList.toggle("dark", dark);
  $("themeBtn").innerHTML = icon(dark ? "sun" : "moon");
  seg($("themeSeg"), t, v => setTheme(v));
  H.setTheme(t, dark);
}
function setTheme(t, ev) {
  const before = document.documentElement.classList.contains("dark");
  storeSet("theme", t);
  if (before === wantsDark(t) || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { applyTheme(); return; }
  const el = ev && ev.currentTarget ? ev.currentTarget : (t === "auto" ? null : $("themeSeg").querySelector(`[data-val="${t}"]`));
  const r = el ? el.getBoundingClientRect() : null;
  const x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : innerHeight / 2;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(applyTheme).ready.then(() => {
    document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 520, easing: "cubic-bezier(.22, 1, .36, 1)", pseudoElement: "::view-transition-new(root)" });
  }).catch(() => {});
}
$("themeBtn").onclick = (e) => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark", e);
themeMq.addEventListener?.("change", applyTheme);

// ================================================================== what each file can do (auto-detected)
/** The tick boxes that make sense for this file: [key, label, enabled, why-not]. */
function optionsFor(it) {
  const i = it.info || {};
  const o = [];
  if (it.kind === "pdf") {
    if (i.signed) return [["", "Digitally signed: it will be left untouched so the signature stays valid", false, ""]];
    if (i.locked) return [["", "Locked with a password: it can't be read", false, ""]];
    o.push(["pdfPhotos", i.photos ? `Compress photos (${i.photos} inside)` : "Compress photos", !!i.photos, "No photos inside"]);
    o.push(["pdfGray", "Black and white", !!i.photos, "No pictures to turn grey"]);
    o.push(["pdfAsPictures", "Rebuild pages as pictures", true, ""]);
    o.push(["pdfMeta", "Remove metadata", !!i.metadata, "No metadata inside"]);
    o.push(["pdfFonts", "Trim fonts", !!i.fonts && !i.form, i.form ? "Fillable form: fonts are kept whole" : "No embedded fonts"]);
    o.push(["pdfExtras", `Remove thumbnails and attachments${i.thumbs || i.attachments ? ` (${[i.thumbs ? i.thumbs + " thumbnails" : "", i.attachments ? i.attachments + " attachments" : ""].filter(Boolean).join(", ")})` : ""}`, !!(i.thumbs || i.attachments), "None inside"]);
  } else if (it.kind === "image") {
    o.push(["photoStripExif", i.gps ? "Remove GPS location and EXIF (has GPS)" : "Remove EXIF data", !!i.exif, "No EXIF data inside"]);
    o.push(["photoResize", `Resize to ${S.photoW || "any"} × ${S.photoH || "any"} px${i.w ? ` (now ${i.w}×${i.h})` : ""}`, true, ""]);
  } else if (it.kind === "audio") {
    o.push(["audioMono", "Convert to mono", !i.mono, "Already mono"]);
  } else if (it.kind === "office") {
    if (i.signed) return [["", "Digitally signed: it will be left untouched so the signature stays valid", false, ""]];
    o.push(["officePhotos", i.big ? `Compress pictures inside (${i.big} big ones)` : "Compress pictures inside", !!i.big, "No big pictures inside"]);
  }
  return o;
}
/** The settings this file will really use. */
function eff(it) {
  const s = { ...S, ...(it.over || {}), ...(it.opts || {}) };
  s.targetBytes = targetBytes(s);
  return s;
}
function infoLine(it) {
  const i = it.info;
  if (!i) return "";
  if (i.unreadable) return "can't be read";
  const bits = [];
  if (it.kind === "pdf") {
    if (i.signed) bits.push("signed");
    if (i.locked) bits.push("password");
    if (i.pages) bits.push(`${i.pages} page${i.pages === 1 ? "" : "s"}`);
    if (!i.signed && !i.locked) bits.push(i.photos ? `${i.photos} photo${i.photos === 1 ? "" : "s"}` : "text only");
    if (i.form) bits.push("form");
  } else if (it.kind === "image") {
    if (i.w) bits.push(`${i.w}×${i.h}`);
    if (i.frames) bits.push(`animated, ${i.frames} frames`);
    if (i.pages) bits.push(`${i.pages} pages`);
    if (i.gps) bits.push("GPS");
    else if (i.exif) bits.push("EXIF");
  } else if (it.kind === "video") {
    if (i.duration) bits.push(clock(Math.round(i.duration)));
    if (i.h) bits.push(`${Math.min(i.w, i.h)}p`);
  } else if (it.kind === "audio") {
    if (i.duration) bits.push(clock(Math.round(i.duration)));
    bits.push(i.mono ? "mono" : "stereo");
  } else if (it.kind === "office" && i.pictures != null) { if (i.signed) bits.push("signed"); bits.push(i.pictures ? `${i.pictures} pictures` : "no pictures"); }
  if (it.trim && (it.trim.trimStart || it.trim.trimEnd)) bits.push(`cut ${clock(it.trim.trimStart || 0)}–${it.trim.trimEnd ? clock(it.trim.trimEnd) : "end"}`);
  if (it.over && Object.keys(it.over).length) bits.push("own settings");
  return bits.join(" · ");
}

// ================================================================== the list
let items = [];
let seq = 0;
let running = false, lastRun = null;
const KIND_IC = { video: "video", audio: "music", image: "image", pdf: "pdf", office: "office" };
const KIND_NAME = { video: "Video", audio: "Audio", image: "Photo", pdf: "PDF", office: "Office" };

function addFiles(files, skipped = []) {
  const have = new Set(items.map(i => i.path));
  const added = [];
  for (const f of files) {
    if (have.has(f.path)) continue;
    have.add(f.path);
    const it = { ...f, id: ++seq, status: "waiting", progress: 0 };
    items.push(it); added.push(it);
  }
  if (skipped.length) toast(`${skipped.length} file(s) skipped: type not supported.`);
  else if (files.length && !added.length) toast("Already in the list.");
  drawList(true);
  detect(added);
}
/** Look inside the new files, then show what they contain and which options apply. */
async function detect(list) {
  if (!list.length || !H.inspect) return;
  for (let k = 0; k < list.length; k += 6) {
    const part = list.slice(k, k + 6);
    let r = {};
    try { r = await H.inspect(part.map(i => ({ id: i.id, path: i.path, kind: i.kind, name: i.name }))); } catch (_) { /* */ }
    for (const it of part) { it.info = r[it.id] || {}; if (it.status === "waiting") patchRow(it, true, false); }
  }
}
function goal(it) {
  const s = eff(it);
  if (s.mode === "PERCENT") return it.size * s.percent / 100;
  if (s.mode === "SIZE") return Math.min(it.size, s.targetBytes);
  return null;
}
function rowHtml(it) {
  const s = eff(it);
  const g = goal(it);
  const det = infoLine(it);
  let sub = KIND_NAME[it.kind] + (det ? " · " + esc(det) : "");
  let sizes = `<b title="${esc(exact(it.size))}">${human(it.size)}</b>`;
  if (it.status === "working") sub = esc(it.stage || "Working") + "…";
  else if (it.status === "done" || it.status === "review") {
    const pct = Math.round((1 - it.newSize / it.oldSize) * 100);
    sub = it.status === "review" ? `<span class="tag">Ready to check</span>${it.note ? esc(it.note) : "Click to compare before and after, then save"}`
      : (it.restored ? "Original restored" : it.note ? esc(it.note) : "Saved as " + esc(it.out.split(/[\\/]/).pop()));
    sizes = `${human(it.oldSize)} → <b title="${esc(exact(it.newSize))}">${human(it.newSize)}</b><span class="delta">${pct >= 0 ? "−" + pct : "+" + -pct}%</span>`;
  } else if (it.status === "failed") sub = icon("info", "status-ic") + esc(it.why ? it.why.title : "Failed");
  else if (it.status === "skipped") sub = esc(it.reason || "Skipped");
  else if (it.info && it.info.signed && (it.kind === "pdf" || it.kind === "office")) sub += ", will be left untouched";
  else if (g != null && s.mode === "SIZE" && it.size <= s.targetBytes && s.skipSmaller) sub += ", already below the size you picked";
  else if (g != null) sub += `, about ${human(g)} when done`;
  const fill = it.status === "done" || it.status === "review" ? Math.max(1.5, it.newSize / it.oldSize * 100) : 100;
  const goalPct = g != null && it.status === "waiting" ? Math.min(100, g / it.size * 100) : null;
  const drag = it.status === "done" && S.dragOut && !it.restored ? ` draggable="true" title="Drag it out of the window to WhatsApp, Discord, an email…"` : "";
  return `<li class="row ${it.status}" data-id="${it.id}"${drag}>${icon(KIND_IC[it.kind])}
    <span class="name"><b>${esc(it.name)}</b><small>${sub}</small></span>
    <span class="sizes">${sizes}</span>
    <span class="shrink"><span class="fill" style="width:${fill}%"></span><span class="work" style="width:${it.status === "working" ? Math.round((it.progress || 0) * 100) : 0}%"></span>${goalPct != null ? `<span class="goal" style="left:${goalPct}%"></span>` : ""}</span></li>`;
}
function drawList(anim = false) {
  const list = $("list");
  const known = new Set([...list.children].map(li => +li.dataset.id));
  list.innerHTML = items.map(rowHtml).join("");
  if (!anim) [...list.children].forEach(li => { if (known.has(+li.dataset.id)) li.style.animation = "none"; });
  else [...list.children].forEach((li, k) => { if (known.has(+li.dataset.id)) li.style.animation = "none"; else li.style.animationDelay = Math.min(k, 12) * 28 + "ms"; });
  $("filesPane").classList.toggle("has", items.length > 0);
  $("filesTitle").textContent = items.length === 1 ? "1 file" : `${items.length} files`;
  $("clearBtn").classList.toggle("hidden", running);
  const rev = items.filter(i => i.status === "review").length;
  $("saveAllBtn").classList.toggle("hidden", running || !rev);
  $("saveAllBtn").textContent = `Save all ${rev} without checking`;
  drawAction();
}
/** Update one row in place (no re-render), so the bars animate smoothly. */
function patchRow(it, statusChanged, shrink = true) {
  const li = $("list").querySelector(`[data-id="${it.id}"]`);
  if (!li) return;
  if (statusChanged) {
    const fresh = document.createElement("template");
    const done = it.status === "done" || it.status === "review";
    fresh.innerHTML = rowHtml({ ...it, newSize: done && shrink ? it.oldSize : it.newSize }).trim();
    const n = fresh.content.firstChild;
    n.style.animation = "none";
    li.replaceWith(n);
    if (done && shrink) {
      // the shrink: from the full original down to what is left
      n.querySelector(".fill").style.width = "100%";
      n.querySelector(".sizes").innerHTML = rowHtml(it).match(/<span class="sizes">([\s\S]*?)<\/span>\s*<span class="shrink">/)[1];
      requestAnimationFrame(() => requestAnimationFrame(() => { n.querySelector(".fill").style.width = Math.max(1.5, it.newSize / it.oldSize * 100) + "%"; }));
    }
    return;
  }
  const w = li.querySelector(".work");
  if (w) w.style.width = Math.round((it.progress || 0) * 100) + "%";
  const sm = li.querySelector(".name small");
  if (sm && it.status === "working") sm.textContent = (it.stage || "Working") + "… " + Math.round((it.progress || 0) * 100) + "%";
}
$("list").onclick = (e) => {
  const li = e.target.closest(".row");
  if (!li) return;
  const it = items.find(i => i.id === +li.dataset.id);
  if (it && it.status === "review") reviewSheet(it); else itemSheet(it);
};
$("list").addEventListener("dragstart", (e) => {
  const li = e.target.closest(".row");
  const it = li && items.find(i => i.id === +li.dataset.id);
  if (!it || it.status !== "done" || !S.dragOut || !it.out) return;
  e.preventDefault();
  H.startDrag(it.out);
});
$("clearBtn").onclick = () => {
  if (running) return;
  items.filter(i => i.status === "review").forEach(i => H.reviewDiscard(i.held));
  [...$("list").children].forEach((li, k) => { li.style.animationDelay = Math.min(k, 8) * 20 + "ms"; li.classList.add("leaving"); });
  setTimeout(() => { items = []; drawList(); }, 260);
};
$("saveAllBtn").onclick = () => saveAllReviews();

// ================================================================== action bar
function drawAction() {
  const waiting = items.filter(i => i.status === "waiting");
  const reviews = items.filter(i => i.status === "review");
  const bar = $("actionBar"), go = $("goBtn");
  bar.classList.toggle("running", running);
  go.classList.toggle("danger", running);
  go.classList.toggle("primary", !running);
  if (running) {
    const k = items.filter(i => i.run && i.status !== "waiting" && i.status !== "working").length;
    const n = items.filter(i => i.run).length;
    const cur = items.find(i => i.status === "working");
    $("summary").innerHTML = `<b>${S.mode === "CONVERT" ? "Converting" : "Compressing"} ${Math.min(k + 1, n)} of ${n}</b>${cur ? esc(cur.name) : ""}`;
    $("goText").textContent = "Abort";
    go.disabled = false;
    const frac = (k + (cur ? cur.progress || 0 : 0)) / Math.max(1, n);
    $("overallBar").style.width = Math.round(frac * 100) + "%";
    if (H.progress) H.progress(frac);
    return;
  }
  go.disabled = !waiting.length && !lastRun && !reviews.length;
  if (!items.length) { $("summary").innerHTML = "<b>Add some files to get started.</b>" + (PHONE ? "" : "Drop them anywhere in the window" + (S.paste ? ", or press Ctrl+V." : ".")); $("goText").textContent = "Compress"; go.disabled = true; return; }
  if (!waiting.length && reviews.length) {
    $("summary").innerHTML = `<b>${reviews.length} ready to check</b>Click a file to compare before and after`;
    $("goText").textContent = "Check " + (reviews.length === 1 ? "it" : "the first");
    return;
  }
  if (!waiting.length && lastRun) {
    $("summary").innerHTML = `<b>${lastRun.done ? `${lastRun.done} done, ${human(lastRun.saved)} saved` : "Nothing was saved"}</b>Results are in the Compressed folder`;
    $("goText").textContent = "Open folder";
    return;
  }
  const total = waiting.reduce((a, i) => a + i.size, 0);
  const est = waiting.reduce((a, i) => a + (goal(i) ?? i.size), 0);
  const verb = S.mode === "CONVERT" ? "Convert" : "Compress";
  $("summary").innerHTML = `<b>${waiting.length} ${waiting.length === 1 ? "file" : "files"}, ${human(total)}</b>${S.mode === "CONVERT" ? "Format change only" : "About " + human(est) + " when done"}${S.preview ? ", checked before saving" : ""}`;
  $("goText").textContent = `${verb} ${waiting.length === 1 ? "1 file" : waiting.length + " files"}`;
}
$("goBtn").onclick = () => {
  if (running) { H.abort(); $("goText").textContent = "Stopping…"; $("goBtn").disabled = true; return; }
  const waiting = items.filter(i => i.status === "waiting");
  const reviews = items.filter(i => i.status === "review");
  if (!waiting.length && reviews.length) { reviewSheet(reviews[0]); return; }
  if (!waiting.length && lastRun) { H.openFolder(lastRun.compressed || S.outputDir); return; }
  run(waiting);
};
function run(list) {
  if (!list.length || running) return;
  running = true; lastRun = null;
  items.forEach(i => { i.run = list.includes(i); });
  drawList();
  const base = { ...S, targetBytes: targetBytes(S) };
  H.start(list.map(i => {
    const over = { ...(i.over || {}), ...(i.opts || {}) };
    if (i.over && (i.over.targetSize != null || i.over.sizeUnit)) over.targetBytes = targetBytes({ ...S, ...i.over });
    const trim = S.trim && i.trim ? i.trim : null;
    return { id: i.id, path: i.path, name: i.name, size: i.size, kind: i.kind, over, trim };
  }), base);
}
let saved = 0, doneN = 0;
H.onItem((d) => {
  const it = items.find(i => i.id === d.id);
  if (!it) return;
  const changed = d.status && d.status !== it.status;
  Object.assign(it, d);
  if (changed && (d.status === "done" || d.status === "review")) { saved += Math.max(0, d.oldSize - d.newSize); doneN++; }
  patchRow(it, changed);
  drawAction();
});
H.onFinished((d) => {
  running = false;
  lastRun = { done: doneN, saved, compressed: d.outRoot ? d.outRoot.replace(/[\\/]+$/, "") + (d.outRoot.includes("\\") ? "\\" : "/") + "Compressed" : "" };
  const reviews = items.filter(i => i.status === "review").length;
  saved = 0; doneN = 0;
  items.forEach(i => { if (i.status === "working") i.status = "waiting"; });
  if (d.crashed) items.forEach(i => { if (i.run && i.status === "waiting") { i.status = "failed"; i.why = { title: "Not enough memory", causes: ["The file is very large (for example a huge photo or PDF) and the engine stopped."], tips: ["Close other programs and try again, or process this file on its own."] }; } });
  drawList();
  const msg = d.crashed ? "The engine stopped unexpectedly." : d.stopped ? "Stopped." : reviews ? `${reviews} ready to check: click each one to compare, then save.` : lastRun.done ? `Done: ${lastRun.done} file${lastRun.done === 1 ? "" : "s"}, ${human(lastRun.saved)} saved.` : "Finished.";
  toast(msg, 3600);
  if (!d.stopped && !d.crashed) {
    if (S.sound) chime();
    if (S.notify && H.notify && !(H.focused && H.focused())) H.notify("FileCompressor", msg, reviews ? "" : lastRun.compressed);
  }
});

/** A short, soft two-note sound when the list is done. */
function chime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime;
    [[659.25, 0], [987.77, 0.13]].forEach(([f, d]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.18, t + d + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.55);
      o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + 0.6);
    });
    setTimeout(() => ac.close(), 1200);
  } catch (_) { /* */ }
}

// ================================================================== sheets
let sheetResolve = null, sheetTimer = 0;
function sheet(html, onReady, wide = false) {
  return new Promise(res => {
    if (sheetResolve) sheetResolve(null);
    sheetResolve = res;
    const box = $("sheet"), card = $("sheetCard");
    const swap = !box.classList.contains("hidden");
    clearTimeout(sheetTimer);
    card.className = "sheet-card" + (wide ? " wide" : "");
    card.innerHTML = html;
    box.classList.remove("hidden", "closing", "swap");
    if (swap) { void card.offsetWidth; box.classList.add("swap"); }
    if (onReady) onReady(card);
  });
}
function closeSheet(v = null) {
  const box = $("sheet"), r = sheetResolve;
  sheetResolve = null;
  if (!box.classList.contains("hidden")) {
    box.classList.add("closing");
    sheetTimer = setTimeout(() => { box.classList.add("hidden"); box.classList.remove("closing"); box.querySelectorAll("audio,video").forEach(a => { try { a.pause(); } catch (_) { /* */ } }); }, 190);
  }
  if (r) r(v);
}
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetResolve) closeSheet(); });

/** One file: what is inside, its own tick boxes, trim, own size, and the actions. */
async function itemSheet(it) {
  if (!it) return;
  const waiting = it.status === "waiting" && !running;
  const acts = [];
  if (it.status === "done" && !it.restored) {
    acts.push({ v: "open", ic: "open", t: "Open result" }, { v: "show", ic: "folder", t: "Show in folder" });
    if (["image", "pdf", "video", "audio"].includes(it.kind)) acts.push({ v: "compare", ic: "compare", t: "Compare before and after" });
    if (it.origTo) acts.push({ v: "restore", ic: "restore", t: "Restore the original" });
  }
  if (it.status === "failed") acts.push({ v: "why", ic: "help", t: "Why did it fail?" });
  if (!running && it.status !== "waiting" && it.status !== "working") acts.push({ v: "retry", ic: "retry", t: "Do it again with the current settings" });
  if (!running || it.status === "waiting" && !it.run) acts.push({ v: "remove", ic: "trash", t: "Remove from the list", cls: "danger" });
  const sub = it.status === "done" ? `${human(it.oldSize)} → ${human(it.newSize)}${it.note ? ". " + it.note : ""}`
    : it.status === "failed" ? (it.why ? it.why.title : "Failed") : it.status === "skipped" ? it.reason : `${KIND_NAME[it.kind]}, ${exact(it.size)}`;
  const det = infoLine(it);

  let opts = "";
  if (waiting) {
    const list = optionsFor(it);
    const s = eff(it);
    if (list.length) {
      opts += `<h4>Options for this file${it.info ? "" : " (still looking inside…)"}</h4><div class="ticks">` + list.map(([k, label, on, why]) => k
        ? `<label class="tick${on ? "" : " off"}"><input type="checkbox" data-k="${k}" ${on && s[k] ? "checked" : ""} ${on ? "" : "disabled"}><span class="box"></span><span>${esc(label)}${on ? "" : `<small>${esc(why)}</small>`}</span></label>`
        : `<p class="note">${esc(label)}</p>`).join("") + "</div>";
    }
    if ((it.kind === "video" || it.kind === "audio") && S.trim) {
      const t = it.trim || {};
      const dur = it.info && it.info.duration;
      opts += `<h4>Keep only a part</h4><div class="trim-row">
        <label class="field"><span>Start (m:ss)</span><input type="text" data-trim="trimStart" value="${t.trimStart ? clock(t.trimStart) : ""}" placeholder="0:00"></label>
        <label class="field"><span>End (m:ss)</span><input type="text" data-trim="trimEnd" value="${t.trimEnd ? clock(t.trimEnd) : ""}" placeholder="${dur ? clock(Math.round(dur)) : "end"}"></label></div>
        <p class="help" data-trimhelp>${dur ? `The whole file is ${clock(Math.round(dur))} long. Leave a box empty to keep the start or the end.` : "Leave a box empty to keep the start or the end."}</p>`;
    }
    if (S.perFile) {
      const o = it.over || {};
      const mode = o.mode || "";
      const fmtSel = { video: ["videoFormat", ["keep", "mp4", "mkv", "mov", "webm", "mp3", "m4a"]], image: ["imageFormat", ["keep", "jpg", "png", "webp"]], audio: ["audioFormat", ["keep", "mp3", "m4a", "ogg", "opus"]] }[it.kind];
      opts += `<h4>Size for this file</h4>
        <div class="own-row"><select data-own="mode"><option value="">Same as the others</option><option value="PERCENT" ${mode === "PERCENT" ? "selected" : ""}>Percentage</option><option value="SIZE" ${mode === "SIZE" ? "selected" : ""}>Exact size</option>${it.kind === "pdf" || it.kind === "office" ? "" : `<option value="CONVERT" ${mode === "CONVERT" ? "selected" : ""}>Convert only</option>`}</select>
        <input type="number" data-own="percent" min="5" max="95" step="5" value="${o.percent ?? S.percent}" class="${mode === "PERCENT" ? "" : "hidden"}" title="Percent">
        <input type="number" data-own="targetSize" min="1" step="any" value="${o.targetSize ?? S.targetSize}" class="${mode === "SIZE" ? "" : "hidden"}">
        <select data-own="sizeUnit" class="${mode === "SIZE" ? "" : "hidden"}"><option ${(o.sizeUnit || S.sizeUnit) === "KB" ? "selected" : ""}>KB</option><option ${(o.sizeUnit || S.sizeUnit) === "MB" ? "selected" : ""}>MB</option></select></div>
        ${fmtSel ? `<label class="field inline"><span>Save as</span><select data-own="${fmtSel[0]}"><option value="">Same as the others</option>${fmtSel[1].map(f => `<option value="${f}" ${o[fmtSel[0]] === f ? "selected" : ""}>${f === "keep" ? "Keep original" : f.toUpperCase()}</option>`).join("")}</select></label>` : ""}`;
    }
  }
  const v = await sheet(`<h3>${esc(it.name)}</h3><p class="sub">${esc(sub)}${det ? `<br>${esc(det)}` : ""}</p>${opts}
    <div class="acts">${acts.map(a => `<button class="item ${a.cls || ""}" data-v="${a.v}">${icon(a.ic)}<span>${esc(a.t)}</span></button>`).join("")}</div>
    ${waiting && opts ? `<div class="btns"><button class="btn small primary" data-v="ok">Done</button></div>` : ""}`,
  card => {
    card.querySelectorAll("[data-v]").forEach(b => { b.onclick = () => closeSheet(b.dataset.v); });
    card.querySelectorAll("[data-k]").forEach(c => { c.onchange = () => { it.opts = { ...(it.opts || {}), [c.dataset.k]: c.checked }; }; });
    card.querySelectorAll("[data-trim]").forEach(inp => {
      inp.onchange = () => {
        const v = parseClock(inp.value);
        const help = card.querySelector("[data-trimhelp]");
        if (isNaN(v)) { inp.classList.add("bad"); if (help) help.textContent = "Write the time as minutes:seconds, for example 1:30."; return; }
        inp.classList.remove("bad");
        it.trim = { ...(it.trim || {}), [inp.dataset.trim]: v };
        const a = it.trim.trimStart || 0, b = it.trim.trimEnd || (it.info && it.info.duration) || 0;
        if (help && b) help.textContent = b > a ? `Keeping ${clock(Math.round((b - a) * 10) / 10)}: from ${clock(a)} to ${it.trim.trimEnd ? clock(b) : "the end"}.` : "The end must come after the start.";
      };
    });
    card.querySelectorAll("[data-own]").forEach(el => {
      el.onchange = () => {
        const k = el.dataset.own;
        const o = { ...(it.over || {}) };
        let val = el.value;
        if (k === "percent" || k === "targetSize") val = parseFloat(val);
        if (val === "" || (typeof val === "number" && !(val > 0))) delete o[k]; else o[k] = val;
        if (k === "mode") {
          if (!val) { delete o.percent; delete o.targetSize; delete o.sizeUnit; }
          else if (val === "PERCENT") o.percent = o.percent ?? S.percent;
          else if (val === "SIZE") { o.targetSize = o.targetSize ?? S.targetSize; o.sizeUnit = o.sizeUnit || S.sizeUnit; }
          card.querySelector('[data-own="percent"]').classList.toggle("hidden", val !== "PERCENT");
          card.querySelector('[data-own="targetSize"]').classList.toggle("hidden", val !== "SIZE");
          card.querySelector('[data-own="sizeUnit"]').classList.toggle("hidden", val !== "SIZE");
        }
        it.over = o;
      };
    });
  });
  if (waiting) patchRow(it, true, false);
  if (v === "open") H.openPath(it.out);
  else if (v === "show") H.showItem(it.out);
  else if (v === "compare") reviewSheet(it, true);
  else if (v === "restore") restoreFlow({ id: null, name: it.name, path: it.path, out: it.out, origTo: it.origTo }, it);
  else if (v === "why") whySheet(it);
  else if (v === "retry") { Object.assign(it, { status: "waiting", progress: 0, newSize: null, why: null, reason: null, note: null, restored: false }); drawList(); run([it]); }
  else if (v === "remove") { if (it.status === "review") H.reviewDiscard(it.held); items = items.filter(i => i !== it); drawList(); }
}
function whySheet(it) {
  const w = it.why || { title: "Something unexpected went wrong", causes: [], tips: [] };
  return sheet(`<h3>${esc(w.title)}</h3><p class="sub">${esc(it.name)}</p>
    <h4>Possible causes</h4><ul>${w.causes.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
    <h4>What to try</h4><ul>${w.tips.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
    <div class="btns"><button class="btn small ghost" data-retry>${icon("retry")}<span>Try again</span></button><button class="btn small primary" data-ok>OK</button></div>`,
  card => {
    card.querySelector("[data-ok]").onclick = () => closeSheet();
    card.querySelector("[data-retry]").onclick = () => { closeSheet(); Object.assign(it, { status: "waiting", progress: 0, why: null }); drawList(); run([it]); };
  });
}

// ================================================================== before / after
async function reviewSheet(it, readOnly = false) {
  let page = 0;
  const load = async (card) => {
    const box = card.querySelector(".compare");
    box.classList.add("loading");
    let r;
    try { r = await H.preview({ id: it.id, path: it.path, name: it.name, kind: it.kind, held: it.held, out: it.out, trim: it.trim }, page); } catch (e) { r = { type: "none", error: String(e) }; }
    box.classList.remove("loading");
    const nav = card.querySelector(".pagenav");
    if (r.type === "image" || r.type === "pdf" || r.type === "video") {
      const lab = (k) => `${k ? "After" : "Before"} · ${human(k ? it.newSize : it.oldSize)}${r.info ? " · " + r.info[k] : ""}`;
      box.innerHTML = [r.before, r.after].map((src, k) => `<figure><figcaption>${lab(k)}</figcaption><div class="pic"><img src="${esc(src)}" alt="${k ? "After" : "Before"}" draggable="false"></div>
        ${r.type === "video" ? `<button class="btn small ghost play" data-play="${k}">${icon("play")}<span>Play</span></button>` : ""}</figure>`).join("");
      box.querySelectorAll(".pic").forEach(p => { p.onclick = () => box.classList.toggle("zoom"); });
      box.querySelectorAll("[data-play]").forEach(b => { b.onclick = () => H.openPath(b.dataset.play === "1" ? (it.held || it.out) : it.path); });
      if (nav) {
        nav.classList.toggle("hidden", r.type !== "pdf" || !(r.pages > 1));
        nav.querySelector("span").textContent = `Page ${page + 1} of ${r.pages || 1}`;
        nav.querySelector("[data-prev]").disabled = page <= 0;
        nav.querySelector("[data-next]").disabled = page >= (r.pages || 1) - 1;
        nav.dataset.pages = r.pages || 1;
      }
    } else if (r.type === "audio") {
      box.innerHTML = [r.before, r.after].map((src, k) => `<figure class="aud"><figcaption>${k ? "After" : "Before"} · ${human(k ? it.newSize : it.oldSize)}</figcaption><audio controls preload="metadata" src="${esc(src)}"></audio></figure>`).join("");
    } else {
      box.innerHTML = `<p class="note">${it.kind === "office" ? "Office files can't be shown here. Open the result to check it." : "This file can't be shown here" + (r.error ? ": " + esc(r.error) : ".")}</p>`;
    }
  };
  const pct = Math.round((1 - it.newSize / it.oldSize) * 100);
  const v = await sheet(`<div class="rev-head"><div><h3>${esc(it.name)}</h3><p class="sub">${human(it.oldSize)} → <b>${human(it.newSize)}</b> (${pct >= 0 ? "−" + pct : "+" + -pct}%)${it.note ? ". " + esc(it.note) : ""}</p></div>
      <div class="pagenav hidden"><button class="icon-btn" data-prev aria-label="Previous page">${icon("left")}</button><span></span><button class="icon-btn" data-next aria-label="Next page">${icon("right")}</button></div></div>
    <div class="compare"></div>
    <p class="help">Click a picture to see it bigger.</p>
    <div class="btns">${readOnly ? `<button class="btn small primary" data-v="close">Close</button>` : `
      <button class="btn small ghost" data-v="change">${icon("sliders")}<span>Change settings</span></button>
      <button class="btn small ghost" data-v="discard">${icon("trash")}<span>Discard</span></button>
      ${it.held ? `<button class="btn small ghost" data-v="openit">${icon("open")}<span>Open</span></button>` : ""}
      <button class="btn small primary" data-v="save">${icon("save")}<span>Save</span></button>`}</div>`,
  card => {
    card.querySelectorAll("[data-v]").forEach(b => { b.onclick = () => { if (b.dataset.v === "openit") { H.openPath(it.held); return; } closeSheet(b.dataset.v); }; });
    const nav = card.querySelector(".pagenav");
    nav.querySelector("[data-prev]").onclick = () => { if (page > 0) { page--; load(card); } };
    nav.querySelector("[data-next]").onclick = () => { if (page < (+nav.dataset.pages || 1) - 1) { page++; load(card); } };
    load(card);
  }, true);
  if (readOnly || it.status !== "review") return;
  if (v === "save") { await saveReview(it); const next = items.find(i => i.status === "review"); if (next) reviewSheet(next); }
  else if (v === "discard") { await H.reviewDiscard(it.held); Object.assign(it, { status: "skipped", reason: "Discarded, original untouched", held: "" }); drawList(); const next = items.find(i => i.status === "review"); if (next) reviewSheet(next); }
  else if (v === "change") { await H.reviewDiscard(it.held); Object.assign(it, { status: "waiting", progress: 0, held: "", newSize: null, note: null }); drawList(); itemSheet(it); }
}
async function saveReview(it) {
  const r = await H.reviewSave({ id: it.id, path: it.path, name: it.name, kind: it.kind, held: it.held, oldSize: it.oldSize, newSize: it.newSize }, eff(it));
  if (!r || !r.ok) { toast("Couldn't save it: " + (r && r.error || "unknown error"), 4000); return false; }
  Object.assign(it, { status: "done", out: r.out, origTo: r.origTo, held: "", note: [it.note, r.note].filter(Boolean).join(". ") });
  drawList();
  return true;
}
async function saveAllReviews() {
  const list = items.filter(i => i.status === "review");
  let ok = 0;
  for (const it of list) if (await saveReview(it)) ok++;
  toast(`${ok} saved in the Compressed folder.`);
}

// ================================================================== history and restore
async function historySheet() {
  const h = await H.history();
  const total = h.reduce((a, e) => a + Math.max(0, (e.oldSize || 0) - (e.newSize || 0)), 0);
  const day = (t) => { const d = new Date(t); return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); };
  const v = await sheet(`<h3>History</h3><p class="sub">${h.length ? `<b>${human(total)}</b> saved in total, ${h.length} file${h.length === 1 ? "" : "s"}` : "Nothing yet. Compressed files appear here."}${S.history ? "" : ". History is off in General."}</p>
    <ul class="hist">${h.slice(0, 400).map((e, k) => `<li>${icon(KIND_IC[e.kind] || "files")}<span class="name"><b>${esc(e.name)}</b><small>${day(e.at)} · ${human(e.oldSize)} → ${human(e.newSize)}${e.restored ? " · original restored" : ""}</small></span>
      <span class="hbtns">${e.out ? `<button class="icon-btn" data-show="${k}" title="Show in folder">${icon("folder")}</button>` : ""}${e.origTo && !e.restored ? `<button class="icon-btn" data-restore="${k}" title="Restore the original">${icon("restore")}</button>` : ""}</span></li>`).join("")}</ul>
    <div class="btns">${h.length ? `<button class="btn small ghost" data-v="clear">Clear history</button>` : ""}<button class="btn small primary" data-v="close">Close</button></div>`,
  card => {
    card.querySelectorAll("[data-v]").forEach(b => { b.onclick = () => closeSheet(b.dataset.v); });
    card.querySelectorAll("[data-show]").forEach(b => { b.onclick = () => H.showItem(h[+b.dataset.show].out); });
    card.querySelectorAll("[data-restore]").forEach(b => { b.onclick = () => { closeSheet(); restoreFlow(h[+b.dataset.restore]); }; });
  });
  if (v === "clear") { await H.historyClear(); toast("History cleared."); }
}
$("historyBtn").onclick = $("openHistory").onclick = () => historySheet();

async function restoreFlow(entry, it = null) {
  const v = await sheet(`<h3>Restore the original?</h3><p class="sub">${esc(entry.name)} goes back from the Original folder to where it was.</p>
    <button class="item" data-v="del">${icon("restore")}<span>Restore and delete the compressed copy</span></button>
    <button class="item" data-v="keep">${icon("files")}<span>Restore and keep the compressed copy</span></button>
    <div class="btns"><button class="btn small ghost" data-v="">Cancel</button></div>`,
  card => card.querySelectorAll("[data-v]").forEach(b => { b.onclick = () => closeSheet(b.dataset.v); }));
  if (!v) return;
  const r = await H.restore(entry, v === "del");
  if (!r || !r.ok) { toast("Couldn't restore it: " + (r && r.error || "unknown error"), 4000); return; }
  if (it) { it.restored = true; it.origTo = ""; it.path = r.path; if (v === "del") it.out = ""; drawList(); }
  toast("Original restored" + (v === "del" ? ", compressed copy deleted." : "."));
}

// ================================================================== toast
let toastTimer = 0;
function toast(t, ms = 2600) {
  const el = $("toast");
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

// ================================================================== adding files
const pickFiles = async () => { if (running) return; addFiles(await H.pickFiles()); };
const pickFolder = async () => { if (running) return; const r = await H.pickFolder(); if (r) addFiles(r.files, r.skipped); };
$("addFiles").onclick = $("addFilesTop").onclick = pickFiles;
$("addFolder").onclick = $("addFolderTop").onclick = pickFolder;
$("empty").addEventListener("click", (e) => { if (!e.target.closest("button")) pickFiles(); });

let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
window.addEventListener("dragenter", (e) => { if (!hasFiles(e) || running) return; e.preventDefault(); dragDepth++; $("dropveil").classList.add("on"); });
window.addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = running ? "none" : "copy"; } });
window.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("dropveil").classList.remove("on"); });
window.addEventListener("drop", async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0; $("dropveil").classList.remove("on");
  if (running) return;
  const paths = [...e.dataTransfer.files].map(f => H.pathOf(f)).filter(Boolean);
  if (!paths.length) return;
  const r = await H.expand(paths);
  addFiles(r.files, r.skipped);
});
if (H.onNote) H.onNote((t) => toast(t, 4000));
if (H.onOpen) H.onOpen(async (paths) => { if (running) return; const r = await H.expand(paths); addFiles(r.files, r.skipped); });

// keyboard: Ctrl+O add files, Ctrl+V paste files or a screenshot
const typing = () => { const a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "SELECT" || a.tagName === "TEXTAREA"); };
document.addEventListener("keydown", async (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); pickFiles(); }
  if (mod && e.key.toLowerCase() === "v" && S.paste && !typing() && !sheetResolve && H.paste) {
    e.preventDefault();
    if (running) { toast("Wait for the list to finish."); return; }
    const r = await H.paste();
    if (r.empty || !r.files.length) toast(r.skipped && r.skipped.length ? "Those files aren't supported." : "Nothing to paste: copy files in Explorer, or take a screenshot first.");
    else addFiles(r.files, r.skipped);
  }
});

// ================================================================== start
if (PHONE) {
  $("emptyTitle").textContent = "Tap to add files";
  $("emptySub").textContent = "Or use Share → FileCompressor from the Gallery, WhatsApp or Files. Nothing leaves this phone.";
}
drawPresets();
applyTheme();
drawSettings();
drawList();
save();
if (S.explorerMenu && H.explorerMenu) H.explorerMenu(true);   // keeps the right-click entry pointing to this folder
H.ready();
window.__gfc = { S, items: () => items, addFiles, run, setTheme };
