package com.gabrydl99.gfc.work

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Photos: the same steps as the Windows engine (desktop/engine/image.js), with Android's own encoders.
 *  Animated GIFs keep every frame (ffmpeg), they are never turned into a still picture without saying so. */
object Images {
    val IMAGE_EXT = listOf("jpg", "jpeg", "png", "webp", "heic", "heif", "avif", "bmp", "tif", "tiff", "gif", "jfif")
    private const val QUALITY_MIN = 30
    private const val QUALITY_FLOOR = 42
    private const val MIN_SIDE = 320
    private const val MAX_PIXELS = 48_000_000L

    private fun outFormat(ext: String, want: String, hasAlpha: Boolean): String {
        if (want != "keep") return want
        if (ext == "jpeg" || ext == "jfif") return "jpg"
        if (ext in listOf("jpg", "png", "webp")) return ext
        return if (hasAlpha) "png" else "jpg"   // bmp, tiff, heic, still gif, avif...
    }

    // ------------------------------------------------------------------ opening
    class Opened(val bmp: Bitmap, val w: Int, val h: Int, val reduced: Boolean)

    private fun open(srcIn: File, ctx: Ctx): Opened {
        var src = srcIn
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        src.inputStream().use { BitmapFactory.decodeStream(it, null, o) }
        if (o.outWidth <= 0 || o.outHeight <= 0) {
            // formats Android can't read itself (TIFF, some BMP...): ffmpeg turns the first page into a PNG first
            val png = File(ctx.tmp, "decoded.png")
            try { Ff.run(listOf("-i", src.absolutePath, "-frames:v", "1", "-f", "image2", "-c:v", "png", png.absolutePath), ctx) } catch (e: Skip) { throw e } catch (_: Exception) { }
            if (png.length() > 0) { src = png; o.outWidth = 0; src.inputStream().use { BitmapFactory.decodeStream(it, null, o) } }
        }
        if (o.outWidth <= 0 || o.outHeight <= 0) throw Fail("couldn't open this picture: unknown format")
        var sample = 1
        while (o.outWidth.toLong() / sample * (o.outHeight.toLong() / sample) > MAX_PIXELS) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
        val raw = try { src.inputStream().use { BitmapFactory.decodeStream(it, null, opts) } } catch (e: OutOfMemoryError) { throw Fail("Not enough memory to open this picture") }
            ?: throw Fail("couldn't open this picture")
        val rotated = applyOrientation(src, raw)
        return Opened(rotated, rotated.width, rotated.height, sample > 1)
    }

    /** Turns the pixels the way the camera says (EXIF), so dropping EXIF never turns a photo sideways. */
    private fun applyOrientation(src: File, bmp: Bitmap): Bitmap {
        val ori = try { ExifInterface(src.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) } catch (_: Exception) { ExifInterface.ORIENTATION_NORMAL }
        val m = Matrix()
        when (ori) {
            ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { m.postRotate(90f); m.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_TRANSVERSE -> { m.postRotate(270f); m.postScale(-1f, 1f) }
            else -> return bmp
        }
        val r = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        if (r !== bmp) bmp.recycle()
        return r
    }

    // ------------------------------------------------------------------ encoding
    /** Smaller copy, halving first for big steps so the picture stays sharp. */
    fun scaled(src: Bitmap, w: Int, h: Int): Bitmap {
        var cur = src
        while (cur.width / 2 >= w && cur.height / 2 >= h) {
            val n = Bitmap.createScaledBitmap(cur, cur.width / 2, cur.height / 2, true)
            if (cur !== src) cur.recycle()
            cur = n
        }
        if (cur.width == w && cur.height == h) return if (cur === src) src.copy(src.config ?: Bitmap.Config.ARGB_8888, false) else cur
        val n = Bitmap.createScaledBitmap(cur, max(1, w), max(1, h), true)
        if (cur !== src) cur.recycle()
        return n
    }

    fun flattenWhite(b: Bitmap): Bitmap {
        val out = Bitmap.createBitmap(b.width, b.height, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        c.drawColor(Color.WHITE)
        c.drawBitmap(b, 0f, 0f, Paint(Paint.FILTER_BITMAP_FLAG))
        return out
    }

    @Suppress("DEPRECATION")
    fun encode(b: Bitmap, fmt: String, q: Int): ByteArray {
        val bos = ByteArrayOutputStream()
        when (fmt) {
            "jpg" -> { val f = if (b.hasAlpha()) flattenWhite(b) else b; f.compress(Bitmap.CompressFormat.JPEG, q, bos); if (f !== b) f.recycle() }
            "webp" -> b.compress(if (Build.VERSION.SDK_INT >= 30) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP, q, bos)
            "png" -> b.compress(Bitmap.CompressFormat.PNG, 100, bos)
            else -> throw Fail("unknown format $fmt")
        }
        return bos.toByteArray()
    }

    /** PNG with at most 256 colours (like the palette PNG of the Windows app), made by ffmpeg. */
    private fun palettePng(b: Bitmap, ctx: Ctx): ByteArray? {
        return try {
            val inp = File(ctx.tmp, "pal_in.png")
            val out = File(ctx.tmp, "pal_out.png")
            inp.writeBytes(encode(b, "png", 100))
            Ff.run(listOf("-i", inp.absolutePath, "-filter_complex", "[0:v]split[a][b];[a]palettegen=max_colors=256:reserve_transparent=1[p];[b][p]paletteuse=dither=sierra2_4a:alpha_threshold=128",
                "-frames:v", "1", "-f", "image2", "-c:v", "png", out.absolutePath), ctx)
            val r = out.readBytes()
            inp.delete(); out.delete()
            r
        } catch (e: Skip) { throw e } catch (_: Exception) { null }
    }

    private class Best(val buf: ByteArray, val scale: Double, val palette: Boolean = false)

    // ------------------------------------------------------------------ compress to a size
    fun compress(src: File, outIn: File, s: Settings, target: Double, ctx: Ctx): Result {
        val ext = src.extLower()
        val notesPre = mutableListOf<String>()
        if (ext == "gif") {
            val g = Gif.info(src)
            if (g != null && g.frames > 1) {
                val want = s.imageFormat
                // an animation stays an animation, also when a preset (Discord, WhatsApp...) asks for JPG photos
                val why = when (want) {
                    "keep", "gif" -> ""
                    "webp" -> "Kept as GIF: the phone can't make animated WebP"
                    else -> "Animation kept as GIF (${g.frames} frames): ${want.uppercase()} can't hold an animation"
                }
                return Gif.compress(src, outIn.withExt("gif"), target, ctx, g, why)
            }
        }
        if (ext == "webp" && Gif.isAnimatedWebp(src)) throw Skip("Animated WebP: the phone can't re-compress it without losing the animation, left untouched")
        if (ext == "tif" || ext == "tiff") { val n = tiffPages(src); if (n > 1) throw Skip("Multi-page TIFF ($n pages): the phone could save only the first page, left untouched") }
        val o = open(src, ctx)
        try {
            val fmt = outFormat(ext, s.imageFormat, o.bmp.hasAlpha())
            val out = outIn.withExt(fmt)
            val orig = src.length()
            ctx.stage("Compressing")
            var best: Best? = null
            var scale = 1.0
            var palette = false
            var round = 0
            fun render(q: Int, sc: Double, pal: Boolean): ByteArray {
                ctx.check()
                val w = max(1, (o.w * sc).roundToInt()); val h = max(1, (o.h * sc).roundToInt())
                val b = if (sc < 1) scaled(o.bmp, w, h) else o.bmp
                try {
                    if (fmt == "png" && pal) return palettePng(b, ctx) ?: encode(b, "png", 100)
                    return encode(b, fmt, q)
                } finally { if (b !== o.bmp) b.recycle() }
            }
            while (round < 12) {
                ctx.check()
                if (fmt == "png") {
                    val buf = render(100, scale, palette)
                    if (best == null || buf.size < best.buf.size) best = Best(buf, scale, palette)
                    if (buf.size <= target) break
                    if (!palette) { palette = true; round++; continue }
                } else {
                    var lo = QUALITY_MIN; var hi = 88
                    var fit: Pair<ByteArray, Int>? = null
                    val top = render(hi, scale, false)
                    if (top.size <= target) fit = top to hi
                    else {
                        while (hi - lo > 3) {
                            val mid = (lo + hi) shr 1
                            val buf = render(mid, scale, false)
                            if (buf.size <= target) { fit = buf to mid; lo = mid } else hi = mid
                            ctx.progress(min(0.95, 0.1 + round * 0.08))
                        }
                    }
                    if (fit != null && (fit.second >= QUALITY_FLOOR || scale * max(o.w, o.h) <= MIN_SIDE)) { best = Best(fit.first, scale); break }
                    val low = fit?.first ?: render(QUALITY_MIN, scale, false)
                    if (best == null || low.size < best.buf.size) best = Best(low, scale)
                }
                // still too big at an acceptable quality: make the picture smaller
                val ratio = target / best!!.buf.size
                val next = scale * max(0.5, min(0.92, sqrt(ratio) * 1.05))
                if (next * max(o.w, o.h) < MIN_SIDE) break
                scale = next
                ctx.progress(min(0.95, 0.15 + round * 0.08))
                round++
            }
            val b = best!!
            val sameFmt = fmt == (if (ext == "jpeg" || ext == "jfif") "jpg" else ext)
            if (b.buf.size >= orig && sameFmt && notesPre.isEmpty()) throw Skip("already well compressed")
            out.writeBytes(b.buf)
            copyExif(src, out, fmt)
            val notes = notesPre.toMutableList()
            if (o.reduced) notes.add("Very large picture: opened at a lower size")
            if (b.palette) notes.add("Reduced to 256 colors")
            if (b.scale < 1) notes.add("Resized to ${(o.w * b.scale).roundToInt()}×${(o.h * b.scale).roundToInt()}")
            if (b.buf.size > target * 1.05) notes.add("Couldn't fully reach the target without ruining the picture")
            return Result(out, b.buf.size.toLong(), notes.joinToString(", "))
        } finally { o.bmp.recycle() }
    }

    fun convert(src: File, outIn: File, s: Settings, ctx: Ctx): Result {
        val ext = src.extLower()
        val same = s.imageFormat == "keep" || s.imageFormat == (if (ext == "jpeg") "jpg" else ext)
        if (same) throw Skip("same format")
        if (ext == "gif") { val g = Gif.info(src); if (g != null && g.frames > 1) throw Skip("Animated GIF: converting it to a photo format would keep only one frame, left untouched") }
        if (ext == "webp" && Gif.isAnimatedWebp(src)) throw Skip("Animated WebP: left untouched")
        if (ext == "tif" || ext == "tiff") { val n = tiffPages(src); if (n > 1) throw Skip("Multi-page TIFF ($n pages): ${s.imageFormat.uppercase()} would keep only the first page, left untouched") }
        val o = open(src, ctx)
        try {
            val want = outFormat(ext, s.imageFormat, o.bmp.hasAlpha())
            val out = outIn.withExt(want)
            ctx.stage("Converting")
            out.writeBytes(encode(o.bmp, want, if (want == "webp") 85 else 92))
            copyExif(src, out, want)
            return Result(out, out.length(), if (o.reduced) "Very large picture: opened at a lower size" else "")
        } finally { o.bmp.recycle() }
    }

    /** Keeps date, camera and place like the Windows app does (the picture is already turned upright). */
    private fun copyExif(src: File, out: File, fmt: String) {
        if (fmt != "jpg" && fmt != "webp" && fmt != "png") return
        try {
            val a = ExifInterface(src.absolutePath)
            val b = ExifInterface(out.absolutePath)
            var any = false
            for (t in EXIF_TAGS) { val v = a.getAttribute(t); if (v != null) { b.setAttribute(t, v); any = true } }
            if (!any) return
            b.setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL.toString())
            b.saveAttributes()
        } catch (_: Exception) { /* the picture is fine without it */ }
    }

    private val EXIF_TAGS = listOf(
        ExifInterface.TAG_DATETIME, ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_DATETIME_DIGITIZED,
        ExifInterface.TAG_OFFSET_TIME, ExifInterface.TAG_OFFSET_TIME_ORIGINAL, ExifInterface.TAG_SUBSEC_TIME_ORIGINAL,
        ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL, ExifInterface.TAG_SOFTWARE, ExifInterface.TAG_ARTIST, ExifInterface.TAG_COPYRIGHT,
        ExifInterface.TAG_F_NUMBER, ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY, ExifInterface.TAG_FOCAL_LENGTH,
        ExifInterface.TAG_FOCAL_LENGTH_IN_35MM_FILM, ExifInterface.TAG_FLASH, ExifInterface.TAG_WHITE_BALANCE, ExifInterface.TAG_LENS_MODEL,
        ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE, ExifInterface.TAG_GPS_LONGITUDE_REF,
        ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF, ExifInterface.TAG_GPS_TIMESTAMP, ExifInterface.TAG_GPS_DATESTAMP,
        ExifInterface.TAG_IMAGE_DESCRIPTION, ExifInterface.TAG_USER_COMMENT,
    )

    /** How many pages a TIFF has (walks the chain of IFDs, nothing is decoded). */
    fun tiffPages(src: File): Int {
        return try {
            java.io.RandomAccessFile(src, "r").use { f ->
                val h = ByteArray(8)
                f.readFully(h)
                val le = h[0] == 'I'.code.toByte() && h[1] == 'I'.code.toByte()
                if (!le && !(h[0] == 'M'.code.toByte() && h[1] == 'M'.code.toByte())) return 1
                fun u16(b: ByteArray, p: Int) = if (le) (b[p].toInt() and 255) or ((b[p + 1].toInt() and 255) shl 8) else ((b[p].toInt() and 255) shl 8) or (b[p + 1].toInt() and 255)
                fun u32(b: ByteArray, p: Int): Long = if (le) (u16(b, p).toLong() or (u16(b, p + 2).toLong() shl 16)) else ((u16(b, p).toLong() shl 16) or u16(b, p + 2).toLong())
                if (u16(h, 2) != 42) return 1   // BigTIFF and others: treated as one page
                var off = u32(h, 4)
                var n = 0
                val len = f.length()
                val seen = HashSet<Long>()
                while (off in 8 until len && n < 10000) {
                    n++
                    f.seek(off)
                    val c = ByteArray(2); f.readFully(c)
                    val entries = u16(c, 0)
                    f.seek(off + 2 + entries * 12L)
                    val nx = ByteArray(4); if (f.read(nx) < 4) break
                    val next = u32(nx, 0)
                    if (next == 0L || !seen.add(next)) break
                    off = next
                }
                maxOf(1, n)
            }
        } catch (_: Exception) { 1 }
    }

    /** Used by the Office engine: re-encode one embedded picture. Returns null if it can't be read. */
    fun shrinkBytes(buf: ByteArray, maxDim: Int, quality: Int, keepPng: Boolean): Pair<ByteArray, String>? {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(buf, 0, buf.size, o)
        if (o.outWidth <= 0) return null
        var sample = 1
        while (o.outWidth / (sample * 2) >= maxDim && o.outHeight / (sample * 2) >= 1) sample *= 2
        val bmp = BitmapFactory.decodeByteArray(buf, 0, buf.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        try {
            val s = min(1.0, maxDim.toDouble() / max(bmp.width, bmp.height))
            val b = if (s < 1) scaled(bmp, max(1, (bmp.width * s).roundToInt()), max(1, (bmp.height * s).roundToInt())) else bmp
            try {
                return if (keepPng || b.hasAlpha()) encode(b, "png", 100) to "png" else encode(b, "jpg", quality) to "jpg"
            } finally { if (b !== bmp) b.recycle() }
        } finally { bmp.recycle() }
    }
}

/** Animated GIFs (and a check for animated WebP). */
object Gif {
    class Info(val frames: Int, val w: Int, val h: Int)

    /** Counts the frames by walking the GIF blocks (nothing is decoded). */
    fun info(f: File): Info? = try {
        f.inputStream().buffered(1 shl 16).use { inp ->
            val head = ByteArray(13)
            if (inp.readN(head) < 13 || String(head, 0, 4, Charsets.ISO_8859_1) != "GIF8") return null
            val w = (head[6].toInt() and 255) or ((head[7].toInt() and 255) shl 8)
            val h = (head[8].toInt() and 255) or ((head[9].toInt() and 255) shl 8)
            val flags = head[10].toInt() and 255
            if (flags and 0x80 != 0) inp.skipN(3L * (1 shl ((flags and 7) + 1)))
            var frames = 0
            loop@ while (true) {
                when (inp.read()) {
                    0x21 -> { inp.read(); skipSubBlocks(inp) }
                    0x2C -> {
                        frames++
                        val d = ByteArray(9)
                        if (inp.readN(d) < 9) break@loop
                        val lf = d[8].toInt() and 255
                        if (lf and 0x80 != 0) inp.skipN(3L * (1 shl ((lf and 7) + 1)))
                        inp.read()
                        skipSubBlocks(inp)
                    }
                    else -> break@loop   // 0x3B (end) or a broken file
                }
            }
            Info(frames, w, h)
        }
    } catch (_: Exception) { null }

    private fun skipSubBlocks(inp: InputStream) {
        while (true) {
            val n = inp.read()
            if (n <= 0) return
            inp.skipN(n.toLong())
        }
    }
    private fun InputStream.readN(b: ByteArray): Int {
        var k = 0
        while (k < b.size) { val n = read(b, k, b.size - k); if (n < 0) break; k += n }
        return k
    }
    private fun InputStream.skipN(n: Long) {
        var left = n
        while (left > 0) {
            val k = skip(left)
            if (k <= 0) { if (read() < 0) return; left-- } else left -= k
        }
    }

    fun isAnimatedWebp(f: File): Boolean = try {
        f.inputStream().use { inp ->
            val b = ByteArray(64)
            val n = inp.read(b)
            n >= 21 && String(b, 0, 4, Charsets.ISO_8859_1) == "RIFF" && String(b, 8, 4, Charsets.ISO_8859_1) == "WEBP" &&
                String(b, 12, 4, Charsets.ISO_8859_1) == "VP8X" && (b[20].toInt() and 0x02) != 0
        }
    } catch (_: Exception) { false }

    // quality steps, best first: fewer colours, coarser dithering and some temporal smoothing (film grain makes every
    // pixel change from frame to frame, which GIF stores badly) give smaller files; frames are never dropped
    private class Step(val colors: Int, val dither: String, val denoise: String)
    private val STEPS = listOf(
        Step(256, "sierra2_4a", ""), Step(256, "sierra2_4a", "hqdn3d=0:0:4:4,"), Step(224, "bayer:bayer_scale=5", "hqdn3d=0:0:6:6,"),
        Step(192, "bayer:bayer_scale=4", "hqdn3d=1:1:6:6,"), Step(160, "bayer:bayer_scale=3", "hqdn3d=1:1:8:8,"), Step(128, "bayer:bayer_scale=3", "hqdn3d=2:2:8:8,"),
        Step(96, "bayer:bayer_scale=2", "hqdn3d=2:2:10:10,"), Step(64, "bayer:bayer_scale=2", "hqdn3d=3:3:12:12,"),
    )

    private class Try(val file: File, val size: Long, val step: Int, val scale: Double)

    fun compress(src: File, out: File, target: Double, ctx: Ctx, g: Info, noteIn: String): Result {
        val orig = src.length()
        val dur = try { Media.probe(src).duration } catch (_: Exception) { 0.0 }
        ctx.stage("Compressing ${g.frames} frames")
        var n = 0
        fun render(step: Int, scale: Double, from: Double, to: Double): Try {
            val st = STEPS[step]
            val f = File(ctx.tmp, "try${n++}.gif")
            val sc = if (scale < 1) "scale=${max(2, (g.w * scale).roundToInt())}:${max(2, (g.h * scale).roundToInt())}:flags=lanczos," else ""
            Ff.run(listOf("-i", src.absolutePath, "-filter_complex",
                "[0:v]${sc}${st.denoise}split[a][b];[a]palettegen=max_colors=${st.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=${st.dither}:diff_mode=rectangle",
                "-f", "gif", f.absolutePath), ctx, dur, from, to)
            return Try(f, f.length(), step, scale)
        }
        var best: Try? = null
        var scale = 1.0
        var work = 0
        fun span(): Pair<Double, Double> { val a = min(0.9, 0.05 + 0.08 * work); work++; return a to min(0.95, a + 0.08) }
        for (round in 0 until 6) {
            // best quality step that fits, by halving the list of steps
            var lo = 0; var hi = STEPS.size - 1
            var fit: Try? = null; var smallest: Try? = null
            while (lo <= hi) {
                ctx.check()
                val mid = (lo + hi) / 2
                val (a, b) = span()
                val t = render(mid, scale, a, b)
                if (t.size <= target) { fit?.file?.delete(); fit = t; hi = mid - 1 }
                else { if (smallest == null || t.size < smallest.size) { smallest?.file?.delete(); smallest = t } else t.file.delete(); lo = mid + 1 }
            }
            if (fit != null) { smallest?.file?.delete(); best?.file?.delete(); best = fit; break }
            if (smallest == null) break
            if (best == null || smallest.size < best.size) { best?.file?.delete(); best = smallest } else smallest.file.delete()
            // even the strongest step is too big: make the frames smaller and try again
            val next = scale * max(0.5, min(0.92, sqrt(target / best!!.size) * 1.05))
            if (next * max(g.w, g.h) < 160) break
            scale = next
        }
        val b = best ?: throw Fail("ffmpeg could not process the file: no frames")
        if (b.size >= orig) throw Skip("already well compressed")
        b.file.renameTo(out)
        val notes = mutableListOf("Animation kept (${g.frames} frames)")
        if (noteIn.isNotEmpty()) notes.add(noteIn)
        if (b.scale < 1) notes.add("Resized to ${(g.w * b.scale).roundToInt()}×${(g.h * b.scale).roundToInt()}")
        if (b.size > target * 1.05) notes.add("Couldn't fully reach the target without ruining the animation")
        return Result(out, out.length(), notes.joinToString(", "))
    }
}
