// Videos and audio, with FFmpeg.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Fail, Skip } = require("./errors");

let FFMPEG = "ffmpeg";
function setBinary(p) { FFMPEG = p; }

const VIDEO_EXT = ["mp4", "mkv", "mov", "avi", "webm", "m4v", "wmv", "flv", "3gp", "ts", "mts", "m2ts", "mpg", "mpeg", "ogv"];
const AUDIO_EXT = ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "wma", "amr", "aiff", "aif", "m4b", "oga"];

// ------------------------------------------------------------------ running ffmpeg
function run(args, { duration = 0, onProgress, signal, from = 0, to = 1 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Skip("stopped"));
    const p = spawn(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", ...args], { windowsHide: true });
    let err = "";
    const kill = () => { try { p.kill("SIGKILL"); } catch (_) { /* */ } };
    if (signal) signal.addEventListener("abort", kill, { once: true });
    p.stdout.on("data", (d) => {
      if (!onProgress || !duration) return;
      const m = /out_time_(?:us|ms)=(\d+)/.exec(String(d));
      if (m) onProgress(from + (to - from) * Math.min(1, Number(m[1]) / 1e6 / duration));
    });
    p.stderr.on("data", (d) => { err += d; if (err.length > 200000) err = err.slice(-100000); });
    p.on("error", (e) => reject(e.code === "ENOENT" ? new Fail("ffmpeg is missing") : e));
    p.on("close", (code) => {
      if (signal) signal.removeEventListener("abort", kill);
      if (signal && signal.aborted) return reject(new Skip("stopped"));
      if (code === 0) return resolve(err);
      const lines = err.trim().split(/\r?\n/).filter(l => !/^\s*(frame=|size=|Press \[q\])/.test(l));
      reject(new Fail("ffmpeg could not process the file: " + lines.slice(-3).join(" | ")));
    });
  });
}

// ------------------------------------------------------------------ reading what is inside
async function probe(file) {
  const out = await new Promise((resolve) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-nostdin", "-i", file], { windowsHide: true });
    let s = "";
    p.stderr.on("data", d => { s += d; });
    p.on("error", (e) => resolve(e.code === "ENOENT" ? null : ""));
    p.on("close", () => resolve(s));
  });
  if (out === null) throw new Fail("ffmpeg is missing");
  const info = { duration: 0, video: null, audio: null, bitrate: 0 };
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
  if (d) info.duration = (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]);
  const br = /bitrate:\s*(\d+)\s*kb\/s/.exec(out);
  if (br) info.bitrate = +br[1];
  for (const line of out.split(/\r?\n/)) {
    const v = /Stream #\S+.*?Video:\s*([a-z0-9_]+)(.*)/i.exec(line);
    if (v && !info.video && !/attached pic/.test(line)) {
      const wh = /\b(\d{2,5})x(\d{2,5})\b/.exec(v[2]);
      const fps = /([\d.]+)\s*fps/.exec(v[2]) || /([\d.]+)\s*tbr/.exec(v[2]);
      info.video = { codec: v[1].toLowerCase(), w: wh ? +wh[1] : 0, h: wh ? +wh[2] : 0, fps: fps ? parseFloat(fps[1]) : 30 };
    }
    const a = /Stream #\S+.*?Audio:\s*([a-z0-9_]+)(.*)/i.exec(line);
    if (a && !info.audio) info.audio = { codec: a[1].toLowerCase(), mono: /\bmono\b/.test(a[2]) };
  }
  const rot = /rotation of (-?[\d.]+) degrees/.exec(out);
  if (rot && info.video && Math.abs(Math.round(parseFloat(rot[1]))) % 180 === 90) [info.video.w, info.video.h] = [info.video.h, info.video.w];
  if (!info.duration && (info.video || info.audio)) info.duration = 0;
  if (/Invalid data found|could not find codec parameters|moov atom not found/i.test(out) && !info.video && !info.audio) throw new Fail("ffmpeg could not process the file: unreadable");
  return info;
}

// ------------------------------------------------------------------ trimming (start/end in seconds, per file)
function trimOf(s, info) {
  const full = info.duration || 0;
  const a = Math.max(0, +s.trimStart || 0);
  let b = +s.trimEnd || 0;
  if (!b || (full && b > full)) b = full;
  if (!(a > 0.05) && !(full && b < full - 0.05)) return null;
  if (b && b - a < 0.5) throw new Fail("the trim leaves less than half a second");
  return { a, b, dur: b ? b - a : 0 };
}
/** Input arguments with the trim applied, and the length of what is kept. */
function input(src, s, info) {
  const t = trimOf(s, info);
  if (!t) return { args: ["-i", src], dur: info.duration, trimmed: false, note: "" };
  const fmt = (x) => { const m = Math.floor(x / 60), sec = (x - m * 60).toFixed(1); return `${m}:${sec.padStart(4, "0")}`; };
  return { args: [...(t.a ? ["-ss", t.a.toFixed(3)] : []), "-i", src, ...(t.dur ? ["-t", t.dur.toFixed(3)] : [])], dur: t.dur || info.duration - t.a, trimmed: true, note: `Trimmed ${fmt(t.a)}–${fmt(t.b)}` };
}

// ------------------------------------------------------------------ choices
const X264_PRESET = { fast: "veryfast", balanced: "medium", best: "slow" };
const VP9_SPEED = { fast: "4", balanced: "2", best: "1" };

function containerFor(ext, want) {
  if (want && want !== "keep") return want;
  if (["mkv", "mov", "webm"].includes(ext)) return ext;
  return "mp4";
}
function audioKbps(totalKbps) {
  if (totalKbps > 2000) return 160;
  if (totalKbps > 700) return 128;
  if (totalKbps > 300) return 96;
  if (totalKbps > 140) return 64;
  return 40;
}
/** Short side and frame rate that fit the bitrate (only when set to Auto). */
function pickSize(info, s, vKbps) {
  const W = info.video.w || 1280, H = info.video.h || 720, short = Math.min(W, H), long = Math.max(W, H);
  const srcFps = Math.min(info.video.fps || 30, 120);
  let fps = s.fps === "auto" ? srcFps : Math.min(srcFps, +s.fps);
  let side = s.resolution === "auto" ? short : Math.min(short, +s.resolution);
  const bpp = (sd, f) => (vKbps * 1000) / (sd * (sd * long / short) * f);
  if (s.fps === "auto" && fps > 31 && bpp(side, fps) < 0.06) fps = 30;
  if (s.resolution === "auto") {
    for (const cand of [short, 1080, 720, 540, 480, 360, 240]) {
      if (cand > short) continue;
      side = cand;
      if (bpp(cand, fps) >= 0.05) break;
    }
  }
  return { side: side >= short ? 0 : side & ~1, fps: Math.abs(fps - srcFps) < 0.5 ? 0 : fps };
}
function videoFilters(info, sz) {
  const f = [];
  if (sz.side) f.push(info.video.w >= info.video.h ? `scale=-2:${sz.side}` : `scale=${sz.side}:-2`);
  if (sz.fps) f.push(`fps=${sz.fps}`);
  return f;
}

// ------------------------------------------------------------------ compress a video to a size
async function compressVideo(src, out, s, target, ctx) {
  const info = await probe(src);
  if (!info.video) {
    if (info.audio) return compressAudio(src, out, s, target, ctx, info);
    throw new Fail("ffmpeg could not process the file: no video");
  }
  if (!info.duration) throw new Fail("couldn't read the length");
  const ext = path.extname(src).slice(1).toLowerCase();
  const fmt = containerFor(ext, s.videoFormat);
  if (fmt === "mp3" || fmt === "m4a") return compressAudio(src, out.replace(/\.[^.]+$/, "." + fmt), { ...s, audioFormat: fmt }, target, ctx, info, "Audio only, extracted from the video");
  out = out.replace(/\.[^.]+$/, "." + fmt);
  const inp = input(src, s, info);
  const totalKbps = target * 8 / inp.dur / 1000;
  const aK = info.audio ? audioKbps(totalKbps) : 0;
  let vK = totalKbps * 0.955 - aK;
  if (vK < 50) throw new Fail("target too small");
  const sz = pickSize(info, s, vK);
  const vf = videoFilters(info, sz);
  const webm = fmt === "webm";
  const speed = s.speed || "balanced";
  const passlog = path.join(ctx.tmp, "pass");
  const nul = process.platform === "win32" ? "NUL" : "/dev/null";
  let size = 0, tries = 0;
  const notes = [];
  if (sz.side) notes.push(`${sz.side}p`);
  if (sz.fps) notes.push(`${Math.round(sz.fps)} fps`);
  for (;;) {
    const vcodec = webm
      ? ["-c:v", "libvpx-vp9", "-b:v", `${Math.round(vK)}k`, "-row-mt", "1", "-deadline", "good", "-cpu-used", VP9_SPEED[speed] || "2", "-pix_fmt", "yuv420p"]
      : ["-c:v", "libx264", "-preset", X264_PRESET[speed] || "medium", "-b:v", `${Math.round(vK)}k`, "-maxrate", `${Math.round(vK * 1.6)}k`, "-bufsize", `${Math.round(vK * 2.5)}k`, "-pix_fmt", "yuv420p"];
    const base = [...inp.args, "-map", "0:v:0", ...(vf.length ? ["-vf", vf.join(",")] : []), ...vcodec, "-passlogfile", passlog];
    ctx.stage(tries ? "Fine-tuning size" : "Compressing");
    await run([...base, "-pass", "1", "-an", "-f", webm ? "webm" : "mp4", nul], { duration: inp.dur, onProgress: ctx.progress, signal: ctx.signal, from: 0, to: 0.45 });
    const acodec = !info.audio ? ["-an"] : webm ? ["-map", "0:a:0", "-c:a", "libopus", "-b:a", `${aK}k`] : ["-map", "0:a:0", "-c:a", "aac", "-b:a", `${aK}k`];
    const cont = fmt === "mp4" || fmt === "mov" ? ["-movflags", "+faststart"] : [];
    await run([...base, "-pass", "2", ...acodec, "-map_metadata", "0", ...cont, out], { duration: inp.dur, onProgress: ctx.progress, signal: ctx.signal, from: 0.45, to: 1 });
    size = fs.statSync(out).size;
    if (size <= target * 1.02 || tries >= 2) break;
    vK = vK * (target / size) * 0.96 - (tries ? 10 : 0);
    if (vK < 40) break;
    tries++;
  }
  const note = size > target * 1.05 ? "Couldn't fully reach the target without ruining quality." : "";
  return { out, size, note: [inp.note, notes.length ? "Resized to " + notes.join(", ") : "", note].filter(Boolean).join(". ") };
}

// ------------------------------------------------------------------ convert a video (no size goal)
const MP4_V = ["h264", "hevc", "av1", "mpeg4"], MP4_A = ["aac", "mp3", "ac3", "eac3", "alac", "opus"];
const WEBM_V = ["vp8", "vp9", "av1"], WEBM_A = ["opus", "vorbis"];
async function convertVideo(src, out, s, ctx) {
  const info = await probe(src);
  const ext = path.extname(src).slice(1).toLowerCase();
  const inp = input(src, s, info);
  let fmt = s.videoFormat;
  if ((!fmt || fmt === "keep") && inp.trimmed) fmt = containerFor(ext, "keep");
  if (!inp.trimmed && (!fmt || fmt === "keep" || (fmt === ext && s.resolution === "auto" && s.fps === "auto") || (fmt === "mp4" && ext === "m4v" && s.resolution === "auto"))) throw new Skip("same format");
  if (!info.video) {
    if (!info.audio) throw new Fail("ffmpeg could not process the file: no streams");
    return convertAudio(src, out, { ...s, audioFormat: fmt === "mp3" || fmt === "m4a" ? fmt : "m4a" }, ctx, info, "No video inside, saved as M4A audio");
  }
  if (fmt === "mp3" || fmt === "m4a") {
    if (!info.audio) throw new Fail("no audio track");
    return convertAudio(src, out.replace(/\.[^.]+$/, "." + fmt), { ...s, audioFormat: fmt }, ctx, info, "Audio only, extracted from the video");
  }
  out = out.replace(/\.[^.]+$/, "." + fmt);
  const sz = { side: s.resolution === "auto" ? 0 : Math.min(+s.resolution, Math.min(info.video.w, info.video.h)), fps: s.fps === "auto" ? 0 : Math.min(+s.fps, info.video.fps) };
  if (sz.side >= Math.min(info.video.w, info.video.h)) sz.side = 0;
  if (sz.fps && Math.abs(sz.fps - info.video.fps) < 0.5) sz.fps = 0;
  const vf = videoFilters(info, sz);
  const okV = fmt === "webm" ? WEBM_V : fmt === "mkv" ? null : MP4_V;
  const okA = fmt === "webm" ? WEBM_A : fmt === "mkv" ? null : MP4_A;
  const copyV = !inp.trimmed && !vf.length && (!okV || okV.includes(info.video.codec));
  const copyA = !info.audio || !okA || okA.includes(info.audio.codec);
  const speed = s.speed || "balanced";
  const v = copyV ? ["-c:v", "copy", ...(info.video.codec === "hevc" && fmt !== "mkv" ? ["-tag:v", "hvc1"] : [])]
    : fmt === "webm" ? ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", VP9_SPEED[speed] || "2", "-pix_fmt", "yuv420p"]
      : ["-c:v", "libx264", "-crf", speed === "best" ? "19" : "21", "-preset", X264_PRESET[speed] || "medium", "-pix_fmt", "yuv420p"];
  const a = !info.audio ? ["-an"] : copyA ? ["-c:a", "copy"] : fmt === "webm" ? ["-c:a", "libopus", "-b:a", "128k"] : ["-c:a", "aac", "-b:a", "160k"];
  ctx.stage("Converting");
  await run([...inp.args, "-map", "0:v:0", ...(info.audio ? ["-map", "0:a:0"] : []), ...(vf.length ? ["-vf", vf.join(",")] : []), ...v, ...a,
    "-map_metadata", "0", ...(fmt === "mp4" || fmt === "mov" ? ["-movflags", "+faststart"] : []), out],
  { duration: inp.dur, onProgress: ctx.progress, signal: ctx.signal });
  return { out, size: fs.statSync(out).size, note: [inp.note, copyV ? "Not re-encoded: no quality lost" : ""].filter(Boolean).join(". ") };
}

// ------------------------------------------------------------------ audio
const AUDIO_CODEC = {
  mp3: (k) => ["-c:a", "libmp3lame", "-b:a", `${k}k`, "-id3v2_version", "3"],
  m4a: (k) => ["-c:a", "aac", "-b:a", `${k}k`, "-movflags", "+faststart"],
  ogg: (k) => ["-c:a", "libvorbis", "-b:a", `${k}k`],
  opus: (k) => ["-c:a", "libopus", "-b:a", `${k}k`],
};
function audioOut(ext, want) {
  if (want && want !== "keep") return want;
  if (ext === "mp3" || ext === "ogg" || ext === "opus") return ext;
  if (ext === "m4a" || ext === "aac" || ext === "m4b") return "m4a";
  return "mp3";
}
async function compressAudio(src, out, s, target, ctx, info = null, note = "") {
  info = info || await probe(src);
  if (!info.audio) throw new Fail("no audio track");
  if (!info.duration) throw new Fail("couldn't read the length of this audio");
  const ext = path.extname(src).slice(1).toLowerCase();
  const fmt = audioOut(ext, s.audioFormat);
  out = out.replace(/\.[^.]+$/, "." + fmt);
  if (!note && fmt !== ext && !(fmt === "m4a" && (ext === "aac" || ext === "m4b"))) note = `Saved as ${fmt.toUpperCase()} (from ${ext.toUpperCase()})`;
  const inp = input(src, s, info);
  const mono = !!s.audioMono && !info.audio.mono;
  let k = Math.floor(target * 8 / inp.dur / 1000 * 0.97);
  const max = fmt === "opus" ? 256 : 320;
  if (k < (fmt === "opus" ? 12 : 24)) throw new Fail("target too small");
  k = Math.min(k, mono ? 192 : max);
  if (info.bitrate && k >= info.bitrate && fmt === ext && !inp.trimmed && !mono) throw new Skip("already well compressed");
  const extra = [];
  if (k < 48 || s.audioMono) extra.push("-ac", "1");
  if (k < 40 && fmt !== "opus") extra.push("-ar", "22050");
  ctx.stage("Compressing");
  await run([...inp.args, "-map", "0:a:0", ...AUDIO_CODEC[fmt](k), ...extra, "-map_metadata", "0", "-vn", out],
    { duration: inp.dur, onProgress: ctx.progress, signal: ctx.signal });
  return { out, size: fs.statSync(out).size, note: [note, inp.note, mono ? "Mono" : ""].filter(Boolean).join(". ") };
}
async function convertAudio(src, out, s, ctx, info = null, note = "") {
  info = info || await probe(src);
  if (!info.audio) throw new Fail("no audio track");
  const ext = path.extname(src).slice(1).toLowerCase();
  const inp = input(src, s, info);
  const mono = !!s.audioMono && !info.audio.mono;
  let fmt = s.audioFormat;
  if ((!fmt || fmt === "keep") && (inp.trimmed || mono)) fmt = audioOut(ext, "keep");
  if (!inp.trimmed && !mono && (!fmt || fmt === "keep" || fmt === ext || (fmt === "m4a" && ext === "aac" && !info.video))) throw new Skip("same format");
  out = out.replace(/\.[^.]+$/, "." + fmt);
  const codec = fmt === "mp3" ? ["-c:a", "libmp3lame", "-q:a", "2", "-id3v2_version", "3"]
    : fmt === "m4a" ? (info.audio.codec === "aac" && !mono && !inp.trimmed ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", mono ? "96k" : "192k"])
      : fmt === "ogg" ? ["-c:a", "libvorbis", "-q:a", "6"] : ["-c:a", "libopus", "-b:a", "128k"];
  ctx.stage("Converting");
  await run([...inp.args, "-map", "0:a:0", ...codec, ...(mono ? ["-ac", "1"] : []), "-vn", "-map_metadata", "0", ...(fmt === "m4a" ? ["-movflags", "+faststart"] : []), out],
    { duration: inp.dur, onProgress: ctx.progress, signal: ctx.signal });
  return { out, size: fs.statSync(out).size, note: [note, inp.note, mono ? "Mono" : ""].filter(Boolean).join(". ") };
}

// ------------------------------------------------------------------ for the tick boxes and the before/after view
async function inspect(file) {
  try {
    const i = await probe(file);
    return { duration: i.duration, w: i.video ? i.video.w : 0, h: i.video ? i.video.h : 0, fps: i.video ? i.video.fps : 0, video: !!i.video, audio: !!i.audio, mono: !!(i.audio && i.audio.mono), bitrate: i.bitrate };
  } catch (e) { return { unreadable: true }; }
}
/** One frame as JPEG, at a fraction of the length. */
async function frame(file, at, outJpg, maxSide = 1280) {
  await run(["-ss", Math.max(0, at).toFixed(2), "-i", file, "-frames:v", "1", "-vf", `scale='min(${maxSide},iw)':-2`, "-q:v", "3", outJpg]);
  return outJpg;
}

module.exports = { setBinary, probe, inspect, frame, compressVideo, convertVideo, compressAudio, convertAudio, VIDEO_EXT, AUDIO_EXT };
