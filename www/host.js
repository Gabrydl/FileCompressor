// FileCompressor for Android: gives the page (app.js) the same window.Host calls the Windows app gives through
// window.Desktop, on top of the phone's engine (window.Android). On Windows and in a browser this file does nothing.
// The engine keeps the list of files and works in its own service; its state is read a few times a second and every
// change becomes the onItem / onFinished / onOpen calls app.js expects.
(function () {
  "use strict";
  var A = window.Android;
  if (!A) return;

  var KIND = { VIDEO: "video", AUDIO: "audio", IMAGE: "image", PDF: "pdf", OFFICE: "office" };
  var cb = { item: function () {}, fin: function () {}, open: null, note: null };
  var known = {};        // ids already handed to the page (never handed again, even after removal)
  var seen = {};         // id -> last state sent to the page
  var ready = false, timer = 0;
  var expecting = false, sawRunning = false, startIds = [], runPreview = false;
  var lastAllFiles = null, outWait = null;

  // ------------------------------------------------------------------ slow calls: answered later through __gfcReply
  var calls = {}, callSeq = 0;
  window.__gfcReply = function (id, json) {
    var r = calls[id];
    delete calls[id];
    if (!r) return;
    var v = null;
    try { v = JSON.parse(json); } catch (e) { /* */ }
    r(v);
  };
  function call(method, arg) {
    return new Promise(function (res) {
      var id = ++callSeq;
      calls[id] = res;
      try { A.call(id, method, arg == null ? "" : typeof arg === "string" ? arg : JSON.stringify(arg)); }
      catch (e) { delete calls[id]; res(null); }
    });
  }

  function snap() { try { return JSON.parse(A.snapshot()); } catch (e) { return null; } }
  function op(code, arg) { try { A.op(code, arg == null ? "" : String(arg)); } catch (e) { /* bridge gone */ } }
  function sig(it) { return it.status + "|" + Math.round((it.progress || 0) * 100) + "|" + (it.stage || "") + "|" + (it.held ? 1 : 0); }
  function toPage(it) {
    var d = { id: it.id };
    var note = (it.notes || []).join(". ");
    switch (it.status) {
      case "WORKING":
        d.status = "working"; d.progress = it.progress || 0; d.stage = it.stage || "Working"; break;
      case "DONE":
        d.status = "done"; d.progress = 1; d.newSize = it.newSize; d.oldSize = it.origSize || it.size;
        d.out = it.out || ""; d.origTo = it.moved || ""; d.note = note; break;
      case "REVIEW":
        d.status = "review"; d.progress = 1; d.newSize = it.newSize; d.oldSize = it.origSize || it.size; d.held = it.held || ""; d.note = note; break;
      case "FAILED":
        if (it.skip) { d.status = "skipped"; d.reason = it.message || "Skipped"; }
        else { d.status = "failed"; d.error = it.message || "Failed"; d.why = it.why || null; }
        break;
      case "STOPPED":
        d.status = "skipped"; d.reason = "Stopped, original untouched"; break;
      default:
        d.status = "waiting"; d.progress = 0;
    }
    return d;
  }

  function tick() {
    clearTimeout(timer);
    var s = ready ? snap() : null;
    if (s) {
      if (lastAllFiles !== s.allFiles) {
        var first = lastAllFiles === null;
        lastAllFiles = s.allFiles;
        if (!first && window.__gfc && window.__gfc.resume) window.__gfc.resume();
      }
      if (outWait && s.outputDir && s.outputDir !== outWait.before) { var r = outWait.res; outWait = null; r(s.outputDir); }

      // files added by the engine (picker, folder, Share → FileCompressor, or already there when the app opened)
      var fresh = [];
      s.items.forEach(function (it) {
        if (known[it.id]) return;
        known[it.id] = true;
        fresh.push({ id: it.id, path: "android:" + it.id, name: it.name, size: it.size, kind: KIND[it.kind] || "video" });
      });
      if (fresh.length && cb.open) cb.open(fresh);

      // progress and results
      var working = false, waitingStarted = false;
      s.items.forEach(function (it) {
        if (it.status === "WORKING") working = true;
        if (it.status === "WAITING" && startIds.indexOf(it.id) >= 0) waitingStarted = true;
        var g = sig(it);
        if (seen[it.id] === g) return;
        var firstSeen = seen[it.id] === undefined;
        seen[it.id] = g;
        if (!(firstSeen && it.status === "WAITING")) cb.item(toPage(it));
      });
      if (s.running) sawRunning = true;

      // a run that was already going when the page opened
      if (!expecting && s.running && window.__gfc && window.__gfc.adoptRun) {
        expecting = true; sawRunning = true;
        window.__gfc.adoptRun(s.items.filter(function (i) { return i.queued; }).map(function (i) { return i.id; }));
      }
      // the run is over (or never started, e.g. nothing was waiting)
      if (expecting && !s.running && !working && (sawRunning || !waitingStarted)) {
        expecting = false; sawRunning = false; startIds = [];
        cb.fin({ stopped: s.items.some(function (i) { return i.queued && i.status === "STOPPED"; }), outRoot: s.outputDir || "", preview: runPreview });
      }
    }
    timer = setTimeout(tick, expecting ? 250 : 700);
  }

  // insets from the phone: status bar on top, navigation bar (and keyboard) at the bottom
  window.__gfcInsets = function (top, bottom) {
    var st = document.documentElement.style;
    st.setProperty("--in-top", (+top || 0) + "px");
    st.setProperty("--in-bottom", (+bottom || 0) + "px");
  };
  try { var ins = String(A.insets()).split(","); window.__gfcInsets(ins[0], ins[1]); } catch (e) { /* */ }
  document.documentElement.classList.add("android");

  window.Host = {
    platform: "android",
    caps: { pdfFonts: false },                                             // the phone's PDF engine can't trim fonts
    pickFiles: function () { op(1); return Promise.resolve([]); },          // results arrive through onOpen
    pickFolder: function () { op(2); return Promise.resolve(null); },
    expand: function (list) { return Promise.resolve({ files: (list || []).filter(function (x) { return x && typeof x === "object"; }), skipped: [] }); },
    pathOf: function () { return ""; },
    defaultOutDir: function () { try { return A.defaultOutDir(); } catch (e) { return "/storage/emulated/0/Download/FileCompressor"; } },
    outLabel: function (d) { return String(d || "").replace(/^\/storage\/emulated\/0(?=\/|$)/, "Phone storage"); },
    chooseOutDir: function (current) {
      return new Promise(function (res) {
        if (outWait) outWait.res(null);
        var mine = { before: current, res: res };
        outWait = mine;
        op(3);
        setTimeout(function () { if (outWait === mine) { outWait = null; res(null); } }, 180000);
      });
    },
    permission: function () { try { return { allFiles: !!A.allFiles() }; } catch (e) { return { allFiles: true }; } },
    askAllFiles: function () { op(4); },
    inspect: function (list) {
      return call("inspect", (list || []).map(function (i) { return i.id; })).then(function (r) { return r || {}; });
    },
    start: function (items, S) {
      var now = snap(), st = {};
      if (now) now.items.forEach(function (i) { st[i.id] = i.status; });
      startIds = items.map(function (i) { return i.id; });
      items.forEach(function (i) { if (st[i.id] && st[i.id] !== "WAITING") seen[i.id] = "WAITING|0||0"; });
      runPreview = !!S.preview;
      expecting = true; sawRunning = false;
      call("start", { settings: S, items: items.map(function (i) { return { id: i.id, over: i.over || null, trim: i.trim || null }; }) })
        .then(function () { timer = setTimeout(tick, 200); });
    },
    abort: function () { op(6); },
    onItem: function (f) { cb.item = f; },
    onFinished: function (f) { cb.fin = f; },
    onOpen: function (f) { cb.open = f; },
    onNote: function (f) { cb.note = f; },
    progress: function () {},
    focused: function () { return !document.hidden; },
    openPath: function (p) { op(7, p); },
    share: function (p) { op(8, p); },
    showItem: function () { op(9); },
    openFolder: function () { op(9); },
    remove: function (id) { op(11, id); },
    clear: function () { op(12); },
    setTheme: function (t, dark) { op(10, dark ? "1" : "0"); },
    preview: function (it, page) { return call("preview", { item: it, page: page || 0 }).then(function (r) { return r || { type: "none" }; }); },
    reviewSave: function (it, S) { return call("reviewSave", { id: it.id, settings: S }); },
    reviewDiscard: function (held) { return call("reviewDiscard", held || ""); },
    history: function () { return call("history").then(function (r) { return Array.isArray(r) ? r : []; }); },
    historyClear: function () { return call("historyClear"); },
    restore: function (entry, removeCopy) { return call("restore", { entry: entry, removeCopy: !!removeCopy }); },
    log: function (level, msg) { try { A.log(String(level), String(msg)); } catch (e) { /* */ } },
    // saves the app's log as a text file in Download: { ok: true, name } or { ok: false, error }
    saveLog: function () {
      try { var r = String(A.saveLog()); return r.indexOf("OK:") === 0 ? { ok: true, name: r.slice(3) } : { ok: false, error: r.replace(/^ERR:/, "") }; }
      catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
    ready: function () {
      try { A.setLang(document.documentElement.lang || "en"); } catch (e) { /* older app */ }   // notifications in the same language
      ready = true; tick();
    },
  };
})();
