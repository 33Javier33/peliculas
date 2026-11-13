package cl.carlospnauto.app

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * Lo que la app web puede pedirle al teléfono (window.CPNNative):
 *  - audioBase(): dirección del servidor local de audio (http://127.0.0.1:PUERTO)
 *  - mediaState(json): qué suena y si está sonando → notificación y controles de pantalla bloqueada
 *  - videoState(active): hay un video sonando → al salir de la app sigue en una ventana flotante
 *  - prefetch(id): dejar lista la siguiente canción
 */
class NativeBridge(private val context: Context) {
    @JavascriptInterface
    fun audioBase(): String = "http://127.0.0.1:${AudioServer.port}"

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    /** Menú "Compartir" de Android (WhatsApp, Telegram, correo…) con un texto y su enlace */
    @JavascriptInterface
    fun share(text: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        val chooser = Intent.createChooser(send, "Compartir").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(chooser) }
    }

    @JavascriptInterface
    fun mediaState(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        if (o.optBoolean("playing")) MainActivity.lastPlayingAt = System.currentTimeMillis()
        val intent = Intent(context, PlaybackService::class.java).apply {
            action = PlaybackService.ACTION_STATE
            putExtra("title", o.optString("title"))
            putExtra("artist", o.optString("artist"))
            putExtra("artwork", o.optString("artwork"))
            putExtra("playing", o.optBoolean("playing"))
            putExtra("visible", o.optBoolean("visible", true))
            putExtra("liked", o.optBoolean("liked"))
            putExtra("id", o.optString("id"))
            if (o.has("position")) putExtra("position", o.optDouble("position", -1.0))
            if (o.has("duration")) putExtra("duration", o.optDouble("duration", 0.0))
        }
        // Android 12+ puede no dejar iniciar el servicio desde atrás: entonces se le avisa al que ya corre
        if (o.optBoolean("visible", true)) runCatching { ContextCompat.startForegroundService(context, intent) }.onFailure { runCatching { context.startService(intent) } }
        else runCatching { context.startService(intent) }
    }

    /** La cuenta de la web (token): para que el teléfono avise lo que suena también en segundo plano */
    @JavascriptInterface
    fun presenceAccount(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        Presence.saveAccount(context, o)
    }

    /** Reloj: ver el video de lo que suena. Se busca su dirección y se le manda al reloj */
    @JavascriptInterface
    fun wearVideo(id: String, at: Double, title: String) {
        if (!Regex("^[A-Za-z0-9_-]{11}$").matches(id)) return
        kotlin.concurrent.thread {
            val o = JSONObject().put("id", id).put("at", if (at.isFinite()) at else 0.0).put("title", title.take(80))
            runCatching { AudioServer.videoForWatch(id) }
                .onSuccess { w ->
                    o.put("url", w.video).put("ua", w.videoUa).put("lan", w.lanVideo)
                    if (w.audio.isNotEmpty()) o.put("audio", w.audio).put("aua", w.audioUa).put("lanAudio", w.lanAudio)
                }
                .onFailure { o.put("error", "No se pudo preparar el video" + (it.message?.let { m -> " ($m)" }?.take(90) ?: "")) }
            WearSync.send(context, "/cpn/video", o.toString())
        }
    }

    /** El audio de la página de verdad está avanzando (para saber si el play funcionó) */
    @JavascriptInterface
    fun sounding() {
        MainActivity.lastSoundAt = System.currentTimeMillis()
    }

    @JavascriptInterface
    fun videoState(active: Boolean) = MainActivity.setVideoActive(active)

    /** Preparar la siguiente canción (buscar su audio y descargar el comienzo) */
    @JavascriptInterface
    fun prefetch(id: String) = AudioServer.prefetch(id)

    /** Preparar la siguiente canción de un disco de archive.org */
    @JavascriptInterface
    fun prefetchFile(url: String) = AudioServer.prefetchFile(url)

    /** La app sabe descargar e instalar su actualización (APK 1.0.16+) */
    @JavascriptInterface
    fun canDownload(): Boolean = true

    /** Ecualizador hecho por Android (sin chisporroteo): {on, gains, leveler} → "ok" | "unsupported" | "busy" */
    @JavascriptInterface
    fun eqNative(json: String): String = NativeEq.apply(json)

    // ===== Descargas como música del teléfono (no se borran al desinstalar la app) =====
    /** Biblioteca de la otra app (PulsoMedia ↔ PulsoMusic) en este teléfono; "" si no está */
    @JavascriptInterface
    fun otherLibrary(): String = PhoneBackup.readOther(context)

    /** «media» (PulsoMedia, completa) o «music» (PulsoMusic: solo música, radios y videos musicales) */
    @JavascriptInterface
    fun flavor(): String = BuildConfig.FLAVOR_NAME

    /** APK 1.0.53+: transmitir a la TV (Chromecast) desde la app */
    @JavascriptInterface
    fun castMedia(json: String) = MainActivity.onMain { NativeCast.cast(it, json) }

    @JavascriptInterface
    fun castStop() = MainActivity.onMain { NativeCast.stop() }

    @JavascriptInterface
    fun castControl(action: String) = MainActivity.onMain { NativeCast.control(action) }

    /** TV sin Chromecast: abre «Transmitir / Smart View» del teléfono directo */
    @JavascriptInterface
    fun openMirroring() = MainActivity.onMain { NativeCast.openMirroring(it) }

    /** APK 1.0.51+: detener una descarga al teléfono (sin avance o cancelada) */
    @JavascriptInterface
    fun cancelStore(req: String) = PhoneStorage.cancel(req)

    /** APK 1.0.51+: ¿la app se abrió con el play del widget? */
    @JavascriptInterface
    fun takeWidgetPlay(): Boolean = MainActivity.takeWidgetPlay()

    /** APK 1.0.51+: la app vuelve al fondo (la música sigue) */
    @JavascriptInterface
    fun toBackground() = MainActivity.toBackground()

    /** APK 1.0.49+: respaldo de la biblioteca en Descargas/PulsoMedia (queda al desinstalar) */
    @JavascriptInterface
    fun saveBackup(json: String): Boolean = PhoneBackup.save(context, json)

    @JavascriptInterface
    fun phoneStorage(): Boolean = PhoneStorage.supported()

    @JavascriptInterface
    fun storeDownload(req: String, src: String, name: String, folder: String, ext: String) =
        PhoneStorage.store(context, req, src, name, folder, ext)

    @JavascriptInterface
    fun listStored(): String = PhoneStorage.list(context)

    @JavascriptInterface
    fun deleteStored(id: String) {
        id.toLongOrNull()?.let { PhoneStorage.delete(context, it) }
    }

    /** ¿Puede leer la música del teléfono? (hace falta para recuperar descargas tras reinstalar) */
    @JavascriptInterface
    fun audioPermission(): String {
        val perm = if (android.os.Build.VERSION.SDK_INT >= 33) android.Manifest.permission.READ_MEDIA_AUDIO else android.Manifest.permission.READ_EXTERNAL_STORAGE
        return if (ContextCompat.checkSelfPermission(context, perm) == android.content.pm.PackageManager.PERMISSION_GRANTED) "granted" else "needed"
    }

    /** Pide el permiso de música; responde con window.__cpnPerm(true|false) */
    @JavascriptInterface
    fun askAudioPermission() = MainActivity.askAudioPermission()

    /** App del reloj: { used: se conectó alguna vez, v: su versión ("" si es anterior a informarla) } */
    @JavascriptInterface
    fun wearInfo(): String = JSONObject()
        .put("used", WearSync.hasWatchApp(context))
        .put("v", WearSync.watchVersion(context))
        .toString()

    /** Instalar en el reloj: descarga el APK (esfera o app del reloj) y lo pasa al reloj; avance en window.__cpnWatchInstall */
    @JavascriptInterface
    fun installOnWatch(url: String, name: String) = WatchInstall.start(context, url, name)

    /** Respuesta para el reloj (biblioteca, confirmaciones) */
    @JavascriptInterface
    fun wearReply(path: String, json: String) {
        if (path.startsWith("/cpn/")) WearSync.send(context, path, json)
    }

    /** Descargas en curso: { active, title, done, total } → notificación y la app sigue al salir */
    @JavascriptInterface
    fun downloadState(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        val active = o.optBoolean("active")
        val intent = Intent(context, DownloadService::class.java).apply {
            putExtra("active", active)
            putExtra("title", o.optString("title"))
            putExtra("done", o.optInt("done"))
            putExtra("total", o.optInt("total"))
        }
        runCatching {
            if (active) ContextCompat.startForegroundService(context, intent) else context.startService(intent)
        }
    }
}
