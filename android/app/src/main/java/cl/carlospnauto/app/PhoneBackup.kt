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
    private val BRAND = BuildConfig.BRAND
    private val NAME = "$BRAND-respaldo.json"
    private val PATH = "Download/$BRAND"

    /** Copia interna (la que lee la otra app del mismo teléfono: PulsoMedia ↔ PulsoMusic) */
    fun internalFile(ctx: Context) = java.io.File(ctx.filesDir, "library.json")

    /** Biblioteca de la otra app (PulsoMedia o PulsoMusic) si está instalada en este teléfono */
    fun readOther(ctx: Context): String = runCatching {
        ctx.contentResolver.openInputStream(Uri.parse("content://${BuildConfig.OTHER_APP}.library/library.json"))?.use { it.readBytes().decodeToString() } ?: ""
    }.getOrDefault("")

    @Synchronized
    fun save(ctx: Context, json: String): Boolean {
        if (json.length >= 20) runCatching { internalFile(ctx).writeText(json) }
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
