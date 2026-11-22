package cl.carlospnauto.app

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * Reproductor del teléfono para el «play» de la notificación, el widget y los audífonos.
 *
 * Cuando la app lleva rato en segundo plano, Android congela o cierra la página y esta tardaba
 * en volver a sonar (había que recargarla y traer la app adelante). Ahora, si la página no suena
 * al instante, la canción sigue aquí mismo desde el segundo en que quedó, con el audio guardado
 * en el teléfono (AudioServer). Al abrir la app, la página retoma desde donde va este reproductor.
 */
object NativeResume {
    private const val PREFS = "native_resume"
    private val main = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private var app: Context? = null

    /** Lo que suena aquí (id de YouTube, sin «yta-») */
    @Volatile var active = false
        private set
    @Volatile var playing = false
        private set
    private var cur: JSONObject? = null
    private var queue = JSONArray()
    private val history = ArrayList<JSONObject>()
    private var startedAt = 0L
    private var handingOver = false
    /** El audio ya cargó (antes de eso no se le puede pedir play ni pausa) */
    private var prepared = false
    private var fromMs0 = 0L

    private val ytId = Regex("^[A-Za-z0-9_-]{11}$")
    private fun cleanId(id: String) = id.removePrefix("yta-")

    // ===== Lo último que sonó (se guarda con cada aviso de la página) =====

    fun save(c: Context, st: JSONObject) {
        runCatching {
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("state", st.put("at", System.currentTimeMillis()).toString())
                .apply()
        }
    }

    private fun saved(c: Context): JSONObject? =
        runCatching { JSONObject(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("state", null) ?: return null) }.getOrNull()

    /** ¿Hay una canción que se pueda retomar aquí? */
    fun canResume(c: Context): Boolean {
        if (active) return true
        if (System.currentTimeMillis() - failedAt < 30_000) return false
        val s = saved(c) ?: return false
        return ytId.matches(cleanId(s.optString("id"))) && s.optDouble("duration", 0.0) > 0 && AudioServer.port > 0
    }

    // ===== Reproducir =====

    /** Retoma lo último que sonaba desde su segundo. false: no hay nada que se pueda retomar aquí */
    fun start(c: Context): Boolean {
        if (active) {
            resume()
            return true
        }
        if (!canResume(c)) return false
        val s = saved(c) ?: return false
        app = c.applicationContext
        var pos = s.optDouble("position", 0.0)
        // Si sonaba cuando se guardó, avanzó un poco más (solo si fue hace poco)
        if (s.optBoolean("playing")) {
            val gone = (System.currentTimeMillis() - s.optLong("at")) / 1000.0
            if (gone in 0.0..600.0) pos += gone
        }
        val dur = s.optDouble("duration", 0.0)
        if (pos >= dur - 2) pos = 0.0
        queue = s.optJSONArray("upcoming") ?: JSONArray()
        history.clear()
        active = true
        startedAt = System.currentTimeMillis()
        playTrack(s, (pos * 1000).toLong())
        return true
    }

    private fun playTrack(t: JSONObject, fromMs: Long) {
        val c = app ?: return
        release()
        prepared = false
        fromMs0 = fromMs
        cur = t
        playing = true
        askFocus()
        report(fromMs)
        val id = cleanId(t.optString("id"))
        val mp = MediaPlayer()
        player = mp
        runCatching {
            mp.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            mp.setWakeMode(c, android.os.PowerManager.PARTIAL_WAKE_LOCK)
            mp.setDataSource("http://127.0.0.1:${AudioServer.port}/yt/$id")
            mp.setOnPreparedListener {
                if (player !== mp) return@setOnPreparedListener
                prepared = true
                if (fromMs > 1000) runCatching { mp.seekTo(fromMs.toInt()) }
                if (playing) {
                    mp.start()
                    MainActivity.lastSoundAt = System.currentTimeMillis()
                    tick()
                }
                report()
            }
            mp.setOnCompletionListener { if (player === mp) next() }
            mp.setOnErrorListener { _, _, _ ->
                // No se pudo con esta: la siguiente (y si no hay, que lo intente la página)
                if (player === mp) main.post { if (!next()) giveUpToWeb() }
                true
            }
            mp.prepareAsync()
        }.onFailure { giveUpToWeb() }
    }

    // Foco de audio: una llamada u otra app que suena lo pausa (y vuelve si fue algo breve)
    private var focus: android.media.AudioFocusRequest? = null
    private var pausedByFocus = false
    private fun askFocus() {
        val c = app ?: return
        if (focus != null) return
        val am = c.getSystemService(android.media.AudioManager::class.java) ?: return
        val req = android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setOnAudioFocusChangeListener({ f ->
                when (f) {
                    android.media.AudioManager.AUDIOFOCUS_LOSS -> { pausedByFocus = false; pause(); dropFocus() }
                    android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> if (playing) { pausedByFocus = true; pause() }
                    android.media.AudioManager.AUDIOFOCUS_GAIN -> if (pausedByFocus) { pausedByFocus = false; resume() }
                }
            }, main)
            .build()
        focus = req
        runCatching { am.requestAudioFocus(req) }
    }
    private fun dropFocus() {
        val req = focus ?: return
        focus = null
        runCatching { app?.getSystemService(android.media.AudioManager::class.java)?.abandonAudioFocusRequest(req) }
    }

    // Mientras suena: avisa al teléfono que hay sonido (así nada lo trae adelante)
    private fun tick() {
        main.removeCallbacks(ticker)
        main.postDelayed(ticker, 1000)
    }
    private val ticker = object : Runnable {
        override fun run() {
            val mp = player ?: return
            if (runCatching { mp.isPlaying }.getOrDefault(false)) MainActivity.lastSoundAt = System.currentTimeMillis()
            if (active) main.postDelayed(this, 1000)
        }
    }

    fun pause() {
        playing = false
        if (prepared) runCatching { player?.takeIf { it.isPlaying }?.pause() }
        report()
        saveNow()
    }

    fun resume() {
        playing = true
        askFocus()
        if (!prepared) return report()
        runCatching { player?.start() }
        MainActivity.lastSoundAt = System.currentTimeMillis()
        tick()
        report()
    }

    fun seek(ms: Long) {
        if (prepared) runCatching { player?.seekTo(ms.toInt()) }
        report(ms)
    }

    /** Siguiente de la lista que dejó la página. false: no quedan */
    fun next(): Boolean {
        if (queue.length() == 0) return false
        val n = queue.optJSONObject(0) ?: return false
        val rest = JSONArray()
        for (i in 1 until queue.length()) rest.put(queue.opt(i))
        queue = rest
        cur?.let { history.add(it) }
        playing = true
        playTrack(n, 0)
        return true
    }

    fun prev() {
        val pos = runCatching { player?.currentPosition ?: 0 }.getOrDefault(0)
        if (pos > 3000 || history.isEmpty()) return seek(0)
        val p = history.removeAt(history.size - 1)
        val rest = JSONArray().put(cur)
        for (i in 0 until queue.length()) rest.put(queue.opt(i))
        queue = rest
        playTrack(p, 0)
    }

    fun position(): Long = if (!prepared) fromMs0 else runCatching { player?.currentPosition?.toLong() ?: 0L }.getOrDefault(0L)

    // ===== La página vuelve a tomar el control =====

    /**
     * La app se abrió: la página sigue desde donde va este reproductor. Este se pausa al pedírselo
     * y se apaga apenas la página suena (si a los 5 s no suena, sigue aquí).
     */
    fun handOver() {
        if (!active || handingOver) return
        val t = cur ?: return
        val id = cleanId(t.optString("id"))
        val ms = position()
        val wasPlaying = playing
        handingOver = true
        val since = System.currentTimeMillis()
        tryHandOver(id, ms, wasPlaying, since, 0)
    }

    private fun tryHandOver(id: String, ms: Long, wasPlaying: Boolean, since: Long, n: Int) {
        if (!active) {
            handingOver = false
            return
        }
        MainActivity.runOnPage("window.__cpnNativeAction ? (window.__cpnNativeAction('resume:$id:$ms:${if (wasPlaying) 1 else 0}'), 'ok') : 'none'") { ok ->
            if (!ok) {
                // La página aún carga: se reintenta (sigue sonando aquí mientras tanto)
                if (n < 40) main.postDelayed({ tryHandOver(id, position(), playing, since, n + 1) }, 500) else handingOver = false
                return@runOnPage
            }
            if (!wasPlaying) {
                stop()
                return@runOnPage
            }
            if (prepared) runCatching { player?.pause() }
            main.postDelayed({
                if (!active) return@postDelayed
                if (MainActivity.soundingSince(since)) stop()
                else {
                    // La página no logró sonar: sigue aquí
                    handingOver = false
                    MainActivity.sendAction("pause")
                    resume()
                }
            }, 5000)
        }
    }

    /** La página está sonando con la app a la vista: este reproductor sobra */
    fun webSounding() {
        main.post { webSoundingNow() }
    }

    private fun webSoundingNow() {
        if (active && !handingOver && System.currentTimeMillis() - startedAt > 3000 && MainActivity.isShown()) stop()
    }

    private var failedAt = 0L

    private fun giveUpToWeb() {
        failedAt = System.currentTimeMillis()
        stop()
        app?.let { MainActivity.play(it) }
    }

    fun stop() {
        if (!active) return
        saveNow()
        active = false
        playing = false
        handingOver = false
        main.removeCallbacks(ticker)
        release()
        dropFocus()
    }

    private fun release() {
        val mp = player ?: return
        player = null
        prepared = false
        runCatching { mp.stop() }
        runCatching { mp.release() }
    }

    // Guarda el segundo en que va (si la app se cierra, se retoma desde aquí)
    private fun saveNow() {
        val c = app ?: return
        val t = cur ?: return
        runCatching {
            save(c, JSONObject(t.toString()).put("position", position() / 1000.0).put("playing", false).put("upcoming", queue))
        }
    }

    /** Le cuenta a la notificación y al widget lo que suena aquí */
    private fun report(posMs: Long = position()) {
        val c = app ?: return
        val t = cur ?: return
        val i = Intent(c, PlaybackService::class.java).apply {
            action = PlaybackService.ACTION_STATE
            putExtra("native", true)
            putExtra("title", t.optString("title"))
            putExtra("artist", t.optString("artist"))
            putExtra("album", t.optString("album"))
            putExtra("artwork", t.optString("artwork"))
            putExtra("playing", playing)
            putExtra("visible", true)
            putExtra("liked", t.optBoolean("liked"))
            putExtra("id", t.optString("id"))
            putExtra("position", posMs / 1000.0)
            val d = if (!prepared) -1 else runCatching { player?.duration ?: -1 }.getOrDefault(-1)
            putExtra("duration", if (d > 0) d / 1000.0 else t.optDouble("duration", 0.0))
        }
        runCatching { ContextCompat.startForegroundService(c, i) }.onFailure { runCatching { c.startService(i) } }
    }
}
