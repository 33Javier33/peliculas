import { NextResponse } from 'next/server'

// /.well-known/assetlinks.json: dice a Android que la app (firmada con esta huella) puede abrir los
// enlaces de la web. La huella la calcula GitHub al compilar el APK y la publica en el release.
const RELEASE = 'https://github.com/33Javier33/peliculas/releases/download/android-latest/assetlinks.json'

export const revalidate = 3600

export async function GET() {
  const data = await fetch(RELEASE, { next: { revalidate: 3600 } })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
  return NextResponse.json(Array.isArray(data) ? data : [], {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
