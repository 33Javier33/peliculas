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
import androidx.wear.watchface.style.CurrentUserStyleRepository
import cl.carlospnauto.esfera.comun.Action
import cl.carlospnauto.esfera.comun.Brand
import cl.carlospnauto.esfera.comun.Choice
import cl.carlospnauto.esfera.comun.Choices
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.HeartRate
import cl.carlospnauto.esfera.comun.Lcd
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
import kotlin.math.cos
import kotlin.math.min

private const val HEART = 101
private const val STEPS = 102

/** Temas: arriba y abajo de la pantalla (degradado) y color de los segmentos */
private data class Theme(val top: Int, val bottom: Int, val ink: Int)

private val THEMES = listOf(
    "Lila" to Theme(Color.rgb(243, 230, 255), Color.rgb(201, 179, 242), Color.rgb(26, 16, 40)),
    "Rosa" to Theme(Color.rgb(255, 227, 238), Color.rgb(247, 182, 207), Color.rgb(45, 15, 30)),
    "Fucsia" to Theme(Color.rgb(255, 170, 220), Color.rgb(230, 100, 175), Color.rgb(40, 5, 30)),
    "Celeste" to Theme(Color.rgb(221, 243, 255), Color.rgb(169, 216, 245), Color.rgb(8, 30, 45)),
    "Menta" to Theme(Color.rgb(226, 251, 239), Color.rgb(168, 230, 200), Color.rgb(10, 40, 28)),
    "Ámbar" to Theme(Color.rgb(255, 240, 201), Color.rgb(245, 199, 106), Color.rgb(45, 30, 5)),
    "Perla" to Theme(Color.rgb(238, 240, 242), Color.rgb(198, 203, 208), Color.rgb(20, 22, 25)),
    "Verde clásico" to Theme(Color.rgb(201, 214, 184), Color.rgb(159, 176, 138), Color.rgb(22, 34, 24)),
    "Naranja" to Theme(Color.rgb(255, 217, 184), Color.rgb(245, 166, 107), Color.rgb(45, 20, 5)),
    "Rojo" to Theme(Color.rgb(255, 208, 208), Color.rgb(240, 138, 138), Color.rgb(45, 8, 8)),
    "Noche" to Theme(Color.rgb(14, 26, 51), Color.rgb(8, 16, 31), Color.rgb(143, 184, 255)),
    "Negro" to Theme(Color.rgb(24, 24, 24), Color.BLACK, Color.rgb(235, 235, 235)),
)
/** El valor de cada opción es el color de arriba (la muestra que se ve en Personalizar) */
private val THEME = Choice("tema", "Tema", THEMES.map { it.first to it.second.bottom })

object Config : FaceConfig {
    override val slots = listOf(HEART to "Ritmo cardíaco", STEPS to "Pasos")
    override val spots = listOf(
        Spot(-0.77f, -0.05f, Action.MEDIA, "APP1 (izquierda)", hit = 0.11f),
        Spot(0.77f, -0.20f, Action.MUSIC, "APP2 (derecha)", hit = 0.11f),
        Spot(-0.77f, 0.27f, Action.ALARMS, "HORA (izquierda abajo)", hit = 0.11f),
        Spot(-0.28f, 0.55f, Action.TIMER, "Ícono de abajo", hit = 0.10f),
    )
    override val choices = listOf(THEME, Smooth.CHOICE)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        val slots = listOf(
            ComplicationSlot.createRoundRectComplicationSlotBuilder(HEART, factory, types, DefaultComplicationDataSourcePolicy(), ComplicationSlotBounds(RectF(0.25f, 0.17f, 0.35f, 0.27f))).build(),
            ComplicationSlot.createRoundRectComplicationSlotBuilder(
                STEPS, factory, types,
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
                ComplicationSlotBounds(RectF(0.47f, 0.70f, 0.66f, 0.83f)),
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
        val renderer = LcdColorRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class LcdColorAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Pantalla de cristal líquido de colores: hora grande con «8» apagados, barras, iconos y datos alrededor */
class LcdColorRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<LcdColorAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = LcdColorAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif", Typeface.NORMAL)
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

    private fun a(c: Int, alpha: Int) = Color.argb(alpha, Color.red(c), Color.green(c), Color.blue(c))

    private fun vertical(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, deg: Float) {
        canvas.save()
        canvas.rotate(deg, x, y)
        text.textSize = size
        text.color = color
        canvas.drawText(s, x, y + size * 0.36f, text)
        canvas.restore()
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LcdColorAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        interactiveDrawModeUpdateDelayMillis = Smooth.delay(context)
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val theme = THEMES[Choices.index(context, THEME)].second
        val white = if (ambient) Color.rgb(170, 170, 170) else Color.WHITE
        canvas.drawColor(Color.BLACK)

        // Pantalla con doble borde
        val lcd = RectF(cx - r * 0.62f, cy - r * 0.36f, cx + r * 0.62f, cy + r * 0.30f)
        val rad = r * 0.11f
        stroke.color = if (ambient) Color.DKGRAY else Color.rgb(120, 124, 132)
        stroke.strokeWidth = r * 0.012f
        canvas.drawRoundRect(RectF(lcd.left - r * 0.035f, lcd.top - r * 0.035f, lcd.right + r * 0.035f, lcd.bottom + r * 0.035f), rad + r * 0.035f, rad + r * 0.035f, stroke)
        val on: Int
        val ghost: Int
        if (ambient) {
            // Siempre activa: pantalla oscura con borde y segmentos claros (bajo consumo)
            stroke.color = Color.rgb(150, 150, 150)
            stroke.strokeWidth = r * 0.008f
            canvas.drawRoundRect(lcd, rad, rad, stroke)
            on = Color.rgb(210, 214, 225)
            ghost = Color.argb(30, 210, 214, 225)
        } else {
            fill.shader = LinearGradient(lcd.left, lcd.top, lcd.right, lcd.bottom, theme.top, theme.bottom, Shader.TileMode.CLAMP)
            canvas.drawRoundRect(lcd, rad, rad, fill)
            fill.shader = null
            on = theme.ink
            ghost = a(theme.ink, 30)
        }

        // Hora grande con «8» apagados y dos puntos
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        Lcd.number(canvas, "$h:%02d".format(t.minute), cx + r * 0.33f, cy - r * 0.11f, r * 0.18f, r * 0.34f, r * 0.055f, 4, on, ghost)

        if (!ambient) {
            // Segundos chicos y su barrita (corre suave)
            Lcd.number(canvas, "%02d".format(t.second), cx + r * 0.55f, cy + r * 0.09f, r * 0.08f, r * 0.14f, r * 0.02f, 2, on, ghost)
            val sb = cx + r * 0.36f
            val se = cx + r * 0.54f
            val sy = cy - r * 0.15f
            stroke.strokeWidth = r * 0.014f
            stroke.color = ghost
            canvas.drawLine(sb, sy, se, sy, stroke)
            val f = Smooth.seconds(context, t) / 60f
            stroke.color = on
            canvas.drawLine(sb, sy, sb + (se - sb) * f, sy, stroke)
            fill.color = on
            canvas.drawCircle(sb + (se - sb) * f, sy, r * 0.016f, fill)

            // Barra de batería, rayo (al cargar), reloj y señal
            val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            val bb = cx - r * 0.28f
            val be = cx + r * 0.40f
            val by = cy - r * 0.27f
            stroke.strokeWidth = r * 0.03f
            stroke.color = ghost
            canvas.drawLine(bb, by, be, by, stroke)
            if (pct >= 0) {
                stroke.color = on
                canvas.drawLine(bb, by, bb + (be - bb) * pct / 100f, by, stroke)
            }
            drawBolt(canvas, cx + r * 0.50f, by, r * 0.045f, if (battery?.isCharging == true) on else ghost)
            drawWatch(canvas, cx - r * 0.52f, cy - r * 0.26f, r * 0.03f, on)
            drawSignal(canvas, cx - r * 0.42f, cy - r * 0.26f, r * 0.05f, on)
        }

        // Arriba: ritmo · fecha · batería
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        text.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        text.color = white
        text.textSize = r * 0.10f
        canvas.drawText(t.dayOfMonth.toString(), cx, cy - r * 0.62f, text)
        text.textSize = r * 0.085f
        canvas.drawText(t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc), cx, cy - r * 0.50f, text)
        if (ambient) return
        val hr = complications.textOf(HEART, context.resources) ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        drawHeart(canvas, cx - r * 0.40f, cy - r * 0.64f, r * 0.04f, white)
        text.textSize = r * 0.085f
        canvas.drawText(hr, cx - r * 0.40f, cy - r * 0.48f, text)
        drawBatteryIcon(canvas, cx + r * 0.40f, cy - r * 0.65f, r * 0.04f, white)
        canvas.drawText(if (pct >= 0) "$pct%" else "--", cx + r * 0.40f, cy - r * 0.48f, text)

        // Costados: APP1 / HORA a la izquierda, APP2 / 12-24 H a la derecha
        val side = Color.rgb(200, 200, 215)
        vertical(canvas, "APP1", cx - r * 0.77f, cy - r * 0.05f, r * 0.06f, side, -90f)
        vertical(canvas, "HORA", cx - r * 0.77f, cy + r * 0.27f, r * 0.06f, side, -90f)
        vertical(canvas, "APP2", cx + r * 0.77f, cy - r * 0.20f, r * 0.06f, side, 90f)
        vertical(canvas, if (is24) "24H" else "12H", cx + r * 0.77f, cy + r * 0.10f, r * 0.06f, side, 90f)

        // Abajo: acceso, pasos y luna
        val ss = Config.spots[3]
        Shortcuts.draw(canvas, context, Shortcuts.get(context, 3, ss), cx + ss.x * r, cy + ss.y * r, r * 0.055f, white, true)
        text.textSize = r * 0.11f
        canvas.drawText(complications.textOf(STEPS, context.resources) ?: "--", cx + r * 0.10f, cy + r * 0.50f, text)
        text.textSize = r * 0.07f
        canvas.drawText("PASOS", cx + r * 0.10f, cy + r * 0.62f, text)
        drawMoon(canvas, cx + r * 0.44f, cy + r * 0.47f, r * 0.06f, t)
        text.typeface = Typeface.create("sans-serif", Typeface.NORMAL)

        Brand.draw(canvas, cx, cy + r * 0.80f, r * 0.03f, Color.rgb(110, 110, 120))
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

    private fun drawWatch(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        stroke.color = color
        stroke.strokeWidth = s * 0.3f
        canvas.drawCircle(x, y, s, stroke)
        fill.color = color
        canvas.drawRect(x - s * 0.5f, y - s * 1.8f, x + s * 0.5f, y - s * 1.1f, fill)
        canvas.drawRect(x - s * 0.5f, y + s * 1.1f, x + s * 0.5f, y + s * 1.8f, fill)
    }

    private fun drawSignal(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        stroke.color = color
        stroke.strokeWidth = s * 0.16f
        for (k in 1..3) {
            val rr = s * 0.35f * k
            canvas.drawArc(RectF(x - rr, y - rr, x + rr, y + rr), -40f, 80f, false, stroke)
        }
        fill.color = color
        canvas.drawCircle(x, y, s * 0.12f, fill)
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

    private fun drawBatteryIcon(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawRoundRect(RectF(x - s * 0.5f, y - s * 0.9f, x + s * 0.5f, y + s), s * 0.15f, s * 0.15f, fill)
        canvas.drawRect(x - s * 0.2f, y - s * 1.15f, x + s * 0.2f, y - s * 0.9f, fill)
    }

    /** Fase de la luna (desde una luna nueva conocida: 6 ene 2000) */
    private fun drawMoon(canvas: Canvas, x: Float, y: Float, s: Float, t: ZonedDateTime) {
        val days = (t.toInstant().epochSecond - 947182440L) / 86400.0
        val phase = ((days % 29.530588853) + 29.530588853) % 29.530588853 / 29.530588853
        val lit = ((1 - cos(2 * Math.PI * phase)) / 2).toFloat()
        fill.color = Color.rgb(235, 235, 235)
        canvas.drawCircle(x, y, s, fill)
        canvas.save()
        path.reset()
        path.addCircle(x, y, s, Path.Direction.CW)
        canvas.clipPath(path)
        fill.color = Color.rgb(40, 40, 44)
        canvas.drawCircle(x + (if (phase < 0.5) -1f else 1f) * 2f * s * lit, y, s, fill)
        canvas.restore()
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LcdColorAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
