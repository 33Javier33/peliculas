import { NextResponse } from 'next/server'

// /api/apk/version → última versión publicada del APK { version, build, notes, date }
export const runtime = 'nodejs'
// Se consulta en cada pedido (la CDN la guarda 5 min); si no, quedaba fija desde la compilación
export const dynamic = 'force-dynamic'

const SOURCE = process.env.APK_VERSION_URL || 'https://github.com/33Javier33/peliculas/releases/download/android-latest/version.json'

export async function GET() {
  try {
    const res = await fetch(SOURCE, { redirect: 'follow', cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { version?: string; build?: number; notes?: string; date?: string }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } })
  } catch {
    return NextResponse.json({ version: null }, { headers: { 'Cache-Control': 'public, s-maxage=60' } })
  }
}
