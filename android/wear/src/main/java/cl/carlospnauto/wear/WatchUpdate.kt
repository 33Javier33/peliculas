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
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Actualización de la app del reloj desde el propio reloj: revisa la última versión publicada y,
 * si hay una más nueva, la app lo avisa («Tu versión está desactualizada») y con un botón el reloj
 * la descarga y abre el instalador (el mismo de las esferas).
 */
object WatchUpdate {
    private const val BASE = "https://github.com/33Javier33/peliculas/releases/download/android-latest/"

    sealed class State {
        object None : State()
        data class Available(val current: String, val latest: String, val notes: String) : State()
        data class Downloading(val latest: String, val pct: Int) : State()
        data class Failed(val latest: String, val msg: String) : State()
    }

    private val _state = MutableStateFlow<State>(State.None)
    val state: StateFlow<State> = _state

    /** «Más tarde»: no se vuelve a mostrar hasta que salga otra versión */
    private val _dismissed = MutableStateFlow(false)
    val dismissed: StateFlow<Boolean> = _dismissed

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var checkedAt = 0L

    private fun isMusic(c: Context) = c.packageName.endsWith(".music")
    private fun apkName(c: Context) = if (isMusic(c)) "PulsoMusic-Reloj.apk" else "CarlosPNauto-Reloj.apk"
    private fun versionFile(c: Context) = if (isMusic(c)) "version-music.json" else "version.json"

    private fun installed(c: Context): Pair<String, Long> = runCatching {
        val p = c.packageManager.getPackageInfo(c.packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= 28) p.longVersionCode else @Suppress("DEPRECATION") p.versionCode.toLong()
        (p.versionName ?: "") to code
    }.getOrDefault("" to 0L)

    private fun open(url: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 60_000
            instanceFollowRedirects = true
        }

    /** Revisa si hay versión nueva (como mucho cada 3 horas, salvo force) */
    fun check(c: Context, force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - checkedAt < 3 * 60 * 60 * 1000) return
        if (_state.value is State.Downloading) return
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

    fun later(c: Context) {
        val latest = when (val s = _state.value) {
            is State.Available -> s.latest
            is State.Failed -> s.latest
            else -> return
        }
        c.getSharedPreferences("update", Context.MODE_PRIVATE).edit().putString("dismissed", latest).apply()
        _dismissed.value = true
        _state.value = State.Available(installed(c).first, latest, "")
    }

    /** Descarga la versión nueva en el reloj y abre el instalador */
    fun start(c: Context) {
        val latest = when (val s = _state.value) {
            is State.Available -> s.latest
            is State.Failed -> s.latest
            else -> return
        }
        val app = c.applicationContext
        _state.value = State.Downloading(latest, 0)
        scope.launch {
            val dir = File(app.filesDir, "recibidos").apply { mkdirs() }
            val file = File(dir, apkName(app))
            try {
                val conn = open(BASE + apkName(app))
                if (conn.responseCode !in 200..299) throw IllegalStateException("No se pudo descargar (${conn.responseCode})")
                val total = conn.contentLengthLong
                var done = 0L
                var last = -1
                conn.inputStream.use { input ->
                    file.outputStream().use { out ->
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
                if (total > 0 && done != total) throw IllegalStateException("La descarga quedó incompleta")
                _state.value = State.Available(installed(app).first, latest, "")
                app.startActivity(InstallActivity.intent(app, file).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: Exception) {
                file.delete()
                _state.value = State.Failed(latest, e.message ?: "No se pudo descargar. Revisa la conexión del reloj")
            }
        }
    }
}
