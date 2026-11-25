import { NextResponse } from 'next/server'

// /api/version → versión publicada ahora (para cargar la nueva sin cortar la música)
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ version: process.env.NEXT_PUBLIC_APP_VERSION }, {
    // La guarda el CDN de Vercel (no se ejecuta la función en cada consulta). Al publicar una versión
    // nueva Vercel borra esa copia, así que la respuesta nueva llega igual
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=86400' },
  })
}
