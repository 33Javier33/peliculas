package cl.carlospnauto.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Lo que suena en esta app, avisado a la cuenta aunque la app esté en segundo plano: la página web
 * se duerme al salir, pero el servicio de reproducción sigue. Así PulsoMedia y el navegador ven
 * «Suena en PulsoMusic · teléfono» y pueden cambiar dónde suena. Las órdenes que llegan (pausa,
 * siguiente, «escuchar aquí») se le pasan a la página si está abierta.
 *
 * Mientras suena, además se mantiene conectado al canal en vivo de la cuenta (Supabase Realtime):
 * las órdenes llegan al instante y lo que suena se avisa en el momento. El aviso al servidor cada
 * 10 s queda de respaldo.
 */
object Presence {
    private const val PREFS = "cpn-presence"
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var ctx: Context? = null
    @Volatile private var state: JSONObject = JSONObject().put("playing", false)
    @Volatile private var lastSent = 0L
    private var looping = false
    private var liveKey = ""
    private var liveAt = 0L

    private val tick = object : Runnable {
        override fun run() {
            if (ctx == null) {
                looping = false
                return
            }
            // En pausa no se avisa nada periódicamente (cada aviso es una llamada al servidor, que
            // se cobra en Vercel): el cambio a pausa ya se avisó al momento
            if (!state.optBoolean("playing")) {
                looping = false
                return
            }
            send()
            // Con el canal en vivo conectado, el aviso al servidor es solo de respaldo: cada 5 min
            // (sin él, cada 1 min). Antes cada 10-30 s, también en pausa
            main.postDelayed(this, if (Live.isJoined()) 5 * 60_000L else 60_000L)
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
        if (o.optString("token").isEmpty()) Live.close()
    }

    /** Lo que suena ahora (lo llama el servicio de reproducción) */
    fun update(c: Context, playing: Boolean, track: JSONObject?) {
        ctx = c.applicationContext
        state = JSONObject().put("playing", playing).put("track", track ?: JSONObject.NULL)
        if (!looping && playing) {
            looping = true
            main.postDelayed(tick, 60_000)
        }
        // Al canal en vivo: al cambiar de canción o play/pausa, y si no cada 5 s (la posición avanza sola)
        val k = "$playing|${track?.optString("id") ?: ""}"
        val now = System.currentTimeMillis()
        val changed = k != liveKey
        if (changed || now - liveAt > 5000) {
            liveKey = k
            liveAt = now
            Live.state(myState())
        }
        // Al servidor solo cuando cambia la canción o play/pausa (la posición va por el canal en vivo)
        if (changed && now - lastSent > 1500) send()
    }

    /** Se detuvo la música: se avisa que ya no suena y se para el aviso periódico */
    fun stop() {
        state = JSONObject().put("playing", false).put("track", JSONObject.NULL)
        Live.state(myState())
        send()
        ctx = null
        looping = false
        main.removeCallbacks(tick)
        Live.close()
    }

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun myState(): JSONObject? {
        val p = prefs(ctx ?: return null)
        return JSONObject()
            .put("device", p.getString("device", "") ?: "")
            .put("name", p.getString("name", "") ?: "")
            .put("app", p.getString("app", "media") ?: "media")
            .put("playing", state.optBoolean("playing"))
            .put("track", state.opt("track") ?: JSONObject.NULL)
            .put("at", System.currentTimeMillis())
    }

    private fun deliver(cmd: JSONObject) {
        MainActivity.toWeb("window.__cpnDeviceCmd && window.__cpnDeviceCmd($cmd)")
    }

    private fun send() {
        val c = ctx ?: return
        val p = prefs(c)
        val token = p.getString("token", "") ?: ""
        if (token.isEmpty()) return
        lastSent = System.currentTimeMillis()
        val device = p.getString("device", "") ?: ""
        val body = JSONObject()
            .put("action", "presence")
            .put("token", token)
            .put("device", device)
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
                    val rt = o.optJSONObject("realtime")
                    if (rt != null && ctx != null) Live.connect(rt.optString("url"), rt.optString("key"), rt.optString("channel"), device)
                    val cmds = o.optJSONArray("cmds") ?: return@use
                    for (i in 0 until cmds.length()) deliver(cmds.optJSONObject(i) ?: continue)
                }
            }
        }
    }

    /** Canal en vivo de la cuenta (protocolo Phoenix de Supabase Realtime sobre WebSocket) */
    private object Live {
        private val client: OkHttpClient by lazy {
            OkDownloader.instance.client.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()
        }
        private var ws: WebSocket? = null
        private var key = ""
        private var topic = ""
        private var device = ""
        @Volatile private var joined = false
        private var ref = 0

        fun isJoined() = joined

        private val heartbeat = object : Runnable {
            override fun run() {
                val s = ws ?: return
                s.send(msg("phoenix", "heartbeat", JSONObject()))
                main.postDelayed(this, 25_000)
            }
        }

        private fun msg(t: String, event: String, payload: JSONObject): String =
            JSONObject().put("topic", t).put("event", event).put("payload", payload).put("ref", (++ref).toString()).put("join_ref", "1").toString()

        @Synchronized
        fun connect(url: String, apiKey: String, channel: String, dev: String) {
            if (url.isEmpty() || apiKey.isEmpty() || channel.isEmpty()) return
            val t = "realtime:$channel"
            if (ws != null && topic == t && device == dev) return
            close()
            ref = 0
            key = apiKey
            topic = t
            device = dev
            val wsUrl = url.replaceFirst("https://", "wss://").trimEnd('/') + "/realtime/v1/websocket?apikey=$apiKey&vsn=1.0.0"
            ws = client.newWebSocket(Request.Builder().url(wsUrl).build(), Listener())
        }

        @Synchronized
        fun close() {
            main.removeCallbacks(heartbeat)
            joined = false
            ws?.close(1000, null)
            ws = null
        }

        fun state(s: JSONObject?) {
            val sock = ws ?: return
            if (!joined || s == null) return
            val payload = JSONObject().put("type", "broadcast").put("event", "state").put("payload", s)
            sock.send(msg(topic, "broadcast", payload))
        }

        private class Listener : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                val config = JSONObject()
                    .put("broadcast", JSONObject().put("self", false).put("ack", false))
                    .put("presence", JSONObject().put("key", ""))
                    .put("postgres_changes", org.json.JSONArray())
                    .put("private", false)
                webSocket.send(msg(topic, "phx_join", JSONObject().put("config", config).put("access_token", key)))
                main.removeCallbacks(heartbeat)
                main.postDelayed(heartbeat, 25_000)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val o = runCatching { JSONObject(text) }.getOrNull() ?: return
                when (o.optString("event")) {
                    "phx_reply" -> if (o.optString("topic") == topic && o.optJSONObject("payload")?.optString("status") == "ok" && !joined) {
                        joined = true
                        state(myState())
                    }
                    "broadcast" -> {
                        val b = o.optJSONObject("payload") ?: return
                        if (b.optString("event") != "cmd") return
                        val p = b.optJSONObject("payload") ?: return
                        if (p.optString("to") == device) deliver(p.optJSONObject("cmd") ?: return)
                    }
                    "phx_error", "phx_close" -> if (o.optString("topic") == topic) retry(webSocket)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = retry(webSocket)

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = retry(webSocket)

            // Se cortó: se vuelve a conectar en el próximo aviso al servidor (cada 10 s mientras suena)
            private fun retry(webSocket: WebSocket) {
                synchronized(Live) {
                    if (ws !== webSocket) return
                    main.removeCallbacks(heartbeat)
                    joined = false
                    ws = null
                }
                webSocket.cancel()
            }
        }
    }
}
