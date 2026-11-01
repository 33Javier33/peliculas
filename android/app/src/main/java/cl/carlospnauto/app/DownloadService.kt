package cl.carlospnauto.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Mientras la app descarga música para escuchar sin conexión: notificación "Descargando…" y la
 * app sigue trabajando aunque se salga de ella o se bloquee la pantalla. Al terminar avisa.
 */
class DownloadService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var lastTitle = ""

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel(CHANNEL, "Descargas", NotificationManager.IMPORTANCE_LOW))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val active = intent?.getBooleanExtra("active", false) ?: false
        if (!active) {
            finish()
            return START_NOT_STICKY
        }
        val title = intent?.getStringExtra("title") ?: "Música"
        val done = intent?.getIntExtra("done", 0) ?: 0
        val total = intent?.getIntExtra("total", 0) ?: 0
        lastTitle = title
        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Descargando: $title")
            .setContentText(if (total > 0) "Canción ${minOf(done + 1, total)} de $total · puedes salir de la app" else "Puedes salir de la app")
            .setProgress(maxOf(total, 1), done, total == 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp())
            .build()
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
        )
        acquireLocks()
        return START_NOT_STICKY
    }

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        this, 1, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    private fun finish() {
        releaseLocks()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        if (lastTitle.isNotEmpty()) {
            // Aviso final: ya se puede escuchar sin internet
            getSystemService(NotificationManager::class.java).notify(
                DONE_ID,
                NotificationCompat.Builder(this, CHANNEL)
                    .setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentTitle("Descarga lista: $lastTitle")
                    .setContentText("Ya está en tu teléfono: suena sin internet")
                    .setAutoCancel(true)
                    .setContentIntent(openApp())
                    .build()
            )
        }
        stopSelf()
    }

    private fun acquireLocks() {
        if (wakeLock?.isHeld != true) {
            wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CPN:descargas").apply { acquire(2 * 60 * 60 * 1000L) }
        }
        if (wifiLock?.isHeld != true) {
            @Suppress("DEPRECATION")
            wifiLock = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
                .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "CPN:descargas").apply { acquire() }
        }
    }

    private fun releaseLocks() {
        runCatching { wakeLock?.takeIf { it.isHeld }?.release() }
        runCatching { wifiLock?.takeIf { it.isHeld }?.release() }
    }

    override fun onDestroy() {
        releaseLocks()
        super.onDestroy()
    }

    companion object {
        const val CHANNEL = "downloads"
        const val NOTIFICATION_ID = 8
        const val DONE_ID = 9
    }
}
