package cl.carlospnauto.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.lang.ref.WeakReference

/**
 * La app: muestra la app web dentro de un WebView y le suma lo que el navegador no puede
 * (audio de YouTube desde el teléfono, seguir sonando bloqueado, notificación con controles).
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private var fullView: View? = null
    private var fullCallback: WebChromeClient.CustomViewCallback? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        val uris = when {
            data?.clipData != null -> Array(data.clipData!!.itemCount) { data.clipData!!.getItemAt(it).uri }
            data?.data != null -> arrayOf(data.data!!)
            else -> null
        }
        fileCallback?.onReceiveValue(uris)
        fileCallback = null
    }

    private val askPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {}

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this)
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        current = WeakReference(this)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            setGeolocationEnabled(true)
            // La web sabe que está dentro de la app
            userAgentString = "$userAgentString CPNApp/${BuildConfig.VERSION_NAME}"
        }
        web.addJavascriptInterface(NativeBridge(applicationContext), "CPNNative")
        // Al salir de la app o bloquear, Android le baja la prioridad a la web y el audio se traba
        // un momento: se mantiene con prioridad alta también en segundo plano
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val host = Uri.parse(BuildConfig.WEB_URL).host
                // La app se queda adentro; otros enlaces se abren afuera
                if (url.host == host || url.scheme == "about") return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // Pantalla completa de los videos
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                fullView?.let { onHideCustomView() }
                fullView = view
                fullCallback = callback
                root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                WindowInsetsControllerCompat(window, root).apply {
                    hide(WindowInsetsCompat.Type.systemBars())
                    systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            }

            override fun onHideCustomView() {
                fullView?.let { root.removeView(it) }
                fullView = null
                fullCallback?.onCustomViewHidden()
                fullCallback = null
                WindowInsetsControllerCompat(window, root).show(WindowInsetsCompat.Type.systemBars())
            }

            // "Agregar música" (archivos del teléfono)
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = params.createIntent().putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                return runCatching { pickFiles.launch(intent); true }.getOrElse { fileCallback = null; false }
            }

            // "Radios cerca de mí"
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                callback.invoke(origin, true, false)
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    fullView != null -> web.webChromeClient?.onHideCustomView()
                    web.canGoBack() -> web.goBack()
                    else -> moveTaskToBack(true) // la música sigue sonando
                }
            }
        })

        requestStartupPermissions()
        val start = intent?.data?.takeIf { it.host == Uri.parse(BuildConfig.WEB_URL).host }?.toString() ?: BuildConfig.WEB_URL
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(start)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.takeIf { it.host == Uri.parse(BuildConfig.WEB_URL).host }?.let { web.loadUrl(it.toString()) }
    }

    private fun requestStartupPermissions() {
        val wanted = mutableListOf(Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
        val missing = wanted.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) askPermissions.launch(missing.toTypedArray())
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    // Importante: NO se pausa el WebView al salir de la app ni al bloquear (así la música sigue)

    override fun onDestroy() {
        if (current?.get() === this) current = null
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private var current: WeakReference<MainActivity>? = null
        private val main = Handler(Looper.getMainLooper())

        /** Botones de la notificación / pantalla bloqueada / auriculares → app web */
        fun sendAction(action: String) {
            main.post {
                current?.get()?.web?.evaluateJavascript(
                    "window.__cpnNativeAction && window.__cpnNativeAction('$action')", null
                )
            }
        }
    }
}
