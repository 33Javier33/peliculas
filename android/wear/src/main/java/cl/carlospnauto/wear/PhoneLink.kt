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

data class Item(val id: String, val title: String, val sub: String, val img: String = "")

data class Library(
    val songs: List<Item> = emptyList(),
    val playlists: List<Item> = emptyList(),
    val artists: List<Item> = emptyList(),
    val albums: List<Item> = emptyList(),
    val mixes: List<Item> = emptyList(),
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

    /** Canciones de un artista, disco, playlist o mezcla (se piden al abrirlos) */
    data class Group(val kind: String, val id: String, val items: List<Item>?)
    private val _group = MutableStateFlow<Group?>(null)
    val group: StateFlow<Group?> = _group

    fun openGroup(c: Context, kind: String, id: String) {
        if (_group.value?.let { it.kind == kind && it.id == id && it.items != null } == true) return
        _group.value = Group(kind, id, null)
        cmd(c, "items") { put("k", kind); put("id", id) }
    }

    fun playFrom(c: Context, kind: String, id: String, start: String = "", shuffle: Boolean = false) {
        _busy.value = true
        cmd(c, "play") { put("k", kind); put("id", id); if (start.isNotEmpty()) put("start", start); if (shuffle) put("shuffle", true) }
    }

    /** Miniaturas (las manda el teléfono, ya achicadas) */
    private val _thumbs = MutableStateFlow<Map<String, ImageBitmap>>(emptyMap())
    val thumbs: StateFlow<Map<String, ImageBitmap>> = _thumbs
    private val asked = HashSet<String>()

    fun thumb(c: Context, url: String) {
        if (!url.startsWith("http") || _thumbs.value.containsKey(url) || !asked.add(url)) return
        cmd(c, "thumb") { put("u", url) }
    }

    private fun items(o: JSONObject, k: String): List<Item> = (o.optJSONArray(k) ?: JSONArray()).let { a ->
        (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { Item(it.optString("id"), it.optString("t"), it.optString("s"), it.optString("img")) } }
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

    /** Volumen del teléfono: (nivel, máximo); null mientras no se sabe */
    private val _volume = MutableStateFlow<Pair<Int, Int>?>(null)
    val volume: StateFlow<Pair<Int, Int>?> = _volume

    /** Sube o baja un paso (se ve al tiro; el teléfono confirma el nivel real) */
    fun volumeStep(c: Context, up: Boolean) {
        _volume.value?.let { (v, max) -> _volume.value = (if (up) v + 1 else v - 1).coerceIn(0, max) to max }
        cmd(c, if (up) "vol+" else "vol-")
    }

    fun volumeSet(c: Context, v: Int) {
        _volume.value?.let { (_, max) -> _volume.value = v.coerceIn(0, max) to max }
        cmd(c, "vol") { put("v", v) }
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
                _library.value = Library(
                    songs = items(o, "songs"), playlists = items(o, "playlists"), artists = items(o, "artists"),
                    albums = items(o, "albums"), mixes = items(o, "mixes"), genres = items(o, "genres"),
                    nts = items(o, "nts"), radios = items(o, "radios"), total = o.optInt("total"),
                )
            }
            "/cpn/art" -> {
                _art.value = if (e.data.isEmpty()) null
                else runCatching { BitmapFactory.decodeByteArray(e.data, 0, e.data.size)?.asImageBitmap() }.getOrNull()
            }
            "/cpn/search" -> {
                val o = runCatching { JSONObject(text) }.getOrNull() ?: return
                _search.value = o.optString("q") to items(o, "results")
            }
            "/cpn/items" -> {
                val o = runCatching { JSONObject(text) }.getOrNull() ?: return
                _group.value = Group(o.optString("k"), o.optString("id"), items(o, "items"))
            }
            "/cpn/thumb" -> {
                val cut = e.data.indexOf(0)
                if (cut <= 0) return
                val url = String(e.data, 0, cut)
                val bmp = runCatching { BitmapFactory.decodeByteArray(e.data, cut + 1, e.data.size - cut - 1)?.asImageBitmap() }.getOrNull() ?: return
                _thumbs.value = _thumbs.value + (url to bmp)
            }
            "/cpn/vol" -> {
                val o = runCatching { JSONObject(text) }.getOrNull() ?: return
                _link.value = Link.Ok
                _volume.value = o.optInt("v") to o.optInt("max", 15).coerceAtLeast(1)
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
