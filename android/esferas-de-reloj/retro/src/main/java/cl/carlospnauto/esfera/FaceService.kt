package cl.carlospnauto.esfera

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.CornerPathEffect
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
import androidx.core.content.ContextCompat
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
import kotlin.math.min

private const val STEPS = 101
private const val TEMP = 102
private const val HEART = 103

private val SCREEN = Choice("pantalla", "Pantalla", listOf("Clásica gris" to 0, "Invertida" to 1, "Luz azul" to 2))
private val DIGITS = Choice(
    "digitos", "Dígitos (invertida)",
    listOf(
        "Naranja" to Color.rgb(255, 122, 26), "Blanco" to Color.rgb(235, 240, 225), "Verde" to Color.rgb(80, 240, 120),
        "Ámbar" to Color.rgb(255, 190, 40), "Cian" to Color.rgb(60, 220, 255), "Rojo" to Color.rgb(255, 50, 50),
    ),
)
private val FRONT = Choice("frente", "Frente", listOf("A color" to 0, "Blanco y negro" to 1))
private val FRAME = Choice(
    "marco", "Marco",
    listOf(
        "Blanco" to Color.rgb(225, 225, 230), "Apagado" to Color.TRANSPARENT, "Naranja" to Color.rgb(255, 130, 30),
        "Azul" to Color.rgb(50, 120, 255), "Rojo" to Color.rgb(230, 40, 40), "Dorado" to Color.rgb(220, 180, 70),
    ),
)
private val TEMPERATURE = Choice("temp", "Temperatura", listOf("Batería °C" to 0, "Batería °F" to 1, "Clima" to 2))

object Config : FaceConfig {
    override val slots = listOf(STEPS to "Pasos", TEMP to "Clima (si eliges «Clima»)", HEART to "Ritmo cardíaco")
    override val spots = listOf(
        Spot(0f, -0.80f, Action.MEDIA, "Acceso de arriba (con ícono)", hit = 0.12f),
        Spot(-0.64f, -0.64f, Action.MUSIC, "Esquina arriba izquierda", hit = 0.15f),
        Spot(0.64f, -0.64f, Action.ALARMS, "Esquina arriba derecha", hit = 0.15f),
        Spot(-0.64f, 0.64f, Action.TIMER, "Esquina abajo izquierda", hit = 0.15f),
        Spot(0.64f, 0.64f, Action.SETTINGS, "Esquina abajo derecha", hit = 0.15f),
        Spot(-0.49f, -0.31f, Action.SETTINGS, "Ícono de la pantalla", hit = 0.08f),
    )
    override val choices = listOf(SCREEN, DIGITS, FRONT, FRAME, TEMPERATURE)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        // Los datos se escriben con las letras de la esfera; el círculo solo da el valor y abre su app al tocarlo
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        fun slot(id: Int, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, types, policy, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            slot(STEPS, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.20f, 0.75f, 0.38f, 0.81f)),
            slot(TEMP, DefaultComplicationDataSourcePolicy(), RectF(0.39f, 0.75f, 0.54f, 0.81f)),
            slot(HEART, DefaultComplicationDataSourcePolicy(), RectF(0.68f, 0.75f, 0.80f, 0.81f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = RetroRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class RetroAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/** Reloj digital retro con pantalla de cristal líquido, marco octogonal y botones rotulados */
class RetroRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<RetroAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = RetroAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND; strokeCap = Paint.Cap.ROUND }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
    }
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    var lastBounds = Rect()
        private set

    private var corners: CornerPathEffect? = null
    private var tempAt = 0L
    private var batteryTemp = Float.NaN

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

    /** Temperatura de la batería (se lee cada 30 s) */
    private fun batteryTemperature(): Float {
        val now = System.currentTimeMillis()
        if (now - tempAt > 30_000) {
            tempAt = now
            val i: Intent? = runCatching {
                ContextCompat.registerReceiver(context, null, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
            }.getOrNull()
            val t = i?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE) ?: Int.MIN_VALUE
            if (t != Int.MIN_VALUE) batteryTemp = t / 10f
        }
        return batteryTemp
    }

    /**
     * Marco con lados curvos (como el bisel de los relojes digitales retro): arriba apenas arqueado,
     * costados abombados, abajo siguiendo la curva de la esfera y esquinas en diagonal suavizadas.
     */
    private fun framePath(cx: Float, cy: Float, r: Float) {
        val w = r * 0.78f
        val top = cy - r * 0.64f
        val bot = cy + r * 0.66f
        val c = r * 0.14f
        path.reset()
        path.moveTo(cx - w + c, top)
        path.quadTo(cx, top - r * 0.035f, cx + w - c, top)
        path.lineTo(cx + w, top + c)
        path.quadTo(cx + w + r * 0.05f, cy, cx + w, bot - c * 1.4f)
        path.lineTo(cx + w - c * 1.2f, bot - c * 0.25f)
        path.quadTo(cx, bot + r * 0.07f, cx - w + c * 1.2f, bot - c * 0.25f)
        path.lineTo(cx - w, bot - c * 1.4f)
        path.quadTo(cx - w - r * 0.05f, cy, cx - w, top + c)
        path.close()
    }

    private fun vertical(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, deg: Float) {
        canvas.save()
        canvas.rotate(deg, x, y)
        label.textSize = size
        label.color = color
        canvas.drawText(s, x, y + size * 0.36f, label)
        canvas.restore()
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: RetroAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val color = Choices.value(context, FRONT) == 0 && !ambient
        val yellow = if (color) Color.rgb(250, 215, 40) else Color.rgb(220, 220, 220)
        val sky = if (color) Color.rgb(90, 190, 255) else Color.rgb(220, 220, 220)
        val white = if (ambient) Color.GRAY else Color.rgb(235, 235, 235)
        canvas.drawColor(Color.BLACK)

        // Marco octogonal
        val frame = Choices.value(context, FRAME)
        if (Color.alpha(frame) > 0) {
            framePath(cx, cy, r)
            stroke.color = if (ambient) Color.DKGRAY else frame
            stroke.strokeWidth = r * 0.014f
            stroke.pathEffect = corners ?: CornerPathEffect(r * 0.06f).also { corners = it }
            canvas.drawPath(path, stroke)
            stroke.pathEffect = null
        }

        // Acceso de arriba con su ícono (PulsoMedia por defecto)
        if (!ambient) {
            val top = Config.spots[0]
            Shortcuts.draw(canvas, context, Shortcuts.get(context, 0, top), cx + top.x * r, cy + top.y * r, r * 0.06f, Color.WHITE, false)
        }

        // Rótulos del frente
        if (!ambient) {
            label.textAlign = Paint.Align.LEFT
            label.textSize = r * 0.085f
            label.color = Color.WHITE
            canvas.drawText("C.P.NAUTO", cx - r * 0.60f, cy - r * 0.50f, label)
            label.textAlign = Paint.Align.RIGHT
            label.textSize = r * 0.07f
            label.color = yellow
            canvas.drawText("DATA PULSO 50", cx + r * 0.60f, cy - r * 0.50f, label)
            label.textAlign = Paint.Align.CENTER
            label.textSize = r * 0.06f
            label.color = sky
            label.letterSpacing = 0.08f
            canvas.drawText("WATER RESIST", cx, cy - r * 0.425f, label)
            label.letterSpacing = 0f
            vertical(canvas, "ADJUST", cx - r * 0.70f, cy - r * 0.30f, r * 0.045f, white, 90f)
            vertical(canvas, "SELECT/MODE", cx - r * 0.70f, cy + r * 0.05f, r * 0.045f, yellow, 90f)
            vertical(canvas, "LIGHT", cx + r * 0.70f, cy - r * 0.30f, r * 0.045f, white, -90f)
            vertical(canvas, "◄ SET ►", cx + r * 0.70f, cy - r * 0.04f, r * 0.045f, yellow, -90f)
            vertical(canvas, "MEMO", cx + r * 0.70f, cy + r * 0.22f, r * 0.045f, white, -90f)
        }

        // Pantalla de cristal líquido
        val mode = if (ambient) 1 else Choices.value(context, SCREEN)
        val lcd = RectF(cx - r * 0.61f, cy - r * 0.39f, cx + r * 0.61f, cy + r * 0.335f)
        val on: Int
        val ghost: Int
        when (mode) {
            0 -> {
                fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.bottom, Color.rgb(176, 186, 166), Color.rgb(140, 152, 134), Shader.TileMode.CLAMP)
                on = Color.rgb(22, 34, 40)
                ghost = Color.argb(28, 22, 34, 40)
            }
            2 -> {
                fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.bottom, Color.rgb(110, 220, 250), Color.rgb(60, 185, 235), Shader.TileMode.CLAMP)
                on = Color.rgb(10, 28, 42)
                ghost = Color.argb(34, 10, 28, 42)
            }
            else -> {
                fill.shader = null
                fill.color = if (ambient) Color.BLACK else Color.rgb(12, 22, 24)
                on = if (ambient) Color.rgb(170, 170, 170) else Choices.value(context, DIGITS)
                ghost = if (ambient) 0 else Color.argb(26, Color.red(on), Color.green(on), Color.blue(on))
            }
        }
        canvas.drawRoundRect(lcd, r * 0.06f, r * 0.06f, fill)
        fill.shader = null

        // Íconos de la pantalla: nivel (barritas), «memo» y campana apagados
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        if (!ambient) {
            for (k in 0 until 5) {
                fill.color = if (pct >= 0 && pct >= k * 20 + 10) on else ghost
                val bx = cx - r * 0.55f + k * r * 0.03f
                canvas.drawRect(bx, cy - r * 0.34f, bx + r * 0.018f, cy - r * 0.28f, fill)
            }
            label.textAlign = Paint.Align.LEFT
            label.textSize = r * 0.04f
            label.color = ghost
            canvas.drawText("memo", cx - r * 0.55f, cy - r * 0.23f, label)
        }

        // Fila 1: día de la semana y año ('25) en puntos
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").take(3)
        val top = "$dow '${"%02d".format(t.year % 100)}"
        val p = r * 0.02f
        Lcd.dots(canvas, top, lcd.right - r * 0.05f - Lcd.dotsWidth(top, p), cy - r * 0.355f, p, on, ghost)
        stroke.color = if (mode == 1) Color.argb(60, 255, 255, 255) else Color.argb(90, 0, 0, 0)
        stroke.strokeWidth = r * 0.005f
        if (!ambient) canvas.drawLine(lcd.left + r * 0.03f, cy - r * 0.18f, lcd.right - r * 0.03f, cy - r * 0.18f, stroke)

        // Fila 2: fecha (día-mes) sobre «8» apagados
        val date = "${t.dayOfMonth}-${t.monthValue}"
        Lcd.row(canvas, date, lcd.right - r * 0.04f, cy - r * 0.155f, r * 0.08f, r * 0.12f, r * 0.025f, 8, on, ghost)

        // Fila 3: hora grande, segundos chicos e indicador P / 24
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
        val dw = r * 0.14f
        val dh = r * 0.25f
        val y3 = cy + r * 0.035f
        val x0 = cx - r * 0.44f
        Lcd.digit(canvas, h[0], x0, y3, dw, dh, on, ghost)
        Lcd.digit(canvas, h[1], x0 + dw * 1.2f, y3, dw, dh, on, ghost)
        Lcd.colon(canvas, x0 + dw * 2.42f, y3, dh, r * 0.018f, on)
        val m = "%02d".format(t.minute)
        Lcd.digit(canvas, m[0], x0 + dw * 2.75f, y3, dw, dh, on, ghost)
        Lcd.digit(canvas, m[1], x0 + dw * 3.95f, y3, dw, dh, on, ghost)
        if (!ambient) {
            val s = "%02d".format(t.second)
            val sw = r * 0.085f
            val sh = r * 0.16f
            Lcd.digit(canvas, s[0], cx + r * 0.33f, y3 + dh - sh, sw, sh, on, ghost)
            Lcd.digit(canvas, s[1], cx + r * 0.33f + sw * 1.25f, y3 + dh - sh, sw, sh, on, ghost)
            label.textAlign = Paint.Align.CENTER
            label.textSize = r * 0.04f
            label.color = ghost
            canvas.drawText("BATTERY", cx + r * 0.44f, y3 + r * 0.035f, label)
        }
        label.textAlign = Paint.Align.CENTER
        label.textSize = r * 0.055f
        if (is24) {
            label.color = on
            canvas.drawText("24", cx - r * 0.52f, y3 + r * 0.06f, label)
        } else {
            label.color = if (t.hour >= 12) on else ghost
            canvas.drawText("P", cx - r * 0.52f, y3 + r * 0.06f, label)
        }

        if (ambient) return

        // Medidor de «SELECT/MODE»: la batería en puntos
        for (k in 0 until 8) {
            fill.color = if (pct >= 0 && pct >= (7 - k) * 12.5f) sky else Color.rgb(60, 70, 80)
            canvas.drawRect(cx - r * 0.645f, cy - r * 0.08f + k * r * 0.03f, cx - r * 0.625f, cy - r * 0.08f + k * r * 0.03f + r * 0.018f, fill)
        }

        // Botones de abajo
        val blue = if (color) Color.rgb(30, 70, 190) else Color.rgb(70, 70, 70)
        val navy = if (color) Color.rgb(28, 34, 90) else Color.rgb(45, 45, 45)
        fill.color = blue
        canvas.drawRoundRect(RectF(cx - r * 0.66f, cy + r * 0.37f, cx - r * 0.43f, cy + r * 0.45f), r * 0.012f, r * 0.012f, fill)
        canvas.drawRoundRect(RectF(cx + r * 0.43f, cy + r * 0.37f, cx + r * 0.66f, cy + r * 0.45f), r * 0.012f, r * 0.012f, fill)
        fill.color = navy
        canvas.drawRect(cx - r * 0.41f, cy + r * 0.37f, cx + r * 0.41f, cy + r * 0.45f, fill)
        label.textAlign = Paint.Align.CENTER
        label.textSize = r * 0.05f
        label.color = Color.WHITE
        canvas.drawText("SCH", cx - r * 0.545f, cy + r * 0.43f, label)
        canvas.drawText("TEL", cx + r * 0.545f, cy + r * 0.43f, label)
        label.textSize = r * 0.065f
        label.color = yellow
        label.letterSpacing = 0.06f
        canvas.drawText("WORLD TIME", cx, cy + r * 0.435f, label)
        label.letterSpacing = 0f

        // Fila de datos: pasos · temperatura · batería · ritmo
        val steps = complications.textOf(STEPS, context.resources) ?: "--"
        val tempMode = Choices.value(context, TEMPERATURE)
        val temp = when (tempMode) {
            2 -> complications.textOf(TEMP, context.resources) ?: "--"
            else -> batteryTemperature().let { c ->
                if (c.isNaN()) "--" else if (tempMode == 1) "${(c * 9 / 5 + 32).toInt()}°F" else "${c.toInt()}°C"
            }
        }
        val hr = complications.textOf(HEART, context.resources) ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        val y = cy + r * 0.56f
        label.textSize = r * 0.075f
        label.color = Color.WHITE
        label.textAlign = Paint.Align.LEFT
        // Pasos (con unas huellas de puntos)
        fill.color = Color.WHITE
        for (k in 0 until 3) canvas.drawCircle(cx - r * 0.56f + k * r * 0.022f, y - r * 0.01f - k * r * 0.012f, r * 0.007f, fill)
        canvas.drawText(steps, cx - r * 0.48f, y, label)
        // Termómetro / pila / corazón
        val tx = cx - r * 0.18f
        stroke.color = Color.WHITE
        stroke.strokeWidth = r * 0.008f
        canvas.drawRoundRect(RectF(tx, y - r * 0.06f, tx + r * 0.03f, y), r * 0.006f, r * 0.006f, stroke)
        canvas.drawText(temp, tx + r * 0.045f, y, label)
        val bxx = cx + r * 0.13f
        fill.color = Color.WHITE
        canvas.drawRect(bxx, y - r * 0.055f, bxx + r * 0.028f, y, fill)
        canvas.drawRect(bxx + r * 0.008f, y - r * 0.064f, bxx + r * 0.02f, y - r * 0.055f, fill)
        canvas.drawText(if (pct >= 0) "$pct%" else "--", bxx + r * 0.04f, y, label)
        val hx = cx + r * 0.40f
        path.reset()
        val hs = r * 0.03f
        val hy = y - r * 0.03f
        path.moveTo(hx, hy + hs * 0.9f)
        path.cubicTo(hx - hs * 1.6f, hy - hs * 0.1f, hx - hs * 0.8f, hy - hs * 1.3f, hx, hy - hs * 0.45f)
        path.cubicTo(hx + hs * 0.8f, hy - hs * 1.3f, hx + hs * 1.6f, hy - hs * 0.1f, hx, hy + hs * 0.9f)
        path.close()
        fill.color = if (color) Color.rgb(240, 70, 60) else Color.WHITE
        canvas.drawPath(path, fill)
        canvas.drawText(hr, hx + r * 0.05f, y, label)
        label.textAlign = Paint.Align.CENTER

        Brand.draw(canvas, cx, cy + r * 0.78f, r * 0.032f, Color.rgb(120, 120, 120))
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: RetroAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
