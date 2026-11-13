package cl.carlospnauto.wear

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** Nombre para mostrar: «Esfera-Explorer.apk» → «Esfera Explorer» */
fun apkLabel(file: String) = file.removeSuffix(".apk").replace('-', ' ')

/** Avisa al teléfono cómo va la instalación */
fun replyToPhone(c: Context, node: String?, name: String, state: String, msg: String = "") {
    val json = JSONObject().put("name", name).put("state", state).put("msg", msg).toString().toByteArray()
    thread {
        runCatching {
            val nodes = if (node != null) listOf(node) else Tasks.await(Wearable.getNodeClient(c).connectedNodes, 10, TimeUnit.SECONDS).map { it.id }
            for (n in nodes) Wearable.getMessageClient(c).sendMessage(n, "/cpn/apkresult", json)
        }
    }
}

/**
 * Recibe del teléfono un APK (una esfera o una actualización de esta app) por "/cpn/apk/<archivo>",
 * lo guarda y abre la pantalla para instalarlo (o deja un aviso: «Toca para instalar»).
 */
class ApkService : WearableListenerService() {
    override fun onChannelOpened(channel: ChannelClient.Channel) {
        if (!channel.path.startsWith("/cpn/apk/")) return
        val name = channel.path.substringAfterLast('/').replace(Regex("[^A-Za-z0-9._-]"), "")
        if (!name.endsWith(".apk")) return
        val dir = File(filesDir, "recibidos").apply { mkdirs() }
        val file = File(dir, name)
        try {
            val client = Wearable.getChannelClient(this)
            val input = Tasks.await(client.getInputStream(channel), 30, TimeUnit.SECONDS)
            input.use { i -> file.outputStream().use { o -> i.copyTo(o, 64 * 1024) } }
            runCatching { Tasks.await(client.close(channel), 10, TimeUnit.SECONDS) }
            if (file.length() < 1024) throw IllegalStateException("El archivo llegó incompleto")
            replyToPhone(this, channel.nodeId, name, "received")
            InstallActivity.notify(this, file)
            // Si el sistema lo permite, abre de una vez la pantalla de instalar
            runCatching { startActivity(InstallActivity.intent(this, file).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        } catch (e: Exception) {
            file.delete()
            replyToPhone(this, channel.nodeId, name, "error", e.message ?: "No llegó bien al reloj")
        }
    }
}

/** Pantalla del reloj que instala el APK recibido (Android pide confirmar) */
class InstallActivity : Activity() {
    companion object {
        private const val CHANNEL = "instalar"
        private const val ACTION_RESULT = "cl.carlospnauto.wear.INSTALL_RESULT"

        fun intent(c: Context, file: File): Intent =
            Intent(c, InstallActivity::class.java).putExtra("file", file.absolutePath)

        fun notify(c: Context, file: File) {
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
            val nm = c.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(NotificationChannel(CHANNEL, "Instalar desde el teléfono", NotificationManager.IMPORTANCE_HIGH))
            val open = PendingIntent.getActivity(c, file.name.hashCode(), intent(c, file).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            nm.notify(
                file.name.hashCode(),
                NotificationCompat.Builder(c, CHANNEL)
                    .setSmallIcon(R.drawable.ic_phone)
                    .setContentTitle("${apkLabel(file.name)} llegó")
                    .setContentText("Toca para instalar")
                    .setContentIntent(open)
                    .setAutoCancel(true)
                    .build(),
            )
        }
    }

    private lateinit var status: TextView
    private lateinit var action: TextView
    private lateinit var action2: TextView
    private var file: File? = null
    private var started = false
    /** El usuario eligió instalar sin el permiso (en algunos relojes el instalador lo resuelve) */
    private var anyway = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.widthPixels * 0.14f).toInt()
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
            minimumHeight = resources.displayMetrics.heightPixels
        }
        status = TextView(this).apply {
            textSize = 15f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
        }
        action = TextView(this).apply {
            textSize = 14f
            gravity = Gravity.CENTER
            setTextColor(Color.BLACK)
            background = GradientDrawable().apply { setColor(Color.rgb(140, 200, 255)); cornerRadius = 60f }
            setPadding(30, 22, 30, 22)
            visibility = android.view.View.GONE
        }
        action2 = TextView(this).apply {
            textSize = 13f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply { setColor(Color.rgb(45, 48, 54)); cornerRadius = 60f }
            setPadding(30, 20, 30, 20)
            visibility = android.view.View.GONE
        }
        col.addView(status)
        col.addView(action, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = 24 })
        col.addView(action2, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = 12 })
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.BLACK); addView(col) })
        file = intent.getStringExtra("file")?.let { File(it) }
        handleResult(intent)
    }

    override fun onResume() {
        super.onResume()
        if (!started) prepare()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleResult(intent)
    }

    private fun button(text: String, onClick: () -> Unit) {
        action.text = text
        action.visibility = android.view.View.VISIBLE
        action.setOnClickListener { onClick() }
        action2.visibility = android.view.View.GONE
    }

    private fun second(text: String, onClick: () -> Unit) {
        action2.text = text
        action2.visibility = android.view.View.VISIBLE
        action2.setOnClickListener { onClick() }
    }

    /**
     * Wear OS (TicWatch y otros) no trae la pantalla «Instalar apps desconocidas»: el permiso se da una
     * vez con una orden de depuración (Bugjaeger → Shell, o adb).
     */
    private fun manual() {
        status.text = "Este reloj no trae el ajuste para permitirlo. Hazlo una sola vez desde el teléfono, con Bugjaeger (conectado al reloj → pestaña Shell) o con adb desde un computador:\n\nappops set $packageName REQUEST_INSTALL_PACKAGES allow\n\nDespués vuelve a tocar «Instalar en el reloj» en el teléfono."
        button("Intentar instalar igual") { anyway = true; prepare() }
        second("Cerrar") { finish() }
    }

    private fun prepare() {
        val f = file
        if (f == null || !f.exists()) {
            status.text = "No hay nada para instalar"
            button("Cerrar") { finish() }
            return
        }
        val label = apkLabel(f.name)
        // Android pide permitir que esta app instale otras (una sola vez)
        if (!packageManager.canRequestPackageInstalls() && !anyway) {
            status.text = "Para instalar $label, permite que ${applicationInfo.loadLabel(packageManager)} instale apps"
            button("Permitir") {
                val opened = runCatching { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) }.isSuccess
                if (!opened) manual()
            }
            second("Instalar igual") { anyway = true; prepare() }
            return
        }
        started = true
        action.visibility = android.view.View.GONE
        status.text = "Instalando $label…"
        thread {
            try {
                val pi = packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                val id = pi.createSession(params)
                pi.openSession(id).use { session ->
                    session.openWrite("apk", 0, f.length()).use { out ->
                        f.inputStream().use { it.copyTo(out, 64 * 1024) }
                        session.fsync(out)
                    }
                    val result = Intent(this, InstallActivity::class.java).setAction(ACTION_RESULT).putExtra("file", f.absolutePath)
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                    session.commit(PendingIntent.getActivity(this, id, result, flags).intentSender)
                }
            } catch (e: Exception) {
                runOnUiThread { fail(e.message ?: "No se pudo instalar") }
            }
        }
    }

    private fun handleResult(intent: Intent) {
        if (intent.action != ACTION_RESULT) return
        val f = file ?: intent.getStringExtra("file")?.let { File(it) }
        val name = f?.name ?: ""
        when (val st = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirm != null) runCatching { startActivity(confirm) }
            }
            PackageInstaller.STATUS_SUCCESS -> {
                f?.delete()
                val face = name.startsWith("Esfera")
                status.text = "${apkLabel(name)} instalada ✓" + if (face) "\n\nPara usarla: mantén presionada la esfera y desliza hasta ella." else ""
                button("Listo") { finish() }
                replyToPhone(this, null, name, "done")
            }
            else -> fail(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "No se pudo instalar ($st)")
        }
    }

    private fun fail(msg: String) {
        started = false
        file?.name?.let { replyToPhone(this, null, it, "error", if (packageManager.canRequestPackageInstalls()) msg else "Falta el permiso para instalar apps en el reloj: mira los pasos en App para el reloj") }
        if (!packageManager.canRequestPackageInstalls()) return manual()
        status.text = "No se pudo instalar:\n$msg"
        button("Reintentar") { prepare() }
    }
}
