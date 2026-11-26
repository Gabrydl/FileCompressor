package com.gabrydl99.gfc.work

import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

/** Word, PowerPoint and Excel (.docx .pptx .xlsx): the pictures inside are re-compressed and the file is zipped tighter
 *  (same plan as desktop/engine/office.js). */
object Office {
    val OFFICE_EXT = listOf("docx", "pptx", "xlsx", "docm", "pptm", "xlsm")
    private val PICTURE = Regex("""\.(jpe?g|png|bmp|tiff?)$""", RegexOption.IGNORE_CASE)
    private val MEDIA = Regex("""\.(mp4|mov|m4v|wmv|avi|mp3|m4a|wav|wma)$""", RegexOption.IGNORE_CASE)
    private val LADDER = listOf(2200 to 80, 1800 to 72, 1500 to 64, 1250 to 56, 1000 to 48, 800 to 40)

    private class Built(val file: File, val count: Int, val media: Boolean)

    private fun build(src: File, out: File, maxDim: Int, quality: Int, ctx: Ctx): Built {
        val zip = try { ZipFile(src) } catch (_: Exception) { throw Fail("This file isn't a valid Office document (or it's password-protected).") }
        zip.use { z ->
            if (z.getEntry("[Content_Types].xml") == null) throw Fail("This file isn't a valid Office document.")
            val names = z.entries().toList().map { it.name }
            // a digital signature stays valid only if not a single byte changes: such files are left alone
            if (names.any { it.startsWith("_xmlsignatures/", ignoreCase = true) && !it.endsWith("/") }) throw Skip("signed")
            val replaced = HashMap<String, Pair<String, ByteArray>>()   // old name -> (new name, bytes)
            val renames = LinkedHashMap<String, String>()                // file name -> new file name
            var count = 0
            var media = false
            for (name in names) {
                ctx.check()
                if (name.endsWith("/") || !name.contains("/media/")) continue
                if (MEDIA.containsMatchIn(name)) { media = true; continue }
                if (!PICTURE.containsMatchIn(name) || maxDim == 0) continue
                val e = z.getEntry(name)
                if (e.size in 0 until 40000) continue
                val buf = z.getInputStream(e).use { it.readBytes() }
                if (buf.size < 40000) continue
                val r = try { Images.shrinkBytes(buf, maxDim, quality, false) } catch (_: Throwable) { null } ?: continue
                if (r.first.size >= buf.size * 0.92) continue
                val isJpg = Regex("""\.jpe?g$""", RegexOption.IGNORE_CASE).containsMatchIn(name)
                if (r.second == "jpg" && !isJpg) {
                    // a big photo saved as PNG/BMP/TIFF: store it as JPEG and point the document to the new name
                    val nn = name.replace(Regex("""\.[^.]+$"""), ".jpeg")
                    if (nn in names) continue
                    replaced[name] = nn to r.first
                    renames[name.substringAfterLast('/')] = nn.substringAfterLast('/')
                } else if (r.second == "png" && isJpg) continue
                else replaced[name] = name to r.first
                count++
            }
            ZipOutputStream(out.outputStream().buffered(1 shl 16)).use { zo ->
                zo.setLevel(9)
                for (name in names) {
                    ctx.check()
                    val e = z.getEntry(name)
                    val rep = replaced[name]
                    var data: ByteArray? = null
                    var outName = name
                    if (rep != null) { outName = rep.first; data = rep.second }
                    else if (renames.isNotEmpty() && name.endsWith(".rels")) {
                        var x = z.getInputStream(e).use { it.readBytes() }.toString(Charsets.UTF_8)
                        for ((a, b) in renames) x = x.replace("/$a\"", "/$b\"").replace("\"$a\"", "\"$b\"").replace("media/$a", "media/$b")
                        data = x.toByteArray(Charsets.UTF_8)
                    } else if (renames.isNotEmpty() && name == "[Content_Types].xml") {
                        var ct = z.getInputStream(e).use { it.readBytes() }.toString(Charsets.UTF_8)
                        if (!Regex("""Extension="jpeg"""", RegexOption.IGNORE_CASE).containsMatchIn(ct)) ct = ct.replace("</Types>", "<Default Extension=\"jpeg\" ContentType=\"image/jpeg\"/></Types>")
                        data = ct.toByteArray(Charsets.UTF_8)
                    }
                    zo.putNextEntry(ZipEntry(outName))
                    if (data != null) zo.write(data) else if (!e.isDirectory) z.getInputStream(e).use { it.copyTo(zo) }
                    zo.closeEntry()
                }
            }
            return Built(out, count, media)
        }
    }

    fun compress(src: File, out: File, s: Settings, target: Double, ctx: Ctx): Result {
        val orig = src.length()
        ctx.stage("Compressing pictures")
        var best: Built? = null
        for ((k, step) in LADDER.withIndex()) {
            val r = build(src, File(ctx.tmp, "o$k.${src.extLower()}"), step.first, step.second, ctx)
            val size = r.file.length()
            val b = best
            if (b == null || size < b.file.length()) { b?.file?.delete(); best = r } else r.file.delete()
            ctx.progress((k + 1).toDouble() / LADDER.size)
            if (size <= target || r.count == 0) break
        }
        val b = best!!
        if (b.file.length() >= orig * 0.99) throw Skip(if (b.count > 0) "already well compressed" else "There are no pictures inside to compress.")
        b.file.renameTo(out)
        val notes = mutableListOf<String>()
        if (out.length() > target * 1.05) notes.add("Couldn't fully reach the target without ruining the pictures.")
        if (b.media) notes.add("Videos/audio embedded in the file were left as they are.")
        return Result(out, out.length(), notes.joinToString(" "))
    }
}
