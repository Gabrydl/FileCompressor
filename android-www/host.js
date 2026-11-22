// FileCompressor for Android: connects the page (app.js) to the app's engine through the Java bridge (window.Android).
// The engine keeps the list of files and does the work in its own service; this file reads its state a few times a
// second and turns changes into the calls app.js expects (onOpen, onItem, onFinished).
(function () {
  "use strict";
  var A = window.Android;
  if (!A) return;

  var KIND = { VIDEO: "video", AUDIO: "audio", IMAGE: "image", PDF: "pdf", OFFICE: "office" };
  var cb = { item: function () {}, fin: function () {}, open: null };
  var known = {};        // ids already handed to the page (never handed again, even after removal)
  var seen = {};         // id -> last state sent to the page
  var ready = false, timer = 0;
  var expecting = false, sawRunning = false, startIds = [];
  var lastAllFiles = null, outWait = null;

  function snap() { try { return JSON.parse(A.snapshot()); } catch (e) { return null; } }
  function op(code, arg) { try { A.op(code, arg == null ? "" : String(arg)); } catch (e) { /* bridge gone */ } }
  function sig(it) { return it.status + "|" + Math.round((it.progress || 0) * 100) + "|" + (it.stage || ""); }
  function noteOf(it) {
    var n = (it.notes || []).slice();
    if (it.moved) n.push("Original moved to " + it.moved);
    return n.join(". ");
  }
  function toPage(it) {
    var d = { id: it.id };
    switch (it.status) {
      case "WORKING":
        d.status = "working"; d.progress = it.progress || 0; d.stage = it.stage || "Working"; break;
      case "DONE":
        d.status = "done"; d.progress = 1; d.newSize = it.newSize; d.oldSize = it.origSize || it.size;
        d.out = it.out || ""; d.note = noteOf(it); break;
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
        if (!first && window.__gfc) window.__gfc.resume();
      }
      if (outWait && s.outputDir && s.outputDir !== outWait.before) { var r = outWait.res; outWait = null; r(s.outputDir); }

      // files added by the engine (picker, folder, Share → FileCompressor, or already there when the app opened)
      var fresh = [];
      s.items.forEach(function (it) {
        if (known[it.id]) return;
        known[it.id] = true;
        fresh.push({ id: it.id, path: "android:" + it.id, name: it.name, size: it.size, kind: KIND[it.kind] || "video" });
      });
      if (fresh.length && cb.open) cb.open(fresh, []);

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
        window.__gfc.adoptRun(s.items.filter(function (i) { return i.status === "WAITING" || i.status === "WORKING"; }).map(function (i) { return i.id; }));
      }
      // the run is over (or never started, e.g. nothing was waiting)
      if (expecting && !s.running && !working && (sawRunning || !waitingStarted)) {
        expecting = false; sawRunning = false; startIds = [];
        cb.fin({ stopped: s.items.some(function (i) { return i.status === "STOPPED"; }), outRoot: "" });
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
    pickFiles: function () { op(1); return Promise.resolve([]); },          // results arrive through onOpen
    pickFolder: function () { op(2); return Promise.resolve(null); },
    expand: function () { return Promise.resolve({ files: [], skipped: [] }); },
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
    encoders: function () { try { var e = A.encoders(); return e ? e.split(",") : []; } catch (x) { return []; } },
    initialSettings: function () { try { return JSON.parse(A.initialSettings()); } catch (e) { return {}; } },
    saveSettings: function (S) { try { A.putSettings(JSON.stringify(S)); } catch (e) { /* */ } },
    start: function (items, S) {
      this.saveSettings(S);
      var now = snap(), st = {};
      if (now) now.items.forEach(function (i) { st[i.id] = i.status; });
      startIds = items.map(function (i) { return i.id; });
      items.forEach(function (i) {
        // retry of a finished file: put it back in the engine's queue first
        if (st[i.id] && st[i.id] !== "WAITING") { op(13, i.id); seen[i.id] = "WAITING|0|"; }
      });
      expecting = true; sawRunning = false;
      op(5);
      timer = setTimeout(tick, 300);
    },
    abort: function () { op(6); },
    onItem: function (f) { cb.item = f; },
    onFinished: function (f) { cb.fin = f; },
    onOpen: function (f) { cb.open = f; },
    openPath: function (p) { op(7, p); },
    share: function (p) { op(8, p); },
    showItem: function () {},
    openFolder: function () { op(9); },
    remove: function (id) { op(11, id); },
    clear: function () { op(12); },
    setTheme: function (t, dark) { op(10, dark ? "1" : "0"); },
    ready: function () { ready = true; tick(); },
  };
})();
