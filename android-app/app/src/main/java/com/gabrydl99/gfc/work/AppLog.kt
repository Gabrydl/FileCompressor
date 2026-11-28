package com.gabrydl99.gfc.work

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The app's log: what was compressed, what failed and why, and any crash. It is kept inside the app
 * (FileCompressor.log, the previous one as FileCompressor.old.log once it passes 1 MB) and saved as a
 * text file in Download when the user taps "Save log".
 */
object AppLog {
    private const val MAX = 1L shl 20
    private var dir: File? = null
    private var version = ""
    private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)

    private val cur get() = dir?.let { File(it, "FileCompressor.log") }
    private val old get() = dir?.let { File(it, "FileCompressor.old.log") }

    fun init(ctx: Context) {
        dir = ctx.filesDir
        version = try {
            val p = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            "${p.versionName} (${if (Build.VERSION.SDK_INT >= 28) p.longVersionCode else @Suppress("DEPRECATION") p.versionCode.toLong()})"
        } catch (_: Exception) { "?" }
        line("INFO", "App started, version $version, Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), ${Build.MANUFACTURER} ${Build.MODEL}")
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try { error("Crash in thread ${t.name}", e) } catch (_: Throwable) { }
            prev?.uncaughtException(t, e)
        }
    }

    @Synchronized
    fun line(level: String, msg: String) {
        val f = cur ?: return
        try {
            if (f.length() > MAX) { old?.delete(); f.renameTo(old!!) }
            f.appendText("${stamp.format(Date())} [$level] ${msg.replace("\r", "")}\n")
        } catch (_: Exception) { }
    }

    fun error(msg: String, e: Throwable) {
        val trace = e.stackTraceToString().lineSequence().take(12).joinToString("\n    ")
        line("ERROR", "$msg: $trace")
    }

    @Synchronized
    fun text(): String {
        val b = StringBuilder()
        b.append("FileCompressor log\nVersion: ").append(version)
            .append("\nPhone: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL)
            .append(", Android ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append(")")
            .append("\nSaved: ").append(stamp.format(Date())).append("\n\n")
        try { old?.takeIf { it.exists() }?.let { b.append(it.readText()) } } catch (_: Exception) { }
        try { cur?.takeIf { it.exists() }?.let { b.append(it.readText()) } } catch (_: Exception) { }
        return b.toString()
    }

    /** Writes the log to Download/FileCompressor-log-YYYYMMDD-HHMM.txt and returns the name shown to the user. */
    fun saveToDownloads(ctx: Context): String {
        val name = "FileCompressor-log-" + SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(Date()) + ".txt"
        val data = text().replace("\n", "\r\n").toByteArray(Charsets.UTF_8)
        if (Build.VERSION.SDK_INT >= 29) {
            val cr = ctx.contentResolver
            val v = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, "text/plain")
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: throw IllegalStateException("Download folder not available")
            try {
                (cr.openOutputStream(uri) ?: throw IllegalStateException("can't write the file")).use { it.write(data) }
                cr.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            } catch (e: Exception) { cr.delete(uri, null, null); throw e }
        } else {
            @Suppress("DEPRECATION")
            val d = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).apply { mkdirs() }
            File(d, name).writeBytes(data)
        }
        line("INFO", "Log saved as Download/$name")
        return name
    }
}
