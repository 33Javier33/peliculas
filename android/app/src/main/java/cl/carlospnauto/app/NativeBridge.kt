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
        val intent = Intent(context, PlaybackService::class.java).apply {
            action = PlaybackService.ACTION_STATE
            putExtra("title", o.optString("title"))
            putExtra("artist", o.optString("artist"))
            putExtra("artwork", o.optString("artwork"))
            putExtra("playing", o.optBoolean("playing"))
            putExtra("visible", o.optBoolean("visible", true))
            putExtra("liked", o.optBoolean("liked"))
            if (o.has("position")) putExtra("position", o.optDouble("position", -1.0))
            if (o.has("duration")) putExtra("duration", o.optDouble("duration", 0.0))
        }
        if (o.optBoolean("visible", true)) ContextCompat.startForegroundService(context, intent)
        else context.startService(intent)
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
