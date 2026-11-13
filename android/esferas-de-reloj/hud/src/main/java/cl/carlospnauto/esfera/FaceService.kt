package cl.carlospnauto.esfera

import android.content.Context
import cl.carlospnauto.esfera.comun.Smooth
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
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
import androidx.wear.watchface.complications.rendering.ComplicationStyle
import androidx.wear.watchface.style.CurrentUserStyleRepository
import cl.carlospnauto.esfera.comun.Action
import cl.carlospnauto.esfera.comun.Brand
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Spot
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

private const val TOP = 101
private const val RIGHT = 102
private const val LOW = 103

private val CYAN = Color.rgb(40, 200, 255)
private val ORANGE = Color.rgb(255, 92, 40)
private val INK = Color.rgb(235, 240, 245)

/** Punto en el bisel (grados desde las 12, en sentido del reloj) */
private fun bezel(deg: Float, rad: Float = 0.935f) =
    Math.toRadians(deg.toDouble()).let { (sin(it) * rad).toFloat() to (-cos(it) * rad).toFloat() }

private fun spot(deg: Float, a: Action, name: String) = bezel(deg).let { (x, y) -> Spot(x, y, a, name) }

/** Centro y radio de cada círculo de datos (fracciones del radio) */
private val CIRCLES = mapOf(TOP to Triple(0f, -0.47f, 0.15f), RIGHT to Triple(0.40f, -0.38f, 0.12f), LOW to Triple(0.40f, 0.42f, 0.10f))

/** Lo que cambia Personalizar: los 6 accesos del bisel y los 3 círculos de datos */
object Config : FaceConfig {
    override val slots = listOf(TOP to "Círculo de arriba", RIGHT to "Círculo derecho", LOW to "Círculo de abajo")
    override val spots = listOf(
        spot(330f, Action.MEDIA, "Bisel 11 h"),
        spot(30f, Action.MUSIC, "Bisel 1 h"),
        spot(300f, Action.ALARMS, "Bisel 10 h"),
        spot(60f, Action.TIMER, "Bisel 2 h"),
        spot(240f, Action.SETTINGS, "Bisel 8 h"),
        spot(120f, Action.MUSIC, "Bisel 4 h"),
    )
    override val choices = listOf(Smooth.CHOICE)
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener ->
            val d = ComplicationDrawable(this)
            for ((i, s) in listOf(d.activeStyle, d.ambientStyle).withIndex()) {
                val ambient = i == 1
                s.backgroundColor = Color.TRANSPARENT
                s.borderStyle = ComplicationStyle.BORDER_STYLE_NONE
                s.textColor = if (ambient) Color.LTGRAY else INK
                s.titleColor = if (ambient) Color.GRAY else Color.rgb(150, 160, 170)
                s.iconColor = if (ambient) Color.LTGRAY else ORANGE
                s.rangedValuePrimaryColor = if (ambient) Color.LTGRAY else CYAN
                s.rangedValueSecondaryColor = Color.rgb(30, 45, 55)
            }
            CanvasComplicationDrawable(d, watchState, listener)
        }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE, ComplicationType.SMALL_IMAGE)
        val defaults = mapOf(
            // El ritmo cardíaco lo da Samsung Health o Google: se elige en Personalizar
            TOP to DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
            RIGHT to DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_SUNRISE_SUNSET, ComplicationType.SHORT_TEXT),
            LOW to DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_UNREAD_NOTIFICATION_COUNT, ComplicationType.SHORT_TEXT),
        )
        val slots = CIRCLES.map { (id, c) ->
            val half = c.third * 0.5f * 0.74f
            val x = 0.5f + c.first * 0.5f
            val y = 0.5f + c.second * 0.5f
            ComplicationSlot.createRoundRectComplicationSlotBuilder(
                id, factory, types, defaults.getValue(id),
                ComplicationSlotBounds(RectF(x - half, y - half, x + half, y + half)),
            ).build()
        }
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = HudRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos, 0.09f)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class HudAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Panel de instrumentos: hora grande con brillo, batería (arco cian) y segundos (arco naranja) */
class HudRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<HudAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = HudAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }
    private val battery = context.getSystemService(BatteryManager::class.java)
    var lastBounds = Rect()
        private set

    private fun oval(cx: Float, cy: Float, rad: Float) = RectF(cx - rad, cy - rad, cx + rad, cy + rad)

    /** Arco en segmentos: from/to en grados desde las 12; los primeros «lit» encendidos */
    private fun segments(canvas: Canvas, cx: Float, cy: Float, rad: Float, w: Float, from: Float, to: Float, n: Int, lit: Int, color: Int, ambient: Boolean, partial: Float = 0f) {
        val step = (to - from) / n
        val o = oval(cx, cy, rad)
        stroke.strokeWidth = w
        stroke.strokeCap = Paint.Cap.BUTT
        for (i in 0 until n) {
            val on = i < lit
            if (ambient && !on) continue
            stroke.color = if (on) color else Color.argb(70, Color.red(color), Color.green(color), Color.blue(color))
            if (on && !ambient) stroke.setShadowLayer(w * 0.6f, 0f, 0f, color) else stroke.clearShadowLayer()
            canvas.drawArc(o, from + i * step - 90f, step * 0.72f, false, stroke)
            // El segmento que se está llenando (segundero suave)
            if (i == lit && partial > 0.02f && !ambient) {
                stroke.color = color
                stroke.setShadowLayer(w * 0.6f, 0f, 0f, color)
                canvas.drawArc(o, from + i * step - 90f, step * 0.72f * partial, false, stroke)
                stroke.clearShadowLayer()
            }
        }
        stroke.clearShadowLayer()
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: HudAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        interactiveDrawModeUpdateDelayMillis = Smooth.delay(context)
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        canvas.drawColor(Color.BLACK)

        // Bisel metálico con muescas
        if (!ambient) {
            fill.shader = RadialGradient(cx, cy, r, intArrayOf(Color.rgb(20, 22, 24), Color.rgb(58, 60, 64), Color.rgb(30, 31, 33)), floatArrayOf(0.86f, 0.95f, 1f), Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, fill)
            fill.shader = null
            fill.color = Color.BLACK
            canvas.drawCircle(cx, cy, r * 0.875f, fill)
            stroke.strokeCap = Paint.Cap.ROUND
            stroke.color = Color.rgb(95, 98, 104)
            stroke.strokeWidth = r * 0.01f
            for (k in 0 until 24) {
                if (k % 2 == 0) continue
                canvas.save()
                canvas.rotate(k * 15f, cx, cy)
                canvas.drawLine(cx, cy - r * 0.965f, cx, cy - r * 0.925f, stroke)
                canvas.restore()
            }
        }

        // Anillos finos cian (izquierda) y naranja (derecha) con rayitas
        stroke.strokeCap = Paint.Cap.BUTT
        stroke.strokeWidth = r * 0.012f
        stroke.color = if (ambient) Color.GRAY else CYAN
        canvas.drawArc(oval(cx, cy, r * 0.855f), 182f - 90f + 0f, 176f, false, stroke)
        stroke.color = if (ambient) Color.GRAY else ORANGE
        canvas.drawArc(oval(cx, cy, r * 0.855f), 2f - 90f, 176f, false, stroke)
        if (!ambient) {
            for (k in 0 until 120) {
                canvas.save()
                canvas.rotate(k * 3f, cx, cy)
                stroke.color = if (k < 60) Color.argb(160, 255, 92, 40) else Color.argb(160, 40, 200, 255)
                stroke.strokeWidth = r * (if (k % 5 == 0) 0.008f else 0.004f)
                canvas.drawLine(cx, cy - r * 0.84f, cx, cy - r * (if (k % 5 == 0) 0.80f else 0.815f), stroke)
                canvas.restore()
            }
            // Marca de las 12
            fill.color = CYAN
            val p = android.graphics.Path()
            p.moveTo(cx, cy - r * 0.79f)
            p.lineTo(cx - r * 0.025f, cy - r * 0.87f)
            p.lineTo(cx + r * 0.025f, cy - r * 0.87f)
            p.close()
            canvas.drawPath(p, fill)
        }

        // Batería (izquierda, de abajo hacia arriba) y segundos (derecha, desde arriba)
        val pct = (battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1).coerceIn(-1, 100)
        val n = 24
        segments(canvas, cx, cy, r * 0.74f, r * 0.05f, 200f, 340f, n, if (pct < 0) 0 else (pct * n + 50) / 100, CYAN, ambient)
        if (!ambient) {
            val f = Smooth.seconds(context, zonedDateTime) / 60f * n
            segments(canvas, cx, cy, r * 0.74f, r * 0.05f, 20f, 160f, n, f.toInt(), ORANGE, false, f - f.toInt())
        }
        stroke.color = if (ambient) Color.DKGRAY else Color.rgb(30, 60, 75)
        stroke.strokeWidth = r * 0.008f
        canvas.drawCircle(cx, cy, r * 0.69f, stroke)

        // Círculos de datos
        for ((id, c) in CIRCLES) {
            val x = cx + c.first * r
            val y = cy + c.second * r
            val rr = c.third * r
            fill.color = Color.BLACK
            canvas.drawCircle(x, y, rr, fill)
            stroke.color = if (ambient) Color.GRAY else CYAN
            stroke.strokeWidth = r * 0.014f
            if (!ambient) stroke.setShadowLayer(r * 0.02f, 0f, 0f, CYAN)
            canvas.drawCircle(x, y, rr, stroke)
            stroke.clearShadowLayer()
            val type = complications.complicationSlots[id]?.complicationData?.value?.type
            if (type == ComplicationType.NO_DATA || type == ComplicationType.EMPTY) {
                text.textSize = r * 0.04f
                text.color = Color.GRAY
                canvas.drawText("Elige en", x, y - r * 0.005f, text)
                canvas.drawText("Personalizar", x, y + r * 0.04f, text)
            }
        }

        // Batería con número
        val bx = cx - r * 0.40f
        val by = cy - r * 0.36f
        if (pct >= 0) {
            fill.color = if (ambient) Color.GRAY else ORANGE
            canvas.drawRect(bx - r * 0.022f, by - r * 0.13f, bx + r * 0.022f, by - r * 0.07f, fill)
            canvas.drawRect(bx - r * 0.008f, by - r * 0.14f, bx + r * 0.008f, by - r * 0.13f, fill)
            text.textSize = r * 0.11f
            text.color = if (ambient) Color.LTGRAY else INK
            canvas.drawText("$pct%", bx, by + r * 0.03f, text)
            text.textSize = r * 0.06f
            text.color = Color.GRAY
            canvas.drawText("BAT", bx, by + r * 0.10f, text)
        }

        // Hora
        val is24 = DateFormat.is24HourFormat(context)
        val time = zonedDateTime.format(DateTimeFormatter.ofPattern(if (is24) "HH:mm" else "h:mm"))
        text.textSize = r * 0.40f
        text.color = if (ambient) Color.LTGRAY else Color.WHITE
        if (!ambient) text.setShadowLayer(r * 0.05f, 0f, 0f, CYAN)
        canvas.drawText(time, cx, cy + r * 0.13f, text)
        text.clearShadowLayer()

        // Fecha: JUE 12 NOV
        val loc = Locale.getDefault()
        val day = zonedDateTime.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        val mon = zonedDateTime.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        val num = " ${zonedDateTime.dayOfMonth} "
        text.textSize = r * 0.11f
        val w1 = text.measureText(day)
        val w2 = text.measureText(num)
        val w3 = text.measureText(mon)
        var x = cx - (w1 + w2 + w3) / 2
        val y = cy + r * 0.31f
        text.textAlign = Paint.Align.LEFT
        text.color = if (ambient) Color.GRAY else ORANGE
        canvas.drawText(day, x, y, text)
        x += w1
        text.color = if (ambient) Color.LTGRAY else INK
        canvas.drawText(num, x, y, text)
        x += w2
        text.color = if (ambient) Color.GRAY else ORANGE
        canvas.drawText(mon, x, y, text)
        text.textAlign = Paint.Align.CENTER

        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.render(canvas, zonedDateTime, renderParameters)
        }

        // Accesos del bisel (PulsoMedia, PulsoMusic, alarmas…) y la marca
        for ((i, s) in Config.spots.withIndex()) {
            val tint = if (i % 2 == 0) CYAN else ORANGE
            Shortcuts.draw(canvas, context, Shortcuts.get(context, i, s), cx + s.x * r, cy + s.y * r, r * 0.05f, if (ambient) Color.GRAY else tint, ambient)
        }
        Brand.draw(canvas, cx, cy + r * 0.585f, r * 0.036f, if (ambient) Color.DKGRAY else Color.rgb(120, 130, 140))
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: HudAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
