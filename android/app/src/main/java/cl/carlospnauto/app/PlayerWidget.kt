package cl.carlospnauto.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.widget.RemoteViews

/**
 * Widget de la pantalla de inicio: carátula, canción, artista y los botones anterior,
 * reproducir/pausar, siguiente y ♥ Me gusta. Lo actualiza el servicio de reproducción cada vez
 * que cambia lo que suena. Con la app cerrada, tocarlo abre la app.
 */
class PlayerWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        // El sistema lo pide (al agregarlo o al reiniciar): se muestra lo último que sonó
        val p = prefs(context)
        render(context, p.getString("title", null), p.getString("artist", null), playing = false, liked = p.getBoolean("liked", false), art = null, live = false)
    }

    companion object {
        private fun prefs(c: Context) = c.getSharedPreferences("cpn-widget", Context.MODE_PRIVATE)

        /** Lo que suena ahora (lo llama el servicio de reproducción) */
        fun show(c: Context, title: String, artist: String, playing: Boolean, liked: Boolean, art: Bitmap?) {
            prefs(c).edit().putString("title", title).putString("artist", artist).putBoolean("liked", liked).apply()
            render(c, title, artist, playing, liked, art, live = true)
        }

        /** La app se cerró: los botones vuelven a abrir la app */
        fun idle(c: Context) {
            val p = prefs(c)
            render(c, p.getString("title", null), p.getString("artist", null), playing = false, liked = p.getBoolean("liked", false), art = null, live = false)
        }

        private fun render(c: Context, title: String?, artist: String?, playing: Boolean, liked: Boolean, art: Bitmap?, live: Boolean) {
            val manager = AppWidgetManager.getInstance(c)
            val ids = runCatching { manager.getAppWidgetIds(ComponentName(c, PlayerWidget::class.java)) }.getOrNull()
            if (ids == null || ids.isEmpty()) return
            val v = RemoteViews(c.packageName, R.layout.widget_player)
            v.setTextViewText(R.id.widget_title, title?.ifBlank { null } ?: c.getString(R.string.app_name))
            v.setTextViewText(R.id.widget_artist, artist?.ifBlank { null } ?: "Toca para abrir la música")
            if (art != null) v.setImageViewBitmap(R.id.widget_art, scaled(art)) else v.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher)
            v.setImageViewResource(R.id.widget_play, if (playing) R.drawable.ic_pause else R.drawable.ic_play)
            v.setImageViewResource(R.id.widget_like, if (liked) R.drawable.ic_heart_filled else R.drawable.ic_heart)

            val open = PendingIntent.getActivity(
                c, 100, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            v.setOnClickPendingIntent(R.id.widget_art, open)
            v.setOnClickPendingIntent(R.id.widget_info, open)
            if (live) {
                // App abierta: los botones controlan la música sin abrirla
                v.setOnClickPendingIntent(R.id.widget_prev, service(c, PlaybackService.ACTION_PREV))
                v.setOnClickPendingIntent(R.id.widget_play, service(c, if (playing) PlaybackService.ACTION_PAUSE else PlaybackService.ACTION_PLAY))
                v.setOnClickPendingIntent(R.id.widget_next, service(c, PlaybackService.ACTION_NEXT))
                v.setOnClickPendingIntent(R.id.widget_like, service(c, PlaybackService.ACTION_LIKE))
            } else {
                listOf(R.id.widget_prev, R.id.widget_play, R.id.widget_next, R.id.widget_like).forEach { v.setOnClickPendingIntent(it, open) }
            }
            runCatching { manager.updateAppWidget(ids, v) }
        }

        private fun service(c: Context, action: String): PendingIntent {
            val i = Intent(c, PlaybackService::class.java).setAction(action)
            val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) PendingIntent.getForegroundService(c, 200 + action.hashCode() % 100, i, flags)
            else PendingIntent.getService(c, 200 + action.hashCode() % 100, i, flags)
        }

        /** Carátula chica (el widget tiene un límite de tamaño para las imágenes) */
        private fun scaled(b: Bitmap): Bitmap {
            val max = 192
            if (b.width <= max && b.height <= max) return b
            val ratio = minOf(max.toFloat() / b.width, max.toFloat() / b.height)
            return Bitmap.createScaledBitmap(b, (b.width * ratio).toInt().coerceAtLeast(1), (b.height * ratio).toInt().coerceAtLeast(1), true)
        }
    }
}
