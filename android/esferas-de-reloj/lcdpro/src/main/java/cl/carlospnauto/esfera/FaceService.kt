package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
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
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.rendering.CanvasComplicationDrawable
import androidx.wear.watchface.complications.rendering.ComplicationDrawable
import androidx.wear.watchface.complications.rendering.ComplicationStyle
import androidx.wear.watchface.style.CurrentUserStyleRepository
import cl.carlospnauto.esfera.comun.Action
import cl.carlospnauto.esfera.comun.Brand
import cl.carlospnauto.esfera.comun.Choice
import cl.carlospnauto.esfera.comun.Choices
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.HeartRate
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
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.min

private const val WEATHER = 101
private const val FEELS = 102
private const val PRESS = 103
private const val SUN = 104
private const val HEART = 105
private const val STEPS = 106
private const val EVENT = 107

/** Tema: fondo de la pantalla, segmentos y borde */
private data class Theme(val bg: Int, val ink: Int, val line: Int)

private val THEMES = listOf(
    "Gris azulado" to Theme(Color.rgb(184, 196, 204), Color.rgb(16, 22, 26), Color.rgb(230, 236, 240)),
    "Noche" to Theme(Color.rgb(10, 12, 14), Color.rgb(215, 220, 224), Color.rgb(200, 205, 210)),
    "Verde LCD" to Theme(Color.rgb(201, 214, 196), Color.rgb(18, 26, 18), Color.rgb(230, 236, 228)),
    "Grafito" to Theme(Color.rgb(22, 24, 24), Color.rgb(190, 215, 195), Color.rgb(170, 190, 175)),
    "Cian" to Theme(Color.rgb(79, 195, 217), Color.rgb(6, 32, 40), Color.rgb(170, 235, 245)),
    "Noche cian" to Theme(Color.rgb(5, 14, 16), Color.rgb(60, 200, 220), Color.rgb(60, 200, 220)),
    "Ámbar" to Theme(Color.rgb(240, 200, 120), Color.rgb(40, 26, 6), Color.rgb(250, 225, 170)),
    "Noche ámbar" to Theme(Color.rgb(14, 10, 4), Color.rgb(255, 180, 60), Color.rgb(255, 180, 60)),
)
private val THEME = Choice("tema", "Tema", THEMES.map { it.first to (if (Color.red(it.second.bg) < 40) it.second.ink else it.second.bg) })

object Config : FaceConfig {
    override val slots = listOf(
        WEATHER to "Arriba izquierda (clima)", FEELS to "Arriba centro (sensación)", PRESS to "Arriba derecha (presión)",
        SUN to "Pantalla: amanecer / atardecer", HEART to "Ritmo cardíaco", STEPS to "Pasos", EVENT to "Evento (abajo)",
    )
    override val spots = listOf(
        Spot(-0.86f, 0f, Action.MEDIA, "Puntos izquierdos", hit = 0.11f),
        Spot(0.86f, 0f, Action.MUSIC, "Puntos derechos", hit = 0.11f),
    )
    override val choices = listOf(THEME)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener ->
            val d = ComplicationDrawable(this)
            for (s in listOf(d.activeStyle, d.ambientStyle)) {
                s.backgroundColor = Color.TRANSPARENT
                s.borderStyle = ComplicationStyle.BORDER_STYLE_NONE
                s.textColor = Color.WHITE
                s.titleColor = Color.LTGRAY
                s.iconColor = Color.WHITE
            }
            CanvasComplicationDrawable(d, watchState, listener)
        }
        val short = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE, ComplicationType.SMALL_IMAGE)
        val num = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        val none = DefaultComplicationDataSourcePolicy()
        fun slot(id: Int, types: List<ComplicationType>, p: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, types, p, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            // Clima, sensación y presión los dan Samsung o Google (se eligen en Personalizar); sin dato, la presión la mide el reloj
            slot(WEATHER, short, none, RectF(0.25f, 0.12f, 0.37f, 0.25f)),
            slot(FEELS, short, none, RectF(0.44f, 0.12f, 0.56f, 0.25f)),
            slot(PRESS, short, none, RectF(0.63f, 0.12f, 0.75f, 0.25f)),
            slot(SUN, num, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_SUNRISE_SUNSET, ComplicationType.SHORT_TEXT), RectF(0.17f, 0.31f, 0.47f, 0.40f)),
            slot(HEART, num, none, RectF(0.15f, 0.62f, 0.37f, 0.70f)),
            slot(STEPS, num, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.63f, 0.62f, 0.85f, 0.70f)),
            slot(EVENT, listOf(ComplicationType.LONG_TEXT, ComplicationType.SHORT_TEXT), DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_NEXT_EVENT, ComplicationType.LONG_TEXT), RectF(0.20f, 0.725f, 0.80f, 0.85f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = LcdProRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class LcdProAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Pantalla de cristal líquido completa: atardecer, batería, hora, día, fecha, segundos y celdas de ritmo, km y pasos */
class LcdProRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<LcdProAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false),
    SensorEventListener {

    override suspend fun createSharedAssets() = LcdProAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val sm = context.getSystemService(SensorManager::class.java)
    private val barometer = sm?.getDefaultSensor(Sensor.TYPE_PRESSURE)
    @Volatile private var hpa = 0f
    private var baroOn = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    var lastBounds = Rect()
        private set

    init {
        scope.launch {
            watchState.isAmbient.combine(watchState.isVisible) { ambient, visible -> ambient != true && visible == true }
                .collect { active ->
                    heart.update(active)
                    val want = active && barometer != null
                    if (want != baroOn) {
                        baroOn = want
                        if (want) sm?.registerListener(this@LcdProRenderer, barometer, 1_000_000, 2_000_000) else sm?.unregisterListener(this@LcdProRenderer)
                    }
                }
        }
    }

    override fun onSensorChanged(e: SensorEvent) {
        hpa = e.values.firstOrNull() ?: return
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onDestroy() {
        heart.stop()
        sm?.unregisterListener(this)
        scope.cancel()
        super.onDestroy()
    }

    private fun a(c: Int, alpha: Int) = Color.argb(alpha, Color.red(c), Color.green(c), Color.blue(c))

    private fun empty(id: Int) = complications.complicationSlots[id]?.complicationData?.value?.type.let {
        it == null || it == ComplicationType.NO_DATA || it == ComplicationType.EMPTY
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LcdProAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        interactiveDrawModeUpdateDelayMillis = 1000L
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val th = if (ambient) Theme(Color.BLACK, Color.rgb(200, 205, 210), Color.rgb(120, 120, 120)) else THEMES[Choices.index(context, THEME)].second
        val on = th.ink
        val ghost = if (ambient) 0 else a(th.ink, 28)
        canvas.drawColor(Color.BLACK)

        // Pantalla
        val lcd = RectF(cx - r * 0.72f, cy - r * 0.42f, cx + r * 0.72f, cy + r * 0.40f)
        fill.color = th.bg
        canvas.drawRoundRect(lcd, r * 0.07f, r * 0.07f, fill)
        stroke.color = th.line
        stroke.strokeWidth = r * 0.013f
        canvas.drawRoundRect(lcd, r * 0.07f, r * 0.07f, stroke)

        // Hora grande con «8» apagados
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        Lcd.number(canvas, "$h:%02d".format(t.minute), cx + r * 0.66f, cy - r * 0.36f, r * 0.13f, r * 0.27f, r * 0.045f, 4, on, ghost)

        // Fila del medio: AM/PM, día, fecha y segundos
        text.textAlign = Paint.Align.LEFT
        text.textSize = r * 0.05f
        text.color = if (!is24 && t.hour < 12) on else a(on, if (ambient) 0 else 40)
        canvas.drawText("AM", cx - r * 0.62f, cy + r * 0.07f, text)
        text.color = if (!is24 && t.hour >= 12) on else a(on, if (ambient) 0 else 40)
        canvas.drawText("PM", cx - r * 0.52f, cy + r * 0.07f, text)
        val day = t.dayOfWeek.getDisplayName(TextStyle.FULL, loc).uppercase(loc)
        text.color = on
        text.textSize = r * 0.07f
        val dw = text.measureText(day)
        if (dw > r * 0.40f) text.textSize *= r * 0.40f / dw
        canvas.drawText(day, cx - r * 0.62f, cy + r * 0.17f, text)
        Lcd.number(canvas, "%02d-%02d".format(t.dayOfMonth, t.monthValue), cx + r * 0.30f, cy + r * 0.03f, r * 0.065f, r * 0.14f, r * 0.02f, 5, on, ghost)
        if (!ambient) {
            text.textSize = r * 0.045f
            canvas.drawText("SEG", cx + r * 0.33f, cy + r * 0.17f, text)
            Lcd.number(canvas, "%02d".format(t.second), cx + r * 0.66f, cy + r * 0.03f, r * 0.065f, r * 0.14f, r * 0.02f, 2, on, ghost)
        }
        text.textAlign = Paint.Align.CENTER

        if (ambient) {
            Brand.draw(canvas, cx, cy + r * 0.62f, r * 0.03f, Color.DKGRAY)
            return
        }

        // Fila de arriba a la izquierda: atardecer/amanecer y batería
        drawSun(canvas, cx - r * 0.61f, cy - r * 0.29f, r * 0.04f, on)
        val sun = complications.textOf(SUN, context.resources)?.filter { it.isDigit() || it == ':' }?.takeIf { it.isNotEmpty() } ?: ""
        Lcd.number(canvas, sun, cx - r * 0.08f, cy - r * 0.35f, r * 0.055f, r * 0.11f, r * 0.03f, 4, on, ghost)
        drawBoltCircle(canvas, cx - r * 0.61f, cy - r * 0.08f, r * 0.045f, on, battery?.isCharging == true)
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        stroke.strokeCap = Paint.Cap.BUTT
        stroke.strokeWidth = r * 0.035f
        stroke.color = a(on, 45)
        canvas.drawLine(cx - r * 0.50f, cy - r * 0.08f, cx - r * 0.10f, cy - r * 0.08f, stroke)
        if (pct >= 0) {
            stroke.color = on
            canvas.drawLine(cx - r * 0.50f, cy - r * 0.08f, cx - r * 0.50f + r * 0.40f * pct / 100f, cy - r * 0.08f, stroke)
        }
        stroke.strokeCap = Paint.Cap.ROUND

        // Celdas de abajo: ritmo · km · pasos
        stroke.color = th.line
        stroke.strokeWidth = r * 0.009f
        canvas.drawLine(lcd.left, cy + r * 0.23f, lcd.right, cy + r * 0.23f, stroke)
        canvas.drawLine(cx - r * 0.24f, cy + r * 0.23f, cx - r * 0.24f, lcd.bottom, stroke)
        canvas.drawLine(cx + r * 0.24f, cy + r * 0.23f, cx + r * 0.24f, lcd.bottom, stroke)
        val hr = complications.textOf(HEART, context.resources)?.filter { it.isDigit() } ?: heart.bpm.takeIf { it > 0 }?.toString() ?: ""
        val stepsText = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() } ?: ""
        val km = stepsText.toLongOrNull()?.let { String.format(Locale.US, "%05.2f", it * 0.75 / 1000.0) } ?: ""
        drawHeart(canvas, cx - r * 0.61f, cy + r * 0.31f, r * 0.035f, on)
        Lcd.number(canvas, hr, cx - r * 0.27f, cy + r * 0.26f, r * 0.05f, r * 0.10f, r * 0.015f, 3, on, ghost)
        text.textSize = r * 0.04f
        text.color = on
        canvas.drawText("km", cx - r * 0.18f, cy + r * 0.29f, text)
        drawPin(canvas, cx - r * 0.18f, cy + r * 0.34f, r * 0.025f, on)
        Lcd.number(canvas, km, cx + r * 0.21f, cy + r * 0.26f, r * 0.05f, r * 0.10f, r * 0.03f, 4, on, ghost)
        drawRunner(canvas, cx + r * 0.30f, cy + r * 0.31f, r * 0.045f, on)
        Lcd.number(canvas, stepsText, cx + r * 0.69f, cy + r * 0.26f, r * 0.05f, r * 0.10f, r * 0.015f, 5, on, ghost)

        // Arriba (afuera): clima, sensación y presión (sin dato: su ícono con «--»; la presión, del barómetro)
        val white = Color.WHITE
        text.textSize = r * 0.07f
        text.color = white
        if (empty(WEATHER)) { drawCloud(canvas, cx - r * 0.38f, cy - r * 0.68f, r * 0.04f, white); canvas.drawText("--°", cx - r * 0.38f, cy - r * 0.54f, text) }
        if (empty(FEELS)) { drawFeels(canvas, cx, cy - r * 0.68f, r * 0.04f, white); canvas.drawText("--°", cx, cy - r * 0.54f, text) }
        if (empty(PRESS)) {
            drawMountain(canvas, cx + r * 0.38f, cy - r * 0.68f, r * 0.045f, white)
            canvas.drawText(if (hpa > 0f) hpa.toInt().toString() else "--", cx + r * 0.38f, cy - r * 0.54f, text)
        }
        for (id in listOf(WEATHER, FEELS, PRESS)) {
            val slot = complications.complicationSlots[id] ?: continue
            if (slot.enabled && !empty(id)) slot.render(canvas, zonedDateTime, renderParameters)
        }

        // Abajo (afuera): calendario y evento
        drawCalendar(canvas, cx, cy + r * 0.50f, r * 0.035f, Color.rgb(90, 90, 90))
        val ev = (complications.complicationSlots[EVENT]?.complicationData?.value as? LongTextComplicationData)?.text?.getTextAt(context.resources, Instant.now())?.toString()
            ?: complications.textOf(EVENT, context.resources) ?: "SIN EVENTOS"
        text.textSize = r * 0.065f
        text.color = white
        val evs = ev.uppercase(loc)
        val ew = text.measureText(evs)
        if (ew > r * 1.2f) text.textSize *= r * 1.2f / ew
        canvas.drawText(evs, cx, cy + r * 0.64f, text)

        // Puntos a los costados (accesos a PulsoMedia y PulsoMusic)
        fill.color = Color.rgb(200, 200, 200)
        for (sx in listOf(-0.86f, 0.86f)) for (k in -1..1) canvas.drawCircle(cx + sx * r, cy + k * r * 0.045f, r * 0.014f, fill)

        Brand.draw(canvas, cx, cy + r * 0.78f, r * 0.03f, Color.rgb(110, 110, 110))
    }

    private fun drawSun(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        stroke.color = color
        stroke.strokeWidth = s * 0.2f
        canvas.drawArc(RectF(x - s * 0.7f, y - s * 0.5f, x + s * 0.7f, y + s * 0.9f), 180f, 180f, false, stroke)
        for (k in -2..2) {
            canvas.save()
            canvas.rotate(k * 35f, x, y + s * 0.2f)
            canvas.drawLine(x, y - s * 0.75f, x, y - s * 1.05f, stroke)
            canvas.restore()
        }
        canvas.drawLine(x - s * 1.1f, y + s * 0.4f, x + s * 1.1f, y + s * 0.4f, stroke)
        canvas.drawLine(x - s * 0.8f, y + s * 0.8f, x + s * 0.8f, y + s * 0.8f, stroke)
    }

    private fun drawBoltCircle(canvas: Canvas, x: Float, y: Float, s: Float, color: Int, charging: Boolean) {
        stroke.color = color
        stroke.strokeWidth = s * 0.14f
        canvas.drawCircle(x, y, s, stroke)
        fill.color = if (charging) color else a(color, 140)
        path.reset()
        path.moveTo(x + s * 0.15f, y - s * 0.7f)
        path.lineTo(x - s * 0.35f, y + s * 0.1f)
        path.lineTo(x, y + s * 0.1f)
        path.lineTo(x - s * 0.15f, y + s * 0.7f)
        path.lineTo(x + s * 0.35f, y - s * 0.1f)
        path.lineTo(x, y - s * 0.1f)
        path.close()
        canvas.drawPath(path, fill)
    }

    private fun drawHeart(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        path.reset()
        path.moveTo(x, y + s * 0.9f)
        path.cubicTo(x - s * 1.6f, y - s * 0.1f, x - s * 0.8f, y - s * 1.3f, x, y - s * 0.45f)
        path.cubicTo(x + s * 0.8f, y - s * 1.3f, x + s * 1.6f, y - s * 0.1f, x, y + s * 0.9f)
        path.close()
        stroke.color = color
        stroke.strokeWidth = s * 0.18f
        canvas.drawPath(path, stroke)
        path.reset()
        path.moveTo(x - s * 0.8f, y)
        path.lineTo(x - s * 0.25f, y)
        path.lineTo(x - s * 0.05f, y - s * 0.4f)
        path.lineTo(x + s * 0.15f, y + s * 0.35f)
        path.lineTo(x + s * 0.8f, y)
        canvas.drawPath(path, stroke)
    }

    private fun drawPin(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        stroke.color = color
        stroke.strokeWidth = s * 0.3f
        path.reset()
        path.moveTo(x - s * 1.2f, y + s * 0.9f)
        path.quadTo(x - s * 1.8f, y - s * 0.2f, x - s * 0.6f, y - s * 0.4f)
        path.quadTo(x + s * 0.6f, y - s * 0.6f, x + s * 0.2f, y + s * 0.5f)
        canvas.drawPath(path, stroke)
        fill.color = color
        canvas.drawCircle(x + s * 0.9f, y - s * 0.8f, s * 0.45f, fill)
    }

    private fun drawRunner(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawCircle(x + s * 0.2f, y - s * 0.95f, s * 0.22f, fill)
        stroke.color = color
        stroke.strokeWidth = s * 0.2f
        canvas.drawLine(x + s * 0.1f, y - s * 0.6f, x - s * 0.15f, y + s * 0.1f, stroke)
        canvas.drawLine(x - s * 0.15f, y + s * 0.1f, x + s * 0.35f, y + s * 0.45f, stroke)
        canvas.drawLine(x + s * 0.35f, y + s * 0.45f, x + s * 0.2f, y + s * 0.95f, stroke)
        canvas.drawLine(x - s * 0.15f, y + s * 0.1f, x - s * 0.55f, y + s * 0.85f, stroke)
        canvas.drawLine(x + s * 0.05f, y - s * 0.45f, x + s * 0.55f, y - s * 0.15f, stroke)
        canvas.drawLine(x + s * 0.05f, y - s * 0.45f, x - s * 0.45f, y - s * 0.2f, stroke)
    }

    private fun drawCloud(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawCircle(x - s * 0.5f, y + s * 0.2f, s * 0.55f, fill)
        canvas.drawCircle(x + s * 0.2f, y - s * 0.1f, s * 0.75f, fill)
        canvas.drawRoundRect(RectF(x - s * 1.05f, y + s * 0.1f, x + s * 1.0f, y + s * 0.75f), s * 0.3f, s * 0.3f, fill)
    }

    private fun drawFeels(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawCircle(x - s * 0.3f, y - s * 1.0f, s * 0.22f, fill)
        stroke.color = color
        stroke.strokeWidth = s * 0.22f
        canvas.drawLine(x - s * 0.3f, y - s * 0.7f, x - s * 0.3f, y + s * 0.2f, stroke)
        canvas.drawLine(x - s * 0.9f, y - s * 0.5f, x + s * 0.2f, y - s * 0.5f, stroke)
        canvas.drawLine(x - s * 0.3f, y + s * 0.2f, x - s * 0.7f, y + s * 1.0f, stroke)
        canvas.drawRoundRect(RectF(x + s * 0.35f, y - s * 0.6f, x + s * 0.75f, y + s * 0.6f), s * 0.2f, s * 0.2f, stroke)
        canvas.drawCircle(x + s * 0.55f, y + s * 0.8f, s * 0.3f, fill)
    }

    private fun drawMountain(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x - s * 1.0f, y + s * 0.7f)
        path.lineTo(x - s * 0.35f, y - s * 0.4f)
        path.lineTo(x, y + s * 0.1f)
        path.lineTo(x + s * 0.3f, y - s * 0.2f)
        path.lineTo(x + s * 0.7f, y + s * 0.7f)
        path.close()
        canvas.drawPath(path, fill)
        stroke.color = color
        stroke.strokeWidth = s * 0.15f
        canvas.drawLine(x + s * 1.0f, y - s * 0.8f, x + s * 1.0f, y + s * 0.7f, stroke)
        for (k in 0..3) canvas.drawLine(x + s * 0.8f, y - s * 0.7f + k * s * 0.45f, x + s * 1.0f, y - s * 0.7f + k * s * 0.45f, stroke)
    }

    private fun drawCalendar(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        stroke.color = color
        stroke.strokeWidth = s * 0.15f
        canvas.drawRoundRect(RectF(x - s, y - s * 0.8f, x + s, y + s), s * 0.2f, s * 0.2f, stroke)
        canvas.drawLine(x - s, y - s * 0.3f, x + s, y - s * 0.3f, stroke)
        canvas.drawLine(x - s * 0.5f, y - s * 1.1f, x - s * 0.5f, y - s * 0.6f, stroke)
        canvas.drawLine(x + s * 0.5f, y - s * 1.1f, x + s * 0.5f, y - s * 0.6f, stroke)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LcdProAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
