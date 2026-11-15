package cl.carlospnauto.wear

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.res.painterResource
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyColumnDefaults
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Icon
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Estilo de la pantalla «Sonando» de la app del reloj: Moderno (carátula) o Retro LCD */
object AppStyle {
    val COLORS = listOf(
        "Ámbar" to Color(0xFFE8B04A),
        "Verde neón" to Color(0xFFB4FF3C),
        "Cian" to Color(0xFF4FE0F0),
        "Naranja" to Color(0xFFFF8A2A),
        "Rojo" to Color(0xFFFF5050),
        "Blanco" to Color(0xFFF2F2EC),
    )
    private val _style = MutableStateFlow(0)
    val style: StateFlow<Int> = _style
    private val _color = MutableStateFlow(0)
    val color: StateFlow<Int> = _color

    fun load(c: Context) {
        val p = c.getSharedPreferences("estilo", Context.MODE_PRIVATE)
        _style.value = p.getInt("estilo", 0)
        _color.value = p.getInt("color", 0).coerceIn(0, COLORS.size - 1)
    }

    fun setStyle(c: Context, v: Int) {
        _style.value = v
        c.getSharedPreferences("estilo", Context.MODE_PRIVATE).edit().putInt("estilo", v).apply()
    }

    fun nextColor(c: Context) {
        val v = (_color.value + 1) % COLORS.size
        _color.value = v
        c.getSharedPreferences("estilo", Context.MODE_PRIVATE).edit().putInt("color", v).apply()
    }
}

private val Frame = Color(0xFF8A8F86)
private val Dim = Color(0xFF9EA39A)

/** Rótulo vertical de los costados (como los botones de un reloj digital) que se puede tocar */
@Composable
private fun SideLabel(text: String, color: Color, deg: Float, onClick: () -> Unit, modifier: Modifier) {
    Box(modifier.size(width = 22.dp, height = 62.dp).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(
            text, color = color, fontSize = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false,
            modifier = Modifier.rotate(deg).requiredWidth(62.dp), textAlign = TextAlign.Center,
        )
    }
}

/**
 * Pantalla «Sonando» estilo reloj digital retro: marco octogonal, rótulos ADJUST, SELECT/MODE,
 * LIGHT, SET y MEMO a los costados (cada uno abre algo), la hora arriba, «NOW PLAYING», título,
 * artista, barra de avance, anterior / siguiente y el volumen. La corona o el bisel cambian el volumen.
 * ADJUST: biblioteca · SELECT/MODE: ver el video · LIGHT: me gusta · SET: volumen · MEMO: la lista.
 * Tocar el título: reproducir / pausar.
 */
@Composable
fun RetroNowScreen(onBrowse: () -> Unit, onVolume: () -> Unit, onQueue: () -> Unit, onVideo: () -> Unit, notice: @Composable () -> Unit) {
    val ctx = LocalContext.current
    val now by PhoneLink.now.collectAsState()
    val link by PhoneLink.link.collectAsState()
    val vol by PhoneLink.volume.collectAsState()
    val colorIdx by AppStyle.color.collectAsState()
    val acc = AppStyle.COLORS[colorIdx].second
    val focus = remember { FocusRequester() }
    val tick = remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        focus.requestFocus()
        PhoneLink.cmd(ctx, "vol")
        while (true) {
            delay(1000)
            tick.longValue = System.currentTimeMillis()
        }
    }
    val pos = if (now.positionMs < 0) 0L else if (now.playing) now.positionMs + (tick.longValue - now.startedAt).coerceAtLeast(0) else now.positionMs
    val progress = if (now.durationMs > 0) (pos.toFloat() / now.durationMs).coerceIn(0f, 1f) else 0f
    val send = { a: String -> PhoneLink.cmd(ctx, a) }
    val time = remember(tick.longValue / 1000) {
        SimpleDateFormat(if (android.text.format.DateFormat.is24HourFormat(ctx)) "HH:mm" else "h:mm", Locale.getDefault()).format(Date(tick.longValue))
    }

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
        RetroFrame(
            acc, vol,
            onAdjust = onBrowse, onMode = onVideo,
            onLight = { PhoneLink.optimistic { it.copy(liked = !it.liked) }; send("like") },
            onSet = onVolume, onMemo = onQueue,
        )

        if (link == Link.NoPhone || link == Link.AppClosed || link == Link.NoAnswer) {
            Box(Modifier.padding(horizontal = 40.dp)) { notice() }
            return@Box
        }

        // Contenido de la pantalla
        Column(Modifier.fillMaxWidth().padding(horizontal = 50.dp), horizontalAlignment = Alignment.Start) {
            Text(time, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.End))
            Spacer(Modifier.height(2.dp))
            Text(
                // El reproductor que suena (PulsoMusic o PulsoMedia)
                if (now.title.isBlank()) (if (link == Link.Searching) "CONECTANDO…" else ctx.getString(R.string.app_name).uppercase())
                else ctx.getString(R.string.app_name).uppercase() + if (now.playing) "" else " ❚❚",
                color = Color(0xFF3A3D40), fontSize = 17.sp, fontWeight = FontWeight.Black, maxLines = 1,
            )
            // Título: tocarlo reproduce o pausa
            Column(
                Modifier.fillMaxWidth().clickable {
                    PhoneLink.optimistic { it.copy(playing = !it.playing, positionMs = pos, startedAt = System.currentTimeMillis()) }
                    send(if (now.playing) "pause" else "play")
                },
            ) {
                Text(
                    now.title.ifBlank { "—" }.uppercase(), color = Color(0xFFF4F1E6), fontSize = 16.sp, fontWeight = FontWeight.Bold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 17.sp,
                )
                if (now.artist.isNotBlank()) Text(now.artist.uppercase(), color = Dim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(6.dp))
            // Barra de avance con su perilla
            Canvas(Modifier.fillMaxWidth().height(8.dp)) {
                val y = size.height / 2
                drawLine(Color(0xFF3A3D40), Offset(0f, y), Offset(size.width, y), strokeWidth = 3.dp.toPx(), cap = StrokeCap.Round)
                val x = size.width * progress
                if (progress > 0f) drawLine(acc, Offset(0f, y), Offset(x, y), strokeWidth = 3.dp.toPx(), cap = StrokeCap.Round)
                drawCircle(acc, 4.dp.toPx(), Offset(x.coerceAtLeast(4.dp.toPx()), y))
            }
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("<", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Light, modifier = Modifier.clickable { send("prev") }.padding(horizontal = 6.dp))
                    Text(if (now.playing) "❚❚" else "▶", color = acc, fontSize = 13.sp, modifier = Modifier.clickable {
                        PhoneLink.optimistic { it.copy(playing = !it.playing, positionMs = pos, startedAt = System.currentTimeMillis()) }
                        send(if (now.playing) "pause" else "play")
                    }.padding(horizontal = 4.dp))
                    Text(">", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Light, modifier = Modifier.clickable { send("next") }.padding(horizontal = 6.dp))
                }
                val v = vol?.first
                Text(if (v != null) "VOL $v" else "VOL", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clickable { onVolume() })
            }
        }
    }
}

/**
 * Marco Retro (igual en «Sonando» y en el menú): brillo del color alrededor, marco octogonal,
 * medidor de cuadritos (el volumen) y los rótulos ADJUST, SELECT/MODE, LIGHT, SET y MEMO, que son botones.
 */
@Composable
fun BoxScope.RetroFrame(
    acc: Color,
    vol: Pair<Int, Int>?,
    onAdjust: () -> Unit,
    onMode: () -> Unit,
    onLight: () -> Unit,
    onSet: () -> Unit,
    onMemo: () -> Unit,
) {
        // Brillo cálido alrededor y el marco octogonal (esquinas cortadas y redondeadas)
        Canvas(Modifier.fillMaxSize()) {
            val r = size.minDimension / 2
            drawCircle(Brush.radialGradient(listOf(Color.Transparent, acc.copy(alpha = 0.18f), Color.Transparent), center, r), r, center)
            val w = size.width * 0.80f
            val h = size.height * 0.66f
            val left = (size.width - w) / 2
            val top = (size.height - h) / 2
            val cut = w * 0.12f
            val path = androidx.compose.ui.graphics.Path().apply {
                moveTo(left + cut, top)
                lineTo(left + w - cut, top)
                quadraticTo(left + w - cut * 0.25f, top + cut * 0.1f, left + w, top + cut)
                lineTo(left + w, top + h - cut)
                quadraticTo(left + w - cut * 0.25f, top + h - cut * 0.1f, left + w - cut, top + h)
                lineTo(left + cut, top + h)
                quadraticTo(left + cut * 0.25f, top + h - cut * 0.1f, left, top + h - cut)
                lineTo(left, top + cut)
                quadraticTo(left + cut * 0.25f, top + cut * 0.1f, left + cut, top)
                close()
            }
            drawPath(path, Color(0xFF050505))
            drawPath(path, Frame, style = Stroke(width = 2.dp.toPx()))
            // Medidor de puntos junto a SELECT/MODE (el volumen)
            val (v, max) = vol ?: (0 to 0)
            val lit = if (max > 0) (v * 8f / max).toInt() else 0
            for (k in 0 until 8) {
                val y = size.height * 0.47f + k * size.height * 0.032f
                drawRect(
                    if (7 - k < lit) acc else Color(0xFF3A3D40),
                    topLeft = Offset(left + w * 0.085f, y),
                    size = Size(size.width * 0.016f, size.height * 0.018f),
                )
            }
        }

        // Rótulos de los costados (botones)
        SideLabel("ADJUST", Color(0xFFE8E8E0), 90f, onAdjust, Modifier.align(Alignment.CenterStart).offset(x = 22.dp, y = (-32).dp))
        SideLabel("SELECT/MODE", acc, 90f, onMode, Modifier.align(Alignment.CenterStart).offset(x = 22.dp, y = 34.dp))
        SideLabel("LIGHT", Color(0xFFE8E8E0), -90f, onLight, Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = (-38).dp))
        SideLabel("◄ SET ►", acc, -90f, onSet, Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = 10.dp))
        SideLabel("MEMO", Color(0xFFE8E8E0), -90f, onMemo, Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = 52.dp))

}

/** Ícono del menú Retro: el dibujo en el color elegido dentro de un cuadrito de contorno */
@Composable
private fun MenuIcon(icon: Int, acc: Color) {
    Box(
        Modifier.size(24.dp).border(1.5.dp, acc, RoundedCornerShape(5.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = acc, modifier = Modifier.size(14.dp))
    }
}

@Composable
private fun MenuRow(icon: Int, title: String, acc: Color, sub: String? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MenuIcon(icon, acc)
        Spacer(Modifier.width(10.dp))
        Column {
            Text(title, color = Color(0xFFF4F1E6), fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!sub.isNullOrBlank()) Text(sub, color = Dim, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * Menú con el estilo Retro (oscuro, marco y rótulos, «MENÚ» en el color elegido y una lista con
 * íconos de contorno). La corona o el bisel recorren la lista.
 */
@Composable
fun RetroMenuScreen(nav: (String) -> Unit, played: () -> Unit, search: () -> Unit, back: () -> Unit) {
    val ctx = LocalContext.current
    val lib by PhoneLink.library.collectAsState()
    val vol by PhoneLink.volume.collectAsState()
    val colorIdx by AppStyle.color.collectAsState()
    val style by AppStyle.style.collectAsState()
    val acc = AppStyle.COLORS[colorIdx].second
    val tick = remember { mutableLongStateOf(System.currentTimeMillis()) }
    val state = rememberScalingLazyListState()
    LaunchedEffect(Unit) {
        PhoneLink.browse(ctx)
        while (true) {
            delay(1000)
            tick.longValue = System.currentTimeMillis()
        }
    }
    val time = remember(tick.longValue / 1000) {
        SimpleDateFormat(if (android.text.format.DateFormat.is24HourFormat(ctx)) "HH:mm" else "h:mm", Locale.getDefault()).format(Date(tick.longValue))
    }
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        RetroFrame(
            acc, vol,
            onAdjust = back, onMode = { nav("library") },
            onLight = { AppStyle.nextColor(ctx) },
            onSet = { nav("volume") }, onMemo = { nav("queue") },
        )
        Text(time, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.TopEnd).padding(top = 44.dp, end = 52.dp))
        ScalingLazyColumn(
            state = state,
            modifier = Modifier.fillMaxWidth().padding(start = 50.dp, end = 44.dp, top = 70.dp, bottom = 44.dp),
            horizontalAlignment = Alignment.Start,
            autoCentering = null,
            scalingParams = ScalingLazyColumnDefaults.scalingParams(edgeScale = 0.92f, edgeAlpha = 0.6f),
        ) {
            item { Text("MENÚ", color = acc, fontSize = 22.sp, fontWeight = FontWeight.Black, modifier = Modifier.fillMaxWidth()) }
            item { MenuRow(R.drawable.ic_heart_filled, "Canciones", acc, lib?.let { "${it.total} me gusta" }) { nav("list/songs") } }
            item { MenuRow(R.drawable.ic_heart, "Favoritos", acc, "Radios favoritas") { nav("list/radios") } }
            item { MenuRow(R.drawable.ic_library, "Biblioteca", acc) { nav("library") } }
            item { MenuRow(R.drawable.ic_search, "Buscar", acc) { search() } }
            item { MenuRow(R.drawable.ic_shuffle, "Aleatorio", acc, "Toda tu biblioteca") { PhoneLink.play(ctx, "shuffle"); played() } }
            item { MenuRow(R.drawable.ic_queue, "En reproducción", acc) { nav("queue") } }
            item { MenuRow(R.drawable.ic_radio, "Radio por género", acc) { nav("list/genres") } }
            item { MenuRow(R.drawable.ic_radio, "NTS Radio", acc, "En vivo y mixtapes") { nav("list/nts") } }
            val mixes = lib?.mixes.orEmpty()
            if (mixes.isNotEmpty()) {
                item { Text("MEZCLAS", color = acc, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) }
                items(mixes.take(6)) { m -> MenuRow(R.drawable.ic_bars, m.title, acc, m.sub) { nav("group/mix/${android.net.Uri.encode(m.id)}") } }
            }
            val pls = lib?.playlists.orEmpty()
            if (pls.isNotEmpty()) {
                item { Text("PLAYLISTS", color = acc, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) }
                items(pls.take(6)) { pl -> MenuRow(R.drawable.ic_queue, pl.title, acc, pl.sub) { nav("group/playlist/${android.net.Uri.encode(pl.id)}") } }
            }
            item { Text("ESTILO", color = acc, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) }
            item { MenuRow(R.drawable.ic_bars, "Pantalla: ${if (style == 1) "Retro LCD" else "Moderna"}", acc, "Toca para cambiar") { AppStyle.setStyle(ctx, if (style == 1) 0 else 1) } }
            item { MenuRow(R.drawable.ic_bars, "Color: ${AppStyle.COLORS[colorIdx].first}", acc, "Toca para cambiar") { AppStyle.nextColor(ctx) } }
            item {
                val version = remember { runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "?" }
                Text("${ctx.getString(R.string.app_name)} reloj · $version", color = Dim, fontSize = 10.sp, modifier = Modifier.padding(top = 6.dp))
            }
        }
    }
}
