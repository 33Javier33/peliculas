// Descarga del APK desde la propia app (en vez del enlace de GitHub, que pasa por varias
// redirecciones y en algunos teléfonos la descarga no termina).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SOURCE = 'https://github.com/33Javier33/peliculas/releases/download/android-latest/CarlosPNauto.apk'

export async function GET() {
  const upstream = await fetch(SOURCE, { redirect: 'follow', cache: 'no-store' }).catch(() => null)
  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response('El APK no está disponible ahora. Intenta en unos minutos.', { status: 502 })
  }
  const headers = new Headers({
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': 'attachment; filename="CarlosPNauto.apk"',
    'Cache-Control': 'no-store',
  })
  const len = upstream.headers.get('content-length')
  if (len) headers.set('Content-Length', len)
  return new Response(upstream.body, { headers })
}
