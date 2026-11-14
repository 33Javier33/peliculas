package cl.carlospnauto.esfera

import android.graphics.Canvas
import android.graphics.CornerPathEffect
import android.graphics.Paint
import android.graphics.Path

/**
 * Números cuadrados de la esfera Táctica: trazos gruesos rectos con las esquinas apenas
 * redondeadas (como los de la foto), en vez de las letras redondas del sistema.
 */
object SquareDigits {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.BUTT
        strokeJoin = Paint.Join.MITER
    }
    private val path = Path()

    // Cada número: trazos sobre una caja de 0..1 (x) por 0..1 (y). L = izquierda, R = derecha,
    // T = arriba, B = abajo, M = medio (se ajustan al grosor del trazo al dibujar)
    private const val L = -1f
    private const val R = -2f
    private const val T = -3f
    private const val B = -4f
    private const val M = -5f

    private val SHAPES: Map<Char, List<FloatArray>> = mapOf(
        '0' to listOf(floatArrayOf(L, T, R, T, R, B, L, B, L, T)),
        '1' to listOf(floatArrayOf(0.12f, 0.24f, 0.62f, T, 0.62f, B)),
        '2' to listOf(floatArrayOf(L, T, R, T, R, M, L, M, L, B, R, B)),
        '3' to listOf(floatArrayOf(L, T, R, T, R, B, L, B), floatArrayOf(0.30f, M, R, M)),
        '4' to listOf(floatArrayOf(L, T, L, 0.60f, R, 0.60f), floatArrayOf(R, T, R, B)),
        '5' to listOf(floatArrayOf(R, T, L, T, L, M, R, M, R, B, L, B)),
        '6' to listOf(floatArrayOf(R, T, L, T, L, B, R, B, R, M, L, M)),
        '7' to listOf(floatArrayOf(L, 0.24f, L, T, R, T, R, 0.40f, 0.62f, B)),
        '8' to listOf(floatArrayOf(L, T, R, T, R, B, L, B, L, T), floatArrayOf(L, M, R, M)),
        '9' to listOf(floatArrayOf(R, M, L, M, L, T, R, T, R, B, L, B)),
    )

    /** Ancho de un número ('1' es más angosto) */
    private fun width(c: Char, w: Float) = if (c == '1') w * 0.68f else w

    fun totalWidth(s: String, w: Float, gap: Float): Float {
        var total = 0f
        for ((i, c) in s.withIndex()) { total += width(c, w); if (i < s.length - 1) total += gap }
        return total
    }

    /** Dibuja s con la caja de cada número de w × h; x es el borde izquierdo (o derecho con alignRight) */
    fun draw(canvas: Canvas, s: String, x: Float, top: Float, w: Float, h: Float, thick: Float, gap: Float, color: Int, alignRight: Boolean) {
        paint.color = color
        paint.strokeWidth = thick
        paint.pathEffect = CornerPathEffect(thick * 0.45f)
        var cx = if (alignRight) x - totalWidth(s, w, gap) else x
        for (c in s) {
            val cw = width(c, w)
            val shape = SHAPES[c]
            if (shape != null) {
                val half = thick / 2
                fun px(v: Float) = when (v) {
                    L -> cx + half
                    R -> cx + cw - half
                    else -> cx + v * cw
                }
                fun py(v: Float) = when (v) {
                    T -> top + half
                    B -> top + h - half
                    M -> top + h / 2
                    else -> top + v * h
                }
                for (stroke in shape) {
                    // El 0 y el 8 son un cuadro cerrado (último punto = primero)
                    val closed = stroke.size > 4 && stroke[0] == stroke[stroke.size - 2] && stroke[1] == stroke[stroke.size - 1]
                    val end = if (closed) stroke.size - 2 else stroke.size
                    path.reset()
                    path.moveTo(px(stroke[0]), py(stroke[1]))
                    var k = 2
                    while (k < end) { path.lineTo(px(stroke[k]), py(stroke[k + 1])); k += 2 }
                    if (closed) path.close()
                    canvas.drawPath(path, paint)
                }
            }
            cx += cw + gap
        }
        paint.pathEffect = null
    }
}
