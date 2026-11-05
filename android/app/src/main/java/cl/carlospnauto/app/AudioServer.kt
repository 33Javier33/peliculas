package cl.carlospnauto.app

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * Servidor local (solo en el teléfono, 127.0.0.1): la app web pide /yt/ID y recibe el audio de
 * esa canción, obtenido aquí mismo con NewPipe Extractor. Como el audio sale de la conexión del
 * teléfono, YouTube no lo bloquea, y el reproductor de la app sigue sonando bloqueado.
 */
object AudioServer {
    private const val TAG = "AudioServer"
    // Tramos de 8 MB: YouTube corta las descargas muy largas de una vez
    private const val CHUNK = 8L * 1024 * 1024

    @Volatile var port: Int = 0
        private set

    data class Resolved(val url: String, val mime: String, val userAgent: String, val at: Long)
    private val cache = ConcurrentHashMap<String, Resolved>()

    private var server: NanoHTTPD? = null

    fun start() {
        if (server != null) return
        val s = object : NanoHTTPD("127.0.0.1", 0) {
            override fun serve(session: IHTTPSession): Response = handle(session)
        }
        s.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true)
        server = s
        port = s.listeningPort
        Log.i(TAG, "Escuchando en 127.0.0.1:$port")
    }

    private fun cors(r: NanoHTTPD.Response): NanoHTTPD.Response {
        r.addHeader("Access-Control-Allow-Origin", "*")
        r.addHeader("Accept-Ranges", "bytes")
        // La página (convertir a audio / descargas) lee el tamaño total para bajar por partes
        r.addHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Content-Type")
        r.addHeader("Access-Control-Allow-Private-Network", "true")
        return r
    }

    private fun handle(session: NanoHTTPD.IHTTPSession): NanoHTTPD.Response {
        val path = session.uri
        // Verificación previa del navegador (CORS / acceso a la red local)
        if (session.method == NanoHTTPD.Method.OPTIONS) {
            val r = NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.NO_CONTENT, "text/plain", "")
            r.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
            r.addHeader("Access-Control-Allow-Headers", "Range, Content-Type")
            r.addHeader("Access-Control-Max-Age", "86400")
            return cors(r)
        }
        if (path == "/health") return cors(NanoHTTPD.newFixedLengthResponse("ok"))
        // Archivos de audio de archive.org: pasan por aquí para salir rápido (comienzo ya
        // descargado) y con permiso para el ecualizador
        if (path == "/f") {
            val u = session.parameters["u"]?.firstOrNull() ?: ""
            if (!fileAllowed(u)) return cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.FORBIDDEN, "text/plain", "no"))
            return try {
                streamFile(u, session.headers["range"])
            } catch (e: Exception) {
                Log.w(TAG, "Sin archivo $u: ${e.message}")
                cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error"))
            }
        }
        val m = Regex("^/yt/([A-Za-z0-9_-]{11})$").find(path)
            ?: return cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.NOT_FOUND, "text/plain", "no"))
        val id = m.groupValues[1]
        return try {
            // ?start=N (sin cabecera Range) para descargar por partes desde la página
            val range = session.headers["range"] ?: session.parameters["start"]?.firstOrNull()?.toLongOrNull()?.let { "bytes=$it-" }
            stream(id, range, retry = true)
        } catch (e: Exception) {
            Log.w(TAG, "Sin audio para $id: ${e.message}")
            cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error"))
        }
    }

    /** Dirección del mejor audio (M4A primero: suena en todos los teléfonos) */
    fun resolve(id: String, fresh: Boolean = false): Resolved {
        val hit = cache[id]
        if (!fresh && hit != null && System.currentTimeMillis() - hit.at < 3 * 60 * 60 * 1000) return hit
        // Sacar el audio de YouTube usa harto procesador (descifra su código): se hace con
        // prioridad baja para que la pantalla de la app no se trabe mientras tanto
        val thread = android.os.Process.myTid()
        val prevPriority = android.os.Process.getThreadPriority(thread)
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND)
        val info = try {
            StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$id")
        } finally {
            android.os.Process.setThreadPriority(prevPriority)
        }
        val streams = info.audioStreams.filter { it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP }
        val best: AudioStream = streams.filter { it.format == MediaFormat.M4A }.maxByOrNull { it.averageBitrate }
            ?: streams.maxByOrNull { it.averageBitrate }
            ?: throw IllegalStateException("sin audio")
        val url = best.content
        val loc: Localization? = null
        val ua = when {
            YoutubeParsingHelper.isVisionOsStreamingUrl(url) -> YoutubeParsingHelper.getVisionOsUserAgent(loc)
            else -> OkDownloader.USER_AGENT
        }
        val r = Resolved(url, best.format?.mimeType ?: "audio/mp4", ua, System.currentTimeMillis())
        cache[id] = r
        return r
    }

    // ===== Siguiente canción lista de antemano =====
    // Mientras suena una canción, la app pide preparar la siguiente: se busca su audio y se
    // descarga el comienzo (en memoria). Al cambiar de tema empieza a sonar al instante.
    private class Head(val bytes: ByteArray, val total: Long, val mime: String, val at: Long)
    private val heads = ConcurrentHashMap<String, Head>()
    private const val HEAD_BYTES = 768L * 1024

    fun prefetch(id: String) {
        if (!Regex("^[A-Za-z0-9_-]{11}$").matches(id)) return
        val hit = heads[id]
        if (hit != null && System.currentTimeMillis() - hit.at < 60 * 60 * 1000) return
        Thread {
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND)
            runCatching {
                val r = resolve(id)
                val conn = (URL(r.url).openConnection() as HttpURLConnection).apply {
                    setRequestProperty("User-Agent", r.userAgent)
                    setRequestProperty("Range", "bytes=0-${HEAD_BYTES - 1}")
                    connectTimeout = 15000
                    readTimeout = 30000
                }
                if (conn.responseCode == 200 || conn.responseCode == 206) {
                    val total = conn.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull()
                        ?: conn.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L
                    val bytes = conn.inputStream.use { it.readNBytesCompat(HEAD_BYTES.toInt()) }
                    // Solo las últimas canciones preparadas (poca memoria)
                    if (heads.size >= 3) heads.entries.minByOrNull { it.value.at }?.let { heads.remove(it.key) }
                    heads[id] = Head(bytes, total, r.mime, System.currentTimeMillis())
                }
                conn.disconnect()
            }.onFailure { Log.w(TAG, "No se pudo preparar $id: ${it.message}") }
        }.start()
    }

    fun fileAllowed(u: String): Boolean = runCatching {
        val url = URL(u)
        url.protocol == "https" && (url.host == "archive.org" || url.host.endsWith(".archive.org"))
    }.getOrDefault(false)

    private fun openRange(url: String, start: Long, end: Long, ua: String = OkDownloader.USER_AGENT): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", ua)
            setRequestProperty("Range", "bytes=$start-$end")
            connectTimeout = 15000
            readTimeout = 30000
        }

    /** Dejar listo el comienzo de un archivo (la siguiente canción de un disco de archive.org) */
    fun prefetchFile(u: String) {
        if (!fileAllowed(u)) return
        val key = "u:$u"
        val hit = heads[key]
        if (hit != null && System.currentTimeMillis() - hit.at < 60 * 60 * 1000) return
        Thread {
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND)
            runCatching {
                val conn = openRange(u, 0, HEAD_BYTES - 1)
                if (conn.responseCode == 200 || conn.responseCode == 206) {
                    val total = conn.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull()
                        ?: conn.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L
                    val mime = conn.contentType ?: "audio/mpeg"
                    val bytes = conn.inputStream.use { it.readNBytesCompat(HEAD_BYTES.toInt()) }
                    if (heads.size >= 4) heads.entries.minByOrNull { it.value.at }?.let { heads.remove(it.key) }
                    heads[key] = Head(bytes, total, mime, System.currentTimeMillis())
                }
                conn.disconnect()
            }.onFailure { Log.w(TAG, "No se pudo preparar $u: ${it.message}") }
        }.start()
    }

    private fun serveHead(head: Head, start: Long, reqEnd: Long?): NanoHTTPD.Response {
        val last = minOf(reqEnd ?: Long.MAX_VALUE, head.bytes.size.toLong() - 1)
        val slice = head.bytes.copyOfRange(start.toInt(), (last + 1).toInt())
        val res = NanoHTTPD.newFixedLengthResponse(
            NanoHTTPD.Response.Status.PARTIAL_CONTENT, head.mime, java.io.ByteArrayInputStream(slice), slice.size.toLong()
        )
        res.addHeader("Content-Range", "bytes $start-$last/${head.total}")
        return cors(res)
    }

    private fun streamFile(u: String, rangeHeader: String?): NanoHTTPD.Response {
        val start = Regex("bytes=(\\d+)-(\\d*)").find(rangeHeader ?: "")?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val reqEnd = Regex("bytes=(\\d+)-(\\d+)").find(rangeHeader ?: "")?.groupValues?.get(2)?.toLongOrNull()
        val head = heads["u:$u"]
        if (head != null && start < head.bytes.size && head.total > 0) return serveHead(head, start, reqEnd)
        val end = minOf(reqEnd ?: Long.MAX_VALUE, start + CHUNK - 1)
        val conn = openRange(u, start, end)
        val code = conn.responseCode
        if (code != 200 && code != 206) {
            conn.disconnect()
            throw IllegalStateException("archive.org respondió $code")
        }
        val length = conn.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L
        val total = conn.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull()
        val res = NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.PARTIAL_CONTENT, conn.contentType ?: "audio/mpeg", conn.inputStream, length)
        if (length >= 0) res.addHeader("Content-Range", "bytes $start-${start + length - 1}/${total ?: "*"}")
        return cors(res)
    }

    private fun java.io.InputStream.readNBytesCompat(max: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(16 * 1024)
        while (out.size() < max) {
            val n = read(buf, 0, minOf(buf.size, max - out.size()))
            if (n < 0) break
            out.write(buf, 0, n)
        }
        return out.toByteArray()
    }

    private fun stream(id: String, rangeHeader: String?, retry: Boolean): NanoHTTPD.Response {
        // Rango pedido por el reproductor (o desde el inicio), en tramos
        val start = Regex("bytes=(\\d+)-(\\d*)").find(rangeHeader ?: "")?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val reqEnd = Regex("bytes=(\\d+)-(\\d+)").find(rangeHeader ?: "")?.groupValues?.get(2)?.toLongOrNull()

        // Comienzo ya descargado: se entrega al instante desde la memoria
        val head = heads[id]
        if (head != null && start < head.bytes.size && head.total > 0) return serveHead(head, start, reqEnd)

        val r = resolve(id, fresh = !retry)
        val end = minOf(reqEnd ?: Long.MAX_VALUE, start + CHUNK - 1)

        val conn = (URL(r.url).openConnection() as HttpURLConnection).apply {
            setRequestProperty("User-Agent", r.userAgent)
            setRequestProperty("Range", "bytes=$start-$end")
            connectTimeout = 15000
            readTimeout = 30000
        }
        val code = conn.responseCode
        if ((code == 403 || code == 410) && retry) {
            conn.disconnect()
            cache.remove(id)
            return stream(id, rangeHeader, retry = false)
        }
        if (code != 200 && code != 206) {
            conn.disconnect()
            throw IllegalStateException("YouTube respondió $code")
        }
        val length = conn.getHeaderField("Content-Length")?.toLongOrNull() ?: -1L
        val total = conn.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull()
        val res = NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.PARTIAL_CONTENT, r.mime, conn.inputStream, length)
        if (length >= 0) res.addHeader("Content-Range", "bytes $start-${start + length - 1}/${total ?: "*"}")
        return cors(res)
    }
}
