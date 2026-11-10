package cl.carlospnauto.wear

import android.app.Activity
import android.media.AudioManager
import android.view.WindowManager
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.Text

/**
 * Ver en el reloj el video de lo que suena. El teléfono se pausa y le pasa la dirección del video
 * (y la suya en el Wi-Fi por si el reloj no puede entrar directo). Al cerrarlo (deslizar), la
 * canción sigue en el teléfono desde el mismo segundo. Toque: pausa / sigue. Corona: volumen del reloj.
 */
@Composable
fun VideoScreen(close: () -> Unit) {
    val ctx = LocalContext.current
    val video by PhoneLink.video.collectAsState()
    LaunchedEffect(Unit) { PhoneLink.requestVideo(ctx) }
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        when (val v = video) {
            is WatchVideo.Ready -> VideoPlayer(v, close)
            is WatchVideo.Failed -> Message(v.message)
            else -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(modifier = Modifier.size(36.dp), indicatorColor = Color(0xFFA78BFA), strokeWidth = 3.dp)
                Spacer(Modifier.height(8.dp))
                Text("Preparando el video…", color = Color(0xFFB0B7C3), fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun Message(text: String) {
    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(painterResource(R.drawable.ic_video), contentDescription = null, modifier = Modifier.size(26.dp), tint = Color(0xFFB0B7C3))
        Spacer(Modifier.height(6.dp))
        Text(text, textAlign = TextAlign.Center, fontSize = 13.sp)
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun VideoPlayer(v: WatchVideo.Ready, close: () -> Unit) {
    val ctx = LocalContext.current
    var playing by remember { mutableStateOf(true) }
    var buffering by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val player = remember(v.url) {
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(v.ua.ifBlank { null })
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(20000)
        ExoPlayer.Builder(ctx).setMediaSourceFactory(DefaultMediaSourceFactory(http)).build().apply {
            setMediaItem(MediaItem.fromUri(v.url), (v.at * 1000).toLong().coerceAtLeast(0))
            playWhenReady = true
            prepare()
        }
    }
    DisposableEffect(player) {
        var triedLan = false
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = player.playWhenReady
            }

            override fun onPlaybackStateChanged(state: Int) {
                buffering = state == Player.STATE_BUFFERING
                if (state == Player.STATE_ENDED) close()
            }

            override fun onPlayerError(error: PlaybackException) {
                // Sin entrada directa a YouTube: por el teléfono (mismo Wi-Fi)
                if (!triedLan && v.lan.isNotBlank()) {
                    triedLan = true
                    val pos = player.currentPosition.takeIf { it > 0 } ?: (v.at * 1000).toLong()
                    player.setMediaItem(MediaItem.fromUri(v.lan), pos)
                    player.prepare()
                    player.play()
                } else failed = true
            }
        }
        player.addListener(listener)
        // Pantalla encendida mientras se ve el video
        val window = (ctx as? Activity)?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            PhoneLink.endVideo(ctx, v.id, player.currentPosition / 1000.0)
            player.removeListener(listener)
            player.release()
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
    LaunchedEffect(Unit) { focus.requestFocus() }
    val audio = remember { ctx.getSystemService(AudioManager::class.java) }

    if (failed) Message("No se pudo ver el video en el reloj. Revisa que tenga internet o el mismo Wi-Fi del teléfono.")
    else Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .onRotaryScrollEvent {
                audio?.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (it.verticalScrollPixels > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
                true
            }
            .focusRequester(focus)
            .focusable()
            .clickable {
                if (player.playWhenReady) player.pause() else player.play()
                playing = player.playWhenReady
            },
        contentAlignment = Alignment.Center,
    ) {
        AndroidView(
            factory = { c ->
                PlayerView(c).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    this.player = player
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
        if (buffering) CircularProgressIndicator(modifier = Modifier.size(32.dp), indicatorColor = Color(0xFFA78BFA), strokeWidth = 3.dp)
        else if (!playing)
            Box(Modifier.size(52.dp).background(Color(0x99000000), androidx.compose.foundation.shape.CircleShape), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_play), contentDescription = "Seguir", modifier = Modifier.size(28.dp))
            }
    }
}
