package cl.carlospnauto.app

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.mediarouter.app.MediaRouteButton
import androidx.mediarouter.app.MediaRouteChooserDialog
import com.google.android.gms.cast.framework.CastButtonFactory
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

    private fun report(state: String, device: String? = null, pos: Double? = null, dur: Double? = null) {
        val o = JSONObject().put("state", state)
        if (device != null) o.put("device", device)
        // Segundo en que va y duración en la TV (la barra del teléfono avanza con eso)
        if (pos != null) o.put("pos", pos)
        if (dur != null && dur > 0) o.put("dur", dur)
        MainActivity.toWeb("window.__cpnCast && window.__cpnCast(${o})")
    }

    private val listener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarted(session: CastSession, sessionId: String) = connected(session)
        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) = connected(session)
        override fun onSessionEnded(session: CastSession, error: Int) = report("idle")
        override fun onSessionStartFailed(session: CastSession, error: Int) {
            pending = null
            tell("No se pudo conectar con la TV (código $error). Prueba de nuevo.")
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
        // Al volver a la app (o si se reinició): se sigue escuchando a la TV (tiempo y estado)
        session.remoteMediaClient?.let { c ->
            watch(c, session.castDevice?.friendlyName)
            if (pending == null) when (c.playerState) {
                MediaStatus.PLAYER_STATE_PLAYING -> report("playing", session.castDevice?.friendlyName)
                MediaStatus.PLAYER_STATE_PAUSED -> report("paused", session.castDevice?.friendlyName)
                else -> {}
            }
        }
        pending?.let {
            pending = null
            load(session, it)
        }
    }

    private var appCtx: android.content.Context? = null

    /** Aviso en pantalla (así nunca «no pasa nada») */
    private fun tell(text: String) {
        val c = appCtx ?: return
        android.os.Handler(android.os.Looper.getMainLooper()).post { runCatching { Toast.makeText(c, text, Toast.LENGTH_LONG).show() } }
    }

    /** Botón de Google para elegir la TV (invisible, dentro de la app): abre su lista oficial */
    private var routeButton: MediaRouteButton? = null

    /** Se pone al abrir la app (tiene que estar en pantalla para poder abrir la lista) */
    private fun addRouteButton(activity: AppCompatActivity) {
        if (routeButton?.context === activity) return
        routeButton = runCatching {
            MediaRouteButton(activity).also { btn ->
                CastButtonFactory.setUpMediaRouteButton(activity.applicationContext, btn)
                btn.visibility = View.INVISIBLE
                activity.findViewById<ViewGroup>(android.R.id.content).addView(btn, ViewGroup.LayoutParams(1, 1))
            }
        }.onFailure { Log.w(TAG, "Botón de TV: ${it.message}") }.getOrNull()
    }

    private fun chooser(activity: AppCompatActivity): Boolean {
        addRouteButton(activity)
        val b = routeButton ?: return false
        return runCatching { b.showDialog() }.onFailure { Log.w(TAG, "Lista de Google: ${it.message}") }.getOrDefault(false)
    }

    fun init(activity: AppCompatActivity) {
        appCtx = activity.applicationContext
        if (ctx != null) return addRouteButton(activity)
        ctx = runCatching { CastContext.getSharedInstance(activity) }.onFailure { Log.w(TAG, "Sin Cast: ${it.message}") }.getOrNull()
        ctx?.sessionManager?.addSessionManagerListener(listener, CastSession::class.java)
        if (ctx != null) addRouteButton(activity)
    }

    fun available(): Boolean = ctx != null

    fun cast(activity: AppCompatActivity, json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        init(activity)
        val c = ctx ?: run {
            tell("Este teléfono no tiene el servicio de transmisión de Google (actualiza «Servicios de Google Play»). Para otra TV usa «Otro televisor».")
            return report("unsupported")
        }
        val s = c.sessionManager.currentCastSession
        if (s != null && s.isConnected) return load(s, o)
        pending = o
        // La lista oficial de Google (busca las TV de la casa); si no se puede, la lista propia
        if (chooser(activity)) return
        val selector = c.mergedSelector ?: run {
            tell("No se pudo buscar televisores en este teléfono")
            return report("unsupported")
        }
        runCatching {
            MediaRouteChooserDialog(activity).apply {
                routeSelector = selector
                setTitle("Transmitir a la TV")
                setOnCancelListener { if (c.sessionManager.currentCastSession == null) { pending = null; report("idle") } }
            }.show()
        }.onFailure {
            Log.w(TAG, "Lista de TV: ${it.message}")
            tell("No se pudo abrir la lista de televisores")
            report("error")
        }
    }

    private fun load(session: CastSession, o: JSONObject) {
        val c = session.remoteMediaClient ?: return report("error")
        // Lo que la TV no puede pedir directo (YouTube, archivos del teléfono) pasa por el teléfono
        val url = when {
            o.has("yt") -> (AudioServer.castBase() ?: run {
                tell("El teléfono debe estar conectado al Wi-Fi para transmitir")
                return report("error")
            }) + (if (o.optBoolean("video")) "/d/" + o.getString("yt") + ".mpd" else "/yt/" + o.getString("yt"))
            o.optString("url").startsWith("http://127.0.0.1") -> {
                val base = AudioServer.castBase() ?: run {
                    tell("El teléfono debe estar conectado al Wi-Fi para transmitir")
                    return report("error")
                }
                base + Uri.parse(o.optString("url")).let { (it.encodedPath ?: "") + (it.encodedQuery?.let { q -> "?$q" } ?: "") }
            }
            else -> o.optString("url")
        }
        if (url.isBlank()) {
            tell("No hay nada que enviar a la TV")
            return report("error")
        }
        val video = o.optBoolean("video") || o.optString("kind") == "video"
        val meta = MediaMetadata(if (video) MediaMetadata.MEDIA_TYPE_MOVIE else MediaMetadata.MEDIA_TYPE_MUSIC_TRACK).apply {
            putString(MediaMetadata.KEY_TITLE, o.optString("title", "Pulso"))
            putString(if (video) MediaMetadata.KEY_SUBTITLE else MediaMetadata.KEY_ARTIST, o.optString("subtitle", ""))
            o.optString("image").takeIf { it.startsWith("http") }?.let { addImage(WebImage(Uri.parse(it))) }
        }
        val mime = when {
            Regex("m3u8|/api/hls", RegexOption.IGNORE_CASE).containsMatchIn(url) -> "application/x-mpegurl"
            // Video de YouTube: imagen y sonido por separado (DASH), que la TV junta
            url.endsWith(".mpd") -> "application/dash+xml"
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
        c.load(req).setResultCallback { r ->
            if (!r.status.isSuccess) {
                tell("La TV no pudo reproducir esto (código ${r.status.statusCode})")
                report("error", session.castDevice?.friendlyName)
            }
        }
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

    // Cada segundo: en qué segundo va lo que suena en la TV
    private val progress = RemoteMediaClient.ProgressListener { p, d ->
        report("progress", ctx?.sessionManager?.currentCastSession?.castDevice?.friendlyName, p / 1000.0, d / 1000.0)
    }

    private fun watch(c: RemoteMediaClient, device: String?) {
        if (client === c) return
        client?.unregisterCallback(callback)
        client?.removeProgressListener(progress)
        client = c
        c.registerCallback(callback)
        c.addProgressListener(progress, 1000)
    }

    fun control(action: String) {
        val c = ctx?.sessionManager?.currentCastSession?.remoteMediaClient ?: return
        when (action) {
            "play" -> c.play()
            "pause" -> c.pause()
            // Mover la línea de tiempo de la TV desde el teléfono: "seek:SEGUNDOS"
            else -> action.removePrefix("seek:").takeIf { action.startsWith("seek:") }?.toDoubleOrNull()?.let { sec ->
                c.seek(com.google.android.gms.cast.MediaSeekOptions.Builder().setPosition((sec * 1000).toLong().coerceAtLeast(0)).build())
            }
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
