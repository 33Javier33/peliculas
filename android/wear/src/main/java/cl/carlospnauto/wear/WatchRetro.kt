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
        SideLabel("ADJUST", Color(0xFFE8E8E0), 90f, onBrowse, Modifier.align(Alignment.CenterStart).offset(x = 22.dp, y = (-32).dp))
        SideLabel("SELECT/MODE", acc, 90f, onVideo, Modifier.align(Alignment.CenterStart).offset(x = 22.dp, y = 34.dp))
        SideLabel("LIGHT", Color(0xFFE8E8E0), -90f, { PhoneLink.optimistic { it.copy(liked = !it.liked) }; send("like") }, Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = (-38).dp))
        SideLabel("◄ SET ►", acc, -90f, onVolume, Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = 10.dp))
        SideLabel("MEMO", Color(0xFFE8E8E0), -90f, onQueue, Modifier.align(Alignment.CenterEnd).offset(x = (-22).dp, y = 52.dp))

        if (link == Link.NoPhone || link == Link.AppClosed || link == Link.NoAnswer) {
            Box(Modifier.padding(horizontal = 40.dp)) { notice() }
            return@Box
        }

        // Contenido de la pantalla
        Column(Modifier.fillMaxWidth().padding(horizontal = 50.dp), horizontalAlignment = Alignment.Start) {
            Text(time, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.End))
            Spacer(Modifier.height(2.dp))
            Text(
                if (now.playing) "NOW PLAYING" else if (now.title.isBlank()) (if (link == Link.Searching) "CONECTANDO…" else "SIN MÚSICA") else "PAUSED",
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
