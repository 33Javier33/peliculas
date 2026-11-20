package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
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
import cl.carlospnauto.esfera.comun.Smooth
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
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin

private const val LEFT = 101
private const val RIGHT = 102
private const val BOTTOM = 103

/** La foto tiene la esfera dentro de un aro; aquí llena la pantalla, así que todo se agranda igual */
private const val ZOOM = 1.13f

private val THEME = Choice(
    "tema", "Color del tema",
    listOf(
        "Menta" to Color.rgb(111, 164, 157), "Azul" to Color.rgb(140, 172, 236), "Verde" to Color.rgb(140, 192, 140),
        "Coral" to Color.rgb(232, 142, 122), "Ámbar" to Color.rgb(228, 186, 96), "Lavanda" to Color.rgb(172, 152, 222),
        "Rosa" to Color.rgb(226, 142, 176), "Celeste" to Color.rgb(112, 192, 218), "Arena" to Color.rgb(202, 182, 150),
        "Gris" to Color.rgb(166, 172, 178),
    ),
)
private val HANDS = Choice("agujas", "Agujas", listOf("Lanza (como la foto)" to 0, "Bastón" to 1, "Espada" to 2, "Delgadas" to 3))
private val HCOLOR = Choice("colorAgujas", "Color de las agujas", listOf("Blanco" to Color.rgb(236, 236, 236), "Plata" to Color.rgb(184, 190, 196), "Del tema" to 1))
private val SECOND = Choice("segundero2", "Segundero", listOf("Rojo con cola" to 0, "Rojo con círculo" to 1, "Del color del tema" to 2, "Blanco" to 3, "Sin segundero" to 4))
private val GOAL = Choice("meta", "Meta de pasos (arco)", listOf("6.000" to 6000, "8.000" to 8000, "10.000" to 10000, "12.000" to 12000, "15.000" to 15000))
private val PLAYER = Choice("reproductor", "Reproductor", listOf("Apagado" to 0, "Tocar el centro lo abre" to 1))
private val AMB = Choice("bajo", "Bajo consumo", listOf("Esfera completa tenue" to 0, "Solo agujas y fecha" to 1))

object Config : FaceConfig {
    override val slots = listOf(LEFT to "Círculo izquierdo (batería)", RIGHT to "Círculo derecho (pasos)", BOTTOM to "Círculo de abajo (ritmo cardíaco)")
    override val spots = listOf(
        Spot(0f, -0.79f, Action.MEDIA, "Número 12", hit = 0.15f),
        Spot(0.86f, 0f, Action.MUSIC, "Triángulo del 3", hit = 0.12f),
        Spot(-0.86f, 0f, Action.ALARMS, "Triángulo del 9", hit = 0.12f),
        Spot(0f, -0.35f, Action.TIMER, "Fecha", hit = 0.11f),
        Spot(0f, 0.88f, Action.BATTERY, "Triángulo del 6", hit = 0.10f),
    )
    override val choices = listOf(THEME, HANDS, HCOLOR, SECOND, Smooth.CHOICE, GOAL, PLAYER, AMB)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val types = listOf(ComplicationType.RANGED_VALUE, ComplicationType.SHORT_TEXT)
        fun slot(id: Int, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, types, policy, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            slot(LEFT, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_WATCH_BATTERY, ComplicationType.RANGED_VALUE), RectF(0.156f, 0.366f, 0.425f, 0.634f)),
            slot(RIGHT, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.575f, 0.366f, 0.844f, 0.634f)),
            slot(BOTTOM, DefaultComplicationDataSourcePolicy(), RectF(0.366f, 0.614f, 0.634f, 0.883f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = HorizonRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.ANALOG, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP) return
                // Con el reproductor abierto, todos los toques son suyos
                if (renderer.playerOpen) return renderer.playerTap(tapEvent.xPos, tapEvent.yPos)
                if (complicationSlot != null) return
                if (renderer.onCenter(tapEvent.xPos, tapEvent.yPos)) return renderer.openPlayer()
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class HorizonAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/**
 * Horizonte: esfera de agujas en dos colores (arriba oscuro, abajo el color del tema), números finos
 * girados (12, 2, 4, 8 y 10), líneas en las otras horas, triángulos en el 3, 6 y 9, la fecha y tres
 * círculos de datos (batería, pasos y ritmo). Opcional: tocar el centro abre el reproductor.
 */
class HorizonRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<HorizonAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = HorizonAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG)
    private val regular = Typeface.create("sans-serif", Typeface.NORMAL)
    private val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    private val light = Typeface.create("sans-serif-light", Typeface.NORMAL)
    private val path = Path()
    private val battery = context.getSystemService(BatteryManager::class.java)
    private val heart = HeartRate(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    var lastBounds = Rect()
        private set

    private val redraw: () -> Unit = { invalidate() }

    // Colores fijos de la foto
    private val dark = Color.rgb(44, 48, 51)
    private val disc = Color.rgb(37, 40, 43)
    private val ring = Color.rgb(54, 59, 62)
    private val track = Color.rgb(64, 70, 73)
    private val value = Color.rgb(226, 226, 226)
    private val red = Color.rgb(222, 32, 34)

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

    // ===== Reproductor (opcional: se abre tocando el centro) =====
    @Volatile var playerOpen = false
        private set
    private var playerUsedAt = 0L

    private fun geo(): Triple<Float, Float, Float> {
        val b = lastBounds
        return Triple(b.exactCenterX(), b.exactCenterY(), min(b.width(), b.height()) / 2f)
    }

    fun onCenter(x: Int, y: Int): Boolean {
        if (lastBounds.isEmpty || Choices.value(context, PLAYER) != 1) return false
        val (cx, cy, r) = geo()
        return hypot(x - cx, y - cy) < r * 0.13f * ZOOM || hypot(x - cx, y - (cy - r * 0.17f * ZOOM)) < r * 0.08f * ZOOM
    }

    fun openPlayer() {
        playerOpen = true
        playerUsedAt = System.currentTimeMillis()
        PhoneNow.ask(context)
        invalidate()
    }

    private val BTN_X = floatArrayOf(-0.38f, 0f, 0.38f)
    private val BTN_R = floatArrayOf(0.115f, 0.145f, 0.115f)

    fun playerTap(x: Int, y: Int) {
        val (cx, cy, r) = geo()
        playerUsedAt = System.currentTimeMillis()
        val s = PhoneNow.current()
        var k = -1
        for (i in 0..2) if (hypot(x - (cx + BTN_X[i] * r), y - (cy + 0.50f * r)) < r * (BTN_R[i] + 0.03f)) k = i
        when (k) {
            0 -> PhoneNow.command(context, "prev")
            1 -> PhoneNow.command(context, if (s?.playing == true) "pause" else "play")
            2 -> PhoneNow.command(context, "next")
            else -> playerOpen = false
        }
        invalidate()
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: HorizonAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val t = zonedDateTime
        val theme = Choices.value(context, THEME)
        interactiveDrawModeUpdateDelayMillis = if (playerOpen || Choices.value(context, SECOND) == 4) 1000L else Smooth.delay(context)

        canvas.drawColor(Color.rgb(14, 14, 15))

        if (playerOpen && (ambient || System.currentTimeMillis() - playerUsedAt > 90_000)) playerOpen = false
        if (playerOpen) return renderPlayer(canvas, cx, cy, r, t, theme)

        if (ambient && Choices.value(context, AMB) == 1) {
            // Bajo consumo mínimo: solo la fecha y las agujas (en contorno)
            canvas.save()
            canvas.scale(ZOOM, ZOOM, cx, cy)
            drawDate(canvas, t, X(0f), Y(-0.31f), r, a(theme, 200))
            drawHands(canvas, cx, cy, r, t, theme, ambient = true)
            canvas.restore()
            return
        }

        // ===== Fondo en dos colores (arriba oscuro, abajo el tema) =====
        val R = r
        fill.color = dark
        canvas.drawCircle(cx, cy, R, fill)
        canvas.save()
        canvas.clipRect(cx - R, cy, cx + R, cy + R)
        fill.color = theme
        canvas.drawCircle(cx, cy, R, fill)
        canvas.restore()
        // Todo lo de encima, agrandado para que la esfera llene la pantalla (como la foto, sin aro negro)
        canvas.save()
        canvas.scale(ZOOM, ZOOM, cx, cy)

        // ===== Números girados, líneas y triángulos =====
        val numH = r * 0.235f
        for (k in listOf(0, 2, 4, 8, 10)) {
            val ang = Math.toRadians(k * 30.0 - 90).toFloat()
            val nx = cx + cos(ang) * r * 0.705f
            val ny = cy + sin(ang) * r * 0.705f
            val s = if (k == 0) "12" else k.toString()
            canvas.save()
            canvas.rotate(k * 30f, nx, ny)
            HandDigits.draw(canvas, s, nx - HandDigits.width(s, numH) / 2, ny - numH / 2, numH, if (k in 3..9) dark else theme)
            canvas.restore()
        }
        stroke.strokeCap = Paint.Cap.BUTT
        stroke.strokeWidth = r * 0.012f
        for (k in listOf(1, 5, 7, 11)) {
            val ang = Math.toRadians(k * 30.0 - 90).toFloat()
            stroke.color = if (k in 3..9) dark else theme
            canvas.drawLine(cx + cos(ang) * r * 0.60f, cy + sin(ang) * r * 0.60f, cx + cos(ang) * r * 0.845f, cy + sin(ang) * r * 0.845f, stroke)
        }
        stroke.strokeCap = Paint.Cap.ROUND
        for (side in listOf(-1f, 1f)) {
            // Triángulo del 3 y del 9: la mitad de arriba del color del tema y la de abajo oscura
            val base = X(side * 0.845f)
            val tip = X(side * 0.665f)
            val hh = r * 0.078f
            fill.color = theme
            path.reset(); path.moveTo(base, cy - hh); path.lineTo(tip, cy); path.lineTo(base, cy); path.close()
            canvas.drawPath(path, fill)
            fill.color = dark
            path.reset(); path.moveTo(base, cy); path.lineTo(tip, cy); path.lineTo(base, cy + hh); path.close()
            canvas.drawPath(path, fill)
        }
        fill.color = dark
        path.reset(); path.moveTo(X(-0.08f), Y(0.835f)); path.lineTo(X(0f), Y(0.73f)); path.lineTo(X(0.08f), Y(0.835f)); path.close()
        canvas.drawPath(path, fill)

        // ===== Fecha =====
        drawDate(canvas, t, X(0f), Y(-0.31f), r, theme)
        if (Choices.value(context, PLAYER) == 1) drawNote(canvas, X(0f), Y(-0.17f), r * 0.045f, theme)

        // ===== Círculos de datos =====
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val leftRaw = complications.textOf(LEFT, context.resources)
        val leftTxt = when {
            leftRaw == null -> if (pct >= 0) "$pct%" else "--"
            slotIsBattery() && !leftRaw.endsWith("%") -> "$leftRaw%"
            else -> leftRaw
        }
        val leftFrac = slotValue(LEFT) ?: (if (leftRaw == null && pct >= 0) pct / 100f else null)
        subdial(canvas, X(-0.37f), cy, r, theme, LEFT, leftTxt, leftFrac ?: 0f, 0)
        val steps = complications.textOf(RIGHT, context.resources)
        val stepsN = steps?.filter { it.isDigit() }?.toIntOrNull()
        val rightFrac = slotValue(RIGHT) ?: (stepsN?.let { (it.toFloat() / Choices.value(context, GOAL)).coerceIn(0f, 1f) } ?: 0f)
        subdial(canvas, X(0.37f), cy, r, theme, RIGHT, steps ?: "--", rightFrac, 1)
        val hr = complications.textOf(BOTTOM, context.resources) ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        subdial(canvas, cx, Y(0.44f), r, theme, BOTTOM, hr, null, 2)

        // ===== Agujas =====
        drawHands(canvas, cx, cy, r, t, theme, ambient)
        canvas.restore()

        // Siempre activa: la esfera completa, más tenue
        if (ambient) canvas.drawColor(Color.argb(150, 0, 0, 0))
    }

    private fun drawDate(canvas: Canvas, t: ZonedDateTime, x: Float, y: Float, r: Float, color: Int) {
        val loc = Locale.getDefault()
        val mon = t.month.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc).take(3)
        val dow = t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc).replace(".", "").uppercase(loc).take(3)
        write(canvas, "$mon ${t.dayOfMonth} | $dow", x, y, r * 0.115f, color, regular)
    }

    /** Fracción (0..1) del dato si es un valor con rango (batería, pasos con meta…) */
    private fun slotValue(id: Int): Float? {
        val d = complications.complicationSlots[id]?.complicationData?.value as? RangedValueComplicationData ?: return null
        if (d.max <= d.min) return null
        return ((d.value - d.min) / (d.max - d.min)).coerceIn(0f, 1f)
    }

    private fun slotIsBattery(): Boolean {
        val d = complications.complicationSlots[LEFT]?.complicationData?.value as? RangedValueComplicationData ?: return false
        return d.max == 100f && d.min == 0f
    }

    private val icons = HashMap<Int, Pair<Any?, Drawable?>>()

    private fun slotIcon(id: Int): Drawable? {
        val d = complications.complicationSlots[id]?.complicationData?.value
        val img = when (d) {
            is ShortTextComplicationData -> d.monochromaticImage?.image
            is RangedValueComplicationData -> d.monochromaticImage?.image
            else -> null
        }
        val cached = icons[id]
        if (cached != null && cached.first === img) return cached.second
        val dr = runCatching { img?.loadDrawable(context)?.mutate() }.getOrNull()
        icons[id] = img to dr
        return dr
    }

    /** Círculo oscuro con borde, arco de avance (si tiene), ícono del color del tema y el valor */
    private fun subdial(canvas: Canvas, x: Float, y: Float, r: Float, theme: Int, id: Int, txt: String, frac: Float?, kind: Int) {
        fill.color = ring
        canvas.drawCircle(x, y, r * 0.238f, fill)
        fill.color = disc
        canvas.drawCircle(x, y, r * 0.205f, fill)
        if (frac != null) {
            val ar = r * 0.178f
            val box = RectF(x - ar, y - ar, x + ar, y + ar)
            stroke.strokeWidth = r * 0.02f
            stroke.strokeCap = Paint.Cap.BUTT
            stroke.color = track
            canvas.drawArc(box, 120f, 300f, false, stroke)
            if (frac > 0f) {
                stroke.color = theme
                canvas.drawArc(box, 120f, 300f * frac, false, stroke)
            }
            stroke.strokeCap = Paint.Cap.ROUND
        }
        val iy = y - r * 0.06f
        val ic = r * 0.05f
        val sys = slotIcon(id)
        val useOwn = when (id) {
            LEFT -> slotIsBattery() || complications.complicationSlots[id]?.complicationData?.value == null || sys == null
            else -> sys == null
        }
        if (!useOwn && sys != null) {
            sys.setBounds((x - ic).toInt(), (iy - ic).toInt(), (x + ic).toInt(), (iy + ic).toInt())
            sys.setTint(theme)
            sys.draw(canvas)
        } else when (kind) {
            0 -> drawBattery(canvas, x, iy, ic, theme)
            1 -> drawShoe(canvas, x, iy, ic, theme)
            else -> drawHeart(canvas, x, iy + (if (kind == 2) -r * 0.005f else 0f), ic * 1.1f, theme)
        }
        write(canvas, txt, x, y + r * (if (kind == 2) 0.125f else 0.112f), r * (if (kind == 2) 0.092f else 0.084f), value, regular, maxW = r * 0.34f)
    }

    private fun drawBattery(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawRoundRect(RectF(x - s * 0.42f, y - s * 0.78f, x + s * 0.42f, y + s), s * 0.12f, s * 0.12f, fill)
        canvas.drawRect(x - s * 0.2f, y - s, x + s * 0.2f, y - s * 0.78f, fill)
    }

    private fun drawShoe(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        // Zapatilla de correr (punta hacia la derecha, inclinada)
        canvas.save()
        canvas.rotate(-28f, x, y)
        fill.color = color
        path.reset()
        path.moveTo(x - s * 1.0f, y + s * 0.45f)
        path.lineTo(x - s * 0.98f, y - s * 0.45f)
        path.lineTo(x - s * 0.55f, y - s * 0.32f)
        path.lineTo(x - s * 0.25f, y - s * 0.72f)
        path.lineTo(x + s * 0.05f, y - s * 0.45f)
        path.lineTo(x + s * 0.85f, y)
        path.quadTo(x + s * 1.05f, y + s * 0.1f, x + s * 1.05f, y + s * 0.45f)
        path.close()
        canvas.drawPath(path, fill)
        // Suela separada
        stroke.color = disc
        stroke.strokeWidth = s * 0.12f
        stroke.strokeCap = Paint.Cap.BUTT
        canvas.drawLine(x - s * 1.05f, y + s * 0.22f, x + s * 1.1f, y + s * 0.22f, stroke)
        stroke.strokeCap = Paint.Cap.ROUND
        canvas.restore()
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

    private fun drawNote(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawOval(RectF(x - s * 0.95f, y + s * 0.35f, x - s * 0.05f, y + s * 1.0f), fill)
        canvas.drawRect(x - s * 0.2f, y - s * 0.95f, x - s * 0.05f, y + s * 0.7f, fill)
        path.reset()
        path.moveTo(x - s * 0.2f, y - s * 0.95f)
        path.cubicTo(x + s * 0.3f, y - s * 0.6f, x + s * 0.8f, y - s * 0.5f, x + s * 0.55f, y + s * 0.15f)
        path.cubicTo(x + s * 0.6f, y - s * 0.3f, x + s * 0.2f, y - s * 0.45f, x - s * 0.05f, y - s * 0.5f)
        path.close()
        canvas.drawPath(path, fill)
    }

    // ===== Agujas =====
    private fun handColor(theme: Int) = Choices.value(context, HCOLOR).let { if (it == 1) theme else it }

    private fun drawHands(canvas: Canvas, cx: Float, cy: Float, r: Float, t: ZonedDateTime, theme: Int, ambient: Boolean) {
        val sec = Smooth.seconds(context, t)
        val minute = t.minute + sec / 60f
        val hour = (t.hour % 12) + minute / 60f
        val color = handColor(theme)
        val style = Choices.value(context, HANDS)
        hand(canvas, cx, cy, r, hour * 30f, r * 0.48f, style, color, ambient, false)
        hand(canvas, cx, cy, r, minute * 6f, r * 0.785f, style, color, ambient, true)
        val sStyle = Choices.value(context, SECOND)
        val sColor = when (sStyle) {
            0, 1 -> red
            2 -> theme
            3 -> Color.rgb(240, 240, 240)
            else -> color
        }
        if (!ambient && sStyle != 4) {
            canvas.save()
            canvas.rotate((if (Smooth.on(context)) sec else t.second.toFloat()) * 6f, cx, cy)
            stroke.color = sColor
            stroke.strokeCap = Paint.Cap.BUTT
            stroke.strokeWidth = r * 0.0095f
            canvas.drawLine(cx, cy + r * 0.11f, cx, cy - r * 0.81f, stroke)
            stroke.strokeWidth = r * 0.016f
            canvas.drawLine(cx, cy + r * 0.11f, cx, cy + r * 0.02f, stroke)
            if (sStyle == 1) {
                stroke.strokeWidth = r * 0.011f
                fill.color = disc
                canvas.drawCircle(cx, cy - r * 0.60f, r * 0.032f, fill)
                canvas.drawCircle(cx, cy - r * 0.60f, r * 0.032f, stroke)
            }
            stroke.strokeCap = Paint.Cap.ROUND
            canvas.restore()
        }
        // Centro: aro claro, botón del color del segundero y punto oscuro
        if (ambient) {
            fill.color = Color.BLACK
            canvas.drawCircle(cx, cy, r * 0.05f, fill)
            stroke.color = a(color, 200)
            stroke.strokeWidth = r * 0.008f
            canvas.drawCircle(cx, cy, r * 0.045f, stroke)
            return
        }
        fill.color = Color.rgb(238, 238, 238)
        canvas.drawCircle(cx, cy, r * 0.056f, fill)
        fill.color = if (sStyle == 4) color else sColor
        canvas.drawCircle(cx, cy, r * 0.043f, fill)
        fill.color = Color.rgb(20, 20, 22)
        canvas.drawCircle(cx, cy, r * 0.013f, fill)
    }

    /** Una aguja dibujada hacia arriba y girada; en bajo consumo, solo su contorno */
    private fun hand(canvas: Canvas, cx: Float, cy: Float, r: Float, deg: Float, len: Float, style: Int, color: Int, ambient: Boolean, long: Boolean) {
        canvas.save()
        canvas.rotate(deg, cx, cy)
        val shade = mix(color, Color.BLACK, 0.22f)
        fun poly(vararg p: Float): Path {
            val q = Path()
            q.moveTo(cx + p[0], cy - p[1])
            var i = 2
            while (i < p.size) { q.lineTo(cx + p[i], cy - p[i + 1]); i += 2 }
            q.close()
            return q
        }
        fun paintBevel(left: Path, right: Path) {
            if (ambient) {
                val all = Path(left).apply { op(right, Path.Op.UNION) }
                stroke.color = a(color, 220)
                stroke.strokeWidth = r * 0.007f
                canvas.drawPath(all, stroke)
                return
            }
            fill.color = color
            canvas.drawPath(left, fill)
            fill.color = shade
            canvas.drawPath(right, fill)
        }
        when (style) {
            0 -> {
                // Lanza: fina en el centro, se ensancha y termina en punta (dos tonos, como la foto)
                val w0 = r * 0.011f
                val w1 = r * (if (long) 0.022f else 0.024f)
                paintBevel(poly(0f, 0f, -w0, 0f, -w1, len * 0.84f, 0f, len), poly(0f, 0f, w0, 0f, w1, len * 0.84f, 0f, len))
            }
            1 -> {
                val w = r * 0.019f
                val rect = RectF(cx - w, cy - len, cx + w, cy + r * 0.06f)
                if (ambient) {
                    stroke.color = a(color, 220); stroke.strokeWidth = r * 0.007f
                    canvas.drawRoundRect(rect, w, w, stroke)
                } else {
                    fill.color = color
                    canvas.drawRoundRect(rect, w, w, fill)
                    fill.color = shade
                    canvas.drawRoundRect(RectF(cx - w * 0.35f, cy - len * 0.94f, cx + w * 0.35f, cy - len * 0.28f), w * 0.35f, w * 0.35f, fill)
                }
            }
            2 -> {
                val w = r * 0.036f
                paintBevel(poly(0f, -r * 0.05f, -w * 0.5f, 0f, -w, len * 0.22f, 0f, len), poly(0f, -r * 0.05f, w * 0.5f, 0f, w, len * 0.22f, 0f, len))
            }
            else -> {
                stroke.color = if (ambient) a(color, 220) else color
                stroke.strokeWidth = r * (if (long) 0.014f else 0.018f)
                canvas.drawLine(cx, cy + r * 0.04f, cx, cy - len, stroke)
            }
        }
        canvas.restore()
    }

    // ===== Pantalla del reproductor =====
    private fun renderPlayer(canvas: Canvas, cx: Float, cy: Float, r: Float, t: ZonedDateTime, theme: Int) {
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val R = r
        fill.color = dark
        canvas.drawCircle(cx, cy, R, fill)
        canvas.save()
        canvas.clipRect(cx - R, cy + r * 0.06f, cx + R, cy + R)
        fill.color = theme
        canvas.drawCircle(cx, cy, R, fill)
        canvas.restore()
        val s = PhoneNow.current()
        // Batería
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        drawBattery(canvas, X(-0.09f), Y(-0.71f), r * 0.035f, theme)
        write(canvas, if (pct >= 0) "$pct%" else "--", X(-0.04f), Y(-0.685f), r * 0.07f, value, regular, Paint.Align.LEFT)
        // Hora
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString()
        write(canvas, "$h:${"%02d".format(t.minute)}", X(0f), Y(-0.38f), r * 0.27f, theme, light)
        // Reproductor y volumen
        val app = if (PhoneNow.state?.from == "cl.carlospnauto.app") "PULSOMEDIA" else "PULSOMUSIC"
        val vol = if (s != null && s.volume >= 0) "  ·  VOL ${s.volume}" else ""
        write(canvas, app + vol, X(0f), Y(-0.25f), r * 0.052f, Color.rgb(160, 166, 170), medium)
        // Canción
        write(canvas, s?.title ?: "Sin música", X(0f), Y(-0.07f), r * 0.088f, Color.WHITE, medium, maxW = r * 1.45f)
        write(canvas, if (s == null) "Toca ► para reanudar en el teléfono" else s.artist, X(0f), Y(0.17f), r * 0.064f, dark, medium, maxW = r * 1.35f)
        // Avance
        val p = if (s != null && s.durationMs > 0) (s.position().toFloat() / s.durationMs).coerceIn(0f, 1f) else 0f
        stroke.strokeWidth = r * 0.02f
        stroke.color = a(dark, 70)
        canvas.drawLine(X(-0.58f), Y(0.255f), X(0.58f), Y(0.255f), stroke)
        if (p > 0f) {
            stroke.color = dark
            canvas.drawLine(X(-0.58f), Y(0.255f), X(-0.58f) + r * 1.16f * p, Y(0.255f), stroke)
        }
        fun mmss(ms: Long) = "%d:%02d".format(ms / 60000, (ms / 1000) % 60)
        if (s != null && s.durationMs > 0) {
            write(canvas, mmss(s.position()), X(-0.58f), Y(0.33f), r * 0.048f, dark, medium, Paint.Align.LEFT)
            write(canvas, mmss(s.durationMs), X(0.58f), Y(0.33f), r * 0.048f, dark, medium, Paint.Align.RIGHT)
        }
        // Botones ◄◄ ►‖ ►►
        for (k in 0..2) {
            val bx = X(BTN_X[k])
            val by = Y(0.50f)
            fill.color = disc
            canvas.drawCircle(bx, by, r * BTN_R[k], fill)
            fill.color = theme
            val q = r * (if (k == 1) 0.045f else 0.035f)
            when (k) {
                0 -> {
                    path.reset(); path.moveTo(bx + q * 0.1f, by - q); path.lineTo(bx - q * 1.2f, by); path.lineTo(bx + q * 0.1f, by + q); path.close(); canvas.drawPath(path, fill)
                    path.reset(); path.moveTo(bx + q * 1.3f, by - q); path.lineTo(bx + q * 0.05f, by); path.lineTo(bx + q * 1.3f, by + q); path.close(); canvas.drawPath(path, fill)
                }
                1 -> if (s?.playing == true) {
                    canvas.drawRect(bx - q * 0.85f, by - q * 1.05f, bx - q * 0.28f, by + q * 1.05f, fill)
                    canvas.drawRect(bx + q * 0.28f, by - q * 1.05f, bx + q * 0.85f, by + q * 1.05f, fill)
                } else {
                    path.reset(); path.moveTo(bx - q * 0.7f, by - q * 1.15f); path.lineTo(bx + q * 1.15f, by); path.lineTo(bx - q * 0.7f, by + q * 1.15f); path.close(); canvas.drawPath(path, fill)
                }
                else -> {
                    path.reset(); path.moveTo(bx - q * 0.1f, by - q); path.lineTo(bx + q * 1.2f, by); path.lineTo(bx - q * 0.1f, by + q); path.close(); canvas.drawPath(path, fill)
                    path.reset(); path.moveTo(bx - q * 1.3f, by - q); path.lineTo(bx - q * 0.05f, by); path.lineTo(bx - q * 1.3f, by + q); path.close(); canvas.drawPath(path, fill)
                }
            }
        }
        write(canvas, "Toca fuera para volver", X(0f), Y(0.735f), r * 0.045f, dark, medium)
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: HorizonAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}

/**
 * Números de la esfera dibujados a mano: muy finos y angostos (como la foto), del mismo trazo en
 * todos los relojes. Solo los que se usan: 0, 1, 2, 4 y 8.
 */
object HandDigits {
    private const val GAP = 0.09f
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.BUTT
        strokeJoin = Paint.Join.MITER
    }
    private val path = Path()

    private fun w(c: Char) = if (c == '1') 0.12f else 0.30f

    fun width(s: String, h: Float) = (s.sumOf { w(it).toDouble() }.toFloat() + GAP * (s.length - 1)) * h

    fun draw(canvas: Canvas, s: String, x: Float, top: Float, h: Float, color: Int) {
        paint.color = color
        paint.strokeWidth = h * 0.047f
        var cx = x
        for (c in s) {
            glyph(canvas, c, cx, top, h)
            cx += (w(c) + GAP) * h
        }
    }

    private fun glyph(canvas: Canvas, c: Char, x: Float, y: Float, h: Float) {
        fun X(u: Float) = x + u * h
        fun Y(v: Float) = y + v * h
        val sw = 0.0235f
        path.reset()
        when (c) {
            '1' -> { path.moveTo(X(0f), Y(0.07f)); path.lineTo(X(0.12f - sw), Y(sw)); path.lineTo(X(0.12f - sw), Y(1f)) }
            '2' -> {
                path.moveTo(X(sw), Y(0.17f))
                path.cubicTo(X(sw), Y(0.06f), X(0.07f), Y(sw), X(0.15f), Y(sw))
                path.cubicTo(X(0.24f), Y(sw), X(0.30f - sw), Y(0.07f), X(0.30f - sw), Y(0.19f))
                path.cubicTo(X(0.30f - sw), Y(0.38f), X(sw), Y(0.68f), X(sw), Y(1f - sw))
                path.lineTo(X(0.30f), Y(1f - sw))
            }
            '0' -> path.addRoundRect(RectF(X(sw), Y(sw), X(0.30f - sw), Y(1f - sw)), 0.13f * h, 0.13f * h, Path.Direction.CW)
            '8' -> {
                path.addRoundRect(RectF(X(0.02f + sw), Y(sw), X(0.28f - sw), Y(0.46f)), 0.12f * h, 0.12f * h, Path.Direction.CW)
                path.addRoundRect(RectF(X(sw), Y(0.46f), X(0.30f - sw), Y(1f - sw)), 0.13f * h, 0.13f * h, Path.Direction.CW)
            }
            '4' -> { path.moveTo(X(0.23f), Y(1f)); path.lineTo(X(0.23f), Y(0.04f)); path.lineTo(X(sw), Y(0.68f)); path.lineTo(X(0.30f), Y(0.68f)) }
            else -> return
        }
        canvas.drawPath(path, paint)
    }
}
