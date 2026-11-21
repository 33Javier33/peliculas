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
import android.graphics.SweepGradient
import android.graphics.Typeface
import android.graphics.drawable.Drawable
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
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.rendering.CanvasComplicationDrawable
import androidx.wear.watchface.complications.rendering.ComplicationDrawable
import androidx.wear.watchface.style.CurrentUserStyleRepository
import cl.carlospnauto.esfera.comun.Action
import cl.carlospnauto.esfera.comun.Choice
import cl.carlospnauto.esfera.comun.Choices
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.HeartRate
import cl.carlospnauto.esfera.comun.PhoneNow
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Spot
import cl.carlospnauto.esfera.comun.textOf
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
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin

private const val WEATHER = 101
private const val STEPS = 102
private const val HEART = 103
private const val CAL = 104
private const val DIST = 105

/** Centro del disco: (claro, oscuro) */
private val LABELS = listOf(
    "Rojo" to (Color.rgb(236, 92, 96) to Color.rgb(150, 26, 34)),
    "Azul" to (Color.rgb(96, 150, 236) to Color.rgb(26, 56, 150)),
    "Verde" to (Color.rgb(96, 214, 140) to Color.rgb(20, 110, 56)),
    "Dorado" to (Color.rgb(238, 200, 110) to Color.rgb(146, 104, 28)),
    "Violeta" to (Color.rgb(176, 128, 240) to Color.rgb(84, 40, 150)),
    "Naranja" to (Color.rgb(250, 150, 80) to Color.rgb(160, 66, 14)),
    "Plata" to (Color.rgb(226, 226, 230) to Color.rgb(110, 112, 118)),
)
private val LABEL = Choice("disco", "Centro del disco", LABELS.map { it.first to it.second.first })
private val INK = Choice("lcd", "Números de la pantalla", listOf(
    "Blanco" to Color.rgb(232, 232, 232), "Cian" to Color.rgb(120, 225, 245), "Ámbar" to Color.rgb(255, 196, 90),
    "Verde" to Color.rgb(130, 240, 150), "Rojo" to Color.rgb(255, 110, 100),
))
private val SPIN = Choice("gira", "Disco", listOf("Gira cuando suena música" to 0, "Siempre quieto" to 1))
private val SONG = Choice("cancion", "Abajo, al sonar música", listOf("La canción que suena" to 0, "Siempre calorías y distancia" to 1))
private val GOAL = Choice("meta", "Meta de pasos (aguja)", listOf("10.000" to 10000, "6.000" to 6000, "8.000" to 8000, "12.000" to 12000, "15.000" to 15000))
private val AMB = Choice("bajo", "Bajo consumo", listOf("Esfera completa tenue" to 0, "Solo la hora" to 1))

object Config : FaceConfig {
    override val slots = listOf(WEATHER to "Clima (arriba)", STEPS to "Pasos", HEART to "Ritmo cardíaco", CAL to "Calorías (abajo)", DIST to "Distancia (abajo)")
    override val spots = listOf(
        Spot(0f, -0.64f, Action.MEDIA, "Hora", hit = 0.16f),
        Spot(-0.08f, -0.37f, Action.MUSIC, "Fecha", hit = 0.10f),
        Spot(-0.55f, -0.61f, Action.BATTERY, "Batería", hit = 0.10f),
        Spot(0.55f, -0.67f, Action.ALARMS, "Luna y AM/PM", hit = 0.10f),
    )
    override val choices = listOf(LABEL, INK, SPIN, SONG, GOAL, AMB)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val short = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        fun slot(id: Int, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, short, policy, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            slot(WEATHER, DefaultComplicationDataSourcePolicy(), RectF(0.40f, 0.02f, 0.62f, 0.09f)),
            slot(STEPS, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.07f, 0.43f, 0.21f, 0.63f)),
            slot(HEART, DefaultComplicationDataSourcePolicy(), RectF(0.79f, 0.38f, 0.92f, 0.47f)),
            slot(CAL, DefaultComplicationDataSourcePolicy(), RectF(0.28f, 0.84f, 0.46f, 0.93f)),
            slot(DIST, DefaultComplicationDataSourcePolicy(), RectF(0.60f, 0.83f, 0.80f, 0.91f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = VinylRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP) return
                // Con el reproductor abierto, todos los toques son suyos
                if (renderer.playerOpen) return renderer.playerTap(tapEvent.xPos, tapEvent.yPos)
                if (complicationSlot != null) return
                // Tocar el disco abre el mini reproductor
                if (renderer.onDisc(tapEvent.xPos, tapEvent.yPos)) return renderer.openPlayer()
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class VinylAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/**
 * Vinilo: un tocadiscos. Arriba el clima, la hora en una pantalla de cristal líquido con la batería,
 * la luna y AM/PM; la fecha con su interruptor; los pasos en un reloj chico; el disco (gira cuando
 * suena PulsoMusic o PulsoMedia, y el brazo avanza con la canción); el ritmo en la base del brazo;
 * abajo las calorías y la distancia, o la canción que suena. Tocar el disco abre el mini reproductor.
 */
class VinylRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<VinylAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = VinylAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG)
    private val regular = Typeface.create("sans-serif", Typeface.NORMAL)
    private val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    private val condensed = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    var lastBounds = Rect()
        private set

    private val redraw: () -> Unit = { invalidate() }

    private val textC = Color.rgb(222, 222, 222)
    private val dim = Color.rgb(150, 150, 152)

    /** Giro del disco (grados), sigue desde donde quedó */
    private var spin = 0f
    private var spinAt = 0L

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

    private fun plain(s: String) = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}"), "").uppercase(Locale.ROOT)

    private fun write(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, face: Typeface, align: Paint.Align = Paint.Align.CENTER, maxW: Float = 0f) {
        text.typeface = face
        text.textSize = size
        text.color = color
        text.textAlign = align
        text.textScaleX = 1f
        var t = s
        if (maxW > 0f && text.measureText(t) > maxW) {
            text.textScaleX = maxOf(0.8f, maxW / text.measureText(t))
            while (t.length > 2 && text.measureText(t) > maxW) t = t.dropLast(2) + "…"
        }
        canvas.drawText(t, x, y, text)
        text.textScaleX = 1f
    }

    /** Texto sobre un arco (centro, radio, ángulo de inicio y recorrido en grados; negativo = por abajo) */
    private fun arcText(canvas: Canvas, s: String, x: Float, y: Float, rad: Float, start: Float, sweep: Float, size: Float, color: Int, face: Typeface = medium) {
        path.reset()
        path.addArc(RectF(x - rad, y - rad, x + rad, y + rad), start, sweep)
        text.typeface = face
        text.textSize = size
        text.color = color
        text.textAlign = Paint.Align.CENTER
        text.textScaleX = 1f
        canvas.drawTextOnPath(s, path, 0f, 0f, text)
    }

    // ===== Mini reproductor (se abre tocando el disco) =====
    @Volatile var playerOpen = false
        private set
    private var playerUsedAt = 0L

    private fun geo(): Triple<Float, Float, Float> {
        val b = lastBounds
        return Triple(b.exactCenterX(), b.exactCenterY(), min(b.width(), b.height()) / 2f)
    }

    fun onDisc(x: Int, y: Int): Boolean {
        if (lastBounds.isEmpty) return false
        val (cx, cy, r) = geo()
        return hypot(x - (cx + DISC_X * r), y - (cy + DISC_Y * r)) < r * DISC_R
    }

    fun openPlayer() {
        playerOpen = true
        playerUsedAt = System.currentTimeMillis()
        PhoneNow.ask(context)
        invalidate()
    }

    private fun zone(cx: Float, cy: Float, r: Float, k: Int): RectF {
        val x = cx + r * (k - 1) * 0.40f
        val w = if (k == 1) 0.15f else 0.12f
        return RectF(x - r * w, cy + r * 0.34f, x + r * w, cy + r * 0.54f)
    }

    fun playerTap(x: Int, y: Int) {
        val (cx, cy, r) = geo()
        playerUsedAt = System.currentTimeMillis()
        val s = PhoneNow.current()
        when {
            zone(cx, cy, r, 0).contains(x.toFloat(), y.toFloat()) -> PhoneNow.command(context, "prev")
            zone(cx, cy, r, 1).contains(x.toFloat(), y.toFloat()) -> PhoneNow.command(context, if (s?.playing == true) "pause" else "play")
            zone(cx, cy, r, 2).contains(x.toFloat(), y.toFloat()) -> PhoneNow.command(context, "next")
            else -> playerOpen = false
        }
        invalidate()
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: VinylAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val t = zonedDateTime
        val ink = Choices.value(context, INK)
        val is24 = DateFormat.is24HourFormat(context)
        val music = PhoneNow.current()
        val playing = music?.playing == true
        val spinning = playing && !ambient && !playerOpen && Choices.value(context, SPIN) == 0

        // El disco gira a 33⅓ vueltas por minuto (200° por segundo) mientras suena
        val now = System.currentTimeMillis()
        if (spinning) {
            if (spinAt > 0) spin = (spin + (now - spinAt).coerceAtMost(500) * 0.2f) % 360f
            spinAt = now
        } else spinAt = 0L
        interactiveDrawModeUpdateDelayMillis = if (spinning) 33L else 1000L

        canvas.drawColor(Color.BLACK)
        if (playerOpen && (ambient || now - playerUsedAt > 90_000)) playerOpen = false
        if (playerOpen) return renderPlayer(canvas, cx, cy, r, t, is24, ink)

        if (ambient && Choices.value(context, AMB) == 1) {
            // Bajo consumo mínimo: solo la pantalla con la hora
            drawLcd(canvas, cx, cy, r, t, is24, a(ink, 170), showSeconds = false)
            return
        }

        // ===== Fondo: gris oscuro con luz al centro y la ranura bajo la hora =====
        fill.shader = RadialGradient(cx, Y(0.1f), r, Color.rgb(54, 54, 56), Color.rgb(24, 24, 25), Shader.TileMode.CLAMP)
        canvas.drawCircle(cx, cy, r, fill)
        fill.shader = null
        fill.color = Color.argb(70, 0, 0, 0)
        canvas.save()
        canvas.clipRect(X(-1f), Y(-1f), X(1f), Y(-0.43f))
        canvas.drawCircle(cx, cy, r, fill)
        canvas.restore()
        stroke.strokeCap = Paint.Cap.BUTT
        stroke.strokeWidth = r * 0.012f
        stroke.color = Color.rgb(12, 12, 12)
        canvas.drawLine(X(-0.90f), Y(-0.43f), X(0.90f), Y(-0.43f), stroke)
        stroke.strokeWidth = r * 0.005f
        stroke.color = Color.rgb(78, 78, 80)
        canvas.drawLine(X(-0.90f), Y(-0.418f), X(0.90f), Y(-0.418f), stroke)
        stroke.strokeCap = Paint.Cap.ROUND

        // ===== Clima =====
        val temp = complications.textOf(WEATHER, context.resources)
        drawCloud(canvas, X(-0.14f), Y(-0.905f), r * 0.032f, textC)
        write(canvas, temp ?: "--°", X(0.10f), Y(-0.875f), r * 0.075f, textC, medium)

        // ===== Hora, batería, luna y AM/PM =====
        drawLcd(canvas, cx, cy, r, t, is24, ink, showSeconds = !ambient)
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        drawBattery(canvas, X(-0.52f), Y(-0.69f), r * 0.03f, textC)
        write(canvas, if (pct >= 0) "$pct%" else "--", X(-0.565f), Y(-0.53f), r * 0.072f, textC, medium)
        drawMoon(canvas, X(0.515f), Y(-0.74f), r * 0.036f, textC)
        if (!is24) write(canvas, if (t.hour < 12) "AM" else "PM", X(0.565f), Y(-0.60f), r * 0.07f, textC, medium)

        // ===== Fecha con su interruptor =====
        val loc = Locale.getDefault()
        val pill = RectF(X(-0.54f), Y(-0.44f), X(0.40f), Y(-0.30f))
        fill.color = Color.rgb(20, 20, 21)
        canvas.drawRoundRect(pill, pill.height() / 2, pill.height() / 2, fill)
        stroke.color = Color.rgb(70, 70, 72)
        stroke.strokeWidth = r * 0.006f
        canvas.drawRoundRect(pill, pill.height() / 2, pill.height() / 2, stroke)
        write(canvas, plain(t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc)).filter { it.isLetter() }.take(3), X(-0.37f), Y(-0.338f), r * 0.07f, textC, medium)
        write(canvas, "%02d - %02d".format(t.dayOfMonth, t.monthValue), X(0.20f), Y(-0.338f), r * 0.07f, textC, medium)
        drawSwitch(canvas, RectF(X(-0.215f), Y(-0.45f), X(-0.015f), Y(-0.29f)), r)

        // ===== Pasos: reloj chico con su aguja =====
        val steps = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() }?.toIntOrNull()
        drawSteps(canvas, X(-0.73f), Y(0.06f), r, steps)

        // ===== Disco y brazo =====
        val label = LABELS[Choices.index(context, LABEL)].second
        drawRecord(canvas, X(DISC_X), Y(DISC_Y), r * DISC_R, r, label, spin)
        // El brazo avanza hacia el centro con la canción
        val prog = if (music != null && music.durationMs > 0) (music.position().toFloat() / music.durationMs).coerceIn(0f, 1f) else 0f
        val armDeg = if (playing) 4f + prog * 10f else 0f
        val hr = complications.textOf(HEART, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
            ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        arcText(canvas, "$hr  RITMO CARDÍACO", X(ARM_X), Y(ARM_Y), r * 0.155f, 168f, 232f, r * 0.058f, textC)
        drawArm(canvas, X(ARM_X), Y(ARM_Y), r, armDeg)

        // ===== Abajo: calorías y distancia, o la canción que suena =====
        if (music != null && Choices.value(context, SONG) == 0) {
            val line = if (music.artist.isNotBlank()) "♪ ${music.title} · ${music.artist}" else "♪ ${music.title}"
            text.typeface = medium
            text.textSize = r * 0.062f
            var s = line
            val maxLen = r * 1.05f
            while (s.length > 4 && text.measureText(s) > maxLen) s = s.dropLast(2) + "…"
            arcText(canvas, s, cx, cy, r * 0.80f, 140f, -100f, r * 0.062f, textC)
        } else {
            val cal = complications.textOf(CAL, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
                ?: steps?.let { (it * 0.04f).toInt().toString() } ?: "--"
            val dist = complications.textOf(DIST, context.resources)?.takeIf { it.isNotBlank() }
                ?: steps?.let { "%.2f".format(Locale.ROOT, it * 0.000762f) } ?: "--"
            drawFlame(canvas, X(-0.33f), Y(0.80f), r * 0.038f, textC)
            arcText(canvas, cal, cx, cy, r * 0.82f, 113f, -18f, r * 0.075f, textC)
            arcText(canvas, dist, cx, cy, r * 0.82f, 76f, -18f, r * 0.075f, textC)
            drawRuler(canvas, X(0.52f), Y(0.655f), r * 0.042f, textC)
        }

        // Siempre activa: la esfera completa, más tenue
        if (ambient) canvas.drawColor(Color.argb(150, 0, 0, 0))
    }

    // ===== Pantalla de la hora =====
    private fun drawLcd(canvas: Canvas, cx: Float, cy: Float, r: Float, t: ZonedDateTime, is24: Boolean, ink: Int, showSeconds: Boolean) {
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val box = RectF(X(-0.43f), Y(-0.80f), X(0.43f), Y(-0.48f))
        fill.color = Color.rgb(8, 8, 9)
        canvas.drawRoundRect(box, r * 0.055f, r * 0.055f, fill)
        stroke.color = Color.rgb(190, 190, 192)
        stroke.strokeWidth = r * 0.009f
        canvas.drawRoundRect(box, r * 0.055f, r * 0.055f, stroke)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
        val m = "%02d".format(t.minute)
        val sc = if (showSeconds) "%02d".format(t.second) else "  "
        val dh = r * 0.205f
        val dw = r * 0.099f
        val gap = r * 0.011f
        val colon = r * 0.032f
        val total = 6 * dw + 3 * gap + 2 * colon
        var x = box.centerX() - total / 2
        val top = box.centerY() - dh / 2
        val ghost = a(ink, 24)
        for ((i, pair) in listOf(h, m, sc).withIndex()) {
            seg(canvas, pair[0], x, top, dw, dh, ink, ghost); x += dw + gap
            seg(canvas, pair[1], x, top, dw, dh, ink, ghost); x += dw
            if (i < 2) {
                fill.color = if (i == 1 && !showSeconds) ghost else ink
                val d = r * 0.011f
                canvas.drawRect(x + colon / 2 - d, top + dh * 0.30f - d, x + colon / 2 + d, top + dh * 0.30f + d, fill)
                canvas.drawRect(x + colon / 2 - d, top + dh * 0.70f - d, x + colon / 2 + d, top + dh * 0.70f + d, fill)
                x += colon
            }
        }
    }

    // Segmentos: a (arriba), b, c (derecha), d (abajo), e, f (izquierda), g (medio)
    private val SEGS = mapOf(
        '0' to "abcdef", '1' to "bc", '2' to "abged", '3' to "abgcd", '4' to "fgbc", '5' to "afgcd",
        '6' to "afgedc", '7' to "abc", '8' to "abcdefg", '9' to "abcdfg",
    )

    /** Un número de 7 segmentos finos (como la foto), con los segmentos apagados apenas visibles */
    private fun seg(canvas: Canvas, ch: Char, x: Float, y: Float, w: Float, h: Float, on: Int, ghost: Int) {
        val t = w * 0.15f
        val g = t * 0.35f
        val m = y + h / 2
        val l = x + t / 2
        val rr = x + w - t / 2
        val top = y + t / 2
        val bot = y + h - t / 2
        val lit = SEGS[ch].orEmpty()
        val h2 = t / 2
        // Segmentos con puntas en bisel (hexágonos finos), como las pantallas de cristal líquido de la foto
        fun hor(k: Char, x0: Float, x1: Float, yy: Float) {
            fill.color = if (k in lit) on else ghost
            path.reset()
            path.moveTo(x0, yy); path.lineTo(x0 + h2, yy - h2); path.lineTo(x1 - h2, yy - h2)
            path.lineTo(x1, yy); path.lineTo(x1 - h2, yy + h2); path.lineTo(x0 + h2, yy + h2); path.close()
            canvas.drawPath(path, fill)
        }
        fun ver(k: Char, xx: Float, y0: Float, y1: Float) {
            fill.color = if (k in lit) on else ghost
            path.reset()
            path.moveTo(xx, y0); path.lineTo(xx + h2, y0 + h2); path.lineTo(xx + h2, y1 - h2)
            path.lineTo(xx, y1); path.lineTo(xx - h2, y1 - h2); path.lineTo(xx - h2, y0 + h2); path.close()
            canvas.drawPath(path, fill)
        }
        hor('a', l + g, rr - g, top)
        ver('b', rr, top + g, m - g)
        ver('c', rr, m + g, bot - g)
        hor('d', l + g, rr - g, bot)
        ver('e', l, m + g, bot - g)
        ver('f', l, top + g, m - g)
        hor('g', l + g, rr - g, m)
    }

    // ===== Piezas =====
    private fun drawSwitch(canvas: Canvas, b: RectF, r: Float) {
        fill.shader = LinearGradient(b.left, 0f, b.right, 0f, intArrayOf(Color.rgb(150, 150, 152), Color.rgb(238, 238, 240), Color.rgb(170, 170, 172)), null, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(b, r * 0.03f, r * 0.03f, fill)
        fill.shader = null
        stroke.color = Color.rgb(90, 90, 92)
        stroke.strokeWidth = r * 0.006f
        canvas.drawRoundRect(b, r * 0.03f, r * 0.03f, stroke)
        // Estrías
        stroke.strokeCap = Paint.Cap.BUTT
        stroke.strokeWidth = r * 0.008f
        for (k in -1..1) {
            val x = b.centerX() + k * b.width() * 0.13f
            stroke.color = Color.rgb(110, 110, 112)
            canvas.drawLine(x, b.top + b.height() * 0.25f, x, b.bottom - b.height() * 0.25f, stroke)
        }
        stroke.strokeCap = Paint.Cap.ROUND
    }

    private fun drawSteps(canvas: Canvas, x: Float, y: Float, r: Float, steps: Int?) {
        val rad = r * 0.135f
        fill.shader = RadialGradient(x, y - rad * 0.3f, rad * 1.2f, Color.rgb(70, 70, 72), Color.rgb(28, 28, 30), Shader.TileMode.CLAMP)
        canvas.drawCircle(x, y, rad, fill)
        fill.shader = null
        stroke.color = Color.rgb(90, 90, 92)
        stroke.strokeWidth = r * 0.007f
        canvas.drawCircle(x, y, rad, stroke)
        stroke.strokeCap = Paint.Cap.BUTT
        for (k in 0 until 12) {
            val ang = Math.toRadians(k * 30.0 - 90).toFloat()
            stroke.color = textC
            stroke.strokeWidth = r * (if (k % 3 == 0) 0.009f else 0.006f)
            canvas.drawLine(x + cos(ang) * rad * 0.66f, y + sin(ang) * rad * 0.66f, x + cos(ang) * rad * 0.84f, y + sin(ang) * rad * 0.84f, stroke)
        }
        // Aguja roja: cuánto falta para la meta
        val goal = Choices.value(context, GOAL)
        val f = ((steps ?: 0).toFloat() / goal).coerceIn(0f, 1f)
        val ang = Math.toRadians(f * 360.0 - 90).toFloat()
        stroke.color = Color.rgb(228, 40, 44)
        stroke.strokeWidth = r * 0.009f
        canvas.drawLine(x, y, x + cos(ang) * rad * 0.78f, y + sin(ang) * rad * 0.78f, stroke)
        stroke.strokeCap = Paint.Cap.ROUND
        fill.color = Color.rgb(228, 40, 44)
        canvas.drawCircle(x, y, r * 0.012f, fill)
        arcText(canvas, "PASOS", x, y, rad * 1.18f, 222f, 96f, r * 0.066f, textC)
        arcText(canvas, steps?.toString() ?: "--", x, y, rad * 1.18f + r * 0.055f, 138f, -96f, r * 0.074f, textC)
    }

    private fun drawRecord(canvas: Canvas, x: Float, y: Float, rad: Float, r: Float, label: Pair<Int, Int>, spin: Float) {
        // Sombra y disco negro
        fill.color = Color.argb(120, 0, 0, 0)
        canvas.drawCircle(x + r * 0.012f, y + r * 0.02f, rad * 1.01f, fill)
        fill.color = Color.rgb(12, 12, 13)
        canvas.drawCircle(x, y, rad, fill)
        // Surcos
        stroke.strokeWidth = r * 0.0035f
        var k = 0
        var gr = rad * 0.36f
        while (gr < rad * 0.985f) {
            stroke.color = if (k % 2 == 0) Color.rgb(30, 30, 32) else Color.rgb(18, 18, 19)
            canvas.drawCircle(x, y, gr, stroke)
            gr += r * 0.0075f
            k++
        }
        // Brillo fijo (la luz no gira con el disco)
        fill.shader = SweepGradient(
            x, y,
            intArrayOf(0x00FFFFFF, 0x30FFFFFF, 0x00FFFFFF, 0x00FFFFFF, 0x24FFFFFF, 0x00FFFFFF, 0x00FFFFFF),
            floatArrayOf(0.02f, 0.10f, 0.18f, 0.52f, 0.60f, 0.68f, 1f),
        )
        canvas.drawCircle(x, y, rad, fill)
        fill.shader = null
        stroke.color = Color.rgb(64, 64, 66)
        stroke.strokeWidth = r * 0.006f
        canvas.drawCircle(x, y, rad, stroke)
        // Anillo liso alrededor del centro (sin surcos)
        val lr = rad * 0.335f
        stroke.color = Color.rgb(38, 38, 40)
        stroke.strokeWidth = rad * 0.05f
        canvas.drawCircle(x, y, lr * 1.12f, stroke)
        // Centro de metal cepillado de color: gira con el disco (los reflejos se mueven)
        canvas.save()
        canvas.rotate(spin, x, y)
        val (light, darkC) = label
        fill.shader = SweepGradient(x, y, intArrayOf(darkC, light, darkC, darkC, light, darkC, darkC), floatArrayOf(0f, 0.12f, 0.3f, 0.5f, 0.62f, 0.8f, 1f))
        canvas.drawCircle(x, y, lr, fill)
        // Surcos finos del metal
        stroke.strokeWidth = r * 0.002f
        var q = lr * 0.18f
        while (q < lr * 0.95f) {
            stroke.color = Color.argb(28, 0, 0, 0)
            canvas.drawCircle(x, y, q, stroke)
            q += r * 0.009f
        }
        fill.shader = RadialGradient(x, y, lr, intArrayOf(0x00000000, 0x00000000, 0x66000000), floatArrayOf(0f, 0.78f, 1f), Shader.TileMode.CLAMP)
        canvas.drawCircle(x, y, lr, fill)
        fill.shader = null
        canvas.restore()
        // Eje
        fill.shader = RadialGradient(x - r * 0.006f, y - r * 0.006f, r * 0.02f, Color.rgb(240, 240, 240), Color.rgb(120, 120, 124), Shader.TileMode.CLAMP)
        canvas.drawCircle(x, y, r * 0.016f, fill)
        fill.shader = null
    }

    /** Brazo del tocadiscos: base con anillo rojo, contrapeso, tubo curvo y cápsula; deg lo gira hacia el centro */
    private fun drawArm(canvas: Canvas, px: Float, py: Float, r: Float, deg: Float) {
        // Base
        fill.color = Color.rgb(40, 40, 42)
        canvas.drawCircle(px, py, r * 0.105f, fill)
        stroke.color = Color.rgb(220, 46, 50)
        stroke.strokeWidth = r * 0.016f
        canvas.drawCircle(px, py, r * 0.072f, stroke)
        fill.color = Color.rgb(24, 24, 26)
        canvas.drawCircle(px, py, r * 0.062f, fill)
        canvas.save()
        canvas.rotate(deg, px, py)
        fun X(v: Float) = px + v * r
        fun Y(v: Float) = py + v * r
        // Contrapeso (arriba a la derecha)
        canvas.save()
        canvas.rotate(35f, px, py)
        fill.shader = LinearGradient(X(-0.035f), 0f, X(0.035f), 0f, intArrayOf(Color.rgb(120, 120, 124), Color.rgb(236, 236, 238), Color.rgb(110, 110, 114)), null, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(RectF(X(-0.032f), Y(-0.24f), X(0.032f), Y(-0.11f)), r * 0.01f, r * 0.01f, fill)
        canvas.drawRect(X(-0.012f), Y(-0.11f), X(0.012f), Y(-0.02f), fill)
        fill.shader = null
        canvas.restore()
        // Tubo: baja y se curva hacia la izquierda
        path.reset()
        path.moveTo(X(0f), Y(0f))
        path.lineTo(X(-0.04f), Y(0.30f))
        path.quadTo(X(-0.06f), Y(0.46f), X(-0.23f), Y(0.56f))
        path.lineTo(X(-0.33f), Y(0.62f))
        stroke.strokeCap = Paint.Cap.ROUND
        stroke.color = Color.rgb(70, 70, 74)
        stroke.strokeWidth = r * 0.026f
        canvas.drawPath(path, stroke)
        stroke.color = Color.rgb(200, 200, 204)
        stroke.strokeWidth = r * 0.018f
        canvas.drawPath(path, stroke)
        stroke.color = Color.argb(200, 255, 255, 255)
        stroke.strokeWidth = r * 0.006f
        canvas.drawPath(path, stroke)
        // Cápsula
        canvas.save()
        canvas.rotate(-31f, X(-0.40f), Y(0.665f))
        val head = RectF(X(-0.53f), Y(0.635f), X(-0.30f), Y(0.695f))
        fill.shader = LinearGradient(0f, head.top, 0f, head.bottom, intArrayOf(Color.rgb(236, 236, 238), Color.rgb(150, 150, 154)), null, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(head, r * 0.008f, r * 0.008f, fill)
        fill.shader = null
        stroke.color = Color.rgb(80, 80, 84)
        stroke.strokeWidth = r * 0.004f
        canvas.drawRoundRect(head, r * 0.008f, r * 0.008f, stroke)
        canvas.drawCircle(X(-0.40f), Y(0.665f), r * 0.012f, stroke)
        canvas.drawCircle(X(-0.36f), Y(0.665f), r * 0.012f, stroke)
        canvas.drawRect(X(-0.51f), Y(0.648f), X(-0.47f), Y(0.682f), stroke)
        canvas.restore()
        canvas.restore()
        // Tapa del eje
        fill.shader = RadialGradient(px - r * 0.01f, py - r * 0.01f, r * 0.04f, Color.rgb(245, 245, 245), Color.rgb(120, 120, 124), Shader.TileMode.CLAMP)
        canvas.drawCircle(px, py, r * 0.032f, fill)
        fill.shader = null
    }

    private fun drawBattery(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawRoundRect(RectF(x - s * 0.55f, y - s * 0.75f, x + s * 0.55f, y + s), s * 0.15f, s * 0.15f, fill)
        canvas.drawRect(x - s * 0.22f, y - s, x + s * 0.22f, y - s * 0.75f, fill)
    }

    private fun drawCloud(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawCircle(x - s * 0.5f, y + s * 0.15f, s * 0.55f, fill)
        canvas.drawCircle(x + s * 0.15f, y - s * 0.2f, s * 0.7f, fill)
        canvas.drawCircle(x + s * 0.75f, y + s * 0.2f, s * 0.5f, fill)
        canvas.drawRoundRect(RectF(x - s * 1.0f, y + s * 0.1f, x + s * 1.2f, y + s * 0.7f), s * 0.3f, s * 0.3f, fill)
    }

    private fun drawMoon(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        path.reset()
        path.addCircle(x, y, s, Path.Direction.CW)
        val cut = Path().apply { addCircle(x + s * 0.55f, y - s * 0.35f, s * 0.85f, Path.Direction.CW) }
        path.op(cut, Path.Op.DIFFERENCE)
        fill.color = color
        canvas.drawPath(path, fill)
    }

    private fun drawFlame(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        path.reset()
        path.moveTo(x, y + s)
        path.cubicTo(x - s * 1.1f, y + s, x - s * 1.0f, y - s * 0.1f, x - s * 0.2f, y - s)
        path.cubicTo(x - s * 0.15f, y - s * 0.4f, x + s * 0.3f, y - s * 0.3f, x + s * 0.4f, y - s * 0.6f)
        path.cubicTo(x + s * 1.1f, y, x + s * 0.9f, y + s, x, y + s)
        stroke.color = color
        stroke.strokeWidth = s * 0.2f
        canvas.drawPath(path, stroke)
        path.reset()
        path.moveTo(x, y + s * 0.75f)
        path.cubicTo(x - s * 0.45f, y + s * 0.7f, x - s * 0.4f, y + s * 0.2f, x - s * 0.05f, y - s * 0.1f)
        path.cubicTo(x + s * 0.4f, y + s * 0.3f, x + s * 0.4f, y + s * 0.7f, x, y + s * 0.75f)
        canvas.drawPath(path, stroke)
    }

    private fun drawRuler(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        canvas.save()
        canvas.rotate(-24f, x, y)
        stroke.color = color
        stroke.strokeWidth = s * 0.16f
        canvas.drawRoundRect(RectF(x - s, y - s * 0.45f, x + s, y + s * 0.45f), s * 0.15f, s * 0.15f, stroke)
        stroke.strokeCap = Paint.Cap.BUTT
        for (k in 0..3) {
            val lx = x - s * 0.6f + k * s * 0.4f
            canvas.drawLine(lx, y - s * 0.45f, lx, y - s * (if (k % 2 == 0) 0.0f else 0.15f), stroke)
        }
        stroke.strokeCap = Paint.Cap.ROUND
        canvas.restore()
    }

    // ===== Mini reproductor retro (pantalla de cristal líquido negra) =====
    private fun renderPlayer(canvas: Canvas, cx: Float, cy: Float, r: Float, t: ZonedDateTime, is24: Boolean, ink: Int) {
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val ghost = a(ink, 24)
        val s = PhoneNow.current()
        fill.shader = RadialGradient(cx, cy, r, Color.rgb(48, 48, 50), Color.rgb(20, 20, 21), Shader.TileMode.CLAMP)
        canvas.drawCircle(cx, cy, r, fill)
        fill.shader = null
        // Pantalla grande con borde claro
        val box = RectF(X(-0.80f), Y(-0.62f), X(0.80f), Y(0.62f))
        fill.color = Color.rgb(8, 8, 9)
        canvas.drawRoundRect(box, r * 0.08f, r * 0.08f, fill)
        stroke.color = Color.rgb(190, 190, 192)
        stroke.strokeWidth = r * 0.009f
        canvas.drawRoundRect(box, r * 0.08f, r * 0.08f, stroke)
        // Reproductor, batería y hora
        val app = if (PhoneNow.state?.from == "cl.carlospnauto.app") "PULSOMEDIA" else "PULSOMUSIC"
        write(canvas, app, X(-0.66f), Y(-0.47f), r * 0.055f, ink, condensed, Paint.Align.LEFT)
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        write(canvas, (if (pct >= 0) "BAT $pct%" else "BAT --") + if (s != null && s.volume >= 0) "  VOL ${s.volume}" else "", X(-0.66f), Y(-0.37f), r * 0.048f, a(ink, 170), medium, Paint.Align.LEFT)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
        val dh = r * 0.15f
        val dw = r * 0.068f
        var x = X(0.66f) - (4 * dw + 2 * r * 0.008f + r * 0.03f)
        val top = Y(-0.52f)
        seg(canvas, h[0], x, top, dw, dh, ink, ghost); x += dw + r * 0.008f
        seg(canvas, h[1], x, top, dw, dh, ink, ghost); x += dw
        fill.color = ink
        val d = r * 0.008f
        canvas.drawRect(x + r * 0.015f - d, top + dh * 0.3f - d, x + r * 0.015f + d, top + dh * 0.3f + d, fill)
        canvas.drawRect(x + r * 0.015f - d, top + dh * 0.7f - d, x + r * 0.015f + d, top + dh * 0.7f + d, fill)
        x += r * 0.03f
        val m = "%02d".format(t.minute)
        seg(canvas, m[0], x, top, dw, dh, ink, ghost); x += dw + r * 0.008f
        seg(canvas, m[1], x, top, dw, dh, ink, ghost)
        // Canción
        write(canvas, (s?.title ?: "Sin música").uppercase(), X(0f), Y(-0.12f), r * 0.092f, ink, condensed, maxW = r * 1.40f)
        write(canvas, if (s == null) "Toca ► para reanudar en el teléfono" else s.artist, X(0f), Y(-0.02f), r * 0.06f, a(ink, 180), medium, maxW = r * 1.36f)
        // Avance
        val p = if (s != null && s.durationMs > 0) (s.position().toFloat() / s.durationMs).coerceIn(0f, 1f) else 0f
        stroke.strokeWidth = r * 0.02f
        stroke.color = a(ink, 45)
        canvas.drawLine(X(-0.62f), Y(0.10f), X(0.62f), Y(0.10f), stroke)
        if (p > 0f) {
            stroke.color = ink
            canvas.drawLine(X(-0.62f), Y(0.10f), X(-0.62f) + r * 1.24f * p, Y(0.10f), stroke)
        }
        fun mmss(ms: Long) = "%d:%02d".format(ms / 60000, (ms / 1000) % 60)
        if (s != null && s.durationMs > 0) {
            write(canvas, mmss(s.position()), X(-0.62f), Y(0.20f), r * 0.048f, a(ink, 180), medium, Paint.Align.LEFT)
            write(canvas, mmss(s.durationMs), X(0.62f), Y(0.20f), r * 0.048f, a(ink, 180), medium, Paint.Align.RIGHT)
        }
        // Botones ◄◄ ►‖ ►►
        for (k in 0..2) {
            val z = zone(cx, cy, r, k)
            stroke.color = ink
            stroke.strokeWidth = r * 0.008f
            canvas.drawRoundRect(z, r * 0.04f, r * 0.04f, stroke)
            fill.color = ink
            val bx = z.centerX()
            val by = z.centerY()
            val q = r * 0.035f
            when (k) {
                0 -> {
                    path.reset(); path.moveTo(bx, by - q); path.lineTo(bx - q * 1.3f, by); path.lineTo(bx, by + q); path.close(); canvas.drawPath(path, fill)
                    path.reset(); path.moveTo(bx + q * 1.3f, by - q); path.lineTo(bx, by); path.lineTo(bx + q * 1.3f, by + q); path.close(); canvas.drawPath(path, fill)
                }
                1 -> if (s?.playing == true) {
                    canvas.drawRect(bx - q * 0.9f, by - q * 1.1f, bx - q * 0.3f, by + q * 1.1f, fill)
                    canvas.drawRect(bx + q * 0.3f, by - q * 1.1f, bx + q * 0.9f, by + q * 1.1f, fill)
                } else {
                    path.reset(); path.moveTo(bx - q * 0.8f, by - q * 1.2f); path.lineTo(bx + q * 1.2f, by); path.lineTo(bx - q * 0.8f, by + q * 1.2f); path.close(); canvas.drawPath(path, fill)
                }
                else -> {
                    path.reset(); path.moveTo(bx, by - q); path.lineTo(bx + q * 1.3f, by); path.lineTo(bx, by + q); path.close(); canvas.drawPath(path, fill)
                    path.reset(); path.moveTo(bx - q * 1.3f, by - q); path.lineTo(bx, by); path.lineTo(bx - q * 1.3f, by + q); path.close(); canvas.drawPath(path, fill)
                }
            }
        }
        write(canvas, "Toca fuera para volver", X(0f), Y(0.76f), r * 0.045f, dim, medium)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: VinylAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }

    companion object {
        // Disco y base del brazo (fracciones del radio desde el centro)
        const val DISC_X = 0.01f
        const val DISC_Y = 0.21f
        const val DISC_R = 0.52f
        const val ARM_X = 0.70f
        const val ARM_Y = -0.105f
    }
}
