package cl.carlospnauto.esfera

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import java.time.ZonedDateTime
import java.time.ZoneOffset
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * Mapa del mundo simple (continentes como contornos de longitud y latitud) y la sombra de la noche
 * según la hora, como los relojes de hora mundial.
 */
object WorldMap {
    // Contornos (longitud, latitud)
    private val SHAPES: List<FloatArray> = listOf(
        // Norteamérica
        floatArrayOf(-168f, 66f, -160f, 71f, -140f, 70f, -125f, 72f, -95f, 74f, -80f, 72f, -62f, 60f, -55f, 52f, -67f, 45f, -75f, 38f, -81f, 31f, -80f, 25f, -90f, 29f, -97f, 26f, -97f, 20f, -87f, 21f, -83f, 10f, -78f, 8f, -85f, 12f, -105f, 20f, -112f, 30f, -118f, 34f, -124f, 40f, -124f, 48f, -132f, 55f, -150f, 60f, -165f, 60f),
        // Groenlandia
        floatArrayOf(-73f, 78f, -60f, 82f, -30f, 83f, -20f, 72f, -42f, 60f, -52f, 65f, -58f, 75f),
        // Sudamérica
        floatArrayOf(-80f, 9f, -72f, 12f, -60f, 8f, -50f, 0f, -35f, -6f, -38f, -13f, -40f, -22f, -48f, -27f, -58f, -38f, -65f, -41f, -68f, -50f, -70f, -55f, -74f, -50f, -72f, -40f, -71f, -30f, -70f, -18f, -76f, -14f, -81f, -5f, -80f, 0f),
        // Europa
        floatArrayOf(-10f, 36f, -9f, 43f, -2f, 44f, -5f, 48f, 2f, 51f, 5f, 53f, 8f, 57f, 5f, 62f, 15f, 69f, 25f, 71f, 30f, 70f, 40f, 66f, 40f, 60f, 30f, 55f, 28f, 46f, 30f, 41f, 26f, 38f, 23f, 36f, 20f, 40f, 16f, 38f, 12f, 44f, 8f, 44f, 3f, 42f, 0f, 38f, -5f, 36f),
        // Gran Bretaña
        floatArrayOf(-6f, 50f, 2f, 51f, -2f, 56f, -5f, 58f, -6f, 55f),
        // África
        floatArrayOf(-17f, 21f, -10f, 30f, -6f, 36f, 10f, 37f, 11f, 33f, 20f, 31f, 32f, 31f, 34f, 28f, 43f, 12f, 51f, 12f, 43f, 0f, 40f, -10f, 40f, -16f, 35f, -24f, 32f, -29f, 27f, -34f, 18f, -34f, 14f, -22f, 12f, -6f, 9f, -1f, 9f, 4f, 4f, 6f, -8f, 4f, -13f, 8f, -17f, 14f),
        // Madagascar
        floatArrayOf(44f, -13f, 50f, -15f, 47f, -25f, 43f, -22f),
        // Asia
        floatArrayOf(30f, 55f, 40f, 66f, 60f, 70f, 80f, 73f, 100f, 77f, 120f, 73f, 140f, 72f, 160f, 70f, 180f, 68f, 178f, 64f, 165f, 60f, 160f, 55f, 140f, 52f, 135f, 43f, 128f, 38f, 122f, 31f, 120f, 23f, 110f, 20f, 106f, 10f, 100f, 13f, 98f, 8f, 100f, 3f, 103f, 1f, 98f, 15f, 92f, 22f, 88f, 22f, 80f, 15f, 77f, 8f, 72f, 20f, 68f, 24f, 62f, 25f, 57f, 26f, 52f, 28f, 48f, 30f, 36f, 36f, 28f, 41f, 40f, 45f, 48f, 42f, 50f, 47f, 45f, 52f),
        // Arabia
        floatArrayOf(34f, 28f, 36f, 34f, 48f, 30f, 56f, 26f, 60f, 22f, 52f, 16f, 44f, 12f, 42f, 16f, 38f, 22f),
        // Indonesia
        floatArrayOf(95f, 5f, 105f, -6f, 115f, -9f, 125f, -9f, 130f, -3f, 120f, 2f, 117f, 7f, 108f, 3f),
        // Japón
        floatArrayOf(130f, 31f, 135f, 34f, 141f, 37f, 142f, 44f, 140f, 41f, 136f, 36f),
        // Australia
        floatArrayOf(114f, -22f, 122f, -18f, 130f, -12f, 137f, -12f, 142f, -11f, 146f, -19f, 153f, -26f, 150f, -37f, 141f, -38f, 135f, -35f, 129f, -32f, 115f, -34f),
        // Nueva Zelanda
        floatArrayOf(172f, -35f, 178f, -38f, 171f, -45f, 167f, -46f),
    )

    private const val TOP = 80f
    private const val BOTTOM = -60f

    private val path = Path()

    fun px(rect: RectF, lon: Float) = rect.left + (((lon + 180f) % 360f + 360f) % 360f) / 360f * rect.width()
    fun py(rect: RectF, lat: Float) = rect.top + (TOP - lat.coerceIn(BOTTOM, TOP)) / (TOP - BOTTOM) * rect.height()

    private fun days(t: ZonedDateTime) = (t.toEpochSecond() - 946728000L) / 86400.0 // desde J2000

    /** Declinación del sol (grados) y longitud donde está a pleno mediodía */
    fun sun(t: ZonedDateTime): Pair<Double, Double> {
        val u = t.withZoneSameInstant(ZoneOffset.UTC)
        val hours = u.hour + u.minute / 60.0 + u.second / 3600.0
        val decl = 23.44 * sin(2 * PI * (284 + u.dayOfYear) / 365.0)
        // Ecuación del tiempo (min): el mediodía solar no cae justo a las 12
        val b = 2 * PI * (u.dayOfYear - 81) / 364.0
        val eot = 9.87 * sin(2 * b) - 7.53 * cos(b) - 1.5 * sin(b)
        val lon = (12.0 - hours - eot / 60.0) * 15.0
        return decl to (((lon + 540) % 360) - 180)
    }

    /** Punto de la Tierra que tiene la luna justo encima: (latitud, longitud) aproximadas */
    fun moon(t: ZonedDateTime): Pair<Double, Double> {
        val d = days(t)
        val l = Math.toRadians(218.316 + 13.176396 * d)
        val m = Math.toRadians(134.963 + 13.064993 * d)
        val f = Math.toRadians(93.272 + 13.229350 * d)
        val lam = l + Math.toRadians(6.289) * sin(m)
        val bet = Math.toRadians(5.128) * sin(f)
        val e = Math.toRadians(23.44)
        val ra = atan2(sin(lam) * cos(e) - kotlin.math.tan(bet) * sin(e), cos(lam))
        val dec = asin(sin(bet) * cos(e) + cos(bet) * sin(e) * sin(lam))
        val gmst = 280.46061837 + 360.98564736629 * d
        val lon = Math.toDegrees(ra) - gmst
        return Math.toDegrees(dec) to (((lon % 360) + 540) % 360 - 180)
    }

    /** Altura del sol (grados) en un lugar */
    fun elevation(lat: Double, lon: Double, decl: Double, sunLon: Double): Double {
        val la = Math.toRadians(lat)
        val dr = Math.toRadians(decl)
        val h = Math.toRadians(lon - sunLon)
        return Math.toDegrees(asin(sin(la) * sin(dr) + cos(la) * cos(dr) * cos(h)))
    }

    /** Salida y puesta del sol (horas UTC) para un lugar; null si es día o noche polar */
    fun sunTimes(t: ZonedDateTime, lat: Double, lon: Double): Pair<Double, Double>? {
        val (decl, _) = sun(t.withHour(12))
        val u = t.withZoneSameInstant(ZoneOffset.UTC)
        val b = 2 * PI * (u.dayOfYear - 81) / 364.0
        val eot = 9.87 * sin(2 * b) - 7.53 * cos(b) - 1.5 * sin(b)
        val la = Math.toRadians(lat)
        val dr = Math.toRadians(decl)
        val c = (sin(Math.toRadians(-0.833)) - sin(la) * sin(dr)) / (cos(la) * cos(dr))
        if (c < -1 || c > 1) return null
        val h0 = Math.toDegrees(kotlin.math.acos(c)) / 15.0
        val noon = 12.0 - lon / 15.0 - eot / 60.0
        return (noon - h0) to (noon + h0)
    }

    /** Continentes; night: sombra de la noche (0 = sin ella); dusk: la del crepúsculo (0 = sin ella) */
    fun draw(canvas: Canvas, rect: RectF, land: Int, night: Int, t: ZonedDateTime, paint: Paint, dusk: Int = 0) {
        canvas.save()
        canvas.clipRect(rect)
        paint.style = Paint.Style.FILL
        paint.color = land
        for (s in SHAPES) {
            path.reset()
            path.moveTo(px(rect, s[0]), py(rect, s[1]))
            var i = 2
            while (i < s.size) { path.lineTo(px(rect, s[i]), py(rect, s[i + 1])); i += 2 }
            path.close()
            canvas.drawPath(path, paint)
        }
        // La noche: donde el sol está bajo el horizonte (y el crepúsculo, entre 0 y -6°)
        if (night != 0 || dusk != 0) {
            val (decl, sunLon) = sun(t)
            val cols = 72
            val rows = 28
            for (cI in 0 until cols) {
                val lon = -180.0 + (cI + 0.5) * 360.0 / cols
                for (rI in 0 until rows) {
                    val lat = TOP - (rI + 0.5) * (TOP - BOTTOM) / rows
                    val elev = elevation(lat, lon, decl, sunLon)
                    val c = when {
                        elev < -6 -> night
                        elev < 0 -> if (dusk != 0) dusk else night
                        else -> 0
                    }
                    if (c != 0) {
                        paint.color = c
                        val x0 = rect.left + cI * rect.width() / cols
                        val y0 = rect.top + rI * rect.height() / rows
                        canvas.drawRect(x0, y0, x0 + rect.width() / cols + 0.5f, y0 + rect.height() / rows + 0.5f, paint)
                    }
                }
            }
        }
        canvas.restore()
    }
}
