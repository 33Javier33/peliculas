package cl.carlospnauto.esfera.comun

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.provider.AlarmClock
import android.provider.Settings
import android.widget.Toast
import kotlin.math.hypot
import kotlin.math.min

/** Qué abre un acceso directo de la esfera */
enum class Action(val id: String, val label: String) {
    MEDIA("media", "PulsoMedia"),
    MUSIC("music", "PulsoMusic"),
    ALARMS("alarms", "Alarmas"),
    TIMER("timer", "Temporizador"),
    SETTINGS("settings", "Ajustes"),
    BATTERY("battery", "Batería"),
    NONE("none", "Nada"),
}

/** Lugar de un acceso: x, y desde el centro en fracciones del radio; name para Personalizar; hit: radio de toque propio */
data class Spot(val x: Float, val y: Float, val default: Action, val name: String, val hit: Float = 0f)

/** Opción de color (u otra) que se elige en Personalizar: nombre y valor de cada opción */
data class Choice(val key: String, val name: String, val options: List<Pair<String, Int>>, val default: Int = 0)

object Choices {
    fun index(c: Context, ch: Choice) = FacePrefs.of(c).getInt("opt_${ch.key}", ch.default).coerceIn(0, ch.options.size - 1)
    fun value(c: Context, ch: Choice) = ch.options[index(c, ch)].second
    fun next(c: Context, ch: Choice) = FacePrefs.of(c).edit().putInt("opt_${ch.key}", (index(c, ch) + 1) % ch.options.size).apply()
}

/** Lo que cada esfera le cuenta a Personalizar */
interface FaceConfig {
    /** Círculos de datos: id y nombre */
    val slots: List<Pair<Int, String>>
    /** Accesos directos */
    val spots: List<Spot>
    /** ¿Tiene brújula para activar? */
    val compass: Boolean get() = false
    /** Colores y otras opciones */
    val choices: List<Choice> get() = emptyList()
    /** ¿Lee el ritmo cardíaco del sensor? (Personalizar pide el permiso) */
    val heartRate: Boolean get() = false
}

object FacePrefs {
    const val FILE = "esfera"
    const val COMPASS = "compass"
    fun of(c: Context) = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)
}

object Shortcuts {
    private const val MEDIA_PKG = "cl.carlospnauto.app"
    private const val MUSIC_PKG = "cl.carlospnauto.music"

    fun get(c: Context, index: Int, spot: Spot): Action {
        val id = FacePrefs.of(c).getString("atajo_$index", null)
        return Action.entries.firstOrNull { it.id == id } ?: spot.default
    }

    fun set(c: Context, index: Int, action: Action) = FacePrefs.of(c).edit().putString("atajo_$index", action.id).apply()

    /** El acceso tocado (o -1). Zona de toque generosa: el dedo tapa el ícono */
    fun hit(spots: List<Spot>, bounds: Rect, x: Int, y: Int, size: Float = 0.11f): Int {
        if (bounds.isEmpty) return -1
        val r = min(bounds.width(), bounds.height()) / 2f
        val cx = bounds.exactCenterX()
        val cy = bounds.exactCenterY()
        var best = -1
        var bestD = Float.MAX_VALUE
        for ((i, s) in spots.withIndex()) {
            val d = hypot(x - (cx + s.x * r), y - (cy + s.y * r))
            val lim = if (s.hit > 0f) s.hit else size
            if (d < r * lim && d < bestD) { best = i; bestD = d }
        }
        return best
    }

    /** Abre el acceso tocado. Devuelve false si es «Nada» (el toque no hace nada) */
    fun open(c: Context, index: Int, spot: Spot): Boolean {
        val action = get(c, index, spot)
        val intent = when (action) {
            Action.MEDIA -> c.packageManager.getLaunchIntentForPackage(MEDIA_PKG)
            Action.MUSIC -> c.packageManager.getLaunchIntentForPackage(MUSIC_PKG)
            Action.ALARMS -> Intent(AlarmClock.ACTION_SHOW_ALARMS)
            Action.TIMER -> Intent(AlarmClock.ACTION_SHOW_TIMERS)
            Action.SETTINGS -> Intent(Settings.ACTION_SETTINGS)
            Action.BATTERY -> Intent(Intent.ACTION_POWER_USAGE_SUMMARY)
            Action.NONE -> return false
        }
        if (intent == null) {
            Toast.makeText(c, "Instala ${action.label} en el reloj (App para el reloj)", Toast.LENGTH_LONG).show()
            return true
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { c.startActivity(intent) }.onFailure {
            Toast.makeText(c, "No se pudo abrir ${action.label}", Toast.LENGTH_SHORT).show()
        }
        return true
    }

    private var media: Bitmap? = null
    private var music: Bitmap? = null
    private val bmpPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val grey = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) })
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val path = Path()

    /** Dibuja el ícono del acceso (s = radio del ícono). tint: color de los íconos dibujados */
    fun draw(canvas: Canvas, c: Context, action: Action, x: Float, y: Float, s: Float, tint: Int, ambient: Boolean) {
        when (action) {
            Action.MEDIA, Action.MUSIC -> {
                val bmp = if (action == Action.MEDIA) {
                    media ?: BitmapFactory.decodeResource(c.resources, R.drawable.pulso_media).also { media = it }
                } else {
                    music ?: BitmapFactory.decodeResource(c.resources, R.drawable.pulso_music).also { music = it }
                }
                bmpPaint.colorFilter = if (ambient) grey else null
                bmpPaint.alpha = if (ambient) 150 else 255
                canvas.drawBitmap(bmp, null, RectF(x - s, y - s, x + s, y + s), bmpPaint)
            }
            Action.ALARMS -> {
                line.color = tint
                line.strokeWidth = s * 0.16f
                canvas.drawCircle(x, y + s * 0.08f, s * 0.62f, line)
                canvas.drawLine(x, y + s * 0.08f, x, y - s * 0.30f, line)
                canvas.drawLine(x, y + s * 0.08f, x + s * 0.28f, y + s * 0.22f, line)
                canvas.drawLine(x - s * 0.80f, y - s * 0.50f, x - s * 0.52f, y - s * 0.78f, line)
                canvas.drawLine(x + s * 0.80f, y - s * 0.50f, x + s * 0.52f, y - s * 0.78f, line)
            }
            Action.TIMER -> {
                line.color = tint
                line.strokeWidth = s * 0.15f
                path.reset()
                path.moveTo(x - s * 0.55f, y - s * 0.8f)
                path.lineTo(x + s * 0.55f, y - s * 0.8f)
                path.lineTo(x - s * 0.55f, y + s * 0.8f)
                path.lineTo(x + s * 0.55f, y + s * 0.8f)
                path.close()
                canvas.drawPath(path, line)
            }
            Action.SETTINGS -> {
                fill.color = tint
                for (k in 0 until 8) {
                    canvas.save()
                    canvas.rotate(k * 45f, x, y)
                    canvas.drawRect(x - s * 0.17f, y - s * 0.85f, x + s * 0.17f, y - s * 0.45f, fill)
                    canvas.restore()
                }
                line.color = tint
                line.strokeWidth = s * 0.28f
                canvas.drawCircle(x, y, s * 0.42f, line)
            }
            Action.BATTERY -> {
                line.color = tint
                line.strokeWidth = s * 0.15f
                canvas.drawRoundRect(RectF(x - s * 0.4f, y - s * 0.7f, x + s * 0.4f, y + s * 0.85f), s * 0.12f, s * 0.12f, line)
                fill.color = tint
                canvas.drawRect(x - s * 0.18f, y - s * 0.95f, x + s * 0.18f, y - s * 0.7f, fill)
                canvas.drawRect(x - s * 0.22f, y - s * 0.05f, x + s * 0.22f, y + s * 0.65f, fill)
            }
            Action.NONE -> {
                fill.color = tint
                fill.alpha = 110
                canvas.drawCircle(x, y, s * 0.14f, fill)
                fill.alpha = 255
            }
        }
    }

    /** Dibuja todos los accesos de una esfera */
    fun drawAll(canvas: Canvas, c: Context, spots: List<Spot>, cx: Float, cy: Float, r: Float, s: Float, tint: Int, ambient: Boolean) {
        for ((i, spot) in spots.withIndex()) draw(canvas, c, get(c, i, spot), cx + spot.x * r, cy + spot.y * r, s, tint, ambient)
    }
}

/** Marca: Carlos P. Nauto Interactive */
object Brand {
    const val NAME = "CARLOS P. NAUTO INTERACTIVE"
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        letterSpacing = 0.12f
        typeface = android.graphics.Typeface.create("sans-serif-condensed", android.graphics.Typeface.BOLD)
    }

    fun draw(canvas: Canvas, x: Float, y: Float, size: Float, color: Int, text: String = NAME) {
        paint.textSize = size
        paint.color = color
        canvas.drawText(text, x, y, paint)
    }
}
