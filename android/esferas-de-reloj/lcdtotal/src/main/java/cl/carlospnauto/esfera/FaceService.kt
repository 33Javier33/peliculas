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
import android.graphics.Typeface
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
import cl.carlospnauto.esfera.comun.Brand
import cl.carlospnauto.esfera.comun.Choice
import cl.carlospnauto.esfera.comun.Choices
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.HeartRate
import cl.carlospnauto.esfera.comun.Indicators
import cl.carlospnauto.esfera.comun.Lcd
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Spot
import cl.carlospnauto.esfera.comun.textOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.time.ZonedDateTime
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.hypot
import kotlin.math.min

private const val HEART = 101
private const val STEPS = 102

/** Tema de la pantalla: fondo y segmentos */
private data class Theme(val bg: Int, val edge: Int, val ink: Int)

private val THEMES = listOf(
    "Gris verdoso" to Theme(Color.rgb(156, 168, 148), Color.rgb(120, 132, 114), Color.rgb(22, 24, 18)),
    "Ámbar" to Theme(Color.rgb(214, 180, 110), Color.rgb(170, 136, 70), Color.rgb(40, 24, 6)),
    "Azul hielo" to Theme(Color.rgb(160, 196, 214), Color.rgb(116, 152, 172), Color.rgb(8, 24, 36)),
    "Verde" to Theme(Color.rgb(150, 190, 140), Color.rgb(104, 146, 96), Color.rgb(10, 30, 12)),
    "Arena" to Theme(Color.rgb(206, 196, 176), Color.rgb(160, 150, 130), Color.rgb(30, 26, 18)),
    "Rosa" to Theme(Color.rgb(222, 180, 196), Color.rgb(178, 136, 152), Color.rgb(40, 12, 24)),
    "Negativo verde" to Theme(Color.rgb(12, 18, 12), Color.rgb(4, 6, 4), Color.rgb(140, 230, 140)),
    "Negativo ámbar" to Theme(Color.rgb(16, 12, 6), Color.rgb(4, 3, 2), Color.rgb(255, 180, 60)),
)
private val THEME = Choice("tema", "Pantalla", THEMES.map { it.first to (if (Color.red(it.second.bg) < 40) it.second.ink else it.second.bg) })
private val GLOW = Choice(
    "luz", "Luz de fondo",
    listOf(
        "Naranja" to Color.rgb(255, 170, 70), "Verde" to Color.rgb(120, 255, 140), "Azul" to Color.rgb(100, 190, 255),
        "Blanco" to Color.rgb(255, 255, 230), "Apagada" to Color.TRANSPARENT,
    ),
)
private val SECONDS = Choice("segundos", "Segundos", listOf("Visibles" to 0, "Ocultos" to 1))

object Config : FaceConfig {
    override val slots = listOf(HEART to "Ritmo cardíaco", STEPS to "Pasos")
    override val spots = listOf(
        Spot(-0.40f, 0.05f, Action.MEDIA, "Toque en la hora", hit = 0.24f),
        Spot(0.15f, 0.05f, Action.MUSIC, "Toque en los minutos", hit = 0.22f),
        Spot(0.64f, -0.22f, Action.BATTERY, "Caja de batería", hit = 0.13f),
        Spot(0f, -0.56f, Action.ALARMS, "Caja de la fecha", hit = 0.22f),
    )
    override val choices = listOf(THEME, GLOW, SECONDS)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        val slots = listOf(
            ComplicationSlot.createRoundRectComplicationSlotBuilder(HEART, factory, types, DefaultComplicationDataSourcePolicy(), ComplicationSlotBounds(RectF(0.15f, 0.70f, 0.48f, 0.875f))).build(),
            ComplicationSlot.createRoundRectComplicationSlotBuilder(
                STEPS, factory, types,
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
                ComplicationSlotBounds(RectF(0.52f, 0.70f, 0.88f, 0.875f)),
            ).build(),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = LcdTotalRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i]) else renderer.light()
            }
        })
    }
}

class LcdTotalAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Toda la esfera es una pantalla de cristal líquido con luz de fondo (tocar fuera de los accesos la enciende más) */
class LcdTotalRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<LcdTotalAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = LcdTotalAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var lightUntil = 0L
    var lastBounds = Rect()
        private set

    init {
        scope.launch {
            watchState.isAmbient.combine(watchState.isVisible) { ambient, visible -> ambient != true && visible == true }
                .collect { heart.update(it) }
        }
    }

    override fun onDestroy() {
        heart.stop()
        scope.cancel()
        super.onDestroy()
    }

    fun light() {
        lightUntil = System.currentTimeMillis() + 3000
        invalidate()
    }

    private fun a(c: Int, alpha: Int) = Color.argb(alpha, Color.red(c), Color.green(c), Color.blue(c))

    /** Dibujo de pixeles: cada fila es un texto con «#» donde va un pixel */
    private fun pixels(canvas: Canvas, rows: List<String>, x: Float, y: Float, px: Float, color: Int) {
        fill.color = color
        for ((j, row) in rows.withIndex()) for ((i, ch) in row.withIndex()) {
            if (ch == '#') canvas.drawRect(x + i * px, y + j * px, x + (i + 0.9f) * px, y + (j + 0.9f) * px, fill)
        }
    }

    private val HEART_PX = listOf(
        ".###...###.",
        "#####.#####",
        "###########",
        "#####.#####",
        "####.#.####",
        ".#.##.#.##.",
        "..#####.#..",
        "...#####...",
        "....###....",
        ".....#.....",
    )
    private val SHOE_PX = listOf(
        "..###......",
        ".#####.....",
        "#######....",
        "#########..",
        "###########",
        ".##########",
    )

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LcdTotalAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        Lcd.skew = 0f
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val th = THEMES[Choices.index(context, THEME)].second
        val on = if (ambient) Color.rgb(190, 196, 186) else th.ink
        val ghost = if (ambient) 0 else a(th.ink, 14)
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        canvas.drawColor(Color.BLACK)

        if (!ambient) {
            // Toda la esfera es la pantalla: algo más oscura en el borde, luz cálida al centro
            fill.shader = RadialGradient(cx, cy, r, th.bg, th.edge, Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, fill)
            fill.shader = null
            val glow = Choices.value(context, GLOW)
            val boost = System.currentTimeMillis() < lightUntil
            if (Color.alpha(glow) > 0 || boost) {
                val g = if (Color.alpha(glow) > 0) glow else Color.rgb(255, 170, 70)
                fill.shader = RadialGradient(X(0f), Y(0.02f), r * (if (boost) 0.95f else 0.62f), a(g, if (boost) 200 else 125), Color.TRANSPARENT, Shader.TileMode.CLAMP)
                canvas.drawCircle(cx, cy, r, fill)
                fill.shader = RadialGradient(X(0f), Y(-0.55f), r * 0.38f, a(g, if (boost) 160 else 90), Color.TRANSPARENT, Shader.TileMode.CLAMP)
                canvas.drawCircle(cx, cy, r, fill)
                fill.shader = null
            }
            // Borde negro grueso de la pantalla
            stroke.color = Color.BLACK
            stroke.strokeWidth = r * 0.03f
            canvas.drawCircle(cx, cy, r * 0.985f, stroke)
        }

        // Caja de la fecha (doble borde): «SÁB JUN 10» en 14 segmentos y el año abajo
        stroke.color = on
        stroke.strokeWidth = r * 0.012f
        canvas.drawRoundRect(RectF(X(-0.59f), Y(-0.78f), X(0.58f), Y(-0.35f)), r * 0.08f, r * 0.08f, stroke)
        stroke.strokeWidth = r * 0.009f
        canvas.drawRoundRect(RectF(X(-0.56f), Y(-0.75f), X(0.55f), Y(-0.38f)), r * 0.055f, r * 0.055f, stroke)
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").take(3)
        val mon = t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").take(3)
        val date = "$dow $mon ${t.dayOfMonth}"
        val lw = r * 0.085f
        val lg = r * 0.022f
        Lcd.text14(canvas, date, cx - Lcd.text14Width(date, lw, lg) / 2, Y(-0.71f), lw, r * 0.14f, lg, on, ghost)
        Lcd.number(canvas, t.year.toString(), X(0.18f), Y(-0.53f), r * 0.065f, r * 0.11f, r * 0.025f, 4, on, ghost)

        // Hora grande (rectos, como en la foto) y segundos
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
        val m = "%02d".format(t.minute)
        val dw = r * 0.215f
        val dh = r * 0.41f
        val top = Y(-0.16f)
        Lcd.digit(canvas, h[0], X(-0.62f), top, dw, dh, on, ghost)
        Lcd.digit(canvas, h[1], X(-0.385f), top, dw, dh, on, ghost)
        Lcd.digit(canvas, m[0], X(-0.045f), top, dw, dh, on, ghost)
        Lcd.digit(canvas, m[1], X(0.195f), top, dw, dh, on, ghost)
        fill.color = on
        val cs = r * 0.06f
        canvas.drawRoundRect(RectF(X(-0.135f), Y(-0.07f), X(-0.135f) + cs, Y(-0.07f) + cs), r * 0.012f, r * 0.012f, fill)
        canvas.drawRoundRect(RectF(X(-0.135f), Y(0.09f), X(-0.135f) + cs, Y(0.09f) + cs), r * 0.012f, r * 0.012f, fill)
        val showSec = !ambient && Choices.value(context, SECONDS) == 0
        if (showSec) {
            val s2 = "%02d".format(t.second)
            Lcd.digit(canvas, s2[0], X(0.48f), Y(0.01f), r * 0.13f, r * 0.24f, on, ghost)
            Lcd.digit(canvas, s2[1], X(0.635f), Y(0.01f), r * 0.13f, r * 0.24f, on, ghost)
        }

        if (ambient) {
            Brand.draw(canvas, cx, Y(0.45f), r * 0.03f, Color.DKGRAY)
            return
        }

        // Indicadores en puntos: ALM (alarma puesta), SIG (conexión), reloj + 24H
        val p = r * 0.0095f
        fun dotsRight(s: String, right: Float, y: Float, lit: Boolean) = Lcd.dots(canvas, s, right - Lcd.dotsWidth(s, p), y, p, if (lit) on else ghost, 0)
        dotsRight("ALM", X(-0.63f), Y(-0.565f), Indicators.alarm(context))
        dotsRight("SIG", X(-0.63f), Y(-0.49f), Indicators.online(context))
        dotsRight("24H", X(-0.63f), Y(-0.415f), is24)
        stroke.color = on
        stroke.strokeWidth = r * 0.008f
        val clx = X(-0.63f) - Lcd.dotsWidth("24H", p) - r * 0.06f
        canvas.drawCircle(clx, Y(-0.383f), r * 0.03f, stroke)
        canvas.drawLine(clx, Y(-0.383f), clx, Y(-0.405f), stroke)
        canvas.drawLine(clx, Y(-0.383f), clx + r * 0.016f, Y(-0.375f), stroke)

        // Arriba a la derecha: pila chica y triángulo de puntos
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        smallBattery(canvas, X(0.63f), Y(-0.565f), r * 0.08f, r * 0.04f, pct, on, ghost)
        fill.color = on
        for (row in 0 until 8) {
            val count = 4 + row
            for (k in 0 until count) {
                val x = X(0.81f) - (k + 1) * r * 0.019f
                val y = Y(-0.50f) + row * r * 0.0185f
                canvas.drawRect(x, y, x + r * 0.012f, y + r * 0.012f, fill)
            }
        }

        // Fila: ALM · A/M · pila · PM 53
        dotsRight("ALM", X(-0.64f), Y(-0.30f), Indicators.alarm(context))
        dotsRight("A/M", X(-0.44f), Y(-0.30f), !is24)
        smallBattery(canvas, X(-0.38f), Y(-0.295f), r * 0.14f, r * 0.06f, pct, on, ghost)
        text.typeface = Typeface.create("sans-serif", Typeface.NORMAL)
        text.textAlign = Paint.Align.LEFT
        text.textSize = r * 0.07f
        text.color = if (!is24 && t.hour >= 12) on else if (!is24) on else ghost
        canvas.drawText(if (t.hour < 12) "AM" else "PM", X(-0.16f), Y(-0.205f), text)
        Lcd.number(canvas, "%02d".format(t.second), X(0.165f), Y(-0.31f), r * 0.065f, r * 0.115f, r * 0.02f, 2, on, ghost)

        // Caja de batería con forma de pila (punta a la derecha): «85%» y pila vertical
        stroke.color = on
        stroke.strokeWidth = r * 0.011f
        canvas.drawRoundRect(RectF(X(0.47f), Y(-0.31f), X(0.81f), Y(-0.13f)), r * 0.025f, r * 0.025f, stroke)
        fill.color = on
        canvas.drawRoundRect(RectF(X(0.82f), Y(-0.26f), X(0.84f), Y(-0.18f)), r * 0.006f, r * 0.006f, fill)
        Lcd.number(canvas, if (pct >= 0) pct.toString() else "", X(0.635f), Y(-0.27f), r * 0.05f, r * 0.09f, r * 0.015f, 2, on, ghost)
        text.typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
        text.textSize = r * 0.08f
        text.color = on
        canvas.drawText("%", X(0.64f), Y(-0.18f), text)
        // Pila vertical
        stroke.strokeWidth = r * 0.008f
        val bl = X(0.735f)
        canvas.drawRoundRect(RectF(bl, Y(-0.265f), bl + r * 0.04f, Y(-0.175f)), r * 0.006f, r * 0.006f, stroke)
        canvas.drawRect(bl + r * 0.012f, Y(-0.28f), bl + r * 0.028f, Y(-0.265f), fill)
        if (pct >= 0) {
            val hh = (r * 0.074f) * pct / 100f
            canvas.drawRect(bl + r * 0.008f, Y(-0.183f) - hh, bl + r * 0.032f, Y(-0.183f), fill)
        }

        // Líneas que dividen
        stroke.strokeWidth = r * 0.008f
        canvas.drawLine(X(-0.85f), Y(0.30f), X(0.85f), Y(0.30f), stroke)
        canvas.drawLine(cx, Y(0.30f), cx, Y(0.78f), stroke)
        canvas.drawLine(X(-0.48f), Y(0.78f), X(0.48f), Y(0.78f), stroke)

        // Bandas de puntos
        fill.color = on
        for (row in 0 until 3) {
            val y = Y(0.325f) + row * r * 0.018f
            var x = X(-0.78f)
            while (x < X(-0.07f)) { canvas.drawRect(x, y, x + r * 0.011f, y + r * 0.011f, fill); x += r * 0.018f }
            x = X(0.18f)
            while (x < X(0.77f)) { canvas.drawRect(x, y, x + r * 0.011f, y + r * 0.011f, fill); x += r * 0.018f }
        }

        // Corazón y zapatilla de pixeles, ritmo y pasos
        pixels(canvas, HEART_PX, X(-0.66f), Y(0.455f), r * 0.012f, on)
        pixels(canvas, SHOE_PX, X(0.06f), Y(0.335f), r * 0.009f, on)
        val hr = complications.textOf(HEART, context.resources)?.filter { it.isDigit() } ?: heart.bpm.takeIf { it > 0 }?.toString() ?: ""
        val steps = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() } ?: ""
        Lcd.number(canvas, hr, X(-0.19f), Y(0.44f), r * 0.085f, r * 0.155f, r * 0.02f, 3, on, ghost)
        Lcd.number(canvas, steps, X(0.62f), Y(0.44f), r * 0.075f, r * 0.155f, r * 0.017f, 5, on, ghost)
        text.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        text.textAlign = Paint.Align.CENTER
        text.textSize = r * 0.10f
        text.color = on
        canvas.drawText("LPM", X(-0.31f), Y(0.72f), text)
        canvas.drawText("PASOS", X(0.33f), Y(0.72f), text)
        text.typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)

        Brand.draw(canvas, cx, Y(0.87f), r * 0.03f, a(on, 140))
    }

    /** Pila horizontal con punta a la derecha y 2 barras de nivel */
    private fun smallBattery(canvas: Canvas, x: Float, y: Float, w: Float, h: Float, pct: Int, on: Int, ghost: Int) {
        stroke.color = on
        stroke.strokeWidth = h * 0.16f
        canvas.drawRoundRect(RectF(x, y, x + w, y + h), h * 0.15f, h * 0.15f, stroke)
        fill.color = on
        canvas.drawRect(x + w, y + h * 0.3f, x + w + h * 0.18f, y + h * 0.7f, fill)
        val n = 3
        val bw = (w - h * 0.5f) / n
        for (k in 0 until n) {
            fill.color = if (pct >= 0 && pct > k * 33) on else ghost
            canvas.drawRect(x + h * 0.25f + k * bw, y + h * 0.25f, x + h * 0.25f + (k + 0.8f) * bw, y + h * 0.75f, fill)
        }
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LcdTotalAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
