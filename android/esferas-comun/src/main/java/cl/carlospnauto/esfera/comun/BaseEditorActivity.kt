package cl.carlospnauto.esfera.comun

import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.wear.watchface.editor.EditorSession
import kotlinx.coroutines.launch

/**
 * Personalizar (mantener presionada la esfera → engranaje): el dato de cada círculo, qué abre cada
 * acceso directo (PulsoMedia, PulsoMusic, alarmas…) y, si tiene, la brújula.
 */
abstract class BaseEditorActivity : ComponentActivity() {
    abstract val config: FaceConfig
    private var session: EditorSession? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.widthPixels * 0.12f).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad, pad, pad)
        }
        fun title(t: String, size: Float = 14f) = column.addView(TextView(this).apply {
            text = t
            textSize = size
            gravity = Gravity.CENTER
            setPadding(0, pad / 3, 0, pad / 6)
        })
        title(applicationInfo.loadLabel(packageManager).toString(), 16f)

        if (config.compass) {
            val b = Button(this)
            fun label() { b.text = "Brújula al norte: " + if (FacePrefs.of(this).getBoolean(FacePrefs.COMPASS, false)) "Sí" else "No" }
            label()
            b.setOnClickListener {
                val p = FacePrefs.of(this)
                p.edit().putBoolean(FacePrefs.COMPASS, !p.getBoolean(FacePrefs.COMPASS, false)).apply()
                label()
            }
            column.addView(b)
        }

        if (config.spots.isNotEmpty()) {
            title("Accesos directos (toca para cambiar)")
            for ((i, spot) in config.spots.withIndex()) {
                val b = Button(this)
                fun label() { b.text = "${spot.name}: ${Shortcuts.get(this, i, spot).label}" }
                label()
                b.setOnClickListener {
                    val all = Action.entries
                    val next = all[(all.indexOf(Shortcuts.get(this, i, spot)) + 1) % all.size]
                    Shortcuts.set(this, i, next)
                    label()
                }
                column.addView(b)
            }
        }

        val dataButtons = if (config.slots.isNotEmpty()) {
            title("Datos de los círculos")
            config.slots.map { (id, name) ->
                Button(this).apply {
                    text = name
                    isEnabled = false
                    setOnClickListener { lifecycleScope.launch { session?.openComplicationDataSourceChooser(id) } }
                }.also { column.addView(it) }
            }
        } else emptyList()

        column.addView(Button(this).apply {
            text = "Listo"
            setOnClickListener { finish() }
        })
        title(Brand.NAME, 11f)
        setContentView(ScrollView(this).apply { addView(column) })

        lifecycleScope.launch {
            session = runCatching { EditorSession.createOnWatchEditorSession(this@BaseEditorActivity) }.getOrNull()
            dataButtons.forEach { it.isEnabled = session != null }
        }
    }

    override fun onDestroy() {
        runCatching { session?.close() }
        super.onDestroy()
    }
}
