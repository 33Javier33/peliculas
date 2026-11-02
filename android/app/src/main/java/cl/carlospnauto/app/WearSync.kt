package cl.carlospnauto.app

import android.content.Context
import android.media.AudioManager
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/**
 * Reloj (Wear OS) ↔ teléfono. El reloj manda órdenes por "/cpn/cmd" ({a, k, id}); el teléfono le
 * responde lo que suena ("/cpn/state") y la biblioteca ("/cpn/library"). Solo se le manda el
 * estado mientras la app del reloj está abierta (avisa con "hello" cada minuto): no gasta batería.
 */
object WearSync {
    @Volatile private var helloAt = 0L
    @Volatile var lastState: String = "{}"
        private set

    fun watching() = System.currentTimeMillis() - helloAt < 3 * 60 * 1000

    fun send(c: Context, path: String, json: String) {
        val bytes = json.toByteArray()
        runCatching {
            Wearable.getNodeClient(c).connectedNodes.addOnSuccessListener { nodes ->
                for (n in nodes) Wearable.getMessageClient(c).sendMessage(n.id, path, bytes)
            }
        }
    }

    /** Lo que suena (lo llama el servicio de reproducción en cada cambio) */
    fun state(c: Context, json: String) {
        lastState = json
        if (watching()) send(c, "/cpn/state", json)
    }

    fun onCommand(c: Context, json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        when (val a = o.optString("a")) {
            "hello" -> {
                helloAt = System.currentTimeMillis()
                send(c, "/cpn/state", lastState)
                if (!MainActivity.isOpen()) send(c, "/cpn/closed", "{}")
            }
            // Volumen del teléfono (no necesita la app abierta)
            "vol+", "vol-" -> {
                val am = c.getSystemService(AudioManager::class.java)
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (a == "vol+") AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, 0)
            }
            "play", "pause", "next", "prev", "like" -> if (!MainActivity.sendActionIfOpen(a)) send(c, "/cpn/closed", "{}")
            "seek" -> if (!MainActivity.sendActionIfOpen("seek:${o.optLong("ms")}")) send(c, "/cpn/closed", "{}")
            // Biblioteca y elegir qué suena: los resuelve la app web
            else -> if (!MainActivity.wearToWeb(json)) send(c, "/cpn/closed", "{}")
        }
    }
}

class WearService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path == "/cpn/cmd") WearSync.onCommand(applicationContext, String(event.data))
    }
}
