package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
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
import cl.carlospnauto.esfera.comun.Indicators
import cl.carlospnauto.esfera.comun.PhoneNow
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Smooth
import cl.carlospnauto.esfera.comun.Spot
import cl.carlospnauto.esfera.comun.textOf
import cl.carlospnauto.esfera.comun.titleOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.ZonedDateTime
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

private const val WEATHER = 101
private const val STEPS = 102
private const val EVENT = 103
private const val HEART = 104

/** Colores: barra de pasos (de-a), marca del día, segundero */
private data class Theme(val from: Int, val to: Int, val day: Int, val second: Int)

private val THEMES = listOf(
    "Naranja y cian" to Theme(Color.rgb(250, 210, 40), Color.rgb(255, 120, 20), Color.rgb(80, 220, 235), Color.rgb(220, 30, 30)),
    "Verde" to Theme(Color.rgb(200, 240, 80), Color.rgb(60, 200, 90), Color.rgb(120, 240, 140), Color.rgb(60, 200, 90)),
    "Azul" to Theme(Color.rgb(120, 220, 255), Color.rgb(40, 120, 255), Color.rgb(90, 170, 255), Color.rgb(40, 140, 255)),
    "Rojo" to Theme(Color.rgb(255, 170, 90), Color.rgb(235, 40, 50), Color.rgb(255, 90, 90), Color.rgb(235, 40, 50)),
    "Violeta" to Theme(Color.rgb(240, 150, 255), Color.rgb(150, 80, 255), Color.rgb(190, 140, 255), Color.rgb(170, 90, 255)),
    "Blanco" to Theme(Color.rgb(230, 230, 230), Color.rgb(170, 170, 170), Color.WHITE, Color.rgb(220, 30, 30)),
)
private val THEME = Choice("tema", "Colores", THEMES.map { it.first to it.second.to })
private val GOAL = Choice("meta", "Meta de pasos", listOf("10.000" to 10000, "6.000" to 6000, "8.000" to 8000, "12.000" to 12000, "15.000" to 15000))
private val MINI = Choice("mini2", "Reproductor", listOf("Siempre visible" to 0, "Ocultar (ver eventos ahí)" to 1))
private val AMB = Choice("bajo", "Bajo consumo", listOf("Pantalla completa tenue" to 0, "Mínimo" to 1))

object Config : FaceConfig {
    override val slots = listOf(WEATHER to "Clima (arriba)", STEPS to "Pasos", EVENT to "Eventos", HEART to "Ritmo cardíaco")
    override val spots = listOf(
        Spot(-0.63f, 0.55f, Action.MUSIC, "Ícono de la izquierda", hit = 0.10f),
        Spot(-0.68f, 0.02f, Action.ALARMS, "Campana (alarmas)", hit = 0.09f),
        Spot(0.40f, 0.20f, Action.MEDIA, "Toque en la hora", hit = 0.22f),
        Spot(-0.14f, 0.80f, Action.BATTERY, "Batería", hit = 0.11f),
        Spot(0.03f, 0.53f, Action.TIMER, "Mes", hit = 0.09f),
    )
    override val choices = listOf(THEME, GOAL, MINI, AMB, Smooth.CHOICE)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val short = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        fun slot(id: Int, types: List<ComplicationType>, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, types, policy, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            slot(WEATHER, short, DefaultComplicationDataSourcePolicy(), RectF(0.21f, 0.165f, 0.40f, 0.225f)),
            slot(STEPS, short, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.20f, 0.235f, 0.85f, 0.33f)),
            // Eventos: la línea junto a la temperatura
            slot(
                EVENT, listOf(ComplicationType.LONG_TEXT, ComplicationType.SHORT_TEXT),
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_NEXT_EVENT, ComplicationType.LONG_TEXT),
                RectF(0.40f, 0.165f, 0.75f, 0.225f),
            ),
            slot(HEART, short, DefaultComplicationDataSourcePolicy(), RectF(0.53f, 0.86f, 0.72f, 0.96f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = HybridRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                // Botones del mini reproductor
                if (renderer.playerTap(tapEvent.xPos, tapEvent.yPos)) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class HybridAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/**
 * Esfera híbrida: escala de minutos en el borde, clima, pasos con distancia y meta, eventos (o el mini
 * reproductor de PulsoMusic/PulsoMedia), reloj de agujas con fecha y alarma, hora digital grande con
 * segundos, mes y días de la semana, batería y ritmo cardíaco con su zona.
 */
class HybridRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<HybridAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = HybridAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bold = Typeface.create("sans-serif", Typeface.BOLD)
    private val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    private val condensed = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    var lastBounds = Rect()
        private set

    private val redraw: () -> Unit = { invalidate() }

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

    private fun a(c: Int, alpha: Int) = Color.argb(alpha, Color.red(c), Color.green(c), Color.blue(c))

    private fun mix(c1: Int, c2: Int, f: Float) = Color.rgb(
        (Color.red(c1) + (Color.red(c2) - Color.red(c1)) * f).toInt(),
        (Color.green(c1) + (Color.green(c2) - Color.green(c1)) * f).toInt(),
        (Color.blue(c1) + (Color.blue(c2) - Color.blue(c1)) * f).toInt(),
    )

    private fun write(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, face: Typeface, align: Paint.Align, maxW: Float = 0f) {
        text.typeface = face
        text.textSize = size
        text.color = color
        text.textAlign = align
        text.textScaleX = 1f
        var t = s
        if (maxW > 0f && text.measureText(t) > maxW) {
            text.textScaleX = maxOf(0.85f, maxW / text.measureText(t))
            while (t.length > 2 && text.measureText(t) > maxW) t = t.dropLast(2) + "…"
        }
        canvas.drawText(t, x, y, text)
        text.textScaleX = 1f
    }

    private fun width(s: String, size: Float, face: Typeface): Float {
        text.typeface = face
        text.textSize = size
        return text.measureText(s)
    }

    // ===== Mini reproductor (zona de eventos) =====
    private fun miniOn() = Choices.value(context, MINI) == 0

    private fun playerZone(cx: Float, cy: Float, r: Float, k: Int): RectF {
        val x0 = cx + r * (0.62f + k * 0.09f)
        return RectF(x0, cy - r * 0.29f, x0 + r * 0.09f, cy - r * 0.05f)
    }

    fun playerTap(x: Int, y: Int): Boolean {
        if (!miniOn()) return false
        val s = PhoneNow.current()
        val b = lastBounds
        if (b.isEmpty) return false
        val r = min(b.width(), b.height()) / 2f
        val cx = b.exactCenterX()
        val cy = b.exactCenterY()
        val action = when {
            playerZone(cx, cy, r, 0).contains(x.toFloat(), y.toFloat()) -> "prev"
            playerZone(cx, cy, r, 1).contains(x.toFloat(), y.toFloat()) -> if (s?.playing == true) "pause" else "play"
            playerZone(cx, cy, r, 2).contains(x.toFloat(), y.toFloat()) -> "next"
            else -> return false
        }
        PhoneNow.command(context, action)
        invalidate()
        return true
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: HybridAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        val simple = ambient && Choices.value(context, AMB) == 1
        interactiveDrawModeUpdateDelayMillis = Smooth.delay(context)
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val th = THEMES[Choices.index(context, THEME)].second
        val white = Color.rgb(240, 240, 240)
        val grey = Color.rgb(165, 165, 170)
        canvas.drawColor(Color.BLACK)

        if (simple) {
            // Bajo consumo mínimo: solo la hora y la fecha
            val is24 = DateFormat.is24HourFormat(context)
            val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
            write(canvas, "$h:${"%02d".format(t.minute)}", cx, Y(0.10f), r * 0.34f, Color.rgb(200, 200, 200), bold, Paint.Align.CENTER)
            write(canvas, "${t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).uppercase(loc)} ${t.dayOfMonth}", cx, Y(0.30f), r * 0.08f, Color.GRAY, medium, Paint.Align.CENTER)
            return
        }

        // Fondo: gris muy oscuro con brillo al centro
        fill.shader = RadialGradient(cx, cy, r, Color.rgb(34, 34, 36), Color.rgb(12, 12, 13), Shader.TileMode.CLAMP)
        canvas.drawCircle(cx, cy, r, fill)
        fill.shader = null

        // ===== Escala del borde (como la foto) =====
        // Arriba (del 50 al 10): banda algo más clara con rayitas finas y apretadas entre los números
        stroke.strokeCap = Paint.Cap.BUTT
        stroke.color = Color.rgb(36, 36, 38)
        stroke.strokeWidth = r * 0.07f
        canvas.drawArc(RectF(cx - r * 0.945f, cy - r * 0.945f, cx + r * 0.945f, cy + r * 0.945f), -90f - 62f, 124f, false, stroke)
        for (i in 0 until 300) {
            val deg = i * 1.2f
            val fromTop = if (deg > 180f) 360f - deg else deg
            if (fromTop > 61f) continue
            // Hueco para cada número
            val toNum = (deg % 30f).let { minOf(it, 30f - it) }
            if (toNum < 5.5f) continue
            val ang = Math.toRadians(deg - 90.0).toFloat()
            stroke.color = Color.rgb(150, 150, 155)
            stroke.strokeWidth = r * 0.005f
            canvas.drawLine(cx + cos(ang) * r * 0.925f, cy + sin(ang) * r * 0.925f, cx + cos(ang) * r * 0.965f, cy + sin(ang) * r * 0.965f, stroke)
        }
        // Resto: una rayita por minuto, más larga en los 5, unidas por una línea escalonada
        for (m in 0 until 60) {
            val deg = m * 6f
            val fromTop = if (deg > 180f) 360f - deg else deg
            if (fromTop < 62f || m % 5 == 0) continue
            val ang = Math.toRadians(deg - 90.0).toFloat()
            stroke.color = Color.rgb(205, 205, 205)
            stroke.strokeWidth = r * 0.008f
            canvas.drawLine(cx + cos(ang) * r * 0.90f, cy + sin(ang) * r * 0.90f, cx + cos(ang) * r * 0.945f, cy + sin(ang) * r * 0.945f, stroke)
        }
        stroke.color = Color.rgb(150, 150, 155)
        stroke.strokeWidth = r * 0.005f
        for (side in listOf(1f, -1f)) {
            // Línea fina del borde en la mitad de abajo (de un costado al otro)
            canvas.drawArc(RectF(cx - r * 0.945f, cy - r * 0.945f, cx + r * 0.945f, cy + r * 0.945f), if (side > 0) -28f else 152f, 56f, false, stroke)
        }
        canvas.drawArc(RectF(cx - r * 0.945f, cy - r * 0.945f, cx + r * 0.945f, cy + r * 0.945f), 28f, 124f, false, stroke)
        stroke.strokeCap = Paint.Cap.ROUND
        for (k in 1..12) {
            canvas.save()
            canvas.rotate(k * 30f, cx, cy)
            write(canvas, "${k * 5}", cx, cy - r * 0.93f + r * 0.03f, r * 0.075f, Color.rgb(225, 225, 225), condensed, Paint.Align.CENTER)
            canvas.restore()
        }

        // ===== Clima =====
        // Ícono del clima que manda el dato elegido (sol, nube, lluvia…); si no trae, sol con nube
        val wIcon = weatherIcon()
        if (wIcon != null) {
            val s = (r * 0.08f).toInt()
            wIcon.setBounds((X(0f) - s).toInt(), (Y(-0.785f) - s).toInt(), (X(0f) + s).toInt(), (Y(-0.785f) + s).toInt())
            wIcon.setTint(Color.WHITE)
            wIcon.draw(canvas)
        } else {
        fill.color = Color.rgb(255, 196, 60)
        canvas.drawCircle(X(0.045f), Y(-0.835f), r * 0.042f, fill)
        stroke.color = Color.rgb(255, 196, 60)
        stroke.strokeWidth = r * 0.008f
        for (k in 0 until 8) {
            val ang = Math.toRadians(k * 45.0).toFloat()
            canvas.drawLine(X(0.045f) + cos(ang) * r * 0.055f, Y(-0.835f) + sin(ang) * r * 0.055f, X(0.045f) + cos(ang) * r * 0.072f, Y(-0.835f) + sin(ang) * r * 0.072f, stroke)
        }
        fill.color = Color.rgb(245, 245, 245)
        canvas.drawCircle(X(-0.055f), Y(-0.79f), r * 0.035f, fill)
        canvas.drawCircle(X(-0.005f), Y(-0.815f), r * 0.048f, fill)
        canvas.drawCircle(X(0.05f), Y(-0.79f), r * 0.032f, fill)
        canvas.drawRoundRect(RectF(X(-0.09f), Y(-0.80f), X(0.085f), Y(-0.755f)), r * 0.02f, r * 0.02f, fill)
        }

        // Marco del clima (corchete claro a la izquierda) y línea de abajo
        stroke.shader = LinearGradient(X(-0.55f), 0f, X(0.75f), 0f, Color.rgb(230, 230, 230), Color.rgb(60, 60, 62), Shader.TileMode.CLAMP)
        stroke.strokeWidth = r * 0.016f
        path.reset()
        path.moveTo(X(-0.28f), Y(-0.70f))
        path.lineTo(X(-0.50f), Y(-0.70f))
        path.quadTo(X(-0.57f), Y(-0.70f), X(-0.57f), Y(-0.63f))
        path.quadTo(X(-0.57f), Y(-0.56f), X(-0.50f), Y(-0.56f))
        path.lineTo(X(0.47f), Y(-0.56f))
        canvas.drawPath(path, stroke)
        stroke.shader = null
        val temp = complications.textOf(WEATHER, context.resources)
        val wTitle = complications.titleOf(WEATHER, context.resources)
        val digits = temp?.filter { it.isDigit() || it == '-' }.orEmpty()
        write(canvas, digits.ifEmpty { "--" }, X(-0.32f), Y(-0.59f), r * 0.10f, white, medium, Paint.Align.RIGHT)
        write(canvas, if (temp?.contains("F") == true) "°F" else "°C", X(-0.305f), Y(-0.645f), r * 0.045f, white, medium, Paint.Align.LEFT)
        // Junto a la temperatura: el próximo evento (con el reproductor visible, los eventos van aquí);
        // si no hay, el estado del clima
        val ev = complications.textOf(EVENT, context.resources)
        val evTitle = complications.titleOf(EVENT, context.resources)
        val evLine = when {
            ev == null -> null
            evTitle != null -> "$evTitle  $ev"
            else -> ev
        }
        if (miniOn() && evLine != null) {
            drawCalendar(canvas, X(-0.16f), Y(-0.625f), r * 0.032f, t.dayOfMonth)
            write(canvas, evLine, X(-0.115f), Y(-0.598f), r * 0.056f, Color.rgb(225, 225, 225), medium, Paint.Align.LEFT, maxW = r * 0.58f)
        } else {
            write(canvas, wTitle ?: if (temp == null) "Elige el clima en Personalizar" else if (miniOn()) "Sin eventos próximos" else "", X(-0.19f), Y(-0.595f), r * 0.058f, Color.rgb(225, 225, 225), medium, Paint.Align.LEFT, maxW = r * 0.62f)
        }

        // ===== Pasos, distancia y meta =====
        // Corchete naranja a la derecha
        stroke.color = th.to
        stroke.strokeWidth = r * 0.016f
        path.reset()
        path.moveTo(X(0.47f), Y(-0.56f))
        path.lineTo(X(0.62f), Y(-0.56f))
        path.quadTo(X(0.71f), Y(-0.56f), X(0.71f), Y(-0.47f))
        path.lineTo(X(0.71f), Y(-0.43f))
        path.quadTo(X(0.71f), Y(-0.345f), X(0.62f), Y(-0.345f))
        canvas.drawPath(path, stroke)
        val stepsTxt = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() } ?: ""
        val steps = stepsTxt.toLongOrNull() ?: 0L
        val km = steps * 0.00075
        drawShoe(canvas, X(-0.63f), Y(-0.465f), r * 0.045f, white)
        write(canvas, "%.2fkm".format(loc, km), X(-0.50f), Y(-0.44f), r * 0.085f, white, bold, Paint.Align.LEFT)
        stroke.shader = LinearGradient(X(-0.12f), 0f, X(0.0f), 0f, Color.TRANSPARENT, white, Shader.TileMode.CLAMP)
        stroke.strokeWidth = r * 0.012f
        canvas.drawLine(X(-0.12f), Y(-0.47f), X(0.0f), Y(-0.47f), stroke)
        stroke.shader = null
        write(canvas, stepsTxt.ifEmpty { "--" }, X(0.08f), Y(-0.44f), r * 0.09f, white, bold, Paint.Align.LEFT)
        val sw = width(stepsTxt.ifEmpty { "--" }, r * 0.09f, bold)
        write(canvas, "Pasos", X(0.08f) + sw + r * 0.03f, Y(-0.44f), r * 0.055f, grey, medium, Paint.Align.LEFT)
        drawWalker(canvas, X(0.63f), Y(-0.47f), r * 0.05f, white)
        // Meta en 5 tramos (de amarillo a naranja)
        val goal = Choices.value(context, GOAL).coerceAtLeast(1)
        val f = (steps.toFloat() / goal).coerceIn(0f, 1f) * 5f
        for (k in 0 until 5) {
            val x0 = X(-0.13f + k * 0.16f)
            val x1 = x0 + r * 0.13f
            stroke.strokeWidth = r * 0.022f
            stroke.strokeCap = Paint.Cap.BUTT
            stroke.color = Color.rgb(55, 55, 58)
            canvas.drawLine(x0, Y(-0.345f), x1, Y(-0.345f), stroke)
            val part = (f - k).coerceIn(0f, 1f)
            if (part > 0f) {
                stroke.color = mix(th.from, th.to, k / 4f)
                canvas.drawLine(x0, Y(-0.345f), x0 + (x1 - x0) * part, Y(-0.345f), stroke)
            }
            stroke.strokeCap = Paint.Cap.ROUND
        }

        // ===== Eventos, o el mini reproductor cuando suena PulsoMusic / PulsoMedia =====
        val band = RectF(X(-0.06f), Y(-0.30f), X(0.92f), Y(-0.035f))
        canvas.save()
        path.reset()
        path.addCircle(cx, cy, r * 0.86f, Path.Direction.CW)
        canvas.clipPath(path)
        fill.color = Color.rgb(28, 28, 30)
        canvas.drawRect(band, fill)
        canvas.restore()
        // El reproductor es parte de la esfera: siempre está (sin música, con su nombre y «Sin música»)
        val music = if (miniOn()) PhoneNow.current() else null
        if (miniOn()) {
            // Nota musical en el color del tema
            drawNote(canvas, X(0.03f), Y(-0.17f), r * 0.05f, th.day)
            val app = if (PhoneNow.state?.from == "cl.carlospnauto.app") "PulsoMedia" else "PulsoMusic"
            write(canvas, music?.title ?: app, X(0.10f), Y(-0.185f), r * 0.064f, white, bold, Paint.Align.LEFT, maxW = r * 0.50f)
            val sub = if (music == null) "Sin música" else music.artist
            if (sub.isNotBlank()) write(canvas, sub, X(0.10f), Y(-0.105f), r * 0.048f, grey, medium, Paint.Align.LEFT, maxW = r * 0.50f)
            // Botones ◄ ►‖ ►|
            fill.color = white
            val by = Y(-0.17f)
            val s = r * 0.028f
            var bx = playerZone(cx, cy, r, 0).centerX()
            path.reset(); path.moveTo(bx + s, by - s); path.lineTo(bx - s * 0.6f, by); path.lineTo(bx + s, by + s); path.close()
            canvas.drawPath(path, fill)
            canvas.drawRect(bx - s * 1.05f, by - s, bx - s * 0.7f, by + s, fill)
            bx = playerZone(cx, cy, r, 1).centerX()
            fill.color = th.day
            canvas.drawCircle(bx, by, s * 1.9f, fill)
            fill.color = Color.rgb(20, 20, 22)
            if (music?.playing == true) {
                canvas.drawRect(bx - s * 0.75f, by - s * 0.85f, bx - s * 0.25f, by + s * 0.85f, fill)
                canvas.drawRect(bx + s * 0.25f, by - s * 0.85f, bx + s * 0.75f, by + s * 0.85f, fill)
            } else {
                path.reset(); path.moveTo(bx - s * 0.6f, by - s); path.lineTo(bx + s, by); path.lineTo(bx - s * 0.6f, by + s); path.close()
                canvas.drawPath(path, fill)
            }
            fill.color = white
            bx = playerZone(cx, cy, r, 2).centerX()
            path.reset(); path.moveTo(bx - s, by - s); path.lineTo(bx + s * 0.6f, by); path.lineTo(bx - s, by + s); path.close()
            canvas.drawPath(path, fill)
            canvas.drawRect(bx + s * 0.7f, by - s, bx + s * 1.05f, by + s, fill)
            // Avance de la canción
            val p = if (music != null && music.durationMs > 0) (music.position().toFloat() / music.durationMs).coerceIn(0f, 1f) else 0f
            stroke.strokeWidth = r * 0.01f
            stroke.color = Color.rgb(60, 60, 64)
            canvas.drawLine(X(0.03f), Y(-0.055f), X(0.86f), Y(-0.055f), stroke)
            if (p > 0f) {
                stroke.color = th.day
                canvas.drawLine(X(0.03f), Y(-0.055f), X(0.03f) + r * 0.83f * p, Y(-0.055f), stroke)
            }
        } else {
            // Reproductor oculto: aquí va el próximo evento del calendario
            drawCalendar(canvas, X(0.03f), Y(-0.17f), r * 0.055f, t.dayOfMonth)
            write(canvas, evLine ?: "Sin eventos próximos", X(0.12f), Y(-0.145f), r * 0.064f, white, medium, Paint.Align.LEFT, maxW = r * 0.74f)
        }

        // ===== Hora digital grande, segundos y su fondo =====
        fill.color = Color.rgb(20, 20, 22)
        canvas.drawRect(X(-0.06f), Y(-0.01f), X(0.84f), Y(0.36f), fill)
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        // Números cuadrados con las esquinas redondeadas, como los de la foto
        // Como en la foto: la hora grande y los minutos más chicos, alineados arriba
        SquareDigits.draw(canvas, h, X(0.358f), Y(0.055f), r * 0.175f, r * 0.30f, r * 0.052f, r * 0.03f, white, alignRight = true)
        // Dos puntos redondos
        fill.color = white
        canvas.drawCircle(X(0.40f), Y(0.165f), r * 0.024f, fill)
        canvas.drawCircle(X(0.40f), Y(0.325f), r * 0.024f, fill)
        SquareDigits.draw(canvas, "%02d".format(t.minute), X(0.44f), Y(0.075f), r * 0.17f, r * 0.20f, r * 0.046f, r * 0.03f, white, alignRight = false)
        if (!ambient) {
            fill.color = Color.rgb(16, 16, 17)
            canvas.drawRect(X(0.44f), Y(0.30f), X(0.74f), Y(0.47f), fill)
            // Segundos debajo de los minutos
            SquareDigits.draw(canvas, "%02d".format(t.second), X(0.71f), Y(0.335f), r * 0.085f, r * 0.11f, r * 0.026f, r * 0.02f, white, alignRight = true)
        }

        // ===== Mes y días de la semana =====
        write(canvas, t.month.getDisplayName(TextStyle.FULL_STANDALONE, loc).replaceFirstChar { it.uppercase(loc) }, X(0.03f), Y(0.535f), r * 0.07f, white, bold, Paint.Align.CENTER)
        fill.color = Color.rgb(26, 26, 28)
        path.reset()
        path.moveTo(X(-0.64f), Y(0.585f)); path.lineTo(X(0.68f), Y(0.585f)); path.lineTo(X(0.61f), Y(0.70f)); path.lineTo(X(-0.57f), Y(0.70f)); path.close()
        canvas.drawPath(path, fill)
        val days = DayOfWeek.values()
        for ((i, d) in days.withIndex()) {
            val x = X(-0.535f + i * 0.183f)
            val today = d == t.dayOfWeek
            val name = d.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc).take(3)
            write(canvas, name, x, Y(0.665f), r * 0.062f, if (today) white else Color.rgb(140, 140, 145), condensed, Paint.Align.CENTER)
            if (today) {
                fill.color = th.day
                canvas.drawRoundRect(RectF(x - r * 0.05f, Y(0.592f), x + r * 0.05f, Y(0.61f)), r * 0.01f, r * 0.01f, fill)
            }
        }

        // Acceso de la izquierda (PulsoMusic por defecto) con su ícono
        val left = Config.spots[0]
        Shortcuts.draw(canvas, context, Shortcuts.get(context, 0, left), X(left.x), Y(left.y), r * 0.05f, Color.rgb(200, 205, 210), ambient)

        // ===== Batería y ritmo cardíaco =====
        fill.color = Color.rgb(26, 26, 28)
        path.reset()
        path.moveTo(X(-0.36f), Y(0.72f)); path.lineTo(X(0.40f), Y(0.72f)); path.lineTo(X(0.33f), Y(0.865f)); path.lineTo(X(-0.29f), Y(0.865f)); path.close()
        canvas.drawPath(path, fill)
        stroke.color = Color.rgb(70, 70, 74)
        stroke.strokeWidth = r * 0.008f
        canvas.drawLine(X(0.06f), Y(0.73f), X(0.01f), Y(0.855f), stroke)
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        drawBolt(canvas, X(-0.255f), Y(0.79f), r * 0.04f, Color.rgb(235, 50, 50))
        write(canvas, if (pct >= 0) "$pct%" else "--", X(-0.215f), Y(0.82f), r * 0.07f, white, bold, Paint.Align.LEFT)
        val hrTxt = complications.textOf(HEART, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
            ?: heart.bpm.takeIf { it > 0 }?.toString()
        val hr = hrTxt?.toIntOrNull() ?: 0
        write(canvas, "bpm", X(0.135f), Y(0.755f), r * 0.042f, grey, medium, Paint.Align.CENTER)
        write(canvas, hrTxt ?: "--", X(0.135f), Y(0.845f), r * 0.075f, white, bold, Paint.Align.CENTER)
        // Zona del ritmo: bajo (naranja), normal (verde), alto (rojo)
        val zone = when { hr <= 0 -> -1; hr < 60 -> 0; hr <= 100 -> 1; else -> 2 }
        val zc = listOf(Color.rgb(255, 160, 40), Color.rgb(50, 220, 90), Color.rgb(235, 50, 50))
        for (k in 0 until 3) {
            val x0 = X(0.215f + k * 0.04f)
            path.reset()
            path.moveTo(x0 + r * 0.012f, Y(0.74f)); path.lineTo(x0 + r * 0.035f, Y(0.74f)); path.lineTo(x0 + r * 0.023f, Y(0.785f)); path.lineTo(x0, Y(0.785f)); path.close()
            fill.color = if (k == zone) zc[k] else a(zc[k], 120)
            canvas.drawPath(path, fill)
            if (k == zone) {
                stroke.color = zc[k]
                stroke.strokeWidth = r * 0.006f
                canvas.drawLine(x0 - r * 0.01f, Y(0.80f), x0 + r * 0.045f, Y(0.80f), stroke)
            }
        }

        // ===== Reloj de agujas con fecha y alarma =====
        drawAnalog(canvas, X(-0.46f), Y(0.02f), r * 0.38f, r, t, th, ambient)

        // Siempre activa: la esfera completa, más tenue
        if (ambient) canvas.drawColor(Color.argb(160, 0, 0, 0))
    }

    private fun drawAnalog(canvas: Canvas, x: Float, y: Float, rad: Float, r: Float, t: ZonedDateTime, th: Theme, ambient: Boolean) {
        fill.color = Color.rgb(20, 20, 22)
        canvas.drawCircle(x, y, rad, fill)
        stroke.color = Color.rgb(225, 225, 225)
        stroke.strokeWidth = r * 0.008f
        stroke.pathEffect = DashPathEffect(floatArrayOf(r * 0.022f, r * 0.014f), 0f)
        canvas.drawCircle(x, y, rad, stroke)
        stroke.pathEffect = null
        // Marcas de las horas (sin las de las 3 y las 9: ahí van la fecha y la alarma)
        stroke.color = Color.WHITE
        stroke.strokeWidth = r * 0.02f
        stroke.strokeCap = Paint.Cap.BUTT
        for (k in 0 until 12) {
            if (k == 3 || k == 9) continue
            val ang = Math.toRadians(k * 30.0 - 90).toFloat()
            canvas.drawLine(x + cos(ang) * rad * 0.70f, y + sin(ang) * rad * 0.70f, x + cos(ang) * rad * 0.86f, y + sin(ang) * rad * 0.86f, stroke)
        }
        stroke.strokeCap = Paint.Cap.ROUND
        // Fecha a las 3
        val box = RectF(x + rad * 0.27f, y - rad * 0.17f, x + rad * 0.78f, y + rad * 0.17f)
        // Recuadro con margen: un filo blanco por fuera, un hueco oscuro y la ventana blanca
        stroke.color = Color.rgb(230, 230, 230)
        stroke.strokeWidth = r * 0.006f
        val m = rad * 0.05f
        canvas.drawRect(box.left - m, box.top - m, box.right + m, box.bottom + m, stroke)
        fill.color = Color.WHITE
        canvas.drawRect(box, fill)
        write(canvas, "${t.dayOfMonth}", box.centerX(), box.centerY() + rad * 0.10f, rad * 0.27f, Color.BLACK, bold, Paint.Align.CENTER)
        // Campana a las 9 (encendida si hay una alarma puesta)
        drawBell(canvas, x - rad * 0.58f, y, rad * 0.075f, if (Indicators.alarm(context)) Color.WHITE else Color.rgb(110, 110, 115))

        val sec = Smooth.seconds(context, t)
        val min = t.minute + sec / 60f
        val hour = (t.hour % 12) + min / 60f
        fun hand(deg: Float, len: Float, w: Float, color: Int, lume: Boolean, tail: Float = 0f) {
            val ang = Math.toRadians(deg - 90.0).toFloat()
            stroke.color = color
            stroke.strokeWidth = w
            canvas.drawLine(x - cos(ang) * tail, y - sin(ang) * tail, x + cos(ang) * len, y + sin(ang) * len, stroke)
            if (lume) {
                stroke.color = Color.rgb(250, 250, 240)
                stroke.strokeWidth = w * 0.55f
                canvas.drawLine(x + cos(ang) * len * 0.40f, y + sin(ang) * len * 0.40f, x + cos(ang) * len * 0.95f, y + sin(ang) * len * 0.95f, stroke)
            }
        }
        hand(hour * 30f, rad * 0.50f, r * 0.03f, Color.rgb(60, 60, 64), true)
        hand(min * 6f, rad * 0.78f, r * 0.024f, Color.rgb(60, 60, 64), true)
        if (!ambient) hand(sec * 6f, rad * 0.86f, r * 0.009f, th.second, false, rad * 0.25f)
        fill.color = th.second
        canvas.drawCircle(x, y, r * 0.022f, fill)
        fill.color = Color.rgb(30, 30, 32)
        canvas.drawCircle(x, y, r * 0.009f, fill)
    }

    private fun drawShoe(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x - s * 1.2f, y + s * 0.5f)
        path.lineTo(x - s * 1.0f, y - s * 0.1f)
        path.lineTo(x - s * 0.3f, y - s * 0.6f)
        path.lineTo(x + s * 0.1f, y - s * 0.1f)
        path.lineTo(x + s * 1.1f, y + s * 0.15f)
        path.lineTo(x + s * 1.2f, y + s * 0.55f)
        path.close()
        canvas.drawPath(path, fill)
    }

    private fun drawWalker(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawCircle(x + s * 0.15f, y - s * 0.85f, s * 0.22f, fill)
        stroke.color = color
        stroke.strokeWidth = s * 0.22f
        canvas.drawLine(x, y - s * 0.55f, x - s * 0.15f, y + s * 0.15f, stroke)
        canvas.drawLine(x - s * 0.15f, y + s * 0.15f, x + s * 0.35f, y + s * 0.95f, stroke)
        canvas.drawLine(x - s * 0.15f, y + s * 0.15f, x - s * 0.55f, y + s * 0.95f, stroke)
        canvas.drawLine(x - s * 0.05f, y - s * 0.35f, x + s * 0.5f, y - s * 0.05f, stroke)
        canvas.drawLine(x - s * 0.05f, y - s * 0.35f, x - s * 0.5f, y - s * 0.05f, stroke)
    }

    private fun drawCalendar(canvas: Canvas, x: Float, y: Float, s: Float, day: Int) {
        fill.color = Color.WHITE
        canvas.drawRoundRect(RectF(x - s * 0.8f, y - s * 0.8f, x + s * 0.8f, y + s * 0.9f), s * 0.15f, s * 0.15f, fill)
        fill.color = Color.rgb(30, 30, 32)
        canvas.drawRect(x - s * 0.8f, y - s * 0.45f, x + s * 0.8f, y - s * 0.32f, fill)
        write(canvas, "$day", x, y + s * 0.62f, s * 0.95f, Color.rgb(20, 20, 20), bold, Paint.Align.CENTER)
    }

    private fun drawNote(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawOval(RectF(x - s * 0.75f, y + s * 0.25f, x - s * 0.05f, y + s * 0.8f), fill)
        canvas.drawOval(RectF(x + s * 0.25f, y + s * 0.05f, x + s * 0.95f, y + s * 0.6f), fill)
        stroke.color = color
        stroke.strokeWidth = s * 0.16f
        canvas.drawLine(x - s * 0.1f, y + s * 0.5f, x - s * 0.1f, y - s * 0.8f, stroke)
        canvas.drawLine(x + s * 0.9f, y + s * 0.3f, x + s * 0.9f, y - s * 1.0f, stroke)
        canvas.drawLine(x - s * 0.1f, y - s * 0.8f, x + s * 0.9f, y - s * 1.0f, stroke)
    }

    private fun drawBolt(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x + s * 0.3f, y - s)
        path.lineTo(x - s * 0.55f, y + s * 0.15f)
        path.lineTo(x - s * 0.05f, y + s * 0.15f)
        path.lineTo(x - s * 0.3f, y + s)
        path.lineTo(x + s * 0.55f, y - s * 0.2f)
        path.lineTo(x + s * 0.05f, y - s * 0.2f)
        path.close()
        canvas.drawPath(path, fill)
    }

    private fun drawBell(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x - s * 0.9f, y + s * 0.6f)
        path.quadTo(x - s * 0.75f, y - s, x, y - s)
        path.quadTo(x + s * 0.75f, y - s, x + s * 0.9f, y + s * 0.6f)
        path.close()
        canvas.drawPath(path, fill)
        canvas.drawCircle(x, y + s * 0.85f, s * 0.22f, fill)
        stroke.color = color
        stroke.strokeWidth = s * 0.18f
        for (k in 1..2) {
            val rr = s * (0.9f + k * 0.45f)
            canvas.drawArc(RectF(x - rr, y - rr, x + rr, y + rr), -50f, 40f, false, stroke)
            canvas.drawArc(RectF(x - rr, y - rr, x + rr, y + rr), 190f, 40f, false, stroke)
        }
    }

    // Ícono del clima (se carga una vez por cada dato nuevo)
    private var wIconKey: Any? = null
    private var wIconDrawable: android.graphics.drawable.Drawable? = null

    private fun weatherIcon(): android.graphics.drawable.Drawable? {
        val d = complications.complicationSlots[WEATHER]?.complicationData?.value
        val icon = when (d) {
            is androidx.wear.watchface.complications.data.ShortTextComplicationData -> d.monochromaticImage?.image ?: d.smallImage?.image
            is androidx.wear.watchface.complications.data.RangedValueComplicationData -> d.monochromaticImage?.image ?: d.smallImage?.image
            else -> null
        }
        if (icon !== wIconKey) {
            wIconKey = icon
            wIconDrawable = runCatching { icon?.loadDrawable(context)?.mutate() }.getOrNull()
        }
        return wIconDrawable
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: HybridAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
