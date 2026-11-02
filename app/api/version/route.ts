import { NextResponse } from 'next/server'

// /api/version → versión publicada ahora (para cargar la nueva sin cortar la música)
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ version: process.env.NEXT_PUBLIC_APP_VERSION }, { headers: { 'Cache-Control': 'no-store' } })
}
