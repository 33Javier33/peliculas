package cl.carlospnauto.esfera.comun

import android.content.Context
import java.time.ZonedDateTime

/** Segundero suave (corre continuo) o por segundos; se elige en Personalizar */
object Smooth {
    val CHOICE = Choice("segundero", "Segundero", listOf("Suave (continuo)" to 0, "Por segundos" to 1))

    fun on(c: Context) = Choices.value(c, CHOICE) == 0

    /** Segundos con decimales si es suave (para que la aguja o la marca no salte) */
    fun seconds(c: Context, t: ZonedDateTime) = if (on(c)) t.second + t.nano / 1e9f else t.second.toFloat()

    /** Cada cuánto se redibuja mientras se mira (suave: 25 veces por segundo; en reposo, nada) */
    fun delay(c: Context) = if (on(c)) 40L else 1000L
}
