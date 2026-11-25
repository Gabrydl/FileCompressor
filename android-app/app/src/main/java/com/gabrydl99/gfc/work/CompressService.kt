package com.gabrydl99.gfc.work

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import com.gabrydl99.gfc.ui.MainActivity
import kotlin.concurrent.thread

/** Keeps the work going with the screen off or the app in the background (notification with progress). */
class CompressService : Service() {
    private var worker: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        channel()
        val n = note("Starting…", 0, 0, true)
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else startForeground(ID, n)
        if (worker?.isAlive == true) return START_NOT_STICKY
        val wl = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FileCompressor:work")
        wl.setReferenceCounted(false)
        wl.acquire(6 * 60 * 60 * 1000L)
        worker = thread(name = "compress") {
            val nm = getSystemService(NotificationManager::class.java)
            val ticker = thread(isDaemon = true) {
                try {
                    while (true) {
                        Thread.sleep(1000)
                        if (!Engine.running) break
                        val (done, total) = Engine.counts()
                        nm.notify(ID, note("Compressing ${minOf(done + 1, total)} of $total", done, total, false))
                    }
                } catch (_: InterruptedException) { }
            }
            try {
                Engine.runQueue { }
            } finally {
                ticker.interrupt()
                if (wl.isHeld) wl.release()
                val (done, _) = Engine.counts()
                stopForeground(STOP_FOREGROUND_REMOVE)
                if (!Engine.abortRequested) nm.notify(ID + 1, finished(done))
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun channel() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CH) == null) nm.createNotificationChannel(NotificationChannel(CH, "Compression", NotificationManager.IMPORTANCE_LOW))
    }

    private fun open(): PendingIntent = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun note(text: String, done: Int, total: Int, indeterminate: Boolean): Notification =
        Notification.Builder(this, CH).setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("FileCompressor").setContentText(text)
            .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open()).setProgress(maxOf(total, 1), done, indeterminate).build()

    private fun finished(done: Int): Notification =
        Notification.Builder(this, CH).setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle("FileCompressor")
            .setContentText(if (done == 1) "1 file finished" else "$done files finished").setAutoCancel(true).setContentIntent(open()).build()

    companion object {
        private const val CH = "work"
        private const val ID = 7
    }
}
