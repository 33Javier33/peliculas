package cl.carlospnauto.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media.app.NotificationCompat.MediaStyle
import kotlin.concurrent.thread

/**
 * Servicio en primer plano mientras suena algo: Android no cierra la app con la pantalla
 * bloqueada o al usar otras apps. Muestra la notificación con los controles (también en la
 * pantalla de bloqueo y auriculares) y se los pasa a la app web.
 */
class PlaybackService : Service() {
    private lateinit var session: MediaSessionCompat
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var title = ""
    private var artist = ""
    private var artworkUrl = ""
    private var artwork: Bitmap? = null
    private var playing = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW))
        session = MediaSessionCompat(this, "CPN").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() = MainActivity.sendAction("play")
                override fun onPause() = MainActivity.sendAction("pause")
                override fun onSkipToNext() = MainActivity.sendAction("next")
                override fun onSkipToPrevious() = MainActivity.sendAction("prev")
                override fun onStop() = MainActivity.sendAction("pause")
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> MainActivity.sendAction("play")
            ACTION_PAUSE -> MainActivity.sendAction("pause")
            ACTION_NEXT -> MainActivity.sendAction("next")
            ACTION_PREV -> MainActivity.sendAction("prev")
            ACTION_STATE -> {
                if (!intent.getBooleanExtra("visible", true)) {
                    stopEverything()
                    return START_NOT_STICKY
                }
                title = intent.getStringExtra("title") ?: ""
                artist = intent.getStringExtra("artist") ?: ""
                playing = intent.getBooleanExtra("playing", false)
                val art = intent.getStringExtra("artwork") ?: ""
                if (art != artworkUrl) {
                    artworkUrl = art
                    artwork = null
                    loadArtwork(art)
                }
            }
        }
        update()
        return START_NOT_STICKY
    }

    private fun loadArtwork(url: String) {
        if (!url.startsWith("http")) return
        thread {
            val bmp = runCatching {
                OkDownloader.instance.client.newCall(okhttp3.Request.Builder().url(url).build()).execute().use { r ->
                    r.body?.bytes()?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
                }
            }.getOrNull()
            if (url == artworkUrl && bmp != null) {
                artwork = bmp
                update()
            }
        }
    }

    private fun action(icon: Int, label: String, act: String): NotificationCompat.Action {
        val pi = PendingIntent.getService(
            this, act.hashCode(), Intent(this, PlaybackService::class.java).setAction(act),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Action(icon, label, pi)
    }

    private fun update() {
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .apply { artwork?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) } }
                .build()
        )
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                )
                .setState(if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build()
        )

        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_music)
            .setContentTitle(title.ifBlank { getString(R.string.app_name) })
            .setContentText(artist)
            .setLargeIcon(artwork)
            .setContentIntent(open)
            .setOngoing(playing)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(action(R.drawable.ic_prev, "Anterior", ACTION_PREV))
            .addAction(if (playing) action(R.drawable.ic_pause, "Pausar", ACTION_PAUSE) else action(R.drawable.ic_play, "Reproducir", ACTION_PLAY))
            .addAction(action(R.drawable.ic_next, "Siguiente", ACTION_NEXT))
            .setStyle(MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
            .build()

        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        )
        if (playing) acquireLocks() else releaseLocks()
    }

    // Mantiene la CPU y el Wi-Fi activos con la pantalla apagada mientras suena
    private fun acquireLocks() {
        if (wakeLock == null) {
            wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CPN:playback").apply { setReferenceCounted(false) }
        }
        if (wakeLock?.isHeld == false) wakeLock?.acquire(6 * 60 * 60 * 1000L)
        if (wifiLock == null) {
            @Suppress("DEPRECATION")
            wifiLock = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
                .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "CPN:playback").apply { setReferenceCounted(false) }
        }
        if (wifiLock?.isHeld == false) wifiLock?.acquire()
    }

    private fun releaseLocks() {
        if (wakeLock?.isHeld == true) wakeLock?.release()
        if (wifiLock?.isHeld == true) wifiLock?.release()
    }

    private fun stopEverything() {
        releaseLocks()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        releaseLocks()
        session.release()
        super.onDestroy()
    }

    companion object {
        const val CHANNEL = "playback"
        const val NOTIFICATION_ID = 7
        const val ACTION_STATE = "cpn.STATE"
        const val ACTION_PLAY = "cpn.PLAY"
        const val ACTION_PAUSE = "cpn.PAUSE"
        const val ACTION_NEXT = "cpn.NEXT"
        const val ACTION_PREV = "cpn.PREV"
    }
}
