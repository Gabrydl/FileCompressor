package com.gabrydl99.gfc.work

import java.io.File
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Videos and audio with ffmpeg: the same steps as the Windows engine (desktop/engine/media.js). */
object Media {
    val VIDEO_EXT = listOf("mp4", "mkv", "mov", "avi", "webm", "m4v", "wmv", "flv", "3gp", "ts", "mts", "m2ts", "mpg", "mpeg", "ogv")
    val AUDIO_EXT = listOf("mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "wma", "amr", "aiff", "aif", "m4b", "oga")

    class VInfo(val codec: String, var w: Int, var h: Int, val fps: Double)
    class AInfo(val codec: String, val mono: Boolean)
    class Info {
        var duration = 0.0
        var bitrate = 0
        var video: VInfo? = null
        var audio: AInfo? = null
        val audioCodecs = mutableListOf<String>()
        val subs = mutableListOf<String>()
        var cover = ""
    }

    // ------------------------------------------------------------------ reading what is inside
    fun probe(file: File): Info {
        val out = Ff.probeText(file)
        val info = Info()
        Regex("""Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)""").find(out)?.let {
            info.duration = it.groupValues[1].toDouble() * 3600 + it.groupValues[2].toDouble() * 60 + it.groupValues[3].toDouble()
        }
        Regex("""bitrate:\s*(\d+)\s*kb/s""").find(out)?.let { info.bitrate = it.groupValues[1].toInt() }
        val vRe = Regex("""Stream #\S+.*?Video:\s*([a-z0-9_]+)(.*)""", RegexOption.IGNORE_CASE)
        val aRe = Regex("""Stream #\S+.*?Audio:\s*([a-z0-9_]+)(.*)""", RegexOption.IGNORE_CASE)
        for (line in out.split(Regex("\\r?\\n"))) {
            val v = vRe.find(line)
            if (v != null && info.video == null && !line.contains("attached pic")) {
                val rest = v.groupValues[2]
                val wh = Regex("""\b(\d{2,5})x(\d{2,5})\b""").find(rest)
                val fps = Regex("""([\d.]+)\s*fps""").find(rest) ?: Regex("""([\d.]+)\s*tbr""").find(rest)
                info.video = VInfo(v.groupValues[1].lowercase(), wh?.groupValues?.get(1)?.toInt() ?: 0, wh?.groupValues?.get(2)?.toInt() ?: 0,
                    fps?.groupValues?.get(1)?.toDoubleOrNull() ?: 30.0)
            }
            val a = aRe.find(line)
            if (a != null) {
                if (info.audio == null) info.audio = AInfo(a.groupValues[1].lowercase(), Regex("""\bmono\b""").containsMatchIn(a.groupValues[2]))
                info.audioCodecs.add(a.groupValues[1].lowercase())
            }
            Regex("""Stream #\S+.*?Subtitle:\s*([a-z0-9_]+)""", RegexOption.IGNORE_CASE).find(line)?.let { info.subs.add(it.groupValues[1].lowercase()) }
            if (info.cover.isEmpty()) Regex("""Stream #\S+.*?Video:\s*([a-z0-9_]+).*attached pic""", RegexOption.IGNORE_CASE).find(line)?.let { info.cover = it.groupValues[1].lowercase() }
        }
        Regex("""rotation of (-?[\d.]+) degrees""").find(out)?.let {
            val vi = info.video
            if (vi != null && abs(it.groupValues[1].toDouble().roundToInt()) % 180 == 90) { val t = vi.w; vi.w = vi.h; vi.h = t }
        }
        if (Regex("Invalid data found|could not find codec parameters|moov atom not found", RegexOption.IGNORE_CASE).containsMatchIn(out) && info.video == null && info.audio == null)
            throw Fail("ffmpeg could not process the file: unreadable")
        if (Regex("No such file|Permission denied", RegexOption.IGNORE_CASE).containsMatchIn(out) && info.video == null && info.audio == null)
            throw Fail("The file isn't there anymore or can't be read (" + out.trim().lines().lastOrNull() + ")")
        return info
    }

    // ------------------------------------------------------------------ choices
    private val X264_PRESET = mapOf("fast" to "veryfast", "balanced" to "medium", "best" to "slow")
    private val VP9_SPEED = mapOf("fast" to "4", "balanced" to "2", "best" to "1")

    private fun containerFor(ext: String, want: String): String {
        if (want != "keep") return want
        if (ext in listOf("mkv", "mov", "webm")) return ext
        return "mp4"
    }

    private fun audioKbps(totalKbps: Double): Int = when {
        totalKbps > 2000 -> 160
        totalKbps > 700 -> 128
        totalKbps > 300 -> 96
        totalKbps > 140 -> 64
        else -> 40
    }

    private class Size(val side: Int, val fps: Double)

    /** Short side and frame rate that fit the bitrate (only when set to Auto). */
    private fun pickSize(vi: VInfo, s: Settings, vKbps: Double): Size {
        val w = if (vi.w > 0) vi.w else 1280
        val h = if (vi.h > 0) vi.h else 720
        val short = min(w, h).toDouble()
        val long = max(w, h).toDouble()
        val srcFps = min(vi.fps, 120.0)
        var fps = if (s.fps == "auto") srcFps else min(srcFps, s.fps.toDoubleOrNull() ?: srcFps)
        var side = if (s.resolution == "auto") short else min(short, s.resolution.toDoubleOrNull() ?: short)
        fun bpp(sd: Double, f: Double) = (vKbps * 1000) / (sd * (sd * long / short) * f)
        if (s.fps == "auto" && fps > 31 && bpp(side, fps) < 0.06) fps = 30.0
        if (s.resolution == "auto") {
            for (cand in listOf(short, 1080.0, 720.0, 540.0, 480.0, 360.0, 240.0)) {
                if (cand > short) continue
                side = cand
                if (bpp(cand, fps) >= 0.05) break
            }
        }
        return Size(if (side >= short) 0 else (side.toInt() and 1.inv()), if (abs(fps - srcFps) < 0.5) 0.0 else fps)
    }

    private fun videoFilters(vi: VInfo, sz: Size): List<String> {
        val f = mutableListOf<String>()
        if (sz.side > 0) f.add(if (vi.w >= vi.h) "scale=-2:${sz.side}" else "scale=${sz.side}:-2")
        if (sz.fps > 0) f.add("fps=${fmtNum(sz.fps)}")
        return f
    }

    private fun fmtNum(d: Double): String = if (d == floor(d)) d.toInt().toString() else "%.3f".format(java.util.Locale.US, d)

    // ------------------------------------------------------------------ every audio track, subtitles and cover pictures are kept
    private val TEXT_SUBS = listOf("subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text")
    private class Extra(val args: List<String>, val note: String)

    /** Subtitle tracks the chosen container can hold: -map and -c:s for each, and how many had to be left out. */
    private fun subtitleArgs(info: Info, fmt: String): Extra {
        val args = mutableListOf<String>()
        var kept = 0
        var dropped = 0
        info.subs.forEachIndexed { i, codec ->
            val text = codec in TEXT_SUBS
            val c = when (fmt) {
                "mkv" -> if (codec == "mov_text") "srt" else "copy"
                "webm" -> if (text) "webvtt" else null
                else -> if (text) "mov_text" else null
            }
            if (c == null) { dropped++; return@forEachIndexed }
            args += listOf("-map", "0:s:$i", "-c:s:$kept", c)
            kept++
        }
        val note = if (dropped > 0) "$dropped picture subtitle track${if (dropped > 1) "s" else ""} left out (${fmt.uppercase()} can't hold ${if (dropped > 1) "them" else "it"}, MKV can)" else ""
        return Extra(args, note)
    }

    /** The cover picture of a song, when the output format can carry it. */
    private fun coverArgs(info: Info, fmt: String): Extra {
        if (info.cover.isEmpty() || info.video != null) return Extra(emptyList(), "")
        if ((fmt == "mp3" || fmt == "m4a") && (info.cover == "mjpeg" || info.cover == "png")) return Extra(listOf("-map", "0:v:0", "-c:v", "copy", "-disposition:v:0", "attached_pic"), "")
        return Extra(emptyList(), "Cover picture left out (${fmt.uppercase()} can't hold it)")
    }

    private fun tracksNote(info: Info) = if (info.audioCodecs.size > 1) "${info.audioCodecs.size} audio tracks kept" else ""

    // ------------------------------------------------------------------ compress a video to a size
    fun compressVideo(src: File, outIn: File, s: Settings, target: Double, ctx: Ctx): Result {
        val info = probe(src)
        val vi = info.video
        if (vi == null) {
            if (info.audio != null) return compressAudio(src, outIn, s, target, ctx, info)
            throw Fail("ffmpeg could not process the file: no video")
        }
        if (info.duration <= 0) throw Fail("couldn't read the length")
        val ext = src.extLower()
        val fmt = containerFor(ext, s.videoFormat)
        if (fmt == "mp3" || fmt == "m4a") return compressAudio(src, outIn.withExt(fmt), s.with("audioFormat" to fmt), target, ctx, info, "Audio only, extracted from the video")
        val out = outIn.withExt(fmt)
        val dur = info.duration
        val totalKbps = target * 8 / dur / 1000
        val nA = max(1, info.audioCodecs.size)
        val aK = if (info.audio != null) max(32, (audioKbps(totalKbps) / Math.sqrt(nA.toDouble())).roundToInt()) else 0
        var vK = totalKbps * 0.955 - aK * (if (info.audio != null) nA else 0)
        val sub = subtitleArgs(info, fmt)
        if (vK < 50) throw Fail("target too small")
        val sz = pickSize(vi, s, vK)
        val vf = videoFilters(vi, sz)
        val webm = fmt == "webm"
        val speed = s.speed
        val passlog = File(ctx.tmp, "pass").absolutePath
        var size = 0L
        var tries = 0
        val notes = mutableListOf<String>()
        if (sz.side > 0) notes.add("${sz.side}p")
        if (sz.fps > 0) notes.add("${sz.fps.roundToInt()} fps")
        while (true) {
            val vcodec = if (webm)
                listOf("-c:v", "libvpx-vp9", "-b:v", "${vK.roundToInt()}k", "-row-mt", "1", "-deadline", "good", "-cpu-used", VP9_SPEED[speed] ?: "2", "-pix_fmt", "yuv420p")
            else
                listOf("-c:v", "libx264", "-preset", X264_PRESET[speed] ?: "medium", "-b:v", "${vK.roundToInt()}k", "-maxrate", "${(vK * 1.6).roundToInt()}k", "-bufsize", "${(vK * 2.5).roundToInt()}k", "-pix_fmt", "yuv420p")
            val base = listOf("-i", src.absolutePath, "-map", "0:V:0") + (if (vf.isNotEmpty()) listOf("-vf", vf.joinToString(",")) else emptyList()) + vcodec + listOf("-passlogfile", passlog)
            ctx.stage(if (tries > 0) "Fine-tuning size" else "Compressing")
            Ff.run(base + listOf("-pass", "1", "-an", "-f", "null", "-"), ctx, dur, 0.0, 0.45)
            val acodec = when {
                info.audio == null -> listOf("-an")
                webm -> listOf("-map", "0:a", "-c:a", "libopus", "-b:a", "${aK}k")
                else -> listOf("-map", "0:a", "-c:a", "aac", "-b:a", "${aK}k")
            }
            val cont = if (fmt == "mp4" || fmt == "mov") listOf("-movflags", "+faststart") else emptyList()
            Ff.run(base + listOf("-pass", "2") + acodec + sub.args + listOf("-map_metadata", "0") + cont + listOf(out.absolutePath), ctx, dur, 0.45, 1.0)
            size = out.length()
            if (size <= target * 1.02 || tries >= 2) break
            vK = vK * (target / size) * 0.96 - (if (tries > 0) 10 else 0)
            if (vK < 40) break
            tries++
        }
        val note = if (size > target * 1.05) "Couldn't fully reach the target without ruining quality." else ""
        return Result(out, size, listOf(if (notes.isNotEmpty()) "Resized to " + notes.joinToString(", ") else "", tracksNote(info), sub.note, note).filter { it.isNotEmpty() }.joinToString(". "))
    }

    // ------------------------------------------------------------------ convert a video (no size goal)
    private val MP4_V = listOf("h264", "hevc", "av1", "mpeg4")
    private val MP4_A = listOf("aac", "mp3", "ac3", "eac3", "alac", "opus")
    private val WEBM_V = listOf("vp8", "vp9", "av1")
    private val WEBM_A = listOf("opus", "vorbis")

    fun convertVideo(src: File, outIn: File, s: Settings, ctx: Ctx): Result {
        val info = probe(src)
        val ext = src.extLower()
        val fmt = s.videoFormat
        if (fmt == "keep" || (fmt == ext && s.resolution == "auto" && s.fps == "auto") || (fmt == "mp4" && ext == "m4v" && s.resolution == "auto")) throw Skip("same format")
        val vi = info.video
        if (vi == null) {
            if (info.audio == null) throw Fail("ffmpeg could not process the file: no streams")
            return convertAudio(src, outIn, s.with("audioFormat" to (if (fmt == "mp3" || fmt == "m4a") fmt else "m4a")), ctx, info, "No video inside, saved as M4A audio")
        }
        if (fmt == "mp3" || fmt == "m4a") {
            if (info.audio == null) throw Fail("no audio track")
            return convertAudio(src, outIn.withExt(fmt), s.with("audioFormat" to fmt), ctx, info, "Audio only, extracted from the video")
        }
        val out = outIn.withExt(fmt)
        val shortSide = min(vi.w, vi.h)
        var side = if (s.resolution == "auto") 0 else min(s.resolution.toIntOrNull() ?: 0, shortSide)
        if (side >= shortSide) side = 0
        var fps = if (s.fps == "auto") 0.0 else min(s.fps.toDoubleOrNull() ?: 0.0, vi.fps)
        if (fps > 0 && abs(fps - vi.fps) < 0.5) fps = 0.0
        val vf = videoFilters(vi, Size(side and 1.inv(), fps))
        val okV = if (fmt == "webm") WEBM_V else if (fmt == "mkv") null else MP4_V
        val okA = if (fmt == "webm") WEBM_A else if (fmt == "mkv") null else MP4_A
        val copyV = vf.isEmpty() && (okV == null || vi.codec in okV)
        val au = info.audio
        val copyA = au == null || okA == null || info.audioCodecs.all { it in okA }
        val sub = subtitleArgs(info, fmt)
        val speed = s.speed
        val v = when {
            copyV -> listOf("-c:v", "copy") + (if (vi.codec == "hevc" && fmt != "mkv") listOf("-tag:v", "hvc1") else emptyList())
            fmt == "webm" -> listOf("-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", VP9_SPEED[speed] ?: "2", "-pix_fmt", "yuv420p")
            else -> listOf("-c:v", "libx264", "-crf", if (speed == "best") "19" else "21", "-preset", X264_PRESET[speed] ?: "medium", "-pix_fmt", "yuv420p")
        }
        val a = when {
            au == null -> listOf("-an")
            copyA -> listOf("-c:a", "copy")
            fmt == "webm" -> listOf("-c:a", "libopus", "-b:a", "128k")
            else -> listOf("-c:a", "aac", "-b:a", "160k")
        }
        ctx.stage("Converting")
        Ff.run(listOf("-i", src.absolutePath, "-map", "0:V:0") + (if (au != null) listOf("-map", "0:a") else emptyList()) + sub.args +
            (if (vf.isNotEmpty()) listOf("-vf", vf.joinToString(",")) else emptyList()) + v + a + listOf("-map_metadata", "0") +
            (if (fmt == "mp4" || fmt == "mov") listOf("-movflags", "+faststart") else emptyList()) + listOf(out.absolutePath), ctx, info.duration)
        return Result(out, out.length(), listOf(if (copyV) "Not re-encoded: no quality lost" else "", tracksNote(info), sub.note).filter { it.isNotEmpty() }.joinToString(". "))
    }

    // ------------------------------------------------------------------ audio
    private fun audioCodec(fmt: String, k: Int): List<String> = when (fmt) {
        "mp3" -> listOf("-c:a", "libmp3lame", "-b:a", "${k}k", "-id3v2_version", "3")
        "m4a" -> listOf("-c:a", "aac", "-b:a", "${k}k", "-movflags", "+faststart")
        "ogg" -> listOf("-c:a", "libvorbis", "-b:a", "${k}k")
        else -> listOf("-c:a", "libopus", "-b:a", "${k}k")
    }

    private fun audioOut(ext: String, want: String): String {
        if (want != "keep") return want
        if (ext == "mp3" || ext == "ogg" || ext == "opus") return ext
        if (ext == "m4a" || ext == "aac" || ext == "m4b") return "m4a"
        return "mp3"
    }

    fun compressAudio(src: File, outIn: File, s: Settings, target: Double, ctx: Ctx, infoIn: Info? = null, noteIn: String = ""): Result {
        val info = infoIn ?: probe(src)
        val au = info.audio ?: throw Fail("no audio track")
        if (info.duration <= 0) throw Fail("couldn't read the length of this audio")
        val ext = src.extLower()
        val fmt = audioOut(ext, s.audioFormat)
        val out = outIn.withExt(fmt)
        var note = noteIn
        if (note.isEmpty() && fmt != ext && !(fmt == "m4a" && (ext == "aac" || ext == "m4b"))) note = "Saved as ${fmt.uppercase()} (from ${ext.uppercase()})"
        var k = floor(target * 8 / info.duration / 1000 * 0.97).toInt()
        val maxK = if (fmt == "opus") 256 else 320
        if (k < (if (fmt == "opus") 12 else 24)) throw Fail("target too small")
        k = min(k, maxK)
        if (info.bitrate > 0 && k >= info.bitrate && fmt == ext) throw Skip("already well compressed")
        val extra = mutableListOf<String>()
        if (k < 48 && !au.mono) extra += listOf("-ac", "1")
        if (k < 40 && fmt != "opus") extra += listOf("-ar", "22050")
        val cov = coverArgs(info, fmt)
        ctx.stage("Compressing")
        Ff.run(listOf("-i", src.absolutePath, "-map", "0:a:0") + audioCodec(fmt, k) + extra + (if (cov.args.isNotEmpty()) cov.args else listOf("-vn")) + listOf("-map_metadata", "0", out.absolutePath), ctx, info.duration)
        return Result(out, out.length(), listOf(note, cov.note).filter { it.isNotEmpty() }.joinToString(". "))
    }

    fun convertAudio(src: File, outIn: File, s: Settings, ctx: Ctx, infoIn: Info? = null, note: String = ""): Result {
        val info = infoIn ?: probe(src)
        val au = info.audio ?: throw Fail("no audio track")
        val ext = src.extLower()
        val fmt = s.audioFormat
        if (fmt == "keep" || fmt == ext || (fmt == "m4a" && ext == "aac" && info.video == null)) throw Skip("same format")
        val out = outIn.withExt(fmt)
        val codec = when (fmt) {
            "mp3" -> listOf("-c:a", "libmp3lame", "-q:a", "2", "-id3v2_version", "3")
            "m4a" -> if (au.codec == "aac") listOf("-c:a", "copy") else listOf("-c:a", "aac", "-b:a", "192k")
            "ogg" -> listOf("-c:a", "libvorbis", "-q:a", "6")
            else -> listOf("-c:a", "libopus", "-b:a", "128k")
        }
        val cov = coverArgs(info, fmt)
        ctx.stage("Converting")
        Ff.run(listOf("-i", src.absolutePath, "-map", "0:a:0") + codec + (if (cov.args.isNotEmpty()) cov.args else listOf("-vn")) + listOf("-map_metadata", "0") +
            (if (fmt == "m4a") listOf("-movflags", "+faststart") else emptyList()) + listOf(out.absolutePath), ctx, info.duration)
        return Result(out, out.length(), listOf(note, cov.note).filter { it.isNotEmpty() }.joinToString(". "))
    }
}
