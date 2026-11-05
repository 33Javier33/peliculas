package cl.carlospnauto.wear

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.app.RemoteInput
import androidx.wear.input.RemoteInputIntentHelper
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
        // Wear OS 4+: permiso para el evento en curso «Sonando» (el ícono de la esfera que abre esta app)
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        setContent { MaterialTheme { App() } }
    }

    @Deprecated("Solo para el permiso de notificaciones")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        @Suppress("DEPRECATION")
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val n = PhoneLink.now.value
        if (grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED && n.title.isNotBlank())
            NowNotice.show(this, n.title, n.artist, n.playing)
    }
}

@Composable
private fun App() {
    val nav = rememberSwipeDismissableNavController()
    val toNow = { nav.popBackStack("now", false); Unit }
    SwipeDismissableNavHost(navController = nav, startDestination = "now") {
        composable("now") { NowScreen(onBrowse = { nav.navigate("home") }, onVolume = { nav.navigate("volume") }, onQueue = { nav.navigate("queue") }) }
        composable("queue") { QueueScreen(played = toNow) }
        composable("volume") { VolumeScreen() }
        composable("home") { HomeScreen(nav = { nav.navigate(it) }, played = toNow) }
        composable("library") { LibraryScreen(nav = { nav.navigate(it) }) }
        composable("search") { SearchScreen(played = toNow) }
        composable("list/{kind}") { e -> ListScreen(kind = e.arguments?.getString("kind") ?: "songs", nav = { nav.navigate(it) }, played = toNow) }
        composable("group/{kind}/{id}") { e ->
            GroupScreen(kind = e.arguments?.getString("kind") ?: "", id = Uri.decode(e.arguments?.getString("id") ?: ""), played = toNow)
        }
    }
}

@Composable
private fun NowScreen(onBrowse: () -> Unit, onVolume: () -> Unit, onQueue: () -> Unit) {
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
                    PhoneLink.volumeStep(ctx, it.verticalScrollPixels > 0)
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
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Round(if (now.liked) R.drawable.ic_heart_filled else R.drawable.ic_heart, "Me gusta", 32) {
                            PhoneLink.optimistic { it.copy(liked = !it.liked) }
                            send("like")
                        }
                        Round(R.drawable.ic_queue, "Lista en reproducción", 32) { onQueue() }
                        Round(R.drawable.ic_volume, "Volumen", 32) { onVolume() }
                        Round(R.drawable.ic_library, "Biblioteca", 32) { onBrowse() }
                    }
                }
            }
        }
    }
}

/** Lo que está sonando (la cola del teléfono): se ve dónde va y se elige cualquier canción */
@Composable
private fun QueueScreen(played: () -> Unit) {
    val ctx = LocalContext.current
    val group by PhoneLink.group.collectAsState()
    val now by PhoneLink.now.collectAsState()
    val state = rememberScalingLazyListState()
    // Se vuelve a pedir al cambiar de canción (la cola avanza sola)
    LaunchedEffect(now.title) { PhoneLink.openQueue(ctx) }
    val songs = group?.takeIf { it.kind == "queue" }?.items
    val current = songs?.indexOfFirst { it.sub.startsWith("▶") } ?: -1
    LaunchedEffect(current) { if (current > 0) state.scrollToItem(current + 1) }
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(state) }) {
        ScalingLazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
            item { ListHeader { Text("En reproducción") } }
            when {
                songs == null -> item { Text("Cargando…", color = Grey) }
                songs.isEmpty() -> item { Text("No hay nada en la cola", color = Grey, textAlign = TextAlign.Center) }
                else -> items(songs) { s ->
                    Entry(img = s.img, title = s.title, sub = s.sub.ifBlank { null }, accent = s.sub.startsWith("▶")) {
                        PhoneLink.playFrom(ctx, "queue", s.id)
                        played()
                    }
                }
            }
        }
    }
}

/** Volumen del teléfono: − y + grandes, el nivel en el anillo y la corona o el bisel */
@Composable
private fun VolumeScreen() {
    val ctx = LocalContext.current
    val vol by PhoneLink.volume.collectAsState()
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        focus.requestFocus()
        PhoneLink.cmd(ctx, "vol")
    }
    Scaffold(timeText = { TimeText() }) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black)
                .onRotaryScrollEvent {
                    PhoneLink.volumeStep(ctx, it.verticalScrollPixels > 0)
                    true
                }
                .focusRequester(focus)
                .focusable(),
            contentAlignment = Alignment.Center,
        ) {
            val (v, max) = vol ?: (0 to 0)
            CircularProgressIndicator(
                progress = if (max > 0) v.toFloat() / max else 0f,
                modifier = Modifier.fillMaxSize().padding(4.dp),
                strokeWidth = 8.dp,
                indicatorColor = Violet,
                trackColor = Color(0x33FFFFFF),
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(painterResource(R.drawable.ic_volume), contentDescription = null, modifier = Modifier.size(22.dp), tint = Color(0xFFB0B7C3))
                Text(
                    if (max > 0) "${(v * 100f / max).toInt()}%" else "…",
                    fontWeight = FontWeight.Bold, fontSize = 26.sp,
                )
                Text("Volumen del teléfono", color = Color(0xFFB0B7C3), fontSize = 11.sp)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Round(R.drawable.ic_minus, "Bajar volumen", 52) { PhoneLink.volumeStep(ctx, false) }
                    Round(R.drawable.ic_plus, "Subir volumen", 52, Violet) { PhoneLink.volumeStep(ctx, true) }
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

// ===== Biblioteca (como en Spotify: inicio, biblioteca y listas con carátulas) =====

/** Lanzador de la búsqueda: el reloj ofrece dictar o escribir */
@Composable
private fun rememberSearch(searched: () -> Unit): () -> Unit {
    val ctx = LocalContext.current
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val q = res.data?.let { RemoteInput.getResultsFromIntent(it)?.getCharSequence("q")?.toString()?.trim() }
        if (!q.isNullOrEmpty()) {
            PhoneLink.searchArchive(ctx, q)
            searched()
        }
    }
    return {
        val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
        RemoteInputIntentHelper.putRemoteInputsExtra(intent, listOf(RemoteInput.Builder("q").setLabel("Artista, banda o disco").build()))
        runCatching { ask.launch(intent) }
    }
}

@Composable
private fun HomeScreen(nav: (String) -> Unit, played: () -> Unit) {
    val ctx = LocalContext.current
    val lib by PhoneLink.library.collectAsState()
    val state = rememberScalingLazyListState()
    LaunchedEffect(Unit) { PhoneLink.browse(ctx) }
    val search = rememberSearch { nav("search") }
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(state) }) {
        ScalingLazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
            // Arriba: buscar y biblioteca
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill(R.drawable.ic_search, "Buscar") { search() }
                    Pill(R.drawable.ic_library, "Biblioteca") { nav("library") }
                }
            }
            item {
                Entry(icon = R.drawable.ic_heart_filled, title = "Tus me gusta", sub = lib?.let { "${it.total} canciones" }, accent = true) { nav("list/songs") }
            }
            item {
                Entry(icon = R.drawable.ic_shuffle, title = "Aleatorio", sub = "Toda tu biblioteca") {
                    PhoneLink.play(ctx, "shuffle")
                    played()
                }
            }
            val mixes = lib?.mixes.orEmpty()
            if (mixes.isNotEmpty()) {
                item { ListHeader { Text("Tus mezclas") } }
                items(mixes.take(6)) { m -> Entry(img = m.img, title = m.title, sub = m.sub) { nav("group/mix/${Uri.encode(m.id)}") } }
            }
            val pls = lib?.playlists.orEmpty()
            if (pls.isNotEmpty()) {
                item { ListHeader { Text("Tus playlists") } }
                items(pls.take(4)) { p -> Entry(img = p.img, title = p.title, sub = p.sub) { nav("group/playlist/${Uri.encode(p.id)}") } }
            }
            item { ListHeader { Text("Radios") } }
            item { Entry(icon = R.drawable.ic_radio, title = "Radio por género", sub = "Internet Archive") { nav("list/genres") } }
            item { Entry(icon = R.drawable.ic_radio, title = "NTS Radio", sub = "En vivo y mixtapes") { nav("list/nts") } }
            item { Entry(icon = R.drawable.ic_heart, title = "Radios favoritas", sub = lib?.let { "${it.radios.size}" }) { nav("list/radios") } }
        }
    }
}

@Composable
private fun LibraryScreen(nav: (String) -> Unit) {
    val lib by PhoneLink.library.collectAsState()
    val state = rememberScalingLazyListState()
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(state) }) {
        ScalingLazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
            item { ListHeader { Text("Biblioteca") } }
            item { Entry(icon = R.drawable.ic_list, title = "Playlists", sub = lib?.let { "${it.playlists.size}" }) { nav("list/playlists") } }
            item { Entry(icon = R.drawable.ic_artist, title = "Artistas", sub = lib?.let { "${it.artists.size}" }) { nav("list/artists") } }
            item { Entry(icon = R.drawable.ic_album, title = "Álbumes", sub = lib?.let { "${it.albums.size}" }) { nav("list/albums") } }
            item { Entry(icon = R.drawable.ic_music, title = "Canciones", sub = lib?.let { "${it.total}" }) { nav("list/songs") } }
            item { Entry(icon = R.drawable.ic_shuffle, title = "Mezclas por género", sub = lib?.let { "${it.mixes.size}" }) { nav("list/mixes") } }
        }
    }
}

@Composable
private fun SearchScreen(played: () -> Unit) {
    val ctx = LocalContext.current
    val search by PhoneLink.search.collectAsState()
    val state = rememberScalingLazyListState()
    val results = search?.second
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(state) }) {
        ScalingLazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
            item { ListHeader { Text(search?.first ?: "Buscar", maxLines = 1, overflow = TextOverflow.Ellipsis) } }
            when {
                results == null -> item { Text("Buscando en Internet Archive…", color = Grey, textAlign = TextAlign.Center) }
                results.isEmpty() -> item { Text("Sin resultados. Prueba con otro nombre.", color = Grey, textAlign = TextAlign.Center) }
                else -> items(results) { r ->
                    Entry(title = r.title, sub = r.sub.ifBlank { null }, img = "https://archive.org/services/img/${r.id}") {
                        PhoneLink.play(ctx, "archive", r.id)
                        played()
                    }
                }
            }
        }
    }
}

/** Una lista de la biblioteca. Artistas, álbumes, playlists y mezclas se abren; lo demás suena al tocarlo */
@Composable
private fun ListScreen(kind: String, nav: (String) -> Unit, played: () -> Unit) {
    val ctx = LocalContext.current
    val lib by PhoneLink.library.collectAsState()
    val state = rememberScalingLazyListState()
    val (title, items) = when (kind) {
        "playlists" -> "Playlists" to lib?.playlists
        "artists" -> "Artistas" to lib?.artists
        "albums" -> "Álbumes" to lib?.albums
        "mixes" -> "Mezclas" to lib?.mixes
        "genres" -> "Radio por género" to lib?.genres
        "nts" -> "NTS Radio" to lib?.nts
        "radios" -> "Radios favoritas" to lib?.radios
        else -> "Tus me gusta" to lib?.songs
    }
    val opens = mapOf("playlists" to "playlist", "artists" to "artist", "albums" to "album", "mixes" to "mix")
    val plays = mapOf("genres" to "genre", "nts" to "nts", "radios" to "radio", "songs" to "song")
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(state) }) {
        ScalingLazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
            item { ListHeader { Text(title) } }
            when {
                items == null -> item { Text("Cargando…", color = Grey) }
                items.isEmpty() -> item { Text("Nada por aquí todavía", color = Grey, textAlign = TextAlign.Center) }
                else -> items(items) { it ->
                    val open = opens[kind]
                    Entry(title = it.title, sub = it.sub.ifBlank { null }, img = it.img, round = kind == "artists") {
                        if (open != null) nav("group/$open/${Uri.encode(it.id)}")
                        else {
                            PhoneLink.play(ctx, plays[kind] ?: "song", it.id)
                            played()
                        }
                    }
                }
            }
        }
    }
}

/** Un artista, disco, playlist o mezcla: sus canciones, con reproducir y aleatorio arriba */
@Composable
private fun GroupScreen(kind: String, id: String, played: () -> Unit) {
    val ctx = LocalContext.current
    val group by PhoneLink.group.collectAsState()
    val lib by PhoneLink.library.collectAsState()
    val state = rememberScalingLazyListState()
    LaunchedEffect(kind, id) { PhoneLink.openGroup(ctx, kind, id) }
    val songs = group?.takeIf { it.kind == kind && it.id == id }?.items
    val name = when (kind) {
        "playlist" -> lib?.playlists?.find { it.id == id }?.title
        "mix" -> lib?.mixes?.find { it.id == id }?.title
        "album" -> id.substringBefore("||")
        else -> id
    } ?: id
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(state) }) {
        ScalingLazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
            item { ListHeader { Text(name, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center) } }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill(R.drawable.ic_play, "Reproducir", Violet) {
                        PhoneLink.playFrom(ctx, kind, id)
                        played()
                    }
                    Pill(R.drawable.ic_shuffle, "Aleatorio") {
                        PhoneLink.playFrom(ctx, kind, id, shuffle = true)
                        played()
                    }
                }
            }
            when {
                songs == null -> item { Text("Cargando…", color = Grey) }
                songs.isEmpty() -> item { Text("Sin canciones", color = Grey) }
                else -> items(songs) { t ->
                    Entry(title = t.title, sub = t.sub.ifBlank { null }, img = t.img) {
                        PhoneLink.playFrom(ctx, kind, id, start = t.id)
                        played()
                    }
                }
            }
        }
    }
}

private val Grey = Color(0xFFB0B7C3)

/** Botón redondo con ícono (arriba de las listas, como en Spotify) */
@Composable
private fun Pill(icon: Int, label: String, color: Color = Color(0xFF2A2C3A), onClick: () -> Unit) {
    Button(onClick = onClick, modifier = Modifier.size(width = 64.dp, height = 44.dp), colors = ButtonDefaults.buttonColors(backgroundColor = color)) {
        Icon(painterResource(icon), contentDescription = label, modifier = Modifier.size(22.dp))
    }
}

/** Carátula chica (la descarga y achica el teléfono) */
@Composable
private fun Thumb(url: String, round: Boolean) {
    val ctx = LocalContext.current
    val thumbs by PhoneLink.thumbs.collectAsState()
    LaunchedEffect(url) { PhoneLink.thumb(ctx, url) }
    val shape = if (round) CircleShape else RoundedCornerShape(6.dp)
    val bmp = thumbs[url]
    Box(Modifier.size(36.dp).clip(shape).background(Color(0xFF2A2C3A)), contentAlignment = Alignment.Center) {
        if (bmp != null) Image(bmp, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        else Icon(painterResource(R.drawable.ic_music), contentDescription = null, modifier = Modifier.size(18.dp), tint = Grey)
    }
}

@Composable
private fun Entry(
    title: String,
    sub: String? = null,
    icon: Int? = null,
    img: String = "",
    round: Boolean = false,
    accent: Boolean = false,
    onClick: () -> Unit,
) {
    val slot: (@Composable BoxScope.() -> Unit)? = when {
        img.startsWith("http") -> { { Thumb(img, round) } }
        icon != null -> { { Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(22.dp), tint = if (accent) Color(0xFF34D399) else Color.White) } }
        else -> null
    }
    Chip(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        icon = slot,
        label = { Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis, color = if (accent) Color(0xFF34D399) else Color.White) },
        secondaryLabel = sub?.let { { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis, color = Grey) } },
        colors = ChipDefaults.chipColors(backgroundColor = Color(0xFF1E2030)),
    )
}
