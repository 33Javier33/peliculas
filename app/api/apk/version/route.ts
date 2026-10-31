import { NextResponse } from 'next/server'
import { releaseAssets, fetchAsset } from '@/lib/apk-release'

// /api/apk/version → última versión publicada del APK { version, build, notes, date }
export const runtime = 'nodejs'
// Se consulta en cada pedido (la CDN la guarda 1 min)
export const dynamic = 'force-dynamic'

export async function GET() {
  const headers = { 'Cache-Control': 'public, s-maxage=60' }
  try {
    if (process.env.APK_VERSION_URL) {
      const r = await fetch(process.env.APK_VERSION_URL, { cache: 'no-store' })
      return NextResponse.json(await r.json(), { headers })
    }
    const { assets, body } = await releaseAssets()
    const meta = assets.find((a) => a.name === 'version.json')
    if (meta) {
      const r = await fetchAsset(meta)
      if (r.ok) return NextResponse.json(await r.json(), { headers })
    }
    // Respaldo: el número de compilación que trae la descripción de la versión
    const build = Number(body.match(/Compilación (\d+)/)?.[1])
    return NextResponse.json(build ? { version: `1.0.${build}`, build } : { version: null }, { headers })
  } catch {
    // La API de GitHub tiene límite de consultas: si se agotó, el enlace de descarga
    try {
      const r = await fetch('https://github.com/33Javier33/peliculas/releases/download/android-latest/version.json', {
        redirect: 'follow',
        cache: 'no-store',
      })
      if (r.ok) return NextResponse.json(await r.json(), { headers })
    } catch {}
    return NextResponse.json({ version: null }, { headers: { 'Cache-Control': 'public, s-maxage=30' } })
  }
}
