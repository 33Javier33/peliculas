package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.os.BatteryManager
import android.text.format.DateFormat
import android.view.SurfaceHolder
import androidx.wear.watchface.CanvasComplicationFactory
import androidx.wear.watchface.TapEvent
import androidx.wear.watchface.TapType
import cl.carlospnauto.esfera.comun.Action
import cl.carlospnauto.esfera.comun.Brand
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Spot
import androidx.wear.watchface.CanvasType
import androidx.wear.watchface.ComplicationSlot
import androidx.wear.watchface.ComplicationSlotsManager
import androidx.wear.watchface.DrawMode
import androidx.wear.watchface.Renderer
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
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.min

private const val BOTTOM = 101

/** Dato de abajo (por defecto, los pasos) y accesos a PulsoMedia y PulsoMusic */
object Config : FaceConfig {
    override val slots = listOf(BOTTOM to "Dato de abajo")
    override val spots = listOf(
        Spot(-0.50f, 0.43f, Action.MEDIA, "Acceso izquierdo"),
        Spot(0.50f, 0.43f, Action.MUSIC, "Acceso derecho"),
    )
}

private val CYAN = Color.rgb(24, 220, 240)
private val CYAN_DIM = Color.rgb(20, 120, 135)

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener ->
            val d = ComplicationDrawable(this)
            for ((i, s) in listOf(d.activeStyle, d.ambientStyle).withIndex()) {
                val ambient = i == 1
                s.backgroundColor = Color.TRANSPARENT
                s.borderStyle = ComplicationStyle.BORDER_STYLE_NONE
                s.textColor = if (ambient) Color.LTGRAY else CYAN
                s.titleColor = if (ambient) Color.GRAY else Color.WHITE
                s.iconColor = if (ambient) Color.LTGRAY else CYAN
                s.rangedValuePrimaryColor = if (ambient) Color.LTGRAY else CYAN
                s.rangedValueSecondaryColor = Color.rgb(30, 50, 55)
            }
            CanvasComplicationDrawable(d, watchState, listener)
        }
        val steps = ComplicationSlot.createRoundRectComplicationSlotBuilder(
            BOTTOM,
            factory,
            listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE, ComplicationType.SMALL_IMAGE),
            DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
            ComplicationSlotBounds(RectF(0.30f, 0.68f, 0.70f, 0.80f)),
        ).build()
        return ComplicationSlotsManager(listOf(steps), currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = DigitalRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class DigitalAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Digital limpia: hora grande, fecha en cian, batería y un dato abajo (pasos) */
class DigitalRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<DigitalAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = DigitalAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val timePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
    }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create("sans-serif-condensed", Typeface.NORMAL)
    }
    private val battery = context.getSystemService(BatteryManager::class.java)
    var lastBounds = Rect()
        private set

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: DigitalAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val accent = if (ambient) CYAN_DIM else CYAN
        canvas.drawColor(Color.BLACK)

        // Anillos
        stroke.color = accent
        stroke.strokeWidth = r * 0.022f
        canvas.drawCircle(cx, cy, r * 0.94f, stroke)
        if (!ambient) {
            stroke.color = Color.rgb(200, 215, 218)
            stroke.strokeWidth = r * 0.008f
            canvas.drawCircle(cx, cy, r * 0.975f, stroke)
        }

        // Marcas de minutos
        for (i in 0 until 60) {
            canvas.save()
            canvas.rotate(i * 6f, cx, cy)
            when {
                i % 15 == 0 -> {
                    fill.color = accent
                    canvas.drawCircle(cx, cy - r * 0.865f, r * 0.02f, fill)
                    canvas.drawCircle(cx, cy - r * 0.81f, r * 0.016f, fill)
                }
                i % 5 == 0 -> {
                    stroke.strokeWidth = r * 0.012f
                    stroke.color = if (ambient) Color.GRAY else Color.WHITE
                    canvas.drawLine(cx, cy - r * 0.885f, cx, cy - r * 0.85f, stroke)
                    stroke.color = accent
                    canvas.drawLine(cx, cy - r * 0.84f, cx, cy - r * 0.81f, stroke)
                }
                !ambient -> {
                    stroke.strokeWidth = r * 0.007f
                    stroke.color = CYAN_DIM
                    canvas.drawLine(cx, cy - r * 0.87f, cx, cy - r * 0.845f, stroke)
                }
            }
            canvas.restore()
        }

        // Hora (12 o 24 h según el reloj)
        val is24 = DateFormat.is24HourFormat(context)
        val time = zonedDateTime.format(DateTimeFormatter.ofPattern(if (is24) "HH:mm" else "h:mm"))
        timePaint.textSize = r * 0.46f
        timePaint.color = if (ambient) Color.LTGRAY else Color.WHITE
        canvas.drawText(time, cx, cy - r * 0.02f, timePaint)

        // Fecha
        val date = zonedDateTime.format(DateTimeFormatter.ofPattern("EEE, d MMM", Locale.getDefault()))
            .replace(".", "").uppercase(Locale.getDefault())
        text.textAlign = Paint.Align.CENTER
        text.textSize = r * 0.15f
        text.color = accent
        canvas.drawText(date, cx, cy + r * 0.20f, text)

        // Batería
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        if (pct in 0..100) {
            text.textSize = r * 0.085f
            val label = "BATERÍA: "
            val value = "$pct%"
            val lw = text.measureText(label)
            val vw = text.measureText(value)
            val icon = r * 0.07f
            val total = lw + vw + icon
            var x = cx - total / 2
            val y = cy + r * 0.44f
            text.textAlign = Paint.Align.LEFT
            text.color = if (ambient) Color.GRAY else Color.WHITE
            canvas.drawText(label, x, y, text)
            x += lw
            text.color = accent
            canvas.drawText(value, x, y, text)
            x += vw + r * 0.02f
            // Pila
            val body = RectF(x, y - r * 0.07f, x + r * 0.04f, y)
            stroke.color = accent
            stroke.strokeWidth = r * 0.006f
            canvas.drawRoundRect(body, r * 0.006f, r * 0.006f, stroke)
            fill.color = accent
            val h = (body.height() - r * 0.012f) * pct / 100f
            canvas.drawRect(body.left + r * 0.006f, body.bottom - r * 0.006f - h, body.right - r * 0.006f, body.bottom - r * 0.006f, fill)
            canvas.drawRect(body.centerX() - r * 0.01f, body.top - r * 0.008f, body.centerX() + r * 0.01f, body.top, fill)
        }

        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.render(canvas, zonedDateTime, renderParameters)
        }

        // Accesos (PulsoMedia, PulsoMusic…) y la marca
        Shortcuts.drawAll(canvas, context, Config.spots, cx, cy, r, r * 0.075f, accent, ambient)
        Brand.draw(canvas, cx, cy - r * 0.56f, r * 0.042f, if (ambient) Color.GRAY else Color.rgb(150, 160, 165))
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: DigitalAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
