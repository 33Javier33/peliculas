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

    fun report(name: String, state: String, pct: Int = 0, msg: String = "") {
        val o = JSONObject().put("name", name).put("state", state).put("pct", pct).put("msg", msg)
        MainActivity.toWeb("window.__cpnWatchInstall && window.__cpnWatchInstall(${o})")
    }

    fun start(c: Context, url: String, name: String) {
        val app = c.applicationContext
        val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "")
        if (!url.startsWith("https://") || !safe.endsWith(".apk")) return report(name, "error", msg = "Archivo no válido")
        if (busy) return report(safe, "error", msg = "Ya hay una instalación en curso")
        busy = true
        thread(name = "watch-install") {
            val file = File(app.cacheDir, "reloj.apk")
            try {
                // ¿Hay un reloj conectado? (antes de descargar, para no esperar en vano)
                val nodes = Tasks.await(Wearable.getNodeClient(app).connectedNodes, 15, TimeUnit.SECONDS)
                val node = nodes.firstOrNull { it.isNearby } ?: nodes.firstOrNull()
                    ?: throw IOException("No hay un reloj conectado al teléfono")

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

                // Enviar al reloj
                report(safe, "send", 0)
                val channels = Wearable.getChannelClient(app)
                val channel = Tasks.await(channels.openChannel(node.id, "/cpn/apk/$safe"), 20, TimeUnit.SECONDS)
                val out = Tasks.await(channels.getOutputStream(channel), 20, TimeUnit.SECONDS)
                val total = file.length()
                var sent = 0L
                var last = -1
                out.use { o ->
                    file.inputStream().use { input ->
                        val buf = ByteArray(32 * 1024)
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
                report(safe, "sent", 100, "Confirma la instalación en el reloj")
            } catch (e: Exception) {
                report(safe, "error", msg = e.message ?: "No se pudo enviar al reloj")
            } finally {
                file.delete()
                busy = false
            }
        }
    }

    /** Respuesta del reloj ("/cpn/apkresult"): { name, ok, msg } */
    fun onResult(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        val name = o.optString("name")
        when (o.optString("state")) {
            "received" -> report(name, "sent", 100, "Llegó al reloj: confirma la instalación allí")
            "done" -> report(name, "done", 100, "Instalada en el reloj")
            else -> report(name, "error", msg = o.optString("msg", "El reloj no pudo instalarla"))
        }
    }
}
