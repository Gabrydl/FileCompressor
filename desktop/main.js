// FileCompressor for Windows: an Electron window around the "www" page; the work happens in engine/ (background process).
const { app, BrowserWindow, protocol, dialog, shell, ipcMain, nativeTheme, Menu, utilityProcess, clipboard, nativeImage, Notification, net } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { pathToFileURL } = require("url");
const { expand, inspect, finalize, restore, PREVIEW_ROOT, ALL_EXT } = require("./engine/index");
const media = require("./engine/media");
const image = require("./engine/image");
const pdf = require("./engine/pdf");

const WWW = path.join(__dirname, "www");
const exeDir = app.isPackaged ? path.dirname(app.getPath("exe")) : __dirname;
const FFMPEG = app.isPackaged
  ? path.join(process.resourcesPath, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")
  : path.join(__dirname, "..", process.platform === "win32" ? "bin-win" : "bin-linux", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

// Portable: settings in a "data" folder next to the exe when that place can be written
function writable(dir) { try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return true; } catch (_) { return false; } }
if (app.isPackaged && writable(path.join(exeDir, "data"))) app.setPath("userData", path.join(exeDir, "data"));
// languages (www/locales) and the log file FileCompressor.log in the program folder
const L = require("./i18n_main");
const { T } = L;
L.init(WWW, exeDir);
L.startLog("FileCompressor", exeDir);
function defaultOutDir() {
  // results go next to the program (Compressed and Original folders), as before; elsewhere if that place is read-only
  if (app.isPackaged && writable(exeDir)) return exeDir;
  return path.join(app.getPath("documents"), "FileCompressor");
}

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }]);
const MIME = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", png: "image/png", woff2: "font/woff2", svg: "image/svg+xml", json: "application/json" };
// files the page may show in the before/after view: only the ones handed out here
const shared = new Map();
function share(file) { const t = Math.random().toString(36).slice(2) + Date.now().toString(36); shared.set(t, file); return "app://filecompressor/__file/" + t + "/" + encodeURIComponent(path.basename(file)); }

let win = null, worker = null, readyForFiles = false, pendingPaths = [];
const argPaths = (argv) => argv.slice(1).filter(a => a && !a.startsWith("-") && fs.existsSync(a) && path.resolve(a) !== path.resolve(app.getPath("exe")) && path.resolve(a) !== __dirname);

const stateFile = () => path.join(app.getPath("userData"), "window.json");
const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch (_) { return {}; } };
function saveState(extra = {}) {
  if (!win) return;
  try {
    const old = loadState();
    const st = { ...old, ...extra, max: win.isMaximized() };
    if (!win.isMaximized() && !win.isMinimized()) st.bounds = win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify(st));
  } catch (_) { /* */ }
}

function createWindow() {
  const st = loadState();
  nativeTheme.themeSource = st.theme === "light" || st.theme === "dark" ? st.theme : "system";
  win = new BrowserWindow({
    width: 1240, height: 820, ...(st.bounds || {}), minWidth: 400, minHeight: 560, show: false, title: "FileCompressor",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#111317" : "#f2f4f7", icon: path.join(__dirname, "icon.png"), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  if (st.max) win.maximize();
  L.watchWindow(win);
  win.once("ready-to-show", () => win.show());
  win.loadURL("app://filecompressor/index.html");
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("app://filecompressor/")) e.preventDefault(); });
  win.on("close", async (e) => {
    saveState();
    if (worker) {
      e.preventDefault();
      const r = await dialog.showMessageBox(win, { type: "question", buttons: [T("Keep working"), T("Stop and close")], defaultId: 0, cancelId: 0,
        title: "FileCompressor", message: T("Files are still being compressed."), detail: T("Stop now? Originals that were not finished stay untouched.") });
      if (r.response === 1) { try { worker.kill(); } catch (_) { /* */ } worker = null; win.destroy(); }
    }
  });
  win.on("closed", () => { win = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const p = argPaths(argv);
    if (p.length) win.webContents.send("open-paths", p);
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle("app", async (req) => {
      try {
        const pn = new URL(req.url).pathname;
        if (pn.startsWith("/__file/")) {
          const f = shared.get(pn.split("/")[2]);
          if (!f || !fs.existsSync(f)) return new Response("Not found", { status: 404 });
          return net.fetch(pathToFileURL(f).toString(), { headers: req.headers });
        }
        const file = path.normalize(path.join(WWW, decodeURIComponent(pn)));
        if (!file.startsWith(WWW + path.sep)) return new Response("Forbidden", { status: 403 });
        return new Response(await fs.promises.readFile(file), { headers: { "content-type": MIME[path.extname(file).slice(1)] || "application/octet-stream" } });
      } catch (_) { return new Response("Not found", { status: 404 }); }
    });
    pendingPaths = argPaths(process.argv);
    fs.rm(PREVIEW_ROOT, { recursive: true, force: true }, () => {});
    createWindow();
    // checks GitHub for a newer version as soon as the app opens
    require("./updater").start({ repo: "Gabrydl/FileCompressor", asset: "FileCompressor-Setup.exe", name: "FileCompressor", getWin: () => win });
  });
  app.on("window-all-closed", () => app.quit());
}

// ------------------------------------------------------------------ what the page may ask for
const MEDIA_FILTER = [
  { name: T("Supported files"), extensions: ALL_EXT },
  { name: T("All files"), extensions: ["*"] },
];
ipcMain.handle("pick-files", async () => {
  const r = await dialog.showOpenDialog(win, { title: T("Add files"), properties: ["openFile", "multiSelections"], filters: MEDIA_FILTER });
  return r.canceled ? [] : expand(r.filePaths).files;
});
ipcMain.handle("pick-folder", async () => {
  const r = await dialog.showOpenDialog(win, { title: T("Add a folder"), properties: ["openDirectory"] });
  return r.canceled ? null : expand(r.filePaths);
});
ipcMain.handle("expand", (_e, paths) => expand(paths));
ipcMain.on("default-out", (e) => { e.returnValue = defaultOutDir(); });
ipcMain.handle("choose-out", async (_e, current) => {
  const r = await dialog.showOpenDialog(win, { title: T("Save results in"), defaultPath: current || undefined, properties: ["openDirectory", "createDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  if (!writable(r.filePaths[0])) { dialog.showErrorBox(T("Can't save there"), T("Windows doesn't allow writing in that folder. Choose another one.")); return null; }
  return r.filePaths[0];
});
ipcMain.on("start", (_e, items, settings) => {
  if (worker) return;
  if (!writable(settings.outputDir)) {
    settings.outputDir = defaultOutDir();
    if (win) win.webContents.send("note", T("The output folder can't be written, so the default folder is used."));
  }
  worker = utilityProcess.fork(path.join(__dirname, "engine", "worker.js"), [], { serviceName: "FileCompressor engine", stdio: "ignore" });
  let finished = false;
  const byId = new Map(items.map(i => [i.id, i]));
  worker.on("message", (m) => {
    if (m.type === "item" && m.data.status === "done" && settings.history !== false) addHistory(byId.get(m.data.id), m.data);
    if (m.type === "item" && (m.data.status === "done" || m.data.status === "failed" || m.data.status === "skipped")) {
      const it = byId.get(m.data.id) || {};
      if (m.data.status === "failed") L.log("error", `failed: ${it.path || it.name} (${it.kind}, ${settings.mode}): ${m.data.error}`);
      else if (m.data.status === "skipped") L.log("info", `skipped: ${it.name}: ${m.data.reason}`);
      else L.log("info", `done: ${it.name} ${m.data.oldSize} -> ${m.data.newSize} bytes${m.data.note ? " (" + m.data.note + ")" : ""}`);
    }
    if (m.type === "finished") L.log("info", `finished: ${m.data.done || 0} done${m.data.stopped ? ", stopped by the user" : ""}`);
    if (!win) return;
    if (m.type === "item") win.webContents.send("item", m.data);
    else if (m.type === "finished") { finished = true; win.webContents.send("finished", m.data); try { worker.kill(); } catch (_) { /* */ } }
    if (m.type === "finished" && win) win.setProgressBar(-1);
  });
  worker.on("exit", () => {
    // the engine crashed (for example out of memory): tell the page so the list is not stuck
    if (!finished) L.log("error", "the engine stopped unexpectedly (out of memory or crashed)");
    if (!finished && win) win.webContents.send("finished", { crashed: true, outRoot: settings.outputDir });
    worker = null;
    if (win) win.setProgressBar(-1);
  });
  L.log("info", `start: ${items.length} file(s), mode ${settings.mode}${settings.mode === "SIZE" ? " " + settings.targetBytes + " bytes" : settings.mode === "PERCENT" ? " " + settings.percent + "%" : ""}`);
  worker.postMessage({ type: "start", items, settings, ffmpeg: FFMPEG });
});
ipcMain.on("progress", (_e, frac) => { if (win) win.setProgressBar(frac < 0 ? -1 : frac); });
ipcMain.on("abort", () => { if (worker) worker.postMessage({ type: "abort" }); });
ipcMain.on("open-path", (_e, p) => { if (p && fs.existsSync(p)) shell.openPath(p); });
ipcMain.on("show-item", (_e, p) => { if (p && fs.existsSync(p)) shell.showItemInFolder(p); });
ipcMain.on("open-folder", (_e, p) => { if (!p) return; try { fs.mkdirSync(p, { recursive: true }); } catch (_) { /* */ } shell.openPath(p); });
ipcMain.on("set-theme", (_e, theme, dark) => {
  nativeTheme.themeSource = theme === "light" || theme === "dark" ? theme : "system";
  if (win) { win.setBackgroundColor(dark ? "#111317" : "#f2f4f7"); saveState({ theme }); }
});
ipcMain.on("lang-get", (e) => { e.returnValue = L.getLang(); });
ipcMain.on("lang-set", (e, c) => { e.returnValue = L.setLang(c); L.log("info", "language: " + c); });
ipcMain.on("log", (_e, level, msg) => L.log(level === "error" ? "error" : "info", "page: " + msg));
ipcMain.on("open-log", () => { const f = L.logFile(); if (f && fs.existsSync(f)) shell.openPath(f); });
ipcMain.on("ready", () => { readyForFiles = true; if (pendingPaths.length && win) win.webContents.send("open-paths", pendingPaths); pendingPaths = []; });

// ------------------------------------------------------------------ history (data/history.json next to the program)
const histFile = () => path.join(app.getPath("userData"), "history.json");
function readHistory() { try { return JSON.parse(fs.readFileSync(histFile(), "utf8")); } catch (_) { return []; } }
function writeHistory(h) { try { fs.writeFileSync(histFile(), JSON.stringify(h.slice(-2000))); } catch (_) { /* */ } }
function addHistory(it, d) {
  if (!it) return;
  const h = readHistory();
  h.push({ id: Date.now() + "-" + it.id, name: it.name, kind: it.kind, path: it.path, out: d.out, origTo: d.origTo || "", oldSize: d.oldSize, newSize: d.newSize, at: Date.now() });
  writeHistory(h);
}
ipcMain.handle("history", () => readHistory().reverse());
ipcMain.handle("history-clear", () => { writeHistory([]); return true; });
ipcMain.handle("restore", (_e, entry, removeCopy) => {
  try {
    const back = restore({ ...entry }, removeCopy);
    const h = readHistory();
    const k = h.findIndex(x => x.id === entry.id || (x.out === entry.out && x.path === entry.path));
    if (k >= 0) { h[k].restored = true; h[k].origTo = ""; h[k].path = back; if (removeCopy) h[k].out = ""; writeHistory(h); }
    return { ok: true, path: back };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

// ------------------------------------------------------------------ what is inside the files (tick boxes)
media.setBinary(FFMPEG);
ipcMain.handle("inspect", async (_e, list) => {
  const out = {};
  for (const f of list) out[f.id] = await inspect(f.path, f.kind);
  return out;
});

// ------------------------------------------------------------------ before/after view and saving after it
ipcMain.handle("preview", async (_e, it, page = 0) => {
  const dir = path.join(PREVIEW_ROOT, "views");
  fs.mkdirSync(dir, { recursive: true });
  const tag = it.id + "-" + Date.now();
  const before = it.path, after = it.held || it.out;
  try {
    if (it.kind === "image") {
      const a = path.join(dir, tag + "-a.png"), b = path.join(dir, tag + "-b.png");
      fs.writeFileSync(a, await image.previewPng(before, 2000));
      fs.writeFileSync(b, await image.previewPng(after, 2000));
      const ia = await image.inspect(before), ib = await image.inspect(after);
      return { type: "image", before: share(a), after: share(b), info: [`${ia.w}×${ia.h}`, `${ib.w}×${ib.h}`] };
    }
    if (it.kind === "pdf") {
      const a = await pdf.renderPage(before, page, 1400), b = await pdf.renderPage(after, page, 1400);
      const fa = path.join(dir, tag + "-a.png"), fb = path.join(dir, tag + "-b.png");
      fs.writeFileSync(fa, a.png); fs.writeFileSync(fb, b.png);
      return { type: "pdf", before: share(fa), after: share(fb), pages: Math.min(a.pages, b.pages), page };
    }
    if (it.kind === "video") {
      const ia = await media.inspect(before), ib = await media.inspect(after);
      const t0 = (it.trim && +it.trim.trimStart) || 0;
      const fa = path.join(dir, tag + "-a.jpg"), fb = path.join(dir, tag + "-b.jpg");
      await media.frame(before, t0 + (ib.duration || ia.duration) * 0.35, fa);
      await media.frame(after, (ib.duration || 0) * 0.35, fb);
      return { type: "video", before: share(fa), after: share(fb), playA: share(before), playB: share(after), info: [`${ia.w}×${ia.h}`, `${ib.w}×${ib.h}`] };
    }
    if (it.kind === "audio") return { type: "audio", before: share(before), after: share(after) };
  } catch (e) { return { type: "none", error: String(e.message || e) }; }
  return { type: "none" };
});
ipcMain.handle("review-save", (_e, it, settings) => {
  try {
    const f = finalize(it, it.held, settings);
    if (settings.history !== false) addHistory(it, { out: f.dest, origTo: f.origTo, oldSize: it.oldSize, newSize: it.newSize });
    return { ok: true, out: f.dest, origTo: f.origTo, note: f.note };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle("review-discard", (_e, held) => { try { if (held && held.startsWith(PREVIEW_ROOT)) fs.rmSync(path.dirname(held), { recursive: true, force: true }); } catch (_) { /* */ } return true; });

// ------------------------------------------------------------------ Ctrl+V: files copied in Explorer, or a screenshot
function clipboardPaths() {
  if (process.platform !== "win32") return [];
  try {
    const buf = clipboard.readBuffer("CF_HDROP");
    if (buf && buf.length > 20) {
      const off = buf.readUInt32LE(0), wide = buf.readUInt32LE(16) !== 0;
      const txt = wide ? buf.slice(off).toString("utf16le") : buf.slice(off).toString("latin1");
      const list = txt.split("\0").filter(Boolean);
      if (list.length) return list;
    }
  } catch (_) { /* */ }
  try { const one = clipboard.readBuffer("FileNameW").toString("utf16le").replace(/\0+$/, ""); if (one) return [one]; } catch (_) { /* */ }
  return [];
}
ipcMain.handle("paste", () => {
  const paths = clipboardPaths().filter(p => fs.existsSync(p));
  if (paths.length) return expand(paths);
  const img = clipboard.readImage();
  if (img && !img.isEmpty()) {
    const dir = path.join(app.getPath("userData"), "Pasted");
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), z = (n) => String(n).padStart(2, "0");
    const f = path.join(dir, `Pasted ${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}.png`);
    fs.writeFileSync(f, img.toPNG());
    return expand([f]);
  }
  return { files: [], skipped: [], empty: true };
});

// ------------------------------------------------------------------ drag a finished file out of the window
ipcMain.on("start-drag", (e, file) => {
  if (!file || !fs.existsSync(file)) return;
  e.sender.startDrag({ file, icon: nativeImage.createFromPath(path.join(__dirname, "icon.png")).resize({ width: 48, height: 48 }) });
});

// ------------------------------------------------------------------ Windows notification when the list is done
ipcMain.on("notify", (_e, title, body, folder) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, "icon.png"), silent: true });
  n.on("click", () => { if (folder) shell.openPath(folder); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  n.show();
});
ipcMain.on("focused", (e) => { e.returnValue = !!(win && win.isFocused()); });

// ------------------------------------------------------------------ "Compress with FileCompressor" in the Explorer right-click menu
function reg(args) { return new Promise(res => execFile("reg.exe", args, { windowsHide: true }, (err) => res(!err))); }
const MENU_KEYS = ["HKCU\\Software\\Classes\\*\\shell\\FileCompressor", "HKCU\\Software\\Classes\\Directory\\shell\\FileCompressor"];
async function setExplorerMenu(on) {
  if (process.platform !== "win32" || !app.isPackaged) return false;
  const exe = app.getPath("exe");
  let ok = true;
  for (const k of MENU_KEYS) {
    if (!on) { await reg(["delete", k, "/f"]); continue; }
    ok = (await reg(["add", k, "/ve", "/d", T("Compress with FileCompressor"), "/f"])) && ok;
    ok = (await reg(["add", k, "/v", "Icon", "/d", `"${exe}"`, "/f"])) && ok;
    ok = (await reg(["add", k, "/v", "MultiSelectModel", "/d", "Player", "/f"])) && ok;
    ok = (await reg(["add", k + "\\command", "/ve", "/d", `"${exe}" "%1"`, "/f"])) && ok;
  }
  return ok;
}
ipcMain.handle("explorer-menu", (_e, on) => setExplorerMenu(!!on));
