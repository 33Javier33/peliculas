package cl.carlospnauto.esfera

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import kotlin.math.exp
import kotlin.math.sin

/** Fondo de mapa topográfico: curvas de nivel de un relieve inventado (se dibuja una sola vez por tamaño) */
object Topo {
    private fun hill(x: Float, y: Float, cx: Float, cy: Float, s: Float): Float {
        val dx = x - cx
        val dy = y - cy
        return exp(-(dx * dx + dy * dy) / (2 * s * s))
    }

    private fun height(x: Float, y: Float): Float =
        1.2f * hill(x, y, 0.30f, 0.33f, 0.17f) +
            1.0f * hill(x, y, 0.72f, 0.66f, 0.21f) -
            0.8f * hill(x, y, 0.66f, 0.28f, 0.14f) +
            0.6f * hill(x, y, 0.24f, 0.76f, 0.19f) +
            0.5f * hill(x, y, 0.52f, 0.50f, 0.09f) +
            0.14f * sin(6f * x + 2f * y) +
            0.10f * sin(3f * y - 5f * x + 1f)

    fun draw(size: Int): Bitmap {
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val n = 150
        val v = Array(n + 1) { j -> FloatArray(n + 1) { i -> height(i / n.toFloat(), j / n.toFloat()) } }
        var lo = Float.MAX_VALUE
        var hi = -Float.MAX_VALUE
        for (row in v) for (h in row) { if (h < lo) lo = h; if (h > hi) hi = h }
        val cell = size / n.toFloat()
        val olive = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; color = Color.argb(150, 96, 104, 70); strokeWidth = size / 320f
        }
        val copper = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; color = Color.argb(185, 176, 112, 72); strokeWidth = size / 260f
        }
        val levels = 30
        val px = FloatArray(8)
        for (k in 1 until levels) {
            val level = lo + (hi - lo) * k / levels
            val paint = if (k % 4 == 0) copper else olive
            for (j in 0 until n) for (i in 0 until n) {
                val a = v[j][i]; val b = v[j][i + 1]; val c = v[j + 1][i + 1]; val d = v[j + 1][i]
                var m = 0
                fun edge(p: Float, q: Float, x0: Float, y0: Float, x1: Float, y1: Float) {
                    if ((p - level) * (q - level) < 0f) {
                        val t = (level - p) / (q - p)
                        px[m++] = (x0 + (x1 - x0) * t) * cell
                        px[m++] = (y0 + (y1 - y0) * t) * cell
                    }
                }
                val x = i.toFloat(); val y = j.toFloat()
                edge(a, b, x, y, x + 1, y)
                edge(b, c, x + 1, y, x + 1, y + 1)
                edge(c, d, x + 1, y + 1, x, y + 1)
                edge(d, a, x, y + 1, x, y)
                if (m >= 4) canvas.drawLine(px[0], px[1], px[2], px[3], paint)
                if (m == 8) canvas.drawLine(px[4], px[5], px[6], px[7], paint)
            }
        }
        return bmp
    }
}
