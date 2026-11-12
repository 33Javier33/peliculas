package cl.carlospnauto.esfera

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * Brújula (hacia dónde apunta las 12 del reloj, en grados desde el norte magnético) y altitud
 * (por la presión del barómetro). Solo se escuchan con la esfera visible y encendida: no gasta batería.
 */
class Sensors(context: Context, private val onChange: () -> Unit) : SensorEventListener {
    private val sm = context.getSystemService(SensorManager::class.java)
    private val rotation = sm?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val accel = sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val magnet = sm?.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    private val pressure = sm?.getDefaultSensor(Sensor.TYPE_PRESSURE)

    val hasCompass = rotation != null || (accel != null && magnet != null)

    /** Grados (0 = norte) hacia donde apuntan las 12; null si aún no hay lectura */
    @Volatile var azimuth: Float? = null
        private set

    /** Metros sobre el nivel del mar (aproximado); null sin barómetro */
    @Volatile var altitude: Float? = null
        private set

    private var compassOn = false
    private var altitudeOn = false
    private val grav = FloatArray(3)
    private val geo = FloatArray(3)
    private var hasGrav = false
    private var hasGeo = false
    private val rot = FloatArray(9)
    private val orient = FloatArray(3)

    fun update(compass: Boolean, active: Boolean) {
        val wantCompass = compass && active && hasCompass
        val wantAltitude = active && pressure != null
        if (wantCompass != compassOn) {
            compassOn = wantCompass
            if (wantCompass) {
                if (rotation != null) {
                    sm?.registerListener(this, rotation, SensorManager.SENSOR_DELAY_UI)
                } else {
                    sm?.registerListener(this, accel, SensorManager.SENSOR_DELAY_UI)
                    sm?.registerListener(this, magnet, SensorManager.SENSOR_DELAY_UI)
                }
            } else {
                rotation?.let { sm?.unregisterListener(this, it) }
                accel?.let { sm?.unregisterListener(this, it) }
                magnet?.let { sm?.unregisterListener(this, it) }
                hasGrav = false
                hasGeo = false
            }
        }
        if (wantAltitude != altitudeOn) {
            altitudeOn = wantAltitude
            if (wantAltitude) sm?.registerListener(this, pressure, 1_000_000, 2_000_000)
            else sm?.unregisterListener(this, pressure)
        }
    }

    fun stop() {
        sm?.unregisterListener(this)
        compassOn = false
        altitudeOn = false
    }

    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_PRESSURE -> {
                altitude = SensorManager.getAltitude(SensorManager.PRESSURE_STANDARD_ATMOSPHERE, e.values[0])
                onChange()
                return
            }
            Sensor.TYPE_ROTATION_VECTOR -> SensorManager.getRotationMatrixFromVector(rot, e.values)
            Sensor.TYPE_ACCELEROMETER -> {
                System.arraycopy(e.values, 0, grav, 0, 3)
                hasGrav = true
                if (!hasGeo || !SensorManager.getRotationMatrix(rot, null, grav, geo)) return
            }
            Sensor.TYPE_MAGNETIC_FIELD -> {
                System.arraycopy(e.values, 0, geo, 0, 3)
                hasGeo = true
                if (!hasGrav || !SensorManager.getRotationMatrix(rot, null, grav, geo)) return
            }
            else -> return
        }
        SensorManager.getOrientation(rot, orient)
        val deg = Math.toDegrees(orient[0].toDouble()).toFloat()
        azimuth = (deg + 360f) % 360f
        onChange()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
