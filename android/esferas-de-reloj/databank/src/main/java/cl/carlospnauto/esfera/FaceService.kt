package cl.carlospnauto.esfera

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.RadialGradient
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
import cl.carlospnauto.esfera.comun.Lcd
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
/** Color del frente (la placa de adentro del marco) */
private val PLATE = Choice(
    "placa", "Color del frente",
    listOf(
        "Azul marino" to Color.rgb(42, 50, 72), "Negro" to Color.rgb(22, 22, 24), "Verde oliva" to Color.rgb(48, 56, 40),
        "Rojo vino" to Color.rgb(70, 24, 30), "Gris acero" to Color.rgb(58, 62, 68), "Azul real" to Color.rgb(28, 50, 110),
    ),
)
/** Halo de luz alrededor del frente */
private val HALO = Choice(
    "halo", "Halo de luz",
    listOf(
        "Ámbar" to Color.rgb(230, 140, 40), "Azul" to Color.rgb(60, 140, 255), "Verde" to Color.rgb(70, 220, 120),
        "Rojo" to Color.rgb(240, 60, 60), "Violeta" to Color.rgb(170, 90, 255), "Blanco" to Color.rgb(230, 230, 230), "Sin halo" to Color.TRANSPARENT,
    ),
)
private val FRAME = Choice(
    "marco", "Marco",
    listOf(
        "Blanco" to Color.rgb(225, 225, 230), "Apagado" to Color.TRANSPARENT, "Naranja" to Color.rgb(255, 130, 30),
        "Azul" to Color.rgb(50, 120, 255), "Rojo" to Color.rgb(230, 40, 40), "Dorado" to Color.rgb(220, 180, 70),
    ),
)
private val TEMPERATURE = Choice("temp", "Temperatura", listOf("Batería °C" to 0, "Batería °F" to 1, "Clima" to 2))
/** Diseño: el Data Pulso clásico o la versión con calculadora en la pantalla */
private val DESIGN = Choice("diseno", "Diseño", listOf("Clásico" to 0, "Calculadora" to 1))
/** Pantalla del diseño Calculadora (fondo iluminado y dígitos) */
private val CALC_SCREEN = Choice(
    "cpantalla", "Pantalla (calculadora)",
    listOf(
        "Ámbar" to 0, "Gris clásica" to 1, "Luz azul" to 2, "Verde" to 3, "Invertida" to 4,
    ),
)

object Config : FaceConfig {
    override val slots = listOf(STEPS to "Pasos", TEMP to "Clima (si eliges «Clima»)", HEART to "Ritmo cardíaco")
    override val spots = listOf(
        Spot(0f, -0.80f, Action.MEDIA, "Acceso de arriba (con ícono)", hit = 0.12f),
        Spot(-0.64f, -0.64f, Action.MUSIC, "Esquina arriba izquierda", hit = 0.15f),
        Spot(0.64f, -0.64f, Action.ALARMS, "Esquina arriba derecha", hit = 0.15f),
        Spot(-0.64f, 0.64f, Action.TIMER, "Esquina abajo izquierda", hit = 0.15f),
        Spot(0.64f, 0.64f, Action.SETTINGS, "Esquina abajo derecha", hit = 0.15f),
        Spot(-0.49f, -0.31f, Action.SETTINGS, "Ícono de la pantalla", hit = 0.08f),
        // Botones rotulados del frente (LIGHT enciende la luz de la pantalla)
        Spot(-0.545f, 0.41f, Action.ALARMS, "Botón SCH", hit = 0.08f),
        Spot(0.545f, 0.41f, Action.MUSIC, "Botón TEL", hit = 0.08f),
        Spot(-0.70f, -0.30f, Action.SETTINGS, "Botón ADJUST", hit = 0.09f),
        Spot(0.70f, 0.22f, Action.TIMER, "Botón MEMO", hit = 0.09f),
    )
    override val choices = listOf(DESIGN, SCREEN, DIGITS, PLATE, HALO, FRONT, FRAME, TEMPERATURE, CALC_SCREEN)
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
                // Diseño Calculadora: las teclas calculan (y la pantalla vuelve a la hora al tocarla)
                if (renderer.calcTap(tapEvent.xPos, tapEvent.yPos)) return
                // LIGHT: la luz de la pantalla por 3 segundos (como en los relojes de cristal líquido)
                if (renderer.isLight(tapEvent.xPos, tapEvent.yPos)) return renderer.light()
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
        textScaleX = 1.12f
    }
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    var lastBounds = Rect()
        private set

    private var tempAt = 0L
    private var lightUntil = 0L

    fun isLight(x: Int, y: Int): Boolean {
        val b = lastBounds
        if (b.isEmpty) return false
        val r = min(b.width(), b.height()) / 2f
        return kotlin.math.hypot(x - (b.exactCenterX() + r * 0.70f), y - (b.exactCenterY() - r * 0.30f)) < r * 0.10f
    }

    fun light() {
        lightUntil = System.currentTimeMillis() + 3000
        invalidate()
    }
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
     * Marco del frente: esquinas amplias y redondeadas, costados apenas abombados y el borde de abajo
     * curvo, siguiendo la esfera redonda (como el bisel de los relojes digitales retro).
     */
    private fun framePath(cx: Float, cy: Float, r: Float) {
        val l = cx - r * 0.79f
        val rt = cx + r * 0.79f
        val top = cy - r * 0.65f
        val bot = cy + r * 0.64f
        val k1 = r * 0.22f
        val k2 = r * 0.26f
        path.reset()
        path.moveTo(l + k1, top)
        path.quadTo(cx, top - r * 0.03f, rt - k1, top)
        path.quadTo(rt, top, rt, top + k1)
        path.quadTo(rt + r * 0.035f, cy, rt - r * 0.01f, bot - k2)
        path.quadTo(rt - r * 0.03f, bot + r * 0.02f, rt - k2, bot + r * 0.035f)
        path.quadTo(cx, bot + r * 0.10f, l + k2, bot + r * 0.035f)
        path.quadTo(l + r * 0.03f, bot + r * 0.02f, l + r * 0.01f, bot - k2)
        path.quadTo(l - r * 0.035f, cy, l, top + k1)
        path.quadTo(l, top, l + k1, top)
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
        if (Choices.value(context, DESIGN) == 1) return renderCalc(canvas, bounds, zonedDateTime)
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
        if (!ambient) {
            // Halo de luz alrededor del frente
            val halo = Choices.value(context, HALO)
            if (Color.alpha(halo) > 0) {
                fill.shader = RadialGradient(cx, cy, r, intArrayOf(Color.argb(150, Color.red(halo), Color.green(halo), Color.blue(halo)), Color.argb(70, Color.red(halo), Color.green(halo), Color.blue(halo)), Color.TRANSPARENT), floatArrayOf(0.55f, 0.8f, 1f), Shader.TileMode.CLAMP)
                canvas.drawCircle(cx, cy, r, fill)
                fill.shader = null
            }
            // Frente relleno (la placa del reloj)
            framePath(cx, cy, r)
            val plate = Choices.value(context, PLATE)
            fill.shader = RadialGradient(cx, cy - r * 0.3f, r * 1.1f, Color.rgb((Color.red(plate) * 1.3f).toInt().coerceAtMost(255), (Color.green(plate) * 1.3f).toInt().coerceAtMost(255), (Color.blue(plate) * 1.3f).toInt().coerceAtMost(255)), plate, Shader.TileMode.CLAMP)
            canvas.drawPath(path, fill)
            fill.shader = null
        }

        // Marco del frente
        val frame = Choices.value(context, FRAME)
        if (Color.alpha(frame) > 0) {
            framePath(cx, cy, r)
            if (!ambient) {
                // Sombra suave por fuera para que se vea en relieve
                stroke.color = Color.argb(120, 0, 0, 0)
                stroke.strokeWidth = r * 0.045f
                canvas.drawPath(path, stroke)
            }
            stroke.color = if (ambient) Color.rgb(90, 90, 90) else frame
            stroke.strokeWidth = r * 0.02f
            canvas.drawPath(path, stroke)
        }

        // Acceso de arriba con su ícono (PulsoMedia por defecto), discreto en gris
        if (!ambient) {
            val top = Config.spots[0]
            Shortcuts.draw(canvas, context, Shortcuts.get(context, 0, top), cx + top.x * r, cy + top.y * r, r * 0.055f, Color.rgb(200, 205, 210), true)
        }

        // Rótulos del frente
        if (!ambient) {
            label.textAlign = Paint.Align.LEFT
            label.textSize = r * 0.078f
            label.color = Color.WHITE
            canvas.drawText("C.P.NAUTO", cx - r * 0.60f, cy - r * 0.50f, label)
            label.textAlign = Paint.Align.RIGHT
            label.textSize = r * 0.062f
            label.color = yellow
            canvas.drawText("DATA PULSO 50", cx + r * 0.60f, cy - r * 0.50f, label)
            label.textAlign = Paint.Align.CENTER
            label.textSize = r * 0.055f
            label.color = sky
            label.letterSpacing = 0.1f
            canvas.drawText("WATER RESIST", cx, cy - r * 0.425f, label)
            label.letterSpacing = 0f
            vertical(canvas, "ADJUST", cx - r * 0.70f, cy - r * 0.30f, r * 0.045f, white, 90f)
            vertical(canvas, "SELECT/MODE", cx - r * 0.70f, cy + r * 0.05f, r * 0.045f, yellow, 90f)
            vertical(canvas, "LIGHT", cx + r * 0.70f, cy - r * 0.30f, r * 0.045f, white, -90f)
            vertical(canvas, "◄ SET ►", cx + r * 0.70f, cy - r * 0.04f, r * 0.045f, yellow, -90f)
            vertical(canvas, "MEMO", cx + r * 0.70f, cy + r * 0.22f, r * 0.045f, white, -90f)
        }

        // Pantalla de cristal líquido
        val lit = !ambient && System.currentTimeMillis() < lightUntil
        // Siempre activa: la pantalla clásica gris, pero tenue (poca luz)
        val mode = if (ambient) 3 else if (lit) 2 else Choices.value(context, SCREEN)
        val lcd = RectF(cx - r * 0.61f, cy - r * 0.39f, cx + r * 0.61f, cy + r * 0.335f)
        val on: Int
        val ghost: Int
        when (mode) {
            0 -> {
                fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.bottom, Color.rgb(176, 186, 166), Color.rgb(140, 152, 134), Shader.TileMode.CLAMP)
                on = Color.rgb(22, 34, 40)
                ghost = Color.argb(28, 22, 34, 40)
            }
            3 -> {
                fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.bottom, Color.rgb(62, 68, 58), Color.rgb(48, 54, 46), Shader.TileMode.CLAMP)
                on = Color.rgb(8, 12, 14)
                ghost = Color.argb(18, 8, 12, 14)
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
        if (!ambient) {
            // Borde hundido de la pantalla
            stroke.color = Color.rgb(4, 6, 9)
            stroke.strokeWidth = r * 0.03f
            canvas.drawRoundRect(lcd, r * 0.06f, r * 0.06f, stroke)
        }
        canvas.drawRoundRect(lcd, r * 0.06f, r * 0.06f, fill)
        fill.shader = null
        if (lit) {
            // Luz encendida: brillo que sale del centro de la pantalla
            fill.shader = RadialGradient(lcd.centerX(), lcd.centerY(), lcd.width() * 0.6f, Color.argb(120, 220, 255, 255), Color.TRANSPARENT, Shader.TileMode.CLAMP)
            canvas.drawRoundRect(lcd, r * 0.06f, r * 0.06f, fill)
            fill.shader = null
        }
        if (!ambient) {
            // Reflejo del cristal: una franja de luz en diagonal
            canvas.save()
            canvas.clipRect(lcd)
            fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left + lcd.width() * 0.55f, lcd.top + lcd.height() * 0.9f,
                intArrayOf(Color.TRANSPARENT, Color.argb(38, 255, 255, 255), Color.argb(10, 255, 255, 255), Color.TRANSPARENT),
                floatArrayOf(0.25f, 0.42f, 0.55f, 0.7f), Shader.TileMode.CLAMP)
            canvas.drawRect(lcd, fill)
            fill.shader = null
            canvas.restore()
            // Sombra del cristal en la parte de arriba
            fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.top + lcd.height() * 0.16f, Color.argb(70, 0, 0, 0), Color.TRANSPARENT, Shader.TileMode.CLAMP)
            canvas.drawRoundRect(lcd, r * 0.06f, r * 0.06f, fill)
            fill.shader = null
            stroke.color = Color.argb(40, 255, 255, 255)
            stroke.strokeWidth = r * 0.004f
            canvas.drawRoundRect(lcd, r * 0.06f, r * 0.06f, stroke)
        }

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
        val by0 = cy + r * 0.37f
        val by1 = cy + r * 0.45f
        fun lighter(c: Int, k: Int) = Color.rgb((Color.red(c) + k).coerceAtMost(255), (Color.green(c) + k).coerceAtMost(255), (Color.blue(c) + k).coerceAtMost(255))
        fill.shader = LinearGradient(0f, by0, 0f, by1, lighter(blue, 60), blue, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(RectF(cx - r * 0.66f, by0, cx - r * 0.43f, by1), r * 0.014f, r * 0.014f, fill)
        canvas.drawRoundRect(RectF(cx + r * 0.43f, by0, cx + r * 0.66f, by1), r * 0.014f, r * 0.014f, fill)
        fill.shader = LinearGradient(0f, by0, 0f, by1, lighter(navy, 40), navy, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(RectF(cx - r * 0.41f, by0, cx + r * 0.41f, by1), r * 0.008f, r * 0.008f, fill)
        fill.shader = null
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

    // ===== Diseño Calculadora =====
    /** Una tecla: centro y tamaño (en radios desde el centro), lo que escribe y si es ancha */
    private class Key(val x: Float, val y: Float, val w: Float, val h: Float, val code: String, val shown: String)

    private val KEY_W = 0.165f
    private val KEY_H = 0.12f
    private val COLS = floatArrayOf(-0.51f, -0.31f, -0.11f, 0.095f, 0.295f, 0.50f)
    private val ROW1 = 0.085f
    private val ROW2 = 0.235f
    private val ROW3 = 0.385f
    private val KEYS = listOf(
        Key(COLS[0], ROW1, KEY_W, KEY_H, "1", "1"), Key(COLS[1], ROW1, KEY_W, KEY_H, "2", "2"), Key(COLS[2], ROW1, KEY_W, KEY_H, "3", "3"),
        Key(COLS[3], ROW1, KEY_W, KEY_H, "4", "4"), Key(COLS[4], ROW1, KEY_W, KEY_H, "/", "÷"), Key(COLS[5], ROW1, KEY_W, KEY_H, "+", "+"),
        Key(COLS[0], ROW2, KEY_W, KEY_H, "5", "5"), Key(COLS[1], ROW2, KEY_W, KEY_H, "6", "6"), Key(COLS[2], ROW2, KEY_W, KEY_H, "7", "7"),
        Key(COLS[3], ROW2, KEY_W, KEY_H, "8", "8"), Key(COLS[4], ROW2, KEY_W, KEY_H, "*", "×"), Key(COLS[5], ROW2, KEY_W, KEY_H, "-", "−"),
        Key(COLS[1], ROW3, KEY_W, KEY_H, "9", "9"), Key(COLS[2], ROW3, KEY_W, KEY_H, "0", "0"), Key(COLS[3], ROW3, KEY_W, KEY_H, "=", "="),
        Key(0.315f, ROW3, 0.205f, KEY_H, "L", "LIGHT"),
    )

    // Estado de la calculadora
    private var calcShown = "0"
    private var calcAcc: Double? = null
    private var calcOp: String? = null
    private var calcFresh = true
    private var calcUsedAt = 0L
    private var pressed: String? = null
    private var pressedAt = 0L

    private fun calcActive() = calcUsedAt > 0 && System.currentTimeMillis() - calcUsedAt < 30_000

    private fun calcClear() {
        calcShown = "0"; calcAcc = null; calcOp = null; calcFresh = true; calcUsedAt = 0L
    }

    private fun format(v: Double): String {
        if (v.isNaN() || v.isInfinite() || kotlin.math.abs(v) >= 1e8) return "Error"
        if (v == kotlin.math.floor(v)) return v.toLong().toString()
        var txt = java.math.BigDecimal(v).round(java.math.MathContext(8)).stripTrailingZeros().toPlainString()
        if (txt.replace("-", "").replace(".", "").length > 8) txt = txt.take(9)
        return txt
    }

    private fun apply(a: Double, op: String?, b: Double): Double = when (op) {
        "+" -> a + b
        "-" -> a - b
        "*" -> a * b
        "/" -> if (b == 0.0) Double.NaN else a / b
        else -> b
    }

    private fun press(code: String) {
        if (!calcActive()) calcClear()
        calcUsedAt = System.currentTimeMillis()
        if (calcShown == "Error") calcClear().also { calcUsedAt = System.currentTimeMillis() }
        when (code) {
            in listOf("0", "1", "2", "3", "4", "5", "6", "7", "8", "9") -> {
                if (calcFresh) { calcShown = code; calcFresh = false }
                else if (calcShown.replace("-", "").replace(".", "").length < 8) calcShown = if (calcShown == "0") code else calcShown + code
            }
            "+", "-", "*", "/" -> {
                val cur = calcShown.toDoubleOrNull() ?: 0.0
                if (!calcFresh || calcAcc == null) {
                    val res = calcAcc?.let { apply(it, calcOp, cur) } ?: cur
                    calcShown = format(res)
                    calcAcc = if (calcShown == "Error") null else res
                }
                calcOp = code
                calcFresh = true
            }
            "=" -> {
                val cur = calcShown.toDoubleOrNull() ?: 0.0
                val res = calcAcc?.let { apply(it, calcOp, cur) } ?: cur
                calcShown = format(res)
                calcAcc = null
                calcOp = null
                calcFresh = true
            }
        }
    }

    /** Toque en el diseño Calculadora: true si lo usó una tecla (o la pantalla, que vuelve a la hora) */
    fun calcTap(x: Int, y: Int): Boolean {
        if (Choices.value(context, DESIGN) != 1) return false
        val b = lastBounds
        if (b.isEmpty) return false
        val r = min(b.width(), b.height()) / 2f
        val fx = (x - b.exactCenterX()) / r
        val fy = (y - b.exactCenterY()) / r
        for (k in KEYS) {
            if (kotlin.math.abs(fx - k.x) <= k.w / 2 + 0.01f && kotlin.math.abs(fy - k.y) <= k.h / 2 + 0.01f) {
                pressed = k.code
                pressedAt = System.currentTimeMillis()
                if (k.code == "L") light() else press(k.code)
                invalidate()
                return true
            }
        }
        // Tocar la pantalla mientras se calcula: borra y vuelve a la hora
        if (calcActive() && fx in -0.60f..0.60f && fy in -0.39f..-0.08f) {
            calcClear()
            invalidate()
            return true
        }
        return false
    }

    private fun heartPath(x: Float, y: Float, s: Float) {
        path.reset()
        path.moveTo(x, y + s * 0.9f)
        path.cubicTo(x - s * 1.6f, y - s * 0.1f, x - s * 0.8f, y - s * 1.3f, x, y - s * 0.45f)
        path.cubicTo(x + s * 0.8f, y - s * 1.3f, x + s * 1.6f, y - s * 0.1f, x, y + s * 0.9f)
        path.close()
    }

    /** Tecla de goma: sombra, cuerpo oscuro con brillo arriba y su rótulo */
    private fun drawKey(canvas: Canvas, rect: RectF, r: Float, body: Int, border: Int, text: String, textColor: Int, textSize: Float, down: Boolean) {
        val rad = r * 0.035f
        fill.color = Color.argb(150, 0, 0, 0)
        canvas.drawRoundRect(RectF(rect.left, rect.top + r * 0.012f, rect.right, rect.bottom + r * 0.012f), rad, rad, fill)
        val off = if (down) r * 0.008f else 0f
        val k = RectF(rect.left, rect.top + off, rect.right, rect.bottom + off)
        fun lift(c: Int, d: Int) = Color.rgb((Color.red(c) + d).coerceIn(0, 255), (Color.green(c) + d).coerceIn(0, 255), (Color.blue(c) + d).coerceIn(0, 255))
        fill.shader = LinearGradient(0f, k.top, 0f, k.bottom, lift(body, if (down) 10 else 26), lift(body, -6), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(k, rad, rad, fill)
        fill.shader = null
        stroke.color = border
        stroke.strokeWidth = r * 0.007f
        canvas.drawRoundRect(k, rad, rad, stroke)
        label.textAlign = Paint.Align.CENTER
        label.textSize = textSize
        label.color = textColor
        canvas.drawText(text, k.centerX(), k.centerY() + textSize * 0.36f, label)
    }

    /**
     * Diseño Calculadora: frente azul marino con halo, pantalla iluminada con la hora y la fecha al
     * lado, teclado que funciona como calculadora, SCH y TEL, y la fila de datos en cajitas.
     */
    private fun renderCalc(canvas: Canvas, bounds: Rect, t: ZonedDateTime) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        if (ambient && calcUsedAt > 0) calcClear()
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val loc = Locale.getDefault()
        val color = Choices.value(context, FRONT) == 0
        val gold = if (color) Color.rgb(222, 178, 82) else Color.rgb(215, 215, 215)
        val sky = if (color) Color.rgb(140, 196, 222) else Color.rgb(215, 215, 215)
        val white = Color.rgb(235, 235, 235)
        canvas.drawColor(Color.BLACK)

        // Halo y frente (los mismos colores que el clásico)
        val halo = Choices.value(context, HALO)
        if (Color.alpha(halo) > 0) {
            fill.shader = RadialGradient(cx, cy, r, intArrayOf(Color.argb(150, Color.red(halo), Color.green(halo), Color.blue(halo)), Color.argb(70, Color.red(halo), Color.green(halo), Color.blue(halo)), Color.TRANSPARENT), floatArrayOf(0.55f, 0.8f, 1f), Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, fill)
            fill.shader = null
        }
        framePath(cx, cy, r)
        val plate = Choices.value(context, PLATE)
        fill.shader = RadialGradient(cx, cy - r * 0.3f, r * 1.1f, Color.rgb((Color.red(plate) * 1.3f).toInt().coerceAtMost(255), (Color.green(plate) * 1.3f).toInt().coerceAtMost(255), (Color.blue(plate) * 1.3f).toInt().coerceAtMost(255)), plate, Shader.TileMode.CLAMP)
        canvas.drawPath(path, fill)
        fill.shader = null
        val frame = Choices.value(context, FRAME)
        if (Color.alpha(frame) > 0) {
            stroke.color = Color.argb(120, 0, 0, 0)
            stroke.strokeWidth = r * 0.045f
            canvas.drawPath(path, stroke)
            stroke.color = frame
            stroke.strokeWidth = r * 0.02f
            canvas.drawPath(path, stroke)
        }

        // Acceso de arriba con su ícono
        val top0 = Config.spots[0]
        Shortcuts.draw(canvas, context, Shortcuts.get(context, 0, top0), cx + top0.x * r, cy + top0.y * r, r * 0.055f, Color.rgb(200, 205, 210), true)

        // Rótulos
        label.textAlign = Paint.Align.LEFT
        label.textSize = r * 0.078f
        label.color = Color.WHITE
        canvas.drawText("C.P.NAUTO", X(-0.60f), Y(-0.50f), label)
        label.textAlign = Paint.Align.RIGHT
        label.textSize = r * 0.07f
        label.color = gold
        canvas.drawText("CALC PULSO", X(0.60f), Y(-0.50f), label)
        label.textAlign = Paint.Align.CENTER
        label.textSize = r * 0.055f
        label.color = sky
        label.letterSpacing = 0.1f
        canvas.drawText("WATER RESIST", cx, Y(-0.425f), label)
        label.letterSpacing = 0f
        vertical(canvas, "ADJUST", X(-0.70f), Y(-0.27f), r * 0.045f, white, 90f)
        vertical(canvas, "SELECT/MODE", X(-0.70f), Y(0.075f), r * 0.045f, gold, 90f)
        vertical(canvas, "LIGHT", X(0.70f), Y(-0.30f), r * 0.045f, white, -90f)
        vertical(canvas, "◄ SET ►", X(0.70f), Y(-0.02f), r * 0.045f, gold, -90f)
        vertical(canvas, "MEMO", X(0.70f), Y(0.22f), r * 0.045f, white, -90f)

        // Pantalla iluminada
        val lit = !ambient && System.currentTimeMillis() < lightUntil
        val lcd = RectF(X(-0.60f), Y(-0.39f), X(0.60f), Y(-0.085f))
        val mode = Choices.value(context, CALC_SCREEN)
        val (bgTop, bgBot, on) = when (mode) {
            1 -> Triple(Color.rgb(176, 186, 166), Color.rgb(140, 152, 134), Color.rgb(22, 30, 32))
            2 -> Triple(Color.rgb(110, 220, 250), Color.rgb(60, 185, 235), Color.rgb(10, 28, 42))
            3 -> Triple(Color.rgb(170, 230, 140), Color.rgb(120, 190, 100), Color.rgb(12, 30, 10))
            4 -> Triple(Color.rgb(14, 20, 24), Color.rgb(8, 12, 16), Choices.value(context, DIGITS))
            else -> Triple(Color.rgb(250, 196, 100), Color.rgb(226, 160, 64), Color.rgb(16, 12, 8))
        }
        val ghost = Color.argb(if (mode == 4) 26 else 22, Color.red(on), Color.green(on), Color.blue(on))
        // Bisel dorado/oscuro de la pantalla
        stroke.color = if (color) Color.rgb(150, 110, 40) else Color.rgb(90, 90, 90)
        stroke.strokeWidth = r * 0.03f
        canvas.drawRoundRect(lcd, r * 0.05f, r * 0.05f, stroke)
        fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.bottom, bgTop, bgBot, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(lcd, r * 0.05f, r * 0.05f, fill)
        fill.shader = null
        if (lit) {
            fill.shader = RadialGradient(lcd.centerX(), lcd.centerY(), lcd.width() * 0.6f, Color.argb(110, 255, 250, 220), Color.TRANSPARENT, Shader.TileMode.CLAMP)
            canvas.drawRoundRect(lcd, r * 0.05f, r * 0.05f, fill)
            fill.shader = null
        }
        // Sombra del cristal arriba
        fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.top + lcd.height() * 0.2f, Color.argb(60, 0, 0, 0), Color.TRANSPARENT, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(lcd, r * 0.05f, r * 0.05f, fill)
        fill.shader = null

        if (calcActive()) {
            // Calculadora: el número grande a la derecha y la operación en curso a la izquierda
            // Error (dividir por cero o número muy grande): «Err»
            Lcd.number(canvas, if (calcShown == "Error") "Err" else calcShown,
                X(0.55f), Y(-0.335f), r * 0.095f, r * 0.19f, r * 0.03f, 8, on, ghost)
            label.textAlign = Paint.Align.LEFT
            label.textSize = r * 0.06f
            label.color = on
            val opTxt = when (calcOp) { "+" -> "+"; "-" -> "−"; "*" -> "×"; "/" -> "÷"; else -> "" }
            canvas.drawText(opTxt, X(-0.56f), Y(-0.30f), label)
        } else {
            // Hora grande a la derecha y la fecha al lado (día de la semana y día-mes)
            val is24 = DateFormat.is24HourFormat(context)
            val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
            val m = "%02d".format(t.minute)
            val dw = r * 0.13f
            val dh = r * 0.235f
            val yT = Y(-0.355f)
            val x0 = X(-0.13f)
            Lcd.digit(canvas, h[0], x0, yT, dw, dh, on, ghost)
            Lcd.digit(canvas, h[1], x0 + dw * 1.25f, yT, dw, dh, on, ghost)
            Lcd.colon(canvas, x0 + dw * 2.55f, yT, dh, r * 0.02f, on)
            Lcd.digit(canvas, m[0], x0 + dw * 2.9f, yT, dw, dh, on, ghost)
            Lcd.digit(canvas, m[1], x0 + dw * 4.15f, yT, dw, dh, on, ghost)
            val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").take(3)
            val p = r * 0.017f
            Lcd.dots(canvas, dow, X(-0.53f), Y(-0.345f), p, on, ghost)
            Lcd.row(canvas, "${t.dayOfMonth}-${t.monthValue}", X(-0.18f), Y(-0.225f), r * 0.052f, r * 0.09f, r * 0.016f, 5, on, ghost)
            label.textAlign = Paint.Align.LEFT
            label.textSize = r * 0.045f
            label.color = on
            if (!ambient) canvas.drawText("%02d".format(t.second), X(-0.53f), Y(-0.105f), label)
            label.color = if (is24 || t.hour >= 12) on else ghost
            canvas.drawText(if (is24) "24H" else "PM", X(-0.40f), Y(-0.105f), label)
        }

        // WORLD TIME con su regla de puntos
        label.textAlign = Paint.Align.CENTER
        label.textSize = r * 0.065f
        label.color = gold
        label.letterSpacing = 0.06f
        canvas.drawText("WORLD TIME", X(-0.08f), Y(0.0f), label)
        label.letterSpacing = 0f
        fill.color = Color.argb(140, Color.red(sky), Color.green(sky), Color.blue(sky))
        var dx = X(0.29f)
        var i = 0
        while (dx < X(0.64f)) {
            val hh = if (i % 5 == 0) r * 0.03f else r * 0.018f
            canvas.drawRect(dx, Y(-0.012f) - hh, dx + r * 0.006f, Y(-0.012f), fill)
            dx += r * 0.014f
            i++
        }

        // Medidor de «SELECT/MODE»: la batería en cuadritos
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        for (k in 0 until 8) {
            fill.color = if (pct >= 0 && pct >= (7 - k) * 12.5f) Color.rgb(170, 190, 200) else Color.rgb(60, 80, 80)
            canvas.drawRect(X(-0.655f), Y(-0.02f) + k * r * 0.03f, X(-0.635f), Y(-0.02f) + k * r * 0.03f + r * 0.018f, fill)
        }

        // Teclado (calculadora que funciona)
        val keyBody = Color.rgb(24, 26, 30)
        val down = pressed?.takeIf { System.currentTimeMillis() - pressedAt < 180 }
        if (pressed != null && down == null) pressed = null else if (down != null) postInvalidate()
        for (k in KEYS) {
            val rect = RectF(X(k.x - k.w / 2), Y(k.y - k.h / 2), X(k.x + k.w / 2), Y(k.y + k.h / 2))
            val isOp = k.code in listOf("+", "-", "*", "/", "=")
            val body = when (k.code) { "-" -> Color.rgb(46, 58, 78); else -> keyBody }
            val border = when (k.code) { "+" -> Color.rgb(200, 120, 40); else -> Color.argb(90, 0, 0, 0) }
            val tc = if (k.code == "L") Color.rgb(220, 210, 190) else if (isOp) Color.rgb(235, 225, 205) else gold
            val ts = if (k.code == "L") r * 0.042f else r * 0.075f
            drawKey(canvas, rect, r, body, border, k.shown, tc, ts, down == k.code)
        }
        // SCH y TEL (accesos)
        val navy = if (color) Color.rgb(34, 48, 90) else Color.rgb(50, 50, 50)
        for ((xx, txt) in listOf(-0.585f to "SCH", 0.585f to "TEL")) {
            val rect = RectF(X(xx - 0.135f), Y(ROW3 - 0.06f), X(xx + 0.135f), Y(ROW3 + 0.06f))
            fill.color = navy
            canvas.drawRoundRect(rect, r * 0.02f, r * 0.02f, fill)
            label.textAlign = Paint.Align.CENTER
            label.textSize = r * 0.055f
            label.color = Color.WHITE
            canvas.drawText(txt, rect.centerX(), rect.centerY() + r * 0.02f, label)
        }

        // Fila de datos: pasos · temperatura · batería · ritmo, en cajitas
        val steps = complications.textOf(STEPS, context.resources) ?: "--"
        val tempMode = Choices.value(context, TEMPERATURE)
        val temp = when (tempMode) {
            2 -> complications.textOf(TEMP, context.resources) ?: "--"
            else -> batteryTemperature().let { c ->
                if (c.isNaN()) "--" else if (tempMode == 1) "${(c * 9 / 5 + 32).toInt()}°" else "${c.toInt()}°"
            }
        }
        val hr = complications.textOf(HEART, context.resources) ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        val y = Y(0.535f)
        val boxH = r * 0.11f
        fun box(l: Float, rr: Float, c: Int) {
            fill.color = c
            canvas.drawRoundRect(RectF(X(l), y - boxH / 2, X(rr), y + boxH / 2), r * 0.03f, r * 0.03f, fill)
        }
        box(-0.50f, -0.25f, Color.argb(90, 0, 0, 0))
        box(-0.21f, -0.02f, keyBody)
        box(0.02f, 0.255f, keyBody)
        box(0.295f, 0.52f, navy)
        label.textSize = r * 0.07f
        label.textAlign = Paint.Align.LEFT
        label.color = Color.WHITE
        val base = y + r * 0.025f
        fill.color = Color.WHITE
        for (k in 0 until 3) canvas.drawCircle(X(-0.555f) + k * r * 0.02f, y + r * 0.012f - k * r * 0.012f, r * 0.007f, fill)
        canvas.drawText(steps, X(-0.48f), base, label)
        label.textAlign = Paint.Align.CENTER
        canvas.drawText(temp, X(-0.115f), base, label)
        fill.color = Color.rgb(200, 200, 200)
        canvas.drawRect(X(0.04f), y - r * 0.03f, X(0.06f), y + r * 0.03f, fill)
        label.textAlign = Paint.Align.LEFT
        canvas.drawText(if (pct >= 0) "$pct%" else "--", X(0.075f), base, label)
        fill.color = Color.WHITE
        heartPath(X(0.345f), y - r * 0.005f, r * 0.028f)
        canvas.drawPath(path, fill)
        canvas.drawText(hr, X(0.385f), base, label)
        label.textAlign = Paint.Align.CENTER

        Brand.draw(canvas, cx, Y(0.78f), r * 0.032f, Color.rgb(120, 120, 130))
        // Siempre activa: la esfera completa, más tenue
        if (ambient) canvas.drawColor(Color.argb(170, 0, 0, 0))
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: RetroAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
