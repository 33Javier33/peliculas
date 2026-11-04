package cl.carlospnauto.wear

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/**
 * Mientras suena música en el teléfono, el reloj muestra un "evento en curso" de la app (el ícono
 * en la esfera y en la lista de apps recientes): al tocarlo se abre la app del reloj, no los
 * controles multimedia del sistema. El teléfono avisa con "/cpn/now" al cambiar la canción o al
 * pausar, y con "/cpn/stop" al cerrar la música.
 */
class NowService : WearableListenerService() {
    override fun onMessageReceived(e: MessageEvent) {
        when (e.path) {
            "/cpn/now" -> {
                val o = runCatching { JSONObject(String(e.data)) }.getOrNull() ?: return
                NowNotice.show(applicationContext, o.optString("title"), o.optString("artist"), o.optBoolean("playing"))
            }
            "/cpn/stop" -> NowNotice.hide(applicationContext)
        }
    }
}

object NowNotice {
    private const val CHANNEL = "sonando"
    private const val ID = 7

    fun show(c: Context, title: String, artist: String, playing: Boolean) {
        if (title.isBlank()) return hide(c)
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val nm = c.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Sonando en el teléfono", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
        val open = PendingIntent.getActivity(
            c, 0,
            Intent(c, WatchActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val text = if (artist.isBlank()) title else "$title · $artist"
        val b = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_bars)
            .setContentTitle(if (playing) "Sonando" else "En pausa")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        OngoingActivity.Builder(c, ID, b)
            // Barritas que se mueven mientras suena (como las de los controles del sistema)
            .apply { if (playing) setAnimatedIcon(R.drawable.ic_bars_anim) }
            .setStaticIcon(R.drawable.ic_bars)
            .setTouchIntent(open)
            .setStatus(Status.Builder().addTemplate(text).build())
            .build()
            .apply(c)
        runCatching { nm.notify(ID, b.build()) }
    }

    fun hide(c: Context) {
        runCatching { c.getSystemService(NotificationManager::class.java).cancel(ID) }
    }
}
