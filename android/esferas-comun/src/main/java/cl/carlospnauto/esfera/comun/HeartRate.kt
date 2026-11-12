package cl.carlospnauto.esfera.comun

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Resources
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.wear.watchface.ComplicationSlotsManager
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import java.time.Instant

/** Ritmo cardíaco del sensor del reloj (con el permiso dado en Personalizar), solo mientras se mira la esfera */
class HeartRate(private val context: Context) : SensorEventListener {
    private val sm = context.getSystemService(SensorManager::class.java)
    private val sensor = sm?.getDefaultSensor(Sensor.TYPE_HEART_RATE)
    private var on = false

    @Volatile var bpm = 0
        private set

    fun update(active: Boolean) {
        val allowed = context.checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED
        val want = active && allowed && sensor != null
        if (want == on) return
        on = want
        if (want) sm?.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL) else sm?.unregisterListener(this)
    }

    fun stop() {
        sm?.unregisterListener(this)
        on = false
    }

    override fun onSensorChanged(e: SensorEvent) {
        val v = e.values.firstOrNull()?.toInt() ?: return
        if (v in 30..230) bpm = v
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}

/** Texto de un dato elegido (ritmo, pasos, clima…) o null si no hay */
fun ComplicationSlotsManager.textOf(id: Int, res: Resources): String? {
    val d = complicationSlots[id]?.complicationData?.value ?: return null
    val t = when (d) {
        is ShortTextComplicationData -> d.text.getTextAt(res, Instant.now())
        is RangedValueComplicationData -> d.text?.getTextAt(res, Instant.now()) ?: d.value.toInt().toString()
        else -> null
    }
    return t?.toString()?.takeIf { it.isNotBlank() }
}
