package cl.carlospnauto.esfera

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

/** Personalizar la esfera: brújula al norte (sí/no) y qué dato muestra el círculo derecho (clima, batería…) */
class EditorActivity : ComponentActivity() {
    private var session: EditorSession? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.widthPixels * 0.12f).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad, pad, pad)
        }
        column.addView(TextView(this).apply {
            text = getString(R.string.editor_title)
            textSize = 16f
            gravity = Gravity.CENTER
        })
        val compass = Button(this)
        fun label() { compass.text = getString(if (Prefs.compass(this)) R.string.compass_on else R.string.compass_off) }
        label()
        compass.setOnClickListener {
            Prefs.setCompass(this, !Prefs.compass(this))
            label()
        }
        column.addView(compass)
        val pick = Button(this).apply {
            text = getString(R.string.pick_data)
            isEnabled = false
            setOnClickListener {
                lifecycleScope.launch { session?.openComplicationDataSourceChooser(RIGHT_SLOT_ID) }
            }
        }
        column.addView(pick)
        column.addView(Button(this).apply {
            text = getString(R.string.done)
            setOnClickListener { finish() }
        })
        column.addView(TextView(this).apply {
            text = getString(R.string.editor_hint)
            textSize = 12f
            gravity = Gravity.CENTER
        })
        setContentView(ScrollView(this).apply { addView(column) })

        lifecycleScope.launch {
            session = runCatching { EditorSession.createOnWatchEditorSession(this@EditorActivity) }.getOrNull()
            pick.isEnabled = session != null
        }
    }

    override fun onDestroy() {
        runCatching { session?.close() }
        super.onDestroy()
    }
}
