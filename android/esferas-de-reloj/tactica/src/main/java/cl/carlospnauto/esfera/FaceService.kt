package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
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
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Smooth
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
import kotlin.math.min

private const val HEART = 101
private const val STEPS = 102

/** Tema: acento (hora, fecha), secundario (minutos, rótulos), líneas y paneles */
private data class Theme(val accent: Int, val second: Int, val line: Int, val panel: Int)

private val THEMES = listOf(
    "Caqui" to Theme(Color.rgb(214, 190, 120), Color.rgb(136, 146, 118), Color.rgb(78, 86, 68), Color.rgb(30, 32, 28)),
    "Desierto" to Theme(Color.rgb(232, 180, 110), Color.rgb(170, 140, 100), Color.rgb(96, 80, 60), Color.rgb(34, 30, 26)),
    "Ártico" to Theme(Color.rgb(150, 220, 240), Color.rgb(120, 150, 165), Color.rgb(60, 80, 90), Color.rgb(22, 28, 32)),
    "Rojo" to Theme(Color.rgb(240, 90, 80), Color.rgb(150, 120, 118), Color.rgb(90, 60, 58), Color.rgb(32, 24, 24)),
    "Verde" to Theme(Color.rgb(140, 230, 120), Color.rgb(110, 150, 110), Color.rgb(60, 90, 60), Color.rgb(22, 30, 22)),
    "Blanco" to Theme(Color.rgb(240, 240, 240), Color.rgb(150, 150, 150), Color.rgb(80, 80, 80), Color.rgb(28, 28, 28)),
    "Naranja" to Theme(Color.rgb(255, 150, 50), Color.rgb(150, 130, 110), Color.rgb(90, 70, 50), Color.rgb(30, 26, 22)),
)
private val THEME = Choice("tema", "Tema", THEMES.map { it.first to it.second.accent })
private val COLON = Choice("puntos", "Dos puntos", listOf("Parpadean" to 0, "Fijos" to 1))
private val SECONDS = Choice("segundos", "Segundos", listOf("Visibles" to 0, "Ocultos" to 1))

object Config : FaceConfig {
    override val slots = listOf(HEART to "Ritmo cardíaco", STEPS to "Pasos")
    override val spots = listOf(
        Spot(-0.42f, 0f, Action.MEDIA, "Toque en la hora", hit = 0.22f),
        Spot(0.18f, 0f, Action.MUSIC, "Toque en los minutos", hit = 0.20f),
        Spot(0.735f, -0.03f, Action.BATTERY, "Panel de batería", hit = 0.14f),
        Spot(0f, -0.52f, Action.ALARMS, "Caja de la fecha", hit = 0.18f),
    )
    override val choices = listOf(THEME, COLON, SECONDS, Smooth.CHOICE)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        val slots = listOf(
            ComplicationSlot.createRoundRectComplicationSlotBuilder(HEART, factory, types, DefaultComplicationDataSourcePolicy(), ComplicationSlotBounds(RectF(0.275f, 0.65f, 0.485f, 0.78f))).build(),
            ComplicationSlot.createRoundRectComplicationSlotBuilder(
                STEPS, factory, types,
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
                ComplicationSlotBounds(RectF(0.515f, 0.65f, 0.725f, 0.78f)),
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
        val renderer = TacticRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class TacticAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Esfera táctica: anillos, rejilla, caja de fecha, hora en panel, batería en columna y cajas de ritmo y pasos */
class TacticRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<TacticAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = TacticAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
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

    private fun oval(cx: Float, cy: Float, rad: Float) = RectF(cx - rad, cy - rad, cx + rad, cy + rad)

    /** Recuadro con esquinas cortadas (estilo táctico) */
    private fun chamfer(l: Float, t: Float, r: Float, b: Float, c: Float) {
        path.reset()
        path.moveTo(l + c, t)
        path.lineTo(r - c, t)
        path.lineTo(r, t + c)
        path.lineTo(r, b - c)
        path.lineTo(r - c, b)
        path.lineTo(l + c, b)
        path.lineTo(l, b - c)
        path.lineTo(l, t + c)
        path.close()
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: TacticAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        interactiveDrawModeUpdateDelayMillis = Smooth.delay(context)
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val th = THEMES[Choices.index(context, THEME)].second
        val accent = if (ambient) Color.rgb(170, 170, 160) else th.accent
        val second = if (ambient) Color.rgb(110, 110, 104) else th.second
        val line = if (ambient) Color.rgb(60, 60, 56) else th.line
        canvas.drawColor(Color.BLACK)

        // Anillos del borde
        stroke.strokeCap = Paint.Cap.BUTT
        stroke.color = line
        stroke.strokeWidth = r * 0.022f
        canvas.drawCircle(cx, cy, r * 0.94f, stroke)
        stroke.strokeWidth = r * 0.008f
        canvas.drawCircle(cx, cy, r * 0.885f, stroke)
        if (!ambient) {
            stroke.strokeWidth = r * 0.03f
            for ((a0, sw) in listOf(-60f to 50f, 10f to 50f, 130f to 40f, 190f to 40f)) canvas.drawArc(oval(cx, cy, r * 0.85f), a0 - 90f, sw, false, stroke)
            // Segundos: columna de segmentos a la izquierda (se llena en el minuto)
            val n = 12
            val f = Smooth.seconds(context, t) / 60f * n
            for (i in 0 until n) {
                val start = 200f + i * (140f / n)
                stroke.color = if (i < f.toInt()) accent else line
                canvas.drawArc(oval(cx, cy, r * 0.82f), start - 90f + 1.5f, 140f / n - 3f, false, stroke)
                if (i == f.toInt()) {
                    stroke.color = accent
                    canvas.drawArc(oval(cx, cy, r * 0.82f), start - 90f + 1.5f, (140f / n - 3f) * (f - f.toInt()), false, stroke)
                }
            }
            // Batería: arco a la derecha
            val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            stroke.color = line
            stroke.strokeWidth = r * 0.016f
            canvas.drawArc(oval(cx, cy, r * 0.82f), 25f - 90f, 35f, false, stroke)
            if (pct >= 0) {
                stroke.color = accent
                canvas.drawArc(oval(cx, cy, r * 0.82f), 25f - 90f, 35f * pct / 100f, false, stroke)
            }

            // Rejilla detrás de la fecha
            stroke.color = Color.argb(70, Color.red(line), Color.green(line), Color.blue(line))
            stroke.strokeWidth = r * 0.004f
            var gx = -0.44f
            while (gx <= 0.45f) { canvas.drawLine(cx + gx * r, cy - r * 0.80f, cx + gx * r, cy - r * 0.40f, stroke); gx += 0.045f }
            var gy = -0.80f
            while (gy <= -0.40f) { canvas.drawLine(cx - r * 0.44f, cy + gy * r, cx + r * 0.45f, cy + gy * r, stroke); gy += 0.045f }
        }

        // Caja de la fecha
        chamfer(cx - r * 0.45f, cy - r * 0.63f, cx + r * 0.46f, cy - r * 0.41f, r * 0.04f)
        fill.color = if (ambient) Color.BLACK else th.panel
        canvas.drawPath(path, fill)
        stroke.color = second
        stroke.strokeWidth = r * 0.012f
        canvas.drawPath(path, stroke)
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        val mon = t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        text.textSize = r * 0.14f
        val w1 = text.measureText("$dow ")
        val w2 = text.measureText("$mon ")
        val w3 = text.measureText(t.dayOfMonth.toString())
        var x = cx - (w1 + w2 + w3) / 2
        text.textAlign = Paint.Align.LEFT
        text.color = accent
        canvas.drawText("$dow ", x, cy - r * 0.47f, text)
        x += w1
        text.color = second
        canvas.drawText("$mon ", x, cy - r * 0.47f, text)
        x += w2
        text.color = accent
        canvas.drawText(t.dayOfMonth.toString(), x, cy - r * 0.47f, text)
        text.textAlign = Paint.Align.CENTER

        // Fila de indicadores: ALM · SIG · barra · DST
        if (!ambient) {
            val dim = Color.argb(90, Color.red(second), Color.green(second), Color.blue(second))
            text.textSize = r * 0.06f
            text.color = if (Indicators.alarm(context)) accent else dim
            canvas.drawText("ALM", cx - r * 0.50f, cy - r * 0.30f, text)
            text.color = if (Indicators.online(context)) accent else dim
            canvas.drawText("SIG", cx - r * 0.32f, cy - r * 0.30f, text)
            text.color = if (Indicators.dst(t)) accent else dim
            canvas.drawText("DST", cx + r * 0.42f, cy - r * 0.30f, text)
            // Barra inclinada: avance del día
            val day = (t.hour * 60 + t.minute) / 1440f
            path.reset()
            path.moveTo(cx - r * 0.14f, cy - r * 0.31f); path.lineTo(cx + r * 0.26f, cy - r * 0.31f)
            path.lineTo(cx + r * 0.23f, cy - r * 0.35f); path.lineTo(cx - r * 0.11f, cy - r * 0.35f); path.close()
            stroke.color = line
            stroke.strokeWidth = r * 0.008f
            canvas.drawPath(path, stroke)
            fill.color = second
            canvas.drawRect(cx - r * 0.11f, cy - r * 0.345f, cx - r * 0.11f + r * 0.34f * day, cy - r * 0.315f, fill)
        }

        // Panel de la hora
        if (!ambient) {
            path.reset()
            path.moveTo(cx - r * 0.72f, cy - r * 0.24f)
            path.lineTo(cx + r * 0.63f, cy - r * 0.24f)
            path.lineTo(cx + r * 0.63f, cy + r * 0.22f)
            path.lineTo(cx - r * 0.68f, cy + r * 0.22f)
            path.close()
            fill.color = th.panel
            canvas.drawPath(path, fill)
            fill.color = line
            canvas.drawRect(cx - r * 0.72f, cy - r * 0.27f, cx + r * 0.63f, cy - r * 0.24f, fill)
            // Rayas inclinadas abajo
            for (k in 0 until 6) {
                fill.color = if (k >= 3) accent else line
                val x0 = cx + r * (0.0f + k * 0.07f)
                path.reset()
                path.moveTo(x0, cy + r * 0.29f); path.lineTo(x0 + r * 0.04f, cy + r * 0.24f)
                path.lineTo(x0 + r * 0.065f, cy + r * 0.24f); path.lineTo(x0 + r * 0.025f, cy + r * 0.29f); path.close()
                canvas.drawPath(path, fill)
            }
        }
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        text.textScaleX = 0.9f
        text.textSize = r * 0.46f
        text.textAlign = Paint.Align.RIGHT
        text.color = accent
        canvas.drawText(h, cx - r * 0.15f, cy + r * 0.15f, text)
        text.textAlign = Paint.Align.LEFT
        text.color = second
        canvas.drawText("%02d".format(t.minute), cx - r * 0.06f, cy + r * 0.15f, text)
        text.textScaleX = 1f
        text.textAlign = Paint.Align.CENTER
        // Dos puntos: el de arriba brilla (y parpadea si se eligió)
        val blinkOff = Choices.value(context, COLON) == 0 && t.second % 2 == 1 && !ambient
        fill.color = if (blinkOff) second else accent
        if (!ambient && !blinkOff) fill.setShadowLayer(r * 0.03f, 0f, 0f, accent)
        canvas.drawRoundRect(RectF(cx - r * 0.135f, cy - r * 0.07f, cx - r * 0.085f, cy - r * 0.02f), r * 0.008f, r * 0.008f, fill)
        fill.clearShadowLayer()
        fill.color = second
        canvas.drawRoundRect(RectF(cx - r * 0.135f, cy + r * 0.04f, cx - r * 0.085f, cy + r * 0.09f), r * 0.008f, r * 0.008f, fill)

        if (ambient) {
            Brand.draw(canvas, cx, cy + r * 0.45f, r * 0.03f, Color.DKGRAY)
            return
        }

        // Segundos y AM/PM
        if (Choices.value(context, SECONDS) == 0) {
            text.textSize = r * 0.12f
            text.color = accent
            canvas.drawText("%02d".format(t.second), cx + r * 0.53f, cy - r * 0.08f, text)
        }
        if (!is24) {
            val pm = RectF(cx + r * 0.45f, cy + r * 0.04f, cx + r * 0.61f, cy + r * 0.14f)
            fill.color = accent
            canvas.drawRoundRect(pm, r * 0.02f, r * 0.02f, fill)
            text.textSize = r * 0.07f
            text.color = th.panel
            canvas.drawText(if (t.hour < 12) "AM" else "PM", pm.centerX(), pm.bottom - r * 0.025f, text)
        }

        // Panel de batería (columna)
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        chamfer(cx + r * 0.65f, cy - r * 0.27f, cx + r * 0.82f, cy + r * 0.22f, r * 0.03f)
        fill.color = th.panel
        canvas.drawPath(path, fill)
        stroke.color = line
        stroke.strokeWidth = r * 0.01f
        canvas.drawPath(path, stroke)
        val bx = cx + r * 0.735f
        stroke.color = second
        stroke.strokeWidth = r * 0.008f
        canvas.drawRoundRect(RectF(bx - r * 0.045f, cy - r * 0.22f, bx + r * 0.045f, cy + r * 0.0f), r * 0.01f, r * 0.01f, stroke)
        fill.color = second
        canvas.drawRect(bx - r * 0.018f, cy - r * 0.235f, bx + r * 0.018f, cy - r * 0.22f, fill)
        for (k in 0 until 8) {
            fill.color = if (pct >= 0 && pct >= (k + 1) * 12.5f - 6) accent else Color.argb(50, Color.red(second), Color.green(second), Color.blue(second))
            val yb = cy - r * 0.012f - k * r * 0.025f
            canvas.drawRect(bx - r * 0.032f, yb - r * 0.016f, bx + r * 0.032f, yb, fill)
        }
        text.textSize = r * 0.085f
        text.color = accent
        canvas.drawText(if (pct >= 0) "$pct%" else "--", bx, cy + r * 0.10f, text)
        text.textSize = r * 0.055f
        text.color = second
        canvas.drawText("BAT", bx, cy + r * 0.17f, text)

        // Cajas de ritmo y pasos
        val hr = complications.textOf(HEART, context.resources) ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        val steps = complications.textOf(STEPS, context.resources) ?: "--"
        for ((l, rr) in listOf(-0.45f to -0.03f, 0.03f to 0.45f)) {
            chamfer(cx + l * r, cy + r * 0.32f, cx + rr * r, cy + r * 0.56f, r * 0.04f)
            fill.color = th.panel
            canvas.drawPath(path, fill)
            stroke.color = line
            stroke.strokeWidth = r * 0.01f
            canvas.drawPath(path, stroke)
        }
        drawHeart(canvas, cx - r * 0.35f, cy + r * 0.40f, r * 0.04f, accent)
        text.textSize = r * 0.11f
        text.color = accent
        canvas.drawText(hr, cx - r * 0.16f, cy + r * 0.44f, text)
        text.textSize = r * 0.065f
        text.color = second
        canvas.drawText("LPM", cx - r * 0.20f, cy + r * 0.53f, text)
        drawShoe(canvas, cx + r * 0.11f, cy + r * 0.40f, r * 0.04f, accent)
        text.color = accent
        text.textSize = r * 0.11f
        val sw = text.measureText(steps)
        if (sw > r * 0.26f) text.textSize *= r * 0.26f / sw
        canvas.drawText(steps, cx + r * 0.30f, cy + r * 0.44f, text)
        text.textSize = r * 0.065f
        text.color = second
        canvas.drawText("PASOS", cx + r * 0.26f, cy + r * 0.53f, text)

        Brand.draw(canvas, cx, cy + r * 0.67f, r * 0.03f, line)
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

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: TacticAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
