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
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min

private const val UNREAD = 101
private const val STEPS = 102
private const val HEART = 103

private val COLOR = Choice(
    "color", "Color de la hora",
    listOf(
        "Blanco" to Color.rgb(245, 245, 245), "Ámbar" to Color.rgb(255, 190, 70), "Cian" to Color.rgb(80, 225, 245),
        "Verde" to Color.rgb(120, 235, 140), "Rojo" to Color.rgb(255, 90, 80), "Naranja" to Color.rgb(255, 140, 40),
        "Violeta" to Color.rgb(190, 140, 255),
    ),
)
private val LINE = Choice(
    "linea", "Líneas de la franja",
    listOf("Gris y bronce" to 0, "Del color de la hora" to 1, "Grises" to 2),
)
private val COLON = Choice("puntos", "Dos puntos", listOf("Pulsan" to 0, "Fijos" to 1))
private val AMB = Choice("bajo", "Bajo consumo", listOf("Pantalla completa tenue" to 0, "Mínimo" to 1))

object Config : FaceConfig {
    override val slots = listOf(UNREAD to "Sin leer (arriba)", STEPS to "Pasos", HEART to "Ritmo cardíaco")
    override val spots = listOf(
        Spot(0.22f, 0f, Action.MEDIA, "Toque en la hora", hit = 0.20f),
        Spot(0.82f, 0f, Action.MUSIC, "Toque en los segundos", hit = 0.13f),
        Spot(-0.50f, 0.33f, Action.BATTERY, "Batería", hit = 0.12f),
        Spot(-0.56f, 0.0f, Action.ALARMS, "Fecha", hit = 0.14f),
    )
    override val choices = listOf(COLOR, LINE, COLON, AMB)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val short = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        fun slot(id: Int, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, short, policy, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            slot(UNREAD, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_UNREAD_NOTIFICATION_COUNT, ComplicationType.SHORT_TEXT), RectF(0.25f, 0.12f, 0.40f, 0.23f)),
            slot(STEPS, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.15f, 0.27f, 0.35f, 0.38f)),
            slot(HEART, DefaultComplicationDataSourcePolicy(), RectF(0.25f, 0.79f, 0.40f, 0.89f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = SequenceRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class SequenceAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/**
 * Secuencia: una franja al centro con la fecha, la hora, los segundos y AM/PM, y arriba y abajo las
 * columnas de las horas, los minutos y los segundos que vienen y que pasaron (más chicos y tenues a
 * medida que se alejan; los segundos siguen el borde). A la izquierda: sin leer, pasos, batería y ritmo.
 */
class SequenceRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<SequenceAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 200L, false) {

    override suspend fun createSharedAssets() = SequenceAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG)
    private val wide = Typeface.create("sans-serif", Typeface.BOLD)
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

    private fun grey(v: Int) = Color.rgb(v, v, v)

    /** Letras anchas y en negrita (como las de la foto) */
    private fun label(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, align: Paint.Align = Paint.Align.CENTER) {
        text.typeface = wide
        text.textSize = size
        text.textScaleX = 1.12f
        text.letterSpacing = 0.02f
        text.color = color
        text.textAlign = align
        canvas.drawText(s, x, y, text)
        text.textScaleX = 1f
        text.letterSpacing = 0f
    }

    /** Número de dígitos cuadrados centrado en (x, y) con altura h */
    private fun num(canvas: Canvas, s: String, x: Float, y: Float, h: Float, color: Int) {
        val w = h * 0.78f
        val thick = h * 0.19f
        val gap = h * 0.14f
        val tw = SquareDigits.totalWidth(s, w, gap)
        SquareDigits.draw(canvas, s, x - tw / 2, y - h / 2, w, h, thick, gap, color, alignRight = false)
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: SequenceAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        val simple = ambient && Choices.value(context, AMB) == 1
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val accent = Choices.value(context, COLOR)
        val is24 = DateFormat.is24HourFormat(context)
        fun hourOf(hh: Int): String {
            val v = ((hh % 24) + 24) % 24
            return if (is24) "%02d".format(v) else "%02d".format(if (v % 12 == 0) 12 else v % 12)
        }
        canvas.drawColor(Color.BLACK)

        // ===== Columnas: lo que viene (arriba) y lo que pasó (abajo) =====
        if (!simple) {
            // Horas: 4 arriba y 4 abajo, en línea recta
            val hSizes = floatArrayOf(0.105f, 0.085f, 0.07f, 0.052f)
            val hY = floatArrayOf(0.25f, 0.415f, 0.555f, 0.665f)
            val hCol = intArrayOf(150, 135, 120, 105)
            for (k in 0 until 4) {
                num(canvas, hourOf(t.hour + k + 1), X(0f), Y(-hY[k]), r * hSizes[k], grey(hCol[k]))
                num(canvas, hourOf(t.hour - k - 1), X(0f), Y(hY[k]), r * hSizes[k], grey(hCol[k]))
            }
            // Minutos: 3 arriba y 3 abajo
            val mX = floatArrayOf(0.44f, 0.44f, 0.40f)
            val mY = floatArrayOf(0.25f, 0.41f, 0.555f)
            val mSizes = floatArrayOf(0.105f, 0.085f, 0.07f)
            for (k in 0 until 3) {
                num(canvas, "%02d".format((t.minute + k + 1) % 60), X(mX[k]), Y(-mY[k]), r * mSizes[k], grey(hCol[k]))
                num(canvas, "%02d".format(((t.minute - k - 1) % 60 + 60) % 60), X(mX[k]), Y(mY[k]), r * mSizes[k], grey(hCol[k]))
            }
            // Segundos: 7 arriba y 7 abajo; primero derecho y después siguen el borde hacia la izquierda
            if (!ambient) {
                val sX = floatArrayOf(0.81f, 0.75f, 0.66f, 0.54f, 0.40f, 0.22f, 0.0f)
                val sY = floatArrayOf(0.25f, 0.41f, 0.555f, 0.68f, 0.77f, 0.84f, 0.875f)
                val sSizes = floatArrayOf(0.10f, 0.085f, 0.07f, 0.065f, 0.06f, 0.06f, 0.058f)
                val sCol = intArrayOf(150, 140, 130, 125, 120, 115, 110)
                for (k in 0 until 7) {
                    num(canvas, "%02d".format((t.second + k + 1) % 60), X(sX[k]), Y(-sY[k]), r * sSizes[k], grey(sCol[k]))
                    num(canvas, "%02d".format(((t.second - k - 1) % 60 + 60) % 60), X(sX[k]), Y(sY[k]), r * sSizes[k], grey(sCol[k]))
                }
            }

            // ===== Datos de la izquierda =====
            val lab = grey(150)
            val valC = grey(185)
            val unread = complications.textOf(UNREAD, context.resources)?.filter { it.isDigit() } ?: "0"
            label(canvas, "SIN LEER", X(-0.35f), Y(-0.685f), r * 0.052f, lab)
            num(canvas, unread.ifEmpty { "0" }, X(-0.35f), Y(-0.595f), r * 0.075f, valC)
            val steps = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() } ?: ""
            label(canvas, "PASOS", X(-0.50f), Y(-0.37f), r * 0.052f, lab)
            num(canvas, steps.ifEmpty { "--" }.takeLast(5), X(-0.50f), Y(-0.27f), r * 0.088f, valC)
            val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            val pTxt = if (pct >= 0) pct.toString() else "--"
            val ph = r * 0.088f
            val pw = SquareDigits.totalWidth(pTxt, ph * 0.78f, ph * 0.14f)
            num(canvas, pTxt, X(-0.53f), Y(0.29f), ph, valC)
            label(canvas, "%", X(-0.53f) + pw / 2 + r * 0.01f, Y(0.29f) + ph / 2, ph * 1.05f, valC, Paint.Align.LEFT)
            label(canvas, "BATERÍA", X(-0.50f), Y(0.405f), r * 0.052f, lab)
            val hr = complications.textOf(HEART, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
                ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
            label(canvas, "RITMO", X(-0.35f), Y(0.615f), r * 0.052f, lab)
            num(canvas, hr, X(-0.35f), Y(0.71f), r * 0.088f, valC)
        }

        // ===== Franja del centro =====
        fill.color = Color.rgb(30, 30, 32)
        canvas.drawRect(X(-1f), Y(-0.14f), X(1f), Y(0.14f), fill)
        val lineMode = Choices.value(context, LINE)
        stroke.strokeWidth = r * 0.008f
        stroke.color = when (lineMode) { 1 -> accent; else -> grey(150) }
        canvas.drawLine(X(-1f), Y(-0.14f), X(1f), Y(-0.14f), stroke)
        stroke.color = when (lineMode) { 0 -> Color.rgb(150, 122, 86); 1 -> accent; else -> grey(150) }
        canvas.drawLine(X(-1f), Y(0.14f), X(1f), Y(0.14f), stroke)

        // Fecha
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        val mon = t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc)
        label(canvas, "$dow, $mon ${t.dayOfMonth}", X(-0.235f), Y(0.04f), r * 0.10f, grey(185), Paint.Align.RIGHT)

        // Hora grande: HH : MM
        val th = r * 0.17f
        val tw = th * 0.78f
        val tThick = th * 0.20f
        val tGap = th * 0.12f
        SquareDigits.draw(canvas, hourOf(t.hour), X(0.15f), Y(-0.085f), tw, th, tThick, tGap, accent, alignRight = true)
        SquareDigits.draw(canvas, "%02d".format(t.minute), X(0.295f), Y(-0.085f), tw, th, tThick, tGap, accent, alignRight = false)
        // Dos puntos que pulsan
        val pulse = if (ambient || Choices.value(context, COLON) == 1) 1f else (0.35f + 0.65f * abs(cos(Math.PI * (System.currentTimeMillis() % 1000) / 1000.0)).toFloat())
        fill.color = Color.argb((255 * pulse).toInt(), Color.red(accent), Color.green(accent), Color.blue(accent))
        val d = r * 0.022f
        for (k in listOf(-0.035f, 0.035f)) canvas.drawRect(X(0.222f) - d, Y(k) - d, X(0.222f) + d, Y(k) + d, fill)
        // Segundos y AM/PM
        if (!ambient) {
            val sh = r * 0.12f
            SquareDigits.draw(canvas, "%02d".format(t.second), X(0.70f), Y(-0.075f), sh * 0.78f, sh, sh * 0.2f, sh * 0.12f, accent, alignRight = false)
        }
        if (!is24) label(canvas, if (t.hour < 12) "AM" else "PM", X(0.81f), Y(0.115f), r * 0.045f, grey(170))

        // Siempre activa: todo, más tenue
        if (ambient && !simple) canvas.drawColor(Color.argb(140, 0, 0, 0))
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: SequenceAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
