package com.gabrydl99.gfc.work

import android.annotation.SuppressLint
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** The list of files and the work on them. Lives as long as the app process, so the page can be closed and reopened. */
@SuppressLint("StaticFieldLeak")
object Engine {
    lateinit var app: Context

    class Item(val id: Int, val name: String, val size: Long, val kind: String, val uri: Uri, val path: String?) {
        @Volatile var status = "WAITING"      // WAITING, WORKING, DONE, FAILED, STOPPED
        @Volatile var progress = 0.0
        @Volatile var stage = ""
        @Volatile var newSize = 0L
        @Volatile var origSize = 0L
        @Volatile var out = ""
        @Volatile var notes: List<String> = emptyList()
        @Volatile var moved = ""
        @Volatile var message = ""
        @Volatile var why: Why? = null
        @Volatile var skip = false

        fun reset() { status = "WAITING"; progress = 0.0; stage = ""; newSize = 0; origSize = 0; out = ""; notes = emptyList(); moved = ""; message = ""; why = null; skip = false }

        fun json(): JSONObject = JSONObject().put("id", id).put("name", name).put("size", size).put("kind", kind).put("status", status)
            .put("progress", progress).put("stage", stage).put("newSize", newSize).put("origSize", origSize).put("out", out)
            .put("notes", JSONArray(notes)).put("moved", moved).put("message", message).put("skip", skip).put("why", why?.json() ?: JSONObject.NULL)
    }

    private val items = ArrayList<Item>()
    private var seq = 0
    @Volatile var running = false
    @Volatile var abortRequested = false

    fun init(c: Context) {
        app = c.applicationContext
        Ff.bin = File(app.applicationInfo.nativeLibraryDir, "libffmpeg.so").absolutePath
    }

    // ------------------------------------------------------------------ settings (the page sends them before every run)
    private val prefs by lazy { app.getSharedPreferences("gfc", Context.MODE_PRIVATE) }
    fun settingsJson(): String = prefs.getString("settings", "{}") ?: "{}"
    fun putSettings(json: String) { try { JSONObject(json); prefs.edit().putString("settings", json).apply() } catch (_: Exception) { } }
    fun settings(): Settings = Settings(try { JSONObject(settingsJson()) } catch (_: Exception) { JSONObject() })

    fun defaultOutDir(): String = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "FileCompressor").absolutePath
    fun outputDir(): String = settings().outputDir.ifEmpty { defaultOutDir() }
    fun setOutputDir(d: String) {
        val j = try { JSONObject(settingsJson()) } catch (_: Exception) { JSONObject() }
        j.put("outputDir", d)
        putSettings(j.toString())
    }

    fun allFiles(): Boolean = if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
    else ContextCompat.checkSelfPermission(app, android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED

    // ------------------------------------------------------------------ the list
    fun snapshot(): String = synchronized(this) {
        val arr = JSONArray()
        items.forEach { arr.put(it.json()) }
        JSONObject().put("running", running).put("allFiles", allFiles()).put("outputDir", outputDir()).put("items", arr).toString()
    }

    fun kindOf(name: String): String? {
        val e = name.extLower()
        return when {
            e in Media.VIDEO_EXT -> "VIDEO"
            e in Media.AUDIO_EXT -> "AUDIO"
            e in Images.IMAGE_EXT -> "IMAGE"
            e == "pdf" -> "PDF"
            e in Office.OFFICE_EXT -> "OFFICE"
            else -> null
        }
    }

    private val IMAGE_MIME = listOf("jpeg", "jpg", "pjpeg", "png", "webp", "heic", "heif", "heic-sequence", "heif-sequence", "avif", "bmp", "x-ms-bmp", "tiff", "gif")

    private fun kindFromMime(m: String?): String? = when {
        m == null -> null
        m.startsWith("video/") -> "VIDEO"
        m.startsWith("audio/") -> "AUDIO"
        // only pictures the app can really open (not SVG, icons...)
        m.substringAfter('/').substringBefore(';').lowercase() in IMAGE_MIME && m.startsWith("image/") -> "IMAGE"
        m == "application/pdf" -> "PDF"
        m.contains("officedocument") -> "OFFICE"
        else -> null
    }

    /** Adds files picked, shared or found in a folder. Returns how many were skipped because the type isn't supported. */
    fun addUris(uris: List<Uri>): Int {
        var skipped = 0
        for (u in uris) {
            try { app.contentResolver.takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) { }
            val path = pathOf(u)
            var name: String? = null
            var size = -1L
            if (path != null) { val f = File(path); name = f.name; size = f.length() }
            else try {
                app.contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        name = c.getString(0)
                        if (!c.isNull(1)) size = c.getLong(1)
                    }
                }
            } catch (_: Exception) { }
            val nm = name ?: u.lastPathSegment?.substringAfterLast('/') ?: "file"
            var kind = kindOf(nm) ?: kindFromMime(try { app.contentResolver.getType(u) } catch (_: Exception) { null })
            if (kind == null) { skipped++; continue }
            if (size < 0) size = try { app.contentResolver.openAssetFileDescriptor(u, "r")?.use { it.length } ?: 0L } catch (_: Exception) { 0L }
            synchronized(this) {
                if (items.any { it.uri == u || (path != null && it.path == path) }) return@synchronized
                items.add(Item(++seq, nm, size, kind, u, path))
            }
        }
        return skipped
    }

    fun remove(id: Int) = synchronized(this) { items.removeAll { it.id == id && it.status != "WORKING" } }
    fun clear() = synchronized(this) { if (!running) items.clear() }
    fun requeue(id: Int) = synchronized(this) { items.find { it.id == id && it.status != "WORKING" }?.reset() }

    // ------------------------------------------------------------------ where a picked file really is
    /** The real path of a picked file when the phone tells it (then it can be read directly and moved to Original). */
    fun pathOf(u: Uri): String? {
        val p = try { rawPathOf(u) } catch (_: Exception) { null } ?: return null
        val f = File(p)
        return if (f.isFile && f.canRead()) f.absolutePath else null
    }

    private fun rawPathOf(u: Uri): String? {
        if (u.scheme == "file") return u.path
        if (u.scheme != "content") return null
        val auth = u.authority ?: return null
        if (DocumentsContract.isDocumentUri(app, u)) {
            val id = DocumentsContract.getDocumentId(u)
            when (auth) {
                "com.android.externalstorage.documents" -> {
                    val type = id.substringBefore(':'); val rel = id.substringAfter(':', "")
                    return if (type.equals("primary", true)) Environment.getExternalStorageDirectory().absolutePath + "/" + rel else "/storage/$type/$rel"
                }
                "com.android.providers.downloads.documents" -> {
                    if (id.startsWith("raw:")) return id.substring(4)
                    if (id.startsWith("msf:")) return dataColumn(MediaStore.Files.getContentUri("external"), "_id=?", arrayOf(id.substring(4)))
                    id.toLongOrNull()?.let { n ->
                        for (base in listOf("content://downloads/public_downloads", "content://downloads/my_downloads")) {
                            val r = try { dataColumn(ContentUris.withAppendedId(Uri.parse(base), n), null, null) } catch (_: Exception) { null }
                            if (r != null) return r
                        }
                    }
                    return null
                }
                "com.android.providers.media.documents" -> {
                    val type = id.substringBefore(':'); val num = id.substringAfter(':', "")
                    val base = when (type) {
                        "image" -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                        "video" -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                        "audio" -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                        else -> MediaStore.Files.getContentUri("external")
                    }
                    return dataColumn(base, "_id=?", arrayOf(num))
                }
            }
            return null
        }
        if (auth == "media" || auth.startsWith("media")) return dataColumn(u, null, null)
        // some file managers hand out content://<their app>/root/storage/emulated/0/... style links
        val segs = u.path ?: return null
        val i = segs.indexOf("/storage/")
        if (i >= 0) return segs.substring(i)
        return null
    }

    @Suppress("DEPRECATION")
    private fun dataColumn(u: Uri, sel: String?, args: Array<String>?): String? =
        app.contentResolver.query(u, arrayOf(MediaStore.MediaColumns.DATA), sel, args, null)?.use { c -> if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null }

    // ------------------------------------------------------------------ the run (called by CompressService on its own thread)
    fun waiting(): List<Item> = synchronized(this) { items.filter { it.status == "WAITING" } }
    fun counts(): Pair<Int, Int> = synchronized(this) { items.count { it.status != "WAITING" && it.status != "WORKING" } to items.size }

    fun runQueue(onChange: (Item?) -> Unit) {
        abortRequested = false
        running = true
        try {
            while (true) {
                val it = synchronized(this) { items.firstOrNull { it.status == "WAITING" } } ?: break
                if (abortRequested) { synchronized(this) { items.filter { i -> i.status == "WAITING" }.forEach { i -> i.status = "STOPPED" } }; break }
                processOne(it)
                onChange(it)
            }
        } finally {
            running = false
            onChange(null)
        }
    }

    private fun processOne(it: Item) {
        val tmp = File(app.cacheDir, "job-${it.id}-${System.currentTimeMillis()}").apply { mkdirs() }
        val ctx = Ctx(it, tmp)
        it.reset()
        it.status = "WORKING"; it.stage = "Starting"
        val s = settings()
        AppLog.line("INFO", "Start: ${it.name} (${it.kind}, ${it.size} bytes), mode ${s.mode}")
        try {
            ctx.check()
            val src: File = if (it.path != null && File(it.path).canRead()) File(it.path) else {
                ctx.stage("Reading the file")
                val f = File(tmp, "in." + (it.name.extLower().ifEmpty { "bin" }))
                (app.contentResolver.openInputStream(it.uri) ?: throw Fail("The file isn't there anymore")).use { inp -> f.outputStream().use { o -> inp.copyTo(o, 1 shl 16) } }
                f
            }
            val size = src.length()
            it.origSize = size
            val ext = it.name.extLower()
            val tmpOut = File(tmp, "out." + ext.ifEmpty { "bin" })
            val wanted = when (s.mode) { "PERCENT" -> size * s.percent / 100.0; "MB" -> s.targetMb * MB; else -> 0.0 }
            var target = wanted
            val r: Result
            if (s.mode == "CONVERT") {
                r = when (it.kind) {
                    "VIDEO" -> Media.convertVideo(src, tmpOut, s, ctx)
                    "AUDIO" -> Media.convertAudio(src, tmpOut, s, ctx)
                    "IMAGE" -> Images.convert(src, tmpOut, s, ctx)
                    else -> throw Skip("cannot convert")
                }
            } else {
                if (s.mode == "MB" && size <= wanted) throw Skip("below target")
                if (target <= 0) target = size * 0.3
                r = when (it.kind) {
                    "VIDEO" -> Media.compressVideo(src, tmpOut, s, target, ctx)
                    "AUDIO" -> Media.compressAudio(src, tmpOut, s, target, ctx)
                    "IMAGE" -> Images.compress(src, tmpOut, s, target, ctx)
                    "PDF" -> Pdf.compress(src, tmpOut, s, target, ctx)
                    else -> Office.compress(src, tmpOut, s, target, ctx)
                }
                if (r.size >= size) throw Skip("already well compressed")
            }
            ctx.stage("Saving")
            val notes = mutableListOf<String>()
            if (r.note.isNotEmpty()) notes.add(r.note)
            val dest = finalize(it, r.out, s, notes)
            it.out = dest.absolutePath
            it.newSize = dest.length()
            it.notes = notes
            it.progress = 1.0
            it.status = "DONE"
            AppLog.line("INFO", "Done: ${it.name}, ${it.origSize} -> ${it.newSize} bytes, saved as ${it.out}" + (if (notes.isEmpty()) "" else " (" + notes.joinToString("; ") + ")"))
        } catch (e: Skip) {
            if (e.message == "stopped") { it.status = "STOPPED"; AppLog.line("INFO", "Stopped: ${it.name}") }
            else { it.skip = true; it.message = skipReason(e.message); it.status = "FAILED"; AppLog.line("INFO", "Skipped: ${it.name}: ${it.message}") }
        } catch (e: OutOfMemoryError) {
            it.message = "Not enough memory"; it.why = diagnose("memory", it.kind); it.status = "FAILED"
            AppLog.line("ERROR", "Failed: ${it.name}: not enough memory")
        } catch (e: Throwable) {
            val msg = e.message ?: e.javaClass.simpleName
            it.message = msg; it.why = diagnose(msg, it.kind); it.status = "FAILED"
            AppLog.error("Failed: ${it.name} (${it.why?.title ?: "?"})", e)
        } finally {
            tmp.deleteRecursively()
        }
    }

    // ------------------------------------------------------------------ saving a result in Compressed (and the original in Original)
    private fun uniqueFile(dir: File, base: String, ext: String): File {
        var f = File(dir, "$base.$ext")
        var k = 2
        while (f.exists()) { f = File(dir, "$base ($k).$ext"); k++ }
        return f
    }

    private fun moveFile(from: File, to: File) {
        if (from.renameTo(to)) return
        from.inputStream().use { i -> to.outputStream().use { o -> i.copyTo(o, 1 shl 16) } }
        from.delete()
    }

    private fun finalize(it: Item, result: File, s: Settings, notes: MutableList<String>): File {
        val root = File(outputDir())
        val comp = File(root, "Compressed")
        if (!comp.isDirectory && !comp.mkdirs()) throw Fail("EACCES: couldn't create the folder " + comp.absolutePath)
        val base = it.name.substringBeforeLast('.')
        val dest = uniqueFile(comp, base + "_compressed", result.extLower())
        try { moveFile(result, dest) } catch (e: Exception) { throw Fail("EACCES: couldn't write " + dest.absolutePath + " (" + e.message + ")") }
        val scan = mutableListOf(dest.absolutePath)
        if (s.moveOriginals) {
            val p = it.path
            if (p != null) {
                try {
                    val od = File(root, "Original").apply { mkdirs() }
                    val to = uniqueFile(od, base, it.name.extLower())
                    moveFile(File(p), to)
                    it.moved = to.absolutePath
                    scan += listOf(to.absolutePath, p)
                } catch (_: Exception) { notes.add("Couldn't move the original into the Original folder.") }
            } else notes.add("The original was left where it is (the app that shared it doesn't allow moving it).")
        }
        try { MediaScannerConnection.scanFile(app, scan.toTypedArray(), null, null) } catch (_: Exception) { }
        return dest
    }
}
