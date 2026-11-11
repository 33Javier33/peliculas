package cl.carlospnauto.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Lo que suena en esta app, avisado a la cuenta aunque la app esté en segundo plano: la página web
 * se duerme al salir, pero el servicio de reproducción sigue. Así PulsoMedia y el navegador ven
 * «Suena en PulsoMusic · teléfono» y pueden cambiar dónde suena. Las órdenes que llegan (pausa,
 * siguiente, «escuchar aquí») se le pasan a la página si está abierta.
 */
object Presence {
    private const val PREFS = "cpn-presence"
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var ctx: Context? = null
    @Volatile private var state: JSONObject = JSONObject().put("playing", false)
    @Volatile private var lastSent = 0L
    private var looping = false

    private val tick = object : Runnable {
        override fun run() {
            if (ctx == null) {
                looping = false
                return
            }
            send()
            main.postDelayed(this, 10_000)
        }
    }

    /** La web avisa su cuenta (token) y este dispositivo; token vacío = sin sesión */
    fun saveAccount(c: Context, o: JSONObject) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("token", o.optString("token"))
            .putString("device", o.optString("device"))
            .putString("name", o.optString("name"))
            .putString("app", o.optString("app"))
            .apply()
    }

    /** Lo que suena ahora (lo llama el servicio de reproducción) */
    fun update(c: Context, playing: Boolean, track: JSONObject?) {
        ctx = c.applicationContext
        state = JSONObject().put("playing", playing).put("track", track ?: JSONObject.NULL)
        if (!looping) {
            looping = true
            main.post(tick)
        }
        if (System.currentTimeMillis() - lastSent > 1500) send()
    }

    /** Se detuvo la música: se avisa que ya no suena y se para el aviso periódico */
    fun stop() {
        state = JSONObject().put("playing", false).put("track", JSONObject.NULL)
        send()
        ctx = null
        looping = false
        main.removeCallbacks(tick)
    }

    private fun send() {
        val c = ctx ?: return
        val p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val token = p.getString("token", "") ?: ""
        if (token.isEmpty()) return
        lastSent = System.currentTimeMillis()
        val body = JSONObject()
            .put("action", "presence")
            .put("token", token)
            .put("device", p.getString("device", "") ?: "")
            .put("name", p.getString("name", "") ?: "")
            .put("app", p.getString("app", "media") ?: "media")
            .put("state", state)
        thread {
            runCatching {
                val req = Request.Builder()
                    .url("${BuildConfig.WEB_URL}/api/cuenta")
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                OkDownloader.instance.client.newCall(req).execute().use { r ->
                    val o = JSONObject(r.body?.string() ?: return@use)
                    val cmds = o.optJSONArray("cmds") ?: return@use
                    for (i in 0 until cmds.length()) {
                        val cmd = cmds.optJSONObject(i) ?: continue
                        MainActivity.toWeb("window.__cpnDeviceCmd && window.__cpnDeviceCmd($cmd)")
                    }
                }
            }
        }
    }
}
