// Background process: does the compressing so the window never freezes.
const { Runner } = require("./index");
let runner = null;
const post = (type, data) => process.parentPort.postMessage({ type, data });
process.parentPort.on("message", async (e) => {
  const m = e.data;
  if (m.type === "start") {
    runner = new Runner({ ffmpeg: m.ffmpeg, send: post });
    try { await runner.start(m.items, m.settings); } catch (err) { post("crash", String((err && err.stack) || err)); }
  } else if (m.type === "abort" && runner) runner.abort();
});
