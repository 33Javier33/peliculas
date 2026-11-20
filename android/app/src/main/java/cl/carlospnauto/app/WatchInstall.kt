package cl.carlospnauto.app

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Instalar en el reloj sin salir de la app: el teléfono descarga el APK (una esfera o la app del
 * reloj) y se lo pasa a la app del reloj por la conexión de Wear OS ("/cpn/apk/<archivo>"). El reloj
 * lo instala (pide confirmar) y responde por "/cpn/apkresult". El avance llega a la página por
 * window.__cpnWatchInstall({ name, state, pct, msg }).
 */
object WatchInstall {
    @Volatile private var busy = false
    /** Actualización pedida desde el reloj: el avance también se le cuenta a él ("/cpn/updateprog") */
    @Volatile private var askedBy: String? = null
    @Volatile private var appCtx: Context? = null

    fun report(name: String, state: String, pct: Int = 0, msg: String = "") {
        val o = JSONObject().put("name", name).put("state", state).put("pct", pct).put("msg", msg)
        MainActivity.toWeb("window.__cpnWatchInstall && window.__cpnWatchInstall(${o})")
        val node = askedBy
        val ctx = appCtx
        if (node != null && ctx != null) runCatching { Wearable.getMessageClient(ctx).sendMessage(node, "/cpn/updateprog", o.toString().toByteArray()) }
    }

    private const val RELEASE = "https://github.com/33Javier33/peliculas/releases/download/android-latest/"

    /**
     * El reloj pide su actualización ("/cpn/update" con el nombre del APK): el teléfono la descarga
     * con su internet y se la manda (el reloj solo la bajaba por Bluetooth: 24 MB, lento y se cortaba)
     */
    fun fromWatch(c: Context, node: String, rawName: String) {
        val name = rawName.trim()
        // La app del reloj o una esfera (la tienda de esferas de la app del reloj)
        val face = Regex("Esfera-[A-Za-z0-9]+\\.apk").matches(name)
        if (name != "CarlosPNauto-Reloj.apk" && name != "PulsoMusic-Reloj.apk" && !face) return
        val app = c.applicationContext
        runCatching { Wearable.getMessageClient(app).sendMessage(node, "/cpn/updateack", name.toByteArray()) }
        if (busy) return
        askedBy = node
        appCtx = app
        start(app, RELEASE + name, name, node)
    }

    fun start(c: Context, url: String, name: String, toNode: String? = null) {
        val app = c.applicationContext
        val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "")
        if (!url.startsWith("https://") || !safe.endsWith(".apk")) return report(name, "error", msg = "Archivo no válido")
        if (busy) return report(safe, "error", msg = "Ya hay una instalación en curso")
        busy = true
        thread(name = "watch-install") {
            val file = File(app.cacheDir, "reloj.apk")
            try {
                // ¿Hay un reloj conectado? (antes de descargar, para no esperar en vano). Se elige el
                // reloj que tiene la app del reloj de ESTA app (antes se tomaba el primero conectado,
                // y si era otro reloj o no tenía la app, la conexión se cortaba)
                val node = toNode ?: pickWatch(app)

                // Descargar
                report(safe, "download", 0)
                val req = okhttp3.Request.Builder().url(url).build()
                OkDownloader.instance.client.newBuilder().readTimeout(60, TimeUnit.SECONDS).build().newCall(req).execute().use { res ->
                    if (!res.isSuccessful) throw IOException("No se pudo descargar (${res.code})")
                    val body = res.body ?: throw IOException("Descarga vacía")
                    val total = body.contentLength()
                    var done = 0L
                    var last = -1
                    body.byteStream().use { input ->
                        file.outputStream().use { out ->
                            val buf = ByteArray(64 * 1024)
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                done += n
                                val pct = if (total > 0) (done * 100 / total).toInt() else 0
                                if (pct / 5 != last / 5) { last = pct; report(safe, "download", pct) }
                            }
                        }
                    }
                }

                // Enviar al reloj: primero por el canal (rápido); si se corta (pasa en algunos
                // relojes, como el TicWatch), por mensajes en pedazos
                report(safe, "send", 0)
                try {
                    sendByChannel(app, node, safe, file)
                } catch (e: Exception) {
                    report(safe, "send", 0, "Reintentando por otra vía…")
                    sendByMessages(app, node, safe, file)
                }
                report(safe, "sent", 100, "Confirma la instalación en el reloj")
            } catch (e: Exception) {
                report(safe, "error", msg = e.message ?: "No se pudo enviar al reloj")
            } finally {
                file.delete()
                busy = false
                askedBy = null
            }
        }
    }

    private const val CAPABILITY = "cpn_reloj"

    /** El reloj con la app del reloj instalada (el más cercano); si ninguno lo anuncia, el conectado */
    private fun pickWatch(app: Context): String {
        val withApp = runCatching {
            Tasks.await(Wearable.getCapabilityClient(app).getCapability(CAPABILITY, com.google.android.gms.wearable.CapabilityClient.FILTER_REACHABLE), 15, TimeUnit.SECONDS).nodes
        }.getOrNull().orEmpty()
        withApp.firstOrNull { it.isNearby }?.let { return it.id }
        withApp.firstOrNull()?.let { return it.id }
        // Relojes con la app antigua (no se anunciaba): el conectado
        val nodes = Tasks.await(Wearable.getNodeClient(app).connectedNodes, 15, TimeUnit.SECONDS)
        val node = nodes.firstOrNull { it.isNearby } ?: nodes.firstOrNull()
            ?: throw IOException("No hay un reloj conectado al teléfono")
        return node.id
    }

    private fun sendByChannel(app: Context, node: String, safe: String, file: File) {
        val channels = Wearable.getChannelClient(app)
        val channel = Tasks.await(channels.openChannel(node, "/cpn/apk/$safe"), 20, TimeUnit.SECONDS)
        try {
            val out = Tasks.await(channels.getOutputStream(channel), 20, TimeUnit.SECONDS)
            val total = file.length()
            var sent = 0L
            var last = -1
            out.use { o ->
                file.inputStream().use { input ->
                    val buf = ByteArray(128 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        o.write(buf, 0, n)
                        sent += n
                        val pct = (sent * 100 / total).toInt()
                        if (pct / 5 != last / 5) { last = pct; report(safe, "send", pct) }
                    }
                    o.flush()
                }
            }
        } catch (e: Exception) {
            runCatching { channels.close(channel) }
            throw e
        }
    }

    /** Otra vía: el APK en pedazos de 90 KB por mensajes («/cpn/apkpart/…»); el reloj los junta */
    private fun sendByMessages(app: Context, node: String, safe: String, file: File) {
        val bytes = file.readBytes()
        val chunk = 90 * 1024
        val count = (bytes.size + chunk - 1) / chunk
        val session = java.lang.Long.toString(System.currentTimeMillis(), 36)
        val messages = Wearable.getMessageClient(app)
        var last = -1
        for (i in 0 until count) {
            val part = bytes.copyOfRange(i * chunk, minOf(bytes.size, (i + 1) * chunk))
            var tries = 0
            while (true) {
                try {
                    Tasks.await(messages.sendMessage(node, "/cpn/apkpart/$safe/$session/$i/$count/${bytes.size}", part), 30, TimeUnit.SECONDS)
                    break
                } catch (e: Exception) {
                    if (++tries >= 3) throw IOException("El reloj no recibe el archivo. Revisa que la app del reloj esté instalada y abierta")
                    Thread.sleep(800)
                }
            }
            val pct = (i + 1) * 100 / count
            if (pct / 5 != last / 5) { last = pct; report(safe, "send", pct) }
        }
    }

    /** Respuesta del reloj ("/cpn/apkresult"): { name, ok, msg } */
    fun onResult(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        val name = o.optString("name")
        when (o.optString("state")) {
            "received" -> report(name, "sent", 100, "Llegó al reloj: confirma la instalación allí")
            "done" -> report(name, "done", 100, "Instalada en el reloj")
            "part" -> {}
            else -> report(name, "error", msg = o.optString("msg", "El reloj no pudo instalarla"))
        }
    }
}
