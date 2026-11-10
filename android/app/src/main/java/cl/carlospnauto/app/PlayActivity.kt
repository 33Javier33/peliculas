package cl.carlospnauto.app

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager

/**
 * «Play» del widget (y de la notificación en Android 12 o anterior). Es una pantalla invisible que
 * no se puede tocar (los toques pasan a lo que está debajo): mientras está abierta la app cuenta
 * como «en uso», así Android la despierta aunque lleve horas en pausa y la deja sonar al instante.
 * - App abierta: le pide que suene y se cierra apenas suena de verdad.
 * - Si a los 3 s no suena (el teléfono cerró la página): trae la app un momento para que la página
 *   cargue y suene (Android no deja empezar audio en una página que cargó escondida) y la app
 *   vuelve sola al fondo.
 * - App cerrada del todo: la abre igual, suena y vuelve al fondo.
 */
class PlayActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private var asked = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) setShowWhenLocked(true)
        @Suppress("DEPRECATION") overridePendingTransition(0, 0)
        asked = System.currentTimeMillis()
        if (!MainActivity.isOpen()) {
            runCatching { startActivity(MainActivity.widgetPlayIntent(this)) }
            finish()
            return
        }
        MainActivity.play(this, fromScreen = true)
        waitSound(0)
    }

    private fun waitSound(n: Int) {
        main.postDelayed({
            if (isFinishing) return@postDelayed
            when {
                MainActivity.soundingSince(asked) -> finish()
                n >= 11 -> {
                    // No suena: la app se muestra un instante, suena y vuelve al fondo
                    runCatching { startActivity(MainActivity.frontPlayIntent(this)) }
                    finish()
                }
                else -> waitSound(n + 1)
            }
        }, 250)
    }

    override fun finish() {
        super.finish()
        @Suppress("DEPRECATION") overridePendingTransition(0, 0)
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
