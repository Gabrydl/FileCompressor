(function () {
"use strict";
const icon = (() => {
// Line icons (same set as the Windows app). icon(name) -> <svg>
const S = "fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"";
const P = {
"video": "<rect x=\"3\" y=\"6\" width=\"13\" height=\"12\" rx=\"2\"/><path d=\"M16 10.5l5-3v9l-5-3\"/>",
"music": "<path d=\"M9 18V6l11-2v12\"/><circle cx=\"6.5\" cy=\"18\" r=\"2.5\"/><circle cx=\"17.5\" cy=\"16\" r=\"2.5\"/>",
"retry": "<path d=\"M20 12a8 8 0 1 1-2.3-5.6\"/><path d=\"M20 4v5h-5\"/>",
"help": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7\"/><path d=\"M12 17.2v.1\"/>",
"files": "<path d=\"M8 3h7l4 4v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z\"/><path d=\"M15 3v4h4\"/><path d=\"M4 7v13a1 1 0 0 0 1 1h10\"/>",
"sliders": "<path d=\"M4 7h10M18 7h2M4 17h4M12 17h8\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/><circle cx=\"10\" cy=\"17\" r=\"2\"/>",
"home": "<path d=\"M3 11l9-7 9 7\"/><path d=\"M5 10v10h5v-6h4v6h5V10\"/>",
"open": "<path d=\"M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1\"/><path d=\"M3 7v11a2 2 0 0 0 2 2h13l3-9H7l-3 9\"/>",
"save": "<path d=\"M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-2z\"/><path d=\"M8 3v5h7V3\"/><rect x=\"7\" y=\"13\" width=\"10\" height=\"6\" rx=\"1\"/>",
"saveas": "<path d=\"M5 3h11l4 4v5\"/><path d=\"M4 5v14a2 2 0 0 0 2 2h5\"/><path d=\"M8 3v5h7V3\"/><path d=\"M14 21l1-3 5-5 2 2-5 5z\"/>",
"print": "<path d=\"M7 9V3h10v6\"/><rect x=\"3\" y=\"9\" width=\"18\" height=\"8\" rx=\"2\"/><path d=\"M7 14h10v7H7z\"/>",
"undo": "<path d=\"M9 7L4 12l5 5\"/><path d=\"M4 12h11a5 5 0 0 1 0 10h-2\"/>",
"redo": "<path d=\"M15 7l5 5-5 5\"/><path d=\"M20 12H9a5 5 0 0 0 0 10h2\"/>",
"search": "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M16 16l5 5\"/>",
"zoom_in": "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M16 16l5 5M8 11h6M11 8v6\"/>",
"zoom_out": "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M16 16l5 5M8 11h6\"/>",
"fit_width": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 12h10M9 9.5L6.5 12 9 14.5M15 9.5l2.5 2.5-2.5 2.5\"/>",
"fit_page": "<rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"2\"/><path d=\"M12 7v10M9.5 9L12 6.5 14.5 9M9.5 15l2.5 2.5 2.5-2.5\"/>",
"actual": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M8 10v5M7 10.5l1-.5M16 10v5M15 10.5l1-.5\"/><circle cx=\"12\" cy=\"11\" r=\".6\"/><circle cx=\"12\" cy=\"14\" r=\".6\"/>",
"hand": "<path d=\"M8 13V6a1.5 1.5 0 0 1 3 0v6M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v6M17 12V9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.6L8 13\"/>",
"cursor": "<path d=\"M5 3l14 7-6 2-2 6z\"/><path d=\"M13 12l5 5\"/>",
"text_cursor": "<path d=\"M9 4h6M9 20h6M12 4v16\"/>",
"highlight": "<path d=\"M5 20h14\" stroke-width=\"2.6\" stroke-opacity=\".45\"/><path d=\"M14 4l4 4-7 7H7v-4z\"/><path d=\"M9 17l-2 2\"/>",
"underline": "<path d=\"M7 4v6a5 5 0 0 0 10 0V4\"/><path d=\"M5 20h14\"/>",
"strike": "<path d=\"M16 6.5C15 5 13.5 4.5 12 4.5c-2.5 0-4 1.3-4 3 0 1.4 1 2.3 3 2.9\"/><path d=\"M4 12h16\"/><path d=\"M15.5 14.5c.4.5.5 1 .5 1.6 0 1.9-1.8 3.4-4.2 3.4-1.8 0-3.3-.7-4.3-2\"/>",
"squiggly": "<path d=\"M7 4v6a5 5 0 0 0 10 0V4\"/><path d=\"M4 20l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2\"/>",
"note": "<path d=\"M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z\"/><path d=\"M14 20v-4a1 1 0 0 1 1-1h5M8 9h8M8 12.5h5\"/>",
"textbox": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M8 9h8M12 9v7\"/>",
"pen": "<path d=\"M4 20c3-1 4-3 6-6s5-8 8-9c1 2-1 5-3 7s-5 4-7 5\"/><path d=\"M4 20l2-4\"/>",
"rect": "<rect x=\"4\" y=\"6\" width=\"16\" height=\"12\" rx=\"1.5\"/>",
"ellipse": "<ellipse cx=\"12\" cy=\"12\" rx=\"8.5\" ry=\"6.5\"/>",
"line": "<path d=\"M5 19L19 5\"/>",
"arrow": "<path d=\"M5 19L19 5M11 5h8v8\"/>",
"stamp": "<path d=\"M9 11V6a3 3 0 0 1 6 0v5\"/><path d=\"M4 14h16v3H4z\"/><path d=\"M6 20h12\"/>",
"trash": "<path d=\"M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6\"/>",
"edit": "<path d=\"M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7\"/><path d=\"M17.5 3.5l3 3L12 15l-4 1 1-4z\"/>",
"add_text": "<path d=\"M4 6V4h11v2M9.5 4v14M7.5 18h4\"/><path d=\"M18 13v8M14 17h8\"/>",
"add_image": "<rect x=\"3\" y=\"4\" width=\"14\" height=\"13\" rx=\"2\"/><circle cx=\"8\" cy=\"9\" r=\"1.5\"/><path d=\"M3 15l4-4 4 4 2-2 4 4\"/><path d=\"M19 15v6M16 18h6\"/>",
"redact": "<rect x=\"3\" y=\"9\" width=\"18\" height=\"6\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M3 5h18M3 19h12\"/>",
"redact_apply": "<rect x=\"3\" y=\"7\" width=\"13\" height=\"5\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M3 16h8\"/><path d=\"M15 17l2.5 2.5L22 15\"/>",
"watermark": "<path d=\"M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z\"/><path d=\"M9.5 15a2.5 2.5 0 0 0 2.5 2.5\"/>",
"page_number": "<path d=\"M6 3h9l4 4v14H6z\"/><path d=\"M15 3v4h4\"/><path d=\"M10 13h5M10.5 16.5l1-6M13.5 16.5l1-6\"/>",
"sign": "<path d=\"M3 17c2-4 4-9 6-9s-1 8 1 8 3-5 5-5-1 5 1 5 3-2 4-3\"/><path d=\"M3 21h18\"/>",
"check": "<path d=\"M4 12.5l5 5L20 6.5\"/>",
"cross": "<path d=\"M6 6l12 12M18 6L6 18\"/>",
"dot": "<circle cx=\"12\" cy=\"12\" r=\"4.5\" fill=\"currentColor\" stroke=\"none\"/>",
"date": "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15\" rx=\"2\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/><path d=\"M8 14h3v3H8z\"/>",
"field": "<rect x=\"3\" y=\"7\" width=\"18\" height=\"10\" rx=\"2\"/><path d=\"M7 10v4\"/>",
"checkbox": "<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"3\"/><path d=\"M8 12l3 3 5-6\"/>",
"dropdown": "<rect x=\"3\" y=\"7\" width=\"18\" height=\"10\" rx=\"2\"/><path d=\"M14 11l2 2 2-2\"/>",
"flatten": "<path d=\"M12 4l9 5-9 5-9-5z\"/><path d=\"M3 14l9 5 9-5\"/>",
"pages": "<rect x=\"4\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"4\" y=\"13\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13\" y=\"13\" width=\"7\" height=\"7\" rx=\"1.5\"/>",
"insert": "<path d=\"M6 3h8l4 4v6\"/><path d=\"M6 3v18h7\"/><path d=\"M14 3v4h4M18 16v6M15 19h6\"/>",
"insert_blank": "<path d=\"M6 3h8l4 4v14H6z\"/><path d=\"M14 3v4h4M12 11v6M9 14h6\"/>",
"rotate_left": "<path d=\"M4 4v5h5\"/><path d=\"M4.5 9A8 8 0 1 1 6 16.5\"/>",
"rotate_right": "<path d=\"M20 4v5h-5\"/><path d=\"M19.5 9A8 8 0 1 0 18 16.5\"/>",
"extract": "<path d=\"M6 3h8l4 4v14H6z\"/><path d=\"M14 3v4h4\"/><path d=\"M12 10v7M9 14l3 3 3-3\"/>",
"split": "<path d=\"M5 3h9l3 3v6\"/><path d=\"M5 3v9\"/><path d=\"M3 12h18\" stroke-dasharray=\"2 2\"/><path d=\"M5 15v6h12v-6\"/>",
"merge": "<path d=\"M4 3h6v7H4zM14 3h6v7h-6z\"/><path d=\"M7 10v2a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-2\"/><path d=\"M12 15v6M9.5 18.5L12 21l2.5-2.5\"/>",
"crop": "<path d=\"M6 2v16h16\"/><path d=\"M2 6h16v16\"/>",
"duplicate": "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3\"/>",
"word": "<path d=\"M6 3h9l4 4v14H6z\"/><path d=\"M15 3v4h4\"/><path d=\"M8.5 11l1.5 6 2-5 2 5 1.5-6\"/>",
"excel": "<path d=\"M6 3h9l4 4v14H6z\"/><path d=\"M15 3v4h4\"/><path d=\"M9 11l6 6M15 11l-6 6\"/>",
"ppt": "<path d=\"M6 3h9l4 4v14H6z\"/><path d=\"M15 3v4h4\"/><path d=\"M10 18v-7h2.5a2 2 0 0 1 0 4H10\"/>",
"image": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"2\"/><path d=\"M3 18l5-5 4 4 3-3 6 6\"/>",
"text_file": "<path d=\"M6 3h9l4 4v14H6z\"/><path d=\"M15 3v4h4M9 11h6M9 14h6M9 17h4\"/>",
"pdf": "<path d=\"M6 3h9l4 4v14H6z\"/><path d=\"M15 3v4h4\"/><path d=\"M8.5 17v-5h1.5a1.5 1.5 0 0 1 0 3H8.5M13 12v5h1a2.5 2.5 0 0 0 0-5zM18 12h-1.5v5M16.5 14.5H18\"/>",
"office": "<path d=\"M4 6l8-3 8 3v12l-8 3-8-3z\"/><path d=\"M12 3v18M4 6l8 3 8-3\"/>",
"convert": "<path d=\"M4 8h13l-3-3M20 16H7l3 3\"/>",
"lock": "<rect x=\"5\" y=\"10\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3\"/><circle cx=\"12\" cy=\"15\" r=\"1.2\"/>",
"unlock": "<rect x=\"5\" y=\"10\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 7.5-2\"/><circle cx=\"12\" cy=\"15\" r=\"1.2\"/>",
"compress": "<path d=\"M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7\"/>",
"ocr": "<path d=\"M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3\"/><path d=\"M8 9h8M8 12h8M8 15h5\"/>",
"speaker": "<path d=\"M4 9h4l5-4v14l-5-4H4z\"/><path d=\"M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12\"/>",
"book": "<path d=\"M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2z\"/><path d=\"M12 6v14\"/>",
"moon": "<path d=\"M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z\"/>",
"sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>",
"fullscreen": "<path d=\"M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5\"/>",
"info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5M12 8v.01\"/>",
"bookmark": "<path d=\"M6 3h12v18l-6-4-6 4z\"/>",
"bookmark_add": "<path d=\"M6 3h12v18l-6-4-6 4z\"/><path d=\"M12 7v6M9 10h6\"/>",
"thumbs": "<rect x=\"4\" y=\"3\" width=\"7\" height=\"8\" rx=\"1\"/><rect x=\"4\" y=\"13\" width=\"7\" height=\"8\" rx=\"1\"/><path d=\"M14 5h6M14 8h4M14 15h6M14 18h4\"/>",
"comments": "<path d=\"M4 5h16v11H9l-5 4z\"/><path d=\"M8 9h8M8 12h5\"/>",
"plus": "<path d=\"M12 5v14M5 12h14\"/>",
"minus": "<path d=\"M5 12h14\"/>",
"close": "<path d=\"M6 6l12 12M18 6L6 18\"/>",
"left": "<path d=\"M15 5l-7 7 7 7\"/>",
"right": "<path d=\"M9 5l7 7-7 7\"/>",
"up": "<path d=\"M5 15l7-7 7 7\"/>",
"down": "<path d=\"M5 9l7 7 7-7\"/>",
"first": "<path d=\"M18 5l-7 7 7 7M6 5v14\"/>",
"last": "<path d=\"M6 5l7 7-7 7M18 5v14\"/>",
"more": "<circle cx=\"5\" cy=\"12\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"19\" cy=\"12\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/>",
"folder": "<path d=\"M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>",
"settings": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2.5v3M12 18.5v3M4.2 6l2.6 1.5M17.2 16.5l2.6 1.5M4.2 18l2.6-1.5M17.2 7.5L19.8 6\"/>",
"play": "<path d=\"M7 4l13 8-13 8z\"/>",
"pause": "<path d=\"M7 4v16M17 4v16\"/>",
"stop": "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"1.5\"/>",
"copy": "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3\"/>",
"link": "<path d=\"M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1\"/><path d=\"M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1\"/>",
"attach": "<path d=\"M20 12l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7\"/>",
"color": "<circle cx=\"12\" cy=\"12\" r=\"8\"/>",
"eraser": "<path d=\"M16 4l5 5-10 10H6l-3-3z\"/><path d=\"M11 19h10M9 9l6 6\"/>",
"sanitize": "<path d=\"M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z\"/><path d=\"M8.5 12l2.5 2.5 4.5-5\"/>",
"dark": "<path d=\"M12 3a9 9 0 1 0 0 18z\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"9\"/>",
"menu": "<path d=\"M4 6h16M4 12h16M4 18h16\"/>",
"drop": "<path d=\"M12 3v12M7 10l5 5 5-5\"/><path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2\"/>",
"layers": "<path d=\"M12 3l9 5-9 5-9-5z\"/><path d=\"M3 13l9 5 9-5\"/>",
"polygon": "<path d=\"M12 3l8 6-3 10H7L4 9z\"/>",
"cloud": "<path d=\"M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4.5 4.5 0 0 1 17.5 18z\"/>"
};
function icon(name, cls = '') { return `<svg class="ic ${cls}" viewBox="0 0 24 24" ${S}>${P[name] || P.info}</svg>`; }

return icon;
})();
// FileCompressor: the user interface. One page for the Windows app (window.Desktop, from the Electron preload),
// the Android app (window.Host, defined in host.js) and, in a plain browser, a pretend engine for previews.
// The methods a host must offer are listed in ANDROID_HOST.md.


const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MB = 1024 * 1024;
function human(n) {
  if (n == null) return "";
  if (n < 1024) return Math.round(n) + " B";
  if (n < 100 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < MB) return Math.round(n / 1024) + " KB";
  if (n < 1024 * MB) return (n / MB).toFixed(n < 10 * MB ? 2 : 1) + " MB";
  return (n / 1024 / MB).toFixed(2) + " GB";
}
function storeGet(k, d) { try { const v = localStorage.getItem("gfc." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
function storeSet(k, v) { try { localStorage.setItem("gfc." + k, JSON.stringify(v)); } catch (_) { /* */ } }

// ================================================================== host: the computer (or a pretend one in a browser)
const H = window.Desktop || window.Host || mockHost();
const PHONE = H.platform === "android" || (!window.Desktop && matchMedia("(pointer: coarse)").matches);
document.documentElement.classList.toggle("phone", PHONE);
function mockHost() {
  const phone = !!window.__forcePhone || matchMedia("(pointer: coarse)").matches || /[?&]phone/.test(location.search);
  let allFiles = !phone;
  let onItem = () => {}, onFin = () => {}, stop = false;
  const fake = [["Holiday in Sardinia.mp4", 812e6, "video"], ["Thesis final.pdf", 38e6, "pdf"], ["IMG_2041.jpg", 6.2e6, "image"],
    ["Lesson 4 - meteorology.m4a", 54e6, "audio"], ["Ship stability.pptx", 96e6, "office"], ["scan_contract.pdf", 12e6, "pdf"]];
  return {
    mock: true, platform: phone ? "android" : "desktop",
    permission: () => ({ allFiles }), askAllFiles: () => { allFiles = true; setTimeout(() => window.__gfc.resume(), 400); },
    share: () => {}, encoders: () => ["libx264", "libvpx-vp9", "aac", "libmp3lame", "libopus", "libvorbis"],
    outLabel: (d) => phone ? d.replace("/storage/emulated/0", "Phone storage") : d,
    pickFiles: async () => fake.map(([name, size, kind]) => ({ path: "C:\\Users\\Test\\Videos\\" + name, name, size, kind })),
    pickFolder: async () => ({ files: fake.slice(0, 3).map(([name, size, kind]) => ({ path: "D:\\Trip\\" + name, name, size, kind })), skipped: [] }),
    expand: async () => ({ files: [], skipped: [] }), pathOf: () => "",
    defaultOutDir: () => phone ? "/storage/emulated/0/Download/FileCompressor" : "C:\\Users\\Test\\Desktop\\FileCompressor", chooseOutDir: async () => null,
    start: async (items, s) => {
      stop = false;
      for (const it of items) {
        if (stop) { onItem({ id: it.id, status: "skipped", reason: "Stopped, original untouched" }); continue; }
        onItem({ id: it.id, status: "working", stage: "Compressing", progress: 0 });
        for (let p = 0; p <= 1.001 && !stop; p += 0.1) { onItem({ id: it.id, progress: p }); await new Promise(r => setTimeout(r, 90)); }
        if (it.name.startsWith("scan")) onItem({ id: it.id, status: "failed", error: "This PDF is password-protected.", why: { title: "The file is locked with a password", causes: ["The file is protected, so its content can't be read or rewritten."], tips: ["Open it with the password and save a copy without protection, then try again."] } });
        else { const ns = s.mode === "MB" ? Math.min(it.size * .9, s.targetMb * MB * .97) : it.size * (s.percent / 100) * .97; onItem({ id: it.id, status: "done", progress: 1, newSize: ns, oldSize: it.size, out: "C:\\out\\" + it.name, note: "" }); }
      }
      onFin({ stopped: stop, outRoot: s.outputDir });
    },
    abort: () => { stop = true; },
    onItem: (cb) => { onItem = cb; }, onFinished: (cb) => { onFin = cb; },
    openPath: () => {}, showItem: () => {}, openFolder: () => {}, setTheme: () => {}, ready: () => {},
  };
}

// ================================================================== icons in the static page
document.querySelectorAll("[data-ic]").forEach(el => { el.outerHTML = icon(el.dataset.ic); });

// ================================================================== settings
const DEFAULTS = { mode: "PERCENT", percent: 30, targetMb: 10, resolution: "auto", fps: "auto", speed: "balanced", videoFormat: "keep",
  imageFormat: "keep", audioFormat: "keep", pdfAsPictures: false, outputDir: "", moveOriginals: false, preset: "",
  targetSize: 10, sizeUnit: "MB", setTab: "general" };
const REMEMBER = storeGet("remember", true);
// "Remember the last settings" off: size and formats start from the defaults (folder and originals stay)
const S = { ...DEFAULTS, ...(H.initialSettings ? clean(H.initialSettings()) : {}), ...(REMEMBER ? storeGet("settings", {}) : (({ outputDir, moveOriginals }) => ({ outputDir, moveOriginals }))(storeGet("settings", {}))) };
if (S.targetSize == null || (S.sizeUnit === "MB" && Math.abs(S.targetSize - S.targetMb) > 1e-6 && !storeGet("settings", {}).targetSize)) { S.targetSize = S.targetMb; S.sizeUnit = "MB"; }
const sizeBytes = () => (+S.targetSize || 0) * (S.sizeUnit === "KB" ? 1024 : MB);
function clean(o) { const r = {}; for (const k in o || {}) if (o[k] != null && k in DEFAULTS) r[k] = o[k]; return r; }
if (!S.outputDir) S.outputDir = H.defaultOutDir();
const PRESETS = [
  { id: "WHATSAPP", label: "WhatsApp", desc: "About 15 MB per file, MP4 videos and JPG photos: fits WhatsApp's 16 MB limit.", set: { mode: "MB", targetMb: 15, resolution: "auto", fps: "auto", videoFormat: "mp4", imageFormat: "jpg" } },
  { id: "TELEGRAM", label: "Telegram", desc: "MP4 at up to 1080p, about 40% of the original size.", set: { mode: "PERCENT", percent: 40, resolution: "1080", fps: "auto", videoFormat: "mp4", imageFormat: "keep" } },
  { id: "INSTAGRAM", label: "Instagram", desc: "1080p MP4 at 30 fps and JPG photos, about half the size.", set: { mode: "PERCENT", percent: 50, resolution: "1080", fps: "30", videoFormat: "mp4", imageFormat: "jpg" } },
  { id: "DISCORD", label: "Discord", desc: "About 19 MB per file, MP4 videos and JPG photos: fits Discord's 20 MB free upload limit.", set: { mode: "MB", targetMb: 19, resolution: "auto", fps: "auto", videoFormat: "mp4", imageFormat: "jpg" } },
  { id: "EMAIL", label: "Email", desc: "About 18 MB per file, so it fits a 25 MB email attachment.", set: { mode: "MB", targetMb: 18, resolution: "auto", fps: "auto", videoFormat: "mp4", imageFormat: "jpg" } },
];
// the phone engine reads the size in MB: KB is turned into MB here
function save() { S.targetMb = Math.max(0.01, sizeBytes() / MB); storeSet("settings", S); if (H.saveSettings) H.saveSettings(S); }

// your own presets (long-press one to change or delete it)
let custom = storeGet("customPresets", []);
const PKEYS = ["mode", "percent", "targetSize", "sizeUnit", "resolution", "fps", "speed", "videoFormat", "imageFormat", "audioFormat", "pdfAsPictures"];
const allPresets = () => [...PRESETS, ...custom];
function presetDesc(p) {
  if (p.desc) return p.desc;
  const t = p.set;
  return "Your preset: " + (t.mode === "PERCENT" ? `${t.percent}% of the size` : t.mode === "MB" ? `about ${t.targetSize} ${t.sizeUnit} per file` : "format change only") + ".";
}
function drawPresets() {
  $("presets").innerHTML = allPresets().map(p => `<button class="chip${p.custom ? " mine" : ""}" data-id="${esc(p.id)}">${esc(p.label)}</button>`).join("")
    + `<button class="chip add" id="savePreset">+ Save current</button>`;
}
PRESETS.forEach(p => { if (p.set.mode === "MB") { p.set.targetSize = p.set.targetMb; p.set.sizeUnit = "MB"; } });
$("presets").onclick = async (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  if (b.id === "savePreset") { savePreset(); return; }
  const p = allPresets().find(x => x.id === b.dataset.id);
  if (S.preset === p.id) S.preset = "";
  else { Object.assign(S, p.set); S.preset = p.id; }
  save(); drawSettings(); drawList();
};
let pressT = 0;
$("presets").addEventListener("pointerdown", (e) => { const b = e.target.closest(".chip.mine"); if (!b) return; pressT = setTimeout(() => managePreset(b.dataset.id), 550); });
["pointerup", "pointerleave", "pointercancel"].forEach(ev => $("presets").addEventListener(ev, () => clearTimeout(pressT)));
$("presets").addEventListener("contextmenu", (e) => { const b = e.target.closest(".chip.mine"); if (b) { e.preventDefault(); managePreset(b.dataset.id); } });
async function managePreset(id) {
  const p = custom.find(x => x.id === id);
  if (!p) return;
  const v = await sheet(`<h3>${esc(p.label)}</h3><p class="sub">${esc(presetDesc(p))}</p>
    <button class="item" data-v="update">${icon("save")}<span>Replace it with the current settings</span></button>
    <button class="item danger" data-v="delete">${icon("trash")}<span>Delete this preset</span></button>`, card => card.querySelectorAll(".item").forEach(x => { x.onclick = () => closeSheet(x.dataset.v); }));
  if (v === "delete") { custom = custom.filter(x => x !== p); if (S.preset === p.id) S.preset = ""; }
  else if (v === "update") { p.set = Object.fromEntries(PKEYS.map(k => [k, S[k]])); S.preset = p.id; }
  else return;
  storeSet("customPresets", custom); save(); drawPresets(); drawSettings();
}
async function savePreset() {
  const name = await sheet(`<h3>Save as a preset</h3><p class="sub">Size and formats are saved under this name. Long-press one of your presets to change or delete it.</p>
    <label class="field"><span>Name</span><input type="text" id="presetName" maxlength="24" placeholder="For example: Email 300 KB"></label>
    <div class="btns"><button class="btn small ghost" data-x>Cancel</button><button class="btn small primary" data-ok>Save</button></div>`, card => {
    const inp = card.querySelector("#presetName");
    setTimeout(() => inp.focus(), 80);
    const ok = () => { const v = inp.value.trim(); if (v) closeSheet(v); };
    card.querySelector("[data-ok]").onclick = ok;
    card.querySelector("[data-x]").onclick = () => closeSheet();
  });
  if (!name) return;
  const p = { id: "C" + Date.now(), label: name, custom: true, set: Object.fromEntries(PKEYS.map(k => [k, S[k]])) };
  custom.push(p); S.preset = p.id;
  storeSet("customPresets", custom); save(); drawPresets(); drawSettings();
  toast(`Preset "${name}" saved.`);
}
drawPresets();

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
  $("percentHelp").textContent = `Each file ends up at about ${S.percent}% of its size: a 1 GB video becomes about ${gb >= 1000 ? (gb / 1024).toFixed(1) + " GB" : Math.round(gb) + " MB"}.`;
  if (document.activeElement !== $("targetMb")) $("targetMb").value = S.targetSize;
  $("targetMb").step = S.sizeUnit === "KB" ? "10" : "0.5";
  seg($("unitSeg"), S.sizeUnit, v => {
    const b = sizeBytes();
    S.sizeUnit = v;
    S.targetSize = v === "KB" ? Math.max(1, Math.round(b / 1024)) : Math.max(0.01, Math.round(b / MB * 100) / 100);
    S.preset = ""; save(); drawSettings(); drawList();
  });
  $("sizeHelp").textContent = `Every file is brought to about ${S.targetSize} ${S.sizeUnit}. Files already smaller are skipped.`;
  document.querySelectorAll("#setTabs button").forEach(b => b.classList.toggle("on", b.dataset.p === S.setTab));
  document.querySelectorAll("[data-pane]").forEach(x => x.classList.toggle("off", x.dataset.pane !== S.setTab));
  $("remember").checked = !!storeGet("remember", true);
  for (const k of ["resolution", "fps", "videoFormat", "imageFormat", "audioFormat"]) $(k).value = S[k];
  seg($("speedSeg"), S.speed, v => manual("speed", v));
  $("pdfAsPictures").checked = !!S.pdfAsPictures;
  $("moveOriginals").checked = !!S.moveOriginals;
  const isDefault = S.outputDir === H.defaultOutDir();
  $("outPath").textContent = "\u200e" + (H.outLabel ? H.outLabel(S.outputDir) : S.outputDir) + (isDefault && PHONE ? "  (default)" : "");
  $("outPath").title = S.outputDir;
  $("defaultFolder").classList.toggle("hidden", isDefault);
  drawRecipe();
  $("saveHelp").textContent = "Results go in Compressed as name_compressed" + (S.moveOriginals ? ", originals in Original. Originals are moved only after their compressed copy is saved." : ", originals stay where they are.");
  seg($("themeSeg"), storeGet("theme", "auto"), v => setTheme(v));
}
/** One line that says what will happen with the current settings (phone: shown above the list). */
function drawRecipe() {
  const p = PRESETS.find(x => x.id === S.preset);
  const what = S.mode === "PERCENT" ? `${S.percent}% of the original size` : S.mode === "MB" ? `About ${S.targetSize} ${S.sizeUnit} per file` : "Convert only, no size goal";
  $("recipeTitle").textContent = p ? `${p.label}: ${what.charAt(0).toLowerCase() + what.slice(1)}` : what;
  const f = [];
  if (S.videoFormat !== "keep") f.push(S.videoFormat.toUpperCase() + " videos");
  if (S.imageFormat !== "keep") f.push(S.imageFormat.toUpperCase() + " photos");
  if (S.audioFormat !== "keep") f.push(S.audioFormat.toUpperCase() + " audio");
  if (S.resolution !== "auto") f.push("up to " + S.resolution + "p");
  if (S.fps !== "auto") f.push(S.fps + " fps");
  $("recipeSub").textContent = f.length ? f.join(", ") : "Formats stay as they are. Tap to change";
}
// formats the engine on this device can't write are not offered
if (H.encoders) {
  const enc = H.encoders() || [];
  if (enc.length && !enc.includes("libvpx-vp9")) { const o = $("videoFormat").querySelector('[value="webm"]'); if (o) o.remove(); if (S.videoFormat === "webm") S.videoFormat = "keep"; }
  if (enc.length && !enc.includes("libmp3lame")) document.querySelectorAll('option[value="mp3"]').forEach(o => o.remove());
  if (enc.length && !enc.includes("libvorbis")) document.querySelectorAll('option[value="ogg"]').forEach(o => o.remove());
  if (enc.length && !enc.includes("libopus")) document.querySelectorAll('#audioFormat option[value="opus"]').forEach(o => o.remove());
}
if (PHONE) $("speedHelp").textContent = "Auto lowers resolution and frame rate only when the size you picked needs it. Best quality is slower and uses more battery.";

$("percent").oninput = () => { S.percent = +$("percent").value; S.preset = ""; save(); drawSettings(); drawList(); };
$("targetMb").oninput = () => { const v = parseFloat($("targetMb").value); if (v > 0) { S.targetSize = v; S.preset = ""; save(); drawSettings(); drawList(); } };
$("setTabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; S.setTab = b.dataset.p; storeSet("settings", S); drawSettings(); requestAnimationFrame(() => allSegs().forEach(x => placeMarker(x, true))); };
$("remember").onchange = () => { storeSet("remember", $("remember").checked); toast($("remember").checked ? "Settings are remembered." : "From the next start, size and formats go back to the defaults."); };
for (const k of ["resolution", "fps", "videoFormat", "imageFormat", "audioFormat"]) $(k).onchange = () => manual(k, $(k).value);
$("pdfAsPictures").onchange = () => { S.pdfAsPictures = $("pdfAsPictures").checked; save(); };
$("moveOriginals").onchange = () => { S.moveOriginals = $("moveOriginals").checked; save(); drawSettings(); };
$("changeFolder").onclick = async () => { const d = await H.chooseOutDir(S.outputDir); if (d) { S.outputDir = d; save(); drawSettings(); } };
$("defaultFolder").onclick = () => { S.outputDir = H.defaultOutDir(); save(); drawSettings(); toast("Back to the default folder."); };
$("openFolder").onclick = () => H.openFolder(S.outputDir);

// ================================================================== phone: two panes, swipe or tap
const pager = $("pager"), tabBtns = [...$("tabs").querySelectorAll("button")];
let tab = 0;
function goTab(k, smooth = true) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  pager.scrollTo({ left: k * pager.clientWidth, behavior: smooth && !reduce ? "smooth" : "instant" });
}
pager.addEventListener("scroll", () => {
  const w = pager.clientWidth || 1, p = Math.max(0, Math.min(1, pager.scrollLeft / w));
  $("tabs").style.setProperty("--p", p.toFixed(4));
  const k = p > 0.5 ? 1 : 0;
  if (k !== tab) { tab = k; tabBtns.forEach((b, i) => { b.classList.toggle("on", i === k); b.setAttribute("aria-selected", i === k); }); allSegs().forEach(s => placeMarker(s, true)); }
}, { passive: true });
tabBtns.forEach((b, i) => { b.onclick = () => goTab(i); });
$("recipe").onclick = () => goTab(1);
window.addEventListener("resize", () => goTab(tab, false));

// ================================================================== phone: permission card
function drawPermission() {
  const need = !!(H.permission && H.permission().allFiles === false);
  $("permCard").classList.toggle("hidden", !need);
}
$("permBtn").onclick = () => { if (H.askAllFiles) H.askAllFiles(); };

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

// ================================================================== the list
let items = [];
let seq = 0;
let running = false, lastRun = null;
const KIND_IC = { video: "video", audio: "music", image: "image", pdf: "pdf", office: "office" };
const KIND_NAME = { video: "Video", audio: "Audio", image: "Photo", pdf: "PDF", office: "Office" };

function addFiles(files, skipped = []) {
  const have = new Set(items.map(i => i.path));
  let n = 0;
  for (const f of files) {
    if (have.has(f.path)) continue;
    have.add(f.path);
    items.push({ ...f, id: f.id != null ? f.id : ++seq, status: "waiting", progress: 0 });
    n++;
  }
  if (skipped.length) toast(`${skipped.length} file(s) skipped: type not supported.`);
  else if (files.length && !n) toast("Already in the list.");
  drawList(true);
}
function goal(it) {
  if (S.mode === "PERCENT") return it.size * S.percent / 100;
  if (S.mode === "MB") return Math.min(it.size, sizeBytes());
  return null;
}
function rowHtml(it) {
  const g = goal(it);
  let sub = KIND_NAME[it.kind], plain = false;
  let sizes = `<b>${human(it.size)}</b>`;
  if (it.status === "working") sub = esc(it.stage || "Working") + "…";
  else if (it.status === "done") {
    const pct = Math.round((1 - it.newSize / it.oldSize) * 100);
    sub = it.note ? esc(it.note) : "Saved as " + esc(it.out.split(/[\\/]/).pop());
    plain = !it.note;
    sizes = `${human(it.oldSize)} → <b>${human(it.newSize)}</b><span class="delta">−${pct}%</span>`;
  } else if (it.status === "failed") sub = icon("info", "status-ic") + esc(it.why ? it.why.title : "Failed");
  else if (it.status === "skipped") sub = esc(it.reason || "Skipped");
  else if (g != null && S.mode === "MB" && it.size <= sizeBytes()) sub += ", already below the size you picked";
  else if (g != null) sub += `, about ${human(g)} when done`;
  const fill = it.status === "done" ? Math.max(1.5, it.newSize / it.oldSize * 100) : 100;
  const goalPct = g != null && it.status === "waiting" ? Math.min(100, g / it.size * 100) : null;
  return `<li class="row ${it.status}" data-id="${it.id}">${icon(KIND_IC[it.kind])}
    <span class="name"><b>${esc(it.name)}</b><small${plain ? ' class="plain"' : ""}>${sub}</small></span>
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
  $("tabCount").textContent = items.length ? items.length : "";
  $("tabCount").classList.toggle("show", items.length > 0);
  $("addMore").classList.toggle("hidden", running);
  $("clearBtn").classList.toggle("hidden", running);
  drawAction();
}
/** Update one row in place (no re-render), so the bars animate smoothly. */
function patchRow(it, statusChanged) {
  const li = $("list").querySelector(`[data-id="${it.id}"]`);
  if (!li) return;
  if (statusChanged) {
    const fresh = document.createElement("template");
    fresh.innerHTML = rowHtml({ ...it, newSize: it.status === "done" ? it.oldSize : it.newSize }).trim();
    const n = fresh.content.firstChild;
    n.style.animation = "none";
    li.replaceWith(n);
    if (it.status === "done") {
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
$("list").onclick = (e) => { const li = e.target.closest(".row"); if (li) itemSheet(items.find(i => i.id === +li.dataset.id)); };
$("clearBtn").onclick = () => {
  if (running) return;
  [...$("list").children].forEach((li, k) => { li.style.animationDelay = Math.min(k, 8) * 20 + "ms"; li.classList.add("leaving"); });
  setTimeout(() => { items = []; if (H.clear) H.clear(); drawList(); }, 260);
};

// ================================================================== action bar
function drawAction() {
  const waiting = items.filter(i => i.status === "waiting");
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
  go.disabled = !waiting.length && !lastRun;
  if (!items.length) { $("summary").innerHTML = (PHONE ? "<b>No files yet</b>Add some to get started" : "<b>Add some files to get started.</b>Drop them anywhere in the window."); $("goText").textContent = "Compress"; go.disabled = true; return; }
  if (!waiting.length && lastRun) {
    $("summary").innerHTML = `<b>${lastRun.done ? `${lastRun.done} done, ${human(lastRun.saved)} saved` : "Nothing was saved"}</b>${PHONE ? "In the Compressed folder" : "Results are in the Compressed folder"}`;
    $("goText").textContent = "Open results";
    return;
  }
  const total = waiting.reduce((a, i) => a + i.size, 0);
  const est = waiting.reduce((a, i) => a + (goal(i) ?? i.size), 0);
  const verb = S.mode === "CONVERT" ? "Convert" : "Compress";
  $("summary").innerHTML = `<b>${waiting.length} ${waiting.length === 1 ? "file" : "files"}, ${human(total)}</b>${S.mode === "CONVERT" ? "Format change only" : "About " + human(est) + " when done"}`;
  $("goText").textContent = `${verb} ${waiting.length === 1 ? "1 file" : waiting.length + " files"}`;
}
$("goBtn").onclick = () => {
  if (running) { H.abort(); $("goText").textContent = "Stopping…"; $("goBtn").disabled = true; return; }
  const waiting = items.filter(i => i.status === "waiting");
  if (!waiting.length && lastRun) { H.openFolder(lastRun.compressed || S.outputDir); return; }
  run(waiting);
};
function run(list) {
  if (!list.length || running) return;
  running = true; lastRun = null;
  if (tab !== 0) goTab(0);
  items.forEach(i => { i.run = list.includes(i); });
  drawList();
  H.start(list.map(i => ({ id: i.id, path: i.path, name: i.name, size: i.size, kind: i.kind })), { ...S });
}
let saved = 0, doneN = 0;
H.onItem((d) => {
  const it = items.find(i => i.id === d.id);
  if (!it) return;
  const changed = d.status && d.status !== it.status;
  Object.assign(it, d);
  if (changed && d.status === "done") { saved += Math.max(0, d.oldSize - d.newSize); doneN++; }
  patchRow(it, changed);
  drawAction();
});
H.onFinished((d) => {
  running = false;
  lastRun = { done: doneN, saved, compressed: d.outRoot ? d.outRoot.replace(/[\\/]+$/, "") + (d.outRoot.includes("\\") ? "\\" : "/") + "Compressed" : "" };
  saved = 0; doneN = 0;
  items.forEach(i => { if (i.status === "working") i.status = "waiting"; });
  drawList();
  if (d.crashed) items.forEach(i => { if (i.run && i.status === "waiting") { i.status = "failed"; i.why = { title: "Not enough memory", causes: ["The file is very large (for example a huge photo or PDF) and the engine stopped."], tips: ["Close other programs and try again, or process this file on its own."] }; } });
  drawList();
  toast(d.crashed ? "The engine stopped unexpectedly." : d.stopped ? "Stopped." : lastRun.done ? "Compression finished." : "Finished.");
});

// ================================================================== sheets
let sheetResolve = null, sheetTimer = 0;
function sheet(html, onReady) {
  return new Promise(res => {
    if (sheetResolve) sheetResolve(null);
    sheetResolve = res;
    const box = $("sheet"), card = $("sheetCard");
    const swap = !box.classList.contains("hidden");
    clearTimeout(sheetTimer);
    $("toast").classList.remove("show");
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
    sheetTimer = setTimeout(() => { box.classList.add("hidden"); box.classList.remove("closing"); }, 190);
  }
  if (r) r(v);
}
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetResolve) closeSheet(); });

async function itemSheet(it) {
  if (!it) return;
  const acts = [];
  if (it.status === "done") {
    acts.push({ v: "open", ic: "open", t: "Open result" });
    if (H.share) acts.push({ v: "share", ic: "link", t: "Share result" });
    if (!PHONE) acts.push({ v: "show", ic: "folder", t: "Show in folder" });
  }
  if (it.status === "failed") acts.push({ v: "why", ic: "help", t: "Why did it fail?" });
  if (!running && it.status !== "waiting" && it.status !== "working") acts.push({ v: "retry", ic: "retry", t: "Do it again with the current settings" });
  if (!running || it.status === "waiting" && !it.run) acts.push({ v: "remove", ic: "trash", t: "Remove from the list", cls: "danger" });
  const sub = it.status === "done" ? `${human(it.oldSize)} → ${human(it.newSize)}${it.note ? ". " + it.note : ""}`
    : it.status === "failed" ? (it.why ? it.why.title : "Failed") : it.status === "skipped" ? it.reason : `${KIND_NAME[it.kind]}, ${human(it.size)}`;
  const v = await sheet(`<h3>${esc(it.name)}</h3><p class="sub">${esc(sub)}</p>` +
    acts.map(a => `<button class="item ${a.cls || ""}" data-v="${a.v}">${icon(a.ic)}<span>${esc(a.t)}</span></button>`).join(""),
  card => card.querySelectorAll(".item").forEach(b => { b.onclick = () => closeSheet(b.dataset.v); }));
  if (v === "open") H.openPath(it.out);
  else if (v === "show") H.showItem(it.out);
  else if (v === "share") H.share(it.out);
  else if (v === "why") whySheet(it);
  else if (v === "retry") { Object.assign(it, { status: "waiting", progress: 0, newSize: null, why: null, reason: null, note: null }); drawList(); run([it]); }
  else if (v === "remove") { items = items.filter(i => i !== it); if (H.remove) H.remove(it.id); drawList(); }
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
$("addFiles").onclick = $("addFilesTop").onclick = $("addFiles2").onclick = pickFiles;
$("addFolder").onclick = $("addFolderTop").onclick = $("addFolder2").onclick = pickFolder;
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
// files handed to the app from outside: paths on the PC (opened here), ready-made file entries on the phone (Share → FileCompressor)
if (H.onOpen) H.onOpen(async (list, skipped = []) => {
  if (running) { toast("Wait for the current run to finish, then add more files."); return; }
  if (list.length && typeof list[0] === "string") { const r = await H.expand(list); addFiles(r.files, r.skipped); }
  else addFiles(list, skipped);
  goTab(0);
});

// keyboard: Ctrl+O add files, Delete clears finished rows
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") { e.preventDefault(); pickFiles(); }
});

// ================================================================== update check
// Looks at the latest GitHub release when the app opens. The version below is set by the build.
const APP_VERSION = "1.7.0", UPDATE_REPO = "Gabrydl/FileCompressor";
function verTuple(v) { return (String(v || "").match(/\d+/g) || ["0"]).slice(0, 3).map(Number); }
function isNewer(a, b) { const x = verTuple(a), y = verTuple(b); for (let k = 0; k < 3; k++) { if ((x[k] || 0) !== (y[k] || 0)) return (x[k] || 0) > (y[k] || 0); } return false; }
async function checkUpdates() {
  if (!PHONE || /^__/.test(UPDATE_REPO)) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    const apk = (j.assets || []).find(a => /\.apk$/i.test(a.name));
    if (!apk || !isNewer(j.tag_name, APP_VERSION) || running || sheetResolve) return;
    const v = await sheet(`<h3>Update available</h3><p class="sub">Version ${esc(verTuple(j.tag_name).join("."))} is ready (you have ${esc(APP_VERSION)}). Open the downloaded file to install it over this app; your settings stay.</p>
      <button class="item" data-v="dl">${icon("open")}<span>Download version ${esc(verTuple(j.tag_name).join("."))}</span></button>
      <button class="item" data-v="later">${icon("close")}<span>Later</span></button>`,
    card => card.querySelectorAll(".item").forEach(b => { b.onclick = () => closeSheet(b.dataset.v); }));
    if (v === "dl") { try { window.open(apk.browser_download_url, "_blank"); } catch (_) { location.href = apk.browser_download_url; } }
  } catch (_) { /* offline: say nothing */ }
}

// ================================================================== start
if (PHONE) {
  $("emptyTitle").textContent = "Tap to add files";
  $("emptySub").textContent = "Or use Share → FileCompressor from the Gallery, WhatsApp or Files. Nothing leaves this phone.";
}
applyTheme();
drawSettings();
drawList();
drawPermission();
window.__gfc = {
  S, items: () => items, addFiles, run, setTheme,
  /** Android back key: returns true when the page handled it (closed a sheet or went back to Files). */
  back() { if (sheetResolve) { closeSheet(); return true; } if (tab === 1) { goTab(0); return true; } return false; },
  /** Called when the app comes back to the front (for example after the permission screen). */
  resume() { drawPermission(); },
  adoptRun(ids) {
    if (running) return;
    running = true; lastRun = null;
    items.forEach(i => { i.run = ids.includes(i.id) || i.status !== "waiting"; });
    drawList();
  },
};
H.ready();
setTimeout(checkUpdates, 2500);

})();
