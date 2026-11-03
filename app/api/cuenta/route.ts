import { NextRequest, NextResponse } from 'next/server'

// /api/cuenta → reenvía al Apps Script de cuentas (Google Sheet): pedir código, verificarlo,
// cargar y guardar el respaldo. La dirección del script (pública) puede cambiarse con CUENTA_GAS_URL.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const GAS_URL =
  process.env.CUENTA_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbyqgT_H1zaJcbMVGK_sieVFe91WsSqSDwU5VygB1SFW5DX-9AhO0DDuAWoxIfrYcGjGEw/exec'

const ACTIONS = new Set(['requestCode', 'verifyCode', 'load', 'save', 'logout', 'publish', 'unpublish', 'community'])

export async function POST(request: NextRequest) {
  const url = GAS_URL
  if (!url) return NextResponse.json({ ok: false, error: 'not_configured' })
  const body = (await request.json().catch(() => null)) as { action?: string } | null
  if (!body?.action || !ACTIONS.has(body.action)) return NextResponse.json({ ok: false, error: 'Acción no válida' }, { status: 400 })
  const raw = JSON.stringify(body)
  if (raw.length > 4_500_000) return NextResponse.json({ ok: false, error: 'Respaldo demasiado grande' }, { status: 413 })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: raw,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    })
    const text = await res.text()
    try {
      return NextResponse.json(JSON.parse(text), { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return NextResponse.json({ ok: false, error: 'El servicio de cuentas no respondió bien' }, { status: 502 })
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo conectar con el servicio de cuentas' }, { status: 502 })
  }
}

export async function GET() {
  return NextResponse.json({ configured: !!GAS_URL })
}
