import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// /api/cuenta → el login (pedir y verificar código) y la comunidad siguen en el Apps Script de
// cuentas (Google Sheet). Cargar y guardar el respaldo va a Supabase si está la service_role key
// (SUPABASE_SERVICE_ROLE_KEY); cada usuario se migra solo desde la Sheet la primera vez.
// Sin la key, todo sigue yendo al Apps Script.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const GAS_URL =
  process.env.CUENTA_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbyqgT_H1zaJcbMVGK_sieVFe91WsSqSDwU5VygB1SFW5DX-9AhO0DDuAWoxIfrYcGjGEw/exec'
const SB_URL = process.env.SUPABASE_URL || 'https://teemahksasdougehrcly.supabase.co'
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const ACTIONS = new Set(['requestCode', 'verifyCode', 'load', 'save', 'logout', 'publish', 'unpublish', 'community', 'social', 'like', 'comment', 'uncomment', 'presence'])

type Gas = { ok: boolean; error?: string; email?: string; token?: string; data?: string | null; updatedAt?: number }
type Body = { action: string; token?: string; data?: string }

let client: SupabaseClient | null = null
const db = () => (SB_KEY ? (client ??= createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })) : null)
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

class GasError extends Error {}

async function gas(raw: string): Promise<Gas> {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: raw,
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  }).catch(() => {
    throw new GasError('No se pudo conectar con el servicio de cuentas')
  })
  const text = await res.text()
  try {
    return JSON.parse(text) as Gas
  } catch {
    throw new GasError('El servicio de cuentas no respondió bien')
  }
}

// Correo de la sesión. Un token que Supabase aún no conoce (sesión iniciada antes de la migración)
// se valida una vez en el Apps Script, que además entrega el respaldo para copiarlo.
async function emailFor(d: SupabaseClient, token: string | undefined): Promise<string | null> {
  if (!token) return null
  const h = hash(token)
  const { data, error } = await d.from('cuenta_sesiones').select('email').eq('token_hash', h).maybeSingle()
  if (error) throw error
  if (data) return data.email as string
  const r = await gas(JSON.stringify({ action: 'load', token }))
  if (!r.ok || !r.email) {
    if (r.error === 'session') return null
    throw new GasError(r.error || 'El servicio de cuentas no respondió bien')
  }
  const s = await d.from('cuenta_sesiones').upsert({ token_hash: h, email: r.email })
  if (s.error) throw s.error
  const m = await d
    .from('cuenta_respaldos')
    .upsert({ email: r.email, data: r.data ?? null, updated_at: Number(r.updatedAt) || 0 }, { onConflict: 'email', ignoreDuplicates: true })
  if (m.error) throw m.error
  return r.email
}

async function load(d: SupabaseClient, b: Body) {
  const email = await emailFor(d, b.token)
  if (!email) return json({ ok: false, error: 'session' })
  const { data, error } = await d.from('cuenta_respaldos').select('data, updated_at').eq('email', email).maybeSingle()
  if (error) throw error
  if (data) return json({ ok: true, email, updatedAt: Number(data.updated_at), data: data.data })
  // Sesión iniciada después de la migración pero con respaldo todavía en la Sheet
  const r = await gas(JSON.stringify({ action: 'load', token: b.token }))
  if (!r.ok) {
    if (r.error === 'session') return json({ ok: false, error: 'session' })
    throw new GasError(r.error || 'El servicio de cuentas no respondió bien')
  }
  const row = { email, data: r.data ?? null, updated_at: Number(r.updatedAt) || 0 }
  const m = await d.from('cuenta_respaldos').upsert(row, { onConflict: 'email', ignoreDuplicates: true })
  if (m.error) throw m.error
  return json({ ok: true, email, updatedAt: row.updated_at, data: row.data })
}

async function save(d: SupabaseClient, b: Body) {
  const email = await emailFor(d, b.token)
  if (!email) return json({ ok: false, error: 'session' })
  const updatedAt = Date.now()
  const { error } = await d.from('cuenta_respaldos').upsert({ email, data: String(b.data ?? ''), updated_at: updatedAt })
  if (error) throw error
  return json({ ok: true, updatedAt })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null
  if (!body?.action || !ACTIONS.has(body.action)) return json({ ok: false, error: 'Acción no válida' }, 400)
  const raw = JSON.stringify(body)
  if (raw.length > 4_500_000) return json({ ok: false, error: 'Respaldo demasiado grande' }, 413)
  const d = db()
  try {
    if (d && body.action === 'load') return await load(d, body)
    if (d && body.action === 'save') return await save(d, body)
    const r = await gas(raw)
    if (d && body.action === 'verifyCode' && r.ok && r.token && r.email) {
      const { error } = await d.from('cuenta_sesiones').upsert({ token_hash: hash(r.token), email: r.email })
      if (error) console.error('[cuenta] guardar sesión:', error.message)
    }
    if (d && body.action === 'logout' && body.token) {
      const { error } = await d.from('cuenta_sesiones').delete().eq('token_hash', hash(body.token))
      if (error) console.error('[cuenta] cerrar sesión:', error.message)
    }
    return json(r)
  } catch (e) {
    if (!(e instanceof GasError)) console.error('[cuenta]', (e as Error).message)
    return json({ ok: false, error: e instanceof GasError ? e.message : 'No se pudo guardar la cuenta' }, 502)
  }
}

export async function GET() {
  return json({ configured: !!GAS_URL, supabase: !!SB_KEY })
}
