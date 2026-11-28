package com.gabrydl99.gfc.work

import android.os.ParcelFileDescriptor
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** The before/after view: pictures of the original and of the result, shown by the page through
 *  https://appassets.androidplatform.net/local/<token> (only files handed out here can be opened that way). */
object Preview {
    private val shared = ConcurrentHashMap<String, File>()
    private val dir get() = File(Engine.app.cacheDir, "views").apply { mkdirs() }

    fun share(f: File): String {
        val t = UUID.randomUUID().toString().replace("-", "") + "." + f.extLower().ifEmpty { "bin" }
        shared[t] = f
        return "https://appassets.androidplatform.net/local/$t"
    }
    fun fileOf(token: String): File? = shared[token]

    private fun pfdOf(f: File) = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)

    /** [it] is the page's file (id, kind, held/out); [page] is the PDF page to show. */
    fun make(j: JSONObject, page: Int): JSONObject {
        val item = Engine.item(j.optInt("id")) ?: return JSONObject().put("type", "none").put("error", "not in the list")
        val afterPath = j.optString("held").ifEmpty { j.optString("out") }
        val after = File(afterPath)
        if (afterPath.isEmpty() || !after.exists()) return JSONObject().put("type", "none").put("error", "the result isn't there anymore")
        val before = Engine.readable(item)
        val tag = "${item.id}-${System.currentTimeMillis()}"
        val ctx = Ctx(item, dir, false)
        return try {
            when (item.kind) {
                "IMAGE" -> {
                    val a = File(dir, "$tag-a.png"); val b = File(dir, "$tag-b.png")
                    val sa = Images.previewPng(before, a, 2000, ctx); val sb = Images.previewPng(after, b, 2000, ctx)
                    JSONObject().put("type", "image").put("before", share(a)).put("after", share(b)).put("info", JSONArray(listOf("${sa.first}×${sa.second}", "${sb.first}×${sb.second}")))
                }
                "PDF" -> {
                    val a = File(dir, "$tag-a.png"); val b = File(dir, "$tag-b.png")
                    val na = pfdOf(before).use { Pdf.renderPage(it, page, 1400, a) }
                    val nb = pfdOf(after).use { Pdf.renderPage(it, page, 1400, b) }
                    JSONObject().put("type", "pdf").put("before", share(a)).put("after", share(b)).put("pages", minOf(na, nb)).put("page", page)
                }
                "VIDEO" -> {
                    val ia = Media.inspect(before); val ib = Media.inspect(after)
                    val t0 = j.optJSONObject("trim")?.optDouble("trimStart", 0.0)?.takeIf { !it.isNaN() } ?: 0.0
                    val da = ib.optDouble("duration", 0.0).takeIf { it > 0 } ?: ia.optDouble("duration", 0.0)
                    val a = Media.frame(before, t0 + da * 0.35, File(dir, "$tag-a.jpg"))
                    val b = Media.frame(after, ib.optDouble("duration", 0.0) * 0.35, File(dir, "$tag-b.jpg"))
                    JSONObject().put("type", "video").put("before", share(a)).put("after", share(b))
                        .put("info", JSONArray(listOf("${ia.optInt("w")}×${ia.optInt("h")}", "${ib.optInt("w")}×${ib.optInt("h")}")))
                }
                "AUDIO" -> JSONObject().put("type", "audio").put("before", share(before)).put("after", share(after))
                else -> JSONObject().put("type", "none")
            }
        } catch (e: Throwable) { JSONObject().put("type", "none").put("error", e.message ?: e.javaClass.simpleName) }
    }
}
