import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase-public'
import { fixFor } from '@/lib/admin-fixes'

// /api/admin → datos del panel de administración (/admin). Solo para el correo administrador
// (variable ADMIN_EMAILS en Vercel; si no está, la cuenta principal). Lee con la service_role key.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ADMINS = (process.env.ADMIN_EMAILS || 'carlospn.interactive@gmail.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
const SB_URL = process.env.SUPABASE_URL || SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let client: SupabaseClient | null = null
const db = () => (SB_KEY ? (client ??= createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })) : null)
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

async function adminEmail(d: SupabaseClient, token: string | undefined): Promise<string | null> {
  if (!token) return null
  const h = createHash('sha256').update(token).digest('hex')
  const { data } = await d.from('cuenta_sesiones').select('email').eq('token_hash', h).maybeSingle()
  const email = String(data?.email ?? '').toLowerCase()
  return email && ADMINS.includes(email) ? email : null
}

type Err = { mensaje: string; veces: number; dispositivos: number; primera?: string; ultima: string; casos?: unknown[] | null; donde: string[] | null; paginas: string[] | null; versiones: string[] | null; sinInternet: number }
type Resumen = { errores: Err[]; resueltos: { mensaje: string; nota: string; at: string }[] } & Record<string, unknown>

async function summary(d: SupabaseClient) {
  const { data, error } = await d.rpc('uso_admin_resumen')
  if (error) {
    if (/does not exist|schema cache|function/i.test(error.message)) return { ok: true, faltaSql: true }
    throw error
  }
  const r = data as Resumen
  const solved = new Map((r.resueltos ?? []).map((x) => [x.mensaje, x]))
  const errores = (r.errores ?? [])
    .map((g) => {
      const s = solved.get(g.mensaje)
      const ultima = String(g.ultima)
      return {
        ...g,
        donde: g.donde ?? [],
        paginas: g.paginas ?? [],
        versiones: g.versiones ?? [],
        ...fixFor(g.mensaje, g.donde?.[0] ?? ''),
        // Marcado como resuelto, salvo que haya vuelto a pasar después
        resuelto: s && Date.parse(s.at) > Date.parse(ultima) ? s.nota || 'Resuelto' : null,
        notaAnterior: s && Date.parse(s.at) <= Date.parse(ultima) ? s.nota : null,
      }
    })
    .sort((a, b) => Number(!!a.resuelto) - Number(!!b.resuelto) || b.dispositivos - a.dispositivos || b.veces - a.veces)
  // Versiones: cuál es la más nueva de cada app (las demás están desactualizadas)
  type V = { app: string; version: string; dispositivos: number; ultimaVez: string }
  const num = (v: string) => v.split('.').map((x) => parseInt(x, 10) || 0)
  const newer = (a: string, b: string) => {
    const x = num(a), y = num(b)
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
    return false
  }
  const latest: Record<string, string> = {}
  for (const v of (r.versiones as V[] | undefined) ?? []) if (!latest[v.app] || newer(v.version, latest[v.app])) latest[v.app] = v.version
  const versiones = ((r.versiones as V[] | undefined) ?? []).map((v) => ({ ...v, ultima: v.version === latest[v.app] }))
  const { resueltos: _r, ...rest } = r
  void _r
  // (Sin «diario» es el SQL de la primera versión: hay que volver a ejecutarlo)
  return { ok: true, faltaSql: false, sqlViejo: !('conexiones' in r), ...rest, versiones, errores }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string; action?: string; mensaje?: string; nota?: string } | null
  const d = db()
  if (!d) return json({ ok: false, error: 'Falta la variable SUPABASE_SERVICE_ROLE_KEY en Vercel' }, 500)
  const email = await adminEmail(d, body?.token).catch(() => null)
  if (!email) return json({ ok: false, error: 'admin' }, 403)
  try {
    if (body?.action === 'resolver' && body.mensaje) {
      const { error } = await d.from('uso_errores_resueltos').upsert({ mensaje: body.mensaje, nota: String(body.nota ?? '').slice(0, 500), at: new Date().toISOString() })
      if (error) throw error
      return json({ ok: true })
    }
    if (body?.action === 'reabrir' && body.mensaje) {
      const { error } = await d.from('uso_errores_resueltos').delete().eq('mensaje', body.mensaje)
      if (error) throw error
      return json({ ok: true })
    }
    return json(await summary(d))
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
}
