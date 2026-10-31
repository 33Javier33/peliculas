import { releaseAssets, fetchAsset } from '@/lib/apk-release'

// Descarga del APK desde la propia app (en vez del enlace de GitHub, que pasa por varias
// redirecciones y una caché que a veces entregaba la versión anterior)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FALLBACK = 'https://github.com/33Javier33/peliculas/releases/download/android-latest/CarlosPNauto.apk'

export async function GET() {
  let upstream: Response | null = null
  try {
    const { assets } = await releaseAssets()
    const apk = assets.find((a) => a.name === 'CarlosPNauto.apk')
    if (apk) upstream = await fetchAsset(apk)
  } catch {}
  if (!upstream?.ok) upstream = await fetch(FALLBACK, { redirect: 'follow', cache: 'no-store' }).catch(() => null)
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
