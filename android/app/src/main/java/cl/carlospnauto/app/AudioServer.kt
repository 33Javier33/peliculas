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
            override fun serve(session: IHTTPSession): Response = handle(session, session.uri)
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

    private fun handle(session: NanoHTTPD.IHTTPSession, path: String): NanoHTTPD.Response {
        // Verificación previa del navegador (CORS / acceso a la red local)
        if (session.method == NanoHTTPD.Method.OPTIONS) {
            val r = NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.NO_CONTENT, "text/plain", "")
            r.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
            r.addHeader("Access-Control-Allow-Headers", "Range, Content-Type")
            r.addHeader("Access-Control-Max-Age", "86400")
            return cors(r)
        }
        if (path == "/health") return cors(NanoHTTPD.newFixedLengthResponse("ok"))
        // Descargas guardadas como música del teléfono (Música/PulsoMedia): /m/ID
        Regex("^/m/(\\d+)$").find(path)?.let { mm ->
            return try {
                serveStored(mm.groupValues[1].toLong(), session.headers["range"])
            } catch (e: Exception) {
                cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.NOT_FOUND, "text/plain", e.message ?: "no"))
            }
        }
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
        // Video para el reloj (por el Wi-Fi del teléfono): /wv/ID
        Regex("^/wv/([A-Za-z0-9_-]{11})$").find(path)?.let { vm ->
            return try {
                stream(vm.groupValues[1], session.headers["range"], retry = true, watch = true)
            } catch (e: Exception) {
                cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error"))
            }
        }
        // Video de YouTube para la TV: índice DASH (/d/ID.mpd) con la imagen (/cv/ID) y el sonido
        // (/ca/ID) por separado. YouTube casi ya no da el MP4 con ambos juntos (la TV quedaba cargando)
        Regex("^/d/([A-Za-z0-9_-]{11})\\.mpd$").find(path)?.let { dm ->
            return try {
                val r = NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.OK, "application/dash+xml", castManifest(dm.groupValues[1]))
                r.addHeader("Cache-Control", "no-store")
                cors(r)
            } catch (e: Exception) {
                Log.w(TAG, "Sin video DASH para ${dm.groupValues[1]}: ${e.message}")
                cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error"))
            }
        }
        Regex("^/c([va])/([A-Za-z0-9_-]{11})$").find(path)?.let { cm ->
            return try {
                stream(cm.groupValues[2], session.headers["range"], retry = true, castPart = cm.groupValues[1])
            } catch (e: Exception) {
                Log.w(TAG, "Sin parte ${cm.groupValues[1]} para ${cm.groupValues[2]}: ${e.message}")
                cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error"))
            }
        }
        // Video de YouTube (con su sonido, para la TV): /v/ID
        Regex("^/v/([A-Za-z0-9_-]{11})$").find(path)?.let { vm ->
            return try {
                stream(vm.groupValues[1], session.headers["range"], retry = true, video = true)
            } catch (e: Exception) {
                Log.w(TAG, "Sin video para ${vm.groupValues[1]}: ${e.message}")
                cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error"))
            }
        }
        val m = Regex("^/yt/([A-Za-z0-9_-]{11})$").find(path)
            ?: return cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.NOT_FOUND, "text/plain", "no"))
        val id = m.groupValues[1]
        return try {
            // ?start=N (sin cabecera Range) para descargar por partes desde la página
            val range = session.headers["range"] ?: session.parameters["start"]?.firstOrNull()?.toLongOrNull()?.let { "bytes=$it-" }
            stream(id, range, retry = true, background = session.parameters["bg"]?.firstOrNull() == "1")
        } catch (e: Exception) {
            Log.w(TAG, "Sin audio para $id: ${e.message}")
            cors(NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error"))
        }
    }

    // Bitrate (kbps) de las pistas de audio de YouTube por su tipo (itag)
    private val ITAG_KBPS = mapOf(774 to 256, 141 to 256, 251 to 160, 338 to 480, 140 to 128, 171 to 128, 250 to 70, 249 to 50, 139 to 48, 600 to 35, 599 to 30)

    private fun kbps(s: AudioStream): Int {
        val avg = s.averageBitrate
        if (avg > 0) return if (avg > 2000) avg / 1000 else avg
        val br = s.bitrate
        if (br > 0) return if (br > 2000) br / 1000 else br
        return ITAG_KBPS[s.itag] ?: 0
    }

    private fun quality(s: AudioStream): Double {
        return kbps(s).toDouble()
    }

    @Volatile var appContext: android.content.Context? = null

    private fun serveStored(id: Long, rangeHeader: String?): NanoHTTPD.Response {
        val ctx = appContext ?: throw IllegalStateException("sin contexto")
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) throw IllegalStateException("Android 10 o más nuevo")
        val uri = PhoneStorage.uriOf(id)
        val resolver = ctx.contentResolver
        val mime = resolver.getType(uri) ?: "audio/mp4"
        val afd = resolver.openAssetFileDescriptor(uri, "r") ?: throw IllegalStateException("no existe")
        val total = afd.length
        val start = Regex("bytes=(\\d+)-").find(rangeHeader ?: "")?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val end = (Regex("bytes=\\d+-(\\d+)").find(rangeHeader ?: "")?.groupValues?.get(1)?.toLongOrNull() ?: (total - 1)).coerceAtMost(total - 1)
        val input = afd.createInputStream()
        var skipped = 0L
        while (skipped < start) {
            val k = input.skip(start - skipped)
            if (k <= 0) break
            skipped += k
        }
        val len = end - start + 1
        val res = NanoHTTPD.newFixedLengthResponse(if (rangeHeader != null) NanoHTTPD.Response.Status.PARTIAL_CONTENT else NanoHTTPD.Response.Status.OK, mime, input, len)
        if (rangeHeader != null) res.addHeader("Content-Range", "bytes $start-$end/$total")
        return cors(res)
    }

    /** Dirección del mejor audio (la pista de mayor calidad que tenga el video) */
    // Un video a la vez: si llegan varios pedidos del mismo (reproductor, siguiente canción,
    // descarga), el primero lo busca y los demás esperan su resultado (antes cada uno repetía todo
    // el trabajo y se estorbaban: la canción tardaba más de un minuto en empezar)
    private val locks = ConcurrentHashMap<String, Any>()

    fun resolve(id: String, fresh: Boolean = false, background: Boolean = false): Resolved {
        val fresh0 = cache[id]
        if (!fresh && fresh0 != null && System.currentTimeMillis() - fresh0.at < 3 * 60 * 60 * 1000) return fresh0
        val lock = locks.getOrPut(id) { Any() }
        synchronized(lock) {
            val hit = cache[id]
            // Otro pedido ya lo resolvió mientras se esperaba (también si se pidió "fresco")
            if (hit != null && (!fresh || System.currentTimeMillis() - hit.at < 20_000) && System.currentTimeMillis() - hit.at < 3 * 60 * 60 * 1000) return hit
            return resolveNow(id, background).also { if (locks.size > 300) locks.clear() }
        }
    }

    private fun resolveNow(id: String, background: Boolean): Resolved {
        // Sacar el audio de YouTube usa harto procesador (descifra su código). La canción que se va
        // a escuchar va con prioridad normal (que empiece rápido); lo que se prepara o descarga en
        // segundo plano, con prioridad baja (para no trabar la pantalla ni la canción que suena)
        val thread = android.os.Process.myTid()
        val prevPriority = android.os.Process.getThreadPriority(thread)
        android.os.Process.setThreadPriority(if (background) android.os.Process.THREAD_PRIORITY_BACKGROUND else android.os.Process.THREAD_PRIORITY_DEFAULT)
        val info = try {
            StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$id")
        } finally {
            android.os.Process.setThreadPriority(prevPriority)
        }
        val streams = info.audioStreams.filter { it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP }
        // La mejor calidad: YouTube no siempre informa el bitrate (y entonces se elegía la pista de
        // 48 kbps). Se usa el bitrate conocido de cada tipo (itag) y Opus vale un poco más que AAC
        // a igual bitrate (suena mejor). Orden típico: Opus 160k > AAC 128k > Opus 70k > AAC 48k
        // AAC (M4A) primero: es lo que suena en todos los teléfonos (con Opus, en algunos no salía
        // sonido). Entre las M4A, la de mayor calidad (128 kbps, nunca la de 48)
        val best: AudioStream = streams.filter { it.format == MediaFormat.M4A }.maxByOrNull { quality(it) }
            ?: streams.maxByOrNull { quality(it) }
            ?: throw IllegalStateException("sin audio")
        Log.i(TAG, "Audio $id: itag ${best.itag} ${best.format?.name} ${kbps(best)} kbps")
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

    // ===== Video para la TV (Chromecast) =====
    // La TV recibe un solo archivo con imagen y sonido (MP4 «progresivo»: el que YouTube da con
    // ambos juntos). Pasa por el teléfono, que lo pide con su conexión y sus permisos.
    private val vcache = ConcurrentHashMap<String, Resolved>()

    private fun resolveVideo(id: String, fresh: Boolean): Resolved {
        val hit = vcache[id]
        if (!fresh && hit != null && System.currentTimeMillis() - hit.at < 3 * 60 * 60 * 1000) return hit
        val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$id")
        val muxed = info.videoStreams.filter { !it.isVideoOnly && it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP }
        fun height(v: org.schabi.newpipe.extractor.stream.VideoStream) = v.resolution.filter { it.isDigit() }.take(4).toIntOrNull() ?: 0
        val best = muxed.filter { it.format == MediaFormat.MPEG_4 }.maxByOrNull { height(it) }
            ?: muxed.maxByOrNull { height(it) }
            ?: throw IllegalStateException("sin video")
        val url = best.content
        val loc: Localization? = null
        val ua = if (YoutubeParsingHelper.isVisionOsStreamingUrl(url)) YoutubeParsingHelper.getVisionOsUserAgent(loc) else OkDownloader.USER_AGENT
        val r = Resolved(url, best.format?.mimeType ?: "video/mp4", ua, System.currentTimeMillis())
        vcache[id] = r
        return r
    }

    // ===== Video para la TV en DASH =====
    // La imagen sola (H.264, hasta 1080p) y el sonido M4A, con los datos que la TV necesita para
    // pedir cada parte (dónde están el comienzo y el índice de cada archivo).
    private class CastPart(val r: Resolved, val codec: String, val bitrate: Int, val initS: Int, val initE: Int, val idxS: Int, val idxE: Int, val w: Int, val h: Int, val fps: Int)
    private class CastDash(val video: CastPart, val audio: CastPart, val duration: Long, val at: Long)
    private val dcache = ConcurrentHashMap<String, CastDash>()

    private fun resolveCast(id: String, fresh: Boolean): CastDash {
        val hit = dcache[id]
        if (!fresh && hit != null && System.currentTimeMillis() - hit.at < 3 * 60 * 60 * 1000) return hit
        val lock = locks.getOrPut("d:$id") { Any() }
        synchronized(lock) {
            dcache[id]?.let { if (!fresh || System.currentTimeMillis() - it.at < 20_000) if (System.currentTimeMillis() - it.at < 3 * 60 * 60 * 1000) return it }
            val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$id")
            val loc: Localization? = null
            fun ua(url: String) = if (YoutubeParsingHelper.isVisionOsStreamingUrl(url)) YoutubeParsingHelper.getVisionOsUserAgent(loc) else OkDownloader.USER_AGENT
            fun height(v: org.schabi.newpipe.extractor.stream.VideoStream) = v.height.takeIf { it > 0 } ?: (v.resolution.filter { it.isDigit() }.take(4).toIntOrNull() ?: 0)
            val vids = info.videoOnlyStreams.filter {
                it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && it.format == MediaFormat.MPEG_4 &&
                    (it.codec ?: "").startsWith("avc1") && it.initEnd > 0 && it.indexEnd > 0
            }
            // Hasta 1080p y 30 cuadros (lo que todo Chromecast reproduce fluido); si no hay, lo que haya
            val v = vids.filter { height(it) in 1..1080 && it.fps <= 30 }.maxByOrNull { height(it) }
                ?: vids.filter { height(it) in 1..1080 }.maxByOrNull { height(it) * 1000 - it.fps }
                ?: vids.minByOrNull { height(it) }
                ?: throw IllegalStateException("YouTube no entregó imagen para la TV")
            val auds = info.audioStreams.filter {
                it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && it.format == MediaFormat.M4A && it.initEnd > 0 && it.indexEnd > 0
            }
            // El idioma original si el video tiene varios doblajes
            val a = auds.filter { it.audioTrackType == null || it.audioTrackType == org.schabi.newpipe.extractor.stream.AudioTrackType.ORIGINAL }
                .ifEmpty { auds }.maxByOrNull { quality(it) }
                ?: throw IllegalStateException("YouTube no entregó sonido para la TV")
            val now = System.currentTimeMillis()
            val d = CastDash(
                CastPart(Resolved(v.content, "video/mp4", ua(v.content), now), v.codec ?: "avc1.4d401f", v.bitrate.takeIf { it > 0 } ?: 2_000_000,
                    v.initStart, v.initEnd, v.indexStart, v.indexEnd, v.width, height(v), v.fps),
                CastPart(Resolved(a.content, "audio/mp4", ua(a.content), now), a.codec ?: "mp4a.40.2", a.bitrate.takeIf { it > 0 } ?: 128_000,
                    a.initStart, a.initEnd, a.indexStart, a.indexEnd, 0, 0, 0),
                info.duration, now,
            )
            Log.i(TAG, "TV $id: video itag ${v.itag} ${height(v)}p ${v.codec}, audio itag ${a.itag}")
            dcache[id] = d
            if (dcache.size > 30) dcache.entries.minByOrNull { it.value.at }?.let { dcache.remove(it.key) }
            return d
        }
    }

    /** Índice DASH para la TV: las partes van por el teléfono (misma clave en la dirección) */
    private fun castManifest(id: String): String {
        val d = resolveCast(id, fresh = false)
        val base = castBase() ?: throw IllegalStateException("sin Wi-Fi")
        fun esc(s: String) = s.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;")
        val v = d.video
        val a = d.audio
        val dur = if (d.duration > 0) "mediaPresentationDuration=\"PT${d.duration}S\" " else ""
        return """<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" ${dur}minBufferTime="PT2S">
<Period>
<AdaptationSet id="0" contentType="video" mimeType="video/mp4" subsegmentAlignment="true" subsegmentStartsWithSAP="1">
<Representation id="v" codecs="${esc(v.codec)}" bandwidth="${v.bitrate}"${if (v.w > 0) " width=\"${v.w}\"" else ""}${if (v.h > 0) " height=\"${v.h}\"" else ""}${if (v.fps > 0) " frameRate=\"${v.fps}\"" else ""}>
<BaseURL>${esc("$base/cv/$id")}</BaseURL>
<SegmentBase indexRange="${v.idxS}-${v.idxE}"><Initialization range="${v.initS}-${v.initE}"/></SegmentBase>
</Representation>
</AdaptationSet>
<AdaptationSet id="1" contentType="audio" mimeType="audio/mp4" lang="und" subsegmentAlignment="true" subsegmentStartsWithSAP="1">
<Representation id="a" codecs="${esc(a.codec)}" bandwidth="${a.bitrate}" audioSamplingRate="44100">
<AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/>
<BaseURL>${esc("$base/ca/$id")}</BaseURL>
<SegmentBase indexRange="${a.idxS}-${a.idxE}"><Initialization range="${a.initS}-${a.initE}"/></SegmentBase>
</Representation>
</AdaptationSet>
</Period>
</MPD>
"""
    }

    // ===== Video para el reloj =====
    // YouTube casi ya no da el MP4 con imagen y sonido juntos: entonces va la imagen sola en baja
    // resolución (H.264 ≤ 360p, la que los relojes reproducen sin esfuerzo) y el sonido aparte;
    // el reloj los reproduce juntos.
    class WatchVideo(val video: String, val videoUa: String, val audio: String, val audioUa: String, val lanVideo: String, val lanAudio: String)
    private val wcache = ConcurrentHashMap<String, Resolved>()

    private fun resolveWatch(id: String, fresh: Boolean): Pair<Resolved, Boolean> {
        val hit = wcache[id]
        if (!fresh && hit != null && System.currentTimeMillis() - hit.at < 3 * 60 * 60 * 1000) return hit to (hit.mime == "muxed")
        val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$id")
        fun height(v: org.schabi.newpipe.extractor.stream.VideoStream) = v.resolution.filter { it.isDigit() }.take(4).toIntOrNull() ?: 0
        val loc: Localization? = null
        fun ua(url: String) = if (YoutubeParsingHelper.isVisionOsStreamingUrl(url)) YoutubeParsingHelper.getVisionOsUserAgent(loc) else OkDownloader.USER_AGENT
        // 1) Imagen y sonido juntos (si YouTube aún lo da), hasta 360p
        val muxed = info.videoStreams.filter { !it.isVideoOnly && it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && it.format == MediaFormat.MPEG_4 }
        val m = muxed.filter { height(it) in 1..360 }.maxByOrNull { height(it) } ?: muxed.minByOrNull { height(it) }
        if (m != null) {
            val r = Resolved(m.content, "muxed", ua(m.content), System.currentTimeMillis())
            wcache[id] = r
            return r to true
        }
        // 2) Imagen sola: H.264 (avc1) en MP4, la más grande hasta 360p (si no, la más chica)
        val only = info.videoOnlyStreams.filter { it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && it.format == MediaFormat.MPEG_4 }
        // AV1 (itag 394–402, 694–702) va en MP4 pero los relojes no lo decodifican: se prefiere H.264
        val avc = only.filter { it.itag !in 394..402 && it.itag !in 694..702 }.ifEmpty { only }
        val v = avc.filter { height(it) in 1..360 }.maxByOrNull { height(it) } ?: avc.minByOrNull { height(it) }
            ?: throw IllegalStateException("YouTube no entregó video para este tema")
        val r = Resolved(v.content, "video/mp4", ua(v.content), System.currentTimeMillis())
        wcache[id] = r
        return r to false
    }

    /** Lo que necesita el reloj: directo de YouTube y, por si no entra directo, por el Wi-Fi del teléfono */
    fun videoForWatch(id: String): WatchVideo {
        val (v, muxed) = resolveWatch(id, fresh = false)
        val base = castBase()
        if (muxed) return WatchVideo(v.url, v.userAgent, "", "", base?.let { "$it/wv/$id" } ?: "", "")
        val a = resolve(id)
        return WatchVideo(v.url, v.userAgent, a.url, a.userAgent, base?.let { "$it/wv/$id" } ?: "", base?.let { "$it/yt/$id" } ?: "")
    }

    // ===== Servidor para la TV =====
    // La TV (Chromecast) no puede entrar al servidor interno del teléfono (127.0.0.1): este otro
    // escucha en la red de la casa, solo con una clave al azar en la dirección (/c/CLAVE/…).
    private var castServer: NanoHTTPD? = null
    val castToken: String = java.util.UUID.randomUUID().toString().replace("-", "").take(16)
    @Volatile var castPort: Int = 0
        private set

    fun startCastServer(): Boolean {
        if (castServer != null) return true
        return runCatching {
            val s = object : NanoHTTPD(0) {
                override fun serve(session: IHTTPSession): Response {
                    val prefix = "/c/$castToken"
                    if (!session.uri.startsWith("$prefix/")) return newFixedLengthResponse(Response.Status.FORBIDDEN, "text/plain", "no")
                    return handle(session, session.uri.removePrefix(prefix))
                }
            }
            s.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true)
            castServer = s
            castPort = s.listeningPort
            true
        }.getOrDefault(false)
    }

    /** IP del teléfono en la red de la casa (Wi-Fi) */
    fun lanIp(): String? = runCatching {
        java.net.NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<java.net.Inet4Address>()
            .firstOrNull { it.isSiteLocalAddress }?.hostAddress
    }.getOrNull()

    /** Dirección base para la TV: http://IP:PUERTO/c/CLAVE */
    fun castBase(): String? {
        if (!startCastServer()) return null
        val ip = lanIp() ?: return null
        return "http://$ip:$castPort/c/$castToken"
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
                val r = resolve(id, background = true)
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

    private fun stream(id: String, rangeHeader: String?, retry: Boolean, background: Boolean = false, video: Boolean = false, watch: Boolean = false, castPart: String = ""): NanoHTTPD.Response {
        // Rango pedido por el reproductor (o desde el inicio), en tramos
        val start = Regex("bytes=(\\d+)-(\\d*)").find(rangeHeader ?: "")?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val reqEnd = Regex("bytes=(\\d+)-(\\d+)").find(rangeHeader ?: "")?.groupValues?.get(2)?.toLongOrNull()

        // Comienzo ya descargado: se entrega al instante desde la memoria
        val head = if (video || watch || castPart.isNotEmpty()) null else heads[id]
        if (head != null && start < head.bytes.size && head.total > 0) return serveHead(head, start, reqEnd)

        val r = if (castPart.isNotEmpty()) resolveCast(id, fresh = !retry).let { if (castPart == "v") it.video.r else it.audio.r }
            else if (watch) resolveWatch(id, fresh = !retry).first.let { if (it.mime == "muxed") Resolved(it.url, "video/mp4", it.userAgent, it.at) else it }
            else if (video) resolveVideo(id, fresh = !retry) else resolve(id, fresh = !retry, background = background)
        val end = minOf(reqEnd ?: Long.MAX_VALUE, start + CHUNK - 1)

        val conn = (URL(r.url).openConnection() as HttpURLConnection).apply {
            setRequestProperty("User-Agent", r.userAgent)
            setRequestProperty("Range", "bytes=$start-$end")
            connectTimeout = 12000
            readTimeout = 30000
        }
        // Sin conexión con ese servidor de YouTube (se tardó o se cortó): se pide otra dirección del
        // audio (suele ser otro servidor) y se intenta otra vez
        val code = try {
            conn.responseCode
        } catch (e: java.io.IOException) {
            conn.disconnect()
            if (!retry) throw e
            if (castPart.isNotEmpty()) dcache.remove(id) else if (watch) wcache.remove(id) else if (video) vcache.remove(id) else cache.remove(id)
            Thread.sleep(1500)
            return stream(id, rangeHeader, retry = false, background = background, video = video, watch = watch, castPart = castPart)
        }
        if ((code == 403 || code == 410) && retry) {
            conn.disconnect()
            if (castPart.isNotEmpty()) dcache.remove(id) else if (watch) wcache.remove(id) else if (video) vcache.remove(id) else cache.remove(id)
            return stream(id, rangeHeader, retry = false, background = background, video = video, watch = watch, castPart = castPart)
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
