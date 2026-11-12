package cl.carlospnauto.esfera

import android.content.Context
import android.graphics.Color
import android.graphics.RectF
import android.view.SurfaceHolder
import androidx.wear.watchface.CanvasComplicationFactory
import androidx.wear.watchface.ComplicationSlot
import androidx.wear.watchface.ComplicationSlotsManager
import androidx.wear.watchface.TapEvent
import androidx.wear.watchface.TapType
import androidx.wear.watchface.WatchFace
import androidx.wear.watchface.WatchFaceService
import androidx.wear.watchface.WatchFaceType
import androidx.wear.watchface.WatchState
import androidx.wear.watchface.complications.ComplicationSlotBounds
import androidx.wear.watchface.complications.DefaultComplicationDataSourcePolicy
import androidx.wear.watchface.complications.SystemDataSources
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.rendering.CanvasComplicationDrawable
import androidx.wear.watchface.complications.rendering.ComplicationDrawable
import androidx.wear.watchface.complications.rendering.ComplicationStyle
import androidx.wear.watchface.style.CurrentUserStyleRepository
import cl.carlospnauto.esfera.comun.Action
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Spot

/** Preferencias de la esfera (las comparten la esfera y la pantalla de personalizar) */
object Prefs {
    const val FILE = "esfera"
    const val COMPASS = "compass"
    fun of(c: Context) = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    fun compass(c: Context) = of(c).getBoolean(COMPASS, false)
    fun setCompass(c: Context, on: Boolean) = of(c).edit().putBoolean(COMPASS, on).apply()
}

/** Círculo derecho: un dato a elegir (clima, batería, pasos…). Por defecto, la batería */
const val RIGHT_SLOT_ID = 100

/** Lo que cambia Personalizar: brújula, dato del círculo derecho y accesos a PulsoMedia y PulsoMusic */
object Config : FaceConfig {
    override val slots = listOf(RIGHT_SLOT_ID to "Dato del círculo derecho")
    override val spots = listOf(
        Spot(-0.42f, 0.42f, Action.MEDIA, "Acceso izquierdo"),
        Spot(0.42f, 0.42f, Action.MUSIC, "Acceso derecho"),
    )
    override val compass = true
}

class ExplorerWatchFaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        val factory = CanvasComplicationFactory { watchState, listener ->
            val drawable = ComplicationDrawable(this).apply {
                listOf(activeStyle, ambientStyle).forEachIndexed { i, s -> style(s, ambient = i == 1) }
            }
            CanvasComplicationDrawable(drawable, watchState, listener)
        }
        // Mismo lugar que el círculo derecho que dibuja la esfera (centro x 0.69, y 0.51)
        val right = ComplicationSlot.createRoundRectComplicationSlotBuilder(
            RIGHT_SLOT_ID,
            factory,
            listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE, ComplicationType.SMALL_IMAGE),
            DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_WATCH_BATTERY, ComplicationType.SHORT_TEXT),
            ComplicationSlotBounds(RectF(0.605f, 0.425f, 0.775f, 0.595f)),
        ).build()
        return ComplicationSlotsManager(listOf(right), currentUserStyleRepository)
    }

    private fun style(s: ComplicationStyle, ambient: Boolean) {
        s.backgroundColor = Color.TRANSPARENT
        s.borderStyle = ComplicationStyle.BORDER_STYLE_NONE
        s.textColor = if (ambient) Color.LTGRAY else Color.rgb(230, 230, 220)
        s.titleColor = if (ambient) Color.GRAY else Color.rgb(166, 173, 138)
        s.iconColor = if (ambient) Color.LTGRAY else Color.rgb(206, 140, 96)
        s.rangedValuePrimaryColor = if (ambient) Color.LTGRAY else Color.rgb(206, 140, 96)
        s.rangedValueSecondaryColor = Color.rgb(60, 64, 50)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = ExplorerRenderer(this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository)
        return WatchFace(WatchFaceType.ANALOG, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos, 0.10f)
                if (i >= 0) {
                    Shortcuts.open(this@ExplorerWatchFaceService, i, Config.spots[i])
                } else if (renderer.isOnBezel(tapEvent.xPos, tapEvent.yPos)) {
                    Prefs.setCompass(this@ExplorerWatchFaceService, !Prefs.compass(this@ExplorerWatchFaceService))
                }
            }
        })
    }
}
