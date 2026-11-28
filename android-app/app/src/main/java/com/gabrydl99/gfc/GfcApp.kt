package com.gabrydl99.gfc

import android.app.Application
import com.gabrydl99.gfc.work.AppLog
import com.gabrydl99.gfc.work.Engine
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader

class GfcApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AppLog.init(this)
        com.gabrydl99.gfc.work.Tr.init(this)
        Engine.init(this)
        PDFBoxResourceLoader.init(applicationContext)
    }
}
