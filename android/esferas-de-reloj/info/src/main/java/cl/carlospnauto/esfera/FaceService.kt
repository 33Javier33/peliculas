package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
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
import androidx.wear.watchface.complications.rendering.ComplicationStyle
import androidx.wear.watchface.style.CurrentUserStyleRepository
import cl.carlospnauto.esfera.comun.Action
import cl.carlospnauto.esfera.comun.Brand
import cl.carlospnauto.esfera.comun.Choice
import cl.carlospnauto.esfera.comun.Choices
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.HeartRate
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
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.IsoFields
import java.util.Locale
import kotlin.math.cos
import kotlin.math.min

private const val EVENT = 101
private const val INFO = 102
private const val WEATHER = 103
private const val HEART = 104
private const val STEPS = 105

private val ACCENTS = listOf(
    "Cian" to Color.rgb(20, 225, 240),
    "Rojo" to Color.rgb(255, 30, 40),
    "Amarillo" to Color.rgb(255, 210, 0),
    "Verde" to Color.rgb(50, 230, 90),
    "Naranja" to Color.rgb(255, 120, 20),
    "Azul" to Color.rgb(40, 130, 255),
    "Rosa" to Color.rgb(255, 70, 160),
    "Blanco" to Color.WHITE,
)
/** Transparente = «igual que el acento» */
private val SAME = "Igual al acento" to Color.TRANSPARENT
private val ACCENT = Choice("acento", "Color principal", ACCENTS)
private val MINUTES = Choice("minutos", "Minutos", listOf(SAME, "Blanco" to Color.WHITE) + ACCENTS.dropLast(1))
private val TICKS = Choice("marcas", "Marcas", listOf(SAME) + ACCENTS)
private val AOD = Choice("aod", "Pantalla siempre activa", listOf("Completa" to 0, "Mínima (solo la hora)" to 1))

object Config : FaceConfig {
    override val slots = listOf(
        EVENT to "Línea de eventos", INFO to "Dato de arriba", WEATHER to "Clima (abajo a la derecha)",
        HEART to "Ritmo cardíaco", STEPS to "Pasos",
    )
    override val spots = listOf(
        Spot(0.73f, 0.17f, Action.MEDIA, "Acceso junto a la hora", hit = 0.09f),
        Spot(0.47f, 0.63f, Action.MUSIC, "Acceso abajo a la derecha", hit = 0.10f),
        Spot(-0.47f, 0.63f, Action.ALARMS, "Acceso abajo a la izquierda", hit = 0.10f),
    )
    override val choices = listOf(ACCENT, MINUTES, TICKS, AOD)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener ->
            val d = ComplicationDrawable(this)
            for ((i, s) in listOf(d.activeStyle, d.ambientStyle).withIndex()) {
                val ambient = i == 1
                s.backgroundColor = Color.TRANSPARENT
                s.borderStyle = ComplicationStyle.BORDER_STYLE_NONE
                s.textColor = if (ambient) Color.LTGRAY else Color.WHITE
                s.titleColor = if (ambient) Color.GRAY else Color.rgb(190, 190, 190)
                s.iconColor = if (ambient) Color.LTGRAY else Color.WHITE
                s.rangedValuePrimaryColor = if (ambient) Color.LTGRAY else Color.rgb(20, 225, 240)
                s.rangedValueSecondaryColor = Color.rgb(40, 40, 40)
            }
            CanvasComplicationDrawable(d, watchState, listener)
        }
        fun slot(id: Int, types: List<ComplicationType>, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, types, policy, ComplicationSlotBounds(b)).build()
        val short = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE, ComplicationType.SMALL_IMAGE)
        val slots = listOf(
            slot(
                EVENT, listOf(ComplicationType.LONG_TEXT, ComplicationType.SHORT_TEXT),
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_NEXT_EVENT, ComplicationType.LONG_TEXT),
                RectF(0.20f, 0.205f, 0.80f, 0.265f),
            ),
            slot(INFO, short, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_SUNRISE_SUNSET, ComplicationType.SHORT_TEXT), RectF(0.50f, 0.28f, 0.68f, 0.35f)),
            // El clima lo da Samsung o Google: se elige en Personalizar
            slot(WEATHER, short, DefaultComplicationDataSourcePolicy(), RectF(0.60f, 0.665f, 0.82f, 0.745f)),
            // Ritmo y pasos se dibujan con las letras de la esfera (el dato solo da el número y abre su app al tocarlo)
            slot(HEART, listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE), DefaultComplicationDataSourcePolicy(), RectF(0.17f, 0.665f, 0.36f, 0.745f)),
            slot(STEPS, listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE), DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.36f, 0.76f, 0.64f, 0.86f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = InfoRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class InfoAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Esfera de información: fecha, eventos, luna, día del año, semana, hora con segundos, batería, ritmo, pasos y distancia */
class InfoRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<InfoAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = InfoAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }
    private val big = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
        textScaleX = 0.78f
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

    private fun divider(canvas: Canvas, cx: Float, y: Float, half: Float, r: Float) {
        stroke.strokeWidth = r * 0.006f
        stroke.shader = LinearGradient(cx - half, y, cx + half, y, intArrayOf(Color.TRANSPARENT, Color.rgb(90, 90, 90), Color.TRANSPARENT), null, Shader.TileMode.CLAMP)
        canvas.drawLine(cx - half, y, cx + half, y, stroke)
        stroke.shader = null
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: InfoAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val t = zonedDateTime
        val accent = Choices.value(context, ACCENT)
        val minuteColor = Choices.value(context, MINUTES).let { if (Color.alpha(it) == 0) accent else it }
        val tickColor = Choices.value(context, TICKS).let { if (Color.alpha(it) == 0) accent else it }
        val minimal = Choices.value(context, AOD) == 1
        val loc = Locale.getDefault()
        val is24 = DateFormat.is24HourFormat(context)
        canvas.drawColor(Color.BLACK)

        // Hora (también en la pantalla siempre activa)
        val hour = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        big.textSize = r * 0.66f
        big.textAlign = Paint.Align.RIGHT
        big.color = if (ambient) dimmed(accent) else accent
        canvas.drawText(hour, cx - r * 0.05f, cy + r * 0.23f, big)
        big.textAlign = Paint.Align.LEFT
        big.color = if (ambient) Color.LTGRAY else minuteColor
        canvas.drawText("%02d".format(t.minute), cx + r * 0.05f, cy + r * 0.23f, big)
        fill.color = if (ambient) Color.GRAY else Color.rgb(200, 200, 200)
        canvas.drawCircle(cx, cy - r * 0.06f, r * 0.024f, fill)
        canvas.drawCircle(cx, cy + r * 0.12f, r * 0.024f, fill)

        if (ambient && minimal) return

        // Marcas de minutos y la estela roja de los segundos
        for (i in 0 until 60) {
            canvas.save()
            canvas.rotate(i * 6f, cx, cy)
            val five = i % 5 == 0
            if (five || !ambient) {
                stroke.color = if (five) (if (ambient) Color.GRAY else tickColor) else Color.rgb(110, 110, 110)
                stroke.strokeWidth = r * (if (five) 0.022f else 0.008f)
                canvas.drawLine(cx, cy - r * 0.965f, cx, cy - r * (if (five) 0.90f else 0.935f), stroke)
            }
            canvas.restore()
        }
        if (!ambient) {
            stroke.strokeCap = Paint.Cap.BUTT
            stroke.strokeWidth = r * 0.035f
            val end = t.second * 6f - 90f
            stroke.shader = null
            for (k in 0 until 6) {
                stroke.color = Color.argb(255 - k * 40, 230, 20, 20)
                canvas.drawArc(RectF(cx - r * 0.93f, cy - r * 0.93f, cx + r * 0.93f, cy + r * 0.93f), end - (k + 1) * 4f, 4f, false, stroke)
            }
            stroke.strokeCap = Paint.Cap.ROUND
        }

        // Fecha: 15 NOV MIÉ
        val mon = t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        val day = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        text.textSize = r * 0.15f
        text.color = if (ambient) Color.LTGRAY else accent
        canvas.drawText("${t.dayOfMonth} $mon $day", cx, cy - r * 0.66f, text)
        if (ambient) return

        Brand.draw(canvas, cx, cy - r * 0.585f, r * 0.03f, Color.rgb(110, 110, 110))
        divider(canvas, cx, cy - r * 0.56f, r * 0.5f, r)

        // Eventos (si no hay, lo dice)
        val eventType = complications.complicationSlots[EVENT]?.complicationData?.value?.type
        if (eventType == ComplicationType.NO_DATA || eventType == ComplicationType.EMPTY) {
            text.textSize = r * 0.07f
            text.color = Color.WHITE
            canvas.drawText("SIN EVENTOS PRÓXIMOS", cx, cy - r * 0.445f, text)
        }
        divider(canvas, cx, cy - r * 0.42f, r * 0.55f, r)

        // Luna, día del año, dato y semana
        drawMoon(canvas, cx - r * 0.62f, cy - r * 0.35f, r * 0.065f, t)
        text.textSize = r * 0.10f
        text.color = Color.rgb(200, 200, 200)
        canvas.drawText("DÍA ${t.dayOfYear}", cx - r * 0.30f, cy - r * 0.31f, text)
        val week = t.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
        text.textAlign = Paint.Align.LEFT
        text.textSize = r * 0.11f
        text.color = accent
        canvas.drawText("S.", cx + r * 0.42f, cy - r * 0.31f, text)
        val sw = text.measureText("S. ")
        text.color = Color.rgb(200, 200, 200)
        canvas.drawText(week.toString(), cx + r * 0.42f + sw, cy - r * 0.31f, text)
        text.textAlign = Paint.Align.CENTER

        // Batería: rayo, número y barra
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val bx = cx - r * 0.75f
        drawBolt(canvas, bx, cy - r * 0.14f, r * 0.06f, if (battery?.isCharging == true) Color.rgb(80, 220, 60) else Color.rgb(60, 140, 50))
        if (pct >= 0) {
            text.textSize = r * 0.12f
            text.color = Color.WHITE
            canvas.drawText(pct.toString(), bx, cy + r * 0.05f, text)
            stroke.strokeWidth = r * 0.03f
            stroke.color = Color.rgb(50, 50, 60)
            canvas.drawLine(bx - r * 0.09f, cy + r * 0.12f, bx + r * 0.09f, cy + r * 0.12f, stroke)
            stroke.color = Color.rgb(40, 130, 255)
            canvas.drawLine(bx - r * 0.09f, cy + r * 0.12f, bx - r * 0.09f + r * 0.18f * pct / 100f, cy + r * 0.12f, stroke)
        }

        // Segundos, zona horaria y AM/PM
        text.textSize = r * 0.17f
        text.color = accent
        canvas.drawText("%02d".format(t.second), cx + r * 0.73f, cy - r * 0.03f, text)
        text.textSize = r * 0.075f
        text.color = Color.WHITE
        canvas.drawText(t.format(DateTimeFormatter.ofPattern("zzz", loc)).take(5), cx + r * 0.73f, cy + r * 0.07f, text)
        if (!is24) {
            text.textSize = r * 0.06f
            canvas.drawText(if (t.hour < 12) "AM" else "PM", cx, cy - r * 0.13f, text)
        }

        divider(canvas, cx, cy + r * 0.31f, r * 0.62f, r)

        // Ritmo cardíaco, «PASOS» y clima
        val hr = complications.textOf(HEART, context.resources) ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        text.textSize = r * 0.13f
        text.color = Color.WHITE
        canvas.drawText(hr, cx - r * 0.56f, cy + r * 0.46f, text)
        drawHeart(canvas, cx - r * 0.36f, cy + r * 0.42f, r * 0.055f)
        text.textSize = r * 0.12f
        text.color = Color.rgb(200, 200, 200)
        canvas.drawText("PASOS", cx - r * 0.02f, cy + r * 0.46f, text)
        val weatherType = complications.complicationSlots[WEATHER]?.complicationData?.value?.type
        if (weatherType == ComplicationType.NO_DATA || weatherType == ComplicationType.EMPTY) {
            text.textSize = r * 0.05f
            text.color = Color.GRAY
            canvas.drawText("Clima: elige", cx + r * 0.42f, cy + r * 0.42f, text)
            canvas.drawText("en Personalizar", cx + r * 0.42f, cy + r * 0.48f, text)
        }
        divider(canvas, cx, cy + r * 0.52f, r * 0.62f, r)

        // Pasos y distancia (pasos × 0,75 m)
        val stepsText = complications.textOf(STEPS, context.resources)
        text.textSize = r * 0.17f
        text.color = Color.WHITE
        canvas.drawText(stepsText ?: "--", cx, cy + r * 0.70f, text)
        val steps = stepsText?.filter { it.isDigit() }?.toLongOrNull()
        if (steps != null) {
            text.textSize = r * 0.08f
            text.color = Color.rgb(60, 150, 255)
            canvas.drawText(String.format(loc, "%.1f KM", steps * 0.75 / 1000.0), cx, cy + r * 0.81f, text)
        }

        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled && slot.id != HEART && slot.id != STEPS) slot.render(canvas, zonedDateTime, renderParameters)
        }

        // Accesos (PulsoMedia, PulsoMusic…)
        Shortcuts.drawAll(canvas, context, Config.spots, cx, cy, r, r * 0.055f, accent, false)
    }

    private fun dimmed(c: Int) = Color.argb(220, (Color.red(c) + 128) / 2, (Color.green(c) + 128) / 2, (Color.blue(c) + 128) / 2)

    /** Fase de la luna (desde una luna nueva conocida: 6 ene 2000) */
    private fun drawMoon(canvas: Canvas, x: Float, y: Float, s: Float, t: ZonedDateTime) {
        val days = (t.toInstant().epochSecond - 947182440L) / 86400.0
        val phase = ((days % 29.530588853) + 29.530588853) % 29.530588853 / 29.530588853
        val lit = ((1 - cos(2 * Math.PI * phase)) / 2).toFloat()
        fill.color = Color.rgb(230, 230, 220)
        canvas.drawCircle(x, y, s, fill)
        // Sombra que se corre: creciente (derecha iluminada) o menguante
        fill.color = Color.BLACK
        val dir = if (phase < 0.5) -1f else 1f
        canvas.drawCircle(x + dir * 2f * s * lit, y, s * 1.02f, fill)
    }

    private fun drawBolt(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x + s * 0.3f, y - s)
        path.lineTo(x - s * 0.55f, y + s * 0.15f)
        path.lineTo(x - s * 0.05f, y + s * 0.15f)
        path.lineTo(x - s * 0.3f, y + s)
        path.lineTo(x + s * 0.55f, y - s * 0.2f)
        path.lineTo(x + s * 0.05f, y - s * 0.2f)
        path.close()
        canvas.drawPath(path, fill)
    }

    private fun drawHeart(canvas: Canvas, x: Float, y: Float, s: Float) {
        path.reset()
        path.moveTo(x, y + s * 0.9f)
        path.cubicTo(x - s * 1.6f, y - s * 0.1f, x - s * 0.8f, y - s * 1.3f, x, y - s * 0.45f)
        path.cubicTo(x + s * 0.8f, y - s * 1.3f, x + s * 1.6f, y - s * 0.1f, x, y + s * 0.9f)
        path.close()
        fill.color = Color.rgb(235, 30, 50)
        canvas.drawPath(path, fill)
        stroke.color = Color.WHITE
        stroke.strokeWidth = s * 0.14f
        path.reset()
        path.moveTo(x - s * 0.8f, y)
        path.lineTo(x - s * 0.3f, y)
        path.lineTo(x - s * 0.1f, y - s * 0.4f)
        path.lineTo(x + s * 0.15f, y + s * 0.35f)
        path.lineTo(x + s * 0.35f, y)
        path.lineTo(x + s * 0.8f, y)
        canvas.drawPath(path, stroke)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: InfoAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
