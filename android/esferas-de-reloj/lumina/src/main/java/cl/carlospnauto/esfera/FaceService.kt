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
import cl.carlospnauto.esfera.comun.PhoneNow
import cl.carlospnauto.esfera.comun.PlayerScreen
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
    // La pantalla clásica de los relojes de cristal líquido: verde grisáceo con dígitos casi negros
    "Clásica LCD" to Screen(Color.rgb(196, 202, 170), Color.rgb(158, 166, 134), Color.rgb(22, 26, 18), false),
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
    override val choices = listOf(SCREEN, THEME, SECONDS, DISTANCE, AMB, PhoneNow.CHOICE)
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
                // Modo reproductor: los botones de la pantalla controlan la música del teléfono
                if (renderer.playerTap(tapEvent.xPos, tapEvent.yPos)) return
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

    // ===== Modo reproductor (lo que suena en PulsoMusic del teléfono) =====
    private val redraw: () -> Unit = { invalidate() }
    private var playerLcd: RectF? = null

    init {
        PhoneNow.start(context, redraw)
    }

    /** Toque en los botones del reproductor (◄ anterior, ►‖ reproducir/pausar, ►| siguiente) */
    fun playerTap(x: Int, y: Int): Boolean {
        val lcd = playerLcd ?: return false
        if (!PhoneNow.enabled(context) || !lcd.contains(x.toFloat(), y.toFloat())) return false
        val s = PhoneNow.state ?: return false
        val b = lastBounds
        val r = min(b.width(), b.height()) / 2f
        val a = if (PhoneNow.active(context)) PlayerScreen.hit(lcd, r, x.toFloat(), y.toFloat(), s) else null
        // Botón del reproductor, o tocar la pantalla para cambiar entre la vista normal y el reproductor
        if (a != null) PhoneNow.command(context, a) else if (!PhoneNow.toggleView(context)) return false
        invalidate()
        return true
    }

    override fun onDestroy() {
        PhoneNow.stop(context, redraw)
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
        return fx in -0.70f..0.70f && fy in -0.365f..0.345f
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

    /** Fila recta de triángulos (apuntan hacia el centro), más grandes al centro, con el zigzag entre medio */
    private fun chevrons(canvas: Canvas, cx: Float, y: Float, r: Float, color: Int, top: Boolean) {
        val n = 9
        val step = r * 0.066f
        val dir = if (top) 1f else -1f
        for (i in 0 until n) {
            val k = i - (n - 1) / 2f
            val size = r * (0.052f - kotlin.math.abs(k) * 0.0055f)
            val x = cx + k * step
            path.reset()
            path.moveTo(x - size * 0.75f, y - dir * size * 0.5f)
            path.lineTo(x + size * 0.75f, y - dir * size * 0.5f)
            path.lineTo(x, y + dir * size * 0.5f)
            path.close()
            fill.color = if (i % 2 == 0) color else a(color, 170)
            canvas.drawPath(path, fill)
            if (i < n - 1) {
                val x2 = x + step / 2
                val s2 = size * 0.62f
                path.reset()
                path.moveTo(x2 - s2 * 0.7f, y + dir * size * 0.5f)
                path.lineTo(x2 + s2 * 0.7f, y + dir * size * 0.5f)
                path.lineTo(x2, y - dir * size * 0.25f)
                path.close()
                fill.color = a(color, 120)
                canvas.drawPath(path, fill)
            }
        }
    }

    /**
     * Panel con la forma de la foto: línea recta arriba y abajo, y los costados siguen el círculo de
     * la esfera; las esquinas pasan suave de la recta a la curva. k achica el panel (línea de adentro).
     */
    private fun panelPath(cx: Float, cy: Float, r: Float, k: Float) {
        val rr = r * k
        fun X(v: Float) = cx + v * rr
        fun Y(v: Float) = cy + v * rr
        val side = 0.86f
        val edge = 0.53f
        val sy = 0.42f
        val ang = Math.toDegrees(kotlin.math.asin((sy / side).toDouble())).toFloat()
        val sx = kotlin.math.sqrt(side * side - sy * sy)
        // Esquina: la recta y la tangente del círculo se cruzan en (cxk, edge)
        val th = Math.toRadians(ang.toDouble())
        val e = (edge - sy) / kotlin.math.cos(th).toFloat()
        val cxk = sx - kotlin.math.sin(th).toFloat() * e
        val start = cxk - 0.09f
        path.reset()
        path.moveTo(X(-start), Y(-edge))
        path.lineTo(X(start), Y(-edge))
        path.quadTo(X(cxk), Y(-edge), X(sx), Y(-sy))
        path.arcTo(RectF(X(-side), Y(-side), X(side), Y(side)), -ang, ang * 2, false)
        path.quadTo(X(cxk), Y(edge), X(start), Y(edge))
        path.lineTo(X(-start), Y(edge))
        path.quadTo(X(-cxk), Y(edge), X(-sx), Y(sy))
        path.arcTo(RectF(X(-side), Y(-side), X(side), Y(side)), 180f - ang, ang * 2, false)
        path.quadTo(X(-cxk), Y(-edge), X(-start), Y(-edge))
        path.close()
    }

    /** Pantalla: esquinas redondeadas, arriba y abajo apenas curvos y los costados apenas abombados */
    private fun screenPath(lcd: RectF, r: Float) {
        val k = r * 0.075f
        path.reset()
        path.moveTo(lcd.left + k, lcd.top)
        path.lineTo(lcd.right - k, lcd.top)
        path.quadTo(lcd.right, lcd.top, lcd.right, lcd.top + k)
        path.lineTo(lcd.right, lcd.bottom - k)
        path.quadTo(lcd.right, lcd.bottom, lcd.right - k, lcd.bottom)
        path.lineTo(lcd.left + k, lcd.bottom)
        path.quadTo(lcd.left, lcd.bottom, lcd.left, lcd.bottom - k)
        path.lineTo(lcd.left, lcd.top + k)
        path.quadTo(lcd.left, lcd.top, lcd.left + k, lcd.top)
        path.close()
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

        val lcd = RectF(X(-0.70f), Y(-0.365f), X(0.70f), Y(0.345f))
        val ink = if (simple) Color.rgb(170, 170, 170) else sc.ink
        val ghost = if (simple) 0 else a(sc.ink, if (sc.dark) 30 else 26)

        if (!simple) {
            // Frente negro con un leve brillo al centro
            fill.shader = RadialGradient(cx, cy, r, Color.rgb(16, 18, 22), Color.rgb(4, 4, 6), Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, fill)
            fill.shader = null

            // Triángulos y nombre arriba (rectos, como en la foto)
            chevrons(canvas, cx, Y(-0.735f), r, th.chevron, top = true)
            val brand = "LUMINA"
            val bs = r * 0.085f
            val bw = width(brand, bs, bold)
            write(canvas, brand, cx, Y(-0.585f), bs, th.brand, bold, Paint.Align.CENTER, -0.2f)
            fill.color = th.label
            for (side in listOf(-1f, 1f)) {
                val ax = cx + side * (bw / 2 + r * 0.05f)
                path.reset()
                path.moveTo(ax + side * r * 0.03f, Y(-0.613f)); path.lineTo(ax - side * r * 0.012f, Y(-0.635f)); path.lineTo(ax - side * r * 0.012f, Y(-0.591f))
                path.close()
                canvas.drawPath(path, fill)
            }

            // Panel con la forma de la foto (costados curvos como la esfera), doble línea de color
            panelPath(cx, cy, r, 1f)
            fill.color = Color.rgb(16, 22, 34)
            canvas.drawPath(path, fill)
            stroke.color = th.frame
            stroke.strokeWidth = r * 0.02f
            canvas.drawPath(path, stroke)
            panelPath(cx, cy, r, 0.955f)
            stroke.color = a(th.frame, 120)
            stroke.strokeWidth = r * 0.006f
            canvas.drawPath(path, stroke)

            // APP 1 y APP 2 (accesos) en los costados
            for ((sx, label, deg) in listOf(Triple(-0.778f, "APP 1", -90f), Triple(0.778f, "APP 2", 90f))) {
                canvas.save()
                canvas.rotate(deg, X(sx), cy)
                write(canvas, label, X(sx), cy + r * 0.018f, r * 0.05f, th.label, mono, Paint.Align.CENTER)
                canvas.restore()
            }

            // Ritmo cardíaco y su estado
            val hrTxt = complications.textOf(HEART, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
                ?: heart.bpm.takeIf { it > 0 }?.toString()
            val hr = hrTxt?.toIntOrNull() ?: 0
            val ls = r * 0.056f
            fill.color = th.frame
            canvas.drawCircle(X(-0.54f), Y(-0.43f), r * 0.014f, fill)
            write(canvas, "HR:", X(-0.51f), Y(-0.41f), ls, th.label, mono, Paint.Align.LEFT)
            write(canvas, "${hrTxt ?: "--"} bpm", X(-0.36f), Y(-0.41f), ls, th.value, mono, Paint.Align.LEFT)
            val status = when {
                hr <= 0 -> "--"
                hr < 60 -> "Bajo"
                hr <= 100 -> "Normal"
                else -> "Alto"
            }
            val stColor = when (status) { "Normal" -> Color.rgb(60, 220, 110); "Bajo" -> Color.rgb(90, 180, 255); "Alto" -> Color.rgb(255, 90, 80); else -> Color.GRAY }
            canvas.drawCircle(X(0.22f), Y(-0.43f), r * 0.014f, fill)
            write(canvas, status, X(0.25f), Y(-0.41f), ls, stColor, bold, Paint.Align.LEFT)

            // Pasos y distancia
            val stepsTxt = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() } ?: ""
            val steps = stepsTxt.toLongOrNull() ?: 0L
            val km = steps * 0.00075
            val dist = if (Choices.value(context, DISTANCE) == 1) "%.2f mi".format(loc, km * 0.621371) else "%.2f km".format(loc, km)
            canvas.drawCircle(X(-0.54f), Y(0.435f), r * 0.014f, fill)
            write(canvas, "SC:", X(-0.51f), Y(0.455f), ls, th.label, mono, Paint.Align.LEFT)
            write(canvas, stepsTxt.ifEmpty { "--" }, X(-0.36f), Y(0.455f), ls, th.value, mono, Paint.Align.LEFT)
            canvas.drawCircle(X(0.22f), Y(0.435f), r * 0.014f, fill)
            write(canvas, dist, X(0.25f), Y(0.455f), ls, th.brand, mono, Paint.Align.LEFT)

            // WATER 50 RESIST y triángulos abajo (rectos)
            val ws = r * 0.062f
            write(canvas, "WATER", X(-0.11f), Y(0.655f), ws, th.label, bold, Paint.Align.RIGHT, -0.2f)
            write(canvas, "50", cx, Y(0.665f), r * 0.115f, th.brand, black, Paint.Align.CENTER, -0.3f)
            write(canvas, "RESIST", X(0.11f), Y(0.655f), ws, th.label, bold, Paint.Align.LEFT, -0.2f)
            chevrons(canvas, cx, Y(0.745f), r, th.chevron, top = false)

            // Pantalla: bisel y cristal
            stroke.color = Color.rgb(70, 76, 86)
            stroke.strokeWidth = r * 0.02f
            screenPath(lcd, r)
            canvas.drawPath(path, stroke)
            fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.bottom, sc.top, sc.bottom, Shader.TileMode.CLAMP)
            canvas.drawPath(path, fill)
            fill.shader = null
            if (!ambient && System.currentTimeMillis() < lightUntil) {
                // Luz: la pantalla se ilumina desde el centro
                val glow = if (sc.dark) a(sc.ink, 80) else Color.argb(150, 200, 255, 240)
                fill.shader = RadialGradient(lcd.centerX(), lcd.centerY(), lcd.width() * 0.6f, glow, Color.TRANSPARENT, Shader.TileMode.CLAMP)
                canvas.drawPath(path, fill)
                fill.shader = null
            }
            // Sombra arriba y reflejo
            fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.top + lcd.height() * 0.18f, Color.argb(60, 0, 0, 0), Color.TRANSPARENT, Shader.TileMode.CLAMP)
            canvas.drawPath(path, fill)
            fill.shader = null
        }

        // Modo reproductor: la pantalla muestra lo que suena en el teléfono
        playerLcd = RectF(lcd)
        val playingNow = PhoneNow.state?.takeIf { PhoneNow.active(context) }
        if (playingNow != null) {
            PlayerScreen.draw(canvas, lcd, r, t, DateFormat.is24HourFormat(context), playingNow, ink, ghost, ink, a(ink, 200), ambient)
        } else {
        // Batería: pila chica con su nivel y el porcentaje
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        if (!simple) {
            val bx = X(-0.665f)
            val by = Y(-0.32f)
            stroke.color = ink
            stroke.strokeWidth = r * 0.011f
            canvas.drawRoundRect(RectF(bx, by, bx + r * 0.12f, by + r * 0.056f), r * 0.01f, r * 0.01f, stroke)
            fill.color = ink
            canvas.drawRect(bx + r * 0.12f, by + r * 0.016f, bx + r * 0.135f, by + r * 0.04f, fill)
            if (pct >= 0) canvas.drawRect(bx + r * 0.014f, by + r * 0.014f, bx + r * 0.014f + r * 0.092f * pct / 100f, by + r * 0.042f, fill)
            write(canvas, if (pct >= 0) "$pct%" else "--", bx + r * 0.065f, Y(-0.185f), r * 0.068f, ink, bold, Paint.Align.CENTER)
        }

        // Día de la semana grande
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").take(3).uppercase(loc)
        write(canvas, dow, X(-0.465f), Y(-0.17f), r * 0.165f, ink, black, Paint.Align.LEFT)

        // Fecha (mes-día) en su cajita, con «8» apagados
        if (!simple) {
            fill.color = a(sc.ink, if (sc.dark) 22 else 16)
            canvas.drawRoundRect(RectF(X(0.14f), Y(-0.335f), X(0.66f), Y(-0.14f)), r * 0.02f, r * 0.02f, fill)
        }
        Lcd.row(canvas, "${t.monthValue}-${t.dayOfMonth}", X(0.65f), Y(-0.315f), r * 0.075f, r * 0.14f, r * 0.022f, 5, ink, ghost)

        // Alarma puesta: campana con ondas
        if (!simple) bell(canvas, X(0.56f), Y(-0.06f), r * 0.04f, if (Indicators.alarm(context)) ink else ghost)

        // Hora grande, segundos e indicador P / 24
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
        val m = "%02d".format(t.minute)
        val dw = r * 0.16f
        val dh = r * 0.30f
        val top = Y(0.0f)
        var x = X(-0.52f)
        Lcd.digit(canvas, h[0], x, top, dw, dh, ink, ghost); x += dw * 1.22f
        Lcd.digit(canvas, h[1], x, top, dw, dh, ink, ghost); x += dw * 1.22f
        Lcd.colon(canvas, x + dw * 0.18f, top, dh, r * 0.022f, ink); x += dw * 0.5f
        Lcd.digit(canvas, m[0], x, top, dw, dh, ink, ghost); x += dw * 1.22f
        Lcd.digit(canvas, m[1], x, top, dw, dh, ink, ghost)
        if (!ambient && Choices.value(context, SECONDS) == 0) {
            val s = "%02d".format(t.second)
            val sw = r * 0.11f
            val sh = r * 0.20f
            Lcd.digit(canvas, s[0], X(0.40f), top + dh - sh, sw, sh, ink, ghost)
            Lcd.digit(canvas, s[1], X(0.40f) + sw * 1.22f, top + dh - sh, sw, sh, ink, ghost)
        }
        write(canvas, if (is24) "24" else "P", X(-0.625f), top + r * 0.07f, r * 0.06f, if (is24 || t.hour >= 12) ink else ghost, bold, Paint.Align.CENTER)

        }

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
