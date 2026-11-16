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
    private var trackId = ""
    private var artist = ""
    private var album = ""
    private var artworkUrl = ""
    private var artwork: Bitmap? = null
    private var playing = false
    private var liked = false
    private var positionMs = -1L
    private var durationMs = 0L
    private var positionAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW))
        session = MediaSessionCompat(this, "CPN").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    playing = true
                    positionAt = android.os.SystemClock.elapsedRealtime()
                    update()
                    MainActivity.play(this@PlaybackService)
                }
                override fun onPause() = MainActivity.sendAction("pause")
                override fun onSkipToNext() = MainActivity.sendAction("next")
                override fun onSkipToPrevious() = MainActivity.sendAction("prev")
                override fun onStop() = MainActivity.sendAction("pause")
                // Barra de avance de la notificación y de la pantalla bloqueada
                override fun onSeekTo(pos: Long) {
                    positionMs = pos
                    positionAt = android.os.SystemClock.elapsedRealtime()
                    MainActivity.sendAction("seek:$pos")
                    update()
                }
                override fun onCustomAction(action: String?, extras: android.os.Bundle?) {
                    if (action == ACTION_LIKE) toggleLike()
                }
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            // Con respaldo: si la página no responde o no suena, se recupera sola (ver MainActivity.play)
            ACTION_PLAY -> {
                // El botón cambia al instante y el teléfono no se duerme mientras arranca
                playing = true
                positionAt = android.os.SystemClock.elapsedRealtime()
                MainActivity.play(this)
            }
            ACTION_PAUSE -> MainActivity.sendAction("pause")
            ACTION_NEXT -> MainActivity.sendAction("next")
            ACTION_PREV -> MainActivity.sendAction("prev")
            ACTION_LIKE -> {
                toggleLike()
                return START_NOT_STICKY
            }
            ACTION_STATE -> {
                if (!intent.getBooleanExtra("visible", true)) {
                    stopEverything()
                    return START_NOT_STICKY
                }
                title = intent.getStringExtra("title") ?: ""
                trackId = intent.getStringExtra("id") ?: ""
                artist = intent.getStringExtra("artist") ?: ""
                album = intent.getStringExtra("album").orEmpty()
                playing = intent.getBooleanExtra("playing", false)
                liked = intent.getBooleanExtra("liked", false)
                val pos = intent.getDoubleExtra("position", -1.0)
                val dur = intent.getDoubleExtra("duration", 0.0)
                positionMs = if (pos >= 0) (pos * 1000).toLong() else -1L
                durationMs = if (dur > 0 && dur.isFinite()) (dur * 1000).toLong() else 0L
                positionAt = android.os.SystemClock.elapsedRealtime()
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
        // Android 12 o anterior: el play de la notificación pasa por la pantalla invisible (despierta
        // la app aunque lleve horas en pausa). En Android 13+ los botones van por la sesión de medios.
        if (act == ACTION_PLAY && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            val pi = PendingIntent.getActivity(
                this, 101,
                Intent(this, PlayActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            return NotificationCompat.Action(icon, label, pi)
        }
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
                // Radios de auto (Bluetooth) muestran el álbum: sin él decían «Unavailable»
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album.ifBlank { getString(R.string.app_name) })
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ARTIST, artist)
                .apply { artwork?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) } }
                // Con la duración, Android muestra la barra de avance
                .apply { if (durationMs > 0) putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs) }
                .build()
        )
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                        (if (durationMs > 0) PlaybackStateCompat.ACTION_SEEK_TO else 0L)
                )
                // Posición en que va (Android la hace avanzar sola mientras suena)
                .setState(
                    if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                    if (positionMs >= 0) positionMs else PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
                    if (playing) 1f else 0f,
                    positionAt
                )
                // ♥ Me gusta (Android 13+ lo muestra junto a los controles)
                .addCustomAction(
                    PlaybackStateCompat.CustomAction.Builder(ACTION_LIKE, if (liked) "Quitar de Me gusta" else "Me gusta", if (liked) R.drawable.ic_heart_filled else R.drawable.ic_heart).build()
                )
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
            .addAction(action(if (liked) R.drawable.ic_heart_filled else R.drawable.ic_heart, if (liked) "Quitar de Me gusta" else "Me gusta", ACTION_LIKE))
            .setStyle(MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
            // Con la app del reloj instalada, la notificación no se copia al reloj: así en la esfera
            // queda el ícono de la app del reloj (que la abre) y no el de los controles del sistema
            .setLocalOnly(WearSync.hasWatchApp(this))
            .build()

        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        )
        if (playing) acquireLocks() else releaseLocks()
        PlayerWidget.show(this, title, artist, playing, liked, artwork)
        // Reloj: lo que suena y su carátula
        WearSync.art(this, artworkUrl, artwork)
        // Lo que suena, para la cuenta (PulsoMedia y el navegador lo ven aunque la app esté en segundo plano)
        Presence.update(this, playing, if (trackId.isNotEmpty()) org.json.JSONObject()
            .put("id", trackId).put("title", title).put("channelTitle", artist).put("thumbnail", artworkUrl)
            .put("pos", if (positionMs >= 0) positionMs / 1000.0 else 0.0).put("dur", durationMs / 1000.0) else null)
        WearSync.state(
            this,
            org.json.JSONObject()
                .put("title", title).put("artist", artist).put("artwork", artworkUrl)
                .put("playing", playing).put("liked", liked)
                .put("position", positionMs).put("duration", durationMs)
                .put("at", System.currentTimeMillis() - (android.os.SystemClock.elapsedRealtime() - positionAt))
                .toString()
        )
    }

    /** ♥ al momento (sin esperar a la web) y la web guarda o quita la canción */
    private fun toggleLike() {
        liked = !liked
        MainActivity.sendAction("like")
        update()
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
        Presence.stop()
        releaseLocks()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        Presence.stop()
        releaseLocks()
        // Sin música: el widget vuelve a abrir la app al tocarlo
        PlayerWidget.idle(this)
        WearSync.stopped(this)
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
        const val ACTION_LIKE = "cpn.LIKE"
    }
}
