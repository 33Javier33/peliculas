package cl.carlospnauto.esfera

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF

/**
 * Números de la hora de la esfera Clásica, dibujados con trazo delgado y todos del mismo ancho
 * (tipografía técnica monoespaciada, como la foto): el 1 con su pestaña y su base, y el 0 con una raya
 * en medio. Se dibujan a mano para que se vean iguales en todos los relojes.
 */
object ThinDigits {
    /** Ancho de cada número y espacio entre números, en proporción a la altura */
    const val WIDTH = 0.58f
    const val GAP = 0.10f

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val path = Path()

    fun width(s: String, h: Float) = s.length * h * WIDTH + (s.length - 1).coerceAtLeast(0) * h * GAP

    /** Dibuja s con la esquina de arriba a la izquierda en (x, top) y altura h */
    fun draw(canvas: Canvas, s: String, x: Float, top: Float, h: Float, color: Int) {
        paint.color = color
        paint.strokeWidth = h * 0.085f
        var cx = x
        for (ch in s) {
            glyph(canvas, ch, cx, top, h)
            cx += h * (WIDTH + GAP)
        }
    }

    private fun glyph(canvas: Canvas, ch: Char, x: Float, y: Float, h: Float) {
        fun X(u: Float) = x + u * h
        fun Y(v: Float) = y + v * h
        fun oval(l: Float, t: Float, r: Float, b: Float) = RectF(X(l), Y(t), X(r), Y(b))
        path.reset()
        when (ch) {
            '0' -> {
                path.addRoundRect(oval(0.07f, 0.03f, 0.51f, 0.97f), h * 0.2f, h * 0.24f, Path.Direction.CW)
                path.moveTo(X(0.16f), Y(0.70f)); path.lineTo(X(0.42f), Y(0.30f))
            }
            '1' -> {
                path.moveTo(X(0.11f), Y(0.18f)); path.lineTo(X(0.31f), Y(0.03f)); path.lineTo(X(0.31f), Y(0.97f))
                path.moveTo(X(0.10f), Y(0.97f)); path.lineTo(X(0.52f), Y(0.97f))
            }
            '2' -> {
                path.moveTo(X(0.07f), Y(0.24f))
                path.cubicTo(X(0.08f), Y(0.09f), X(0.18f), Y(0.03f), X(0.29f), Y(0.03f))
                path.cubicTo(X(0.43f), Y(0.03f), X(0.51f), Y(0.13f), X(0.51f), Y(0.27f))
                path.cubicTo(X(0.51f), Y(0.45f), X(0.30f), Y(0.60f), X(0.07f), Y(0.97f))
                path.lineTo(X(0.52f), Y(0.97f))
            }
            '3' -> {
                path.moveTo(X(0.08f), Y(0.03f)); path.lineTo(X(0.49f), Y(0.03f)); path.lineTo(X(0.26f), Y(0.40f))
                path.cubicTo(X(0.42f), Y(0.40f), X(0.52f), Y(0.50f), X(0.52f), Y(0.66f))
                path.cubicTo(X(0.52f), Y(0.86f), X(0.40f), Y(0.97f), X(0.28f), Y(0.97f))
                path.cubicTo(X(0.18f), Y(0.97f), X(0.10f), Y(0.92f), X(0.07f), Y(0.84f))
            }
            '4' -> {
                path.moveTo(X(0.41f), Y(0.97f)); path.lineTo(X(0.41f), Y(0.03f)); path.lineTo(X(0.05f), Y(0.68f)); path.lineTo(X(0.54f), Y(0.68f))
            }
            '5' -> {
                path.moveTo(X(0.49f), Y(0.03f)); path.lineTo(X(0.12f), Y(0.03f)); path.lineTo(X(0.09f), Y(0.45f))
                path.cubicTo(X(0.17f), Y(0.40f), X(0.23f), Y(0.39f), X(0.29f), Y(0.39f))
                path.cubicTo(X(0.44f), Y(0.39f), X(0.52f), Y(0.50f), X(0.52f), Y(0.66f))
                path.cubicTo(X(0.52f), Y(0.86f), X(0.40f), Y(0.97f), X(0.28f), Y(0.97f))
                path.cubicTo(X(0.18f), Y(0.97f), X(0.10f), Y(0.92f), X(0.07f), Y(0.84f))
            }
            '6' -> {
                path.moveTo(X(0.46f), Y(0.07f))
                path.cubicTo(X(0.32f), Y(-0.01f), X(0.07f), Y(0.07f), X(0.07f), Y(0.62f))
                path.addOval(oval(0.07f, 0.38f, 0.51f, 0.97f), Path.Direction.CW)
            }
            '7' -> {
                path.moveTo(X(0.06f), Y(0.03f)); path.lineTo(X(0.52f), Y(0.03f)); path.lineTo(X(0.23f), Y(0.97f))
            }
            '8' -> {
                path.addOval(oval(0.10f, 0.03f, 0.48f, 0.48f), Path.Direction.CW)
                path.addOval(oval(0.07f, 0.48f, 0.51f, 0.97f), Path.Direction.CW)
            }
            '9' -> {
                path.addOval(oval(0.07f, 0.03f, 0.51f, 0.62f), Path.Direction.CW)
                path.moveTo(X(0.51f), Y(0.36f))
                path.cubicTo(X(0.51f), Y(0.90f), X(0.30f), Y(1.0f), X(0.12f), Y(0.93f))
            }
            else -> return
        }
        canvas.drawPath(path, paint)
    }
}
