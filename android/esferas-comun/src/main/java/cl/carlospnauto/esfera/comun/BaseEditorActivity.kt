package cl.carlospnauto.esfera.comun

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import androidx.wear.watchface.RenderParameters
import androidx.wear.watchface.editor.EditorSession
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Personalizar (mantener presionada la esfera → engranaje). Arriba la esfera en vivo; abajo tarjetas
 * por sección (colores y estilo, accesos, datos). Al tocar una tarjeta se abre la lista de opciones
 * con su muestra de color y la elegida marcada; al elegir, vuelve y la vista previa se actualiza.
 */
abstract class BaseEditorActivity : ComponentActivity() {
    abstract val config: FaceConfig
    private var session: EditorSession? = null
    private lateinit var scroll: ScrollView
    private var preview: ImageView? = null
    private var inPicker = false

    private val bg = Color.BLACK
    private val card = Color.rgb(30, 32, 36)
    private val cardOn = Color.rgb(48, 52, 60)
    private val accent = Color.rgb(140, 200, 255)

    private val askHeart = registerForActivityResult(ActivityResultContracts.RequestPermission()) { showMain() }

    private fun dp(v: Float) = v * resources.displayMetrics.density

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        scroll = ScrollView(this).apply {
            setBackgroundColor(bg)
            isVerticalScrollBarEnabled = false
            isFocusable = true
            isFocusableInTouchMode = true
        }
        setContentView(scroll)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (inPicker) showMain() else finish()
            }
        })
        showMain()
        lifecycleScope.launch {
            session = runCatching { EditorSession.createOnWatchEditorSession(this@BaseEditorActivity) }.getOrNull()
            showMain()
        }
    }

    override fun onDestroy() {
        runCatching { session?.close() }
        super.onDestroy()
    }

    // ---------- piezas ----------

    private fun column(): LinearLayout {
        val w = resources.displayMetrics.widthPixels
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            // Márgenes para pantallas redondas: nada queda cortado por el borde
            setPadding((w * 0.11f).toInt(), (w * 0.12f).toInt(), (w * 0.11f).toInt(), (w * 0.22f).toInt())
        }
    }

    private fun section(col: LinearLayout, title: String) {
        col.addView(TextView(this).apply {
            text = title.uppercase()
            textSize = 11f
            letterSpacing = 0.12f
            setTextColor(Color.rgb(140, 145, 150))
            setPadding(0, dp(14f).toInt(), 0, dp(6f).toInt())
            gravity = Gravity.CENTER
        })
    }

    private fun rounded(color: Int, radius: Float) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius
    }

    /** Tarjeta: título, valor debajo y, a la derecha, una muestra de color o una flecha */
    private fun row(col: LinearLayout, title: String, value: String?, swatch: Int?, checked: Boolean = false, onClick: (() -> Unit)?) {
        val r = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(if (checked) cardOn else card, dp(22f))
            setPadding(dp(14f).toInt(), dp(10f).toInt(), dp(12f).toInt(), dp(10f).toInt())
            isClickable = onClick != null
            if (onClick != null) setOnClickListener { onClick() }
        }
        val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(TextView(this).apply {
            text = title
            textSize = 14f
            setTextColor(if (onClick == null) Color.GRAY else Color.WHITE)
        })
        if (!value.isNullOrEmpty()) texts.addView(TextView(this).apply {
            text = value
            textSize = 12f
            setTextColor(accent)
        })
        r.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val end: View = when {
            checked -> TextView(this).apply { text = "✓"; textSize = 16f; setTextColor(accent) }
            swatch != null -> View(this).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(swatch)
                    setStroke(dp(1.5f).toInt(), Color.rgb(90, 90, 90))
                }
            }
            onClick != null -> TextView(this).apply { text = "›"; textSize = 20f; setTextColor(Color.rgb(120, 120, 120)) }
            else -> View(this)
        }
        val size = dp(20f).toInt()
        r.addView(end, if (swatch != null && !checked) LinearLayout.LayoutParams(size, size) else LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        col.addView(r, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(6f).toInt() })
    }

    private fun isColor(v: Int) = Color.alpha(v) == 255

    // ---------- pantalla principal ----------

    private fun showMain() {
        inPicker = false
        val col = column()
        // Esfera en vivo
        val w = resources.displayMetrics.widthPixels
        val img = ImageView(this).apply {
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) = outline.setOval(0, 0, view.width, view.height)
            }
            clipToOutline = true
            setBackgroundColor(Color.rgb(20, 20, 20))
        }
        preview = img
        col.addView(img, LinearLayout.LayoutParams((w * 0.5f).toInt(), (w * 0.5f).toInt()))
        col.addView(TextView(this).apply {
            text = applicationInfo.loadLabel(packageManager)
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, dp(8f).toInt(), 0, 0)
        })

        if (config.compass || config.choices.isNotEmpty()) section(col, "Estilo")
        if (config.compass) {
            val on = FacePrefs.of(this).getBoolean(FacePrefs.COMPASS, false)
            row(col, "Brújula al norte", if (on) "Sí" else "No", null) {
                picker("Brújula al norte", listOf("Sí" to 1, "No" to 0), if (on) 0 else 1) { i ->
                    FacePrefs.of(this).edit().putBoolean(FacePrefs.COMPASS, i == 0).apply()
                }
            }
        }
        for (ch in config.choices) {
            val i = Choices.index(this, ch)
            val (name, v) = ch.options[i]
            row(col, ch.name, name, if (isColor(v)) v else null) {
                picker(ch.name, ch.options, i) { pick ->
                    FacePrefs.of(this).edit().putInt("opt_${ch.key}", pick).apply()
                }
            }
        }

        if (config.heartRate) {
            section(col, "Salud")
            val ok = checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED
            row(col, "Ritmo cardíaco", if (ok) "Permitido: lo lee el sensor" else "Toca para permitir", null, onClick = if (ok) null else ({ askHeart.launch(Manifest.permission.BODY_SENSORS); Unit }))
        }

        if (config.spots.isNotEmpty()) {
            section(col, "Accesos")
            for ((k, spot) in config.spots.withIndex()) {
                val cur = Shortcuts.get(this, k, spot)
                row(col, spot.name, cur.label, null) {
                    val all = Action.entries
                    picker(spot.name, all.map { it.label to 0 }, all.indexOf(cur)) { pick -> Shortcuts.set(this, k, all[pick]) }
                }
            }
        }

        if (config.slots.isNotEmpty()) {
            section(col, "Datos")
            for ((id, name) in config.slots) {
                row(col, name, if (session == null) "Abriendo…" else "Elegir el dato", null, onClick = if (session == null) null else ({
                    lifecycleScope.launch {
                        session?.openComplicationDataSourceChooser(id)
                        refreshPreview()
                    }
                    Unit
                }))
            }
        }

        col.addView(TextView(this).apply {
            text = "Listo"
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(Color.BLACK)
            background = rounded(accent, dp(24f))
            setPadding(0, dp(10f).toInt(), 0, dp(10f).toInt())
            setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(14f).toInt() })
        col.addView(TextView(this).apply {
            text = Brand.NAME
            textSize = 9f
            letterSpacing = 0.12f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(110, 110, 110))
            setPadding(0, dp(10f).toInt(), 0, 0)
        })

        scroll.removeAllViews()
        scroll.addView(col)
        scroll.requestFocus()
        refreshPreview()
    }

    // ---------- lista de opciones ----------

    private fun picker(title: String, options: List<Pair<String, Int>>, selected: Int, onPick: (Int) -> Unit) {
        inPicker = true
        val col = column()
        col.addView(TextView(this).apply {
            text = title
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(8f).toInt())
        })
        for ((i, o) in options.withIndex()) {
            row(col, o.first, null, if (isColor(o.second)) o.second else null, checked = i == selected) {
                onPick(i)
                showMain()
            }
        }
        row(col, "‹ Volver", null, null) { showMain() }
        scroll.removeAllViews()
        scroll.addView(col)
        scroll.scrollTo(0, 0)
        scroll.requestFocus()
    }

    /** La esfera tal como queda (la dibuja la misma esfera con lo elegido) */
    private fun refreshPreview() {
        val s = session ?: return
        lifecycleScope.launch {
            delay(120)
            val bmp: Bitmap? = runCatching {
                s.renderWatchFaceToBitmap(RenderParameters.DEFAULT_INTERACTIVE, Instant.now(), null)
            }.getOrNull()
            if (bmp != null) preview?.setImageBitmap(bmp)
        }
    }
}
