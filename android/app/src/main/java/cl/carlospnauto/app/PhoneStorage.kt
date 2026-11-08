package cl.carlospnauto.app

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Descargas guardadas como archivos de música del teléfono (carpeta Música/PulsoMedia/<disco>).
 * A diferencia del almacenamiento de la app, Android NO las borra al desinstalar: al volver a
 * instalar la app se encuentran y se usan sin descargar nada otra vez. También se ven en cualquier
 * reproductor de música del teléfono.
 *
 * Cada archivo lleva en su nombre la clave de la canción ("Título [pm-CLAVE].m4a") para saber, al
 * recuperarlo, qué canción es.
 */
object PhoneStorage {
    private const val TAG = "PhoneStorage"
    // Música/PulsoMedia (app completa) o Música/PulsoMusic (app de música)
    val ROOT = BuildConfig.STORAGE_ROOT
    private val pool = Executors.newSingleThreadExecutor()
    // Descargas que la web dio por perdidas (2 min sin avanzar) o canceló: se dejan apenas se pueda
    // (antes seguían ocupando la única fila de descargas y las demás esperaban)
    private val cancelled = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

    fun cancel(req: String) {
        cancelled.add(req)
    }

    private fun checkCancel(req: String) {
        if (req in cancelled) throw IllegalStateException("cancelada")
    }
    private const val PART = 6L * 1024 * 1024

    /** Avance a la web: fracción (o -1 si no se sabe el total) y bytes ya guardados */
    private fun sendProgress(req: String, bytes: Long, total: Long) {
        val f = if (total > 0) (bytes.toDouble() / total).coerceAtMost(1.0) else -1.0
        val o = JSONObject().put("req", req).put("f", f).put("b", bytes)
        MainActivity.toWeb("window.__cpnStoredProgress && window.__cpnStoredProgress(${JSONObject.quote(o.toString())})")
    }

    fun supported() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    private fun clean(s: String, max: Int) = s.replace(Regex("[\\\\/:*?\"<>|\\x00-\\x1f]+"), " ").replace(Regex("\\s+"), " ").trim().take(max).ifBlank { "Canción" }

    /**
     * Descarga `src` y la guarda como música. Avisa a la página con window.__cpnStored({req, ok, id, size, error})
     * y el avance con window.__cpnStoredProgress({req, f}).
     */
    fun store(ctx: Context, req: String, src: String, name: String, folder: String, ext: String) {
        pool.execute {
            // Ya cancelada mientras esperaba su turno: ni se empieza
            if (cancelled.remove(req)) return@execute
            val r = runCatching {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw IllegalStateException("Android 10 o más nuevo")
                save(ctx, req, src, name, folder, ext)
            }
            val o = JSONObject().put("req", req)
            r.onSuccess { (id, size) -> o.put("ok", true).put("id", id).put("size", size) }
            r.onFailure { e -> o.put("ok", false).put("error", e.message ?: "error"); Log.w(TAG, "No se guardó $name: ${e.message}") }
            cancelled.remove(req)
            MainActivity.toWeb("window.__cpnStored && window.__cpnStored(${JSONObject.quote(o.toString())})")
        }
    }

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.Q)
    private fun save(ctx: Context, req: String, src: String, name: String, folder: String, ext: String): Pair<Long, Long> {
        val resolver = ctx.contentResolver
        val mime = when (ext) { "mp3" -> "audio/mpeg"; "flac" -> "audio/flac"; "ogg", "oga" -> "audio/ogg"; "opus" -> "audio/ogg"; "wav" -> "audio/wav"; "webm" -> "audio/webm"; else -> "audio/mp4" }
        val values = ContentValues().apply {
            put(MediaStore.Audio.Media.DISPLAY_NAME, "${clean(name, 180)}.$ext")
            put(MediaStore.Audio.Media.MIME_TYPE, mime)
            put(MediaStore.Audio.Media.RELATIVE_PATH, "$ROOT/${clean(folder, 80)}")
            put(MediaStore.Audio.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
            ?: throw IllegalStateException("No se pudo crear el archivo")
        try {
            var got = 0L
            var total = -1L
            resolver.openOutputStream(uri)?.use { out ->
                var fails = 0
                while (true) {
                    // Sin internet (pantalla bloqueada, cambio de Wi-Fi a datos…): se espera a que
                    // vuelva (hasta 3 min) y se sigue desde donde quedó
                    checkCancel(req)
                    waitForNetwork(ctx, req)
                    val conn = (URL(src).openConnection() as HttpURLConnection).apply {
                        setRequestProperty("Range", "bytes=$got-${got + PART - 1}")
                        setRequestProperty("User-Agent", "Mozilla/5.0 PulsoMedia")
                        connectTimeout = 20000
                        readTimeout = 60000
                    }
                    val code = runCatching { conn.responseCode }.getOrDefault(-1)
                    if (code != 200 && code != 206) {
                        // El motivo (p. ej. lo que dijo YouTube) para mostrarlo en la app
                        val why = runCatching { conn.errorStream?.bufferedReader()?.use { it.readText() } }.getOrNull()?.take(200)
                        conn.disconnect()
                        if (got == 0L && fails >= 5) throw IllegalStateException(why?.ifBlank { null } ?: "La descarga respondió $code")
                        // Ya llegó todo (pedir más allá del final da error) o se reintenta
                        if (got > 0 && total < 0) break
                        if (++fails > 5) throw IllegalStateException(why?.ifBlank { null } ?: "La descarga respondió $code")
                        // Esperas cada vez más largas (3, 6, 12, 24, 48 s): la red suele volver
                        checkCancel(req)
                        Thread.sleep(3000L shl (fails - 1))
                        continue
                    }
                    val range = conn.getHeaderField("Content-Range")
                    total = range?.substringAfter('/')?.toLongOrNull() ?: if (code == 200) conn.contentLengthLong else total
                    var n = 0L
                    // Si la conexión se corta a mitad de un tramo, se sigue desde lo ya guardado
                    val cut = runCatching {
                        conn.inputStream.use { inp ->
                            val buf = ByteArray(64 * 1024)
                            var lastSent = 0L
                            while (true) {
                                val k = inp.read(buf)
                                if (k < 0) break
                                out.write(buf, 0, k)
                                n += k
                                checkCancel(req)
                                // Avance varias veces por segundo (antes solo al final de cada tramo
                                // de 6 MB: una canción pasaba de 0 a 100 % de golpe)
                                val now = System.currentTimeMillis()
                                if (now - lastSent > 250) {
                                    lastSent = now
                                    sendProgress(req, got + n, total)
                                }
                            }
                        }
                    }.exceptionOrNull()
                    conn.disconnect()
                    if (cut != null) {
                        got += n
                        if (++fails > 5) throw cut
                        Thread.sleep(3000L shl (fails - 1))
                        continue
                    }
                    got += n
                    sendProgress(req, got, total)
                    if (code == 200 || n == 0L || (total in 1..got) || (total < 0 && n < PART)) break
                }
            } ?: throw IllegalStateException("No se pudo escribir")
            if (got < 1024) throw IllegalStateException("Archivo vacío")
            resolver.update(uri, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null)
            return ContentUris.parseId(uri) to got
        } catch (e: Exception) {
            runCatching { resolver.delete(uri, null, null) }
            throw e
        }
    }

    /** Los archivos de PulsoMedia que hay en el teléfono: [{id, name, folder, size}] (o "denied" sin permiso) */
    fun list(ctx: Context): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "[]"
        val arr = JSONArray()
        val proj = arrayOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DISPLAY_NAME, MediaStore.Audio.Media.RELATIVE_PATH, MediaStore.Audio.Media.SIZE)
        return try {
            ctx.contentResolver.query(
                MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), proj,
                "${MediaStore.Audio.Media.RELATIVE_PATH} LIKE ?", arrayOf("$ROOT/%"), null,
            )?.use { c ->
                while (c.moveToNext()) {
                    val path = c.getString(2) ?: ""
                    arr.put(JSONObject().put("id", c.getLong(0)).put("name", c.getString(1) ?: "").put("folder", path.removePrefix("$ROOT/").trimEnd('/')).put("size", c.getLong(3)))
                }
            }
            arr.toString()
        } catch (e: SecurityException) {
            "denied"
        } catch (e: Exception) {
            "[]"
        }
    }

    /** Espera (hasta 3 minutos) a que haya internet */
    private fun waitForNetwork(ctx: Context, req: String) {
        val cm = ctx.getSystemService(android.net.ConnectivityManager::class.java) ?: return
        var waited = 0
        while (cm.activeNetwork == null && waited < 180) {
            checkCancel(req)
            Thread.sleep(2000)
            waited += 2
        }
    }

    fun delete(ctx: Context, id: Long) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        runCatching { ctx.contentResolver.delete(uriOf(id), null, null) }
    }

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.Q)
    fun uriOf(id: Long): Uri = ContentUris.withAppendedId(MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), id)
}
