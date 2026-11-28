package com.gabrydl99.gfc.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.content.IntentCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.documentfile.provider.DocumentFile
import androidx.webkit.WebViewAssetLoader
import com.gabrydl99.gfc.work.AppLog
import com.gabrydl99.gfc.work.CompressService
import com.gabrydl99.gfc.work.Engine
import com.gabrydl99.gfc.work.Preview
import com.gabrydl99.gfc.work.Tr
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread
import kotlin.math.roundToInt

/** The page (android-www) in a WebView, plus the phone things it can't do itself: pickers, permissions, opening and sharing files. */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    @Volatile private var insetTop = 0
    @Volatile private var insetBottom = 0

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val d = r.data ?: return@registerForActivityResult
        if (r.resultCode != RESULT_OK) return@registerForActivityResult
        val list = mutableListOf<Uri>()
        d.clipData?.let { c -> for (i in 0 until c.itemCount) c.getItemAt(i).uri?.let { list.add(it) } }
        if (list.isEmpty()) d.data?.let { list.add(it) }
        add(list)
    }
    private val pickFolder = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { tree ->
        if (tree == null) return@registerForActivityResult
        try { contentResolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) { }
        thread {
            val list = mutableListOf<Uri>()
            fun walk(d: DocumentFile, depth: Int) {
                val kids = try { d.listFiles().sortedBy { it.name?.lowercase() ?: "" } } catch (_: Exception) { return }
                for (k in kids) {
                    val n = k.name ?: continue
                    if (k.isDirectory) { if (depth < 2 && n != "Compressed" && n != "Original" && !n.startsWith(".")) walk(k, depth + 1) }
                    else if (Engine.kindOf(n) != null) list.add(k.uri)
                }
            }
            DocumentFile.fromTreeUri(this, tree)?.let { walk(it, 0) }
            if (list.isEmpty()) toast("No files the app can compress in that folder.") else add(list)
        }
    }
    private val pickOut = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { tree ->
        if (tree == null) return@registerForActivityResult
        val p = treePath(tree)
        if (p == null) { toast("Pick a folder in the phone storage or SD card."); return@registerForActivityResult }
        try { contentResolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) } catch (_: Exception) { }
        Engine.setOutputDir(p)
    }
    private val askPerms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        web = WebView(this)
        web.setBackgroundColor(Color.TRANSPARENT)
        setContentView(web)

        val assets = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
            setSupportMultipleWindows(false)
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val u = request.url
                if (u.host == HOST && (u.path ?: "").startsWith("/local/")) {
                    // pictures of the before/after view and the files it plays (only those Preview handed out)
                    val f = Preview.fileOf(u.lastPathSegment ?: "") ?: return WebResourceResponse("text/plain", "utf-8", 404, "Not found", emptyMap(), null)
                    return try { WebResourceResponse(mimeOf(f), null, f.inputStream()) } catch (_: Exception) { null }
                }
                return assets.shouldInterceptRequest(u)
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                openExternal(request.url)
                return true
            }
        }
        web.webChromeClient = WebChromeClient()
        web.setDownloadListener { url, _, _, _, _ -> openExternal(Uri.parse(url)) }
        web.addJavascriptInterface(Bridge(), "Android")

        ViewCompat.setOnApplyWindowInsetsListener(web) { _, ins ->
            val b = ins.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            val d = resources.displayMetrics.density
            insetTop = (b.top / d).roundToInt(); insetBottom = (b.bottom / d).roundToInt()
            web.evaluateJavascript("window.__gfcInsets&&window.__gfcInsets($insetTop,$insetBottom)", null)
            WindowInsetsCompat.CONSUMED
        }

        onBackPressedDispatcher.addCallback(this) {
            web.evaluateJavascript("(window.__gfc&&window.__gfc.back())?'1':'0'") { r ->
                if (r?.contains("1") != true) { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        }

        web.loadUrl("https://$HOST/assets/www/index.html")
        handleIntent(intent)
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            askPerms.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    // ------------------------------------------------------------------ files handed to the app (Share → FileCompressor, Open with)
    private fun handleIntent(i: Intent?) {
        if (i == null) return
        val list = mutableListOf<Uri>()
        when (i.action) {
            Intent.ACTION_SEND -> IntentCompat.getParcelableExtra(i, Intent.EXTRA_STREAM, Uri::class.java)?.let { list.add(it) }
            Intent.ACTION_SEND_MULTIPLE -> IntentCompat.getParcelableArrayListExtra(i, Intent.EXTRA_STREAM, Uri::class.java)?.let { list.addAll(it) }
            Intent.ACTION_VIEW -> i.data?.let { list.add(it) }
        }
        if (list.isEmpty()) return
        if (Engine.running) { toast("Wait for the current run to finish, then add more files."); return }
        add(list)
        i.action = Intent.ACTION_MAIN
    }

    private fun add(list: List<Uri>) = thread {
        val skipped = Engine.addUris(list)
        if (skipped > 0) toast(Tr.t("{0} file(s) skipped: type not supported.", skipped))
    }

    private fun toast(t: String) = runOnUiThread { Toast.makeText(this, Tr.t(t), Toast.LENGTH_LONG).show() }

    // ------------------------------------------------------------------ what the page asks for
    private fun doOp(code: Int, arg: String) {
        when (code) {
            1 -> {
                val i = Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    putExtra(Intent.EXTRA_MIME_TYPES, MIMES)
                }
                try { pickFiles.launch(Intent.createChooser(i, Tr.t("Add files with"))) } catch (_: ActivityNotFoundException) { toast("No file manager found.") }
            }
            2 -> try { pickFolder.launch(null) } catch (_: ActivityNotFoundException) { toast("No file manager found.") }
            3 -> try { pickOut.launch(null) } catch (_: ActivityNotFoundException) { toast("No file manager found.") }
            4 -> askAllFiles()
            5 -> if (!Engine.running) {
                Engine.abortRequested = false
                Engine.running = true
                ContextCompat.startForegroundService(this, Intent(this, CompressService::class.java))
            }
            6 -> Engine.abortRequested = true
            7 -> openFile(arg, false)
            8 -> openFile(arg, true)
            9 -> openFolder()
            10 -> theme(arg == "1")
            11 -> arg.toIntOrNull()?.let { Engine.remove(it) }
            12 -> Engine.clear()
            13 -> arg.toIntOrNull()?.let { Engine.requeue(it) }
        }
    }

    private fun askAllFiles() {
        if (Build.VERSION.SDK_INT >= 30) {
            try { startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName"))) }
            catch (_: Exception) { try { startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) } catch (_: Exception) { } }
        } else askPerms.launch(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE))
    }

    private fun theme(dark: Boolean) {
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
        window.decorView.setBackgroundColor(if (dark) Color.BLACK else Color.WHITE)
    }

    private fun mimeOf(f: File): String = MimeTypeMap.getSingleton().getMimeTypeFromExtension(f.extension.lowercase()) ?: "*/*"

    private fun openFile(p: String, share: Boolean) {
        val f = File(p)
        if (!f.exists()) { toast("The file isn't there anymore."); return }
        val uri = try { FileProvider.getUriForFile(this, "$packageName.files", f) } catch (_: Exception) { toast("Can't open this file."); return }
        val i = if (share) Intent.createChooser(Intent(Intent.ACTION_SEND).setType(mimeOf(f)).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), Tr.t("Share"))
        else Intent(Intent.ACTION_VIEW).setDataAndType(uri, mimeOf(f)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try { startActivity(i) } catch (_: ActivityNotFoundException) { toast("No app on the phone can open this file.") }
    }

    private fun openFolder() {
        val out = File(Engine.outputDir())
        val dir = File(out, "Compressed").takeIf { it.isDirectory } ?: out
        val docId = docIdOf(dir.absolutePath)
        if (docId != null) {
            val uri = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", docId)
            for (type in listOf(DocumentsContract.Document.MIME_TYPE_DIR, "resource/folder", null)) {
                try {
                    val i = Intent(Intent.ACTION_VIEW).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (type != null) i.setDataAndType(uri, type) else i.data = uri
                    startActivity(i); return
                } catch (_: Exception) { }
            }
        }
        toast(Tr.t("Results are in {0}", dir.absolutePath.replace(Environment.getExternalStorageDirectory().absolutePath, Tr.t("Phone storage"))))
    }

    private fun docIdOf(path: String): String? {
        val root = Environment.getExternalStorageDirectory().absolutePath
        if (path == root) return "primary:"
        if (path.startsWith("$root/")) return "primary:" + path.removePrefix("$root/")
        val m = Regex("^/storage/([0-9A-Fa-f]{4}-[0-9A-Fa-f]{4})(/(.*))?$").find(path) ?: return null
        return m.groupValues[1] + ":" + m.groupValues[3]
    }

    /** "primary:Download/X" → /storage/emulated/0/Download/X (SD card: /storage/XXXX-XXXX/...). */
    private fun treePath(tree: Uri): String? {
        if (tree.authority != "com.android.externalstorage.documents") return null
        val id = try { DocumentsContract.getTreeDocumentId(tree) } catch (_: Exception) { return null }
        val type = id.substringBefore(':'); val rel = id.substringAfter(':', "")
        val base = if (type.equals("primary", true)) Environment.getExternalStorageDirectory().absolutePath else "/storage/$type"
        return if (rel.isEmpty()) base else "$base/$rel"
    }

    private fun openExternal(u: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { toast("No browser found to open the link.") }
    }

    // ------------------------------------------------------------------ the bridge used by host.js (window.Android)
    inner class Bridge {
        @JavascriptInterface fun snapshot(): String = Engine.snapshot()
        @JavascriptInterface fun op(code: Int, arg: String?) { runOnUiThread { doOp(code, arg ?: "") } }
        @JavascriptInterface fun insets(): String = "$insetTop,$insetBottom"
        @JavascriptInterface fun defaultOutDir(): String = Engine.defaultOutDir()
        @JavascriptInterface fun allFiles(): Boolean = Engine.allFiles()
        @JavascriptInterface fun encoders(): String = "libx264,libvpx-vp9,aac,libmp3lame,libopus,libvorbis"
        @JavascriptInterface fun initialSettings(): String = Engine.settingsJson()
        @JavascriptInterface fun putSettings(json: String?) { if (json != null) Engine.putSettings(json) }
        @JavascriptInterface fun log(level: String?, msg: String?) { AppLog.line(level ?: "INFO", msg ?: "") }
        @JavascriptInterface fun setLang(code: String?) { Tr.setLang(this@MainActivity, code ?: "") }
        /** Slow work asked by the page: runs on its own thread, the answer comes back through window.__gfcReply(id, json). */
        @JavascriptInterface fun call(id: Int, method: String?, arg: String?) {
            thread {
                val res: String = try {
                    when (method) {
                        "start" -> {
                            Engine.prepare(arg ?: "{}")
                            runOnUiThread { doOp(5, "") }
                            "true"
                        }
                        "inspect" -> {
                            val ids = JSONArray(arg ?: "[]")
                            val o = JSONObject()
                            for (k in 0 until ids.length()) o.put(ids.getInt(k).toString(), Engine.inspect(ids.getInt(k)))
                            o.toString()
                        }
                        "preview" -> { val j = JSONObject(arg ?: "{}"); Preview.make(j.getJSONObject("item"), j.optInt("page")).toString() }
                        "reviewSave" -> { val j = JSONObject(arg ?: "{}"); Engine.reviewSave(j.getInt("id"), (j.optJSONObject("settings") ?: JSONObject()).toString()).toString() }
                        "reviewDiscard" -> { Engine.reviewDiscard(arg ?: ""); "true" }
                        "history" -> { val h = Engine.history(); val r = JSONArray(); for (k in h.length() - 1 downTo 0) r.put(h.get(k)); r.toString() }
                        "historyClear" -> { Engine.historyClear(); "true" }
                        "restore" -> { val j = JSONObject(arg ?: "{}"); Engine.restore(j.getJSONObject("entry"), j.optBoolean("removeCopy")).toString() }
                        else -> "null"
                    }
                } catch (e: Throwable) {
                    AppLog.error("Page call $method failed", e)
                    JSONObject().put("ok", false).put("error", e.message ?: e.javaClass.simpleName).toString()
                }
                runOnUiThread { if (!isDestroyed) web.evaluateJavascript("window.__gfcReply&&window.__gfcReply($id, ${JSONObject.quote(res)})", null) }
            }
        }
        /** "OK:<file name>" when the log was saved in Download, otherwise "ERR:<reason>". */
        @JavascriptInterface fun saveLog(): String = try { "OK:" + AppLog.saveToDownloads(this@MainActivity) } catch (e: Throwable) {
            AppLog.error("Save log failed", e); "ERR:" + (e.message ?: e.javaClass.simpleName)
        }
    }

    companion object {
        private const val HOST = "appassets.androidplatform.net"
        private val MIMES = arrayOf("video/*", "image/*", "audio/*", "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-word.document.macroEnabled.12", "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
            "application/vnd.ms-excel.sheet.macroEnabled.12")
    }
}
