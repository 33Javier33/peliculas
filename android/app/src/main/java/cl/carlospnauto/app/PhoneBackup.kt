package cl.carlospnauto.app

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore

/**
 * Respaldo de la biblioteca (playlists, Me gusta, discos, artistas seguidos…) en un archivo del
 * teléfono: Descargas/PulsoMedia/PulsoMedia-respaldo.json. Al desinstalar la app Android borra
 * todo lo que guarda adentro, pero este archivo queda: tras reinstalar se elige en
 * «Recuperar respaldo» y vuelve todo.
 */
object PhoneBackup {
    private const val NAME = "PulsoMedia-respaldo.json"
    private const val PATH = "Download/PulsoMedia"

    @Synchronized
    fun save(ctx: Context, json: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || json.length < 20) return false
        val prefs = ctx.getSharedPreferences("phone-backup", Context.MODE_PRIVATE)
        val resolver = ctx.contentResolver
        val bytes = json.toByteArray()
        fun write(u: Uri) = resolver.openOutputStream(u, "wt")!!.use { it.write(bytes) }
        prefs.getString("uri", null)?.let { saved ->
            if (runCatching { write(Uri.parse(saved)) }.isSuccess) return true
        }
        return runCatching {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, NAME)
                put(MediaStore.Downloads.MIME_TYPE, "application/json")
                put(MediaStore.Downloads.RELATIVE_PATH, PATH)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
            write(uri)
            prefs.edit().putString("uri", uri.toString()).apply()
            true
        }.getOrDefault(false)
    }
}
