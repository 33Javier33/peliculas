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
import cl.carlospnauto.esfera.comun.Choice
import cl.carlospnauto.esfera.comun.Choices
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.HeartRate
import cl.carlospnauto.esfera.comun.Lcd
import cl.carlospnauto.esfera.comun.PhoneNow
import cl.carlospnauto.esfera.comun.PlayerScreen
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Spot
import cl.carlospnauto.esfera.comun.textOf
import cl.carlospnauto.esfera.comun.titleOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.text.Normalizer
import java.time.ZonedDateTime
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.min

private const val STEPS = 101
private const val HEART = 102
private const val WEATHER = 103
private const val EVENT = 104

/** Pantalla de cristal líquido: fondo (arriba, abajo), tinta y si es negativa (fondo oscuro) */
private data class Screen(val top: Int, val bottom: Int, val ink: Int, val dark: Boolean = false)

private val SCREENS = listOf(
    "Calculadora clásica" to Screen(Color.rgb(214, 228, 64), Color.rgb(184, 204, 36), Color.rgb(22, 26, 6)),
    "Electroluminiscente" to Screen(Color.rgb(208, 216, 178), Color.rgb(180, 190, 150), Color.rgb(28, 32, 22)),
    "Verde menta" to Screen(Color.rgb(150, 234, 190), Color.rgb(108, 206, 158), Color.rgb(10, 36, 24)),
    "Ámbar" to Screen(Color.rgb(255, 208, 112), Color.rgb(236, 176, 70), Color.rgb(40, 24, 6)),
    "Celeste" to Screen(Color.rgb(178, 224, 250), Color.rgb(140, 198, 236), Color.rgb(10, 26, 40)),
    "Gris" to Screen(Color.rgb(216, 220, 214), Color.rgb(186, 190, 184), Color.rgb(22, 22, 22)),
    "Naranja" to Screen(Color.rgb(255, 172, 92), Color.rgb(236, 140, 60), Color.rgb(36, 16, 4)),
    "Negativa azul" to Screen(Color.rgb(12, 22, 42), Color.rgb(4, 10, 24), Color.rgb(96, 204, 255), true),
    "Negativa roja" to Screen(Color.rgb(32, 8, 8), Color.rgb(16, 2, 2), Color.rgb(255, 86, 72), true),
    "Negativa verde" to Screen(Color.rgb(8, 26, 12), Color.rgb(2, 12, 4), Color.rgb(116, 255, 144), true),
)
private val SCREEN = Choice("pantalla", "Color de la pantalla", SCREENS.map { it.first to it.second.top })

/** Aro, líneas, rayitas y el texto chico de color */
private data class Accent(val ring: Int, val bars: Int, val dashes: Int, val label: Int)

private val ACCENTS = listOf(
    "Naranja y celeste" to Accent(Color.rgb(232, 142, 40), Color.rgb(60, 172, 242), Color.rgb(240, 222, 40), Color.rgb(236, 146, 44)),
    "Azul y amarillo" to Accent(Color.rgb(44, 96, 240), Color.rgb(242, 212, 40), Color.rgb(40, 222, 232), Color.rgb(242, 184, 44)),
    "Rojo y blanco" to Accent(Color.rgb(222, 44, 44), Color.rgb(236, 236, 236), Color.rgb(222, 44, 44), Color.rgb(230, 70, 70)),
    "Verde y amarillo" to Accent(Color.rgb(64, 204, 96), Color.rgb(242, 212, 40), Color.rgb(64, 204, 96), Color.rgb(130, 224, 130)),
    "Violeta y cian" to Accent(Color.rgb(150, 90, 240), Color.rgb(60, 220, 236), Color.rgb(236, 120, 220), Color.rgb(180, 130, 250)),
)
private val ACCENT = Choice("acento", "Aro y líneas", ACCENTS.map { it.first to it.second.ring })
private val TOPLINE = Choice("linea", "Línea de arriba en la pantalla", listOf("Pasos y meta" to 0, "Próximo evento" to 1))
private val GOAL = Choice("meta", "Meta de pasos", listOf("6.000" to 6000, "8.000" to 8000, "10.000" to 10000, "12.000" to 12000, "15.000" to 15000))
private val AMB = Choice("bajo", "Bajo consumo", listOf("Esfera completa tenue" to 0, "Solo la hora" to 1))

object Config : FaceConfig {
    override val slots = listOf(STEPS to "Pasos (SC)", HEART to "Ritmo cardíaco (HR)", WEATHER to "Clima (en la pantalla)", EVENT to "Eventos (línea de arriba)")
    override val spots = listOf(
        Spot(-0.31f, -0.43f, Action.BATTERY, "Batería", hit = 0.10f),
        Spot(-0.33f, -0.57f, Action.MUSIC, "Nombre de arriba", hit = 0.12f),
        Spot(0f, 0.555f, Action.ALARMS, "Fecha", hit = 0.11f),
        Spot(0f, 0.72f, Action.MEDIA, "Marca de abajo", hit = 0.09f),
    )
    override val choices = listOf(SCREEN, ACCENT, TOPLINE, GOAL, AMB, PhoneNow.CHOICE)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val short = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        fun slot(id: Int, types: List<ComplicationType>, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, types, policy, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            slot(STEPS, short, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.58f, 0.26f, 0.72f, 0.31f)),
            slot(HEART, short, DefaultComplicationDataSourcePolicy(), RectF(0.25f, 0.69f, 0.40f, 0.745f)),
            slot(WEATHER, short, DefaultComplicationDataSourcePolicy(), RectF(0.63f, 0.34f, 0.82f, 0.42f)),
            slot(
                EVENT, listOf(ComplicationType.LONG_TEXT, ComplicationType.SHORT_TEXT),
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_NEXT_EVENT, ComplicationType.LONG_TEXT),
                RectF(0.16f, 0.34f, 0.60f, 0.42f),
            ),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = ElectroRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
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
                // Tocar la pantalla: se ilumina 3 segundos (la luz de los relojes digitales)
                if (renderer.inScreen(tapEvent.xPos, tapEvent.yPos)) renderer.light()
            }
        })
    }
}

class ElectroAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/**
 * Electro: reloj digital con pantalla de cristal líquido. Arriba el nombre, la batería y los pasos;
 * en la pantalla los pasos con la meta (o el próximo evento), el clima, la fecha, AM/PM, el ritmo y
 * la hora grande con segundos; abajo el ritmo, el mes, el día y la marca. Tocar la pantalla la ilumina.
 */
class ElectroRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<ElectroAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = ElectroAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND; strokeCap = Paint.Cap.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bold = Typeface.create("sans-serif", Typeface.BOLD)
    private val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var lightUntil = 0L
    var lastBounds = Rect()
        private set

    private val redraw: () -> Unit = { invalidate() }
    private var playerLcd: RectF? = null
    /** ¿Pantalla en bajo consumo? (para los segundos) */
    private var amb = false

    init {
        scope.launch {
            watchState.isAmbient.combine(watchState.isVisible) { ambient, visible -> ambient != true && visible == true }
                .collect { heart.update(it) }
        }
        PhoneNow.start(context, redraw)
    }

    override fun onDestroy() {
        PhoneNow.stop(context, redraw)
        heart.stop()
        scope.cancel()
        super.onDestroy()
    }

    /** Toque en los botones del reproductor; o tocar la pantalla para cambiar entre la hora y el reproductor */
    fun playerTap(x: Int, y: Int): Boolean {
        val lcd = playerLcd ?: return false
        if (!PhoneNow.enabled(context) || !lcd.contains(x.toFloat(), y.toFloat())) return false
        val s = PhoneNow.state ?: return false
        val r = min(lastBounds.width(), lastBounds.height()) / 2f
        val a = if (PhoneNow.active(context)) PlayerScreen.hit(lcd, r, x.toFloat(), y.toFloat(), s) else null
        if (a != null) PhoneNow.command(context, a) else if (!PhoneNow.toggleView(context)) return false
        invalidate()
        return true
    }

    fun light() {
        lightUntil = System.currentTimeMillis() + 3000
        invalidate()
    }

    fun inScreen(x: Int, y: Int): Boolean {
        if (lastBounds.isEmpty) return false
        return lcdRect(lastBounds).contains(x.toFloat(), y.toFloat())
    }

    private fun lcdRect(b: Rect): RectF {
        val r = min(b.width(), b.height()) / 2f
        val cx = b.exactCenterX()
        val cy = b.exactCenterY()
        return RectF(cx - 0.78f * r, cy - 0.39f * r, cx + 0.78f * r, cy + 0.36f * r)
    }

    private fun a(c: Int, alpha: Int) = Color.argb(alpha, Color.red(c), Color.green(c), Color.blue(c))

    private fun plain(s: String) = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}"), "").uppercase(Locale.ROOT)

    private fun write(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, face: Typeface, align: Paint.Align = Paint.Align.CENTER, scaleX: Float = 1f) {
        text.typeface = face
        text.textSize = size
        text.color = color
        text.textAlign = align
        text.textScaleX = scaleX
        canvas.drawText(s, x, y, text)
        text.textScaleX = 1f
    }

    /** Letra ancha de la foto (Michroma, licencia libre OFL) */
    private val wideFace: Typeface = runCatching { context.resources.getFont(R.font.michroma) }.getOrDefault(Typeface.DEFAULT_BOLD)

    private fun wide(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, align: Paint.Align = Paint.Align.CENTER, bold: Boolean = true) {
        // Trazo más grueso (como la letra de la foto)
        if (bold) {
            text.style = Paint.Style.FILL_AND_STROKE
            text.strokeWidth = size * 0.05f
        }
        write(canvas, s, x, y, size, color, wideFace, align)
        text.style = Paint.Style.FILL
        text.strokeWidth = 0f
    }

    /** Texto recto girado (deg −90: se lee de abajo hacia arriba; 90: de arriba hacia abajo) */
    private fun vertical(canvas: Canvas, s: String, x: Float, y: Float, deg: Float, size: Float, color: Int) {
        canvas.save()
        canvas.rotate(deg, x, y)
        write(canvas, s, x, y + size * 0.35f, size, color, wideFace, Paint.Align.CENTER)
        canvas.restore()
    }

    private fun arcText(canvas: Canvas, s: String, cx: Float, cy: Float, rad: Float, start: Float, sweep: Float, size: Float, color: Int) {
        path.reset()
        path.addArc(RectF(cx - rad, cy - rad, cx + rad, cy + rad), start, sweep)
        text.typeface = medium
        text.textSize = size
        text.color = color
        text.textAlign = Paint.Align.CENTER
        text.textScaleX = 1f
        canvas.drawTextOnPath(s, path, 0f, 0f, text)
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ElectroAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        amb = ambient
        val simple = ambient && Choices.value(context, AMB) == 1
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val is24 = DateFormat.is24HourFormat(context)
        val sc = SCREENS[Choices.index(context, SCREEN)].second
        val acc = ACCENTS[Choices.index(context, ACCENT)].second
        val ink = if (ambient && sc.dark) a(sc.ink, 200) else sc.ink
        val ghost = if (sc.dark) a(sc.ink, 26) else a(sc.ink, 20)
        val white = Color.rgb(236, 236, 236)
        Lcd.skew = 0f

        canvas.drawColor(Color.BLACK)
        val lcd = lcdRect(bounds)

        if (!simple) {
            // ===== Esfera: negra con un aro de color =====
            fill.shader = RadialGradient(cx, cy, r, Color.rgb(26, 26, 28), Color.rgb(6, 6, 7), Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, fill)
            fill.shader = null
            // Doble borde: aro de color en la orilla y, muy cerca por dentro, un aro fino blanco (fijo)
            stroke.color = acc.ring
            stroke.strokeWidth = r * 0.018f
            canvas.drawCircle(cx, cy, r * 0.975f, stroke)
            stroke.color = Color.rgb(232, 232, 232)
            stroke.strokeWidth = r * 0.006f
            canvas.drawCircle(cx, cy, r * 0.947f, stroke)

            // ===== Arriba: nombre, barra, batería y pasos (medidas de la foto) =====
            wide(canvas, "ELECTRO", X(-0.55f), Y(-0.625f), r * 0.057f, white, Paint.Align.LEFT)
            wide(canvas, "LUMINESCENCE", X(-0.55f), Y(-0.555f), r * 0.057f, white, Paint.Align.LEFT)
            // Barra de rayita a rayita
            bar(canvas, X(-0.74f), X(0.74f), Y(-0.515f), r, acc.bars)
            // Rayitas en las esquinas, a la altura del texto
            dash(canvas, X(-0.74f), Y(-0.452f), r, acc.dashes)
            dash(canvas, X(0.655f), Y(-0.452f), r, acc.dashes)
            val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            wide(canvas, "BATTERY ${if (pct >= 0) "$pct%" else "--"}", X(-0.31f), Y(-0.437f), r * 0.044f, white)
            val steps = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() }?.toIntOrNull()
            wide(canvas, "SC ${steps ?: "--"}", X(0.31f), Y(-0.437f), r * 0.044f, white)

            // Textos de los costados, rectos (como la foto)
            vertical(canvas, "Water Resist 50m", X(-0.855f), cy, -90f, r * 0.037f, white)
            vertical(canvas, "Start / Stop On-Off", X(0.855f), cy, 90f, r * 0.037f, white)

            // ===== Abajo: ritmo, mes, día y la marca =====
            val hr = complications.textOf(HEART, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
                ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
            dash(canvas, X(-0.74f), Y(0.452f), r, acc.dashes)
            dash(canvas, X(0.655f), Y(0.452f), r, acc.dashes)
            wide(canvas, "HR  $hr", X(-0.615f), Y(0.47f), r * 0.047f, white, Paint.Align.LEFT)
            wide(canvas, "ALARM CHRONOGRAPH", X(0.62f), Y(0.466f), r * 0.031f, acc.label, Paint.Align.RIGHT, bold = false)
            bar(canvas, X(-0.74f), X(-0.235f), Y(0.525f), r, acc.bars)
            bar(canvas, X(0.235f), X(0.74f), Y(0.525f), r, acc.bars)
            // Cajita del día (bordes redondeados y esquinas de abajo en bisel)
            val bt = Y(0.50f)
            val bb = Y(0.655f)
            val bl = X(-0.225f)
            val br = X(0.225f)
            val k = r * 0.03f
            path.reset()
            path.moveTo(bl + k, bt)
            path.lineTo(br - k, bt)
            path.quadTo(br, bt, br, bt + k)
            path.lineTo(br, bb - k * 1.6f)
            path.lineTo(br - k * 1.6f, bb)
            path.lineTo(bl + k * 1.6f, bb)
            path.lineTo(bl, bb - k * 1.6f)
            path.lineTo(bl, bt + k)
            path.quadTo(bl, bt, bl + k, bt)
            path.close()
            fill.color = Color.rgb(8, 8, 9)
            canvas.drawPath(path, fill)
            stroke.color = acc.bars
            stroke.strokeWidth = r * 0.011f
            canvas.drawPath(path, stroke)
            wide(canvas, t.dayOfMonth.toString(), cx, Y(0.612f), r * 0.07f, white)
            val mon = t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").replaceFirstChar { it.titlecase(loc) }.take(3)
            val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").replaceFirstChar { it.titlecase(loc) }.take(3)
            wide(canvas, mon, X(-0.47f), Y(0.628f), r * 0.068f, white)
            wide(canvas, dow, X(0.47f), Y(0.628f), r * 0.068f, white)
            wide(canvas, "CARLOS P. NAUTO", cx, Y(0.765f), r * 0.038f, white)
        }

        // ===== Pantalla de cristal líquido =====
        val rad = r * 0.035f
        if (!simple) {
            stroke.color = Color.rgb(190, 192, 188)
            stroke.strokeWidth = r * 0.016f
            canvas.drawRoundRect(lcd, rad, rad, stroke)
        }
        fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.bottom, sc.top, sc.bottom, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(lcd, rad, rad, fill)
        fill.shader = null
        if (simple) {
            fill.color = Color.argb(170, 0, 0, 0)
            canvas.drawRoundRect(lcd, rad, rad, fill)
        }
        if (!ambient && System.currentTimeMillis() < lightUntil) {
            // Luz: la pantalla se ilumina desde el centro
            val glow = if (sc.dark) a(sc.ink, 80) else Color.argb(150, 220, 255, 230)
            fill.shader = RadialGradient(lcd.centerX(), lcd.centerY(), lcd.width() * 0.6f, glow, Color.TRANSPARENT, Shader.TileMode.CLAMP)
            canvas.drawRoundRect(lcd, rad, rad, fill)
            fill.shader = null
        }
        // Rejilla fina de los puntitos de la pantalla y la sombra de arriba
        if (!ambient) {
            stroke.color = Color.argb(if (sc.dark) 18 else 14, 0, 0, 0)
            stroke.strokeWidth = r * 0.002f
            var gx = lcd.left + r * 0.012f
            while (gx < lcd.right) { canvas.drawLine(gx, lcd.top, gx, lcd.bottom, stroke); gx += r * 0.012f }
            var gy = lcd.top + r * 0.012f
            while (gy < lcd.bottom) { canvas.drawLine(lcd.left, gy, lcd.right, gy, stroke); gy += r * 0.012f }
            fill.shader = LinearGradient(lcd.left, lcd.top, lcd.left, lcd.top + lcd.height() * 0.16f, Color.argb(60, 0, 0, 0), Color.TRANSPARENT, Shader.TileMode.CLAMP)
            canvas.drawRoundRect(lcd, rad, rad, fill)
            fill.shader = null
        }

        // Modo reproductor: la pantalla muestra lo que suena en el teléfono
        playerLcd = RectF(lcd)
        val playingNow = PhoneNow.state?.takeIf { PhoneNow.active(context) && !simple }
        if (playingNow != null) {
            PlayerScreen.draw(canvas, lcd, r, t, is24, playingNow, ink, ghost, ink, a(ink, 200), ambient)
        } else {
            drawScreen(canvas, lcd, r, t, is24, ink, ghost, simple)
        }

        // Siempre activa: la esfera completa, más tenue
        if (ambient && !simple) canvas.drawColor(Color.argb(140, 0, 0, 0))
    }

    private fun drawScreen(canvas: Canvas, lcd: RectF, r: Float, t: ZonedDateTime, is24: Boolean, ink: Int, ghost: Int, simple: Boolean) {
        fun X(v: Float) = lcd.centerX() + v * r
        fun Y(v: Float) = lcd.top + v * r
        if (!simple) {
            // Línea de arriba: pasos con la meta, o el próximo evento
            if (Choices.value(context, TOPLINE) == 0) {
                drawShoe(canvas, X(-0.675f), Y(0.085f), r * 0.03f, ink)
                val steps = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() } ?: "--"
                val goal = Choices.value(context, GOAL).toString()
                digits(canvas, "$steps/$goal", X(-0.71f), Y(0.145f), r * 0.046f, r * 0.08f, ink, ghost)
            } else {
                drawCalendar(canvas, X(-0.675f), Y(0.085f), r * 0.03f, ink)
                val ev = complications.textOf(EVENT, context.resources)
                val title = complications.titleOf(EVENT, context.resources)
                val line = plain(when {
                    ev == null -> "SIN EVENTOS HOY"
                    title != null -> "$title $ev"
                    else -> ev
                }).filter { it.isLetterOrDigit() || it == ' ' || it == ':' || it == '-' }.take(15)
                Lcd.text14(canvas, line, X(-0.71f), Y(0.145f), r * 0.037f, r * 0.074f, r * 0.008f, ink, ghost)
            }
            // Clima y fecha a la derecha
            val temp = complications.textOf(WEATHER, context.resources)?.filter { it.isDigit() || it == '-' }?.takeIf { it.isNotEmpty() } ?: "--"
            digits(canvas, temp.takeLast(3), X(0.27f), Y(0.08f), r * 0.056f, r * 0.11f, ink, ghost)
            val tw = digitsWidth(temp.takeLast(3), r * 0.056f)
            stroke.color = ink
            stroke.strokeWidth = r * 0.008f
            canvas.drawCircle(X(0.27f) + tw + r * 0.022f, Y(0.095f), r * 0.012f, stroke)
            Lcd.text14(canvas, "C", X(0.27f) + tw + r * 0.04f, Y(0.08f), r * 0.03f, r * 0.05f, 0f, ink, 0)
            val dd = "%02d".format(t.dayOfMonth)
            val mm = "%02d".format(t.monthValue)
            digits(canvas, dd, X(0.60f), Y(0.075f), r * 0.032f, r * 0.054f, ink, ghost)
            fill.color = ink
            canvas.drawRect(X(0.59f), Y(0.137f), X(0.70f), Y(0.143f), fill)
            digits(canvas, mm, X(0.60f), Y(0.152f), r * 0.032f, r * 0.054f, ink, ghost)

            // Segunda línea: AM/PM, corazón y ritmo
            if (!is24) Lcd.text14(canvas, if (t.hour < 12) "AM" else "PM", X(-0.71f), Y(0.24f), r * 0.043f, r * 0.076f, r * 0.01f, ink, ghost)
            drawHeart(canvas, X(-0.515f), Y(0.278f), r * 0.032f, ink)
            val hr = complications.textOf(HEART, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
                ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
            digits(canvas, hr, X(-0.46f), Y(0.242f), r * 0.04f, r * 0.072f, ink, ghost)
            Lcd.text14(canvas, "LPM", X(-0.46f) + digitsWidth(hr, r * 0.04f) + r * 0.03f, Y(0.242f), r * 0.034f, r * 0.072f, r * 0.008f, ink, ghost)
        }

        // Hora grande con segundos
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).let { "%02d".format(it) }
        val m = "%02d".format(t.minute)
        val dh = r * 0.32f
        val dw = r * 0.235f
        val gap = r * 0.032f
        val colon = r * 0.08f
        val top = Y(0.395f)
        var x = X(-0.715f)
        seg(canvas, h[0], x, top, dw, dh, ink, ghost); x += dw + gap
        seg(canvas, h[1], x, top, dw, dh, ink, ghost); x += dw
        colonDots(canvas, x + colon / 2, top, dh, r * 0.02f, ink); x += colon
        seg(canvas, m[0], x, top, dw, dh, ink, ghost); x += dw + gap
        seg(canvas, m[1], x, top, dw, dh, ink, ghost); x += dw
        // Segundos: en bajo consumo quedan en 00 y vuelven a correr al encender la pantalla
        val sh = r * 0.18f
        val sw = r * 0.12f
        val sTop = top + dh - sh
        colonDots(canvas, x + r * 0.035f, sTop, sh, r * 0.013f, ink)
        x += r * 0.07f
        val s = if (amb) "00" else "%02d".format(t.second)
        seg(canvas, s[0], x, sTop, sw, sh, ink, ghost); x += sw + r * 0.02f
        seg(canvas, s[1], x, sTop, sw, sh, ink, ghost)
    }

    private fun colonDots(canvas: Canvas, x: Float, top: Float, h: Float, d: Float, ink: Int) {
        fill.color = ink
        canvas.drawRect(x - d, top + h * 0.30f - d, x + d, top + h * 0.30f + d, fill)
        canvas.drawRect(x - d, top + h * 0.72f - d, x + d, top + h * 0.72f + d, fill)
    }

    private fun digitsWidth(s: String, w: Float) = s.sumOf { (if (it == '/' || it == '-') w * 0.8 else (w * 1.25).toDouble()) }.toFloat()

    /** Números chicos de segmentos (y la barra «/») en una fila desde x */
    private fun digits(canvas: Canvas, s: String, x0: Float, top: Float, w: Float, h: Float, ink: Int, ghost: Int) {
        var x = x0
        for (c in s) {
            when (c) {
                '/' -> {
                    stroke.color = ink
                    stroke.strokeWidth = w * 0.2f
                    canvas.drawLine(x + w * 0.65f, top, x + w * 0.05f, top + h, stroke)
                    x += w * 0.8f
                }
                '-' -> {
                    fill.color = ink
                    canvas.drawRect(x + w * 0.1f, top + h * 0.45f, x + w * 0.7f, top + h * 0.55f, fill)
                    x += w * 0.8f
                }
                else -> {
                    seg(canvas, c, x, top, w, h, ink, ghost)
                    x += w * 1.25f
                }
            }
        }
    }

    private val SEGS = mapOf(
        '0' to "abcdef", '1' to "bc", '2' to "abged", '3' to "abgcd", '4' to "fgbc", '5' to "afgcd",
        '6' to "afgedc", '7' to "abc", '8' to "abcdefg", '9' to "abcdfg",
    )

    /** Número de 7 segmentos con puntas en diagonal (esquinas cuadradas), con los apagados apenas visibles */
    private fun seg(canvas: Canvas, ch: Char, x: Float, y: Float, w: Float, h: Float, on: Int, ghost: Int) {
        val t = w * 0.19f
        val gp = t * 0.12f
        val m = y + h / 2
        val ht = t / 2
        val lit = SEGS[ch].orEmpty()
        fun poly(k: Char, vararg p: Float) {
            val c = if (k in lit) on else ghost
            if (Color.alpha(c) == 0) return
            fill.color = c
            path.reset()
            path.moveTo(p[0], p[1])
            var i = 2
            while (i < p.size) { path.lineTo(p[i], p[i + 1]); i += 2 }
            path.close()
            canvas.drawPath(path, fill)
        }
        val rr = x + w
        val b = y + h
        poly('a', x + gp, y, rr - gp, y, rr - t - gp, y + t, x + t + gp, y + t)
        poly('d', x + gp, b, rr - gp, b, rr - t - gp, b - t, x + t + gp, b - t)
        poly('f', x, y + gp, x + t, y + t + gp, x + t, m - ht - gp, x, m - gp)
        poly('b', rr, y + gp, rr - t, y + t + gp, rr - t, m - ht - gp, rr, m - gp)
        poly('e', x, m + gp, x + t, m + ht + gp, x + t, b - t - gp, x, b - gp)
        poly('c', rr, m + gp, rr - t, m + ht + gp, rr - t, b - t - gp, rr, b - gp)
        poly('g', x + gp, m, x + t + gp, m - ht, rr - t - gp, m - ht, rr - gp, m, rr - t - gp, m + ht, x + t + gp, m + ht)
    }

    private fun bar(canvas: Canvas, x0: Float, x1: Float, y: Float, r: Float, color: Int) {
        fill.color = color
        canvas.drawRect(x0, y - r * 0.006f, x1, y + r * 0.006f, fill)
    }

    private fun dash(canvas: Canvas, x: Float, y: Float, r: Float, color: Int) {
        fill.color = color
        canvas.drawRect(x, y - r * 0.008f, x + r * 0.085f, y + r * 0.008f, fill)
    }

    private fun drawShoe(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x - s, y + s * 0.5f)
        path.lineTo(x - s * 0.9f, y - s * 0.5f)
        path.lineTo(x - s * 0.3f, y - s * 0.3f)
        path.lineTo(x + s * 0.4f, y + s * 0.05f)
        path.quadTo(x + s * 1.1f, y + s * 0.1f, x + s * 1.1f, y + s * 0.5f)
        path.close()
        canvas.drawPath(path, fill)
    }

    private fun drawCalendar(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        stroke.color = color
        stroke.strokeWidth = s * 0.22f
        canvas.drawRect(x - s, y - s * 0.8f, x + s, y + s, stroke)
        fill.color = color
        canvas.drawRect(x - s, y - s * 0.8f, x + s, y - s * 0.3f, fill)
    }

    private fun drawHeart(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x, y + s * 0.95f)
        path.cubicTo(x - s * 1.5f, y - s * 0.05f, x - s * 0.85f, y - s * 1.25f, x, y - s * 0.45f)
        path.cubicTo(x + s * 0.85f, y - s * 1.25f, x + s * 1.5f, y - s * 0.05f, x, y + s * 0.95f)
        path.close()
        canvas.drawPath(path, fill)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: ElectroAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
