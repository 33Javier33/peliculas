package cl.carlospnauto.esfera

import android.content.Context
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
import cl.carlospnauto.esfera.comun.Lcd
import cl.carlospnauto.esfera.comun.PhoneNow
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
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin

private const val WEATHER = 101
private const val EVENT = 102
private const val STEPS = 103
private const val HEART = 104

/** Pantalla de cristal líquido: fondo (arriba, abajo) y dígitos */
private data class Screen(val top: Int, val bottom: Int, val ink: Int)

private val SCREENS = listOf(
    "Gris" to Screen(Color.rgb(226, 229, 224), Color.rgb(198, 202, 196), Color.rgb(24, 24, 24)),
    "Amarillo" to Screen(Color.rgb(255, 232, 150), Color.rgb(238, 208, 108), Color.rgb(36, 28, 10)),
    "Crema" to Screen(Color.rgb(242, 238, 216), Color.rgb(220, 214, 190), Color.rgb(30, 28, 20)),
    "Lavanda" to Screen(Color.rgb(224, 226, 252), Color.rgb(200, 202, 238), Color.rgb(24, 24, 40)),
    "Lima" to Screen(Color.rgb(238, 246, 178), Color.rgb(214, 226, 140), Color.rgb(28, 32, 10)),
    "Celeste" to Screen(Color.rgb(198, 230, 252), Color.rgb(166, 208, 240), Color.rgb(14, 28, 40)),
    "Menta" to Screen(Color.rgb(124, 238, 182), Color.rgb(84, 212, 150), Color.rgb(10, 36, 24)),
)
private val SCREEN = Choice("pantalla", "Color de las pantallas", SCREENS.map { it.first to it.second.top })
private val BACK = Choice("fondo", "Fondo", listOf("Negro" to Color.rgb(8, 8, 9), "Gris oscuro" to Color.rgb(28, 28, 30), "Grafito" to Color.rgb(42, 42, 46)))
private val SHORTS = Choice("accesos", "Accesos de arriba", listOf("Visibles" to 0, "Ocultos" to 1))
private val NIGHT = Choice("noche", "Mapa", listOf("Con la noche (hora mundial)" to 0, "Solo el mapa" to 1))
private val AMB = Choice("bajo", "Bajo consumo", listOf("Pantalla completa tenue" to 0, "Mínimo" to 1))

object Config : FaceConfig {
    override val slots = listOf(WEATHER to "Clima (arriba)", EVENT to "Eventos", STEPS to "Pasos", HEART to "Ritmo cardíaco")
    override val spots = listOf(
        Spot(-0.42f, -0.76f, Action.MEDIA, "Círculo de la izquierda", hit = 0.09f),
        Spot(0.40f, -0.76f, Action.MUSIC, "Círculo de la derecha", hit = 0.09f),
        Spot(-0.02f, 0.815f, Action.BATTERY, "Batería", hit = 0.12f),
        Spot(0.495f, -0.27f, Action.ALARMS, "Fecha", hit = 0.11f),
        Spot(-0.34f, -0.23f, Action.TIMER, "Hora", hit = 0.14f),
    )
    override val choices = listOf(SCREEN, BACK, SHORTS, NIGHT, AMB)
    override val heartRate = true
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val short = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        fun slot(id: Int, types: List<ComplicationType>, policy: DefaultComplicationDataSourcePolicy, b: RectF) =
            ComplicationSlot.createRoundRectComplicationSlotBuilder(id, factory, types, policy, ComplicationSlotBounds(b)).build()
        val slots = listOf(
            slot(WEATHER, short, DefaultComplicationDataSourcePolicy(), RectF(0.36f, 0.08f, 0.63f, 0.165f)),
            slot(
                EVENT, listOf(ComplicationType.LONG_TEXT, ComplicationType.SHORT_TEXT),
                DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_NEXT_EVENT, ComplicationType.LONG_TEXT),
                RectF(0.19f, 0.18f, 0.845f, 0.245f),
            ),
            slot(STEPS, short, DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT), RectF(0.21f, 0.745f, 0.455f, 0.82f)),
            slot(HEART, short, DefaultComplicationDataSourcePolicy(), RectF(0.51f, 0.745f, 0.78f, 0.82f)),
        )
        return ComplicationSlotsManager(slots, currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = WorldRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP) return
                // Con el reproductor abierto, todos los toques son suyos
                if (renderer.playerOpen) return renderer.playerTap(tapEvent.xPos, tapEvent.yPos)
                if (complicationSlot != null) return
                // Tocar el reloj de agujas abre el reproductor de PulsoMusic / PulsoMedia
                if (renderer.onDial(tapEvent.xPos, tapEvent.yPos)) return renderer.openPlayer()
                // Tocar el mapa cambia lo que muestra (noche, sol y luna, ciudades, tu día)
                if (renderer.onMap(tapEvent.xPos, tapEvent.yPos)) return renderer.mapTap()
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}

class WorldAssets : Renderer.SharedAssets {
    override fun onDestroy() {}
}

/**
 * LCD Mundo: pantallitas de cristal líquido con el clima, el evento (con la fase de la luna), la hora
 * con segundos, la fecha, el mapa del mundo con la noche, un reloj de agujas, pasos, ritmo y batería.
 * Tocar el reloj de agujas abre el reproductor de lo que suena en PulsoMusic o PulsoMedia.
 */
class WorldRenderer(
    private val context: Context,
    surfaceHolder: SurfaceHolder,
    watchState: WatchState,
    private val complications: ComplicationSlotsManager,
    currentUserStyleRepository: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<WorldAssets>(surfaceHolder, currentUserStyleRepository, watchState, CanvasType.HARDWARE, 1000L, false) {

    override suspend fun createSharedAssets() = WorldAssets()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG)
    private val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    private val bold = Typeface.create("sans-serif", Typeface.BOLD)
    private val condensed = Typeface.create("sans-serif-condensed", Typeface.NORMAL)
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

    private fun plain(s: String) = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}"), "").uppercase(Locale.ROOT)

    private fun write(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, face: Typeface, align: Paint.Align, maxW: Float = 0f) {
        text.typeface = face
        text.textSize = size
        text.color = color
        text.textAlign = align
        text.textScaleX = 1f
        var t = s
        if (maxW > 0f && text.measureText(t) > maxW) {
            text.textScaleX = maxOf(0.82f, maxW / text.measureText(t))
            while (t.length > 2 && text.measureText(t) > maxW) t = t.dropLast(2) + "…"
        }
        canvas.drawText(t, x, y, text)
        text.textScaleX = 1f
    }

    /** Rótulo vertical en su pestaña (PASOS, FC, LPM…), como la foto */
    private fun vertical(canvas: Canvas, s: String, x: Float, y: Float, size: Float, color: Int) {
        canvas.save()
        canvas.rotate(-90f, x, y)
        val big = size * 1.2f
        text.typeface = condensed
        text.textSize = big
        val w = text.measureText(s) + big * 0.9f
        val tab = RectF(x - w / 2, y - big * 0.78f, x + w / 2, y + big * 0.78f)
        fill.color = Color.rgb(52, 52, 56)
        canvas.drawRoundRect(tab, big * 0.45f, big * 0.45f, fill)
        stroke.color = Color.rgb(100, 100, 106)
        stroke.strokeWidth = big * 0.08f
        canvas.drawRoundRect(tab, big * 0.45f, big * 0.45f, stroke)
        write(canvas, s, x, y + big * 0.35f, big, Color.rgb(215, 215, 220), condensed, Paint.Align.CENTER)
        canvas.restore()
    }

    /** Pantallita de cristal líquido con su degradé y un borde fino */
    private fun lcd(canvas: Canvas, rect: RectF, r: Float, sc: Screen, dim: Boolean) {
        fill.shader = LinearGradient(0f, rect.top, 0f, rect.bottom, sc.top, sc.bottom, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(rect, r * 0.035f, r * 0.035f, fill)
        fill.shader = null
        if (dim) {
            fill.color = Color.argb(150, 0, 0, 0)
            canvas.drawRoundRect(rect, r * 0.035f, r * 0.035f, fill)
        }
        stroke.color = Color.argb(70, 0, 0, 0)
        stroke.strokeWidth = r * 0.006f
        canvas.drawRoundRect(rect, r * 0.035f, r * 0.035f, stroke)
    }

    private fun panel(canvas: Canvas, rect: RectF, rad: Float, r: Float, fillColor: Int) {
        fill.color = fillColor
        canvas.drawRoundRect(rect, rad, rad, fill)
        stroke.color = Color.rgb(96, 96, 100)
        stroke.strokeWidth = r * 0.011f
        canvas.drawRoundRect(rect, rad, rad, stroke)
    }

    // ===== Reproductor (se abre tocando el reloj de agujas) =====
    @Volatile var playerOpen = false
        private set
    private var playerUsedAt = 0L

    private fun dialCenter(b: Rect): Pair<Float, Float> {
        val r = min(b.width(), b.height()) / 2f
        return (b.exactCenterX() + 0.495f * r) to (b.exactCenterY() + 0.085f * r)
    }

    fun onDial(x: Int, y: Int): Boolean {
        val b = lastBounds
        if (b.isEmpty) return false
        val r = min(b.width(), b.height()) / 2f
        val (dx, dy) = dialCenter(b)
        return hypot(x - dx, y - dy) < r * 0.27f
    }

    fun openPlayer() {
        playerOpen = true
        playerUsedAt = System.currentTimeMillis()
        PhoneNow.ask(context)
        invalidate()
    }

    private fun zone(cx: Float, cy: Float, r: Float, k: Int): RectF {
        val x = cx + r * (k - 1) * 0.42f
        val w = if (k == 1) 0.15f else 0.12f
        return RectF(x - r * w, cy + r * 0.30f, x + r * w, cy + r * 0.50f)
    }

    fun playerTap(x: Int, y: Int) {
        val b = lastBounds
        val r = min(b.width(), b.height()) / 2f
        val cx = b.exactCenterX()
        val cy = b.exactCenterY()
        playerUsedAt = System.currentTimeMillis()
        val s = PhoneNow.current()
        when {
            zone(cx, cy, r, 0).contains(x.toFloat(), y.toFloat()) -> PhoneNow.command(context, "prev")
            zone(cx, cy, r, 1).contains(x.toFloat(), y.toFloat()) -> PhoneNow.command(context, if (s?.playing == true) "pause" else "play")
            zone(cx, cy, r, 2).contains(x.toFloat(), y.toFloat()) -> PhoneNow.command(context, "next")
            // Cualquier otro toque (o la ✕ de arriba) cierra el reproductor
            else -> playerOpen = false
        }
        invalidate()
    }

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: WorldAssets) {
        val ambient = renderParameters.drawMode == DrawMode.AMBIENT
        val simple = ambient && Choices.value(context, AMB) == 1
        lastBounds = Rect(bounds)
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        val r = min(bounds.width(), bounds.height()) / 2f
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val t = zonedDateTime
        val loc = Locale.getDefault()
        val sc = SCREENS[Choices.index(context, SCREEN)].second
        lcdBg = sc.top
        // El punto «estás aquí» late suave: se redibuja más seguido solo mientras se mira
        interactiveDrawModeUpdateDelayMillis = if (playerOpen) 1000L else 200L
        val ink = sc.ink
        val ghost = a(ink, 22)
        val grey = Color.rgb(150, 150, 155)
        val is24 = DateFormat.is24HourFormat(context)
        val h = if (is24) "%02d".format(t.hour) else (if (t.hour % 12 == 0) 12 else t.hour % 12).toString().padStart(2, ' ')
        Lcd.skew = -0.06f
        canvas.drawColor(Color.BLACK)
        fill.color = Choices.value(context, BACK)
        canvas.drawCircle(cx, cy, r, fill)

        // El reproductor se cierra solo (sin usarlo 90 s, o al bajar el brillo)
        if (playerOpen && (ambient || System.currentTimeMillis() - playerUsedAt > 90_000)) playerOpen = false
        if (playerOpen) return renderPlayer(canvas, cx, cy, r, t, h, sc)

        if (simple) {
            // Bajo consumo mínimo: solo la hora en una pantallita tenue
            val box = RectF(X(-0.62f), Y(-0.16f), X(0.62f), Y(0.16f))
            lcd(canvas, box, r, sc, true)
            Lcd.number(canvas, "$h:${"%02d".format(t.minute)}", X(0.52f), Y(-0.11f), r * 0.17f, r * 0.22f, r * 0.05f, 4, a(ink, 200), 0)
            return
        }

        // ===== Accesos de arriba y el clima =====
        val showShorts = Choices.value(context, SHORTS) == 0
        for ((i, sp) in Config.spots.take(2).withIndex()) {
            fill.color = Color.rgb(78, 78, 82)
            canvas.drawCircle(X(sp.x), Y(sp.y), r * 0.072f, fill)
            if (showShorts) Shortcuts.draw(canvas, context, Shortcuts.get(context, i, sp), X(sp.x), Y(sp.y), r * 0.042f, Color.rgb(230, 230, 230), ambient)
        }
        val wBox = RectF(X(-0.28f), Y(-0.84f), X(0.26f), Y(-0.67f))
        lcd(canvas, wBox, r, sc, false)
        val wIcon = weatherIcon()
        if (wIcon != null) {
            val s = (r * 0.055f).toInt()
            wIcon.setBounds((X(-0.18f) - s).toInt(), (Y(-0.755f) - s).toInt(), (X(-0.18f) + s).toInt(), (Y(-0.755f) + s).toInt())
            wIcon.setTint(ink)
            wIcon.draw(canvas)
        } else drawCloud(canvas, X(-0.18f), Y(-0.755f), r * 0.05f, ink)
        val temp = complications.textOf(WEATHER, context.resources)?.filter { it.isDigit() || it == '-' }.orEmpty()
        Lcd.number(canvas, temp.ifEmpty { "--" }, X(0.135f), Y(-0.815f), r * 0.055f, r * 0.115f, r * 0.018f, 3, ink, ghost)
        stroke.color = ink
        stroke.strokeWidth = r * 0.011f
        canvas.drawCircle(X(0.17f), Y(-0.80f), r * 0.015f, stroke)

        // ===== Evento con la fase de la luna =====
        val pill = RectF(X(-0.76f), Y(-0.64f), X(0.69f), Y(-0.51f))
        stroke.color = Color.rgb(96, 96, 100)
        stroke.strokeWidth = r * 0.011f
        fill.color = Color.rgb(14, 14, 15)
        canvas.drawRoundRect(pill, r * 0.065f, r * 0.065f, fill)
        canvas.drawRoundRect(pill, r * 0.065f, r * 0.065f, stroke)
        drawMoon(canvas, X(-0.685f), Y(-0.575f), r * 0.048f, t)
        val ev = complications.textOf(EVENT, context.resources)
        val evTitle = complications.titleOf(EVENT, context.resources)
        val line = when {
            ev == null -> "SIN EVENTOS PRÓXIMOS"
            evTitle != null -> "$evTitle: $ev"
            else -> ev
        }.uppercase(loc)
        write(canvas, line, X(0.0f), Y(-0.553f), r * 0.062f, Color.rgb(210, 210, 210), medium, Paint.Align.CENTER, maxW = r * 1.18f)

        // ===== Panel central: hora, fecha, mapa y reloj de agujas =====
        panel(canvas, RectF(X(-0.88f), Y(-0.47f), X(0.85f), Y(0.39f)), r * 0.07f, r, Color.rgb(14, 14, 15))
        // Rótulos (bien visibles, como la foto)
        val ls = r * 0.05f
        val label = Color.rgb(210, 210, 214)
        write(canvas, "H", X(-0.69f), Y(-0.378f), ls, label, condensed, Paint.Align.CENTER)
        write(canvas, "MIN", X(-0.37f), Y(-0.378f), ls, label, condensed, Paint.Align.CENTER)
        write(canvas, "SEG", X(-0.04f), Y(-0.378f), ls, label, condensed, Paint.Align.CENTER)
        write(canvas, "DÍA - DD - MES", X(0.495f), Y(-0.378f), ls, label, condensed, Paint.Align.CENTER)
        // Hora con segundos
        val tBox = RectF(X(-0.82f), Y(-0.355f), X(0.14f), Y(-0.11f))
        lcd(canvas, tBox, r, sc, false)
        // En bajo consumo los segundos quedan en 00 (no se borran) y vuelven a correr al encender
        val sec = if (ambient) "00" else "%02d".format(t.second)
        // En pares (HH · MM · SS), como en la foto: juntos dentro del par y más aire en los dos puntos
        val dw = r * 0.095f
        val dh = r * 0.19f
        val inGap = r * 0.024f
        val colonGap = r * 0.066f
        val total = 3 * (2 * dw + inGap) + 2 * colonGap
        var dx = tBox.centerX() - total / 2
        val dy = Y(-0.33f)
        for ((i, pair) in listOf(h, "%02d".format(t.minute), sec).withIndex()) {
            Lcd.digit(canvas, pair[0], dx, dy, dw, dh, ink, ghost)
            Lcd.digit(canvas, pair[1], dx + dw + inGap, dy, dw, dh, ink, ghost)
            dx += 2 * dw + inGap
            if (i < 2) {
                Lcd.colon(canvas, dx + colonGap / 2, dy, dh, r * 0.016f, ink)
                dx += colonGap
            }
        }
        // Fecha: DÍA-DD-MES
        val dBox = RectF(X(0.21f), Y(-0.35f), X(0.78f), Y(-0.19f))
        lcd(canvas, dBox, r, sc, false)
        val dow = plain(t.dayOfWeek.getDisplayName(TextStyle.SHORT, loc)).filter { it.isLetter() }.take(3)
        val mon = plain(t.month.getDisplayName(TextStyle.SHORT, loc)).filter { it.isLetter() }.take(3)
        val date = "$dow-${"%02d".format(t.dayOfMonth)}-$mon"
        val lw = r * 0.041f
        val lg = r * 0.01f
        Lcd.text14(canvas, date, dBox.centerX() - Lcd.text14Width(date, lw, lg) / 2, Y(-0.315f), lw, r * 0.09f, lg, ink, ghost)
        // Mapa del mundo con la noche
        val mBox = RectF(X(-0.82f), Y(-0.045f), X(0.14f), Y(0.35f))
        lcd(canvas, mBox, r, sc, false)
        val inner = RectF(mBox.left + r * 0.03f, mBox.top + r * 0.025f, mBox.right - r * 0.03f, mBox.bottom - r * 0.025f)
        drawMap(canvas, inner, r, t, ink, ambient)
        // Reloj de agujas (tocarlo abre el reproductor)
        drawDial(canvas, X(0.495f), Y(0.085f), r * 0.265f, r, t, ambient)

        // ===== Pasos y ritmo =====
        panel(canvas, RectF(X(-0.70f), Y(0.44f), X(0.67f), Y(0.69f)), r * 0.05f, r, Color.rgb(14, 14, 15))
        vertical(canvas, "PASOS", X(-0.645f), Y(0.567f), r * 0.042f, grey)
        val sBox = RectF(X(-0.585f), Y(0.49f), X(-0.09f), Y(0.645f))
        lcd(canvas, sBox, r, sc, false)
        val steps = complications.textOf(STEPS, context.resources)?.filter { it.isDigit() } ?: ""
        Lcd.number(canvas, steps.takeLast(5).ifEmpty { "--" }, X(-0.12f), Y(0.515f), r * 0.068f, r * 0.105f, r * 0.02f, 5, ink, ghost)
        vertical(canvas, "FC", X(-0.035f), Y(0.567f), r * 0.042f, grey)
        val hBox = RectF(X(0.02f), Y(0.49f), X(0.56f), Y(0.645f))
        lcd(canvas, hBox, r, sc, false)
        drawPixelHeart(canvas, X(0.07f), Y(0.523f), r * 0.0105f, ink)
        val hrTxt = complications.textOf(HEART, context.resources)?.filter { it.isDigit() }?.takeIf { it.isNotEmpty() }
            ?: heart.bpm.takeIf { it > 0 }?.toString() ?: "--"
        Lcd.number(canvas, hrTxt.takeLast(3), X(0.53f), Y(0.515f), r * 0.068f, r * 0.105f, r * 0.02f, 3, ink, ghost)
        vertical(canvas, "LPM", X(0.615f), Y(0.567f), r * 0.042f, grey)

        // ===== Tornillos, batería y los puntitos de los costados =====
        for (sx in listOf(-0.47f, 0.44f)) drawScrew(canvas, X(sx), Y(0.745f), r * 0.022f)
        drawBolt(canvas, X(-0.27f), Y(0.815f), r * 0.04f, grey)
        val bBox = RectF(X(-0.21f), Y(0.75f), X(0.18f), Y(0.88f))
        lcd(canvas, bBox, r, sc, false)
        val pct = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        Lcd.number(canvas, if (pct >= 0) pct.toString() else "--", X(0.07f), Y(0.77f), r * 0.052f, r * 0.09f, r * 0.016f, 3, ink, ghost)
        write(canvas, "%", X(0.085f), Y(0.855f), r * 0.085f, ink, bold, Paint.Align.LEFT)
        vertical(canvas, "BAT", X(0.245f), Y(0.815f), r * 0.042f, grey)
        stroke.color = Color.rgb(110, 110, 115)
        stroke.strokeWidth = r * 0.007f
        canvas.drawCircle(X(-0.95f), cy, r * 0.018f, stroke)
        canvas.drawCircle(X(0.93f), cy, r * 0.018f, stroke)

        // Siempre activa: la esfera completa, más tenue
        if (ambient) canvas.drawColor(Color.argb(165, 0, 0, 0))
    }

    // ===== Mapa: tocarlo cambia lo que muestra =====
    private val MAP_MODES = listOf("NOCHE", "SOL Y LUNA", "CIUDADES", "TU DÍA")
    private fun mapMode() = context.getSharedPreferences("mundo_lugar", Context.MODE_PRIVATE).getInt("modo", 0).coerceIn(0, MAP_MODES.size - 1)
    private var mapShownAt = 0L

    private fun mapBox(b: Rect): RectF {
        val r = min(b.width(), b.height()) / 2f
        val cx = b.exactCenterX()
        val cy = b.exactCenterY()
        return RectF(cx - 0.82f * r, cy - 0.045f * r, cx + 0.14f * r, cy + 0.35f * r)
    }

    fun onMap(x: Int, y: Int) = !lastBounds.isEmpty && mapBox(lastBounds).contains(x.toFloat(), y.toFloat())

    fun mapTap() {
        // La primera vez se pide la ubicación (para el punto «estás aquí»); después cambia de mapa
        if (!Here.allowed(context) && !Here.asked(context)) {
            Here.markAsked(context)
            runCatching { context.startActivity(android.content.Intent(context, AskLocationActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
            return
        }
        val p = context.getSharedPreferences("mundo_lugar", Context.MODE_PRIVATE)
        p.edit().putInt("modo", (mapMode() + 1) % MAP_MODES.size).apply()
        mapShownAt = System.currentTimeMillis()
        invalidate()
    }

    private fun drawMap(canvas: Canvas, box: RectF, r: Float, t: ZonedDateTime, ink: Int, ambient: Boolean) {
        val mode = mapMode()
        val land = a(ink, 150)
        val showNight = Choices.value(context, NIGHT) == 0
        when (mode) {
            1 -> WorldMap.draw(canvas, box, land, a(ink, 46), t, fill, dusk = a(ink, 22))
            2 -> WorldMap.draw(canvas, box, a(ink, 110), if (showNight) a(ink, 26) else 0, t, fill)
            3 -> WorldMap.draw(canvas, box, a(ink, 90), if (showNight) a(ink, 26) else 0, t, fill)
            else -> WorldMap.draw(canvas, box, land, if (showNight) a(ink, 38) else 0, t, fill)
        }
        canvas.save()
        canvas.clipRect(box)
        val (lat, lon, real) = Here.where(context, t)
        val hx = WorldMap.px(box, lon.toFloat())
        val hy = WorldMap.py(box, lat.toFloat())
        val small = r * 0.042f
        when (mode) {
            1 -> {
                // Sol (donde está a pleno mediodía) y luna (donde está justo encima)
                val (decl, sunLon) = WorldMap.sun(t)
                val sx = WorldMap.px(box, sunLon.toFloat())
                val sy = WorldMap.py(box, decl.toFloat())
                stroke.color = ink
                stroke.strokeWidth = r * 0.007f
                for (k in 0 until 8) {
                    val an = Math.toRadians(k * 45.0).toFloat()
                    canvas.drawLine(sx + cos(an) * r * 0.028f, sy + sin(an) * r * 0.028f, sx + cos(an) * r * 0.042f, sy + sin(an) * r * 0.042f, stroke)
                }
                fill.color = ink
                canvas.drawCircle(sx, sy, r * 0.02f, fill)
                val (mLat, mLon) = WorldMap.moon(t)
                val mx = WorldMap.px(box, mLon.toFloat())
                val my = WorldMap.py(box, mLat.toFloat())
                path.reset()
                path.addCircle(mx, my, r * 0.024f, Path.Direction.CW)
                path.op(Path().apply { addCircle(mx + r * 0.012f, my - r * 0.008f, r * 0.022f, Path.Direction.CW) }, Path.Op.DIFFERENCE)
                canvas.drawPath(path, fill)
            }
            2 -> {
                // Reloj mundial: la hora en otras ciudades
                for ((name, la, lo, zone, place) in CITIES) {
                    val cx = WorldMap.px(box, lo)
                    val cy = WorldMap.py(box, la)
                    fill.color = ink
                    canvas.drawCircle(cx, cy, r * 0.011f, fill)
                    val local = t.withZoneSameInstant(java.time.ZoneId.of(zone))
                    val hh = if (DateFormat.is24HourFormat(context)) "%02d".format(local.hour) else (if (local.hour % 12 == 0) 12 else local.hour % 12).toString()
                    // Cada rótulo a un lado fijo para que no se tapen
                    val left = place[0] == 'L'
                    val ly = when (place[1]) { 'U' -> cy - r * 0.022f; 'D' -> cy + r * 0.05f; else -> cy + small * 0.35f }
                    write(canvas, "$name $hh:${"%02d".format(local.minute)}", if (left) cx - r * 0.02f else cx + r * 0.02f, ly, small, ink, bold, if (left) Paint.Align.RIGHT else Paint.Align.LEFT)
                }
            }
            3 -> {
                // Tu día: salida y puesta del sol donde estás, y cuánta luz queda
                val times = WorldMap.sunTimes(t, lat, lon)
                val zone = t.zone
                fun hm(h: Double): String {
                    val base = t.withZoneSameInstant(java.time.ZoneOffset.UTC).toLocalDate().atStartOfDay(java.time.ZoneOffset.UTC)
                    val z = base.plusSeconds((h * 3600).toLong()).withZoneSameInstant(zone)
                    return "%02d:%02d".format(z.hour, z.minute)
                }
                val cxm = box.centerX()
                fill.color = Color.argb(170, Color.red(lcdBg), Color.green(lcdBg), Color.blue(lcdBg))
                canvas.drawRoundRect(RectF(box.left + r * 0.04f, box.top + r * 0.035f, box.right - r * 0.04f, box.top + r * 0.20f), r * 0.03f, r * 0.03f, fill)
                if (times != null) {
                    val (rise, set) = times
                    write(canvas, "SALE ${hm(rise)} · SE PONE ${hm(set)}", cxm, box.top + r * 0.095f, r * 0.055f, ink, bold, Paint.Align.CENTER)
                    val len = set - rise
                    val nowUtc = t.withZoneSameInstant(java.time.ZoneOffset.UTC).let { it.hour + it.minute / 60.0 }
                    val left = ((set - nowUtc) % 24 + 24) % 24
                    val info = if (nowUtc in rise..set || left < len) "LUZ ${"%dh %02dm".format(len.toInt(), ((len % 1) * 60).toInt())} · QUEDAN ${"%dh %02dm".format(left.toInt(), ((left % 1) * 60).toInt())}"
                        else "LUZ ${"%dh %02dm".format(len.toInt(), ((len % 1) * 60).toInt())} · ES DE NOCHE"
                    write(canvas, info, cxm, box.top + r * 0.165f, r * 0.042f, a(ink, 210), medium, Paint.Align.CENTER, maxW = box.width() - r * 0.1f)
                } else write(canvas, "SOL TODO EL DÍA O TODA LA NOCHE", cxm, box.top + r * 0.12f, r * 0.042f, ink, bold, Paint.Align.CENTER)
            }
        }
        // Estás aquí: punto que late suave (en bajo consumo, quieto)
        val phase = if (ambient) 0f else (System.currentTimeMillis() % 2000L) / 2000f
        if (!ambient) {
            stroke.color = a(ink, (150 * (1f - phase)).toInt())
            stroke.strokeWidth = r * 0.006f
            canvas.drawCircle(hx, hy, r * (0.014f + phase * 0.035f), stroke)
        }
        fill.color = ink
        canvas.drawCircle(hx, hy, r * 0.013f, fill)
        fill.color = lcdBg
        canvas.drawCircle(hx, hy, r * 0.005f, fill)
        canvas.restore()
        // Qué muestra (abajo a la izquierda del mapa) y si el punto es la ubicación real o tu zona horaria
        val tag = MAP_MODES[mode] + if (!real && mode != 2) " · ZONA" else ""
        write(canvas, tag, box.left + r * 0.01f, box.bottom - r * 0.012f, r * 0.036f, a(ink, 200), bold, Paint.Align.LEFT)
    }

    /** Color de fondo de las pantallitas (para el centro del punto) */
    private var lcdBg = Color.WHITE

    /** Ciudad del reloj mundial; place: lado del rótulo (L/R izquierda o derecha, U/D/M arriba, abajo o al medio) */
    private data class City(val name: String, val lat: Float, val lon: Float, val zone: String, val place: String)
    private val CITIES = listOf(
        City("LA", 34.0f, -118.2f, "America/Los_Angeles", "RD"),
        City("NY", 40.7f, -74.0f, "America/New_York", "LU"),
        City("LON", 51.5f, -0.1f, "Europe/London", "RU"),
        City("TYO", 35.7f, 139.7f, "Asia/Tokyo", "LD"),
        City("SYD", -33.9f, 151.2f, "Australia/Sydney", "LM"),
    )

    /** Pantalla del reproductor: hora, lo que suena, avance y botones ◄◄ ►‖ ►► (otro toque cierra) */
    private fun renderPlayer(canvas: Canvas, cx: Float, cy: Float, r: Float, t: ZonedDateTime, h: String, sc: Screen) {
        fun X(v: Float) = cx + v * r
        fun Y(v: Float) = cy + v * r
        val ink = sc.ink
        val ghost = a(ink, 22)
        val s = PhoneNow.current()
        // ✕ para cerrar
        fill.color = Color.rgb(60, 60, 64)
        canvas.drawCircle(X(0f), Y(-0.78f), r * 0.07f, fill)
        stroke.color = Color.WHITE
        stroke.strokeWidth = r * 0.012f
        canvas.drawLine(X(-0.025f), Y(-0.805f), X(0.025f), Y(-0.755f), stroke)
        canvas.drawLine(X(0.025f), Y(-0.805f), X(-0.025f), Y(-0.755f), stroke)
        // Pantalla grande
        val box = RectF(X(-0.80f), Y(-0.62f), X(0.80f), Y(0.62f))
        panel(canvas, RectF(box.left - r * 0.03f, box.top - r * 0.03f, box.right + r * 0.03f, box.bottom + r * 0.03f), r * 0.10f, r, Color.rgb(14, 14, 15))
        fill.shader = LinearGradient(0f, box.top, 0f, box.bottom, sc.top, sc.bottom, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(box, r * 0.08f, r * 0.08f, fill)
        fill.shader = null
        // Reproductor y hora
        val app = if (PhoneNow.state?.from == "cl.carlospnauto.app") "PULSOMEDIA" else "PULSOMUSIC"
        Lcd.text14(canvas, app, X(-0.68f), Y(-0.52f), r * 0.032f, r * 0.065f, r * 0.009f, ink, ghost)
        if (s != null && s.volume >= 0) write(canvas, "VOL ${s.volume}", X(-0.68f), Y(-0.34f), r * 0.05f, a(ink, 190), medium, Paint.Align.LEFT)
        Lcd.number(canvas, "$h:${"%02d".format(t.minute)}", X(0.70f), Y(-0.54f), r * 0.085f, r * 0.17f, r * 0.03f, 4, ink, ghost)
        // Canción
        write(canvas, (s?.title ?: "Sin música").uppercase(), X(0f), Y(-0.11f), r * 0.095f, ink, bold, Paint.Align.CENTER, maxW = r * 1.40f)
        write(canvas, if (s == null) "Toca ► para reanudar en el teléfono" else s.artist, X(0f), Y(0.0f), r * 0.062f, a(ink, 190), medium, Paint.Align.CENTER, maxW = r * 1.36f)
        // Avance
        val p = if (s != null && s.durationMs > 0) (s.position().toFloat() / s.durationMs).coerceIn(0f, 1f) else 0f
        stroke.strokeWidth = r * 0.022f
        stroke.color = a(ink, 45)
        canvas.drawLine(X(-0.64f), Y(0.12f), X(0.64f), Y(0.12f), stroke)
        if (p > 0f) {
            stroke.color = ink
            canvas.drawLine(X(-0.64f), Y(0.12f), X(-0.64f) + r * 1.28f * p, Y(0.12f), stroke)
        }
        fun mmss(ms: Long) = "%d:%02d".format(ms / 60000, (ms / 1000) % 60)
        if (s != null && s.durationMs > 0) {
            write(canvas, mmss(s.position()), X(-0.64f), Y(0.22f), r * 0.05f, a(ink, 190), medium, Paint.Align.LEFT)
            write(canvas, mmss(s.durationMs), X(0.64f), Y(0.22f), r * 0.05f, a(ink, 190), medium, Paint.Align.RIGHT)
        }
        // Botones
        for (k in 0..2) {
            val z = zone(cx, cy, r, k)
            fill.color = ink
            canvas.drawRoundRect(z, r * 0.04f, r * 0.04f, fill)
            fill.color = sc.top
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
        write(canvas, "Toca fuera de los botones para volver", X(0f), Y(0.76f), r * 0.045f, Color.rgb(140, 140, 145), medium, Paint.Align.CENTER)
    }

    private fun drawDial(canvas: Canvas, x: Float, y: Float, rad: Float, r: Float, t: ZonedDateTime, ambient: Boolean) {
        fill.color = Color.rgb(6, 6, 7)
        canvas.drawCircle(x, y, rad, fill)
        stroke.color = Color.rgb(70, 70, 74)
        stroke.strokeWidth = r * 0.008f
        canvas.drawCircle(x, y, rad, stroke)
        for (m in 0 until 60) {
            val ang = Math.toRadians(m * 6.0 - 90).toFloat()
            val major = m % 5 == 0
            stroke.color = Color.rgb(220, 220, 220)
            stroke.strokeWidth = r * (if (major) 0.012f else 0.005f)
            val r0 = if (major) 0.80f else 0.87f
            canvas.drawLine(x + cos(ang) * rad * r0, y + sin(ang) * rad * r0, x + cos(ang) * rad * 0.94f, y + sin(ang) * rad * 0.94f, stroke)
        }
        for (k in 1..12) {
            val ang = Math.toRadians(k * 30.0 - 90).toFloat()
            canvas.save()
            canvas.rotate(k * 30f, x + cos(ang) * rad * 0.66f, y + sin(ang) * rad * 0.66f)
            write(canvas, "$k", x + cos(ang) * rad * 0.66f, y + sin(ang) * rad * 0.66f + rad * 0.06f, rad * 0.16f, Color.WHITE, bold, Paint.Align.CENTER)
            canvas.restore()
        }
        val min = t.minute + t.second / 60f
        val hour = (t.hour % 12) + min / 60f
        fun hand(deg: Float, len: Float, w: Float, color: Int) {
            val ang = Math.toRadians(deg - 90.0).toFloat()
            stroke.color = color
            stroke.strokeWidth = w
            canvas.drawLine(x, y, x + cos(ang) * len, y + sin(ang) * len, stroke)
        }
        hand(hour * 30f, rad * 0.50f, r * 0.02f, Color.WHITE)
        hand(min * 6f, rad * 0.74f, r * 0.016f, Color.rgb(230, 30, 40))
        fill.color = Color.rgb(230, 30, 40)
        canvas.drawCircle(x, y, r * 0.02f, fill)
        fill.color = Color.rgb(20, 20, 20)
        canvas.drawCircle(x, y, r * 0.008f, fill)
    }

    /** Fase de la luna (ciclo de 29,53 días desde una luna nueva conocida) */
    private fun drawMoon(canvas: Canvas, x: Float, y: Float, s: Float, t: ZonedDateTime) {
        val days = (t.toEpochSecond() - 947182440L) / 86400.0
        val phase = ((days % 29.530588) + 29.530588) % 29.530588 / 29.530588
        // Luna iluminada y su sombra corrida según la fase (luna nueva: toda en sombra)
        canvas.save()
        path.reset()
        path.addCircle(x, y, s, Path.Direction.CW)
        canvas.clipPath(path)
        fill.color = Color.rgb(225, 225, 225)
        canvas.drawCircle(x, y, s, fill)
        fill.color = Color.rgb(24, 24, 26)
        val off = if (phase < 0.5) -s * 4f * phase.toFloat() else s * 4f * (1f - phase.toFloat())
        canvas.drawCircle(x + off, y, s * 1.02f, fill)
        canvas.restore()
        stroke.color = Color.rgb(200, 200, 200)
        stroke.strokeWidth = s * 0.12f
        canvas.drawCircle(x, y, s, stroke)
    }

    private fun drawCloud(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        canvas.drawCircle(x - s * 0.5f, y + s * 0.15f, s * 0.55f, fill)
        canvas.drawCircle(x + s * 0.15f, y - s * 0.2f, s * 0.7f, fill)
        canvas.drawCircle(x + s * 0.75f, y + s * 0.2f, s * 0.5f, fill)
        canvas.drawRoundRect(RectF(x - s * 1.0f, y + s * 0.1f, x + s * 1.2f, y + s * 0.7f), s * 0.3f, s * 0.3f, fill)
    }

    private val HEART_PX = listOf(".##.##.", "#######", "#######", ".#####.", "..###..", "...#...")

    private fun drawPixelHeart(canvas: Canvas, x: Float, y: Float, p: Float, color: Int) {
        fill.color = color
        for ((j, row) in HEART_PX.withIndex()) for ((i, ch) in row.withIndex()) {
            if (ch == '#') canvas.drawRect(x + i * p, y + j * p * 1.2f, x + (i + 1) * p, y + (j + 1) * p * 1.2f, fill)
        }
    }

    private fun drawScrew(canvas: Canvas, x: Float, y: Float, s: Float) {
        fill.color = Color.rgb(90, 90, 94)
        canvas.drawCircle(x, y, s, fill)
        stroke.color = Color.rgb(30, 30, 32)
        stroke.strokeWidth = s * 0.3f
        canvas.drawLine(x - s * 0.6f, y + s * 0.6f, x + s * 0.6f, y - s * 0.6f, stroke)
    }

    private fun drawBolt(canvas: Canvas, x: Float, y: Float, s: Float, color: Int) {
        fill.color = color
        path.reset()
        path.moveTo(x + s * 0.3f, y - s)
        path.lineTo(x - s * 0.5f, y + s * 0.15f)
        path.lineTo(x - s * 0.05f, y + s * 0.15f)
        path.lineTo(x - s * 0.3f, y + s)
        path.lineTo(x + s * 0.5f, y - s * 0.2f)
        path.lineTo(x + s * 0.05f, y - s * 0.2f)
        path.close()
        canvas.drawPath(path, fill)
    }

    private var wIconKey: Any? = null
    private var wIconDrawable: android.graphics.drawable.Drawable? = null

    private fun weatherIcon(): android.graphics.drawable.Drawable? {
        val d = complications.complicationSlots[WEATHER]?.complicationData?.value
        val icon = when (d) {
            is ShortTextComplicationData -> d.monochromaticImage?.image ?: d.smallImage?.image
            is RangedValueComplicationData -> d.monochromaticImage?.image ?: d.smallImage?.image
            else -> null
        }
        if (icon !== wIconKey) {
            wIconKey = icon
            wIconDrawable = runCatching { icon?.loadDrawable(context)?.mutate() }.getOrNull()
        }
        return wIconDrawable
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: WorldAssets) {
        renderParameters.highlightLayer?.let { canvas.drawColor(it.backgroundTint) }
        for ((_, slot) in complications.complicationSlots) {
            if (slot.enabled) slot.renderHighlightLayer(canvas, zonedDateTime, renderParameters)
        }
    }
}
