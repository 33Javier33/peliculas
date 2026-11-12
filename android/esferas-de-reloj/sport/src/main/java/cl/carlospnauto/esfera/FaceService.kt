package cl.carlospnauto.esfera

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
import androidx.wear.watchface.style.CurrentUserStyleRepository
import cl.carlospnauto.esfera.comun.Action
import cl.carlospnauto.esfera.comun.Choice
import cl.carlospnauto.esfera.comun.Choices
import cl.carlospnauto.esfera.comun.FaceConfig
import cl.carlospnauto.esfera.comun.Shortcuts
import cl.carlospnauto.esfera.comun.Spot
import cl.carlospnauto.esfera.comun.SportColors
import cl.carlospnauto.esfera.comun.SportRenderer

private const val HEART = 101
private const val STEPS = 102

/** Toques: la hora y los minutos abren PulsoMedia y PulsoMusic (o lo que elijas); la batería, su pantalla */
private val SPOTS = listOf(
    Spot(-0.36f, 0.05f, Action.MEDIA, "Toque en la hora", hit = 0.30f),
    Spot(0.28f, -0.08f, Action.MUSIC, "Toque en los minutos", hit = 0.20f),
    Spot(0.70f, -0.02f, Action.BATTERY, "Toque en la batería", hit = 0.15f),
)

private const val WATCH_ICON = false

/** 9 temas: el color de la hora, las marcas, la fecha y la raya */
private val THEMES = listOf(
    "Naranja" to Color.rgb(255, 140, 26),
    "Celeste" to Color.rgb(62, 166, 255),
    "Verde claro" to Color.rgb(108, 212, 108),
    "Amarillo" to Color.rgb(245, 230, 30),
    "Blanco" to Color.WHITE,
    "Verde" to Color.rgb(40, 224, 40),
    "Azul" to Color.rgb(47, 123, 255),
    "Turquesa" to Color.rgb(63, 197, 197),
    "Durazno" to Color.rgb(232, 180, 140),
)
private val THEME = Choice("tema", "Tema", THEMES)

object Config : FaceConfig {
    override val slots = listOf(HEART to "Ritmo cardíaco", STEPS to "Pasos")
    override val spots = SPOTS
    override val choices = listOf(THEME)
    override val heartRate = true
}

private fun colors(c: android.content.Context): SportColors {
    val a = Choices.value(c, THEME)
    return SportColors(hour = a, minute = Color.WHITE, date = a, line = a, data = Color.WHITE, ticks = a)
}

class FaceService : WatchFaceService() {

    override fun createComplicationSlotsManager(currentUserStyleRepository: CurrentUserStyleRepository): ComplicationSlotsManager {
        // Los datos se dibujan con las letras de la esfera; el círculo solo da el valor y abre su app al tocarlo
        val factory = CanvasComplicationFactory { watchState, listener -> CanvasComplicationDrawable(ComplicationDrawable(this), watchState, listener) }
        val types = listOf(ComplicationType.SHORT_TEXT, ComplicationType.RANGED_VALUE)
        val heart = ComplicationSlot.createRoundRectComplicationSlotBuilder(
            HEART, factory, types,
            // Sin dato elegido, la esfera lee el sensor de ritmo (si se permitió en Personalizar)
            DefaultComplicationDataSourcePolicy(),
            ComplicationSlotBounds(RectF(0.32f, 0.71f, 0.49f, 0.86f)),
        ).build()
        val steps = ComplicationSlot.createRoundRectComplicationSlotBuilder(
            STEPS, factory, types,
            DefaultComplicationDataSourcePolicy(SystemDataSources.DATA_SOURCE_STEP_COUNT, ComplicationType.SHORT_TEXT),
            ComplicationSlotBounds(RectF(0.51f, 0.71f, 0.85f, 0.86f)),
        ).build()
        return ComplicationSlotsManager(listOf(heart, steps), currentUserStyleRepository)
    }

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val renderer = SportRenderer(
            this, surfaceHolder, watchState, complicationSlotsManager, currentUserStyleRepository,
            HEART, STEPS, WATCH_ICON,
        ) { colors(this) }
        return WatchFace(WatchFaceType.DIGITAL, renderer).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP || complicationSlot != null) return
                val i = Shortcuts.hit(Config.spots, renderer.lastBounds, tapEvent.xPos, tapEvent.yPos)
                if (i >= 0) Shortcuts.open(this@FaceService, i, Config.spots[i])
            }
        })
    }
}
