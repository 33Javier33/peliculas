import { releaseAssets } from '@/lib/apk-release'

// Descarga del APK. Antes el archivo pasaba por aquí (Vercel), pero Vercel corta las respuestas
// de sus funciones en 4,5 MB y el APK ya pesa casi 5 MB: llegaba cortado ("archivo dañado").
// Ahora se redirige al archivo en GitHub: la API entrega un enlace firmado y recién hecho
// (siempre la última versión, sin la caché de los enlaces públicos de GitHub).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FALLBACK = 'https://github.com/33Javier33/peliculas/releases/download/android-latest/CarlosPNauto.apk'

export async function GET(request: Request) {
  // ?f=reloj → la app del reloj (Wear OS)
  const name = new URL(request.url).searchParams.get('f') === 'reloj' ? 'CarlosPNauto-Reloj.apk' : 'CarlosPNauto.apk'
  let target = ''
  try {
    const { assets } = await releaseAssets()
    const apk = assets.find((a) => a.name === name)
    if (apk) {
      const r = await fetch(apk.url, {
        headers: { Accept: 'application/octet-stream', 'User-Agent': 'CarlosPNautoInteractive' },
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      })
      const loc = r.headers.get('location')
      if (r.status >= 300 && r.status < 400 && loc?.startsWith('https://')) target = loc
      r.body?.cancel().catch(() => {})
    }
  } catch {}
  if (!target) target = `${FALLBACK.replace('CarlosPNauto.apk', name)}?t=${Date.now()}`
  return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } })
}
