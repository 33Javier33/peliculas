package cl.carlospnauto.app

import android.media.audiofx.DynamicsProcessing
import android.media.audiofx.Equalizer
import android.os.Build
import org.json.JSONObject
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.pow

/**
 * Ecualizador hecho por Android (no por la página). Antes la música pasaba por el sistema de
 * audio de la web (Web Audio) dentro del WebView: en Android ese camino se queda sin datos cada
 * tanto y se oía un chisporroteo, como una radio que pierde la señal. Ahora la web suena directo
 * y el procesador de audio del teléfono aplica las bandas, el nivelador y un limitador.
 *
 * Android 9+: DynamicsProcessing (10 bandas suaves interpoladas de las 5 de la app, nivelador
 * y limitador). Android 8: Equalizer del sistema (solo bandas).
 * Se activa solo mientras la app reproduce, para no tocar el sonido de otras apps.
 */
object NativeEq {
    // Las 5 bandas de la app (Hz), en el mismo orden que la web
    private val APP_FREQS = doubleArrayOf(60.0, 230.0, 910.0, 3600.0, 14000.0)
    private const val BANDS = 10
    private const val PRIORITY = 1000

    private var dp: DynamicsProcessing? = null
    private var eq: Equalizer? = null
    // Si falla (p. ej. al cambiar a audífonos Bluetooth) se vuelve a intentar al rato: antes quedaba
    // apagado hasta reiniciar la app
    private var failedAt = 0L

    /** Ganancia (dB) en una frecuencia, interpolando las 5 bandas en escala logarítmica */
    private fun gainAt(hz: Double, gains: DoubleArray): Double {
        if (hz <= APP_FREQS.first()) return gains.first()
        if (hz >= APP_FREQS.last()) return gains.last()
        for (i in 0 until APP_FREQS.size - 1) {
            val a = APP_FREQS[i]
            val b = APP_FREQS[i + 1]
            if (hz <= b) {
                val t = (ln(hz) - ln(a)) / (ln(b) - ln(a))
                return gains[i] + (gains[i + 1] - gains[i]) * t
            }
        }
        return 0.0
    }

    /** Frecuencias de corte (límite superior) de las 10 bandas: de 20 Hz a 20 kHz */
    private val CUTOFFS = DoubleArray(BANDS) { 20.0 * 1000.0.pow((it + 1).toDouble() / BANDS) }

    /**
     * {"on":bool, "gains":[5 dB], "leveler":bool} → "ok" | "unsupported" | "busy" (otra app de
     * ecualizador tiene el control)
     */
    @Synchronized
    fun apply(json: String): String {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return "unsupported"
        val on = o.optBoolean("on")
        val arr = o.optJSONArray("gains")
        val gains = DoubleArray(APP_FREQS.size) { (arr?.optDouble(it, 0.0) ?: 0.0).coerceIn(-12.0, 12.0) }
        val leveler = o.optBoolean("leveler")
        if (failedAt > 0 && System.currentTimeMillis() - failedAt < 15_000) return "unsupported"
        return try {
            val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) applyDp(on, gains, leveler) else applyEq(on, gains)
            failedAt = 0L
            // Otra app tiene el control: se suelta para volver a pedirlo la próxima vez
            if (r == "busy") release()
            r
        } catch (e: Throwable) {
            failedAt = System.currentTimeMillis()
            release()
            "unsupported"
        }
    }

    private fun applyDp(on: Boolean, gains: DoubleArray, leveler: Boolean): String {
        if (!on) {
            dp?.setEnabled(false)
            return "ok"
        }
        val d = dp ?: DynamicsProcessing(
            PRIORITY, 0,
            DynamicsProcessing.Config.Builder(
                DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, 2,
                true, BANDS, // ecualizador
                true, 1, // nivelador (compresor de una banda)
                false, 0,
                true, // limitador
            ).build()
        ).also { dp = it }

        // Margen: se baja la entrada lo que sube la banda más alta (nunca pasa del máximo)
        val bandGains = FloatArray(BANDS) { i ->
            val lo = if (i == 0) 20.0 else CUTOFFS[i - 1]
            gainAt(kotlin.math.sqrt(lo * CUTOFFS[i]), gains).toFloat()
        }
        val peak = max(0f, bandGains.maxOrNull() ?: 0f)
        d.setInputGainAllChannelsTo(-peak)

        val preEq = DynamicsProcessing.Eq(true, true, BANDS)
        for (i in 0 until BANDS) preEq.setBand(i, DynamicsProcessing.EqBand(true, CUTOFFS[i].toFloat(), bandGains[i]))
        d.setPreEqAllChannelsTo(preEq)

        // Nivelador suave: baja lo fuerte y sube el conjunto (+2,3 dB, como en la web)
        val mbc = DynamicsProcessing.Mbc(true, true, 1)
        mbc.setBand(
            0,
            DynamicsProcessing.MbcBand(
                true, 20000f,
                10f, 250f, // ataque y relajación (ms)
                if (leveler) 4f else 1f, // proporción
                -28f, 12f, // umbral (dB) y rodilla
                -90f, 1f, // sin compuerta de ruido
                0f, if (leveler) 2.3f else 0f,
            )
        )
        d.setMbcAllChannelsTo(mbc)

        // Limitador final con ataque suave (uno muy rápido distorsiona)
        d.setLimiterAllChannelsTo(DynamicsProcessing.Limiter(true, true, 0, 5f, 120f, 10f, -1f, 0f))
        d.setEnabled(true)
        return if (d.hasControl()) "ok" else "busy"
    }

    private fun applyEq(on: Boolean, gains: DoubleArray): String {
        if (!on) {
            eq?.setEnabled(false)
            return "ok"
        }
        val e = eq ?: Equalizer(PRIORITY, 0).also { eq = it }
        val range = e.bandLevelRange
        for (b in 0 until e.numberOfBands.toInt()) {
            val hz = e.getCenterFreq(b.toShort()) / 1000.0
            val mb = (gainAt(hz, gains) * 100).toInt().coerceIn(range[0].toInt(), range[1].toInt())
            e.setBandLevel(b.toShort(), mb.toShort())
        }
        e.setEnabled(true)
        return if (e.hasControl()) "ok" else "busy"
    }

    @Synchronized
    fun release() {
        runCatching { dp?.release() }
        runCatching { eq?.release() }
        dp = null
        eq = null
    }
}
