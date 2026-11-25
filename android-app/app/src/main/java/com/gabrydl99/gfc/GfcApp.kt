package com.gabrydl99.gfc

import android.app.Application
import com.gabrydl99.gfc.work.Engine
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader

class GfcApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Engine.init(this)
        PDFBoxResourceLoader.init(applicationContext)
    }
}
