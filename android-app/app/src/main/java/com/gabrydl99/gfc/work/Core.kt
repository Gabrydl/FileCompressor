package com.gabrydl99.gfc.work

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Something went wrong. */
class Fail(msg: String) : Exception(msg)

/** Nothing to do: the file is left alone on purpose (the message says why). */
class Skip(msg: String) : Exception(msg)

/** What one engine step returns: the new file in the work folder, its size and a short note for the list. */
class Result(val out: File, val size: Long, val note: String = "")

const val MB = 1024.0 * 1024.0

/** The settings the page sends (same names as the Windows app). */
class Settings(private val j: JSONObject) {
    fun str(k: String, d: String): String {
        if (!j.has(k) || j.isNull(k)) return d
        val v = j.optString(k, d)
        return if (v.isEmpty()) d else v
    }
    fun num(k: String, d: Double): Double = if (!j.has(k) || j.isNull(k)) d else j.optDouble(k, d).let { if (it.isNaN()) d else it }
    fun bool(k: String, d: Boolean): Boolean = if (!j.has(k) || j.isNull(k)) d else j.optBoolean(k, d)

    /** PERCENT, SIZE (targetBytes) or CONVERT; "MB" (targetMb) is the 1.7 name of SIZE. */
    val mode get() = str("mode", "PERCENT").let { if (it == "MB") "SIZE" else it }
    val percent get() = num("percent", 30.0)
    val targetBytes get() = if (j.has("targetBytes") && !j.isNull("targetBytes")) num("targetBytes", 10 * MB) else num("targetMb", 10.0) * MB
    val resolution get() = str("resolution", "auto")
    val fps get() = str("fps", "auto")
    val speed get() = str("speed", "balanced")
    val videoFormat get() = str("videoFormat", "keep")
    val imageFormat get() = str("imageFormat", "keep")
    val audioFormat get() = str("audioFormat", "keep")
    val moveOriginals get() = bool("moveOriginals", false)
    val outputDir get() = str("outputDir", "")
    val skipSmaller get() = bool("skipSmaller", true)
    val preview get() = bool("preview", false)
    val history get() = bool("history", true)
    // what each kind of file may change (the tick boxes of the page)
    val photoStripExif get() = bool("photoStripExif", false)
    val photoResize get() = bool("photoResize", false)
    val photoW get() = num("photoW", 0.0)
    val photoH get() = num("photoH", 0.0)
    val audioMono get() = bool("audioMono", false)
    val pdfMeta get() = bool("pdfMeta", true)
    val pdfExtras get() = bool("pdfExtras", true)
    val pdfPhotos get() = bool("pdfPhotos", true)
    val pdfGray get() = bool("pdfGray", false)
    val pdfAsPictures get() = bool("pdfAsPictures", false)
    val officePhotos get() = bool("officePhotos", true)
    // keep only a part of a video or audio (seconds; 0 = from the start / to the end)
    val trimStart get() = num("trimStart", 0.0)
    val trimEnd get() = num("trimEnd", 0.0)

    /** These settings with the file's own ones on top (its own size, format, tick boxes, trim). */
    fun merged(vararg extra: JSONObject?): Settings {
        val c = JSONObject(j.toString())
        for (e in extra) if (e != null) for (k in e.keys()) c.put(k, e.get(k))
        return Settings(c)
    }

    /** A copy with some values changed. */
    fun with(vararg kv: Pair<String, Any>): Settings {
        val c = JSONObject(j.toString())
        for ((k, v) in kv) c.put(k, v)
        return Settings(c)
    }
}

/** One file being worked on: progress, stage, stop button and a private work folder. */
class Ctx(val item: Engine.Item, val tmp: File, private val cancellable: Boolean = true) {
    val aborted: Boolean get() = cancellable && Engine.abortRequested
    fun stage(t: String) { item.stage = t }
    fun progress(p: Double) { item.progress = p.coerceIn(0.0, 1.0) }
    fun check() { if (aborted) throw Skip("stopped") }
}

/** Why something failed, in plain words (shown by "Why did it fail?"). */
class Why(val title: String, val causes: List<String>, val tips: List<String>) {
    fun json(): JSONObject = JSONObject().put("title", title).put("causes", JSONArray(causes)).put("tips", JSONArray(tips))
}

fun diagnose(msg: String?, kind: String): Why {
    val m = (msg ?: "").lowercase()
    fun d(t: String, c: List<String>, tips: List<String>) = Why(t, c, tips)
    return when {
        "ffmpeg is missing" in m -> d("The video engine is missing", listOf("The app was installed without its video engine, or the phone blocked it."), listOf("Install the app again from the latest release."))
        "password" in m -> d("The file is locked with a password", listOf("The file is protected, so its content can't be read or rewritten."), listOf("Open it with the password and save or print a copy without protection, then try again."))
        "trim leaves" in m -> d("The trim is too short", listOf("Start and end are less than half a second apart."), listOf("Open the file's options and set a longer part to keep."))
        "needs at least" in m -> {
            val x = Regex("""(\d+) min long, it needs at least (\d+) MB""").find(msg ?: "")?.groupValues
            d("The size you picked is too small for this video", listOf("This video is ${x?.get(1) ?: "?"} min long: at this size it needs at least ${x?.get(2) ?: "?"} MB."),
                listOf("Pick a bigger size in MB, or a higher percentage.", "Or trim it to the part you need (file options, Trim)."))
        }
        "target too small" in m -> d("The size you picked is too small", listOf("At that size there are too few bits per second left for a watchable video or audio."),
            listOf("Pick a higher percentage or a bigger size.", if (kind == "VIDEO") "Or lower the resolution yourself in Settings." else "Or convert it to Opus, which sounds better at small sizes."))
        "no audio" in m || "no streams" in m -> d("There's no sound in this file", listOf("The file has no audio track to compress or extract."), listOf("If it's a video, choose a video format instead of MP3/M4A."))
        "couldn't read the length" in m -> d("The file couldn't be read", listOf("The file may be damaged or only partly downloaded."), listOf("Check that the file plays correctly in a player.", "Try 'Convert only' to MP4 first, then compress the converted file."))
        "enospc" in m || "no space" in m -> d("The phone storage is full", listOf("There isn't enough free space to write the compressed copy."), listOf("Free up some space or choose another output folder."))
        "eacces" in m || "eperm" in m || "permission denied" in m -> d("The phone didn't allow writing the file", listOf("The app may not have access to all files, or the output folder is protected."), listOf("Allow access to all files when the app asks.", "Choose another output folder in Settings."))
        "enoent" in m || "no such file" in m || "isn't there" in m -> d("The file isn't there anymore", listOf("It was moved, renamed or deleted after it was added to the list."), listOf("Remove it from the list and add it again."))
        "couldn't open this picture" in m -> d("The picture couldn't be opened", listOf("The file may be damaged, or not really an image despite its extension.", "Some rare variants (unusual TIFF or HEIC flavours) aren't supported."), listOf("Open it in the Gallery, save or share a copy as JPG, then retry."))
        "valid office" in m -> d("The Office file couldn't be opened", listOf("It may be protected with a password.", "It may be an old .doc/.ppt/.xls file renamed to .docx/.pptx/.xlsx."), listOf("Open it in Word, PowerPoint or Excel and save a fresh .docx/.pptx/.xlsx copy."))
        "open this pdf" in m -> d("The PDF couldn't be opened", listOf("The file may be damaged or incomplete (for example an interrupted download or copy)."), listOf("Check that the file opens correctly in a PDF reader.", "Print it to a new PDF, then try again."))
        "memory" in m || "allocation" in m -> d("Not enough memory", listOf("The file is very large (for example a huge photo or PDF)."), listOf("Close other apps and try again, or process this file on its own."))
        "ffmpeg could not process" in m -> d("The video/audio engine couldn't read or write this file", listOf("It may use an unusual codec, or be copy-protected (DRM).", "The file may have broken timestamps or an unusual structure."), listOf("Check that the file plays correctly in a player.", "Use 'Convert only' to MP4 first, then compress the converted file."))
        else -> d("Something unexpected went wrong", listOf("The file may be damaged or in a variant the app doesn't handle."), listOf("Try the file again on its own."))
    }
}

fun skipReason(msg: String?): String = when (msg) {
    "signed" -> "Digitally signed: left untouched so the signature stays valid"
    "protected" -> "Protected PDF (editing restrictions): left untouched"
    "stopped" -> "Stopped, original untouched"
    "same format" -> "Already in that format"
    "below target" -> "Already below the size you picked"
    "already well compressed" -> "Already well compressed, couldn't make it smaller"
    "cannot convert" -> "PDF and Office files can only be compressed"
    "discarded" -> "Discarded, original untouched"
    else -> msg ?: "Skipped"
}

fun File.extLower(): String = name.substringAfterLast('.', "").lowercase()
fun String.extLower(): String = substringAfterLast('/').substringAfterLast('.', "").lowercase()
fun File.withExt(ext: String): File = File(parentFile, name.substringBeforeLast('.') + "." + ext)
