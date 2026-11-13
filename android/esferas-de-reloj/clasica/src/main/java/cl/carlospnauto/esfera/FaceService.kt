package cl.carlospnauto.esfera

import android.content.Context
import cl.carlospnauto.esfera.comun.Smooth
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
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
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
import kotlin.math.cos
import kotlin.math.min

private const val HUMIDITY = 101
private const val WEATHER = 102
private const val UV = 103
private const val TEMP = 104
private const val EVENT = 105
private const val WORLD = 106
private const val HEART = 107
private const val STEPS = 108

/** 8 temas: fondo y tinta (el número del día va en una caja de tinta) */
private val THEMES = listOf(
    "Negro" to 0, "Blanco" to 1, "Grafito" to 2, "Azul noche" to 3,
    "Verde militar" to 4, "Arena" to 5, "Rojo vino" to 6, "Celeste" to 7,
)
private val PALETTE = listOf(
    Color.BLACK to Color.rgb(242, 242, 242),
    Color.rgb(244, 244, 242) to Color.rgb(17, 17, 17),
    Color.rgb(43, 45, 48) to Color.rgb(240, 240, 240),
    Color.rgb(15, 35, 64) to Color.rgb(232, 240, 255),
    Color.rgb(47, 58, 36) to Color.rgb(233, 238, 220),
    Color.rgb(230, 220, 198) to Color.rgb(42, 36, 24),
    Color.rgb(74, 14, 22) to Color.rgb(247, 233, 234),
    Color.rgb(220, 235, 245) to Color.rgb(14, 34, 53),
)
private val THEME = Choice("tema", "Tema", THEMES)
private val AOD = Choice("aod", "Pantalla siempre activa", listOf("Bajo consumo" to 0, "Completa" to 1))

object Config : FaceConfig {
    override val slots = listOf(
        HUMIDITY to "Arriba a la izquierda (humedad)", WEATHER to "Arriba al centro (clima)", UV to "Arriba a la derecha (UV)",
        TEMP to "Temperatura (mín. / actual / máx.)", EVENT to "Evento", WORLD to "Hora mundial", HEART to "Ritmo cardíaco", STEPS to "Pasos",
    )
    override val spots = listOf(
        Spot(-0.45f, 0.0f, Action.MEDIA, "Toque en la hora", hit = 0.24f),
        Spot(0.50f, 0.0f, Action.MUSIC, "Toque en los segundos", hit = 0.22f),
        Spot(0f, 0.79f, Action.BATTERY, "Toque en la batería", hit = 0.11f),
    )
    override val choices = listOf(THEME, AOD, Smooth.CHOICE)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener ->
            val d = ComplicationDrawable(this)
            for (s in listOf(d.activeStyle, d.ambientStyle)) {
                s.backgroundColor = Color.TRANSPARENT
                s.borderStyle = ComplicationStyle.BORDER_STYLE_NONE
            }
            CanvasComplicationDrawable(d, watchState, listener)
        }
        val short = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE, ComplicationType.SMALL_IMAGE)
        val none = DefaultComplicationDataSourcePolicy()
        fun slot(id: Int, types: List<ComplicationType>, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, types, policy, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            // El clima (humedad, estado, UV, temperaturas) lo dan Samsung o Google: se elige en Personalizar
            slot(HUMIDITY, short, none, RectF(0.29f, 0.08f, 0.41f, 0.20f)),
            slot(WEATHER, short, none, RectF(0.44f, 0.08f, 0.56f, 0.20f)),
            slot(UV, short, none, RectF(0.58f, 0.08f, 0.70f, 0.20f)),
            slot(TEMP, listOf(ComplicationType.RANGED_VALUE, ComplicationType.SHORT_TEXT), none, RectF(0.25f, 0.21f, 0.75f, 0.27f)),
            slot(EVENT, listOf(ComplicationType.LONG_TEXT, ComplicationType.SHORT_TEXT), DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_NEXT_EVENT, ComplicationType.LONG_TEXT), RectF(0.21f, 0.625f, 0.79f, 0.685f)),
            slot(WORLD, listOf(ComplicationType.SHORT_TEXT), DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_WORLD_CLOCK, ComplicationType.SHORT_TEXT), RectF(0.24f, 0.70f, 0.36f, 0.81f)),
            slot(HEART, listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE), none, RectF(0.44f, 0.70f, 0.56f, 0.81f)),
            slot(STEPS, listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE), DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.62f, 0.70f, 0.76f, 0.81f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = ClassicRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class ClassicAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Esfera clásica de información: clima arriba, fecha, hora con segundos, evento, hora mundial, ritmo, pasos y batería */
class ClassicRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<ClassicAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = ClassicAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif", Typeface.NORMAL)
    }
    private val time = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
        textScaleX = 0.82f
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

    private fun data(id: Int): ComplicationData? = complications.complicationSlots[id]?.complicationData?.value

    private fun empty(id: Int) = data(id)?.type.let { it == null || it == ComplicationType.NO_DATA || it == ComplicationType.EMPTY }

    private fun textOf(id: Int): String? {
        val now = Instant.now()
        val t = when (val d = data(id)) {
            is ShortTextComplicationData -> d.text.getTextAt(context.resources, now)
            is LongTextComplicationData -> d.text.getTextAt(context.resources, now)
            is RangedValueComplicationData -> d.text?.getTextAt(context.resources, now) ?: d.value.toInt().toString()
            else -> null
        }
        return t?.toString()?.takeIf { it.isNotBlank() }
    }

    private fun titleOf(id: Int): String? {
        val t = when (val d = data(id)) {
            is ShortTextComplicationData -> d.title?.getTextAt(context.resources, Instant.now())
            else -> null
        }
        return t?.toString()?.takeIf { it.isNotBlank() }
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ClassicAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        interactiveDrawModeUpdateDelayMillis = Smooth.delay(context)
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val t = zonedDateTime
        val (bg, ink) = if (ambient) Color.BLACK to Color.rgb(200, 200, 200) else PALETTE[Choices.index(context, THEME)]
        val lowPower = ambient && Choices.value(context, AOD) == 0
        val loc = Locale.getDefault()
        val is24 = DateFormat.is24HourFormat(context)
        canvas.drawColor(Color.BLACK)
        fill.color = bg
        canvas.drawCircle(cx, cy, r, fill)

        // Colores de los datos que dibuja el sistema (ícono del clima, humedad, UV)
        for ((_, slot) in complications.complicationSlots) {
            val d = (slot.renderer as? CanvasComplicationDrawable)?.drawable ?: continue
            for (s in listOf(d.activeStyle, d.ambientStyle)) {
                if (s.textColor != ink) {
                    s.textColor = ink
                    s.titleColor = ink
                    s.iconColor = ink
                    s.rangedValuePrimaryColor = ink
                    s.rangedValueSecondaryColor = Color.argb(60, Color.red(ink), Color.green(ink), Color.blue(ink))
                }
            }
        }

        // Marcas: rayitas cada minuto y triángulos cada 5
        if (!lowPower) {
            for (i in 0 until 60) {
                canvas.save()
                canvas.rotate(i * 6f, cx, cy)
                if (i % 5 == 0) {
                    fill.color = ink
                    path.reset()
                    path.moveTo(cx - r * 0.025f, cy - r * 0.975f)
                    path.lineTo(cx + r * 0.025f, cy - r * 0.975f)
                    path.lineTo(cx, cy - r * 0.905f)
                    path.close()
                    canvas.drawPath(path, fill)
                } else if (!ambient) {
                    stroke.color = ink
                    stroke.strokeWidth = r * 0.008f
                    canvas.drawLine(cx, cy - r * 0.975f, cx, cy - r * (if (i % 5 == 0) 0.90f else 0.93f), stroke)
                }
                canvas.restore()
            }
        }

        // Hora (con segundos fuera del modo de bajo consumo)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        val clock = if (ambient) "$h:%02d".format(t.minute) else "$h:%02d:%02d".format(t.minute, t.second)
        time.textSize = r * (if (ambient) 0.50f else 0.42f)
        time.color = ink
        if (lowPower) {
            time.style = Paint.Style.STROKE
            time.strokeWidth = r * 0.008f
        }
        canvas.drawText(clock, cx, cy + r * 0.15f, time)
        time.style = Paint.Style.FILL

        // Fecha: SÁBADO MAR [28] [AM]
        val day = t.dayOfWeek.getDisplayName(TextStyle.FULL, loc).uppercase(loc)
        val mon = t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        text.textSize = r * 0.085f
        text.color = ink
        canvas.drawText(day, cx - r * 0.38f, cy - r * 0.28f, text)
        canvas.drawText(mon, cx - r * 0.01f, cy - r * 0.28f, text)
        val box = RectF(cx + r * 0.20f, cy - r * 0.37f, cx + r * 0.38f, cy - r * 0.25f)
        fill.color = ink
        canvas.drawRoundRect(box, r * 0.02f, r * 0.02f, fill)
        text.color = bg
        text.typeface = Typeface.create("sans-serif", Typeface.BOLD)
        canvas.drawText(t.dayOfMonth.toString(), box.centerX(), cy - r * 0.28f, text)
        text.typeface = Typeface.create("sans-serif", Typeface.NORMAL)
        text.color = ink
        if (!is24) {
            val am = RectF(cx + r * 0.45f, cy - r * 0.37f, cx + r * 0.72f, cy - r * 0.25f)
            stroke.color = ink
            stroke.strokeWidth = r * 0.012f
            canvas.drawRoundRect(am, r * 0.025f, r * 0.025f, stroke)
            canvas.drawText(if (t.hour < 12) "AM" else "PM", am.centerX(), cy - r * 0.28f, text)
        }
        if (lowPower) return

        // Arriba: humedad, clima y UV (o lo que elijas); sin dato, el ícono con «--»
        text.textSize = r * 0.07f
        if (empty(HUMIDITY)) {
            drawDrop(canvas, cx - r * 0.30f, cy - r * 0.77f, r * 0.035f, ink)
            canvas.drawText("--%", cx - r * 0.30f, cy - r * 0.64f, text)
        }
        if (empty(WEATHER)) drawSun(canvas, cx, cy - r * 0.72f, r * 0.045f, ink)
        if (empty(UV)) {
            canvas.drawText("UV", cx + r * 0.28f, cy - r * 0.74f, text)
            canvas.drawText("--", cx + r * 0.28f, cy - r * 0.64f, text)
        }

        // Temperaturas: mín ▼ actual ▲ máx
        val tr = data(TEMP) as? RangedValueComplicationData
        val cur = textOf(TEMP) ?: "--"
        val lo = tr?.let { "${it.min.toInt()}°" } ?: "--°"
        val hi = tr?.let { "${it.max.toInt()}°" } ?: "--°"
        text.textSize = r * 0.09f
        canvas.drawText(lo, cx - r * 0.44f, cy - r * 0.48f, text)
        canvas.drawText(cur, cx, cy - r * 0.48f, text)
        canvas.drawText(hi, cx + r * 0.44f, cy - r * 0.48f, text)
        triangle(canvas, cx - r * 0.24f, cy - r * 0.51f, r * 0.025f, down = true, color = ink)
        triangle(canvas, cx + r * 0.24f, cy - r * 0.51f, r * 0.025f, down = false, color = ink)

        // Línea fina bajo la fecha
        stroke.color = Color.argb(70, Color.red(ink), Color.green(ink), Color.blue(ink))
        stroke.strokeWidth = r * 0.006f
        canvas.drawLine(cx - r * 0.5f, cy - r * 0.42f, cx + r * 0.5f, cy - r * 0.42f, stroke)

        if (ambient) return

        // Marca
        Brand.draw(canvas, cx, cy + r * 0.215f, r * 0.03f, Color.argb(130, Color.red(ink), Color.green(ink), Color.blue(ink)))

        // Evento en su recuadro, con el calendario a la izquierda y la luna a la derecha
        val ev = RectF(cx - r * 0.57f, cy + r * 0.25f, cx + r * 0.57f, cy + r * 0.37f)
        stroke.color = ink
        stroke.strokeWidth = r * 0.01f
        canvas.drawRoundRect(ev, r * 0.025f, r * 0.025f, stroke)
        text.textSize = r * 0.07f
        val event = textOf(EVENT) ?: "SIN EVENTOS"
        canvas.drawText(event.uppercase(loc).take(26), cx, cy + r * 0.335f, text)
        drawCalendar(canvas, cx - r * 0.69f, cy + r * 0.31f, r * 0.04f, t.dayOfMonth, ink, bg)
        drawMoon(canvas, cx + r * 0.69f, cy + r * 0.31f, r * 0.045f, t, ink, bg)

        // Hora mundial, ritmo y pasos
        val world = textOf(WORLD) ?: "--"
        val city = titleOf(WORLD) ?: "MUNDO"
        val hr = textOf(HEART) ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        val steps = textOf(STEPS) ?: "--"
        text.textSize = r * 0.09f
        canvas.drawText(world, cx - r * 0.40f, cy + r * 0.49f, text)
        canvas.drawText(hr, cx, cy + r * 0.49f, text)
        canvas.drawText(steps, cx + r * 0.38f, cy + r * 0.49f, text)
        text.textSize = r * 0.06f
        canvas.drawText(city.uppercase(loc).take(6), cx - r * 0.40f, cy + r * 0.60f, text)
        drawHeart(canvas, cx, cy + r * 0.575f, r * 0.03f, ink)
        canvas.drawText("PASOS", cx + r * 0.38f, cy + r * 0.60f, text)

        stroke.color = Color.argb(70, Color.red(ink), Color.green(ink), Color.blue(ink))
        stroke.strokeWidth = r * 0.006f
        canvas.drawLine(cx - r * 0.45f, cy + r * 0.68f, cx + r * 0.45f, cy + r * 0.68f, stroke)

        // Batería
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        fill.color = ink
        val bx = cx - r * 0.10f
        val by = cy + r * 0.79f
        canvas.drawRoundRect(RectF(bx - r * 0.02f, by - r * 0.05f, bx + r * 0.02f, by + r * 0.01f), r * 0.006f, r * 0.006f, fill)
        canvas.drawRect(bx - r * 0.008f, by - r * 0.058f, bx + r * 0.008f, by - r * 0.05f, fill)
        text.textSize = r * 0.08f
        canvas.drawText(if (pct >= 0) "$pct%" else "--", cx + r * 0.05f, by + r * 0.01f, text)

        // Segundos: triángulo rojo que recorre el borde
        canvas.save()
        canvas.rotate(Smooth.seconds(context, t) * 6f, cx, cy)
        fill.color = Color.rgb(230, 30, 30)
        path.reset()
        path.moveTo(cx - r * 0.022f, cy - r * 0.975f)
        path.lineTo(cx + r * 0.022f, cy - r * 0.975f)
        path.lineTo(cx, cy - r * 0.915f)
        path.close()
        canvas.drawPath(path, fill)
        canvas.restore()

        for ((id, slot) in complications.complicationSlots) {
            if (slot.enabled && id in listOf(HUMIDITY, WEATHER, UV) && !empty(id)) slot.render(canvas, zonedDateTime, renderParameters)
        }

        // Accesos invisibles (hora → PulsoMedia, segundos → PulsoMusic, batería)
    }

    private fun triangle(canvas: Canvas, x: Float, y: Float, s: Float, down: Boolean, color: Int) {
        fill.color = color
        path.reset()
        if (down) {
            path.moveTo(x - s, y - s * 0.6f); path.lineTo(x + s, y - s * 0.6f); path.lineTo(x, y + s * 0.8f)
        } else {
            path.moveTo(x - s, y + s * 0.6f); path.lineTo(x + s, y + s * 0.6f); path.lineTo(x, y - s * 0.8f)
        }
        path.close()
        canvas.drawPath(path, fill)
    }

    private fun drawDrop(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x, y - s * 1.3f)
        path.cubicTo(x + s * 0.4f, y - s * 0.5f, x + s, y, x + s, y + s * 0.35f)
        path.cubicTo(x + s, y + s * 1.0f, x - s, y + s * 1.0f, x - s, y + s * 0.35f)
        path.cubicTo(x - s, y, x - s * 0.4f, y - s * 0.5f, x, y - s * 1.3f)
        path.close()
        canvas.drawPath(path, fill)
    }

    private fun drawSun(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawCircle(x, y, s * 0.7f, fill)
        stroke.color = color
        stroke.strokeWidth = s * 0.22f
        for (k in 0 until 8) {
            canvas.save()
            canvas.rotate(k * 45f, x, y)
            canvas.drawLine(x, y - s * 1.05f, x, y - s * 1.5f, stroke)
            canvas.restore()
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

    private fun drawCalendar(canvas: Canvas, x: Float, y: Float, s: Float, day: Int, ink: Int, bg: Int) {
        fill.color = ink
        canvas.drawRoundRect(RectF(x - s, y - s, x + s, y + s), s * 0.2f, s * 0.2f, fill)
        text.color = bg
        val old = text.textSize
        text.textSize = s * 1.2f
        canvas.drawText(day.toString(), x, y + s * 0.6f, text)
        text.textSize = old
        text.color = ink
    }

    /** Fase de la luna (desde una luna nueva conocida: 6 ene 2000) */
    private fun drawMoon(canvas: Canvas, x: Float, y: Float, s: Float, t: ZonedDateTime, ink: Int, bg: Int) {
        val days = (t.toInstant().epochSecond - 947182440L) / 86400.0
        val phase = ((days % 29.530588853) + 29.530588853) % 29.530588853 / 29.530588853
        val lit = ((1 - cos(2 * Math.PI * phase)) / 2).toFloat()
        fill.color = ink
        canvas.drawCircle(x, y, s, fill)
        canvas.save()
        path.reset()
        path.addCircle(x, y, s, Path.Direction.CW)
        canvas.clipPath(path)
        fill.color = bg
        val dir = if (phase < 0.5) -1f else 1f
        canvas.drawCircle(x + dir * 2f * s * lit, y, s, fill)
        canvas.restore()
        stroke.color = ink
        stroke.strokeWidth = s * 0.12f
        canvas.drawCircle(x, y, s, stroke)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ClassicAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
