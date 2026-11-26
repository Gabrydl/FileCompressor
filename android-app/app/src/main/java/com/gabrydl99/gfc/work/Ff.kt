package com.gabrydl99.gfc.work

import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** Runs the ffmpeg program that ships inside the APK (lib/<abi>/libffmpeg.so, FFmpeg 7.1 with x264, LAME, Opus, Vorbis, VPx). */
object Ff {
    @Volatile var bin: String = "ffmpeg"

    /** Runs ffmpeg and returns what it wrote on stderr. Progress goes from [from] to [to] using the length of the input. */
    fun run(args: List<String>, ctx: Ctx? = null, duration: Double = 0.0, from: Double = 0.0, to: Double = 1.0): String {
        ctx?.check()
        if (!File(bin).canExecute()) throw Fail("ffmpeg is missing")
        val pb = ProcessBuilder(listOf(bin, "-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats") + args)
        if (ctx != null) pb.directory(ctx.tmp)
        val p = try { pb.start() } catch (e: Exception) { throw Fail("ffmpeg is missing (${e.message})") }
        val err = StringBuilder()
        val tOut = thread(isDaemon = true) {
            try {
                p.inputStream.bufferedReader().forEachLine { line ->
                    if (ctx != null && duration > 0 && (line.startsWith("out_time_us=") || line.startsWith("out_time_ms="))) {
                        val us = line.substringAfter('=').trim().toLongOrNull()
                        if (us != null && us > 0) ctx.progress(from + (to - from) * minOf(1.0, us / 1e6 / duration))
                    }
                }
            } catch (_: Exception) { }
        }
        val tErr = thread(isDaemon = true) {
            try {
                val buf = CharArray(8192)
                val r = p.errorStream.bufferedReader()
                while (true) {
                    val n = r.read(buf)
                    if (n < 0) break
                    synchronized(err) {
                        err.append(buf, 0, n)
                        if (err.length > 200_000) err.delete(0, err.length - 100_000)
                    }
                }
            } catch (_: Exception) { }
        }
        while (!p.waitFor(200, TimeUnit.MILLISECONDS)) {
            if (ctx != null && ctx.aborted) { p.destroyForcibly(); p.waitFor(); break }
        }
        tOut.join(2000); tErr.join(2000)
        ctx?.check()
        val text = synchronized(err) { err.toString() }
        if (p.exitValue() != 0) {
            val lines = text.trim().split(Regex("\\r?\\n")).filter { !Regex("^\\s*(frame=|size=|Press \\[q\\])").containsMatchIn(it) }
            throw Fail("ffmpeg could not process the file: " + lines.takeLast(3).joinToString(" | "))
        }
        return text
    }

    /** What "ffmpeg -i file" prints (it always ends with an error because there is no output: that is expected). */
    fun probeText(file: File): String {
        if (!File(bin).canExecute()) throw Fail("ffmpeg is missing")
        val p = ProcessBuilder(bin, "-hide_banner", "-nostdin", "-i", file.absolutePath).redirectErrorStream(true).start()
        val out = p.inputStream.bufferedReader().readText()
        p.waitFor()
        return out
    }
}
