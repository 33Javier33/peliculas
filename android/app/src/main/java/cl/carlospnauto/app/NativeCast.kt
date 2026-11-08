package cl.carlospnauto.app

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.mediarouter.app.MediaRouteChooserDialog
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.images.WebImage
import org.json.JSONObject

/**
 * Transmitir a la TV desde la app (Chromecast, Google TV, TV con Chromecast integrado): se elige
 * la TV en una lista de la propia app y la TV reproduce sola el video, la canción o la radio (el
 * teléfono queda libre). Antes la app pedía duplicar la pantalla desde la barra del teléfono.
 *
 * Desde la página: CPNNative.castMedia(json) con {url | yt, video, title, subtitle, image, live,
 * position}; CPNNative.castStop(). El estado llega a window.__cpnCast({state, device}).
 */
object NativeCast {
    private const val TAG = "NativeCast"
    private var ctx: CastContext? = null
    private var pending: JSONObject? = null
    private var client: RemoteMediaClient? = null

    private fun report(state: String, device: String? = null) {
        val o = JSONObject().put("state", state)
        if (device != null) o.put("device", device)
        MainActivity.toWeb("window.__cpnCast && window.__cpnCast(${o})")
    }

    private val listener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarted(session: CastSession, sessionId: String) = connected(session)
        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) = connected(session)
        override fun onSessionEnded(session: CastSession, error: Int) = report("idle")
        override fun onSessionStartFailed(session: CastSession, error: Int) {
            pending = null
            report("error")
        }
        override fun onSessionStarting(session: CastSession) = report("connecting")
        override fun onSessionEnding(session: CastSession) {}
        override fun onSessionResumeFailed(session: CastSession, error: Int) {}
        override fun onSessionResuming(session: CastSession, sessionId: String) {}
        override fun onSessionSuspended(session: CastSession, reason: Int) {}
    }

    private fun connected(session: CastSession) {
        report("connected", session.castDevice?.friendlyName)
        pending?.let {
            pending = null
            load(session, it)
        }
    }

    fun init(activity: AppCompatActivity) {
        if (ctx != null) return
        ctx = runCatching { CastContext.getSharedInstance(activity) }.onFailure { Log.w(TAG, "Sin Cast: ${it.message}") }.getOrNull()
        ctx?.sessionManager?.addSessionManagerListener(listener, CastSession::class.java)
    }

    fun available(): Boolean = ctx != null

    fun cast(activity: AppCompatActivity, json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        init(activity)
        val c = ctx ?: return report("unsupported")
        val s = c.sessionManager.currentCastSession
        if (s != null && s.isConnected) return load(s, o)
        pending = o
        val selector = c.mergedSelector ?: return report("unsupported")
        runCatching {
            MediaRouteChooserDialog(activity).apply {
                routeSelector = selector
                setTitle("Transmitir a la TV")
                setOnCancelListener { if (c.sessionManager.currentCastSession == null) { pending = null; report("idle") } }
            }.show()
        }.onFailure { report("error") }
    }

    private fun load(session: CastSession, o: JSONObject) {
        val c = session.remoteMediaClient ?: return report("error")
        // Lo que la TV no puede pedir directo (YouTube, archivos del teléfono) pasa por el teléfono
        val url = when {
            o.has("yt") -> (AudioServer.castBase() ?: return report("error")) + (if (o.optBoolean("video")) "/v/" else "/yt/") + o.getString("yt")
            o.optString("url").startsWith("http://127.0.0.1") -> {
                val base = AudioServer.castBase() ?: return report("error")
                base + Uri.parse(o.optString("url")).let { (it.encodedPath ?: "") + (it.encodedQuery?.let { q -> "?$q" } ?: "") }
            }
            else -> o.optString("url")
        }
        if (url.isBlank()) return report("error")
        val video = o.optBoolean("video") || o.optString("kind") == "video"
        val meta = MediaMetadata(if (video) MediaMetadata.MEDIA_TYPE_MOVIE else MediaMetadata.MEDIA_TYPE_MUSIC_TRACK).apply {
            putString(MediaMetadata.KEY_TITLE, o.optString("title", "Pulso"))
            putString(if (video) MediaMetadata.KEY_SUBTITLE else MediaMetadata.KEY_ARTIST, o.optString("subtitle", ""))
            o.optString("image").takeIf { it.startsWith("http") }?.let { addImage(WebImage(Uri.parse(it))) }
        }
        val mime = when {
            Regex("m3u8|/api/hls", RegexOption.IGNORE_CASE).containsMatchIn(url) -> "application/x-mpegurl"
            video -> "video/mp4"
            else -> o.optString("mime").ifBlank { "audio/mp4" }
        }
        val info = MediaInfo.Builder(url)
            .setStreamType(if (o.optBoolean("live")) MediaInfo.STREAM_TYPE_LIVE else MediaInfo.STREAM_TYPE_BUFFERED)
            .setContentType(mime)
            .setMetadata(meta)
            .build()
        val req = MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true)
            .setCurrentTime((o.optDouble("position", 0.0) * 1000).toLong().coerceAtLeast(0)).build()
        report("loading", session.castDevice?.friendlyName)
        watch(c, session.castDevice?.friendlyName)
        c.load(req).setResultCallback { r -> if (!r.status.isSuccess) report("error", session.castDevice?.friendlyName) }
    }

    private val callback = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() {
            val c = client ?: return
            val dev = ctx?.sessionManager?.currentCastSession?.castDevice?.friendlyName
            when (c.playerState) {
                MediaStatus.PLAYER_STATE_PLAYING -> report("playing", dev)
                MediaStatus.PLAYER_STATE_PAUSED -> report("paused", dev)
                MediaStatus.PLAYER_STATE_IDLE -> when (c.idleReason) {
                    MediaStatus.IDLE_REASON_FINISHED -> report("ended", dev)
                    MediaStatus.IDLE_REASON_ERROR -> report("error", dev)
                    else -> {}
                }
                else -> {}
            }
        }
    }

    private fun watch(c: RemoteMediaClient, device: String?) {
        if (client === c) return
        client?.unregisterCallback(callback)
        client = c
        c.registerCallback(callback)
    }

    fun control(action: String) {
        val c = ctx?.sessionManager?.currentCastSession?.remoteMediaClient ?: return
        when (action) {
            "play" -> c.play()
            "pause" -> c.pause()
        }
    }

    fun stop() {
        ctx?.sessionManager?.endCurrentSession(true)
        report("idle")
    }

    /** TV sin Chromecast: abre directo «Transmitir / Smart View / Duplicar pantalla» del teléfono */
    fun openMirroring(activity: AppCompatActivity) {
        val tries = listOf(Intent(Settings.ACTION_CAST_SETTINGS), Intent("android.settings.WIFI_DISPLAY_SETTINGS"), Intent("com.samsung.android.smartmirroring.CONTROLLER"))
        for (i in tries) {
            if (runCatching { activity.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess) return
        }
    }
}
