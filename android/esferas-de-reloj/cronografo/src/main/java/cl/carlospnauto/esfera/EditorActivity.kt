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

/** Personalizar la esfera: qué dato muestra cada círculo (clima, ritmo cardíaco, pasos, batería…) */
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
        val buttons = SLOTS.map { (id, label) ->
            Button(this).apply {
                text = label
                isEnabled = false
                setOnClickListener { lifecycleScope.launch { session?.openComplicationDataSourceChooser(id) } }
            }.also { column.addView(it) }
        }
        column.addView(Button(this).apply {
            text = getString(R.string.done)
            setOnClickListener { finish() }
        })
        setContentView(ScrollView(this).apply { addView(column) })

        lifecycleScope.launch {
            session = runCatching { EditorSession.createOnWatchEditorSession(this@EditorActivity) }.getOrNull()
            buttons.forEach { it.isEnabled = session != null }
        }
    }

    override fun onDestroy() {
        runCatching { session?.close() }
        super.onDestroy()
    }
}
