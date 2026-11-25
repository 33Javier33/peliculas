package cl.carlospnauto.app

import android.app.Application
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import java.util.Locale

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // Si la app se cierra por un error, se anota (la página lo manda al panel de administración
        // la próxima vez que se abre, para poder arreglarlo)
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            runCatching {
                val trace = e.stackTrace.take(6).joinToString(" ← ") { "${it.className.substringAfterLast('.')}.${it.methodName}:${it.lineNumber}" }
                getSharedPreferences("cpn-crash", MODE_PRIVATE).edit()
                    .putString("last", "${e.javaClass.simpleName}: ${e.message ?: ""} · $trace · v${BuildConfig.VERSION_NAME}".take(480))
                    .commit()
            }
            prev?.uncaughtException(t, e)
        }
        // El extractor de YouTube trabaja desde el propio teléfono (su conexión no está bloqueada)
        val country = Locale.getDefault().country.ifBlank { "CL" }
        NewPipe.init(OkDownloader.instance, Localization("es", country), ContentCountry(country))
        AudioServer.appContext = applicationContext
        AudioServer.start()
    }
}
