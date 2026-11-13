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
import cl.carlospnauto.esfera.comun.Brand
import cl.carlospnauto.esfera.comun.Choice
import cl.carlospnauto.esfera.comun.Choices
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Spot
import cl.carlospnauto.esfera.comun.textOf
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

private const val STEPS = 101

private val COLOR = Choice(
    "color", "Color",
    listOf(
        "Cian" to Color.rgb(24, 220, 240), "Verde" to Color.rgb(60, 230, 120), "Naranja" to Color.rgb(255, 140, 30),
        "Rosa" to Color.rgb(255, 80, 160), "Ámbar" to Color.rgb(255, 200, 40), "Violeta" to Color.rgb(160, 110, 255),
        "Rojo" to Color.rgb(255, 60, 60), "Blanco" to Color.WHITE,
    ),
)
private val RING = Choice("anillo", "Anillo de segundos", listOf("Suave (continuo)" to 0, "Por segundos" to 1, "Apagado" to 2))
private val TICKS = Choice("marcas", "Marcas del borde", listOf("Suaves" to 0, "Clásicas" to 1, "Puntos" to 2, "Ninguna" to 3))

/** Pasos (u otro dato), colores, anillo, marcas y accesos a PulsoMedia y PulsoMusic */
object Config : FaceConfig {
    override val slots = listOf(STEPS to "Dato de la derecha (pasos)")
    override val spots = listOf(
        Spot(-0.14f, 0.74f, Action.MEDIA, "Acceso izquierdo", hit = 0.10f),
        Spot(0.14f, 0.74f, Action.MUSIC, "Acceso derecho", hit = 0.10f),
    )
    override val choices = listOf(COLOR, RING, TICKS)
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        // El dato se escribe con las letras de la esfera; el recuadro solo da el valor y abre su app al tocarlo
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val steps = ComplicationSlot.createRoundRectComplicationSlotBuilder(
            STEPS,
            factory,
            listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE),
            DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
            // Mitad derecha de la fila de abajo (la batería ocupa la izquierda)
            ComplicationSlotBounds(RectF(0.52f, 0.69f, 0.80f, 0.81f)),
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

/**
 * Digital limpia que usa toda la pantalla: anillo de segundos que corre suave por el borde y se
 * completa cada minuto, marcas suaves, hora grande, fecha, y abajo batería y pasos lado a lado.
 */
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
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.NORMAL)
    }
    private val battery = context.getSystemService(BatteryManager::class.java)
    var lastBounds = Rect()
        private set

    private fun alpha(c: Int, a: Int) = Color.argb(a, Color.red(c), Color.green(c), Color.blue(c))

    /** Texto que cabe en un ancho (achica la letra si hace falta): así nada se topa en ninguna pantalla */
    private fun fit(p: Paint, s: String, size: Float, maxWidth: Float) {
        p.textSize = size
        val w = p.measureText(s)
        if (w > maxWidth) p.textSize = size * maxWidth / w
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: DigitalAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val t = zonedDateTime
        val accent = if (ambient) Color.rgb(120, 120, 120) else Choices.value(context, COLOR)
        val ring = Choices.value(context, RING)
        // Anillo suave: se redibuja seguido solo mientras se mira (en reposo, nada)
        interactiveDrawModeUpdateDelayMillis = if (ring == 0) 40L else 1000L
        canvas.drawColor(Color.BLACK)

        // Borde: línea fina de afuera, pista del anillo y el anillo de segundos que corre
        val ringR = r * 0.945f
        val ringW = r * 0.035f
        val oval = RectF(cx - ringR, cy - ringR, cx + ringR, cy + ringR)
        if (!ambient) {
            stroke.strokeWidth = r * 0.006f
            stroke.color = Color.rgb(70, 80, 84)
            canvas.drawCircle(cx, cy, r * 0.988f, stroke)
            stroke.strokeWidth = ringW
            stroke.color = alpha(accent, 45)
            canvas.drawCircle(cx, cy, ringR, stroke)
            if (ring != 2) {
                val sec = if (ring == 0) t.second + t.nano / 1e9f else t.second.toFloat()
                val sweep = sec / 60f * 360f
                if (sweep > 0.5f) {
                    stroke.color = accent
                    stroke.setShadowLayer(r * 0.03f, 0f, 0f, alpha(accent, 160))
                    canvas.drawArc(oval, -90f, sweep, false, stroke)
                    stroke.clearShadowLayer()
                }
                // Punta brillante
                val a = Math.toRadians((sweep - 90f).toDouble())
                fill.color = Color.WHITE
                canvas.drawCircle(cx + (cos(a) * ringR).toFloat(), cy + (sin(a) * ringR).toFloat(), ringW * 0.42f, fill)
            }
        } else {
            stroke.strokeWidth = r * 0.008f
            stroke.color = Color.rgb(70, 70, 70)
            canvas.drawCircle(cx, cy, ringR, stroke)
        }

        // Marcas de los minutos (por dentro del anillo)
        val style = if (ambient) 3 else Choices.value(context, TICKS)
        if (style != 3) {
            for (i in 0 until 60) {
                val five = i % 5 == 0
                canvas.save()
                canvas.rotate(i * 6f, cx, cy)
                when (style) {
                    0 -> {
                        stroke.strokeWidth = r * (if (five) 0.012f else 0.006f)
                        stroke.color = if (five) alpha(accent, 200) else alpha(Color.WHITE, 60)
                        canvas.drawLine(cx, cy - r * 0.895f, cx, cy - r * (if (five) 0.855f else 0.875f), stroke)
                    }
                    1 -> {
                        stroke.strokeWidth = r * (if (five) 0.014f else 0.008f)
                        stroke.color = if (five) Color.WHITE else alpha(accent, 170)
                        canvas.drawLine(cx, cy - r * 0.90f, cx, cy - r * (if (five) 0.84f else 0.87f), stroke)
                    }
                    else -> {
                        fill.color = if (five) accent else alpha(Color.WHITE, 90)
                        canvas.drawCircle(cx, cy - r * 0.88f, r * (if (five) 0.014f else 0.006f), fill)
                    }
                }
                canvas.restore()
            }
        }

        // Marca arriba
        Brand.draw(canvas, cx, cy - r * 0.60f, r * 0.04f, if (ambient) Color.DKGRAY else Color.rgb(140, 150, 155))

        // Hora (12 o 24 h según el reloj): ocupa el ancho disponible sin tocar el borde
        val is24 = DateFormat.is24HourFormat(context)
        val time = t.format(DateTimeFormatter.ofPattern(if (is24) "HH:mm" else "h:mm"))
        timePaint.color = if (ambient) Color.LTGRAY else Color.WHITE
        fit(timePaint, time, r * 0.56f, r * 1.42f)
        val timeBase = cy + r * 0.10f
        canvas.drawText(time, cx, timeBase, timePaint)
        if (!is24 && !ambient) {
            text.textSize = r * 0.06f
            text.color = alpha(accent, 220)
            canvas.drawText(if (t.hour < 12) "AM" else "PM", cx, cy - r * 0.40f, text)
        }

        // Fecha
        val loc = Locale.getDefault()
        val date = t.format(DateTimeFormatter.ofPattern("EEE, d MMM", loc)).replace(".", "").uppercase(loc)
        text.color = accent
        fit(text, date, r * 0.15f, r * 1.25f)
        canvas.drawText(date, cx, cy + r * 0.30f, text)

        if (ambient) return

        // Fila de abajo: batería (izquierda) | pasos (derecha), con una línea entre medio
        val rowLabel = cy + r * 0.44f
        val rowValue = cy + r * 0.58f
        stroke.strokeWidth = r * 0.006f
        stroke.color = alpha(Color.WHITE, 50)
        canvas.drawLine(cx, cy + r * 0.40f, cx, cy + r * 0.60f, stroke)
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val steps = complications.textOf(STEPS, context.resources) ?: "--"
        text.color = Color.rgb(170, 175, 178)
        fit(text, "BATERÍA", r * 0.06f, r * 0.40f)
        canvas.drawText("BATERÍA", cx - r * 0.29f, rowLabel, text)
        fit(text, "PASOS", r * 0.06f, r * 0.40f)
        canvas.drawText("PASOS", cx + r * 0.29f, rowLabel, text)
        text.color = accent
        val pctText = if (pct >= 0) "$pct%" else "--"
        fit(text, pctText, r * 0.12f, r * 0.36f)
        canvas.drawText(pctText, cx - r * 0.29f, rowValue, text)
        fit(text, steps, r * 0.12f, r * 0.40f)
        canvas.drawText(steps, cx + r * 0.29f, rowValue, text)
        // Nivel de batería: barrita bajo el número
        if (pct >= 0) {
            val bl = cx - r * 0.42f
            val bw = r * 0.26f
            stroke.strokeWidth = r * 0.014f
            stroke.color = alpha(accent, 50)
            canvas.drawLine(bl, rowValue + r * 0.04f, bl + bw, rowValue + r * 0.04f, stroke)
            stroke.color = accent
            canvas.drawLine(bl, rowValue + r * 0.04f, bl + bw * pct / 100f, rowValue + r * 0.04f, stroke)
        }

        // Accesos (PulsoMedia, PulsoMusic…) abajo al centro
        Shortcuts.drawAll(canvas, context, Config.spots, cx, cy, r, r * 0.065f, accent, false)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: DigitalAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
