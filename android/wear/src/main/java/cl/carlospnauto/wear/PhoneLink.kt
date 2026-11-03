package cl.carlospnauto.wear

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
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
    /** Búsqueda en Internet Archive: lo buscado y sus resultados (null = buscando) */
    private val _search = MutableStateFlow<Pair<String, List<Item>?>?>(null)
    val search: StateFlow<Pair<String, List<Item>?>?> = _search

    fun searchArchive(c: Context, q: String) {
        _search.value = q to null
        cmd(c, "search") { put("q", q) }
    }

    /** Carátula de lo que suena (la manda el teléfono: el reloj no la descarga de internet) */
    private val _art = MutableStateFlow<ImageBitmap?>(null)
    val art: StateFlow<ImageBitmap?> = _art

    // Las órdenes se mandan aquí, no en la pantalla: al elegir una radio la lista se cierra y,
    // si el envío dependía de ella, se cortaba a medias ("Sin conexión con el teléfono")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private suspend fun send(c: Context, json: JSONObject): Boolean {
        val nodes = try {
            Wearable.getNodeClient(c).connectedNodes.await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emptyList()
        }
        if (nodes.isEmpty()) {
            _link.value = Link.NoPhone
            return false
        }
        val bytes = json.toString().toByteArray()
        var ok = false
        for (n in nodes) {
            ok = try {
                Wearable.getMessageClient(c).sendMessage(n.id, "/cpn/cmd", bytes).await()
                true
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ok
            }
        }
        if (!ok) _link.value = Link.NoPhone
        return ok
    }

    fun cmd(c: Context, a: String, extra: (JSONObject.() -> Unit)? = null) {
        val app = c.applicationContext
        val json = JSONObject().put("a", a).apply { extra?.invoke(this) }
        scope.launch { send(app, json) }
    }

    fun hello(c: Context) = cmd(c, "hello")

    fun browse(c: Context) = cmd(c, "browse")

    fun play(c: Context, kind: String, id: String = "") {
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
            "/cpn/art" -> {
                _art.value = if (e.data.isEmpty()) null
                else runCatching { BitmapFactory.decodeByteArray(e.data, 0, e.data.size)?.asImageBitmap() }.getOrNull()
            }
            "/cpn/search" -> {
                val o = runCatching { JSONObject(text) }.getOrNull() ?: return
                val a = o.optJSONArray("results") ?: JSONArray()
                val list = (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { Item(it.optString("id"), it.optString("t"), it.optString("s")) } }
                _search.value = o.optString("q") to list
            }
            "/cpn/played" -> {
                _busy.value = false
                _link.value = Link.Ok
            }
            "/cpn/closed" -> {
                _busy.value = false
                _link.value = Link.AppClosed
            }
        }
    }
}
