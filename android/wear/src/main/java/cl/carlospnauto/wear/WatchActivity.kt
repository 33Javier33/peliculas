package cl.carlospnauto.wear

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import androidx.wear.remote.interactions.RemoteActivityHelper
import androidx.compose.foundation.Image
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.Executors

private val Violet = Color(0xFF8B5CF6)
private val Pink = Color(0xFFF472B6)

class WatchActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Mientras la app del reloj está abierta: escucha al teléfono y le avisa cada minuto
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) {
                Wearable.getMessageClient(this@WatchActivity).addListener(PhoneLink)
                try {
                    PhoneLink.hello(this@WatchActivity)
                    PhoneLink.browse(this@WatchActivity)
                    while (true) {
                        delay(60_000)
                        PhoneLink.hello(this@WatchActivity)
                    }
                } finally {
                    Wearable.getMessageClient(this@WatchActivity).removeListener(PhoneLink)
                }
            }
        }
        setContent { MaterialTheme { App() } }
    }
}

@Composable
private fun App() {
    val nav = rememberSwipeDismissableNavController()
    SwipeDismissableNavHost(navController = nav, startDestination = "now") {
        composable("now") { NowScreen(onBrowse = { nav.navigate("browse") }) }
        composable("browse") { BrowseScreen(open = { nav.navigate("list/$it") }, played = { nav.popBackStack("now", false) }) }
        composable("list/{kind}") { e ->
            ListScreen(kind = e.arguments?.getString("kind") ?: "songs", played = { nav.popBackStack("now", false) })
        }
    }
}

// ===== Lo que suena =====
@Composable
private fun NowScreen(onBrowse: () -> Unit) {
    val ctx = LocalContext.current
    val now by PhoneLink.now.collectAsState()
    val link by PhoneLink.link.collectAsState()
    val focus = remember { FocusRequester() }
    // Avance de la canción (el teléfono manda el segundo; aquí se hace avanzar solo)
    val tick = remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        focus.requestFocus()
        while (true) {
            delay(1000)
            tick.longValue = System.currentTimeMillis()
        }
    }
    val pos = if (now.positionMs < 0) 0L else if (now.playing) now.positionMs + (tick.longValue - now.startedAt).coerceAtLeast(0) else now.positionMs
    val progress = if (now.durationMs > 0) (pos.toFloat() / now.durationMs).coerceIn(0f, 1f) else 0f
    val art by PhoneLink.art.collectAsState()
    val send = { a: String -> PhoneLink.cmd(ctx, a) }

    Scaffold(timeText = { TimeText() }) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black)
                // Bisel o corona: volumen del teléfono
                .onRotaryScrollEvent {
                    send(if (it.verticalScrollPixels > 0) "vol+" else "vol-")
                    true
                }
                .focusRequester(focus)
                .focusable(),
            contentAlignment = Alignment.Center,
        ) {
            art?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
            Box(Modifier.fillMaxSize().background(Brush.radialGradient(listOf(Color(0xAA000000), Color(0xEE000000)))))
            if (now.durationMs > 0) {
                CircularProgressIndicator(
                    progress = progress,
                    modifier = Modifier.fillMaxSize().padding(2.dp),
                    strokeWidth = 4.dp,
                    indicatorColor = Violet,
                    trackColor = Color(0x33FFFFFF),
                )
            }

            when (link) {
                Link.AppClosed -> Notice("Abre la app en el teléfono", "Abrir en el teléfono") { openOnPhone(ctx) }
                Link.NoPhone -> Notice("Sin conexión con el teléfono", "Reintentar") { PhoneLink.hello(ctx) }
                else -> Column(
                    Modifier.fillMaxWidth().padding(horizontal = 22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        now.title.ifBlank { if (link == Link.Searching) "Conectando…" else "Nada sonando" },
                        fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                    )
                    Text(now.artist, color = Color(0xFFB0B7C3), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Round(R.drawable.ic_prev, "Anterior", 40) { send("prev") }
                        Round(if (now.playing) R.drawable.ic_pause else R.drawable.ic_play, if (now.playing) "Pausar" else "Reproducir", 56, Violet) {
                            PhoneLink.optimistic { it.copy(playing = !it.playing, positionMs = pos, startedAt = System.currentTimeMillis()) }
                            send(if (now.playing) "pause" else "play")
                        }
                        Round(R.drawable.ic_next, "Siguiente", 40) { send("next") }
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Round(if (now.liked) R.drawable.ic_heart_filled else R.drawable.ic_heart, "Me gusta", 34) {
                            PhoneLink.optimistic { it.copy(liked = !it.liked) }
                            send("like")
                        }
                        Round(R.drawable.ic_list, "Biblioteca", 34) { onBrowse() }
                    }
                }
            }
        }
    }
}

@Composable
private fun Round(icon: Int, label: String, size: Int, color: Color = Color(0x33FFFFFF), onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.size(size.dp),
        colors = ButtonDefaults.buttonColors(backgroundColor = color),
    ) {
        Icon(painterResource(icon), contentDescription = label, modifier = Modifier.size((size * 0.48f).dp))
    }
}

@Composable
private fun Notice(text: String, action: String, onClick: () -> Unit) {
    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(painterResource(R.drawable.ic_phone), contentDescription = null, modifier = Modifier.size(28.dp))
        Spacer(Modifier.height(6.dp))
        Text(text, textAlign = TextAlign.Center, fontSize = 14.sp)
        Spacer(Modifier.height(8.dp))
        Chip(onClick = onClick, label = { Text(action) }, colors = ChipDefaults.primaryChipColors(backgroundColor = Violet))
    }
}

/** Abre la app en el teléfono (el teléfono pide desbloquear si hace falta) */
private fun openOnPhone(ctx: android.content.Context) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("carlospnauto://abrir")).addCategory(Intent.CATEGORY_BROWSABLE)
    runCatching { RemoteActivityHelper(ctx, Executors.newSingleThreadExecutor()).startRemoteActivity(intent) }
}

// ===== Biblioteca =====
@Composable
private fun BrowseScreen(open: (String) -> Unit, played: () -> Unit) {
    val ctx = LocalContext.current
    val lib by PhoneLink.library.collectAsState()
    val state = rememberScalingLazyListState()
    LaunchedEffect(Unit) { PhoneLink.browse(ctx) }
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(state) }) {
        ScalingLazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
            item { ListHeader { Text("Tu música") } }
            item {
                Entry(R.drawable.ic_shuffle, "Aleatorio", lib?.let { "${it.total} canciones de tu biblioteca" } ?: "Tu biblioteca", Violet) {
                    PhoneLink.play(ctx, "shuffle")
                    played()
                }
            }
            item { Entry(R.drawable.ic_music, "Canciones", lib?.let { "${it.songs.size} recientes" }) { open("songs") } }
            item { Entry(R.drawable.ic_list, "Playlists", lib?.let { "${it.playlists.size}" }) { open("playlists") } }
            item { ListHeader { Text("Radios") } }
            item { Entry(R.drawable.ic_radio, "Radio por género", "Internet Archive") { open("genres") } }
            item { Entry(R.drawable.ic_radio, "NTS Radio", "En vivo y mixtapes") { open("nts") } }
            item { Entry(R.drawable.ic_heart_filled, "Radios favoritas", lib?.let { "${it.radios.size}" }) { open("radios") } }
        }
    }
}

@Composable
private fun ListScreen(kind: String, played: () -> Unit) {
    val ctx = LocalContext.current
    val lib by PhoneLink.library.collectAsState()
    val state = rememberScalingLazyListState()
    val (title, items, playKind) = when (kind) {
        "playlists" -> Triple("Playlists", lib?.playlists, "playlist")
        "genres" -> Triple("Radio por género", lib?.genres, "genre")
        "nts" -> Triple("NTS Radio", lib?.nts, "nts")
        "radios" -> Triple("Radios favoritas", lib?.radios, "radio")
        else -> Triple("Canciones", lib?.songs, "song")
    }
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(state) }) {
        ScalingLazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
            item { ListHeader { Text(title) } }
            when {
                items == null -> item { Text("Cargando…", color = Color(0xFFB0B7C3)) }
                items.isEmpty() -> item { Text("Nada por aquí todavía", color = Color(0xFFB0B7C3), textAlign = TextAlign.Center) }
                else -> items(items) { it ->
                    Entry(null, it.title, it.sub) {
                        PhoneLink.play(ctx, playKind, it.id)
                        played()
                    }
                }
            }
        }
    }
}

@Composable
private fun Entry(icon: Int?, title: String, sub: String? = null, color: Color = Color(0xFF1E2030), onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        icon = icon?.let { { Icon(painterResource(it), contentDescription = null, modifier = Modifier.size(20.dp)) } },
        label = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        secondaryLabel = sub?.let { { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis, color = Color(0xFFB0B7C3)) } },
        colors = ChipDefaults.chipColors(backgroundColor = color),
    )
}
