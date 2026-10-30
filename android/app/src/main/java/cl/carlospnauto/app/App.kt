package cl.carlospnauto.app

import android.app.Application
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import java.util.Locale

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // El extractor de YouTube trabaja desde el propio teléfono (su conexión no está bloqueada)
        val country = Locale.getDefault().country.ifBlank { "CL" }
        NewPipe.init(OkDownloader.instance, Localization("es", country), ContentCountry(country))
        AudioServer.start()
    }
}
