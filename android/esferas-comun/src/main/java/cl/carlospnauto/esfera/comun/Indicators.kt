package cl.carlospnauto.esfera.comun

import android.app.AlarmManager
import android.content.Context
import android.net.ConnectivityManager
import java.time.ZonedDateTime

/** Indicadores de los relojes digitales: ALM (hay alarma puesta), SIG (con conexión) y DST (horario de verano) */
object Indicators {
    fun alarm(c: Context): Boolean = runCatching { c.getSystemService(AlarmManager::class.java)?.nextAlarmClock != null }.getOrDefault(false)

    fun online(c: Context): Boolean = runCatching { c.getSystemService(ConnectivityManager::class.java)?.activeNetwork != null }.getOrDefault(false)

    fun dst(t: ZonedDateTime): Boolean = t.zone.rules.isDaylightSavings(t.toInstant())
}
