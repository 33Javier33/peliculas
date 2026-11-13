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
        Spot(-0.50f, 0f, Action.MEDIA, "Toque en la hora", hit = 0.24f),
        Spot(0.11f, 0f, Action.MUSIC, "Toque en los minutos", hit = 0.22f),
        Spot(0.76f, -0.04f, Action.BATTERY, "Panel de batería", hit = 0.16f),
        Spot(0f, -0.60f, Action.ALARMS, "Caja de la fecha", hit = 0.22f),
    )
    override val choices = listOf(THEME, COLON, SECONDS, Smooth.CHOICE)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        val slots = listOf(
            ComplicationSlot.createRoundRectComplicationSlotBuilder(HEART, factory, types, DefaultComplicationDataSourcePolicy(), ComplicationSlotBounds(RectF(0.21f, 0.70f, 0.485f, 0.86f))).build(),
            ComplicationSlot.createRoundRectComplicationSlotBuilder(
                STEPS, factory, types,
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
                ComplicationSlotBounds(RectF(0.51f, 0.70f, 0.785f, 0.86f)),
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

    /** Texto que ocupa un ancho dado (se angosta si hace falta, como las letras condensadas de la foto) */
    private fun fitText(canvas: Canvas, s: String, x: Float, y: Float, size: Float, maxW: Float, color: Int, align: Paint.Align) {
        text.textAlign = align
        text.textSize = size
        text.textScaleX = 1f
        val w = text.measureText(s)
        if (w > maxW) text.textScaleX = maxW / w
        text.color = color
        canvas.drawText(s, x, y, text)
        text.textScaleX = 1f
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: TacticAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        interactiveDrawModeUpdateDelayMillis = Smooth.delay(context)
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val th = THEMES[Choices.index(context, THEME)].second
        val accent = if (ambient) Color.rgb(170, 170, 160) else th.accent
        val second = if (ambient) Color.rgb(110, 110, 104) else th.second
        val line = if (ambient) Color.rgb(60, 60, 56) else th.line
        val panel = if (ambient) Color.BLACK else th.panel
        canvas.drawColor(Color.BLACK)
        stroke.strokeCap = Paint.Cap.BUTT

        // Anillos del borde: banda gruesa afuera y piezas adentro
        stroke.color = line
        stroke.strokeWidth = r * 0.06f
        canvas.drawCircle(cx, cy, r * 0.955f, stroke)
        stroke.color = Color.rgb(Color.red(line) / 2, Color.green(line) / 2, Color.blue(line) / 2)
        stroke.strokeWidth = r * 0.012f
        canvas.drawCircle(cx, cy, r * 0.93f, stroke)
        if (!ambient) {
            stroke.strokeWidth = r * 0.028f
            for ((a0, sw) in listOf(-52f to 46f, 4f to 44f, 128f to 46f, 186f to 46f)) canvas.drawArc(oval(cx, cy, r * 0.875f), a0 - 90f, sw, false, stroke)
            stroke.strokeWidth = r * 0.012f
            canvas.drawLine(X(-0.02f), Y(-0.86f), X(-0.02f), Y(-0.93f), stroke)
            canvas.drawLine(X(-0.02f), Y(0.86f), X(-0.02f), Y(0.93f), stroke)

            // Columna de bloques a la izquierda: los segundos (se encienden de abajo hacia arriba)
            val n = 11
            val f = Smooth.seconds(context, t) / 60f * n
            stroke.strokeWidth = r * 0.05f
            for (i in 0 until n) {
                val start = 245f + (n - 1 - i) * 4.6f
                stroke.color = if (i < f.toInt()) accent else Color.rgb(Color.red(line) / 2 + 20, Color.green(line) / 2 + 20, Color.blue(line) / 2 + 20)
                canvas.drawArc(oval(cx, cy, r * 0.84f), start - 90f, 3.4f, false, stroke)
                if (i == f.toInt()) {
                    stroke.color = accent
                    canvas.drawArc(oval(cx, cy, r * 0.84f), start - 90f, 3.4f * (f - f.toInt()), false, stroke)
                }
            }
            // Arco de batería arriba a la derecha
            val pctArc = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            stroke.strokeWidth = r * 0.028f
            stroke.color = Color.rgb(Color.red(line) / 2 + 20, Color.green(line) / 2 + 20, Color.blue(line) / 2 + 20)
            canvas.drawArc(oval(cx, cy, r * 0.875f), 33f - 90f, 24f, false, stroke)
            if (pctArc >= 0) {
                stroke.color = accent
                canvas.drawArc(oval(cx, cy, r * 0.875f), 33f - 90f, 24f * pctArc / 100f, false, stroke)
            }

            // Rejilla detrás de la fecha
            stroke.color = Color.argb(80, Color.red(line), Color.green(line), Color.blue(line))
            stroke.strokeWidth = r * 0.004f
            var gx = -0.42f
            while (gx <= 0.42f) { canvas.drawLine(X(gx), Y(-0.85f), X(gx), Y(-0.42f), stroke); gx += 0.042f }
            var gy = -0.85f
            while (gy <= -0.42f) { canvas.drawLine(X(-0.42f), Y(gy), X(0.42f), Y(gy), stroke); gy += 0.042f }
        }

        // Caja de la fecha: doble borde redondeado; día y número en el acento, el mes en el secundario
        val box = RectF(X(-0.555f), Y(-0.745f), X(0.555f), Y(-0.46f))
        fill.color = panel
        canvas.drawRoundRect(box, r * 0.05f, r * 0.05f, fill)
        stroke.color = second
        stroke.strokeWidth = r * 0.014f
        canvas.drawRoundRect(box, r * 0.05f, r * 0.05f, stroke)
        stroke.color = line
        stroke.strokeWidth = r * 0.006f
        canvas.drawRoundRect(RectF(box.left + r * 0.025f, box.top + r * 0.025f, box.right - r * 0.025f, box.bottom - r * 0.025f), r * 0.03f, r * 0.03f, stroke)
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        val mon = t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        val dayN = t.dayOfMonth.toString()
        text.textSize = r * 0.22f
        val sp = text.measureText(" ")
        val w1 = text.measureText(dow)
        val w2 = text.measureText(mon)
        val w3 = text.measureText(dayN)
        val total = w1 + w2 + w3 + sp * 2
        val k = (r * 0.94f / total).coerceAtMost(1f)
        text.textScaleX = k
        var x = cx - total * k / 2
        text.textAlign = Paint.Align.LEFT
        text.color = accent
        canvas.drawText(dow, x, Y(-0.525f), text)
        x += (w1 + sp) * k
        text.color = second
        canvas.drawText(mon, x, Y(-0.525f), text)
        x += (w2 + sp) * k
        text.color = accent
        canvas.drawText(dayN, x, Y(-0.525f), text)
        text.textScaleX = 1f

        // Fila: ALM · SIG · barra · DST
        if (!ambient) {
            fill.color = Color.rgb(20, 21, 19)
            path.reset()
            path.moveTo(X(-0.88f), Y(-0.42f)); path.lineTo(X(0.70f), Y(-0.42f)); path.lineTo(X(0.66f), Y(-0.33f)); path.lineTo(X(-0.86f), Y(-0.33f)); path.close()
            canvas.drawPath(path, fill)
            val dim = Color.argb(90, Color.red(second), Color.green(second), Color.blue(second))
            fitText(canvas, "ALM", X(-0.69f), Y(-0.355f), r * 0.075f, r * 0.15f, if (Indicators.alarm(context)) second else dim, Paint.Align.LEFT)
            fitText(canvas, "SIG", X(-0.48f), Y(-0.355f), r * 0.075f, r * 0.12f, if (Indicators.online(context)) second else dim, Paint.Align.LEFT)
            fitText(canvas, "DST", X(0.42f), Y(-0.355f), r * 0.075f, r * 0.13f, if (Indicators.dst(t)) second else dim, Paint.Align.LEFT)
            // Barra inclinada: avance del día
            val day = (t.hour * 60 + t.minute) / 1440f
            path.reset()
            path.moveTo(X(-0.17f), Y(-0.36f)); path.lineTo(X(0.30f), Y(-0.36f)); path.lineTo(X(0.33f), Y(-0.40f)); path.lineTo(X(-0.14f), Y(-0.40f)); path.close()
            fill.color = Color.rgb(Color.red(line) / 2 + 10, Color.green(line) / 2 + 10, Color.blue(line) / 2 + 10)
            canvas.drawPath(path, fill)
            canvas.save()
            canvas.clipPath(path)
            fill.color = second
            canvas.drawRect(X(-0.17f), Y(-0.40f), X(-0.17f) + r * 0.50f * day, Y(-0.36f), fill)
            canvas.restore()
        }

        // Banda de la hora: tira clara arriba, fondo y rayas inclinadas abajo
        if (!ambient) {
            fill.color = Color.rgb(78, 80, 74)
            canvas.drawRect(X(-0.80f), Y(-0.32f), X(0.60f), Y(-0.28f), fill)
            fill.color = Color.rgb(34, 36, 32)
            canvas.drawRect(X(-0.80f), Y(-0.28f), X(0.60f), Y(0.29f), fill)
            fill.color = Color.rgb(78, 80, 74)
            path.reset()
            path.moveTo(X(-0.74f), Y(0.29f)); path.lineTo(X(-0.08f), Y(0.29f)); path.lineTo(X(-0.12f), Y(0.34f)); path.lineTo(X(-0.70f), Y(0.34f)); path.close()
            canvas.drawPath(path, fill)
            for (j in 0 until 7) {
                fill.color = if (j == 4) accent else Color.rgb(78, 80, 74)
                val x0 = X(-0.02f + j * 0.085f)
                path.reset()
                path.moveTo(x0, Y(0.34f)); path.lineTo(x0 + r * 0.05f, Y(0.29f)); path.lineTo(x0 + r * 0.085f, Y(0.29f)); path.lineTo(x0 + r * 0.035f, Y(0.34f)); path.close()
                canvas.drawPath(path, fill)
            }
        }

        // Hora: horas en el acento y minutos en el secundario, grandes como en la foto
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        fitText(canvas, h, X(-0.285f), Y(0.22f), r * 0.60f, r * 0.44f, accent, Paint.Align.RIGHT)
        fitText(canvas, "%02d".format(t.minute), X(-0.135f), Y(0.22f), r * 0.60f, r * 0.49f, second, Paint.Align.LEFT)
        // Dos puntos: el de arriba brilla (y parpadea si se eligió)
        val blinkOff = Choices.value(context, COLON) == 0 && t.second % 2 == 1 && !ambient
        fill.color = if (blinkOff) second else accent
        if (!ambient && !blinkOff) fill.setShadowLayer(r * 0.04f, 0f, 0f, accent)
        canvas.drawRoundRect(RectF(X(-0.245f), Y(-0.11f), X(-0.175f), Y(-0.04f)), r * 0.012f, r * 0.012f, fill)
        fill.clearShadowLayer()
        fill.color = second
        canvas.drawRoundRect(RectF(X(-0.245f), Y(0.055f), X(-0.175f), Y(0.125f)), r * 0.012f, r * 0.012f, fill)

        if (ambient) {
            Brand.draw(canvas, cx, cy + r * 0.45f, r * 0.03f, Color.DKGRAY)
            return
        }

        // Segundos y AM/PM
        if (Choices.value(context, SECONDS) == 0) fitText(canvas, "%02d".format(t.second), X(0.485f), Y(-0.05f), r * 0.22f, r * 0.17f, accent, Paint.Align.CENTER)
        if (!is24) {
            val pm = RectF(X(0.40f), Y(0.10f), X(0.56f), Y(0.205f))
            fill.color = accent
            canvas.drawRoundRect(pm, r * 0.02f, r * 0.02f, fill)
            fitText(canvas, if (t.hour < 12) "AM" else "PM", pm.centerX(), Y(0.185f), r * 0.09f, r * 0.13f, panel, Paint.Align.CENTER)
        }

        // Panel de batería alto: pila grande con tapa y 6 barras, «85%» y «BAT»
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        chamfer(X(0.62f), Y(-0.38f), X(0.90f), Y(0.30f), r * 0.05f)
        fill.color = panel
        canvas.drawPath(path, fill)
        stroke.color = second
        stroke.strokeWidth = r * 0.012f
        canvas.drawPath(path, stroke)
        stroke.color = second
        stroke.strokeWidth = r * 0.012f
        canvas.drawRoundRect(RectF(X(0.68f), Y(-0.30f), X(0.85f), Y(0.005f)), r * 0.015f, r * 0.015f, stroke)
        fill.color = second
        canvas.drawRoundRect(RectF(X(0.73f), Y(-0.325f), X(0.80f), Y(-0.30f)), r * 0.006f, r * 0.006f, fill)
        val bars = 6
        for (j in 0 until bars) {
            val lit = pct >= 0 && pct >= (j + 1) * (100f / bars) - 100f / bars / 2
            fill.color = if (lit) accent else Color.argb(40, Color.red(second), Color.green(second), Color.blue(second))
            val yb = Y(-0.015f) - j * r * 0.033f
            canvas.drawRect(X(0.70f), yb - r * 0.022f, X(0.83f), yb, fill)
        }
        fitText(canvas, if (pct >= 0) "$pct%" else "--", X(0.76f), Y(0.15f), r * 0.15f, r * 0.24f, accent, Paint.Align.CENTER)
        fitText(canvas, "BAT", X(0.76f), Y(0.245f), r * 0.09f, r * 0.15f, second, Paint.Align.CENTER)

        // Cajas de ritmo y pasos (con la esquina de afuera cortada)
        val hr = complications.textOf(HEART, context.resources) ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        val steps = complications.textOf(STEPS, context.resources) ?: "--"
        for (left in listOf(true, false)) {
            val l = if (left) X(-0.58f) else X(0.02f)
            val rr = if (left) X(-0.03f) else X(0.57f)
            val tp = Y(0.40f)
            val bt = Y(0.72f)
            val c = r * 0.03f
            val cut = r * 0.11f
            path.reset()
            path.moveTo(l + c, tp); path.lineTo(rr - c, tp); path.quadTo(rr, tp, rr, tp + c)
            if (left) {
                path.lineTo(rr, bt - c); path.quadTo(rr, bt, rr - c, bt); path.lineTo(l + cut, bt); path.lineTo(l, bt - cut)
            } else {
                path.lineTo(rr, bt - cut); path.lineTo(rr - cut, bt); path.lineTo(l + c, bt); path.quadTo(l, bt, l, bt - c)
            }
            if (left) { path.lineTo(l, tp + c); path.quadTo(l, tp, l + c, tp) } else { path.lineTo(l, tp + c); path.quadTo(l, tp, l + c, tp) }
            path.close()
            fill.color = panel
            canvas.drawPath(path, fill)
            stroke.color = second
            stroke.strokeWidth = r * 0.012f
            canvas.drawPath(path, stroke)
        }
        drawHeart(canvas, X(-0.45f), Y(0.515f), r * 0.06f, accent)
        // Línea de latido sobre el corazón
        stroke.color = panel
        stroke.strokeWidth = r * 0.01f
        stroke.strokeCap = Paint.Cap.ROUND
        path.reset()
        path.moveTo(X(-0.52f), Y(0.515f)); path.lineTo(X(-0.47f), Y(0.515f)); path.lineTo(X(-0.455f), Y(0.48f))
        path.lineTo(X(-0.435f), Y(0.55f)); path.lineTo(X(-0.42f), Y(0.515f)); path.lineTo(X(-0.38f), Y(0.515f))
        canvas.drawPath(path, stroke)
        stroke.strokeCap = Paint.Cap.BUTT
        fitText(canvas, hr, X(-0.21f), Y(0.575f), r * 0.155f, r * 0.24f, accent, Paint.Align.CENTER)
        fitText(canvas, "LPM", X(-0.23f), Y(0.68f), r * 0.09f, r * 0.20f, second, Paint.Align.CENTER)
        drawShoe(canvas, X(0.125f), Y(0.51f), r * 0.06f, accent)
        fitText(canvas, steps, X(0.36f), Y(0.575f), r * 0.155f, r * 0.34f, accent, Paint.Align.CENTER)
        fitText(canvas, "PASOS", X(0.27f), Y(0.68f), r * 0.09f, r * 0.26f, second, Paint.Align.CENTER)

        Brand.draw(canvas, cx, Y(0.80f), r * 0.03f, line)
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
