package cl.carlospnauto.app

import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import java.util.concurrent.TimeUnit

/** Conexión a internet para NewPipe Extractor */
class OkDownloader private constructor() : Downloader() {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    override fun execute(request: Request): Response {
        val builder = okhttp3.Request.Builder().url(request.url())
            .addHeader("User-Agent", USER_AGENT)
        val body = request.dataToSend()?.toRequestBody()
        builder.method(request.httpMethod(), body ?: if (request.httpMethod() == "POST") ByteArray(0).toRequestBody() else null)
        for ((name, values) in request.headers()) {
            builder.removeHeader(name)
            for (v in values) builder.addHeader(name, v)
        }
        client.newCall(builder.build()).execute().use { res ->
            if (res.code == 429) throw ReCaptchaException("reCaptcha", request.url())
            return Response(res.code, res.message, res.headers.toMultimap(), res.body?.string(), res.request.url.toString())
        }
    }

    companion object {
        const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0"
        val instance by lazy { OkDownloader() }
    }
}
