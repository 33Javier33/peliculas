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
        Spot(-0.32f, 0.06f, Action.MEDIA, "Toque en la hora", hit = 0.22f),
        Spot(0.18f, 0.06f, Action.MUSIC, "Toque en los minutos", hit = 0.18f),
        Spot(0.54f, -0.22f, Action.BATTERY, "Caja de batería", hit = 0.13f),
        Spot(0f, -0.47f, Action.ALARMS, "Caja de la fecha", hit = 0.18f),
    )
    override val choices = listOf(THEME, GLOW, SECONDS)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        val slots = listOf(
            ComplicationSlot.createRoundRectComplicationSlotBuilder(HEART, factory, types, DefaultComplicationDataSourcePolicy(), ComplicationSlotBounds(RectF(0.17f, 0.64f, 0.49f, 0.80f))).build(),
            ComplicationSlot.createRoundRectComplicationSlotBuilder(
                STEPS, factory, types,
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
                ComplicationSlotBounds(RectF(0.51f, 0.64f, 0.83f, 0.80f)),
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

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LcdTotalAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val th = THEMES[Choices.index(context, THEME)].second
        val on = if (ambient) Color.rgb(190, 196, 186) else th.ink
        val ghost = if (ambient) 0 else a(th.ink, 26)
        canvas.drawColor(Color.BLACK)

        if (!ambient) {
            // Toda la esfera es la pantalla, con la luz de fondo al centro
            fill.shader = RadialGradient(cx, cy, r, th.bg, th.edge, Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, fill)
            fill.shader = null
            val glow = Choices.value(context, GLOW)
            val boost = System.currentTimeMillis() < lightUntil
            if (Color.alpha(glow) > 0 || boost) {
                val g = if (Color.alpha(glow) > 0) glow else Color.rgb(255, 170, 70)
                fill.shader = RadialGradient(cx, cy - r * 0.05f, r * (if (boost) 0.95f else 0.7f), a(g, if (boost) 200 else 110), Color.TRANSPARENT, Shader.TileMode.CLAMP)
                canvas.drawCircle(cx, cy, r, fill)
                fill.shader = null
            }
            stroke.color = Color.BLACK
            stroke.strokeWidth = r * 0.03f
            canvas.drawCircle(cx, cy, r * 0.985f, stroke)
        }

        // Caja de la fecha: día y mes en puntos, año en segmentos
        val box = RectF(cx - r * 0.46f, cy - r * 0.64f, cx + r * 0.47f, cy - r * 0.33f)
        stroke.color = on
        stroke.strokeWidth = r * 0.012f
        canvas.drawRoundRect(box, r * 0.05f, r * 0.05f, stroke)
        if (!ambient) canvas.drawRoundRect(RectF(box.left + r * 0.02f, box.top + r * 0.02f, box.right - r * 0.02f, box.bottom - r * 0.02f), r * 0.035f, r * 0.035f, stroke)
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").take(3)
        val mon = t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").take(3)
        val line = "$dow $mon ${t.dayOfMonth}"
        val p = r * 0.014f
        Lcd.dots(canvas, line, cx - Lcd.dotsWidth(line, p) / 2, cy - r * 0.595f, p, on, ghost)
        Lcd.number(canvas, t.year.toString(), cx + r * 0.15f, cy - r * 0.46f, r * 0.05f, r * 0.095f, r * 0.02f, 4, on, ghost)

        // Hora grande y segundos
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        Lcd.number(canvas, "$h:%02d".format(t.minute), cx + r * 0.40f, cy - r * 0.10f, r * 0.17f, r * 0.33f, r * 0.05f, 4, on, ghost)
        val showSec = !ambient && Choices.value(context, SECONDS) == 0
        if (showSec) Lcd.number(canvas, "%02d".format(t.second), cx + r * 0.68f, cy + r * 0.03f, r * 0.10f, r * 0.20f, r * 0.025f, 2, on, ghost)

        if (ambient) {
            Brand.draw(canvas, cx, cy + r * 0.45f, r * 0.03f, Color.DKGRAY)
            return
        }

        // Indicadores a la izquierda de la fecha: ALM (alarma puesta), SIG (conexión) y 12/24 H
        text.textAlign = Paint.Align.RIGHT
        text.textSize = r * 0.05f
        text.color = if (Indicators.alarm(context)) on else ghost
        canvas.drawText("ALM", cx - r * 0.52f, cy - r * 0.52f, text)
        text.color = if (Indicators.online(context)) on else ghost
        canvas.drawText("SIG", cx - r * 0.52f, cy - r * 0.44f, text)
        text.color = on
        canvas.drawText(if (is24) "24H" else "12H", cx - r * 0.52f, cy - r * 0.36f, text)
        text.textAlign = Paint.Align.CENTER

        // A la derecha de la fecha: pila chica y un triángulo de puntos (decoración de la pantalla)
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        drawBattery(canvas, cx + r * 0.58f, cy - r * 0.54f, r * 0.05f, pct, on, ghost)
        fill.color = a(on, 120)
        for (row in 0 until 6) for (col in 0..row) {
            canvas.drawRect(cx + r * (0.64f - col * 0.025f), cy - r * (0.47f - row * 0.025f), cx + r * (0.64f - col * 0.025f) + r * 0.012f, cy - r * (0.47f - row * 0.025f) + r * 0.012f, fill)
        }

        // Fila: ALM · DST · PM y caja de batería
        text.textAlign = Paint.Align.LEFT
        text.textSize = r * 0.06f
        text.color = if (Indicators.alarm(context)) on else ghost
        canvas.drawText("ALM", cx - r * 0.62f, cy - r * 0.18f, text)
        text.color = if (Indicators.dst(t)) on else ghost
        canvas.drawText("DST", cx - r * 0.44f, cy - r * 0.18f, text)
        text.color = if (!is24 && t.hour >= 12) on else ghost
        canvas.drawText("PM", cx - r * 0.24f, cy - r * 0.18f, text)
        text.color = if (!is24 && t.hour < 12) on else ghost
        canvas.drawText("AM", cx - r * 0.10f, cy - r * 0.18f, text)
        text.textAlign = Paint.Align.CENTER
        val bb = RectF(cx + r * 0.38f, cy - r * 0.30f, cx + r * 0.72f, cy - r * 0.14f)
        stroke.color = on
        stroke.strokeWidth = r * 0.01f
        canvas.drawRoundRect(bb, r * 0.025f, r * 0.025f, stroke)
        Lcd.number(canvas, if (pct >= 0) pct.toString() else "", cx + r * 0.56f, cy - r * 0.275f, r * 0.045f, r * 0.10f, r * 0.012f, 3, on, ghost)
        text.textSize = r * 0.07f
        text.color = on
        canvas.drawText("%", cx + r * 0.60f, cy - r * 0.18f, text)
        drawBattery(canvas, cx + r * 0.67f, cy - r * 0.22f, r * 0.045f, pct, on, ghost)

        // Divisiones y bandas de puntos
        stroke.strokeWidth = r * 0.01f
        canvas.drawLine(cx - r * 0.68f, cy + r * 0.27f, cx + r * 0.68f, cy + r * 0.27f, stroke)
        canvas.drawLine(cx, cy + r * 0.27f, cx, cy + r * 0.62f, stroke)
        canvas.drawLine(cx - r * 0.38f, cy + r * 0.62f, cx + r * 0.38f, cy + r * 0.62f, stroke)
        fill.color = a(on, 140)
        for (k in 0 until 26) for (row in 0..1) {
            val y = cy + r * (0.31f + row * 0.022f)
            canvas.drawRect(cx - r * (0.62f - k * 0.022f), y, cx - r * (0.62f - k * 0.022f) + r * 0.011f, y + r * 0.011f, fill)
            canvas.drawRect(cx + r * (0.10f + k * 0.02f), y, cx + r * (0.10f + k * 0.02f) + r * 0.011f, y + r * 0.011f, fill)
        }

        // Ritmo cardíaco y pasos
        val hr = complications.textOf(HEART, context.resources)?.filter { it.isDigit() } ?: heart.bpm.takeIf { it > 0 }?.toString() ?: ""
        val steps = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() } ?: ""
        drawHeart(canvas, cx - r * 0.50f, cy + r * 0.44f, r * 0.05f, on)
        Lcd.number(canvas, hr, cx - r * 0.10f, cy + r * 0.37f, r * 0.07f, r * 0.13f, r * 0.02f, 3, on, ghost)
        drawShoe(canvas, cx + r * 0.08f, cy + r * 0.38f, r * 0.04f, on)
        Lcd.number(canvas, steps, cx + r * 0.60f, cy + r * 0.40f, r * 0.065f, r * 0.12f, r * 0.018f, 5, on, ghost)
        text.typeface = Typeface.create("sans-serif", Typeface.NORMAL)
        text.textSize = r * 0.065f
        text.color = on
        canvas.drawText("LPM", cx - r * 0.24f, cy + r * 0.59f, text)
        canvas.drawText("PASOS", cx + r * 0.33f, cy + r * 0.59f, text)
        text.typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)

        Brand.draw(canvas, cx, cy + r * 0.72f, r * 0.03f, a(on, 150))
    }

    private fun drawBattery(canvas: Canvas, x: Float, y: Float, s: Float, pct: Int, on: Int, ghost: Int) {
        stroke.color = on
        stroke.strokeWidth = s * 0.15f
        canvas.drawRoundRect(RectF(x - s, y - s * 0.5f, x + s * 0.8f, y + s * 0.5f), s * 0.15f, s * 0.15f, stroke)
        fill.color = on
        canvas.drawRect(x + s * 0.8f, y - s * 0.2f, x + s, y + s * 0.2f, fill)
        for (k in 0 until 3) {
            fill.color = if (pct >= 0 && pct > k * 33) on else ghost
            canvas.drawRect(x - s * 0.8f + k * s * 0.52f, y - s * 0.3f, x - s * 0.8f + k * s * 0.52f + s * 0.42f, y + s * 0.3f, fill)
        }
    }

    private fun drawHeart(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        path.reset()
        path.moveTo(x, y + s * 0.9f)
        path.cubicTo(x - s * 1.6f, y - s * 0.1f, x - s * 0.8f, y - s * 1.3f, x, y - s * 0.45f)
        path.cubicTo(x + s * 0.8f, y - s * 1.3f, x + s * 1.6f, y - s * 0.1f, x, y + s * 0.9f)
        path.close()
        fill.color = color
        canvas.drawPath(path, fill)
    }

    private fun drawShoe(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x - s * 1.1f, y + s * 0.35f)
        path.lineTo(x - s * 0.9f, y - s * 0.25f)
        path.lineTo(x - s * 0.2f, y - s * 0.6f)
        path.lineTo(x + s * 0.1f, y - s * 0.1f)
        path.lineTo(x + s * 1.0f, y + s * 0.1f)
        path.lineTo(x + s * 1.1f, y + s * 0.5f)
        path.lineTo(x - s * 1.1f, y + s * 0.5f)
        path.close()
        canvas.drawPath(path, fill)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LcdTotalAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
