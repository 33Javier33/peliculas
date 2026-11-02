package cl.carlospnauto.wear

import android.content.Context
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject

/** Lo que suena en el teléfono */
data class NowPlaying(
    val title: String = "",
    val artist: String = "",
    val artwork: String = "",
    val playing: Boolean = false,
    val liked: Boolean = false,
    val positionMs: Long = -1,
    val durationMs: Long = 0,
    /** Hora (reloj del teléfono) en que la canción estaba en el segundo 0 */
    val startedAt: Long = 0,
)

data class Item(val id: String, val title: String, val sub: String)

data class Library(
    val songs: List<Item> = emptyList(),
    val playlists: List<Item> = emptyList(),
    val genres: List<Item> = emptyList(),
    val nts: List<Item> = emptyList(),
    val radios: List<Item> = emptyList(),
    val total: Int = 0,
)

enum class Link { Searching, NoPhone, AppClosed, Ok }

/**
 * Conexión con la app del teléfono (Wearable Data Layer): manda órdenes ("/cpn/cmd") y recibe lo
 * que suena ("/cpn/state"), la biblioteca ("/cpn/library") y si la app está cerrada ("/cpn/closed").
 */
object PhoneLink : MessageClient.OnMessageReceivedListener {
    private val _now = MutableStateFlow(NowPlaying())
    val now: StateFlow<NowPlaying> = _now
    private val _library = MutableStateFlow<Library?>(null)
    val library: StateFlow<Library?> = _library
    private val _link = MutableStateFlow(Link.Searching)
    val link: StateFlow<Link> = _link
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy

    suspend fun send(c: Context, json: JSONObject): Boolean {
        val nodes = runCatching { Wearable.getNodeClient(c).connectedNodes.await() }.getOrDefault(emptyList())
        if (nodes.isEmpty()) {
            _link.value = Link.NoPhone
            return false
        }
        val bytes = json.toString().toByteArray()
        var ok = false
        for (n in nodes) ok = runCatching { Wearable.getMessageClient(c).sendMessage(n.id, "/cpn/cmd", bytes).await() }.isSuccess || ok
        if (!ok) _link.value = Link.NoPhone
        return ok
    }

    suspend fun cmd(c: Context, a: String, extra: (JSONObject.() -> Unit)? = null) =
        send(c, JSONObject().put("a", a).apply { extra?.invoke(this) })

    suspend fun hello(c: Context) = cmd(c, "hello")

    suspend fun browse(c: Context) = cmd(c, "browse")

    suspend fun play(c: Context, kind: String, id: String = "") {
        _busy.value = true
        cmd(c, "play") { put("k", kind); put("id", id) }
    }

    /** Al tocar ♥ o reproducir/pausar se ve el cambio al tiro (el teléfono lo confirma después) */
    fun optimistic(f: (NowPlaying) -> NowPlaying) {
        _now.value = f(_now.value)
    }

    override fun onMessageReceived(e: MessageEvent) {
        val text = String(e.data)
        when (e.path) {
            "/cpn/state" -> {
                val o = runCatching { JSONObject(text) }.getOrNull() ?: return
                _link.value = Link.Ok
                if (!o.has("title")) return
                _now.value = NowPlaying(
                    title = o.optString("title"),
                    artist = o.optString("artist"),
                    artwork = o.optString("artwork"),
                    playing = o.optBoolean("playing"),
                    liked = o.optBoolean("liked"),
                    positionMs = o.optLong("position", -1),
                    durationMs = o.optLong("duration", 0),
                    startedAt = o.optLong("at", 0),
                )
            }
            "/cpn/library" -> {
                val o = runCatching { JSONObject(text) }.getOrNull() ?: return
                _link.value = Link.Ok
                fun list(k: String) = (o.optJSONArray(k) ?: JSONArray()).let { a ->
                    (0 until a.length()).mapNotNull { i ->
                        a.optJSONObject(i)?.let { Item(it.optString("id"), it.optString("t"), it.optString("s")) }
                    }
                }
                _library.value = Library(list("songs"), list("playlists"), list("genres"), list("nts"), list("radios"), o.optInt("total"))
            }
            "/cpn/played" -> _busy.value = false
            "/cpn/closed" -> {
                _busy.value = false
                _link.value = Link.AppClosed
            }
        }
    }
}
