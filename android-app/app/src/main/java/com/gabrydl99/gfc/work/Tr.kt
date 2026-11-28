package com.gabrydl99.gfc.work

import android.content.Context

/** The app's own messages (notifications, short notices) in the language picked in the page, from the same
 *  www/locales/<code>.txt files the page uses. */
object Tr {
    @Volatile private var dict: Map<String, String> = emptyMap()
    @Volatile private var lang = ""

    private fun read(ctx: Context, code: String): Map<Int, String> = try {
        ctx.assets.open("www/locales/$code.txt").bufferedReader(Charsets.UTF_8).useLines { ls ->
            ls.mapNotNull { l -> val i = l.indexOf('|'); if (i > 0) l.substring(0, i).toIntOrNull()?.let { it to l.substring(i + 1).replace("\\n", "\n") } else null }.toMap()
        }
    } catch (_: Exception) { emptyMap() }

    fun init(ctx: Context) {
        val saved = ctx.getSharedPreferences("gfc", Context.MODE_PRIVATE).getString("lang", "") ?: ""
        if (saved.isNotEmpty()) load(ctx, saved)
    }

    fun setLang(ctx: Context, code: String) {
        if (code.isEmpty() || code == lang) return
        ctx.getSharedPreferences("gfc", Context.MODE_PRIVATE).edit().putString("lang", code).apply()
        load(ctx, code)
    }

    private fun load(ctx: Context, code: String) {
        lang = code
        if (code == "en") { dict = emptyMap(); return }
        val en = read(ctx, "en"); val tr = read(ctx, code)
        dict = en.mapNotNull { (n, e) -> tr[n]?.let { e to it } }.toMap()
    }

    /** [text] in the chosen language, with {0}, {1}... filled in. */
    fun t(text: String, vararg args: Any): String {
        var s = dict[text] ?: text
        args.forEachIndexed { i, a -> s = s.replace("{$i}", a.toString()) }
        return s
    }
}
