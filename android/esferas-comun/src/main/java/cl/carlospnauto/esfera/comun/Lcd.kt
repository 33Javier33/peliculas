package cl.carlospnauto.esfera.comun

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

    private var inset = 0f

    /** Inclinación de los dígitos (los relojes de cristal líquido suelen ir algo inclinados; 0 = rectos) */
    var skew = -0.1f

    /** Segmento como polígono (pares x, y); se achica hacia su centro para dejar la línea fina entre segmentos */
    private fun poly(vararg p: Float) {
        val n = p.size / 2
        var sx = 0f
        var sy = 0f
        for (i in 0 until n) { sx += p[2 * i]; sy += p[2 * i + 1] }
        sx /= n
        sy /= n
        for (i in 0 until n) {
            var x = p[2 * i]
            var y = p[2 * i + 1]
            val dx = sx - x
            val dy = sy - y
            val l = kotlin.math.hypot(dx, dy)
            if (l > 0f) { x += dx / l * inset; y += dy / l * inset }
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        path.close()
    }

    /** Segmentos clásicos de cristal líquido: gruesos y cortados en diagonal donde se juntan */
    private fun segments(mask: Int, w: Float, h: Float, t: Float) {
        path.reset()
        inset = t * 0.09f
        val m = h / 2
        val q = t / 2
        if (mask and 1 != 0) poly(0f, 0f, w, 0f, w - t, t, t, t)
        if (mask and 2 != 0) poly(w, 0f, w, m, w - q, m, w - t, m - q, w - t, t)
        if (mask and 4 != 0) poly(w, m, w, h, w - t, h - t, w - t, m + q, w - q, m)
        if (mask and 8 != 0) poly(t, h - t, w - t, h - t, w, h, 0f, h)
        if (mask and 16 != 0) poly(0f, m, q, m, t, m + q, t, h - t, 0f, h)
        if (mask and 32 != 0) poly(0f, 0f, t, t, t, m - q, q, m, 0f, m)
        if (mask and 64 != 0) poly(q, m, t, m - q, w - t, m - q, w - q, m, w - t, m + q, t, m + q)
    }

    /** Un dígito inclinado (x, y = arriba a la izquierda). ghost: color de los segmentos apagados (0 = sin) */
    fun digit(canvas: Canvas, ch: Char, x: Float, y: Float, w: Float, h: Float, on: Int, ghost: Int) {
        val t = w * 0.27f
        canvas.save()
        canvas.translate(x, y + h)
        canvas.skew(skew, 0f)
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

    /**
     * Número en casillas alineado a la derecha (sobrantes como «8» apagados). Admite «:» y «.» entre
     * dígitos: van en el espacio entre casillas, como en los relojes de cristal líquido.
     */
    fun number(canvas: Canvas, s: String, right: Float, y: Float, w: Float, h: Float, gap: Float, cells: Int, on: Int, ghost: Int) {
        val chars = StringBuilder()
        val marks = mutableListOf<Pair<Int, Char>>()
        for (ch in s) {
            if (ch == ':' || ch == '.') marks += (chars.length - 1) to ch else chars.append(ch)
        }
        val text = chars.toString().takeLast(cells)
        val pad = cells - text.length
        val shown = " ".repeat(pad) + text
        val cellW = w + gap
        for ((i, ch) in shown.withIndex()) digit(canvas, ch, right - (cells - i) * cellW + gap, y, w, h, on, ghost)
        for ((after, m) in marks) {
            val idx = after + pad
            if (idx < 0 || idx >= cells) continue
            // Entre las dos casillas; corrido como la inclinación de los dígitos
            val x = right - (cells - idx - 1) * cellW + gap / 2
            val d = minOf(w * 0.15f, gap * 0.36f)
            paint.color = on
            if (m == '.') canvas.drawRect(x - d, y + h - d * 2, x + d, y + h, paint)
            else for (k in listOf(0.3f, 0.7f)) {
                val sx = x + h * 0.1f * (1 - k)
                canvas.drawRect(sx - d, y + h * k - d, sx + d, y + h * k + d, paint)
            }
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
        '/' to "00001 00010 00010 00100 01000 01000 10000",
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

    // ---------- Letras de 14 segmentos (como las de los relojes de cristal líquido) ----------
    // a b c d e f · g1 g2 (centro) · h i j (arriba: diagonal, vertical, diagonal) · k l m (abajo)
    private val A = 1; private val B = 2; private val C = 4; private val D = 8; private val E = 16; private val F = 32
    private val G1 = 64; private val G2 = 128; private val H = 256; private val I = 512; private val J = 1024
    private val K = 2048; private val L = 4096; private val M = 8192
    private val SEG14: Map<Char, Int> by lazy {
        mapOf(
            'A' to (A or B or C or E or F or G1 or G2), 'B' to (A or B or C or D or G2 or I or L), 'C' to (A or D or E or F),
            'D' to (A or B or C or D or I or L), 'E' to (A or D or E or F or G1), 'F' to (A or E or F or G1),
            'G' to (A or C or D or E or F or G2), 'H' to (B or C or E or F or G1 or G2), 'I' to (A or D or I or L),
            'J' to (B or C or D or E), 'K' to (E or F or G1 or J or M), 'L' to (D or E or F), 'M' to (B or C or E or F or H or J),
            'N' to (B or C or E or F or H or M), 'O' to (A or B or C or D or E or F), 'P' to (A or B or E or F or G1 or G2),
            'Q' to (A or B or C or D or E or F or M), 'R' to (A or B or E or F or G1 or G2 or M), 'S' to (A or C or D or F or G1 or G2),
            'T' to (A or I or L), 'U' to (B or C or D or E or F), 'V' to (E or F or K or J), 'W' to (B or C or E or F or K or M),
            'X' to (H or J or K or M), 'Y' to (H or J or L), 'Z' to (A or D or J or K),
            '0' to (A or B or C or D or E or F), '1' to (B or C), '2' to (A or B or D or E or G1 or G2), '3' to (A or B or C or D or G1 or G2),
            '4' to (B or C or F or G1 or G2), '5' to (A or C or D or F or G1 or G2), '6' to (A or C or D or E or F or G1 or G2),
            '7' to (A or B or C), '8' to (A or B or C or D or E or F or G1 or G2), '9' to (A or B or C or D or F or G1 or G2),
            '-' to (G1 or G2), '\'' to I, ' ' to 0,
        )
    }

    private fun bar(x1: Float, y1: Float, x2: Float, y2: Float, wd: Float) {
        val dx = x2 - x1
        val dy = y2 - y1
        val l = kotlin.math.hypot(dx, dy)
        val nx = -dy / l * wd / 2
        val ny = dx / l * wd / 2
        path.moveTo(x1 + nx, y1 + ny)
        path.lineTo(x2 + nx, y2 + ny)
        path.lineTo(x2 - nx, y2 - ny)
        path.lineTo(x1 - nx, y1 - ny)
        path.close()
    }

    private fun segments14(mask: Int, w: Float, h: Float, t: Float) {
        path.reset()
        inset = t * 0.1f
        val m = h / 2
        val q = t / 2
        val c = w / 2
        if (mask and A != 0) poly(0f, 0f, w, 0f, w - t, t, t, t)
        if (mask and D != 0) poly(t, h - t, w - t, h - t, w, h, 0f, h)
        if (mask and F != 0) poly(0f, 0f, t, t, t, m - q, q, m, 0f, m)
        if (mask and B != 0) poly(w, 0f, w, m, w - q, m, w - t, m - q, w - t, t)
        if (mask and E != 0) poly(0f, m, q, m, t, m + q, t, h - t, 0f, h)
        if (mask and C != 0) poly(w, m, w, h, w - t, h - t, w - t, m + q, w - q, m)
        if (mask and G1 != 0) poly(q, m, t, m - q, c - q, m - q, c, m, c - q, m + q, t, m + q)
        if (mask and G2 != 0) poly(c, m, c + q, m - q, w - t, m - q, w - q, m, w - t, m + q, c + q, m + q)
        if (mask and I != 0) poly(c - q, t, c + q, t, c + q, m - q, c, m, c - q, m - q)
        if (mask and L != 0) poly(c, m, c + q, m + q, c + q, h - t, c - q, h - t, c - q, m + q)
        val dw = t * 0.75f
        val e = t * 1.35f
        if (mask and H != 0) bar(e, e, c - q * 1.4f, m - q * 1.4f, dw)
        if (mask and J != 0) bar(w - e, e, c + q * 1.4f, m - q * 1.4f, dw)
        if (mask and K != 0) bar(e, h - e, c - q * 1.4f, m + q * 1.4f, dw)
        if (mask and M != 0) bar(w - e, h - e, c + q * 1.4f, m + q * 1.4f, dw)
    }

    /** Una letra o número de 14 segmentos (x, y = arriba a la izquierda) */
    fun letter(canvas: Canvas, ch: Char, x: Float, y: Float, w: Float, h: Float, on: Int, ghost: Int) {
        val t = w * 0.2f
        canvas.save()
        canvas.translate(x, y + h)
        canvas.skew(skew, 0f)
        canvas.translate(0f, -h)
        if (ghost != 0) {
            segments14(0x3FFF, w, h, t)
            paint.color = ghost
            canvas.drawPath(path, paint)
        }
        val mask = SEG14[ch] ?: 0
        if (mask != 0) {
            segments14(mask, w, h, t)
            paint.color = on
            canvas.drawPath(path, paint)
        }
        canvas.restore()
    }

    /** Texto de 14 segmentos (sin tildes); los espacios ocupan media casilla */
    fun text14(canvas: Canvas, s: String, x: Float, y: Float, w: Float, h: Float, gap: Float, on: Int, ghost: Int) {
        val clean = Normalizer.normalize(s.uppercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")
        var cx = x
        for (ch in clean) {
            if (ch == ' ') { cx += (w + gap) * 0.6f; continue }
            letter(canvas, ch, cx, y, w, h, on, ghost)
            cx += w + gap
        }
    }

    fun text14Width(s: String, w: Float, gap: Float) = s.sumOf { (if (it == ' ') (w + gap) * 0.6f else w + gap).toDouble() }.toFloat() - gap
}
