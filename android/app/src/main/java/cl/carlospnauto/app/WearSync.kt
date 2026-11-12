package cl.carlospnauto.app

import android.content.Context
import android.graphics.Bitmap
import android.media.AudioManager
import java.io.ByteArrayOutputStream
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

    /** ¿Se usó alguna vez la app del reloj? (la recuerda el teléfono) */
    fun hasWatchApp(c: Context) = c.getSharedPreferences("wear", Context.MODE_PRIVATE).getBoolean("app", false)

    /** Versión de la app del reloj la última vez que se conectó ("" si no la mandó: reloj antiguo) */
    fun watchVersion(c: Context) = c.getSharedPreferences("wear", Context.MODE_PRIVATE).getString("ver", "") ?: ""

    fun watching() = System.currentTimeMillis() - helloAt < 3 * 60 * 1000

    fun send(c: Context, path: String, json: String) = send(c, path, json.toByteArray())

    fun send(c: Context, path: String, bytes: ByteArray) {
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
        // Evento en curso del reloj (el ícono de la esfera que abre la app del reloj): solo al
        // cambiar la canción o al pausar, aunque la app del reloj esté cerrada (gasta muy poco)
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        val now = JSONObject().put("title", o.optString("title")).put("artist", o.optString("artist")).put("playing", o.optBoolean("playing")).toString()
        if (now != lastNow) {
            lastNow = now
            send(c, "/cpn/now", now)
        }
    }
    @Volatile private var lastNow = ""

    /** Se cerró la música: el reloj quita su evento en curso */
    fun stopped(c: Context) {
        lastNow = ""
        send(c, "/cpn/stop", ByteArray(0))
    }

    /** Volumen del teléfono (para la pantalla de volumen del reloj) */
    private fun sendVolume(c: Context) {
        val am = c.getSystemService(AudioManager::class.java)
        send(c, "/cpn/vol", JSONObject().put("v", am.getStreamVolume(AudioManager.STREAM_MUSIC)).put("max", am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)).toString())
    }

    // Carátula para el reloj: se manda la imagen (chica, ~15 KB). El reloj no la descarga de
    // internet (en muchos relojes no puede, o tarda mucho por el Bluetooth del teléfono)
    @Volatile private var artFor = ""
    @Volatile private var artBytes = ByteArray(0)

    fun art(c: Context, url: String, bmp: Bitmap?) {
        if (bmp == null) {
            // Canción nueva sin carátula todavía: se borra la anterior
            if (artFor != url) {
                artFor = url
                artBytes = ByteArray(0)
                if (watching()) send(c, "/cpn/art", ByteArray(0))
            }
            return
        }
        if (artFor == url && artBytes.isNotEmpty()) return
        val side = 240
        val scaled = runCatching {
            val r = minOf(side.toFloat() / bmp.width, side.toFloat() / bmp.height, 1f)
            Bitmap.createScaledBitmap(bmp, (bmp.width * r).toInt().coerceAtLeast(1), (bmp.height * r).toInt().coerceAtLeast(1), true)
        }.getOrNull() ?: return
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
        artFor = url
        artBytes = out.toByteArray()
        if (watching()) send(c, "/cpn/art", artBytes)
    }

    // Miniaturas para las listas del reloj (carátulas, fotos de artistas): el teléfono las descarga,
    // las achica (96 px, ~3 KB) y se las manda. Se guardan las últimas para no repetir descargas.
    private val thumbs = object : android.util.LruCache<String, ByteArray>(200) {}
    private val thumbPool = java.util.concurrent.Executors.newFixedThreadPool(3)

    private fun thumb(c: Context, url: String) {
        if (!url.startsWith("http")) return
        thumbs.get(url)?.let { return sendThumb(c, url, it) }
        thumbPool.execute {
            val bytes = runCatching {
                OkDownloader.instance.client.newCall(okhttp3.Request.Builder().url(url).build()).execute().use { r ->
                    val raw = r.body?.bytes() ?: return@use null
                    val bmp = android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.size) ?: return@use null
                    val side = 96
                    val ratio = maxOf(side.toFloat() / bmp.width, side.toFloat() / bmp.height)
                    val scaled = Bitmap.createScaledBitmap(bmp, (bmp.width * ratio).toInt().coerceAtLeast(1), (bmp.height * ratio).toInt().coerceAtLeast(1), true)
                    // Recorte cuadrado al centro
                    val x = ((scaled.width - side) / 2).coerceAtLeast(0)
                    val y = ((scaled.height - side) / 2).coerceAtLeast(0)
                    val sq = Bitmap.createBitmap(scaled, x, y, minOf(side, scaled.width), minOf(side, scaled.height))
                    val out = ByteArrayOutputStream()
                    sq.compress(Bitmap.CompressFormat.JPEG, 75, out)
                    out.toByteArray()
                }
            }.getOrNull() ?: return@execute
            thumbs.put(url, bytes)
            sendThumb(c, url, bytes)
        }
    }

    /** Mensaje: la dirección, un byte 0 y la imagen */
    private fun sendThumb(c: Context, url: String, img: ByteArray) = send(c, "/cpn/thumb", url.toByteArray() + byteArrayOf(0) + img)

    fun onCommand(c: Context, json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        when (val a = o.optString("a")) {
            "hello" -> {
                helloAt = System.currentTimeMillis()
                // Versión del reloj (los relojes anteriores a esto no la mandan: queda vacía)
                c.getSharedPreferences("wear", Context.MODE_PRIVATE).edit()
                    .putBoolean("app", true)
                    .putString("ver", o.optString("v"))
                    .apply()
                // Que el reloj tenga ya su ícono de «Sonando» (lo que suena ahora)
                lastNow = ""
                runCatching { state(c, lastState) }
                send(c, "/cpn/state", lastState)
                send(c, "/cpn/art", artBytes)
                if (!MainActivity.isOpen()) send(c, "/cpn/closed", "{}")
            }
            "thumb" -> thumb(c, o.optString("u"))
            // Volumen del teléfono (no necesita la app abierta)
            "vol+", "vol-" -> {
                val am = c.getSystemService(AudioManager::class.java)
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (a == "vol+") AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, 0)
                sendVolume(c)
            }
            "vol" -> {
                // Volumen exacto (tocando la barra del reloj) o solo preguntar cuánto está
                if (o.has("v")) {
                    val am = c.getSystemService(AudioManager::class.java)
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, o.optInt("v").coerceIn(0, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)), 0)
                }
                sendVolume(c)
            }
            // "play" con algo elegido (k: canción, radio, playlist, disco…) lo resuelve la app web;
            // antes se tomaba como el botón reproducir y lo elegido no sonaba
            "play", "pause", "next", "prev", "like" ->
                if (a == "play" && o.has("k")) {
                    if (!MainActivity.wearToWeb(json)) send(c, "/cpn/closed", "{}")
                } else if (!MainActivity.sendActionIfOpen(a)) send(c, "/cpn/closed", "{}")
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
