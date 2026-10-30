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
 */
class NativeBridge(private val context: Context) {
    @JavascriptInterface
    fun audioBase(): String = "http://127.0.0.1:${AudioServer.port}"

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

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
        }
        if (o.optBoolean("visible", true)) ContextCompat.startForegroundService(context, intent)
        else context.startService(intent)
    }
}
