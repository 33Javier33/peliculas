package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.os.BatteryManager
import android.text.format.DateFormat
import android.view.SurfaceHolder
import androidx.wear.watchface.CanvasComplicationFactory
import androidx.wear.watchface.CanvasType
import androidx.wear.watchface.ComplicationSlot
import androidx.wear.watchface.ComplicationSlotsManager
import androidx.wear.watchface.DrawMode
import androidx.wear.watchface.Renderer
import androidx.wear.watchface.TapEvent
import androidx.wear.watchface.TapType
import androidx.wear.watchface.WatchFace
import androidx.wear.watchface.WatchFaceService
import androidx.wear.watchface.WatchFaceType
import androidx.wear.watchface.WatchState
import androidx.wear.watchface.complications.ComplicationSlotBounds
import androidx.wear.watchface.complications.DefaultComplicationDataSourcePolicy
import androidx.wear.watchface.complications.SystemDataSources
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.rendering.CanvasComplicationDrawable
import androidx.wear.watchface.complications.rendering.ComplicationDrawable
import androidx.wear.watchface.style.CurrentUserStyleRepository
import cl.carlospnauto.esfera.comun.Action
import cl.carlospnauto.esfera.comun.Choice
import cl.carlospnauto.esfera.comun.Choices
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.HeartRate
import cl.carlospnauto.esfera.comun.Lcd
import cl.carlospnauto.esfera.comun.PhoneNow
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Spot
import cl.carlospnauto.esfera.comun.textOf
import cl.carlospnauto.esfera.comun.titleOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.time.ZonedDateTime
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

private const val STEPS = 101
private const val HEART = 102
private const val UNREAD = 103
private const val EVENT = 104
private const val WEATHER = 105

/** Pantalla: fondo y tinta */
private data class Screen(val bg: Int, val ink: Int)

private val SCREENS = listOf(
    "Gris claro (reflectiva)" to Screen(Color.rgb(170, 174, 166), Color.rgb(28, 30, 30)),
    "Oscura" to Screen(Color.rgb(28, 30, 32), Color.rgb(212, 216, 208)),
    "Verde LCD" to Screen(Color.rgb(178, 200, 150), Color.rgb(24, 34, 18)),
    "Ámbar" to Screen(Color.rgb(226, 196, 130), Color.rgb(44, 30, 10)),
    "Celeste" to Screen(Color.rgb(170, 200, 214), Color.rgb(16, 30, 40)),
    "Negativa azul" to Screen(Color.rgb(10, 18, 34), Color.rgb(110, 196, 255)),
    "Negativa roja" to Screen(Color.rgb(28, 8, 8), Color.rgb(255, 100, 86)),
    "Negativa verde" to Screen(Color.rgb(6, 22, 10), Color.rgb(120, 245, 150)),
)
private val SCREEN = Choice("pantalla", "Pantalla", SCREENS.map { it.first to it.second.bg })
private val WEIGHT = Choice("grosor", "Números de la hora", listOf("Gruesos" to 0, "Delgados" to 1))
private val PLAYER = Choice("reproductor", "Mini reproductor", listOf("Al sonar música" to 0, "Siempre visible" to 1, "Oculto" to 2))
private val BOX = Choice("recuadro", "Recuadro sin música", listOf("Próximo evento" to 0, "Clima" to 1, "Vacío" to 2))
private val SECONDS = Choice("segundos", "Segundos", listOf("Visibles" to 0, "Ocultos" to 1))
private val CORNERS = Choice("esquinas", "Esquinas", listOf("Visibles" to 0, "Ocultas" to 1))
private val AMB = Choice("bajo", "Bajo consumo", listOf("Esfera completa (oscura)" to 0, "Solo la hora" to 1))

object Config : FaceConfig {
    override val slots = listOf(
        UNREAD to "Notificaciones (arriba)", STEPS to "Pasos (abajo izquierda)", HEART to "Ritmo cardíaco (abajo derecha)",
        EVENT to "Evento (recuadro sin música)", WEATHER to "Clima (recuadro sin música)",
    )
    override val spots = listOf(
        Spot(-0.10f, -0.745f, Action.ALARMS, "Fecha", hit = 0.10f),
        Spot(-0.47f, -0.505f, Action.MEDIA, "Día de la semana", hit = 0.09f),
        Spot(0f, 0.71f, Action.BATTERY, "Batería", hit = 0.10f),
        Spot(-0.20f, -0.17f, Action.MUSIC, "Hora", hit = 0.18f),
    )
    override val choices = listOf(SCREEN, WEIGHT, PLAYER, BOX, SECONDS, CORNERS, AMB)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val short = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        fun slot(id: Int, types: List<ComplicationType>, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, types, policy, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            slot(UNREAD, short, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_UNREAD_NOTIFICATION_COUNT, ComplicationType.SHORT_TEXT), RectF(0.58f, 0.09f, 0.72f, 0.165f)),
            slot(STEPS, short, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.17f, 0.72f, 0.42f, 0.80f)),
            slot(HEART, short, DefaultComplicationDataSourcePolicy(), RectF(0.62f, 0.72f, 0.80f, 0.80f)),
            // Estos dos se dibujan en el recuadro cuando no suena música (no se tocan ahí: el recuadro es del reproductor)
            slot(EVENT, listOf(ComplicationType.LONG_TEXT, ComplicationType.SHORT_TEXT), DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_NEXT_EVENT, ComplicationType.LONG_TEXT), RectF(0.20f, 0.555f, 0.40f, 0.595f)),
            slot(WEATHER, short, DefaultComplicationDataSourcePolicy(), RectF(0.60f, 0.555f, 0.80f, 0.595f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = ReflejoRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP) return
                // Los botones del mini reproductor (◄◄ ►‖ ►►) van primero
                if (renderer.playerTap(tapEvent.xPos, tapEvent.yPos)) return
                if (complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class ReflejoAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/**
 * Reflejo: como la pantalla de bajo consumo de los relojes con doble pantalla. Fecha con las
 * notificaciones, día de la semana, la hora grande con segundos, un mini reproductor de PulsoMusic o
 * PulsoMedia (o el próximo evento o el clima), pasos, ritmo y la batería en un anillo.
 */
class ReflejoRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<ReflejoAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = ReflejoAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.MITER; strokeCap = Paint.Cap.BUTT }
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    var lastBounds = Rect()
        private set

    private val redraw: () -> Unit = { invalidate() }
    @Volatile private var playerShown = false

    init {
        scope.launch {
            watchState.isAmbient.combine(watchState.isVisible) { ambient, visible -> ambient != true && visible == true }
                .collect { heart.update(it) }
        }
        PhoneNow.start(context, redraw)
    }

    override fun onDestroy() {
        PhoneNow.stop(context, redraw)
        heart.stop()
        scope.cancel()
        super.onDestroy()
    }

    private fun a(c: Int, alpha: Int) = Color.argb(alpha, Color.red(c), Color.green(c), Color.blue(c))

    private fun mix(c1: Int, c2: Int, f: Float) = Color.rgb(
        (Color.red(c1) + (Color.red(c2) - Color.red(c1)) * f).toInt(),
        (Color.green(c1) + (Color.green(c2) - Color.green(c1)) * f).toInt(),
        (Color.blue(c1) + (Color.blue(c2) - Color.blue(c1)) * f).toInt(),
    )

    /** Zona de cada botón del reproductor (◄◄, ►‖, ►►) */
    private fun button(cx: Float, cy: Float, r: Float, k: Int) = RectF(cx + (0.25f + k * 0.12f) * r, cy + 0.235f * r, cx + (0.37f + k * 0.12f) * r, cy + 0.365f * r)

    fun playerTap(x: Int, y: Int): Boolean {
        if (!playerShown || lastBounds.isEmpty) return false
        val r = min(lastBounds.width(), lastBounds.height()) / 2f
        val cx = lastBounds.exactCenterX()
        val cy = lastBounds.exactCenterY()
        val s = PhoneNow.current()
        for (k in 0..2) {
            if (button(cx, cy, r, k).contains(x.toFloat(), y.toFloat())) {
                PhoneNow.command(context, when (k) { 0 -> "prev"; 1 -> if (s?.playing == true) "pause" else "play"; else -> "next" })
                invalidate()
                return true
            }
        }
        return false
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ReflejoAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        val simple = ambient && Choices.value(context, AMB) == 1
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val is24 = DateFormat.is24HourFormat(context)
        Lcd.skew = 0f
        // En bajo consumo la pantalla se ve oscura (gasta menos) con la tinta gris
        val sc = SCREENS[Choices.index(context, SCREEN)].second
        val bg = if (ambient) Color.BLACK else sc.bg
        val ink = if (ambient) Color.rgb(170, 172, 168) else sc.ink
        val ghost = if (ambient) Color.rgb(22, 22, 22) else mix(sc.bg, sc.ink, 0.1f)

        canvas.drawColor(Color.BLACK)
        if (!ambient) {
            // Pantalla reflectiva: un poco más clara al centro
            fill.shader = RadialGradient(cx, cy, r, bg, mix(bg, Color.BLACK, 0.08f), Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, fill)
            fill.shader = null
        }

        // ===== Hora grande con segundos =====
        val thick = if (Choices.value(context, WEIGHT) == 0) 0.23f else 0.16f
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
        val m = "%02d".format(t.minute)
        val dw = r * 0.245f
        val dh = r * 0.42f
        val gap = r * 0.03f
        val top = Y(-0.38f)
        var x = X(-0.77f)
        seg(canvas, h[0], x, top, dw, dh, thick, ink, ghost); x += dw + gap
        seg(canvas, h[1], x, top, dw, dh, thick, ink, ghost); x += dw + gap
        fill.color = ink
        val d = dw * 0.13f
        canvas.drawRect(x + dw * 0.1f, top + dh * 0.3f - d, x + dw * 0.38f, top + dh * 0.3f + d, fill)
        canvas.drawRect(x + dw * 0.1f, top + dh * 0.7f - d, x + dw * 0.38f, top + dh * 0.7f + d, fill)
        x += dw * 0.5f + gap
        seg(canvas, m[0], x, top, dw, dh, thick, ink, ghost); x += dw + gap
        seg(canvas, m[1], x, top, dw, dh, thick, ink, ghost); x += dw + gap
        if (Choices.value(context, SECONDS) == 0 && !simple) {
            // Segundos arriba a la derecha (en bajo consumo quedan en 00 y vuelven a correr al encender)
            val s = if (ambient) "00" else "%02d".format(t.second)
            val sw = r * 0.09f
            val sh = r * 0.165f
            x += r * 0.02f - gap
            seg(canvas, s[0], x, top, sw, sh, 0.2f, ink, ghost); x += sw + r * 0.018f
            seg(canvas, s[1], x, top, sw, sh, 0.2f, ink, ghost)
        }
        if (!is24 && !simple) Lcd.text14(canvas, if (t.hour < 12) "AM" else "PM", X(0.50f), top + dh - r * 0.08f, r * 0.04f, r * 0.075f, r * 0.01f, ink, 0)
        if (simple) return

        // ===== Esquinas al borde =====
        if (Choices.value(context, CORNERS) == 0) {
            stroke.color = ink
            stroke.strokeWidth = r * 0.012f
            val s = r * 0.085f
            for ((ex, ey, sx, sy) in listOf(
                arrayOf(-0.86f, -0.40f, 1f, 1f), arrayOf(0.86f, -0.40f, -1f, 1f),
                arrayOf(-0.86f, 0.44f, 1f, -1f), arrayOf(0.86f, 0.44f, -1f, -1f),
            )) {
                path.reset()
                path.moveTo(X(ex) + sx * s, Y(ey))
                path.lineTo(X(ex), Y(ey))
                path.lineTo(X(ex), Y(ey) + sy * s)
                canvas.drawPath(path, stroke)
            }
        }

        // ===== Arriba: fecha y notificaciones =====
        var dx = digits(canvas, "%02d-%02d".format(t.dayOfMonth, t.monthValue), X(-0.30f), Y(-0.80f), r * 0.06f, r * 0.11f, r * 0.02f, ink, ghost)
        val unread = complications.textOf(UNREAD, context.resources)?.filter { it.isDigit() }
        if (unread != null) {
            drawBell(canvas, X(0.22f), Y(-0.74f), r * 0.045f, ink)
            digits(canvas, unread.ifEmpty { "0" }.takeLast(2), X(0.30f), Y(-0.80f), r * 0.06f, r * 0.11f, r * 0.02f, ink, ghost)
        }
        // Día de la semana en su cajita
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc).take(3)
        stroke.color = ink
        stroke.strokeWidth = r * 0.01f
        canvas.drawRect(X(-0.58f), Y(-0.56f), X(-0.36f), Y(-0.45f), stroke)
        Lcd.text14(canvas, dow, X(-0.555f), Y(-0.545f), r * 0.045f, r * 0.08f, r * 0.012f, ink, 0)

        // ===== Recuadro: mini reproductor, o el evento / el clima =====
        val music = PhoneNow.current()
        val pMode = Choices.value(context, PLAYER)
        val showPlayer = pMode == 1 || (pMode == 0 && music != null)
        playerShown = showPlayer && !ambient
        val box = RectF(X(-0.72f), Y(0.10f), X(0.72f), Y(0.38f))
        if (showPlayer) {
            stroke.color = ink
            stroke.strokeWidth = r * 0.01f
            canvas.drawRoundRect(box, r * 0.04f, r * 0.04f, stroke)
            drawNote(canvas, X(-0.58f), Y(0.17f), r * 0.03f, ink)
            val app = if (PhoneNow.state?.from == "cl.carlospnauto.app") "PULSOMEDIA" else "PULSOMUSIC"
            Lcd.text14(canvas, app, X(-0.50f), Y(0.135f), r * 0.03f, r * 0.055f, r * 0.008f, ink, 0)
            Lcd.text14(canvas, fit(music?.title ?: "SIN MUSICA", 15), X(-0.58f), Y(0.215f), r * 0.042f, r * 0.075f, r * 0.01f, ink, 0)
            // Avance
            fill.color = ghost
            canvas.drawRect(X(-0.58f), Y(0.325f), X(0.20f), Y(0.335f), fill)
            val p = if (music != null && music.durationMs > 0) (music.position().toFloat() / music.durationMs).coerceIn(0f, 1f) else 0f
            fill.color = ink
            if (p > 0f) canvas.drawRect(X(-0.58f), Y(0.322f), X(-0.58f) + r * 0.78f * p, Y(0.338f), fill)
            // Botones
            for (k in 0..2) {
                val b = button(cx, cy, r, k)
                val bx = b.centerX()
                val by = b.centerY()
                val q = r * 0.028f
                path.reset()
                when (k) {
                    0 -> { path.moveTo(bx + q * 0.2f, by - q); path.lineTo(bx - q * 1.1f, by); path.lineTo(bx + q * 0.2f, by + q); path.close(); canvas.drawRect(bx - q * 1.3f, by - q, bx - q * 1.05f, by + q, fill) }
                    1 -> if (music?.playing == true) {
                        canvas.drawRect(bx - q * 0.8f, by - q, bx - q * 0.25f, by + q, fill)
                        canvas.drawRect(bx + q * 0.25f, by - q, bx + q * 0.8f, by + q, fill)
                    } else { path.moveTo(bx - q * 0.6f, by - q * 1.1f); path.lineTo(bx + q * 1.0f, by); path.lineTo(bx - q * 0.6f, by + q * 1.1f); path.close() }
                    else -> { path.moveTo(bx - q * 0.2f, by - q); path.lineTo(bx + q * 1.1f, by); path.lineTo(bx - q * 0.2f, by + q); path.close(); canvas.drawRect(bx + q * 1.05f, by - q, bx + q * 1.3f, by + q, fill) }
                }
                canvas.drawPath(path, fill)
            }
        } else when (Choices.value(context, BOX)) {
            0 -> {
                stroke.color = ink
                stroke.strokeWidth = r * 0.01f
                canvas.drawRoundRect(box, r * 0.04f, r * 0.04f, stroke)
                drawCalendar(canvas, X(-0.58f), Y(0.17f), r * 0.028f, ink)
                val ev = complications.textOf(EVENT, context.resources)
                val title = complications.titleOf(EVENT, context.resources)
                Lcd.text14(canvas, if (ev == null) "AGENDA" else (title ?: "PROXIMO"), X(-0.50f), Y(0.135f), r * 0.03f, r * 0.055f, r * 0.008f, ink, 0)
                Lcd.text14(canvas, fit(ev ?: "SIN EVENTOS", 26), X(-0.62f), Y(0.235f), r * 0.042f, r * 0.075f, r * 0.01f, ink, 0)
            }
            1 -> {
                stroke.color = ink
                stroke.strokeWidth = r * 0.01f
                canvas.drawRoundRect(box, r * 0.04f, r * 0.04f, stroke)
                drawCloud(canvas, X(-0.42f), Y(0.24f), r * 0.06f, ink)
                val temp = complications.textOf(WEATHER, context.resources)?.filter { it.isDigit() || it == '-' }?.takeIf { it.isNotEmpty() } ?: "--"
                val tx = digits(canvas, temp.takeLast(3), X(-0.10f), Y(0.16f), r * 0.08f, r * 0.15f, r * 0.02f, ink, ghost)
                stroke.strokeWidth = r * 0.012f
                canvas.drawCircle(tx + r * 0.02f, Y(0.18f), r * 0.018f, stroke)
                Lcd.text14(canvas, "C", tx + r * 0.05f, Y(0.16f), r * 0.045f, r * 0.08f, 0f, ink, 0)
            }
            else -> {}
        }

        // ===== Pasos, ritmo y batería =====
        drawShoe(canvas, X(-0.60f), Y(0.53f), r * 0.035f, ink)
        val steps = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() } ?: "--"
        digits(canvas, steps.takeLast(5), X(-0.52f), Y(0.47f), r * 0.06f, r * 0.11f, r * 0.02f, ink, ghost)
        drawHeart(canvas, X(0.32f), Y(0.53f), r * 0.035f, ink)
        val hr = complications.textOf(HEART, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
            ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        digits(canvas, hr.takeLast(3), X(0.40f), Y(0.47f), r * 0.06f, r * 0.11f, r * 0.02f, ink, ghost)
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val ring = RectF(X(-0.09f), Y(0.62f), X(0.09f), Y(0.80f))
        stroke.strokeWidth = r * 0.018f
        stroke.color = ghost
        canvas.drawArc(ring, 0f, 360f, false, stroke)
        stroke.color = ink
        if (pct > 0) canvas.drawArc(ring, -90f, 360f * pct / 100f, false, stroke)
        val ps = if (pct >= 0) pct.coerceAtMost(99).toString() else "--"
        Lcd.text14(canvas, ps, X(0f) - Lcd.text14Width(ps, r * 0.035f, r * 0.008f) / 2, Y(0.685f), r * 0.035f, r * 0.05f, r * 0.008f, ink, 0)
    }

    /** Texto para la pantalla de segmentos: sin tildes, en mayúsculas y cortado a n letras */
    private fun fit(s: String, n: Int): String {
        val clean = java.text.Normalizer.normalize(s.uppercase(), java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")
            .filter { it.isLetterOrDigit() || it == ' ' || it == '-' }.trim()
        return if (clean.length > n) clean.take(n - 1).trimEnd() + "-" else clean
    }

    private val SEGS = mapOf(
        '0' to "abcdef", '1' to "bc", '2' to "abged", '3' to "abgcd", '4' to "fgbc", '5' to "afgcd",
        '6' to "afgedc", '7' to "abc", '8' to "abcdefg", '9' to "abcdfg", '-' to "g",
    )

    /** Número de 7 segmentos con puntas en diagonal; tk = grosor (proporción del ancho) */
    private fun seg(canvas: Canvas, ch: Char, x: Float, y: Float, w: Float, h: Float, tk: Float, on: Int, ghost: Int) {
        val t = w * tk
        val gp = t * 0.12f
        val m = y + h / 2
        val ht = t / 2
        val lit = SEGS[ch].orEmpty()
        fun poly(k: Char, vararg p: Float) {
            fill.color = if (k in lit) on else ghost
            path.reset()
            path.moveTo(p[0], p[1])
            var i = 2
            while (i < p.size) { path.lineTo(p[i], p[i + 1]); i += 2 }
            path.close()
            canvas.drawPath(path, fill)
        }
        val rr = x + w
        val b = y + h
        poly('a', x + gp, y, rr - gp, y, rr - t - gp, y + t, x + t + gp, y + t)
        poly('d', x + gp, b, rr - gp, b, rr - t - gp, b - t, x + t + gp, b - t)
        poly('f', x, y + gp, x + t, y + t + gp, x + t, m - ht - gp, x, m - gp)
        poly('b', rr, y + gp, rr - t, y + t + gp, rr - t, m - ht - gp, rr, m - gp)
        poly('e', x, m + gp, x + t, m + ht + gp, x + t, b - t - gp, x, b - gp)
        poly('c', rr, m + gp, rr - t, m + ht + gp, rr - t, b - t - gp, rr, b - gp)
        poly('g', x + gp, m, x + t + gp, m - ht, rr - t - gp, m - ht, rr - gp, m, rr - t - gp, m + ht, x + t + gp, m + ht)
    }

    /** Fila de números chicos (el «-» va angosto y sin fantasma); devuelve dónde termina */
    private fun digits(canvas: Canvas, s: String, x0: Float, top: Float, w: Float, h: Float, gap: Float, ink: Int, ghost: Int): Float {
        var x = x0
        for (c in s) {
            if (c == '-') {
                seg(canvas, '-', x, top, w * 0.7f, h, 0.17f, ink, Color.TRANSPARENT); x += w * 0.7f + gap
            } else {
                seg(canvas, c, x, top, w, h, 0.17f, ink, ghost); x += w + gap
            }
        }
        return x
    }

    private fun drawBell(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawArc(RectF(x - s, y - s * 1.1f, x + s, y + s * 0.9f), 180f, 180f, true, fill)
        canvas.drawRect(x - s, y - s * 0.1f, x + s, y + s * 0.55f, fill)
        path.reset()
        path.moveTo(x - s * 1.35f, y + s * 0.75f); path.lineTo(x + s * 1.35f, y + s * 0.75f); path.lineTo(x + s, y + s * 0.45f); path.lineTo(x - s, y + s * 0.45f); path.close()
        canvas.drawPath(path, fill)
        canvas.drawCircle(x, y + s * 1.05f, s * 0.28f, fill)
    }

    private fun drawNote(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawOval(RectF(x - s, y + s * 0.6f, x + s * 0.4f, y + s * 1.6f), fill)
        canvas.drawRect(x + s * 0.2f, y - s * 0.8f, x + s * 0.45f, y + s * 1.1f, fill)
        path.reset()
        path.moveTo(x + s * 0.2f, y - s * 0.8f); path.lineTo(x + s * 1.3f, y - s * 0.4f); path.lineTo(x + s * 1.3f, y); path.lineTo(x + s * 0.45f, y - s * 0.35f); path.close()
        canvas.drawPath(path, fill)
    }

    private fun drawCalendar(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        stroke.color = color
        stroke.strokeWidth = s * 0.22f
        canvas.drawRect(x - s, y - s * 0.8f, x + s, y + s, stroke)
        fill.color = color
        canvas.drawRect(x - s, y - s * 0.8f, x + s, y - s * 0.3f, fill)
    }

    private fun drawCloud(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawCircle(x - s * 0.5f, y + s * 0.15f, s * 0.55f, fill)
        canvas.drawCircle(x + s * 0.15f, y - s * 0.2f, s * 0.7f, fill)
        canvas.drawCircle(x + s * 0.75f, y + s * 0.2f, s * 0.5f, fill)
        canvas.drawRoundRect(RectF(x - s * 1.0f, y + s * 0.1f, x + s * 1.2f, y + s * 0.7f), s * 0.3f, s * 0.3f, fill)
    }

    private fun drawShoe(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x - s, y + s * 0.5f)
        path.lineTo(x - s * 0.9f, y - s * 0.5f)
        path.lineTo(x - s * 0.3f, y - s * 0.3f)
        path.lineTo(x + s * 0.4f, y + s * 0.05f)
        path.quadTo(x + s * 1.1f, y + s * 0.1f, x + s * 1.1f, y + s * 0.5f)
        path.close()
        canvas.drawPath(path, fill)
    }

    private fun drawHeart(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x, y + s * 0.95f)
        path.cubicTo(x - s * 1.5f, y - s * 0.05f, x - s * 0.85f, y - s * 1.25f, x, y - s * 0.45f)
        path.cubicTo(x + s * 0.85f, y - s * 1.25f, x + s * 1.5f, y - s * 0.05f, x, y + s * 0.95f)
        path.close()
        canvas.drawPath(path, fill)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ReflejoAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
