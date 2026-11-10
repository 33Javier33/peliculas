package cl.carlospnauto.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.util.SizeF
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

    // Android 11 o anterior: al cambiar el tamaño se vuelve a dibujar con el diseño que calza
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        idle(context, keepLive = true)
    }

    companion object {
        // Último estado (para volver a dibujar al cambiar el tamaño)
        private var last: State? = null
        private data class State(val title: String?, val artist: String?, val playing: Boolean, val liked: Boolean, val art: Bitmap?, val live: Boolean)

        /** Los 4 diseños, del más chico al más grande, con el tamaño mínimo (dp) en que caben */
        private val LAYOUTS = listOf(
            Triple(R.layout.widget_small, 110f, 40f),
            Triple(R.layout.widget_player, 250f, 40f),
            Triple(R.layout.widget_tall, 110f, 150f),
            Triple(R.layout.widget_large, 250f, 150f),
        )

        private fun prefs(c: Context) = c.getSharedPreferences("cpn-widget", Context.MODE_PRIVATE)

        /** Lo que suena ahora (lo llama el servicio de reproducción) */
        fun show(c: Context, title: String, artist: String, playing: Boolean, liked: Boolean, art: Bitmap?) {
            prefs(c).edit().putString("title", title).putString("artist", artist).putBoolean("liked", liked).apply()
            render(c, title, artist, playing, liked, art, live = true)
        }

        /** La app se cerró: los botones vuelven a abrir la app (o se redibuja al cambiar el tamaño) */
        fun idle(c: Context, keepLive: Boolean = false) {
            val l = last
            if (keepLive && l != null) return render(c, l.title, l.artist, l.playing, l.liked, l.art, l.live)
            val p = prefs(c)
            render(c, p.getString("title", null), p.getString("artist", null), playing = false, liked = p.getBoolean("liked", false), art = null, live = false)
        }

        private fun render(c: Context, title: String?, artist: String?, playing: Boolean, liked: Boolean, art: Bitmap?, live: Boolean) {
            last = State(title, artist, playing, liked, art, live)
            val manager = AppWidgetManager.getInstance(c)
            val ids = runCatching { manager.getAppWidgetIds(ComponentName(c, PlayerWidget::class.java)) }.getOrNull()
            if (ids == null || ids.isEmpty()) return
            val small = art?.let { scaled(it) }
            val build = { layout: Int -> views(c, layout, title, artist, playing, liked, small, live) }
            for (id in ids) {
                val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // Android 12+: el teléfono elige solo el diseño según el tamaño (también al agrandarlo)
                    RemoteViews(LAYOUTS.associate { (layout, w, h) -> SizeF(w, h) to build(layout) })
                } else {
                    build(layoutFor(manager.getAppWidgetOptions(id)))
                }
                runCatching { manager.updateAppWidget(id, v) }
            }
        }

        /** Android 11 o anterior: el diseño más grande que cabe en el tamaño del widget */
        private fun layoutFor(o: Bundle): Int {
            val w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250).toFloat()
            val h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 80).toFloat()
            return LAYOUTS.lastOrNull { (_, mw, mh) -> w >= mw && h >= mh }?.first ?: R.layout.widget_player
        }

        private fun views(c: Context, layout: Int, title: String?, artist: String?, playing: Boolean, liked: Boolean, art: Bitmap?, live: Boolean): RemoteViews {
            val v = RemoteViews(c.packageName, layout)
            v.setTextViewText(R.id.widget_title, title?.ifBlank { null } ?: c.getString(R.string.app_name))
            v.setTextViewText(R.id.widget_artist, artist?.ifBlank { null } ?: "Toca para abrir la música")
            if (art != null) v.setImageViewBitmap(R.id.widget_art, art) else v.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher)
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
                // Play pasa por una pantalla invisible: despierta la app aunque lleve horas en pausa
                v.setOnClickPendingIntent(R.id.widget_play, if (playing) service(c, PlaybackService.ACTION_PAUSE) else playIntent(c))
                v.setOnClickPendingIntent(R.id.widget_next, service(c, PlaybackService.ACTION_NEXT))
                v.setOnClickPendingIntent(R.id.widget_like, service(c, PlaybackService.ACTION_LIKE))
            } else {
                listOf(R.id.widget_prev, R.id.widget_next, R.id.widget_like).forEach { v.setOnClickPendingIntent(it, open) }
                // App cerrada: play la despierta, suena sola y vuelve al fondo
                v.setOnClickPendingIntent(R.id.widget_play, playIntent(c))
            }
            return v
        }

        private fun playIntent(c: Context): PendingIntent = PendingIntent.getActivity(
            c, 101,
            Intent(c, PlayActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        private fun service(c: Context, action: String): PendingIntent {
            val i = Intent(c, PlaybackService::class.java).setAction(action)
            val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) PendingIntent.getForegroundService(c, 200 + action.hashCode() % 100, i, flags)
            else PendingIntent.getService(c, 200 + action.hashCode() % 100, i, flags)
        }

        /** Carátula chica (el widget tiene un límite de tamaño para las imágenes) */
        private fun scaled(b: Bitmap): Bitmap {
            val max = 180
            if (b.width <= max && b.height <= max) return b
            val ratio = minOf(max.toFloat() / b.width, max.toFloat() / b.height)
            return Bitmap.createScaledBitmap(b, (b.width * ratio).toInt().coerceAtLeast(1), (b.height * ratio).toInt().coerceAtLeast(1), true)
        }
    }
}
