package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
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
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.min

private const val TOP = 101
private const val LEFT = 102
private const val BOTTOM = 103

/** Círculos de datos y accesos a PulsoMedia y PulsoMusic (los cambia Personalizar) */
object Config : FaceConfig {
    override val slots = listOf(TOP to "Círculo de arriba", LEFT to "Círculo izquierdo", BOTTOM to "Círculo de abajo")
    override val spots = listOf(
        Spot(0.29f, -0.29f, Action.MEDIA, "Acceso de arriba"),
        Spot(0.29f, 0.29f, Action.MUSIC, "Acceso de abajo"),
    )
}

private val ORANGE = Color.rgb(255, 122, 26)
private val BEIGE = Color.rgb(216, 210, 191)
private val LUME = Color.rgb(236, 236, 222)

/** Centro y radio de cada círculo (en fracciones del radio de la esfera) */
private val CIRCLES = mapOf(TOP to Triple(0f, -0.34f, 0.21f), LEFT to Triple(-0.40f, 0f, 0.21f), BOTTOM to Triple(0f, 0.40f, 0.21f))

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener ->
            val d = ComplicationDrawable(this)
            for ((i, s) in listOf(d.activeStyle, d.ambientStyle).withIndex()) style(s, i == 1)
            CanvasComplicationDrawable(d, watchState, listener)
        }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE, ComplicationType.SMALL_IMAGE)
        val defaults = mapOf(
            // El ritmo cardíaco lo da Samsung Health o Google (se elige en Personalizar); por defecto, la batería
            TOP to DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_WATCH_BATTERY, ComplicationType.SHORT_TEXT),
            // El clima no es un dato del sistema: se elige en Personalizar (el del reloj o el de Samsung/Google)
            LEFT to DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_SUNRISE_SUNSET, ComplicationType.SHORT_TEXT),
            BOTTOM to DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
        )
        val slots = CIRCLES.map { (id, c) ->
            val (x, y, rad) = c
            // Zona del dato: el interior del círculo (la esfera usa 0..1 de ancho y alto)
            val half = rad * 0.5f * 0.72f
            val cx = 0.5f + x * 0.5f
            val cy = 0.5f + y * 0.5f
            ComplicationSlot.createRoundRectComplicationSlotBuilder(
                id, factory, types, defaults.getValue(id),
                ComplicationSlotBounds(RectF(cx - half, cy - half, cx + half, cy + half)),
            ).build()
        }
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    private fun style(s: ComplicationStyle, ambient: Boolean) {
        s.backgroundColor = Color.TRANSPARENT
        s.borderStyle = ComplicationStyle.BORDER_STYLE_NONE
        s.textColor = if (ambient) Color.LTGRAY else LUME
        s.titleColor = if (ambient) Color.GRAY else BEIGE
        s.iconColor = if (ambient) Color.LTGRAY else ORANGE
        s.rangedValuePrimaryColor = if (ambient) Color.LTGRAY else ORANGE
        s.rangedValueSecondaryColor = Color.rgb(50, 50, 50)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = ChronoRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.ANALOG, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos, 0.09f)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class ChronoAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Cronógrafo deportivo: bisel taquímetro, fondo de fibra de carbono, tres círculos de datos y fecha */
class ChronoRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<ChronoAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = ChronoAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    }
    private val path = Path()
    private var carbon: BitmapShader? = null
    private var carbonFor = 0f
    private val battery = context.getSystemService(BatteryManager::class.java)
    var lastBounds = Rect()
        private set

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ChronoAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        canvas.drawColor(Color.BLACK)
        if (!ambient) {
            drawBezel(canvas, cx, cy, r)
            drawDial(canvas, cx, cy, r)
        }
        drawChapter(canvas, cx, cy, r, ambient)
        drawIndices(canvas, cx, cy, r, ambient)
        drawNumerals(canvas, cx, cy, r, ambient)
        for ((id, c) in CIRCLES) drawCircleFrame(canvas, cx + c.first * r, cy + c.second * r, c.third * r, r, ambient, id)
        drawDate(canvas, cx, cy, r, zonedDateTime, ambient)
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.render(canvas, zonedDateTime, renderParameters)
        }
        // Accesos (PulsoMedia, PulsoMusic…) con su aro, y la marca sobre la fecha
        for (spot in Config.spots) {
            val x = cx + spot.x * r
            val y = cy + spot.y * r
            fill.color = Color.BLACK
            canvas.drawCircle(x, y, r * 0.072f, fill)
            stroke.color = if (ambient) Color.GRAY else ORANGE
            stroke.strokeWidth = r * 0.008f
            canvas.drawCircle(x, y, r * 0.072f, stroke)
        }
        Shortcuts.drawAll(canvas, context, Config.spots, cx, cy, r, r * 0.06f, ORANGE, ambient)
        val brandColor = if (ambient) Color.GRAY else BEIGE
        Brand.draw(canvas, cx + r * 0.385f, cy - r * 0.135f, r * 0.042f, brandColor, "CARLOS P. NAUTO")
        Brand.draw(canvas, cx + r * 0.385f, cy - r * 0.088f, r * 0.036f, brandColor, "INTERACTIVE")
        drawHands(canvas, cx, cy, r, zonedDateTime, ambient)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ChronoAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }

    /** Escala taquimétrica: velocidad (por hora) según los segundos que tarda en recorrer 1 km/milla */
    private fun drawBezel(canvas: Canvas, cx: Float, cy: Float, r: Float) {
        fill.color = Color.rgb(20, 20, 20)
        canvas.drawCircle(cx, cy, r, fill)
        stroke.color = Color.rgb(60, 60, 60)
        stroke.strokeWidth = r * 0.012f
        canvas.drawCircle(cx, cy, r * 0.994f, stroke)
        stroke.color = Color.rgb(45, 45, 45)
        canvas.drawCircle(cx, cy, r * 0.86f, stroke)
        val labels = listOf(400, 300, 240, 200, 180, 160, 140, 120, 110, 100, 90, 80, 75, 70, 65)
        text.textSize = r * 0.058f
        for (v in labels) {
            val deg = 3600f / v * 6f
            val bottom = deg > 100f && deg < 260f
            canvas.save()
            canvas.rotate(if (bottom) deg + 180f else deg, cx, cy)
            text.color = BEIGE
            val y = if (bottom) cy + r * 0.93f + text.textSize * 0.36f else cy - r * 0.93f + text.textSize * 0.36f
            canvas.drawText(v.toString(), cx, y, text)
            canvas.restore()
            canvas.save()
            canvas.rotate(deg, cx, cy)
            fill.color = ORANGE
            canvas.drawRect(cx - r * 0.008f, cy - r * 0.875f, cx + r * 0.008f, cy - r * 0.862f, fill)
            canvas.restore()
        }
        // Rayas pequeñas entre las cifras
        stroke.color = ORANGE
        stroke.strokeWidth = r * 0.008f
        for (v in listOf(500, 450, 350, 275, 260, 220, 190, 170, 150, 130, 115, 105, 95, 85)) {
            canvas.save()
            canvas.rotate(3600f / v * 6f, cx, cy)
            canvas.drawLine(cx, cy - r * 0.965f, cx, cy - r * 0.94f, stroke)
            canvas.restore()
        }
        // «TACHYMETER» siguiendo el borde, arriba a la derecha
        text.textSize = r * 0.07f
        text.color = BEIGE
        text.letterSpacing = 0.08f
        text.textAlign = Paint.Align.LEFT
        path.reset()
        val rr = r * 0.905f
        path.addArc(RectF(cx - rr, cy - rr, cx + rr, cy + rr), -78f, 60f)
        canvas.drawTextOnPath("TACHYMETER", path, 0f, text.textSize * 0.36f, text)
        text.textAlign = Paint.Align.CENTER
        text.letterSpacing = 0f
        // Triángulo de las 12
        triangle(canvas, cx, cy - r * 0.86f, r * 0.05f)
    }

    private fun triangle(canvas: Canvas, x: Float, yTip: Float, s: Float) {
        fill.color = ORANGE
        path.reset()
        path.moveTo(x, yTip)
        path.lineTo(x - s * 0.6f, yTip - s)
        path.lineTo(x + s * 0.6f, yTip - s)
        path.close()
        canvas.drawPath(path, fill)
    }

    private fun carbonShader(r: Float): BitmapShader {
        carbon?.let { if (carbonFor == r) return it }
        val t = (r * 0.06f).toInt().coerceAtLeast(8)
        val bmp = Bitmap.createBitmap(t * 2, t * 2, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint()
        val dark = Color.rgb(16, 16, 16)
        val light = Color.rgb(46, 46, 46)
        for (qy in 0..1) for (qx in 0..1) {
            val x0 = qx * t.toFloat()
            val y0 = qy * t.toFloat()
            val horizontal = (qx + qy) % 2 == 0
            p.shader = if (horizontal) LinearGradient(x0, y0, x0, y0 + t, dark, light, Shader.TileMode.MIRROR)
            else LinearGradient(x0, y0, x0 + t, y0, dark, light, Shader.TileMode.MIRROR)
            c.drawRect(x0 + 0.5f, y0 + 0.5f, x0 + t - 0.5f, y0 + t - 0.5f, p)
        }
        return BitmapShader(bmp, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT).also { carbon = it; carbonFor = r }
    }

    private fun drawDial(canvas: Canvas, cx: Float, cy: Float, r: Float) {
        fill.shader = carbonShader(r)
        canvas.drawCircle(cx, cy, r * 0.78f, fill)
        fill.shader = null
        stroke.color = Color.rgb(10, 10, 10)
        stroke.strokeWidth = r * 0.03f
        canvas.drawCircle(cx, cy, r * 0.765f, stroke)
        // Tornillos
        for (a in listOf(45f, 135f, 225f, 315f)) {
            canvas.save()
            canvas.rotate(a, cx, cy)
            fill.color = Color.rgb(30, 30, 30)
            canvas.drawCircle(cx, cy - r * 0.66f, r * 0.03f, fill)
            stroke.color = Color.rgb(70, 70, 70)
            stroke.strokeWidth = r * 0.006f
            canvas.drawCircle(cx, cy - r * 0.66f, r * 0.03f, stroke)
            canvas.drawLine(cx - r * 0.018f, cy - r * 0.66f, cx + r * 0.018f, cy - r * 0.66f, stroke)
            canvas.restore()
        }
    }

    /** Pista de segundos: blancas cada segundo y naranjas entre medio */
    private fun drawChapter(canvas: Canvas, cx: Float, cy: Float, r: Float, ambient: Boolean) {
        for (i in 0 until 300) {
            val sec = i % 5 == 0
            if (ambient && !sec) continue
            canvas.save()
            canvas.rotate(i * 1.2f, cx, cy)
            stroke.color = if (sec) (if (ambient) Color.GRAY else LUME) else ORANGE
            stroke.strokeWidth = r * (if (sec) 0.008f else 0.004f)
            canvas.drawLine(cx, cy - r * 0.845f, cx, cy - r * (if (sec) 0.79f else 0.815f), stroke)
            canvas.restore()
        }
        if (!ambient) triangle(canvas, cx, cy - r * 0.775f, r * 0.045f)
    }

    private fun bar(canvas: Canvas, rect: RectF, frame: Int, ambient: Boolean, r: Float) {
        val pad = r * 0.012f
        if (ambient) {
            stroke.color = Color.LTGRAY
            stroke.strokeWidth = r * 0.007f
            canvas.drawRect(rect, stroke)
            return
        }
        fill.color = frame
        canvas.drawRoundRect(RectF(rect.left - pad, rect.top - pad, rect.right + pad, rect.bottom + pad), pad, pad, fill)
        fill.color = LUME
        canvas.drawRoundRect(rect, pad * 0.6f, pad * 0.6f, fill)
    }

    private fun drawIndices(canvas: Canvas, cx: Float, cy: Float, r: Float, ambient: Boolean) {
        val w = r * 0.04f
        for (h in 0 until 12) {
            canvas.save()
            canvas.rotate(h * 30f, cx, cy)
            when (h) {
                0 -> for (k in -1..1) {
                    val x = cx + k * w * 1.6f
                    val rect = RectF(x - w / 2, cy - r * 0.74f, x + w / 2, cy - r * 0.62f)
                    if (k == 0 && !ambient) { fill.color = ORANGE; canvas.drawRect(rect, fill) } else bar(canvas, rect, Color.rgb(90, 90, 90), ambient, r)
                }
                3, 6, 9 -> bar(canvas, RectF(cx - w * 0.6f, cy - r * 0.75f, cx + w * 0.6f, cy - r * 0.62f), ORANGE, ambient, r)
                else -> bar(canvas, RectF(cx - w * 0.6f, cy - r * 0.745f, cx + w * 0.6f, cy - r * 0.68f), Color.rgb(90, 90, 90), ambient, r)
            }
            canvas.restore()
        }
    }

    private fun drawNumerals(canvas: Canvas, cx: Float, cy: Float, r: Float, ambient: Boolean) {
        text.textSize = r * 0.13f
        text.color = if (ambient) Color.GRAY else BEIGE
        for (h in listOf(1, 2, 4, 5, 7, 8, 10, 11)) {
            val a = Math.toRadians(h * 30.0)
            val x = cx + (r * 0.56f * kotlin.math.sin(a)).toFloat()
            val y = cy - (r * 0.56f * kotlin.math.cos(a)).toFloat()
            canvas.drawText(h.toString(), x, y + text.textSize * 0.36f, text)
        }
    }

    private fun drawCircleFrame(canvas: Canvas, x: Float, y: Float, rr: Float, r: Float, ambient: Boolean, id: Int) {
        fill.color = Color.BLACK
        canvas.drawCircle(x, y, rr, fill)
        if (!ambient) {
            // Anillos finos como de disco
            stroke.strokeWidth = r * 0.003f
            stroke.color = Color.rgb(28, 28, 28)
            var k = rr * 0.3f
            while (k < rr * 0.72f) { canvas.drawCircle(x, y, k, stroke); k += r * 0.012f }
            stroke.color = Color.rgb(58, 58, 58)
            stroke.strokeWidth = r * 0.016f
            canvas.drawCircle(x, y, rr, stroke)
            for (i in 0 until 60) {
                canvas.save()
                canvas.rotate(i * 6f, x, y)
                val q = i % 15 == 0
                stroke.color = if (q) ORANGE else if (i % 5 == 0) LUME else Color.rgb(120, 120, 110)
                stroke.strokeWidth = r * (if (q) 0.01f else 0.004f)
                canvas.drawLine(x, y - rr * 0.92f, x, y - rr * (if (q || i % 5 == 0) 0.76f else 0.84f), stroke)
                canvas.restore()
            }
        } else {
            stroke.color = Color.GRAY
            stroke.strokeWidth = r * 0.008f
            canvas.drawCircle(x, y, rr, stroke)
        }
        // Sin dato elegido: cómo elegirlo
        val slot = complications.complicationSlots[id] ?: return
        val type = slot.complicationData.value.type
        if (type == ComplicationType.NO_DATA || type == ComplicationType.EMPTY) {
            text.textSize = r * 0.045f
            text.color = Color.GRAY
            canvas.drawText("Elige un dato", x, y - text.textSize * 0.2f, text)
            canvas.drawText("en Personalizar", x, y + text.textSize * 1.0f, text)
        }
    }

    private fun drawDate(canvas: Canvas, cx: Float, cy: Float, r: Float, t: ZonedDateTime, ambient: Boolean) {
        val day = t.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.getDefault()).replace(".", "").uppercase(Locale.getDefault())
        val h = r * 0.13f
        val dayBox = RectF(cx + r * 0.18f, cy - h / 2, cx + r * 0.42f, cy + h / 2)
        val dateBox = RectF(dayBox.right + r * 0.02f, cy - h / 2, dayBox.right + r * 0.17f, cy + h / 2)
        for (b in listOf(dayBox, dateBox)) {
            fill.color = Color.rgb(12, 12, 12)
            canvas.drawRoundRect(b, r * 0.015f, r * 0.015f, fill)
            stroke.color = if (ambient) Color.GRAY else Color.rgb(70, 70, 70)
            stroke.strokeWidth = r * 0.008f
            canvas.drawRoundRect(b, r * 0.015f, r * 0.015f, stroke)
        }
        text.textSize = r * 0.09f
        text.color = if (ambient) Color.LTGRAY else LUME
        canvas.drawText(day, dayBox.centerX(), cy + text.textSize * 0.36f, text)
        canvas.drawText(t.dayOfMonth.toString(), dateBox.centerX(), cy + text.textSize * 0.36f, text)
        if (!ambient) {
            val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            if (pct in 0..100) {
                text.textSize = r * 0.05f
                text.color = BEIGE
                canvas.drawText("BATERÍA $pct%", (dayBox.left + dateBox.right) / 2, cy + h / 2 + r * 0.075f, text)
            }
        }
    }

    private fun hand(canvas: Canvas, cx: Float, cy: Float, angle: Float, len: Float, w: Float, ambient: Boolean, r: Float) {
        canvas.save()
        canvas.rotate(angle, cx, cy)
        path.reset()
        path.moveTo(cx - w * 0.25f, cy + r * 0.06f)
        path.lineTo(cx - w / 2, cy - len * 0.35f)
        path.lineTo(cx - w / 2, cy - len * 0.86f)
        path.lineTo(cx, cy - len)
        path.lineTo(cx + w / 2, cy - len * 0.86f)
        path.lineTo(cx + w / 2, cy - len * 0.35f)
        path.lineTo(cx + w * 0.25f, cy + r * 0.06f)
        path.close()
        if (ambient) {
            stroke.color = Color.LTGRAY
            stroke.strokeWidth = r * 0.01f
            canvas.drawPath(path, stroke)
        } else {
            fill.color = ORANGE
            fill.setShadowLayer(r * 0.025f, r * 0.01f, r * 0.015f, Color.argb(170, 0, 0, 0))
            canvas.drawPath(path, fill)
            fill.clearShadowLayer()
            // Esqueleto: centro hueco y luminiscente en la punta
            fill.color = Color.rgb(20, 20, 20)
            canvas.drawRect(cx - w * 0.22f, cy - len * 0.34f, cx + w * 0.22f, cy - len * 0.02f, fill)
            fill.color = LUME
            canvas.drawRoundRect(RectF(cx - w * 0.3f, cy - len * 0.84f, cx + w * 0.3f, cy - len * 0.40f), w * 0.1f, w * 0.1f, fill)
        }
        canvas.restore()
    }

    private fun drawHands(canvas: Canvas, cx: Float, cy: Float, r: Float, t: ZonedDateTime, ambient: Boolean) {
        val mins = t.minute + t.second / 60f
        val hour = (t.hour % 12) + mins / 60f
        hand(canvas, cx, cy, hour * 30f, r * 0.46f, r * 0.085f, ambient, r)
        hand(canvas, cx, cy, mins * 6f, r * 0.72f, r * 0.065f, ambient, r)
        if (!ambient) {
            canvas.save()
            canvas.rotate(t.second * 6f, cx, cy)
            stroke.color = ORANGE
            stroke.strokeWidth = r * 0.012f
            canvas.drawLine(cx, cy + r * 0.18f, cx, cy - r * 0.80f, stroke)
            canvas.restore()
        }
        fill.color = Color.rgb(28, 28, 28)
        canvas.drawCircle(cx, cy, r * 0.045f, fill)
        stroke.color = if (ambient) Color.GRAY else Color.rgb(80, 80, 80)
        stroke.strokeWidth = r * 0.006f
        canvas.drawCircle(cx, cy, r * 0.045f, stroke)
        fill.color = if (ambient) Color.GRAY else ORANGE
        canvas.drawCircle(cx, cy, r * 0.014f, fill)
    }
}
