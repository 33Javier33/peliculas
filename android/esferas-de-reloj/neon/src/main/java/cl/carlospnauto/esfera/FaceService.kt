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
private const val LOW = 102

private val CYAN = Color.rgb(20, 235, 245)
private val PINK = Color.rgb(255, 40, 140)
private val PURPLE = Color.rgb(170, 60, 255)
private val ORANGE = Color.rgb(255, 100, 20)

/** Cuartos del anillo: desde (grados desde las 12) y color */
private val QUARTERS = listOf(270f to CYAN, 0f to PINK, 90f to PURPLE, 180f to ORANGE)

private fun spot(deg: Float, a: Action, name: String): Spot {
    val t = Math.toRadians(deg.toDouble())
    return Spot((sin(t) * 0.885).toFloat(), (-cos(t) * 0.885).toFloat(), a, name)
}

private fun colorAt(deg: Float) = QUARTERS.first { deg >= it.first && deg < it.first + 90f }.second

/** Lo que cambia Personalizar: los 8 accesos del anillo y los 2 datos */
object Config : FaceConfig {
    override val slots = listOf(TOP to "Círculo de arriba", LOW to "Dato de abajo a la derecha")
    override val spots = listOf(
        spot(330f, Action.MEDIA, "Anillo 11 h"),
        spot(30f, Action.MUSIC, "Anillo 1 h"),
        spot(300f, Action.ALARMS, "Anillo 10 h"),
        spot(60f, Action.TIMER, "Anillo 2 h"),
        spot(120f, Action.SETTINGS, "Anillo 4 h"),
        spot(150f, Action.MUSIC, "Anillo 5 h"),
        spot(210f, Action.MEDIA, "Anillo 7 h"),
        spot(240f, Action.ALARMS, "Anillo 8 h"),
    )
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
                s.titleColor = if (ambient) Color.GRAY else CYAN
                s.iconColor = if (ambient) Color.LTGRAY else CYAN
                s.rangedValuePrimaryColor = if (ambient) Color.LTGRAY else CYAN
                s.rangedValueSecondaryColor = Color.rgb(20, 50, 55)
            }
            CanvasComplicationDrawable(d, watchState, listener)
        }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE, ComplicationType.SMALL_IMAGE)
        val top = ComplicationSlot.createRoundRectComplicationSlotBuilder(
            TOP, factory, types,
            // El ritmo cardíaco lo da Samsung Health o Google: se elige en Personalizar
            DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_SUNRISE_SUNSET, ComplicationType.SHORT_TEXT),
            ComplicationSlotBounds(RectF(0.455f, 0.21f, 0.545f, 0.30f)),
        ).build()
        val low = ComplicationSlot.createRoundRectComplicationSlotBuilder(
            LOW, factory, types,
            DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
            ComplicationSlotBounds(RectF(0.57f, 0.75f, 0.73f, 0.80f)),
        ).build()
        return ComplicationSlotsManager(listOf(top, low), currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = NeonRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos, 0.09f)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class NeonAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Neón: cuatro arcos de colores que brillan, hora cian con borde rosa, fecha, año y batería */
class NeonRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<NeonAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = NeonAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    var lastBounds = Rect()
        private set

    private fun oval(cx: Float, cy: Float, rad: Float) = RectF(cx - rad, cy - rad, cx + rad, cy + rad)

    private fun glow(p: Paint, color: Int, r: Float, ambient: Boolean) {
        if (ambient) p.clearShadowLayer() else p.setShadowLayer(r * 0.04f, 0f, 0f, color)
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: NeonAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        canvas.drawColor(Color.BLACK)

        // Cuatro arcos (bandas con borde que brilla)
        for ((from, color) in QUARTERS) {
            val a0 = from + 2.5f - 90f
            val sweep = 85f
            path.reset()
            path.arcTo(oval(cx, cy, r * 0.975f), a0, sweep)
            path.arcTo(oval(cx, cy, r * 0.795f), a0 + sweep, -sweep)
            path.close()
            if (!ambient) {
                fill.color = Color.argb(38, Color.red(color), Color.green(color), Color.blue(color))
                canvas.drawPath(path, fill)
            }
            stroke.color = if (ambient) Color.argb(160, Color.red(color), Color.green(color), Color.blue(color)) else color
            stroke.strokeWidth = r * (if (ambient) 0.01f else 0.018f)
            glow(stroke, color, r, ambient)
            canvas.drawPath(path, stroke)
            stroke.clearShadowLayer()
        }

        // Anillo interior: cian a la izquierda y rosa a la derecha, con puntos
        stroke.strokeWidth = r * 0.012f
        for ((start, color) in listOf(185f to CYAN, 5f to PINK)) {
            stroke.color = if (ambient) Color.DKGRAY else color
            glow(stroke, color, r, ambient)
            canvas.drawArc(oval(cx, cy, r * 0.72f), start - 90f, 170f, false, stroke)
        }
        stroke.clearShadowLayer()
        if (!ambient) {
            for (k in 0 until 24) {
                val deg = k * 15f
                if (deg % 90f == 0f) continue
                val t = Math.toRadians(deg.toDouble())
                fill.color = if (deg < 180f) PINK else CYAN
                canvas.drawCircle(cx + (sin(t) * r * 0.66f).toFloat(), cy - (cos(t) * r * 0.66f).toFloat(), r * 0.012f, fill)
            }
        }

        // Líneas de circuito arriba y abajo de la hora
        if (!ambient) {
            stroke.strokeWidth = r * 0.008f
            stroke.color = Color.argb(170, 20, 235, 245)
            for (side in listOf(-1f, 1f)) {
                path.reset()
                path.moveTo(cx + side * r * 0.60f, cy - r * 0.08f)
                path.lineTo(cx + side * r * 0.60f, cy - r * 0.20f)
                path.lineTo(cx + side * r * 0.42f, cy - r * 0.24f)
                path.lineTo(cx + side * r * 0.20f, cy - r * 0.24f)
                canvas.drawPath(path, stroke)
                path.reset()
                path.moveTo(cx + side * r * 0.60f, cy + r * 0.05f)
                path.lineTo(cx + side * r * 0.60f, cy + r * 0.16f)
                path.lineTo(cx + side * r * 0.40f, cy + r * 0.18f)
                canvas.drawPath(path, stroke)
                fill.color = CYAN
                canvas.drawCircle(cx + side * r * 0.20f, cy - r * 0.24f, r * 0.014f, fill)
                canvas.drawCircle(cx + side * r * 0.40f, cy + r * 0.18f, r * 0.014f, fill)
            }
        }

        // Círculo de arriba
        stroke.strokeWidth = r * 0.014f
        stroke.color = if (ambient) Color.GRAY else CYAN
        glow(stroke, CYAN, r, ambient)
        canvas.drawCircle(cx, cy - r * 0.49f, r * 0.12f, stroke)
        stroke.clearShadowLayer()
        val topType = complications.complicationSlots[TOP]?.complicationData?.value?.type
        if (topType == ComplicationType.NO_DATA || topType == ComplicationType.EMPTY) {
            text.textSize = r * 0.035f
            text.color = Color.GRAY
            canvas.drawText("Personalizar", cx, cy - r * 0.48f, text)
        }

        // Marca
        Brand.draw(canvas, cx, cy - r * 0.30f, r * 0.034f, if (ambient) Color.DKGRAY else Color.rgb(110, 170, 175))

        // Hora: cian con borde rosa
        val is24 = DateFormat.is24HourFormat(context)
        val time = zonedDateTime.format(DateTimeFormatter.ofPattern(if (is24) "HH:mm" else "h:mm"))
        text.textSize = r * 0.36f
        if (ambient) {
            text.style = Paint.Style.STROKE
            text.strokeWidth = r * 0.008f
            text.color = Color.LTGRAY
            canvas.drawText(time, cx, cy + r * 0.12f, text)
        } else {
            text.style = Paint.Style.FILL
            text.color = CYAN
            text.setShadowLayer(r * 0.05f, 0f, 0f, CYAN)
            canvas.drawText(time, cx, cy + r * 0.12f, text)
            text.clearShadowLayer()
            text.style = Paint.Style.STROKE
            text.strokeWidth = r * 0.012f
            text.color = PINK
            canvas.drawText(time, cx, cy + r * 0.12f, text)
        }
        text.style = Paint.Style.FILL

        // Fecha: JUE 12 / NOV 2026
        val loc = Locale.getDefault()
        val day = zonedDateTime.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        val mon = zonedDateTime.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        text.textSize = r * 0.11f
        text.color = if (ambient) Color.LTGRAY else Color.WHITE
        canvas.drawText("$day ${zonedDateTime.dayOfMonth}", cx, cy + r * 0.29f, text)
        text.textSize = r * 0.10f
        text.color = if (ambient) Color.GRAY else Color.rgb(255, 130, 220)
        if (!ambient) text.setShadowLayer(r * 0.03f, 0f, 0f, PINK)
        canvas.drawText("$mon ${zonedDateTime.year}", cx, cy + r * 0.42f, text)
        text.clearShadowLayer()

        // Batería
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        if (pct in 0..100) {
            text.textSize = r * 0.08f
            text.color = if (ambient) Color.LTGRAY else Color.WHITE
            canvas.drawText("BAT $pct%", cx - r * 0.28f, cy + r * 0.575f, text)
        }

        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.render(canvas, zonedDateTime, renderParameters)
        }

        // Accesos del anillo (PulsoMedia, PulsoMusic, alarmas…), del color de su cuarto
        for ((i, s) in Config.spots.withIndex()) {
            val deg = ((Math.toDegrees(kotlin.math.atan2(s.x.toDouble(), -s.y.toDouble())) + 360.0) % 360.0).toFloat()
            Shortcuts.draw(canvas, context, Shortcuts.get(context, i, s), cx + s.x * r, cy + s.y * r, r * 0.05f, if (ambient) Color.GRAY else colorAt(deg), ambient)
        }
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: NeonAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
