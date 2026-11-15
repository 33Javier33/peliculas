package cl.carlospnauto.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

/**
 * Puente con las esferas (Retro, Data Pulso, Lumina…), que son apps aparte: Wear OS solo deja que
 * el teléfono le hable a esta app, así que aquí se les pasa lo que suena en el teléfono, y ellas
 * piden anterior / siguiente / reproducir-pausar, que se mandan al teléfono.
 */
object FaceBridge {
    const val ACTION_NOW = "cl.carlospnauto.esfera.NOW"
    const val ACTION_ASK = "cl.carlospnauto.esfera.ASK"
    const val ACTION_CMD = "cl.carlospnauto.esfera.CMD"

    /** Guarda lo que suena (con la hora en que llegó, para que la barra avance sola) y avisa a las esferas */
    fun publish(c: Context, o: JSONObject?) {
        val json = o?.put("recv", System.currentTimeMillis())?.toString() ?: ""
        c.getSharedPreferences("esferas", Context.MODE_PRIVATE).edit().putString("now", json).apply()
        send(c, json)
    }

    fun send(c: Context, json: String) {
        c.sendBroadcast(Intent(ACTION_NOW).putExtra("now", json).putExtra("from", c.packageName))
    }

    fun last(c: Context) = c.getSharedPreferences("esferas", Context.MODE_PRIVATE).getString("now", "") ?: ""
}

/** Las esferas preguntan qué suena (al encenderse) o mandan una orden para el teléfono */
class FaceBridgeReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        when (intent.action) {
            FaceBridge.ACTION_ASK -> FaceBridge.send(c, FaceBridge.last(c))
            FaceBridge.ACTION_CMD -> {
                val a = intent.getStringExtra("a") ?: return
                if (a !in setOf("play", "pause", "next", "prev")) return
                val done = goAsync()
                PhoneLink.cmd(c, a)
                // Lo que se ve en la esfera cambia al tiro (el teléfono lo confirma después)
                if (a == "play" || a == "pause") {
                    val o = runCatching { JSONObject(FaceBridge.last(c)) }.getOrNull()
                    if (o != null) {
                        val now = System.currentTimeMillis()
                        val pos = o.optLong("position", -1)
                        if (pos >= 0 && o.optBoolean("playing")) o.put("position", pos + (now - o.optLong("recv", now)))
                        o.put("playing", a == "play")
                        FaceBridge.publish(c, o)
                    }
                }
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ done.finish() }, 3000)
            }
        }
    }
}
