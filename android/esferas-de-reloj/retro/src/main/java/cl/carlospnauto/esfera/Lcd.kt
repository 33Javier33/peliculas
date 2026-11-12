package cl.carlospnauto.esfera

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import java.text.Normalizer

/** Pantalla de cristal líquido: dígitos de 7 segmentos (con sus «8» apagados) y letras de puntos 5×7 */
object Lcd {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val path = Path()

    // a=1 b=2 c=4 d=8 e=16 f=32 g=64
    private val SEG = mapOf(
        '0' to 63, '1' to 6, '2' to 91, '3' to 79, '4' to 102, '5' to 109, '6' to 125, '7' to 7, '8' to 127, '9' to 111,
        '-' to 64, 'P' to 115, 'A' to 119, ' ' to 0,
    )

    private fun hSeg(x0: Float, x1: Float, yc: Float, t: Float) {
        path.moveTo(x0, yc)
        path.lineTo(x0 + t / 2, yc - t / 2)
        path.lineTo(x1 - t / 2, yc - t / 2)
        path.lineTo(x1, yc)
        path.lineTo(x1 - t / 2, yc + t / 2)
        path.lineTo(x0 + t / 2, yc + t / 2)
        path.close()
    }

    private fun vSeg(xc: Float, y0: Float, y1: Float, t: Float) {
        path.moveTo(xc, y0)
        path.lineTo(xc + t / 2, y0 + t / 2)
        path.lineTo(xc + t / 2, y1 - t / 2)
        path.lineTo(xc, y1)
        path.lineTo(xc - t / 2, y1 - t / 2)
        path.lineTo(xc - t / 2, y0 + t / 2)
        path.close()
    }

    private fun segments(mask: Int, w: Float, h: Float, t: Float) {
        path.reset()
        val g = t * 0.06f
        val l = t / 2
        if (mask and 1 != 0) hSeg(l + g, w - l - g, l, t)
        if (mask and 64 != 0) hSeg(l + g, w - l - g, h / 2, t)
        if (mask and 8 != 0) hSeg(l + g, w - l - g, h - l, t)
        if (mask and 32 != 0) vSeg(l, l + g, h / 2 - g, t)
        if (mask and 2 != 0) vSeg(w - l, l + g, h / 2 - g, t)
        if (mask and 16 != 0) vSeg(l, h / 2 + g, h - l - g, t)
        if (mask and 4 != 0) vSeg(w - l, h / 2 + g, h - l - g, t)
    }

    /** Un dígito inclinado (x, y = arriba a la izquierda). ghost: color de los segmentos apagados (0 = sin) */
    fun digit(canvas: Canvas, ch: Char, x: Float, y: Float, w: Float, h: Float, on: Int, ghost: Int) {
        val t = w * 0.30f
        canvas.save()
        canvas.translate(x, y + h)
        canvas.skew(-0.1f, 0f)
        canvas.translate(0f, -h)
        if (ghost != 0) {
            segments(127, w, h, t)
            paint.color = ghost
            canvas.drawPath(path, paint)
        }
        val mask = SEG[ch] ?: 0
        if (mask != 0) {
            segments(mask, w, h, t)
            paint.color = on
            canvas.drawPath(path, paint)
        }
        canvas.restore()
    }

    /** Fila de dígitos alineada a la derecha en `cells` casillas; las sobrantes quedan como «8» apagados */
    fun row(canvas: Canvas, s: String, right: Float, y: Float, w: Float, h: Float, gap: Float, cells: Int, on: Int, ghost: Int) {
        val text = s.padStart(cells, ' ').takeLast(cells)
        for ((i, ch) in text.withIndex()) {
            digit(canvas, ch, right - (cells - i) * (w + gap) + gap, y, w, h, on, ghost)
        }
    }

    /** Dos puntos de la hora */
    fun colon(canvas: Canvas, x: Float, y: Float, h: Float, d: Float, on: Int) {
        paint.color = on
        for (k in listOf(0.3f, 0.7f)) {
            val cy = y + h * k
            path.reset()
            path.moveTo(x, cy - d)
            path.lineTo(x + d, cy)
            path.lineTo(x, cy + d)
            path.lineTo(x - d, cy)
            path.close()
            canvas.drawPath(path, paint)
        }
    }

    // Letras de puntos 5×7 (cada fila: 5 puntos, el de la izquierda es el bit más alto)
    private val FONT: Map<Char, IntArray> = mapOf(
        'A' to "01110 10001 10001 11111 10001 10001 10001",
        'B' to "11110 10001 10001 11110 10001 10001 11110",
        'C' to "01110 10001 10000 10000 10000 10001 01110",
        'D' to "11110 10001 10001 10001 10001 10001 11110",
        'E' to "11111 10000 10000 11110 10000 10000 11111",
        'F' to "11111 10000 10000 11110 10000 10000 10000",
        'G' to "01110 10001 10000 10111 10001 10001 01111",
        'H' to "10001 10001 10001 11111 10001 10001 10001",
        'I' to "01110 00100 00100 00100 00100 00100 01110",
        'J' to "00111 00010 00010 00010 00010 10010 01100",
        'L' to "10000 10000 10000 10000 10000 10000 11111",
        'M' to "10001 11011 10101 10101 10001 10001 10001",
        'N' to "10001 11001 10101 10011 10001 10001 10001",
        'O' to "01110 10001 10001 10001 10001 10001 01110",
        'P' to "11110 10001 10001 11110 10000 10000 10000",
        'R' to "11110 10001 10001 11110 10100 10010 10001",
        'S' to "01111 10000 10000 01110 00001 00001 11110",
        'T' to "11111 00100 00100 00100 00100 00100 00100",
        'U' to "10001 10001 10001 10001 10001 10001 01110",
        'V' to "10001 10001 10001 10001 10001 01010 00100",
        'W' to "10001 10001 10001 10101 10101 10101 01010",
        '0' to "01110 10001 10011 10101 11001 10001 01110",
        '1' to "00100 01100 00100 00100 00100 00100 01110",
        '2' to "01110 10001 00001 00010 00100 01000 11111",
        '3' to "11111 00010 00100 00010 00001 10001 01110",
        '4' to "00010 00110 01010 10010 11111 00010 00010",
        '5' to "11111 10000 11110 00001 00001 10001 01110",
        '6' to "00110 01000 10000 11110 10001 10001 01110",
        '7' to "11111 00001 00010 00100 01000 01000 01000",
        '8' to "01110 10001 10001 01110 10001 10001 01110",
        '9' to "01110 10001 10001 01111 00001 00010 01100",
        '\'' to "00100 00100 01000 00000 00000 00000 00000",
    ).mapValues { (_, v) -> v.split(' ').map { it.toInt(2) }.toIntArray() }

    /** Texto en puntos (x, y = arriba a la izquierda; p = paso entre puntos). Sin tildes. */
    fun dots(canvas: Canvas, s: String, x: Float, y: Float, p: Float, on: Int, ghost: Int) {
        val clean = Normalizer.normalize(s.uppercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")
        val d = p * 0.9f
        for ((i, ch) in clean.withIndex()) {
            val rows = FONT[ch]
            val ox = x + i * p * 6
            for (row in 0 until 7) for (col in 0 until 5) {
                val lit = rows != null && (rows[row] shr (4 - col)) and 1 == 1
                if (!lit && ghost == 0) continue
                paint.color = if (lit) on else ghost
                canvas.drawRect(ox + col * p, y + row * p, ox + col * p + d, y + row * p + d, paint)
            }
        }
    }

    fun dotsWidth(s: String, p: Float) = s.length * p * 6 - p
}
