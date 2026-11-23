package cl.carlospnauto.esfera

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Dónde estás, para el punto del mapa. Con el permiso de ubicación (se pide al tocar el mapa la
 * primera vez) se usa la ubicación aproximada del reloj; sin él, la ciudad de tu zona horaria.
 */
object Here {
    private const val PREFS = "mundo_lugar"

    private val ZONES = mapOf(
        "America/Santiago" to (-33.45 to -70.67), "America/Punta_Arenas" to (-53.16 to -70.92), "Pacific/Easter" to (-27.11 to -109.35),
        "America/Lima" to (-12.05 to -77.04), "America/Bogota" to (4.71 to -74.07), "America/Mexico_City" to (19.43 to -99.13),
        "America/Argentina/Buenos_Aires" to (-34.60 to -58.38), "America/Buenos_Aires" to (-34.60 to -58.38), "America/Sao_Paulo" to (-23.55 to -46.63),
        "America/Caracas" to (10.48 to -66.90), "America/La_Paz" to (-16.50 to -68.15), "America/Asuncion" to (-25.26 to -57.58),
        "America/Montevideo" to (-34.90 to -56.16), "America/Guayaquil" to (-2.19 to -79.89), "America/Panama" to (8.98 to -79.52),
        "America/Havana" to (23.11 to -82.37), "America/Santo_Domingo" to (18.49 to -69.93), "America/Guatemala" to (14.63 to -90.51),
        "America/Costa_Rica" to (9.93 to -84.08), "America/New_York" to (40.71 to -74.00), "America/Chicago" to (41.88 to -87.63),
        "America/Denver" to (39.74 to -104.99), "America/Los_Angeles" to (34.05 to -118.24), "America/Toronto" to (43.65 to -79.38),
        "Europe/Madrid" to (40.42 to -3.70), "Europe/London" to (51.50 to -0.12), "Europe/Paris" to (48.86 to 2.35),
        "Europe/Berlin" to (52.52 to 13.40), "Europe/Rome" to (41.90 to 12.50), "Europe/Lisbon" to (38.72 to -9.14),
        "Asia/Tokyo" to (35.68 to 139.69), "Asia/Shanghai" to (31.23 to 121.47), "Asia/Kolkata" to (28.61 to 77.21),
        "Asia/Dubai" to (25.20 to 55.27), "Australia/Sydney" to (-33.87 to 151.21), "Africa/Johannesburg" to (-26.20 to 28.05),
    )

    @Volatile private var fixAt = 0L

    fun allowed(c: Context) = c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** (latitud, longitud, ¿es la ubicación real?) */
    fun where(c: Context, t: ZonedDateTime): Triple<Double, Double, Boolean> {
        val p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (allowed(c)) {
            refresh(c)
            if (p.contains("lat")) return Triple(p.getFloat("lat", 0f).toDouble(), p.getFloat("lon", 0f).toDouble(), true)
        }
        val z = ZONES[t.zone.id] ?: ZONES[ZoneId.systemDefault().id]
        if (z != null) return Triple(z.first, z.second, false)
        // Sin ciudad conocida: la longitud según la hora de la zona
        return Triple(0.0, t.offset.totalSeconds / 240.0, false)
    }

    /** Pide la ubicación aproximada (como mucho cada 20 min) */
    @android.annotation.SuppressLint("MissingPermission")
    private fun refresh(c: Context) {
        val now = System.currentTimeMillis()
        if (now - fixAt < 20 * 60_000) return
        fixAt = now
        val lm = c.getSystemService(LocationManager::class.java) ?: return
        val save = { lat: Double, lon: Double ->
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putFloat("lat", lat.toFloat()).putFloat("lon", lon.toFloat()).apply()
        }
        runCatching {
            val best = lm.allProviders.mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }
            if (best != null) save(best.latitude, best.longitude)
            val provider = when {
                Build.VERSION.SDK_INT >= 31 && lm.allProviders.contains(LocationManager.FUSED_PROVIDER) -> LocationManager.FUSED_PROVIDER
                lm.allProviders.contains(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                else -> null
            }
            if (provider != null && Build.VERSION.SDK_INT >= 30) {
                lm.getCurrentLocation(provider, null, c.mainExecutor) { loc -> if (loc != null) save(loc.latitude, loc.longitude) }
            }
        }
    }

    /** ¿Ya se pidió el permiso una vez? (para no pedirlo en cada toque) */
    fun asked(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("asked", false)
    fun markAsked(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("asked", true).apply()
}

/** Pide el permiso de ubicación aproximada (para el punto «estás aquí» del mapa) */
class AskLocationActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), 1)
    }

    @Deprecated("Solo para el permiso")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        @Suppress("DEPRECATION")
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        finish()
    }
}
