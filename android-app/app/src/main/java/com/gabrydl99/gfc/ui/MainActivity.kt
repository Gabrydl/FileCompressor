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
import com.gabrydl99.gfc.work.CompressService
import com.gabrydl99.gfc.work.Engine
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
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = assets.shouldInterceptRequest(request.url)
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
        if (skipped > 0) toast("$skipped file(s) skipped: type not supported.")
    }

    private fun toast(t: String) = runOnUiThread { Toast.makeText(this, t, Toast.LENGTH_LONG).show() }

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
                try { pickFiles.launch(Intent.createChooser(i, "Add files with")) } catch (_: ActivityNotFoundException) { toast("No file manager found.") }
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
        val i = if (share) Intent.createChooser(Intent(Intent.ACTION_SEND).setType(mimeOf(f)).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Share")
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
        toast("Results are in " + dir.absolutePath.replace(Environment.getExternalStorageDirectory().absolutePath, "Phone storage"))
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
