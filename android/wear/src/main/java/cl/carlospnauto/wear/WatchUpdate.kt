package cl.carlospnauto.wear

import android.content.Context
import android.content.Intent
import android.os.Build
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Actualización de la app del reloj: revisa la última versión publicada y, si hay una más nueva,
 * la app lo avisa («Tu versión está desactualizada»). Con «Actualizar» se le pide al teléfono que
 * la descargue (con su internet) y la mande al reloj, como las esferas. Si el teléfono no responde
 * (app del teléfono antigua o cerrada sin conexión), el reloj la descarga él mismo y, si la
 * conexión se corta, sigue desde donde iba. Al terminar queda el botón «Instalar».
 */
object WatchUpdate {
    private const val BASE = "https://github.com/33Javier33/peliculas/releases/download/android-latest/"

    sealed class State {
        object None : State()
        data class Available(val current: String, val latest: String, val notes: String) : State()
        data class Downloading(val latest: String, val pct: Int) : State()
        /** El teléfono la está descargando y enviando */
        data class FromPhone(val latest: String, val pct: Int, val msg: String) : State()
        /** Descargada en el reloj: falta tocar «Instalar» */
        data class Ready(val latest: String, val path: String) : State()
        data class Failed(val latest: String, val msg: String) : State()
    }

    private val _state = MutableStateFlow<State>(State.None)
    val state: StateFlow<State> = _state

    /** «Más tarde»: no se vuelve a mostrar hasta que salga otra versión */
    private val _dismissed = MutableStateFlow(false)
    val dismissed: StateFlow<Boolean> = _dismissed

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var checkedAt = 0L
    @Volatile private var phoneAck = false
    @Volatile private var lastPhoneNews = 0L
    @Volatile private var appCtx: Context? = null

    private fun isMusic(c: Context) = c.packageName.endsWith(".music")
    private fun apkName(c: Context) = if (isMusic(c)) "PulsoMusic-Reloj.apk" else "CarlosPNauto-Reloj.apk"
    private fun versionFile(c: Context) = if (isMusic(c)) "version-music.json" else "version.json"

    private fun installed(c: Context): Pair<String, Long> = runCatching {
        val p = c.packageManager.getPackageInfo(c.packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= 28) p.longVersionCode else @Suppress("DEPRECATION") p.versionCode.toLong()
        (p.versionName ?: "") to code
    }.getOrDefault("" to 0L)

    private fun open(url: String, from: Long = 0): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            if (from > 0) setRequestProperty("Range", "bytes=$from-")
        }

    private fun busy() = _state.value.let { it is State.Downloading || it is State.FromPhone }

    /** Revisa si hay versión nueva (como mucho cada 3 horas, salvo force) */
    fun check(c: Context, force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - checkedAt < 3 * 60 * 60 * 1000) return
        if (busy() || _state.value is State.Ready) return
        checkedAt = now
        val app = c.applicationContext
        scope.launch {
            runCatching {
                val conn = open(BASE + versionFile(app))
                val text = conn.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
                val o = JSONObject(text)
                val build = o.optLong("build")
                val latest = o.optString("version")
                val (current, code) = installed(app)
                val prefs = app.getSharedPreferences("update", Context.MODE_PRIVATE)
                if (build > code && latest.isNotEmpty()) {
                    _dismissed.value = prefs.getString("dismissed", "") == latest
                    _state.value = State.Available(current, latest, o.optString("notes"))
                } else {
                    _state.value = State.None
                }
            }
        }
    }

    private fun latestOf(): String? = when (val s = _state.value) {
        is State.Available -> s.latest
        is State.Failed -> s.latest
        is State.Ready -> s.latest
        is State.FromPhone -> s.latest
        is State.Downloading -> s.latest
        else -> null
    }

    fun later(c: Context) {
        val latest = latestOf() ?: return
        c.getSharedPreferences("update", Context.MODE_PRIVATE).edit().putString("dismissed", latest).apply()
        _dismissed.value = true
        _state.value = State.Available(installed(c).first, latest, "")
    }

    /** «Actualizar»: primero se le pide al teléfono; si no responde, la descarga el reloj */
    fun start(c: Context) {
        val latest = latestOf() ?: return
        if (busy()) return
        val app = c.applicationContext
        appCtx = app
        phoneAck = false
        lastPhoneNews = 0L
        _state.value = State.FromPhone(latest, 0, "Pidiéndosela al teléfono…")
        scope.launch {
            val asked = runCatching {
                val nodes = Tasks.await(Wearable.getNodeClient(app).connectedNodes, 10, TimeUnit.SECONDS)
                nodes.forEach { n -> Tasks.await(Wearable.getMessageClient(app).sendMessage(n.id, "/cpn/update", apkName(app).toByteArray()), 10, TimeUnit.SECONDS) }
                nodes.isNotEmpty()
            }.getOrDefault(false)
            if (asked) {
                // ¿El teléfono la tomó? (las apps del teléfono antiguas no saben hacerlo)
                repeat(16) { if (!phoneAck) delay(500) }
            }
            if (!asked || !phoneAck) return@launch download(app, latest)
            // Mientras el teléfono avise avances se espera; si se queda callado 90 s, la baja el reloj
            lastPhoneNews = System.currentTimeMillis()
            while (_state.value is State.FromPhone) {
                delay(5000)
                if (_state.value is State.FromPhone && System.currentTimeMillis() - lastPhoneNews > 90_000) return@launch download(app, latest)
            }
        }
    }

    /** El teléfono tomó el pedido ("/cpn/updateack") */
    fun onPhoneAck() {
        phoneAck = true
        lastPhoneNews = System.currentTimeMillis()
        val latest = latestOf() ?: return
        _state.value = State.FromPhone(latest, 0, "El teléfono la está descargando…")
    }

    /** Avance desde el teléfono ("/cpn/updateprog"): { state, pct, msg } */
    fun onPhoneProgress(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        val latest = latestOf() ?: return
        if (_state.value !is State.FromPhone) return
        lastPhoneNews = System.currentTimeMillis()
        val pct = o.optInt("pct")
        when (o.optString("state")) {
            "download" -> _state.value = State.FromPhone(latest, pct / 2, "El teléfono la está descargando…")
            "send" -> _state.value = State.FromPhone(latest, 50 + pct / 2, "Enviándola al reloj…")
            // Llegó: ApkService abre la pantalla de instalar (y deja una notificación)
            "sent", "done" -> _state.value = State.FromPhone(latest, 100, "Llegó al reloj: confirma la instalación")
            "error" -> appCtx?.let { app -> scope.launch { download(app, latest) } }
        }
    }

    /** Descarga en el propio reloj (sigue desde donde iba si la conexión se corta) */
    private suspend fun download(app: Context, latest: String) {
        _state.value = State.Downloading(latest, 0)
        val dir = File(app.filesDir, "recibidos").apply { mkdirs() }
        val file = File(dir, apkName(app))
        file.delete()
        var total = -1L
        var lastError = "No se pudo descargar. Revisa la conexión del reloj"
        for (attempt in 0 until 6) {
            try {
                val from = file.length()
                val conn = open(BASE + apkName(app), from)
                val code = conn.responseCode
                if (code !in 200..299) throw IllegalStateException("No se pudo descargar ($code)")
                // El servidor no aceptó seguir desde la mitad: se empieza de nuevo
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
                            if (pct != last) { last = pct; _state.value = State.Downloading(latest, pct) }
                        }
                    }
                }
                if (total > 0 && file.length() != total) throw java.io.IOException("La descarga quedó incompleta")
                _state.value = State.Ready(latest, file.absolutePath)
                // Si el sistema lo permite, se abre de una vez; si no, queda el botón «Instalar»
                runCatching { app.startActivity(InstallActivity.intent(app, file).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                return
            } catch (e: Exception) {
                lastError = e.message ?: lastError
                delay(2000L * (attempt + 1))
            }
        }
        file.delete()
        _state.value = State.Failed(latest, lastError)
    }

    /** «Instalar» (la descarga ya está en el reloj) */
    fun install(c: Context) {
        val s = _state.value as? State.Ready ?: return
        val f = File(s.path)
        if (!f.exists()) {
            _state.value = State.Available(installed(c).first, s.latest, "")
            return
        }
        c.startActivity(InstallActivity.intent(c, f).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
