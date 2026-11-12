package cl.carlospnauto.esfera

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.view.SurfaceHolder
import androidx.wear.watchface.ComplicationSlotsManager
import androidx.wear.watchface.DrawMode
import androidx.wear.watchface.Renderer
import androidx.wear.watchface.WatchState
import androidx.wear.watchface.style.CurrentUserStyleRepository
import androidx.wear.watchface.CanvasType
import cl.carlospnauto.esfera.comun.Brand
import cl.carlospnauto.esfera.comun.Shortcuts
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.time.ZonedDateTime
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.hypot
import kotlin.math.min

class ExplorerAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Dibuja la esfera Explorer (inspirada en una brújula de excursión sobre un mapa topográfico) */
class ExplorerRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<ExplorerAssets>(
    surfaceHolder,
    currentUserStyleRepository,
    watchState,
    CanvasType.HARDWARE,
    1000L,
    false,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val sensors = Sensors(context) { invalidate() }
    private var compassOn = Prefs.compass(context)
    private var active = false

    // Ángulo del bisel (gira para que la N apunte al norte); se acerca suave al de la brújula
    private var bezelAngle = 0f

    private val prefListener = SharedPreferences.OnSharedPreferenceChangeListener { p, key ->
        if (key == Prefs.COMPASS) {
            compassOn = p.getBoolean(Prefs.COMPASS, false)
            applySensors()
            invalidate()
        }
    }

    init {
        Prefs.of(context).registerOnSharedPreferenceChangeListener(prefListener)
        scope.launch {
            watchState.isAmbient.combine(watchState.isVisible) { ambient, visible -> ambient != true && visible == true }
                .collect { a ->
                    active = a
                    applySensors()
                }
        }
    }

    private fun applySensors() {
        sensors.update(compassOn, active)
        // Con la brújula se redibuja seguido (el bisel sigue al reloj); sin ella, una vez por segundo
        interactiveDrawModeUpdateDelayMillis = if (compassOn && active && sensors.hasCompass) 33L else 1000L
    }

    override suspend fun createSharedAssets() = ExplorerAssets()

    override fun onDestroy() {
        Prefs.of(context).unregisterOnSharedPreferenceChangeListener(prefListener)
        sensors.stop()
        scope.cancel()
        super.onDestroy()
    }

    // Colores
    private val olive = Color.rgb(141, 150, 112)
    private val oliveLight = Color.rgb(166, 173, 138)
    private val oliveDark = Color.rgb(93, 100, 71)
    private val copper = Color.rgb(201, 135, 90)
    private val lume = Color.rgb(195, 209, 170)
    private val metal = Color.rgb(138, 140, 134)
    private val orange = Color.rgb(240, 122, 42)
    private val ink = Color.rgb(230, 230, 220)

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }
    private val path = Path()

    private var topo: Bitmap? = null
    private var dialShader: RadialGradient? = null
    var lastBounds = Rect()
        private set

    /** ¿El toque fue en el bisel (el anillo de la brújula)? */
    fun isOnBezel(x: Int, y: Int): Boolean {
        val b = lastBounds
        if (b.isEmpty) return false
        val r = min(b.width(), b.height()) / 2f
        return hypot(x - b.exactCenterX(), y - b.exactCenterY()) > r * 0.80f
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ExplorerAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        if (bounds != lastBounds) {
            lastBounds = Rect(bounds)
            topo = null
            dialShader = null
        }
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f

        // Brújula: el bisel gira al revés de hacia donde apunta el reloj
        val az = sensors.azimuth
        val target = if (compassOn && !ambient && az != null) -az else 0f
        val diff = ((target - bezelAngle + 540f) % 360f) - 180f
        bezelAngle = if (ambient) target else bezelAngle + diff * 0.25f
        if (!ambient && kotlin.math.abs(diff) > 0.3f) invalidate()

        canvas.drawColor(Color.BLACK)
        drawDial(canvas, cx, cy, r, ambient)
        drawBezel(canvas, cx, cy, r, ambient)
        drawIndices(canvas, cx, cy, r, ambient)
        drawLabels(canvas, cx, cy, r, ambient, az)
        drawAltitude(canvas, cx - r * 0.38f, cy + r * 0.02f, r, ambient)
        drawSubdialFrame(canvas, cx + r * 0.38f, cy + r * 0.02f, r * 0.22f, r, ambient)
        drawDate(canvas, cx, cy, r, zonedDateTime, ambient)
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.render(canvas, zonedDateTime, renderParameters)
        }
        // Accesos (PulsoMedia, PulsoMusic…) con su aro
        for (spot in Config.spots) {
            val x = cx + spot.x * r
            val y = cy + spot.y * r
            if (!ambient) {
                fill.color = Color.rgb(23, 25, 20)
                canvas.drawCircle(x, y, r * 0.078f, fill)
            }
            stroke.color = if (ambient) Color.GRAY else oliveDark
            stroke.strokeWidth = r * 0.01f
            canvas.drawCircle(x, y, r * 0.078f, stroke)
        }
        Shortcuts.drawAll(canvas, context, Config.spots, cx, cy, r, r * 0.065f, copper, ambient)
        drawHands(canvas, cx, cy, r, zonedDateTime, ambient)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ExplorerAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }

    private fun drawDial(canvas: Canvas, cx: Float, cy: Float, r: Float, ambient: Boolean) {
        if (ambient) return
        val shader = dialShader ?: RadialGradient(cx, cy, r * 0.84f, Color.rgb(42, 46, 34), Color.rgb(18, 20, 15), Shader.TileMode.CLAMP).also { dialShader = it }
        fill.shader = shader
        canvas.drawCircle(cx, cy, r * 0.84f, fill)
        fill.shader = null
        val size = (r * 2).toInt()
        val bmp = topo ?: Topo.draw(size).also { topo = it }
        canvas.save()
        path.reset()
        path.addCircle(cx, cy, r * 0.835f, Path.Direction.CW)
        canvas.clipPath(path)
        canvas.drawBitmap(bmp, cx - r, cy - r, null)
        canvas.restore()
        // Pista de minutos
        for (i in 0 until 60) {
            val five = i % 5 == 0
            stroke.color = if (five) oliveLight else oliveDark
            stroke.strokeWidth = r * (if (five) 0.012f else 0.007f)
            canvas.save()
            canvas.rotate(i * 6f, cx, cy)
            canvas.drawLine(cx, cy - r * 0.83f, cx, cy - r * (if (five) 0.785f else 0.805f), stroke)
            canvas.restore()
        }
    }

    private fun drawBezel(canvas: Canvas, cx: Float, cy: Float, r: Float, ambient: Boolean) {
        if (!ambient) {
            fill.color = Color.rgb(28, 30, 24)
            path.reset()
            path.fillType = Path.FillType.EVEN_ODD
            path.addCircle(cx, cy, r, Path.Direction.CW)
            path.addCircle(cx, cy, r * 0.84f, Path.Direction.CW)
            canvas.drawPath(path, fill)
            path.fillType = Path.FillType.WINDING
            stroke.color = Color.rgb(70, 76, 58)
            stroke.strokeWidth = r * 0.014f
            canvas.drawCircle(cx, cy, r * 0.993f, stroke)
            stroke.strokeWidth = r * 0.008f
            stroke.color = Color.rgb(48, 52, 40)
            canvas.drawCircle(cx, cy, r * 0.84f, stroke)
        }
        canvas.save()
        canvas.rotate(bezelAngle, cx, cy)
        val letters = mapOf(0 to "N", 45 to "NE", 90 to "E", 135 to "SE", 180 to "S", 225 to "SO", 270 to "O", 315 to "NO")
        for (deg in 0 until 360 step 5) {
            canvas.save()
            canvas.rotate(deg.toFloat(), cx, cy)
            val letter = letters[deg]
            when {
                letter != null -> {
                    val cardinal = deg % 90 == 0
                    text.textSize = r * (if (cardinal) 0.085f else 0.062f)
                    text.color = when {
                        ambient -> if (deg == 0) Color.WHITE else Color.GRAY
                        deg == 0 && compassOn -> orange
                        else -> copper
                    }
                    canvas.drawText(letter, cx, cy - r * 0.92f + text.textSize * 0.36f, text)
                    if (deg == 0 && !ambient) {
                        fill.color = text.color
                        canvas.drawCircle(cx, cy - r * 0.855f, r * 0.012f, fill)
                    }
                }
                deg % 30 == 0 && !ambient -> {
                    text.textSize = r * 0.05f
                    text.color = oliveLight
                    canvas.drawText(deg.toString(), cx, cy - r * 0.92f + text.textSize * 0.36f, text)
                }
                !ambient -> {
                    val long = deg % 10 == 0
                    stroke.color = if (long) copper else oliveDark
                    stroke.strokeWidth = r * (if (long) 0.009f else 0.006f)
                    canvas.drawLine(cx, cy - r * 0.965f, cx, cy - r * (if (long) 0.895f else 0.925f), stroke)
                }
            }
            canvas.restore()
        }
        canvas.restore()
        // Marca fija arriba: con la brújula, hacia dónde mira el reloj
        if (compassOn && !ambient) {
            fill.color = orange
            path.reset()
            path.moveTo(cx, cy - r * 0.835f)
            path.lineTo(cx - r * 0.025f, cy - r * 0.79f)
            path.lineTo(cx + r * 0.025f, cy - r * 0.79f)
            path.close()
            canvas.drawPath(path, fill)
        }
    }

    private fun drawIndices(canvas: Canvas, cx: Float, cy: Float, r: Float, ambient: Boolean) {
        val w = r * 0.055f
        for (h in 0 until 12) {
            canvas.save()
            canvas.rotate(h * 30f, cx, cy)
            val offsets = if (h == 0) listOf(-w * 0.75f, w * 0.75f) else listOf(0f)
            for (dx in offsets) {
                val rect = RectF(cx + dx - w / 2, cy - r * 0.76f, cx + dx + w / 2, cy - r * 0.62f)
                if (!ambient) {
                    fill.color = Color.rgb(84, 86, 78)
                    canvas.drawRoundRect(RectF(rect.left - w * 0.18f, rect.top - w * 0.18f, rect.right + w * 0.18f, rect.bottom + w * 0.18f), w * 0.3f, w * 0.3f, fill)
                    fill.color = lume
                    canvas.drawRoundRect(rect, w * 0.2f, w * 0.2f, fill)
                } else {
                    stroke.color = Color.LTGRAY
                    stroke.strokeWidth = r * 0.008f
                    canvas.drawRoundRect(rect, w * 0.2f, w * 0.2f, stroke)
                }
            }
            canvas.restore()
        }
    }

    private fun drawLabels(canvas: Canvas, cx: Float, cy: Float, r: Float, ambient: Boolean, az: Float?) {
        if (ambient) return
        text.textSize = r * 0.105f
        text.color = olive
        text.letterSpacing = 0.06f
        canvas.drawText("EXPLORER", cx, cy - r * 0.36f, text)
        text.letterSpacing = 0f
        Brand.draw(canvas, cx, cy - r * 0.31f, r * 0.036f, oliveDark)
        if (compassOn) {
            text.textSize = r * 0.05f
            text.color = copper
            val label = when {
                !sensors.hasCompass -> "SIN BRÚJULA"
                az == null -> "BRÚJULA…"
                else -> "${az.toInt()}° ${dir(az)}"
            }
            canvas.drawText(label, cx, cy - r * 0.245f, text)
        }
    }

    private fun dir(az: Float) = arrayOf("N", "NE", "E", "SE", "S", "SO", "O", "NO")[(((az + 22.5f) % 360f) / 45f).toInt() % 8]

    private fun drawSubdialFrame(canvas: Canvas, x: Float, y: Float, rr: Float, r: Float, ambient: Boolean) {
        if (!ambient) {
            fill.color = Color.rgb(23, 25, 20)
            canvas.drawCircle(x, y, rr, fill)
        }
        stroke.color = if (ambient) Color.GRAY else oliveDark
        stroke.strokeWidth = r * 0.014f
        canvas.drawCircle(x, y, rr, stroke)
        if (ambient) return
        for (i in 0 until 24) {
            canvas.save()
            canvas.rotate(i * 15f, x, y)
            val big = i % 6 == 0
            stroke.color = if (big) ink else copper
            stroke.strokeWidth = r * (if (big) 0.01f else 0.006f)
            canvas.drawLine(x, y - rr * 0.92f, x, y - rr * (if (big) 0.76f else 0.82f), stroke)
            canvas.restore()
        }
    }

    private fun drawAltitude(canvas: Canvas, x: Float, y: Float, r: Float, ambient: Boolean) {
        val rr = r * 0.22f
        drawSubdialFrame(canvas, x, y, rr, r, ambient)
        if (!ambient) {
            // Montañas
            fill.color = copper
            path.reset()
            val my = y - rr * 0.30f
            path.moveTo(x - rr * 0.38f, my)
            path.lineTo(x - rr * 0.12f, my - rr * 0.34f)
            path.lineTo(x, my - rr * 0.18f)
            path.lineTo(x + rr * 0.14f, my - rr * 0.40f)
            path.lineTo(x + rr * 0.40f, my)
            path.close()
            canvas.drawPath(path, fill)
        }
        text.textSize = r * 0.06f
        text.color = if (ambient) Color.GRAY else oliveLight
        canvas.drawText("ALT", x, y + rr * 0.10f, text)
        text.textSize = r * 0.072f
        text.color = if (ambient) Color.LTGRAY else ink
        val alt = sensors.altitude
        canvas.drawText(if (alt == null) "-- m" else String.format(Locale.getDefault(), "%,d m", alt.toInt()), x, y + rr * 0.50f, text)
    }

    private fun drawDate(canvas: Canvas, cx: Float, cy: Float, r: Float, time: ZonedDateTime, ambient: Boolean) {
        val day = time.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.getDefault()).replace(".", "").uppercase(Locale.getDefault())
        text.textSize = r * 0.075f
        text.color = if (ambient) Color.GRAY else oliveLight
        canvas.drawText(day, cx, cy + r * 0.44f, text)
        val box = RectF(cx - r * 0.09f, cy + r * 0.48f, cx + r * 0.09f, cy + r * 0.61f)
        if (!ambient) {
            fill.color = Color.rgb(18, 20, 16)
            canvas.drawRoundRect(box, r * 0.015f, r * 0.015f, fill)
        }
        stroke.color = if (ambient) Color.GRAY else oliveDark
        stroke.strokeWidth = r * 0.008f
        canvas.drawRoundRect(box, r * 0.015f, r * 0.015f, stroke)
        text.textSize = r * 0.09f
        text.color = if (ambient) Color.LTGRAY else ink
        canvas.drawText(time.dayOfMonth.toString(), cx, box.centerY() + text.textSize * 0.36f, text)
    }

    private fun hand(canvas: Canvas, cx: Float, cy: Float, angle: Float, length: Float, width: Float, tail: Float, ambient: Boolean, r: Float) {
        canvas.save()
        canvas.rotate(angle, cx, cy)
        path.reset()
        path.moveTo(cx - width / 2, cy + tail)
        path.lineTo(cx - width / 2, cy - length * 0.78f)
        path.lineTo(cx, cy - length)
        path.lineTo(cx + width / 2, cy - length * 0.78f)
        path.lineTo(cx + width / 2, cy + tail)
        path.close()
        if (ambient) {
            stroke.color = Color.LTGRAY
            stroke.strokeWidth = r * 0.012f
            canvas.drawPath(path, stroke)
        } else {
            fill.color = metal
            fill.setShadowLayer(r * 0.025f, r * 0.01f, r * 0.015f, Color.argb(160, 0, 0, 0))
            canvas.drawPath(path, fill)
            fill.clearShadowLayer()
            stroke.color = Color.rgb(58, 59, 55)
            stroke.strokeWidth = r * 0.008f
            canvas.drawPath(path, stroke)
            fill.color = lume
            val lw = width * 0.56f
            canvas.drawRoundRect(RectF(cx - lw / 2, cy - length * 0.80f, cx + lw / 2, cy - length * 0.32f), lw * 0.2f, lw * 0.2f, fill)
        }
        canvas.restore()
    }

    private fun drawHands(canvas: Canvas, cx: Float, cy: Float, r: Float, t: ZonedDateTime, ambient: Boolean) {
        val sec = t.second
        val mins = t.minute + sec / 60f
        val hour = (t.hour % 12) + mins / 60f
        hand(canvas, cx, cy, hour * 30f, r * 0.50f, r * 0.08f, r * 0.10f, ambient, r)
        hand(canvas, cx, cy, mins * 6f, r * 0.74f, r * 0.06f, r * 0.10f, ambient, r)
        if (!ambient) {
            canvas.save()
            canvas.rotate(sec * 6f, cx, cy)
            stroke.color = metal
            stroke.strokeWidth = r * 0.012f
            canvas.drawLine(cx, cy + r * 0.20f, cx, cy - r * 0.62f, stroke)
            stroke.color = orange
            stroke.strokeWidth = r * 0.016f
            canvas.drawLine(cx, cy - r * 0.62f, cx, cy - r * 0.80f, stroke)
            canvas.restore()
        }
        fill.color = if (ambient) Color.GRAY else metal
        canvas.drawCircle(cx, cy, r * 0.04f, fill)
        fill.color = Color.rgb(40, 41, 38)
        canvas.drawCircle(cx, cy, r * 0.016f, fill)
    }
}
