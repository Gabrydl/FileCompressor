package com.gabrydl99.gfc.work

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.tom_roush.pdfbox.cos.COSBase
import com.tom_roush.pdfbox.cos.COSDictionary
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.cos.COSStream
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.PDResources
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.pdmodel.graphics.form.PDFormXObject
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDSignatureField
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.IdentityHashMap
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** PDFs, with PdfBox: the same plan as the Windows engine (desktop/engine/pdf.js).
 *  Lossless first (metadata, thumbnails, attachments, uncompressed streams), then photos step by step until it fits. */
object Pdf {
    // tried in order until the file fits the target
    private val LADDER = listOf(2200 to 82, 1800 to 74, 1500 to 66, 1250 to 58, 1050 to 50, 850 to 42, 700 to 35)
    private val PAGE_LADDER = listOf(150 to 72, 130 to 64, 110 to 56, 96 to 50, 80 to 44, 72 to 38)

    private fun load(src: File): PDDocument {
        val doc = try { PDDocument.load(src, MemoryUsageSetting.setupTempFileOnly()) }
        catch (e: InvalidPasswordException) { throw Fail("This PDF is password-protected.") }
        catch (e: OutOfMemoryError) { throw Fail("Not enough memory to open this PDF") }
        catch (e: Exception) { throw Fail("Couldn't open this PDF (" + (e.message ?: e.javaClass.simpleName) + ")") }
        if (doc.isEncrypted) { doc.close(); throw Skip("protected") }
        return doc
    }

    private class Inspect(val form: Boolean, val signed: Boolean, val photos: Int)

    private fun inspect(doc: PDDocument): Inspect {
        var form = false; var signed = false
        try {
            val af = doc.documentCatalog.acroForm
            if (af != null) {
                val flags = af.cosObject.getInt(COSName.SIG_FLAGS, 0)
                if (flags and 2 == 2) signed = true
                for (f in af.fieldTree) {
                    form = true
                    if (f is PDSignatureField && f.value != null) signed = true
                }
            }
            if (doc.signatureDictionaries.isNotEmpty()) signed = true
        } catch (_: Exception) { }
        var photos = 0
        walkImages(doc) { img -> if (isPhoto(img)) photos++; null }
        return Inspect(form, signed, photos)
    }

    private fun rawLen(img: PDImageXObject): Long = try { img.cosObject.length } catch (_: Exception) { 0L }

    private fun isPhoto(img: PDImageXObject): Boolean {
        return try {
            if (img.isStencil) return false
            if (img.bitsPerComponent in 1..7) return false
            val suf = img.suffix ?: ""
            if (suf == "jb2" || suf == "tiff") return false   // black & white scans: already tiny
            val len = rawLen(img)
            if (len < 30000) return false
            val big = img.width.toLong() * img.height >= 300000
            suf == "jpg" || suf == "jpx" || big
        } catch (_: Exception) { false }
    }

    /** Calls [f] once for every picture in the pages (and the forms inside them); a picture it returns replaces the old one everywhere. */
    private fun walkImages(doc: PDDocument, f: (PDImageXObject) -> PDImageXObject?): Int {
        val done = IdentityHashMap<COSBase, PDImageXObject?>()
        val forms = IdentityHashMap<COSBase, Boolean>()
        var count = 0
        fun walk(res: PDResources?, depth: Int) {
            if (res == null) return
            val names = try { res.xObjectNames.toList() } catch (_: Exception) { return }
            for (name in names) {
                val x = try { res.getXObject(name) } catch (_: Exception) { null } ?: continue
                if (x is PDImageXObject) {
                    val key: COSBase = x.cosObject
                    if (done.containsKey(key)) { done[key]?.let { res.put(name, it) }; continue }
                    val n = try { f(x) } catch (e: Skip) { throw e } catch (_: Exception) { null } catch (_: OutOfMemoryError) { null }
                    done[key] = n
                    if (n != null) { res.put(name, n); count++ }
                } else if (x is PDFormXObject && depth < 6 && forms.put(x.cosObject, true) == null) {
                    walk(x.resources, depth + 1)
                }
            }
        }
        for (page in doc.pages) walk(page.resources, 0)
        return count
    }

    /** Lossless clean-up: nothing visible changes. */
    private fun cleanup(doc: PDDocument, meta: Boolean, extras: Boolean): List<String> {
        val done = mutableListOf<String>()
        if (meta) try {
            val trailer = doc.document.trailer
            val info = trailer.getDictionaryObject(COSName.INFO) as? COSDictionary
            if (info != null && info.size() > 0) { trailer.removeItem(COSName.INFO); done.add("metadata removed") }
            val root = doc.documentCatalog.cosObject
            if (root.containsKey(COSName.METADATA)) { root.removeItem(COSName.METADATA); if ("metadata removed" !in done) done.add("metadata removed") }
            root.removeItem(COSName.getPDFName("PieceInfo"))
        } catch (_: Exception) { }
        var thumbs = 0
        if (extras) try {
            for (p in doc.pages) {
                val d = p.cosObject
                if (d.containsKey(COSName.getPDFName("Thumb"))) { d.removeItem(COSName.getPDFName("Thumb")); thumbs++ }
                d.removeItem(COSName.getPDFName("PieceInfo"))
            }
        } catch (_: Exception) { }
        if (thumbs > 0) done.add("thumbnails removed")
        if (extras) try {
            val names = doc.documentCatalog.cosObject.getDictionaryObject(COSName.NAMES) as? COSDictionary
            if (names != null && names.containsKey(COSName.EMBEDDED_FILES)) { names.removeItem(COSName.EMBEDDED_FILES); done.add("attachments removed") }
        } catch (_: Exception) { }
        // streams saved without any compression: packed with Flate (lossless)
        try {
            for (o in doc.document.objects) {
                val s = o.getObject() as? COSStream ?: continue
                if (s.filters != null) continue
                val type = s.getDictionaryObject(COSName.TYPE)
                if (type == COSName.XREF || type == COSName.OBJ_STM) continue
                if (s.length < 256) continue
                val data = s.createInputStream().use { it.readBytes() }
                s.createOutputStream(COSName.FLATE_DECODE).use { it.write(data) }
            }
        } catch (_: Exception) { }
        return done
    }

    private fun shrink(doc: PDDocument, img: PDImageXObject, maxDim: Int, quality: Int, gray: Boolean = false): PDImageXObject? {
        if (!isPhoto(img) && !(gray && !img.isStencil && img.width.toLong() * img.height >= 4096)) return null
        val c = img.cosObject
        if (c.containsKey(COSName.SMASK) || c.containsKey(COSName.MASK)) return null
        val raw = rawLen(img)
        val bmp = img.image ?: return null
        try {
            val s = min(1.0, maxDim.toDouble() / max(bmp.width, bmp.height))
            val b1 = if (s < 1) Images.scaled(bmp, max(1, (bmp.width * s).roundToInt()), max(1, (bmp.height * s).roundToInt())) else bmp
            val b2 = if (gray) grayOf(b1) else if (b1.hasAlpha()) Images.flattenWhite(b1) else b1
            try {
                val n = JPEGFactory.createFromImage(doc, b2, quality / 100f)
                if (n.cosObject.length > raw * 0.9 && !gray) return null
                return n
            } finally {
                if (b2 !== b1) b2.recycle()
                if (b1 !== bmp) b1.recycle()
            }
        } finally { bmp.recycle() }
    }

    /** The picture in shades of grey, on white. */
    private fun grayOf(b: Bitmap): Bitmap {
        val out = Bitmap.createBitmap(b.width, b.height, Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(out)
        c.drawColor(Color.WHITE)
        val p = android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG)
        p.colorFilter = android.graphics.ColorMatrixColorFilter(android.graphics.ColorMatrix().apply { setSaturation(0f) })
        c.drawBitmap(b, 0f, 0f, p)
        return out
    }

    private class Built(val file: File, val count: Int, val done: List<String>)

    private fun build(src: File, out: File, pic: Pair<Int, Int>?, ctx: Ctx, s: Settings): Built {
        val doc = load(src)
        try {
            val done = cleanup(doc, s.pdfMeta, s.pdfExtras)
            var count = 0
            val photos = pic != null && s.pdfPhotos
            if (photos || s.pdfGray) count = walkImages(doc) { img -> ctx.check(); shrink(doc, img, if (photos) pic!!.first else 99999, if (photos) pic!!.second else 85, s.pdfGray) }
            doc.save(out)
            return Built(out, count, done)
        } finally { doc.close() }
    }

    /** Every page becomes one JPEG picture (smallest for scans; text is no longer selectable). */
    private fun asPictures(src: File, out: File, dpi: Int, quality: Int, ctx: Ctx, gray: Boolean = false) {
        val pfd = ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY)
        val r = try { PdfRenderer(pfd) } catch (e: Exception) { pfd.close(); throw Fail("Couldn't open this PDF (" + e.message + ")") }
        val doc = PDDocument()
        try {
            for (i in 0 until r.pageCount) {
                ctx.check()
                val page = r.openPage(i)
                val wPt = page.width; val hPt = page.height
                val bmp = Bitmap.createBitmap(max(1, wPt * dpi / 72), max(1, hPt * dpi / 72), Bitmap.Config.ARGB_8888)
                bmp.eraseColor(Color.WHITE)
                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                page.close()
                val bos = ByteArrayOutputStream()
                val pic = if (gray) grayOf(bmp) else bmp
                pic.compress(Bitmap.CompressFormat.JPEG, quality, bos)
                if (pic !== bmp) pic.recycle()
                bmp.recycle()
                val pg = PDPage(PDRectangle(wPt.toFloat(), hPt.toFloat()))
                doc.addPage(pg)
                val img = JPEGFactory.createFromByteArray(doc, bos.toByteArray())
                PDPageContentStream(doc, pg).use { it.drawImage(img, 0f, 0f, wPt.toFloat(), hPt.toFloat()) }
            }
            doc.save(out)
        } finally { doc.close(); r.close(); pfd.close() }
    }

    fun compress(src: File, out: File, s: Settings, target: Double, ctx: Ctx): Result {
        val orig = src.length()
        ctx.stage("Reading the PDF")
        val info = load(src).let { d -> try { inspect(d) } finally { d.close() } }
        if (info.signed) throw Skip("signed")
        var bestFile: File? = null
        var bestCount = 0
        var bestDone = listOf<String>()
        var k = 0
        fun keep(f: File, count: Int, done: List<String>) {
            val b = bestFile
            if (b == null || f.length() < b.length()) { if (b != null && b != f) b.delete(); bestFile = f; bestCount = count; bestDone = done }
            else if (f != b) f.delete()
        }
        if (s.pdfAsPictures) {
            ctx.stage("Rebuilding pages as pictures")
            for ((i, step) in PAGE_LADDER.withIndex()) {
                ctx.check()
                val f = File(ctx.tmp, "p${k++}.pdf")
                asPictures(src, f, step.first, step.second, ctx, s.pdfGray)
                keep(f, 1, listOf("pages as pictures"))
                ctx.progress((i + 1).toDouble() / PAGE_LADDER.size)
                if (f.exists() && f.length() <= target) break
            }
        } else {
            // 1) lossless: never changes how the pages look
            ctx.stage("Cleaning up (no quality loss)")
            val b0 = build(src, File(ctx.tmp, "p${k++}.pdf"), null, ctx, s)
            keep(b0.file, b0.count, b0.done)
            ctx.progress(0.15)
            // 2) photos, step by step, only when still above the target
            if (info.photos > 0 && s.pdfPhotos && bestFile!!.length() > target) {
                ctx.stage("Compressing photos")
                for ((i, step) in LADDER.withIndex()) {
                    ctx.check()
                    val r = build(src, File(ctx.tmp, "p${k++}.pdf"), step, ctx, s)
                    val size = r.file.length()
                    keep(r.file, r.count, r.done)
                    ctx.progress(0.15 + 0.85 * (i + 1) / LADDER.size)
                    if (size <= target || r.count == 0) break
                }
            }
        }
        val best = bestFile ?: throw Fail("Couldn't open this PDF")
        if (best.length() >= orig * 0.995 && !s.pdfGray) throw Skip("already well compressed")
        best.renameTo(out)
        val size = out.length()
        val notes = mutableListOf<String>()
        val lossless = !s.pdfAsPictures && bestCount == 0 && !s.pdfGray
        if (s.pdfGray) notes.add("Black and white")
        if (lossless) notes.add("No quality lost" + if (bestDone.isNotEmpty()) ": " + bestDone.joinToString(", ") else "")
        if (size > target * 1.05) notes.add(if (info.photos > 0 || s.pdfAsPictures) "Couldn't fully reach the target without ruining the pictures" else "Text-only PDF: this is as small as it gets without quality loss")
        return Result(out, size, notes.joinToString(". "))
    }

    // ------------------------------------------------------------------ for the tick boxes and the before/after view
    fun inspectFile(src: File): org.json.JSONObject {
        val j = org.json.JSONObject()
        val doc = try { PDDocument.load(src, MemoryUsageSetting.setupTempFileOnly()) }
        catch (e: InvalidPasswordException) { return j.put("locked", true) }
        catch (e: Exception) { return j.put("unreadable", true) }
        try {
            if (doc.isEncrypted) j.put("locked", true)
            val info = inspect(doc)
            var fonts = 0
            val seen = IdentityHashMap<COSBase, Boolean>()
            try { for (p in doc.pages) { val r = p.resources ?: continue; for (n in r.fontNames) { val f = r.getFont(n) ?: continue; if (seen.put(f.cosObject, true) == null && f.isEmbedded) fonts++ } } } catch (_: Exception) { }
            var thumbs = 0
            try { for (p in doc.pages) if (p.cosObject.containsKey(COSName.getPDFName("Thumb"))) thumbs++ } catch (_: Exception) { }
            var attachments = 0
            try {
                val names = doc.documentCatalog.cosObject.getDictionaryObject(COSName.NAMES) as? COSDictionary
                val ef = names?.getDictionaryObject(COSName.EMBEDDED_FILES) as? COSDictionary
                val arr = ef?.getDictionaryObject(COSName.NAMES) as? com.tom_roush.pdfbox.cos.COSArray
                attachments = if (arr != null) arr.size() / 2 else if (ef != null) 1 else 0
            } catch (_: Exception) { }
            val meta = try {
                val inf = doc.document.trailer.getDictionaryObject(COSName.INFO) as? COSDictionary
                (inf != null && inf.size() > 0) || doc.documentCatalog.cosObject.containsKey(COSName.METADATA)
            } catch (_: Exception) { false }
            j.put("pages", doc.numberOfPages).put("photos", info.photos).put("fonts", fonts).put("metadata", meta)
                .put("thumbs", thumbs).put("attachments", attachments).put("form", info.form).put("signed", info.signed)
        } finally { doc.close() }
        return j
    }

    /** One page as PNG (for the before/after view); returns the number of pages. */
    fun renderPage(pfd: ParcelFileDescriptor, page: Int, maxSide: Int, out: File): Int {
        PdfRenderer(pfd).use { r ->
            val n = r.pageCount
            r.openPage(page.coerceIn(0, n - 1)).use { pg ->
                val sc = maxSide.toDouble() / max(pg.width, pg.height)
                val bmp = Bitmap.createBitmap(max(1, (pg.width * sc).roundToInt()), max(1, (pg.height * sc).roundToInt()), Bitmap.Config.ARGB_8888)
                bmp.eraseColor(Color.WHITE)
                pg.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                out.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                bmp.recycle()
            }
            return n
        }
    }
}
