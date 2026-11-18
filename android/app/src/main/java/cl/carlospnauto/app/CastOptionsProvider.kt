package cl.carlospnauto.app

import android.content.Context
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider

/**
 * Chromecast: el receptor propio de la app (en la TV dice «PulsoMedia» o «PulsoMusic», con su
 * logo) si se registró su ID; si no, el receptor estándar de Google («Default Media Receiver»).
 * Los dos reproducen videos, música y radios por su dirección.
 */
class CastOptionsProvider : OptionsProvider {
    override fun getCastOptions(context: Context): CastOptions =
        CastOptions.Builder().setReceiverApplicationId(BuildConfig.CAST_APP_ID.ifBlank { CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID }).build()

    override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null
}
