package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
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
import cl.carlospnauto.esfera.comun.Indicators
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

private const val HEART = 101
private const val STEPS = 102

/** Pantalla de cristal líquido: fondo (arriba/abajo), dígitos encendidos y si es «negativa» (fondo oscuro) */
private data class Screen(val top: Int, val bottom: Int, val ink: Int, val dark: Boolean)

private val SCREENS = listOf(
    "Gris clásica" to Screen(Color.rgb(214, 220, 214), Color.rgb(178, 186, 180), Color.rgb(16, 18, 18), false),
    "Naranja" to Screen(Color.rgb(255, 150, 80), Color.rgb(236, 112, 50), Color.rgb(22, 10, 4), false),
    "Verde menta" to Screen(Color.rgb(120, 214, 170), Color.rgb(70, 170, 130), Color.rgb(6, 26, 18), false),
    "Rojo" to Screen(Color.rgb(250, 70, 70), Color.rgb(210, 30, 40), Color.rgb(30, 4, 6), false),
    "Amarillo" to Screen(Color.rgb(255, 222, 60), Color.rgb(236, 190, 20), Color.rgb(26, 20, 4), false),
    "Beige" to Screen(Color.rgb(246, 214, 182), Color.rgb(222, 184, 150), Color.rgb(26, 18, 12), false),
    "Negativa amarilla" to Screen(Color.rgb(22, 30, 60), Color.rgb(12, 18, 40), Color.rgb(255, 214, 60), true),
    "Negativa cian" to Screen(Color.rgb(20, 34, 44), Color.rgb(10, 20, 28), Color.rgb(70, 220, 230), true),
    "Negativa granate" to Screen(Color.rgb(110, 20, 40), Color.rgb(74, 10, 26), Color.rgb(255, 210, 220), true),
    "Negativa magenta" to Screen(Color.rgb(36, 14, 40), Color.rgb(20, 6, 24), Color.rgb(255, 70, 200), true),
)
private val SCREEN = Choice("pantalla", "Pantalla", SCREENS.map { it.first to (if (it.second.dark) it.second.ink else it.second.top) })

/** Colores del frente: marco del panel, triángulos, nombre y rótulos */
private data class Theme(val frame: Int, val chevron: Int, val brand: Int, val label: Int, val value: Int)

private val THEMES = listOf(
    "Rojo y azul" to Theme(Color.rgb(230, 40, 50), Color.rgb(220, 40, 50), Color.rgb(255, 200, 40), Color.rgb(70, 160, 255), Color.WHITE),
    "Verde" to Theme(Color.rgb(40, 150, 70), Color.rgb(40, 170, 80), Color.rgb(250, 220, 90), Color.rgb(130, 200, 140), Color.WHITE),
    "Dorado" to Theme(Color.rgb(200, 160, 90), Color.rgb(180, 140, 80), Color.rgb(230, 200, 140), Color.rgb(210, 180, 120), Color.rgb(240, 230, 210)),
    "Rosa" to Theme(Color.rgb(230, 170, 160), Color.rgb(200, 150, 150), Color.rgb(240, 240, 240), Color.rgb(250, 190, 180), Color.WHITE),
    "Azul" to Theme(Color.rgb(60, 130, 240), Color.rgb(60, 130, 240), Color.rgb(120, 220, 255), Color.rgb(120, 190, 255), Color.WHITE),
    "Plata" to Theme(Color.rgb(170, 175, 185), Color.rgb(150, 155, 165), Color.rgb(230, 232, 236), Color.rgb(190, 195, 205), Color.WHITE),
    "Negro" to Theme(Color.rgb(46, 48, 52), Color.rgb(70, 72, 76), Color.rgb(200, 200, 200), Color.rgb(160, 160, 165), Color.rgb(220, 220, 220)),
)
private val THEME = Choice("tema", "Colores del frente", THEMES.map { it.first to it.second.frame })
private val SECONDS = Choice("segundos", "Segundos", listOf("Visibles" to 0, "Ocultos" to 1))
private val DISTANCE = Choice("distancia", "Distancia", listOf("Kilómetros" to 0, "Millas" to 1))
private val AMB = Choice("bajo", "Bajo consumo", listOf("Pantalla completa tenue" to 0, "Mínimo" to 1))

object Config : FaceConfig {
    override val slots = listOf(HEART to "Ritmo cardíaco", STEPS to "Pasos")
    override val spots = listOf(
        Spot(-0.765f, 0f, Action.MEDIA, "APP 1 (izquierda)", hit = 0.12f),
        Spot(0.765f, 0f, Action.MUSIC, "APP 2 (derecha)", hit = 0.12f),
        Spot(0f, -0.64f, Action.ALARMS, "Nombre de arriba", hit = 0.12f),
        Spot(0f, 0.68f, Action.TIMER, "WATER 50 RESIST", hit = 0.12f),
        Spot(-0.40f, -0.43f, Action.SETTINGS, "Ritmo cardíaco (HR)", hit = 0.10f),
        Spot(0.40f, 0.43f, Action.BATTERY, "Distancia", hit = 0.10f),
    )
    override val choices = listOf(SCREEN, THEME, SECONDS, DISTANCE, AMB)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        val slots = listOf(
            ComplicationSlot.createRoundRectComplicationSlotBuilder(HEART, factory, types, DefaultComplicationDataSourcePolicy(), ComplicationSlotBounds(RectF(0.20f, 0.25f, 0.45f, 0.32f))).build(),
            ComplicationSlot.createRoundRectComplicationSlotBuilder(
                STEPS, factory, types,
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
                ComplicationSlotBounds(RectF(0.20f, 0.68f, 0.45f, 0.75f)),
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
        val renderer = LuminaRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) {
                    Shortcuts.open(this@FaceService, i, Config.spots[i])
                    return
                }
                // Tocar la pantalla: se ilumina 3 segundos (como la luz de los relojes digitales)
                if (renderer.inScreen(tapEvent.xPos, tapEvent.yPos)) renderer.light()
            }
        })
    }
}

class LuminaAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/**
 * Esfera digital retro con luz: triángulos y nombre arriba, panel con marco de color, ritmo y su
 * estado, pantalla de cristal líquido (día, fecha, alarma, batería, hora con segundos), pasos y
 * distancia, APP 1 / APP 2 a los lados y WATER 50 RESIST abajo.
 */
class LuminaRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<LuminaAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = LuminaAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND; strokeCap = Paint.Cap.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG)
    private val mono = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
    private val bold = Typeface.create("sans-serif", Typeface.BOLD)
    private val black = Typeface.create("sans-serif-black", Typeface.NORMAL)
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var lightUntil = 0L
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

    fun light() {
        lightUntil = System.currentTimeMillis() + 3000
        invalidate()
    }

    fun inScreen(x: Int, y: Int): Boolean {
        val b = lastBounds
        if (b.isEmpty) return false
        val r = min(b.width(), b.height()) / 2f
        val fx = (x - b.exactCenterX()) / r
        val fy = (y - b.exactCenterY()) / r
        return fx in -0.66f..0.66f && fy in -0.36f..0.30f
    }

    private fun a(c: Int, alpha: Int) = Color.argb(alpha, Color.red(c), Color.green(c), Color.blue(c))

    private fun write(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, face: Typeface, align: Paint.Align, skew: Float = 0f) {
        text.typeface = face
        text.textSize = size
        text.color = color
        text.textAlign = align
        text.textSkewX = skew
        canvas.drawText(s, x, y, text)
        text.textSkewX = 0f
    }

    private fun width(s: String, size: Float, face: Typeface): Float {
        text.typeface = face
        text.textSize = size
        return text.measureText(s)
    }

    /** Fila de triángulos (arriba apuntan hacia abajo, abajo hacia arriba), más grandes al centro */
    private fun chevrons(canvas: Canvas, cx: Float, y: Float, r: Float, color: Int, up: Boolean) {
        val n = 9
        val step = r * 0.07f
        for (i in 0 until n) {
            val k = i - (n - 1) / 2f
            val size = r * (0.05f - kotlin.math.abs(k) * 0.006f)
            val x = cx + k * step
            path.reset()
            if (!up) {
                path.moveTo(x - size * 0.7f, y - size * 0.5f); path.lineTo(x + size * 0.7f, y - size * 0.5f); path.lineTo(x, y + size * 0.5f)
            } else {
                path.moveTo(x - size * 0.7f, y + size * 0.5f); path.lineTo(x + size * 0.7f, y + size * 0.5f); path.lineTo(x, y - size * 0.5f)
            }
            path.close()
            fill.color = if (i % 2 == 0) color else a(color, 150)
            canvas.drawPath(path, fill)
            // Triángulos invertidos entre los de la fila (el zigzag)
            if (i < n - 1) {
                val x2 = x + step / 2
                val s2 = size * 0.7f
                path.reset()
                if (!up) {
                    path.moveTo(x2 - s2 * 0.6f, y + size * 0.5f); path.lineTo(x2 + s2 * 0.6f, y + size * 0.5f); path.lineTo(x2, y - size * 0.3f)
                } else {
                    path.moveTo(x2 - s2 * 0.6f, y - size * 0.5f); path.lineTo(x2 + s2 * 0.6f, y - size * 0.5f); path.lineTo(x2, y + size * 0.3f)
                }
                path.close()
                fill.color = a(color, 110)
                canvas.drawPath(path, fill)
            }
        }
    }

    private fun bell(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x - s * 0.55f, y + s * 0.35f)
        path.quadTo(x - s * 0.45f, y - s * 0.65f, x, y - s * 0.65f)
        path.quadTo(x + s * 0.45f, y - s * 0.65f, x + s * 0.55f, y + s * 0.35f)
        path.close()
        canvas.drawPath(path, fill)
        canvas.drawCircle(x, y + s * 0.5f, s * 0.14f, fill)
        stroke.color = color
        stroke.strokeWidth = s * 0.13f
        for (k in 1..2) {
            val rad = s * (0.55f + k * 0.28f)
            canvas.drawArc(RectF(x - rad, y - rad, x + rad, y + rad), -40f, 80f, false, stroke)
            canvas.drawArc(RectF(x - rad, y - rad, x + rad, y + rad), 140f, 80f, false, stroke)
        }
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LuminaAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        val simple = ambient && Choices.value(context, AMB) == 1
        lastBounds = Rect(bounds)
        Lcd.skew = -0.08f
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val sc = SCREENS[Choices.index(context, SCREEN)].second
        val th = THEMES[Choices.index(context, THEME)].second
        canvas.drawColor(Color.BLACK)

        val lcd = RectF(X(-0.66f), Y(-0.36f), X(0.66f), Y(0.30f))
        val ink = if (simple) Color.rgb(170, 170, 170) else sc.ink
        val ghost = if (simple) 0 else a(sc.ink, if (sc.dark) 30 else 26)

        if (!simple) {
            // Frente negro con un leve brillo al centro
            fill.shader = RadialGradient(cx, cy, r, Color.rgb(16, 18, 22), Color.rgb(4, 4, 6), Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, fill)
            fill.shader = null

            // Triángulos y nombre arriba
            chevrons(canvas, cx, Y(-0.76f), r, th.chevron, up = false)
            val brand = "LUMINA"
            val bs = r * 0.085f
            val bw = width(brand, bs, bold)
            write(canvas, brand, cx, Y(-0.60f), bs, th.brand, bold, Paint.Align.CENTER, -0.2f)
            fill.color = th.label
            for (side in listOf(-1f, 1f)) {
                val ax = cx + side * (bw / 2 + r * 0.05f)
                path.reset()
                path.moveTo(ax + side * r * 0.03f, Y(-0.627f)); path.lineTo(ax - side * r * 0.012f, Y(-0.648f)); path.lineTo(ax - side * r * 0.012f, Y(-0.606f))
                path.close()
                canvas.drawPath(path, fill)
            }

            // Panel con marco de color (doble línea) y fondo azul muy oscuro
            val panel = RectF(X(-0.84f), Y(-0.53f), X(0.84f), Y(0.53f))
            fill.color = Color.rgb(16, 22, 34)
            canvas.drawRoundRect(panel, r * 0.24f, r * 0.24f, fill)
            stroke.color = th.frame
            stroke.strokeWidth = r * 0.02f
            canvas.drawRoundRect(panel, r * 0.24f, r * 0.24f, stroke)
            stroke.color = a(th.frame, 110)
            stroke.strokeWidth = r * 0.006f
            val inner = RectF(panel.left + r * 0.03f, panel.top + r * 0.03f, panel.right - r * 0.03f, panel.bottom - r * 0.03f)
            canvas.drawRoundRect(inner, r * 0.21f, r * 0.21f, stroke)

            // APP 1 y APP 2 (accesos) en los costados
            for ((sx, label, deg) in listOf(Triple(-0.765f, "APP 1", -90f), Triple(0.765f, "APP 2", 90f))) {
                canvas.save()
                canvas.rotate(deg, X(sx), cy)
                write(canvas, label, X(sx), cy + r * 0.018f, r * 0.05f, th.label, mono, Paint.Align.CENTER)
                canvas.restore()
            }

            // Ritmo cardíaco y su estado
            val hrTxt = complications.textOf(HEART, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
                ?: heart.bpm.takeIf { it > 0 }?.toString()
            val hr = hrTxt?.toIntOrNull() ?: 0
            val ls = r * 0.06f
            fill.color = th.frame
            canvas.drawCircle(X(-0.56f), Y(-0.415f), r * 0.014f, fill)
            write(canvas, "HR:", X(-0.53f), Y(-0.395f), ls, th.label, mono, Paint.Align.LEFT)
            write(canvas, "${hrTxt ?: "--"} bpm", X(-0.38f), Y(-0.395f), ls, th.value, mono, Paint.Align.LEFT)
            val status = when {
                hr <= 0 -> "--"
                hr < 60 -> "Bajo"
                hr <= 100 -> "Normal"
                else -> "Alto"
            }
            val stColor = when (status) { "Normal" -> Color.rgb(60, 220, 110); "Bajo" -> Color.rgb(90, 180, 255); "Alto" -> Color.rgb(255, 90, 80); else -> Color.GRAY }
            canvas.drawCircle(X(0.22f), Y(-0.415f), r * 0.014f, fill)
            write(canvas, status, X(0.25f), Y(-0.395f), ls, stColor, bold, Paint.Align.LEFT)

            // Pasos y distancia
            val stepsTxt = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() } ?: ""
            val steps = stepsTxt.toLongOrNull() ?: 0L
            val km = steps * 0.00075
            val dist = if (Choices.value(context, DISTANCE) == 1) "%.2f mi".format(loc, km * 0.621371) else "%.2f km".format(loc, km)
            canvas.drawCircle(X(-0.56f), Y(0.415f), r * 0.014f, fill)
            write(canvas, "SC:", X(-0.53f), Y(0.435f), ls, th.label, mono, Paint.Align.LEFT)
            write(canvas, stepsTxt.ifEmpty { "--" }, X(-0.38f), Y(0.435f), ls, th.value, mono, Paint.Align.LEFT)
            canvas.drawCircle(X(0.22f), Y(0.415f), r * 0.014f, fill)
            write(canvas, dist, X(0.25f), Y(0.435f), ls, th.brand, mono, Paint.Align.LEFT)

            // WATER 50 RESIST y triángulos abajo
            val ws = r * 0.06f
            write(canvas, "WATER", X(-0.12f), Y(0.69f), ws, th.label, bold, Paint.Align.RIGHT, -0.2f)
            write(canvas, "50", cx, Y(0.70f), r * 0.12f, th.brand, black, Paint.Align.CENTER, -0.3f)
            write(canvas, "RESIST", X(0.12f), Y(0.69f), ws, th.label, bold, Paint.Align.LEFT, -0.2f)
            chevrons(canvas, cx, Y(0.78f), r, th.chevron, up = true)

            // Pantalla: bisel y cristal
            stroke.color = Color.rgb(70, 76, 86)
            stroke.strokeWidth = r * 0.02f
            canvas.drawRoundRect(lcd, r * 0.07f, r * 0.07f, stroke)
            fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.bottom, sc.top, sc.bottom, Shader.TileMode.CLAMP)
            canvas.drawRoundRect(lcd, r * 0.07f, r * 0.07f, fill)
            fill.shader = null
            if (!ambient && System.currentTimeMillis() < lightUntil) {
                // Luz: la pantalla se ilumina desde el centro
                val glow = if (sc.dark) a(sc.ink, 80) else Color.argb(150, 200, 255, 240)
                fill.shader = RadialGradient(lcd.centerX(), lcd.centerY(), lcd.width() * 0.6f, glow, Color.TRANSPARENT, Shader.TileMode.CLAMP)
                canvas.drawRoundRect(lcd, r * 0.07f, r * 0.07f, fill)
                fill.shader = null
            }
            // Sombra arriba y reflejo
            fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.top + lcd.height() * 0.18f, Color.argb(60, 0, 0, 0), Color.TRANSPARENT, Shader.TileMode.CLAMP)
            canvas.drawRoundRect(lcd, r * 0.07f, r * 0.07f, fill)
            fill.shader = null
        }

        // Batería: pila chica con su nivel y el porcentaje
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        if (!simple) {
            val bx = X(-0.61f)
            val by = Y(-0.30f)
            stroke.color = ink
            stroke.strokeWidth = r * 0.008f
            canvas.drawRoundRect(RectF(bx, by, bx + r * 0.085f, by + r * 0.04f), r * 0.006f, r * 0.006f, stroke)
            fill.color = ink
            canvas.drawRect(bx + r * 0.085f, by + r * 0.012f, bx + r * 0.095f, by + r * 0.028f, fill)
            if (pct >= 0) canvas.drawRect(bx + r * 0.01f, by + r * 0.01f, bx + r * 0.01f + r * 0.065f * pct / 100f, by + r * 0.03f, fill)
            write(canvas, if (pct >= 0) "$pct%" else "--", bx + r * 0.045f, Y(-0.20f), r * 0.045f, ink, bold, Paint.Align.CENTER)
        }

        // Día de la semana grande
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").take(3).uppercase(loc)
        write(canvas, dow, X(-0.47f), Y(-0.17f), r * 0.15f, ink, black, Paint.Align.LEFT)

        // Fecha (mes-día) en su cajita, con «8» apagados
        if (!simple) {
            fill.color = a(sc.ink, if (sc.dark) 22 else 16)
            canvas.drawRoundRect(RectF(X(0.13f), Y(-0.33f), X(0.62f), Y(-0.15f)), r * 0.02f, r * 0.02f, fill)
        }
        Lcd.row(canvas, "${t.monthValue}-${t.dayOfMonth}", X(0.61f), Y(-0.31f), r * 0.07f, r * 0.13f, r * 0.022f, 5, ink, ghost)

        // Alarma puesta: campana con ondas
        if (!simple) bell(canvas, X(0.50f), Y(-0.095f), r * 0.035f, if (Indicators.alarm(context)) ink else ghost)

        // Hora grande, segundos e indicador P / 24
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
        val m = "%02d".format(t.minute)
        val dw = r * 0.145f
        val dh = r * 0.27f
        val top = Y(-0.04f)
        var x = X(-0.50f)
        Lcd.digit(canvas, h[0], x, top, dw, dh, ink, ghost); x += dw * 1.22f
        Lcd.digit(canvas, h[1], x, top, dw, dh, ink, ghost); x += dw * 1.22f
        Lcd.colon(canvas, x + dw * 0.18f, top, dh, r * 0.02f, ink); x += dw * 0.5f
        Lcd.digit(canvas, m[0], x, top, dw, dh, ink, ghost); x += dw * 1.22f
        Lcd.digit(canvas, m[1], x, top, dw, dh, ink, ghost)
        if (!ambient && Choices.value(context, SECONDS) == 0) {
            val s = "%02d".format(t.second)
            val sw = r * 0.095f
            val sh = r * 0.18f
            Lcd.digit(canvas, s[0], X(0.39f), top + dh - sh, sw, sh, ink, ghost)
            Lcd.digit(canvas, s[1], X(0.39f) + sw * 1.22f, top + dh - sh, sw, sh, ink, ghost)
        }
        write(canvas, if (is24) "24" else "P", X(-0.585f), top + r * 0.06f, r * 0.055f, if (is24 || t.hour >= 12) ink else ghost, bold, Paint.Align.CENTER)

        Brand.draw(canvas, cx, Y(0.90f), r * 0.028f, Color.rgb(110, 110, 115))
        // Siempre activa: la esfera completa, más tenue
        if (ambient && !simple) canvas.drawColor(Color.argb(165, 0, 0, 0))
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: LuminaAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
