package cl.carlospnauto.esfera.comun

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.BatteryManager
import android.text.format.DateFormat
import android.view.SurfaceHolder
import androidx.wear.watchface.CanvasType
import androidx.wear.watchface.ComplicationSlotsManager
import androidx.wear.watchface.DrawMode
import androidx.wear.watchface.Renderer
import androidx.wear.watchface.WatchState
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.style.CurrentUserStyleRepository
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

/** Colores de una esfera deportiva (glow = brillo de fondo; transparente = sin brillo) */
data class SportColors(
    val hour: Int,
    val minute: Int,
    val date: Int,
    val line: Int,
    val data: Int,
    val ticks: Int,
    val glow: Int = Color.TRANSPARENT,
    val battery: Int = Color.WHITE,
)

class SportAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/**
 * Esfera deportiva digital: día; mes, fecha y año; hora grande; minutos con raya; AM/PM y segundos;
 * batería; ritmo cardíaco y pasos; 12 marcas y una marca roja que recorre el borde con los segundos.
 * watchIcon: la batería con forma de reloj (si no, una pila con rayo al cargar).
 */
class SportRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
    private val heartSlot: Int,
    private val stepsSlot: Int,
    private val watchIcon: Boolean,
    private val colors: () -> SportColors,
) : Renderer.CanvasRenderer2<SportAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false),
    SensorEventListener {

    override suspend fun createSharedAssets() = SportAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }
    private val digits = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create("sans-serif-condensed", Typeface.NORMAL)
        textScaleX = 0.82f
    }
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    var lastBounds = Rect()
        private set

    // Ritmo cardíaco del sensor (si se dio el permiso en Personalizar y no se eligió otro dato)
    private val sm = context.getSystemService(SensorManager::class.java)
    private val hrSensor = sm?.getDefaultSensor(Sensor.TYPE_HEART_RATE)
    @Volatile private var bpm = 0
    private var hrOn = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    init {
        scope.launch {
            watchState.isAmbient.combine(watchState.isVisible) { ambient, visible -> ambient != true && visible == true }
                .collect { active -> heartSensor(active) }
        }
    }

    private fun heartSensor(active: Boolean) {
        val allowed = context.checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED
        val want = active && allowed && hrSensor != null
        if (want == hrOn) return
        hrOn = want
        if (want) sm?.registerListener(this, hrSensor, SensorManager.SENSOR_DELAY_NORMAL) else sm?.unregisterListener(this)
    }

    override fun onSensorChanged(e: SensorEvent) {
        val v = e.values.firstOrNull()?.toInt() ?: return
        if (v in 30..230) bpm = v
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onDestroy() {
        sm?.unregisterListener(this)
        scope.cancel()
        super.onDestroy()
    }

    /** Texto de un dato elegido (ritmo, pasos…) o null si no hay */
    private fun slotText(id: Int): String? {
        val d = complications.complicationSlots[id]?.complicationData?.value ?: return null
        val t = when (d) {
            is ShortTextComplicationData -> d.text.getTextAt(context.resources, Instant.now())
            is RangedValueComplicationData -> d.text?.getTextAt(context.resources, Instant.now()) ?: d.value.toInt().toString()
            else -> null
        }
        return t?.toString()?.takeIf { it.isNotBlank() }
    }

    private fun dim(c: Int, ambient: Boolean) = if (!ambient) c else Color.rgb((Color.red(c) + 255) / 3, (Color.green(c) + 255) / 3, (Color.blue(c) + 255) / 3).let {
        Color.argb(200, Color.red(it), Color.green(it), Color.blue(it))
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: SportAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val c = colors()
        val t = zonedDateTime
        canvas.drawColor(Color.BLACK)

        // Brillo de fondo
        if (!ambient && Color.alpha(c.glow) > 0) {
            fill.shader = RadialGradient(cx, cy, r * 0.95f, Color.argb(120, Color.red(c.glow), Color.green(c.glow), Color.blue(c.glow)), Color.TRANSPARENT, Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, fill)
            fill.shader = null
        }

        // 12 marcas y la marca roja de los segundos
        stroke.strokeCap = Paint.Cap.BUTT
        for (h in 0 until 12) {
            canvas.save()
            canvas.rotate(h * 30f, cx, cy)
            stroke.color = if (ambient) Color.GRAY else c.ticks
            stroke.strokeWidth = r * (if (ambient) 0.012f else 0.024f)
            canvas.drawLine(cx, cy - r * 0.97f, cx, cy - r * 0.86f, stroke)
            canvas.restore()
        }
        if (!ambient) {
            canvas.save()
            canvas.rotate(t.second * 6f, cx, cy)
            stroke.color = Color.rgb(255, 30, 30)
            stroke.strokeWidth = r * 0.024f
            canvas.drawLine(cx, cy - r * 0.97f, cx, cy - r * 0.88f, stroke)
            canvas.restore()
        }
        stroke.strokeCap = Paint.Cap.ROUND

        val white = if (ambient) Color.LTGRAY else Color.WHITE
        val loc = Locale.getDefault()

        // Día de la semana
        text.textSize = r * 0.15f
        text.color = white
        canvas.drawText(t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc), cx, cy - r * 0.60f, text)

        // Mes · fecha · año
        text.textSize = r * 0.13f
        canvas.drawText(t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc), cx - r * 0.34f, cy - r * 0.37f, text)
        canvas.drawText(t.year.toString(), cx + r * 0.36f, cy - r * 0.37f, text)
        text.textSize = r * 0.19f
        text.color = dim(c.date, ambient)
        canvas.drawText("%02d".format(t.dayOfMonth), cx, cy - r * 0.36f, text)

        // Hora (12 o 24 h, como el teléfono)
        val is24 = DateFormat.is24HourFormat(context)
        val hour = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        digits.textAlign = Paint.Align.RIGHT
        digits.textSize = r * 0.74f
        if (ambient) {
            digits.style = Paint.Style.STROKE
            digits.strokeWidth = r * 0.01f
        }
        digits.color = if (ambient) Color.LTGRAY else c.hour
        canvas.drawText(hour, cx - r * 0.05f, cy + r * 0.30f, digits)

        // Dos puntos
        fill.color = if (ambient) Color.GRAY else Color.rgb(170, 170, 170)
        val sq = r * 0.045f
        canvas.drawRect(cx + r * 0.0f, cy - r * 0.16f, cx + sq, cy - r * 0.16f + sq, fill)
        canvas.drawRect(cx + r * 0.0f, cy - r * 0.01f, cx + sq, cy - r * 0.01f + sq, fill)

        // Minutos, raya y AM/PM con segundos
        digits.textAlign = Paint.Align.LEFT
        digits.textSize = r * 0.42f
        digits.color = if (ambient) Color.LTGRAY else c.minute
        canvas.drawText("%02d".format(t.minute), cx + r * 0.08f, cy + r * 0.06f, digits)
        digits.style = Paint.Style.FILL
        fill.color = dim(c.line, ambient)
        canvas.drawRect(cx + r * 0.09f, cy + r * 0.10f, cx + r * 0.47f, cy + r * 0.125f, fill)
        val ampm = if (t.hour < 12) "AM" else "PM"
        val sec = "%02d".format(t.second)
        val low = when {
            ambient -> if (is24) "" else ampm
            is24 -> sec
            else -> "$ampm $sec"
        }
        text.textSize = r * 0.13f
        text.color = white
        canvas.drawText(low, cx + r * 0.28f, cy + r * 0.26f, text)

        // Batería
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val charging = battery?.isCharging == true
        val bx = cx + r * 0.70f
        val by = cy - r * 0.12f
        drawBattery(canvas, bx, by, r, pct, charging, ambient)
        if (pct in 0..100) {
            text.textSize = r * 0.14f
            text.color = dim(c.battery, ambient)
            canvas.drawText("$pct%", bx, cy + r * 0.12f, text)
        }

        // Ritmo cardíaco y pasos
        val hr = slotText(heartSlot) ?: if (bpm > 0) bpm.toString() else "--"
        val steps = slotText(stepsSlot) ?: "--"
        drawHeart(canvas, cx - r * 0.50f, cy + r * 0.49f, r * 0.075f, ambient)
        drawShoe(canvas, cx + r * 0.58f, cy + r * 0.49f, r * 0.08f, ambient)
        text.textSize = r * 0.15f
        text.color = dim(c.data, ambient)
        canvas.drawText(hr, cx - r * 0.18f, cy + r * 0.55f, text)
        canvas.drawText(steps, cx + r * 0.20f, cy + r * 0.55f, text)
        text.textSize = r * 0.085f
        text.color = white
        canvas.drawText("LPM", cx - r * 0.18f, cy + r * 0.69f, text)
        canvas.drawText("PASOS", cx + r * 0.20f, cy + r * 0.69f, text)

        Brand.draw(canvas, cx, cy + r * 0.80f, r * 0.032f, if (ambient) Color.DKGRAY else Color.rgb(120, 120, 120))
    }

    private fun drawBattery(canvas: Canvas, x: Float, y: Float, r: Float, pct: Int, charging: Boolean, ambient: Boolean) {
        val green = Color.rgb(120, 220, 40)
        stroke.strokeWidth = r * 0.016f
        stroke.color = if (ambient) Color.GRAY else Color.WHITE
        if (watchIcon) {
            // Reloj: correas, caja redonda y el nivel adentro
            val s = r * 0.075f
            canvas.drawRoundRect(RectF(x - s * 0.55f, y - s * 1.45f, x + s * 0.55f, y - s * 0.85f), s * 0.15f, s * 0.15f, stroke)
            canvas.drawRoundRect(RectF(x - s * 0.55f, y + s * 0.85f, x + s * 0.55f, y + s * 1.45f), s * 0.15f, s * 0.15f, stroke)
            canvas.drawCircle(x, y, s, stroke)
            if (pct >= 0 && !ambient) {
                fill.color = green
                val h = s * 1.1f * pct / 100f
                canvas.drawRoundRect(RectF(x - s * 0.28f, y + s * 0.55f - h, x + s * 0.28f, y + s * 0.55f), s * 0.1f, s * 0.1f, fill)
            }
        } else {
            // Pila horizontal (con rayo al cargar)
            val body = RectF(x - r * 0.10f, y - r * 0.06f, x + r * 0.08f, y + r * 0.06f)
            canvas.drawRoundRect(body, r * 0.015f, r * 0.015f, stroke)
            fill.color = stroke.color
            canvas.drawRect(x + r * 0.08f, y - r * 0.025f, x + r * 0.11f, y + r * 0.025f, fill)
            if (!ambient && pct >= 0) {
                fill.color = Color.argb(150, 255, 255, 255)
                canvas.drawRect(body.left + r * 0.02f, body.top + r * 0.02f, body.left + r * 0.02f + (body.width() - r * 0.04f) * pct / 100f, body.bottom - r * 0.02f, fill)
            }
            if (charging && !ambient) {
                fill.color = green
                path.reset()
                path.moveTo(x + r * 0.01f, y - r * 0.11f)
                path.lineTo(x - r * 0.05f, y + r * 0.01f)
                path.lineTo(x - r * 0.005f, y + r * 0.01f)
                path.lineTo(x - r * 0.03f, y + r * 0.11f)
                path.lineTo(x + r * 0.05f, y - r * 0.02f)
                path.lineTo(x + r * 0.005f, y - r * 0.02f)
                path.close()
                canvas.drawPath(path, fill)
            }
        }
    }

    private fun drawHeart(canvas: Canvas, x: Float, y: Float, s: Float, ambient: Boolean) {
        path.reset()
        path.moveTo(x, y + s * 0.9f)
        path.cubicTo(x - s * 1.6f, y - s * 0.1f, x - s * 0.8f, y - s * 1.3f, x, y - s * 0.45f)
        path.cubicTo(x + s * 0.8f, y - s * 1.3f, x + s * 1.6f, y - s * 0.1f, x, y + s * 0.9f)
        path.close()
        if (ambient) {
            stroke.color = Color.GRAY
            stroke.strokeWidth = s * 0.12f
            canvas.drawPath(path, stroke)
        } else {
            fill.color = Color.rgb(250, 200, 20)
            canvas.drawPath(path, fill)
        }
    }

    private fun drawShoe(canvas: Canvas, x: Float, y: Float, s: Float, ambient: Boolean) {
        path.reset()
        path.moveTo(x - s * 1.1f, y + s * 0.35f)
        path.lineTo(x - s * 0.9f, y - s * 0.25f)
        path.lineTo(x - s * 0.2f, y - s * 0.6f)
        path.lineTo(x + s * 0.1f, y - s * 0.1f)
        path.lineTo(x + s * 1.0f, y + s * 0.1f)
        path.lineTo(x + s * 1.1f, y + s * 0.35f)
        path.close()
        if (ambient) {
            stroke.color = Color.GRAY
            stroke.strokeWidth = s * 0.12f
            canvas.drawPath(path, stroke)
            return
        }
        fill.color = Color.rgb(255, 120, 30)
        canvas.drawPath(path, fill)
        fill.color = Color.WHITE
        canvas.drawRect(x - s * 1.1f, y + s * 0.30f, x + s * 1.1f, y + s * 0.50f, fill)
        stroke.color = Color.WHITE
        stroke.strokeWidth = s * 0.08f
        canvas.drawLine(x - s * 0.55f, y - s * 0.35f, x - s * 0.3f, y - s * 0.1f, stroke)
        canvas.drawLine(x - s * 0.35f, y - s * 0.45f, x - s * 0.1f, y - s * 0.2f, stroke)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: SportAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
