package cl.carlospnauto.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Actualización de la app hecha por ella misma (APK 1.0.22+):
 *  1. descarga el APK con su avance (la web lo muestra en el botón),
 *  2. comprueba que llegó completo y que Android lo reconoce (si no, lo borra y avisa: nunca
 *     se abre el instalador con un archivo dañado),
 *  3. abre el instalador; si falta el permiso "instalar apps desconocidas", lleva a ese ajuste
 *     y al volver abre el instalador solo.
 *
 * El avance llega a la web en window.__cpnApkUpdate({ state, done, total, message }).
 */
object AppUpdater {
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var running = false
    private var pending: File? = null

    private fun report(activity: Activity?, state: String, done: Long = 0, total: Long = 0, message: String = "") {
        val o = JSONObject().put("state", state).put("done", done).put("total", total).put("message", message)
        main.post {
            (activity as? MainActivity)?.runJs("window.__cpnApkUpdate && window.__cpnApkUpdate($o)")
        }
    }

    fun start(activity: Activity, url: String) {
        if (running) return
        running = true
        report(activity, "start")
        Thread {
            val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
            dir.listFiles()?.forEach { it.delete() }
            val part = File(dir, "CarlosPNauto.apk.part")
            val apk = File(dir, "CarlosPNauto.apk")
            try {
                val client = OkDownloader.instance.client.newBuilder()
                    .readTimeout(60, TimeUnit.SECONDS)
                    .followRedirects(true)
                    .followSslRedirects(true)
                    .build()
                val req = Request.Builder().url(url).header("Cache-Control", "no-cache").build()
                client.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) throw Exception("El servidor respondió ${res.code}")
                    val body = res.body ?: throw Exception("Respuesta vacía")
                    val total = body.contentLength()
                    var done = 0L
                    var last = 0L
                    body.byteStream().use { input ->
                        part.outputStream().use { out ->
                            val buf = ByteArray(64 * 1024)
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                done += n
                                val now = System.currentTimeMillis()
                                if (now - last > 250) {
                                    last = now
                                    report(activity, "downloading", done, total)
                                }
                            }
                        }
                    }
                    if (total > 0 && done != total) throw Exception("La descarga se cortó ($done de $total bytes)")
                    report(activity, "verifying", done, total)
                }
                // ¿Android lo reconoce como esta app? (un archivo cortado o una página de error no)
                val info = activity.packageManager.getPackageArchiveInfo(part.absolutePath, 0)
                    ?: throw Exception("El archivo descargado está dañado")
                if (info.packageName != activity.packageName) throw Exception("El archivo no es de esta app")
                if (!part.renameTo(apk)) throw Exception("No se pudo guardar la actualización")
                main.post {
                    running = false
                    install(activity, apk)
                }
            } catch (e: Exception) {
                part.delete()
                running = false
                report(activity, "error", message = e.message ?: "No se pudo descargar")
            }
        }.start()
    }

    /** Abre el instalador de Android (o el permiso para instalar, si aún no está dado) */
    fun install(activity: Activity, apk: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            pending = apk
            report(activity, "permission")
            runCatching {
                activity.startActivity(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
                )
            }
            return
        }
        pending = null
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", apk)
        runCatching {
            activity.startActivity(
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            report(activity, "installing")
        }.onFailure { report(activity, "error", message = "No se pudo abrir el instalador") }
    }

    /** Al volver del ajuste del permiso: si ya lo dio, se abre el instalador */
    fun onResume(activity: Activity) {
        val apk = pending ?: return
        if (!apk.exists()) {
            pending = null
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.packageManager.canRequestPackageInstalls()) install(activity, apk)
        else {
            pending = null
            report(activity, "error", message = "Falta permitir \"instalar apps desconocidas\" para esta app")
        }
    }
}
