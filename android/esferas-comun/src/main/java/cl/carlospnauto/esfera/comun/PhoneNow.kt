package cl.carlospnauto.esfera.comun

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.time.ZonedDateTime

/**
 * Lo que suena en PulsoMusic (o PulsoMedia) del teléfono. Lo pasa la app del reloj (la única a la que
 * el teléfono le puede hablar) y las esferas lo muestran en «modo reproductor».
 */
object PhoneNow {
    private const val ACTION_NOW = "cl.carlospnauto.esfera.NOW"
    private const val ACTION_ASK = "cl.carlospnauto.esfera.ASK"
    private const val ACTION_CMD = "cl.carlospnauto.esfera.CMD"
    private val APPS = listOf("cl.carlospnauto.music", "cl.carlospnauto.app")

    data class State(
        val title: String,
        val artist: String,
        val playing: Boolean,
        val positionMs: Long,
        val durationMs: Long,
        val receivedAt: Long,
        val volume: Int,
        val from: String,
    ) {
        /** Segundo en que va (avanza solo mientras suena) */
        fun position(now: Long = System.currentTimeMillis()): Long {
            if (positionMs < 0) return 0
            val p = if (playing) positionMs + (now - receivedAt) else positionMs
            return if (durationMs > 0) p.coerceAtMost(durationMs) else p
        }
    }

    @Volatile var state: State? = null
        private set
    @Volatile private var pausedAt = 0L

    /**
     * Modo reproductor de la esfera. Por defecto apagado: la esfera queda con su pantalla de siempre.
     * Encendido, al sonar música la pantalla pasa a reproductor, y tocar la pantalla cambia entre
     * la vista normal y la del reproductor.
     */
    val CHOICE = Choice("reproductor2", "Modo reproductor", listOf("Apagado (pantalla normal)" to 1, "Al sonar PulsoMusic" to 0))

    /** Canción para la que se eligió ver la pantalla normal (tocando la pantalla) */
    @Volatile private var hiddenFor: String? = null

    fun enabled(c: Context) = Choices.value(c, CHOICE) == 0

    /** ¿Hay música para mostrar? (sonando, o pausada hace menos de 1 minuto) */
    private fun hasMusic(): Boolean {
        val s = state ?: return false
        return s.playing || System.currentTimeMillis() - pausedAt < 60_000
    }

    /** Tocar la pantalla: cambia entre la vista normal y la del reproductor. true si cambió */
    fun toggleView(c: Context): Boolean {
        if (!enabled(c) || !hasMusic()) return false
        val title = state?.title ?: return false
        hiddenFor = if (hiddenFor == title) null else title
        return true
    }

    private var receiver: BroadcastReceiver? = null
    private var listeners = 0

    /** Empieza a escuchar (al crearse la esfera); onChange redibuja */
    fun start(c: Context, onChange: () -> Unit) {
        val app = c.applicationContext
        listeners++
        if (receiver == null) {
            val rec = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context, i: Intent) {
                    val json = i.getStringExtra("now").orEmpty()
                    val o = runCatching { JSONObject(json) }.getOrNull()
                    val s = o?.let {
                        State(
                            it.optString("title"), it.optString("artist"), it.optBoolean("playing"),
                            it.optLong("position", -1), it.optLong("duration", 0), it.optLong("recv", System.currentTimeMillis()),
                            it.optInt("vol", -1), i.getStringExtra("from").orEmpty(),
                        )
                    }?.takeIf { it.title.isNotBlank() }
                    if (s != null && !s.playing && state?.playing != false) pausedAt = System.currentTimeMillis()
                    state = s
                    onChangeAll.forEach { it() }
                }
            }
            ContextCompat.registerReceiver(app, rec, IntentFilter(ACTION_NOW), ContextCompat.RECEIVER_EXPORTED)
            receiver = rec
        }
        onChangeAll += onChange
        ask(app)
    }

    private val onChangeAll = mutableListOf<() -> Unit>()

    fun stop(c: Context, onChange: () -> Unit) {
        onChangeAll -= onChange
        listeners--
        if (listeners <= 0) {
            receiver?.let { runCatching { c.applicationContext.unregisterReceiver(it) } }
            receiver = null
            listeners = 0
        }
    }

    /** Pregunta a la app del reloj qué suena (al encender la esfera o al volver a verla) */
    fun ask(c: Context) {
        for (p in APPS) runCatching { c.sendBroadcast(Intent(ACTION_ASK).setPackage(p)) }
    }

    /** Anterior / siguiente / reproducir / pausar (los manda la app del reloj al teléfono) */
    fun command(c: Context, a: String) {
        val target = state?.from?.takeIf { it.isNotEmpty() }
        for (p in if (target != null) listOf(target) else APPS) runCatching { c.sendBroadcast(Intent(ACTION_CMD).setPackage(p).putExtra("a", a)) }
    }

    /** ¿Se muestra el reproductor? Mientras suena, y hasta 1 minuto después de pausar */
    fun active(c: Context): Boolean {
        if (!enabled(c) || !hasMusic()) return false
        // Se eligió la pantalla normal para esta canción (vuelve el reproductor con la siguiente)
        return state?.title != hiddenFor
    }
}

/**
 * Pantalla de reproductor dentro de la pantalla de cristal líquido de la esfera: la hora arriba,
 * ícono de señal y volumen, el título y el artista, la barra de avance y los botones.
 * Toques: ◄ anterior, ►‖ reproducir/pausar, ►| siguiente.
 */
object PlayerScreen {
    private val text = Paint(Paint.ANTI_ALIAS_FLAG)
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val path = Path()
    private val bold = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    private val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)

    private fun fit(canvas: Canvas, s: String, x: Float, y: Float, size: Float, maxW: Float, color: Int, face: Typeface) {
        text.typeface = face
        text.textSize = size
        text.textAlign = Paint.Align.CENTER
        text.textScaleX = 1f
        var t = s
        val w = text.measureText(t)
        if (w > maxW) {
            // Primero se angosta un poco; si aún no cabe, se corta con «…»
            text.textScaleX = maxOf(0.78f, maxW / w)
            while (t.length > 3 && text.measureText(t) > maxW) t = t.dropLast(2) + "…"
        }
        text.color = color
        canvas.drawText(t, x, y, text)
        text.textScaleX = 1f
    }

    // Zonas de los botones (para los toques), relativas a la pantalla
    private fun prevZone(lcd: RectF, r: Float) = RectF(lcd.left, lcd.bottom - r * 0.15f, lcd.left + r * 0.16f, lcd.bottom)
    private fun playZone(lcd: RectF, r: Float) = RectF(lcd.right - r * 0.30f, lcd.bottom - r * 0.15f, lcd.right - r * 0.15f, lcd.bottom)
    private fun nextZone(lcd: RectF, r: Float) = RectF(lcd.right - r * 0.15f, lcd.bottom - r * 0.15f, lcd.right, lcd.bottom)

    /** Qué botón se tocó (null si ninguno) */
    fun hit(lcd: RectF, r: Float, x: Float, y: Float, s: PhoneNow.State): String? = when {
        prevZone(lcd, r).contains(x, y) -> "prev"
        playZone(lcd, r).contains(x, y) -> if (s.playing) "pause" else "play"
        nextZone(lcd, r).contains(x, y) -> "next"
        else -> null
    }

    fun draw(
        canvas: Canvas, lcd: RectF, r: Float, t: ZonedDateTime, is24: Boolean,
        s: PhoneNow.State, ink: Int, ghost: Int, accent: Int, sub: Int, ambient: Boolean,
    ) {
        val pad = r * 0.05f
        // Señal (barra y ondas) y volumen
        fill.color = ink
        val sx = lcd.left + pad
        val sy = lcd.top + r * 0.075f
        canvas.drawRoundRect(RectF(sx, sy - r * 0.022f, sx + r * 0.022f, sy + r * 0.022f), r * 0.005f, r * 0.005f, fill)
        stroke.color = ink
        stroke.strokeWidth = r * 0.009f
        for (k in 0 until 4) {
            val rad = r * (0.02f + k * 0.016f)
            canvas.drawArc(RectF(sx + r * 0.022f - rad, sy - rad, sx + r * 0.022f + rad, sy + rad), -35f, 70f, false, stroke)
        }
        if (s.volume >= 0) {
            text.typeface = medium
            text.textSize = r * 0.05f
            text.textAlign = Paint.Align.LEFT
            text.color = sub
            canvas.drawText("VOL ${s.volume}", sx, sy + r * 0.085f, text)
        }

        // Hora arriba a la derecha (dígitos de segmentos)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
        val m = "%02d".format(t.minute)
        val dh = lcd.height() * 0.30f
        val dw = dh * 0.52f
        val step = dw * 1.22f
        var x = lcd.right - pad - (step * 3 + dw + dw * 0.5f)
        val top = lcd.top + r * 0.04f
        Lcd.digit(canvas, h[0], x, top, dw, dh, ink, ghost); x += step
        Lcd.digit(canvas, h[1], x, top, dw, dh, ink, ghost); x += step
        Lcd.colon(canvas, x + dw * 0.12f, top, dh, r * 0.016f, ink); x += dw * 0.5f
        Lcd.digit(canvas, m[0], x, top, dw, dh, ink, ghost); x += step
        Lcd.digit(canvas, m[1], x, top, dw, dh, ink, ghost)

        // Título y artista
        val maxW = lcd.width() - pad * 2
        val ty = top + dh + (lcd.bottom - r * 0.15f - top - dh) * 0.55f
        fit(canvas, s.title.uppercase(), lcd.centerX(), ty, r * 0.085f, maxW, accent, bold)
        if (s.artist.isNotBlank()) fit(canvas, s.artist.uppercase(), lcd.centerX(), ty + r * 0.075f, r * 0.058f, maxW, sub, medium)

        // Barra de avance con ◄ y ►‖ / ►|
        val by = lcd.bottom - r * 0.075f
        val left = lcd.left + r * 0.13f
        val right = lcd.right - r * 0.32f
        stroke.strokeWidth = r * 0.016f
        stroke.color = ghost.takeIf { android.graphics.Color.alpha(it) > 0 } ?: android.graphics.Color.argb(60, android.graphics.Color.red(ink), android.graphics.Color.green(ink), android.graphics.Color.blue(ink))
        canvas.drawLine(left, by, right, by, stroke)
        val f = if (s.durationMs > 0) (s.position().toFloat() / s.durationMs).coerceIn(0f, 1f) else 0f
        stroke.color = accent
        if (f > 0f) canvas.drawLine(left, by, left + (right - left) * f, by, stroke)
        // ◄ anterior
        fill.color = accent
        val a = r * 0.03f
        path.reset()
        path.moveTo(lcd.left + pad, by); path.lineTo(lcd.left + pad + a * 1.6f, by - a); path.lineTo(lcd.left + pad + a * 1.6f, by + a); path.close()
        canvas.drawPath(path, fill)
        // ►‖ reproducir / pausar
        val px = lcd.right - r * 0.265f
        if (s.playing) {
            canvas.drawRect(px, by - a, px + a * 0.55f, by + a, fill)
            canvas.drawRect(px + a * 1.05f, by - a, px + a * 1.6f, by + a, fill)
        } else {
            path.reset()
            path.moveTo(px, by - a); path.lineTo(px + a * 1.6f, by); path.lineTo(px, by + a); path.close()
            canvas.drawPath(path, fill)
        }
        // ►| siguiente
        val nx = lcd.right - r * 0.13f
        path.reset()
        path.moveTo(nx, by - a); path.lineTo(nx + a * 1.4f, by); path.lineTo(nx, by + a); path.close()
        canvas.drawPath(path, fill)
        canvas.drawRect(nx + a * 1.45f, by - a, nx + a * 1.85f, by + a, fill)
    }
}
