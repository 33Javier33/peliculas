package cl.carlospnauto.wear

import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Tienda de esferas en el reloj: la lista publicada (esferas.json) con cuáles están instaladas, cuáles
 * tienen versión nueva y cuáles faltan. «Instalar» / «Actualizar» se la pide al teléfono (la descarga
 * con su internet y la manda, como desde la tienda del teléfono); si el teléfono no responde, la
 * descarga el reloj. Al llegar se abre la pantalla de instalar.
 */
object FaceStore {
    private const val BASE = "https://github.com/33Javier33/peliculas/releases/download/android-latest/"

    data class Face(val file: String, val name: String, val pkg: String, val version: Long, val size: Long, val app: Boolean = false) {
        /** Versión para mostrar: esferas «2.N» (N = versión − 1000), apps «1.0.N» */
        val label get() = "2.${version - 1000}"
    }

    enum class Status { INSTALLED, UPDATE, MISSING }

    /** Lo que se está bajando o enviando ahora */
    data class Job(val file: String, val pct: Int, val msg: String, val failed: Boolean = false, val done: Boolean = false)

    private val _faces = MutableStateFlow<List<Face>?>(null)
    val faces: StateFlow<List<Face>?> = _faces
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error
    private val _job = MutableStateFlow<Job?>(null)
    val job: StateFlow<Job?> = _job

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var acked = false
    @Volatile private var lastNews = 0L

    private fun open(url: String, from: Long = 0): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            useCaches = false
            if (from > 0) setRequestProperty("Range", "bytes=$from-")
        }

    fun load() {
        _error.value = null
        scope.launch {
            runCatching {
                val text = open(BASE + "esferas.json?t=${System.currentTimeMillis() / 60000}").inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
                val arr = JSONArray(text)
                val list = (0 until arr.length()).map { i ->
                    val o: JSONObject = arr.getJSONObject(i)
                    Face(o.optString("file"), o.optString("name"), o.optString("package"), o.optLong("version"), o.optLong("size"))
                }.filter { it.file.isNotEmpty() && it.pkg.isNotEmpty() }
                // Las dos apps del reloj (una puede instalar o actualizar la otra): su versión es el número de compilación
                val apps = runCatching {
                    val v = JSONObject(open(BASE + "version-reloj.json?t=${System.currentTimeMillis() / 60000}").inputStream.use { it.readBytes().toString(Charsets.UTF_8) })
                    val build = v.optLong("build")
                    if (build <= 0) emptyList() else listOf(
                        Face("CarlosPNauto-Reloj.apk", "PulsoMedia (app del reloj)", "cl.carlospnauto.app", build, 0, app = true),
                        Face("PulsoMusic-Reloj.apk", "PulsoMusic (app del reloj)", "cl.carlospnauto.music", build, 0, app = true),
                    )
                }.getOrDefault(emptyList())
                _faces.value = apps + list.sortedBy { it.name.lowercase() }
            }.onFailure {
                if (_faces.value == null) _error.value = "No se pudo cargar la lista. Revisa la conexión del reloj"
            }
        }
    }

    /** Versión instalada (o null si no está) */
    private fun installedCode(c: Context, pkg: String): Long? = runCatching {
        val p = c.packageManager.getPackageInfo(pkg, 0)
        if (Build.VERSION.SDK_INT >= 28) p.longVersionCode else @Suppress("DEPRECATION") p.versionCode.toLong()
    }.getOrNull()

    /** ¿Este pedido es de la tienda (y no la actualización de esta misma app desde su aviso)? */
    fun owns(name: String) = _job.value?.file == name || name.startsWith("Esfera")

    /** Versión instalada para mostrar */
    fun installedLabel(c: Context, f: Face): String? = runCatching { c.packageManager.getPackageInfo(f.pkg, 0).versionName }.getOrNull()

    /**
     * Lo instalado en el reloj para el teléfono: { paquete: versión } de las esferas propias y de las
     * dos apps del reloj
     */
    fun installedReport(c: Context): JSONObject {
        val o = JSONObject()
        runCatching {
            val pm = c.packageManager
            val faces = pm.queryIntentServices(Intent("android.service.wallpaper.WallpaperService"), 0).map { it.serviceInfo.packageName }
            for (pkg in (faces.filter { it.startsWith("cl.carlospnauto.esfera") } + listOf("cl.carlospnauto.app", "cl.carlospnauto.music")).distinct()) {
                installedCode(c, pkg)?.let { o.put(pkg, it) }
            }
        }
        return o
    }

    fun status(c: Context, f: Face): Status {
        val code = installedCode(c, f.pkg) ?: return Status.MISSING
        return if (code < f.version) Status.UPDATE else Status.INSTALLED
    }

    private fun busy() = _job.value?.let { !it.failed && !it.done } == true

    /** Instalar o actualizar una esfera: primero se le pide al teléfono, si no responde la baja el reloj */
    fun get(c: Context, f: Face) {
        if (busy()) return
        val app = c.applicationContext
        acked = false
        _job.value = Job(f.file, 0, "Pidiéndosela al teléfono…")
        scope.launch {
            val asked = runCatching {
                val nodes = Tasks.await(Wearable.getNodeClient(app).connectedNodes, 10, TimeUnit.SECONDS)
                nodes.forEach { n -> Tasks.await(Wearable.getMessageClient(app).sendMessage(n.id, "/cpn/update", f.file.toByteArray()), 10, TimeUnit.SECONDS) }
                nodes.isNotEmpty()
            }.getOrDefault(false)
            if (asked) repeat(16) { if (!acked) delay(500) }
            if (!asked || !acked) return@launch download(app, f.file)
            lastNews = System.currentTimeMillis()
            while (_job.value?.let { it.file == f.file && !it.failed && !it.done && it.pct < 100 } == true) {
                delay(3000)
                // El teléfono se quedó callado: la descarga el reloj
                if (System.currentTimeMillis() - lastNews > 90_000) return@launch download(app, f.file)
            }
        }
    }

    fun clear() {
        if (!busy()) _job.value = null
    }

    /** El teléfono tomó el pedido ("/cpn/updateack") */
    fun onAck(name: String) {
        val j = _job.value ?: return
        if (j.file != name) return
        acked = true
        lastNews = System.currentTimeMillis()
        _job.value = j.copy(msg = "El teléfono la está descargando…")
    }

    /** Avance desde el teléfono ("/cpn/updateprog"): { name, state, pct, msg } */
    fun onProgress(o: JSONObject) {
        val j = _job.value ?: return
        if (j.file != o.optString("name") || j.failed || j.done) return
        lastNews = System.currentTimeMillis()
        val pct = o.optInt("pct")
        _job.value = when (o.optString("state")) {
            "download" -> j.copy(pct = pct / 2, msg = "El teléfono la está descargando…")
            "send" -> j.copy(pct = 50 + pct / 2, msg = "Enviándola al reloj…")
            "sent", "done" -> j.copy(pct = 100, msg = "Llegó: confirma la instalación")
            "error" -> j.copy(failed = true, msg = o.optString("msg", "No se pudo enviar"))
            else -> j
        }
    }

    /** Llegó el archivo (ApkService): se abre la pantalla de instalar */
    fun onReceived(name: String) {
        val j = _job.value ?: return
        if (j.file == name) _job.value = j.copy(pct = 100, msg = "Llegó: confirma la instalación")
    }

    /** Se instaló (InstallActivity) */
    fun onInstalled(name: String) {
        val j = _job.value ?: return
        if (j.file == name) _job.value = j.copy(pct = 100, done = true, msg = "Instalada ✓")
    }

    private suspend fun download(app: Context, name: String) {
        _job.value = Job(name, 0, "Descargándola en el reloj…")
        val dir = File(app.filesDir, "recibidos").apply { mkdirs() }
        val file = File(dir, name)
        file.delete()
        var total = -1L
        var lastError = "No se pudo descargar. Revisa la conexión del reloj"
        for (attempt in 0 until 5) {
            try {
                val from = file.length()
                val conn = open(BASE + name, from)
                val code = conn.responseCode
                if (code !in 200..299) throw IllegalStateException("No se pudo descargar ($code)")
                val append = from > 0 && code == 206
                if (!append && from > 0) file.delete()
                val len = conn.contentLengthLong
                if (len > 0) total = (if (append) from else 0L) + len
                var done = if (append) from else 0L
                var last = -1
                conn.inputStream.use { input ->
                    java.io.FileOutputStream(file, append).use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            done += n
                            val pct = if (total > 0) (done * 100 / total).toInt() else 0
                            if (pct != last) { last = pct; _job.value = Job(name, pct, "Descargándola en el reloj…") }
                        }
                    }
                }
                if (total > 0 && file.length() != total) throw java.io.IOException("La descarga quedó incompleta")
                _job.value = Job(name, 100, "Descargada: confirma la instalación")
                runCatching { app.startActivity(InstallActivity.intent(app, file).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                return
            } catch (e: Exception) {
                lastError = e.message ?: lastError
                delay(2000L * (attempt + 1))
            }
        }
        file.delete()
        _job.value = Job(name, 0, lastError, failed = true)
    }

    /** Abre la pantalla de instalar si el archivo ya está en el reloj (por si no se abrió sola) */
    fun installReceived(c: Context, name: String): Boolean {
        val f = File(File(c.filesDir, "recibidos"), name)
        if (!f.exists()) return false
        c.startActivity(InstallActivity.intent(c, f).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
    }
}
