'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Users, Smartphone, Music2, Bug, RefreshCw, Loader2, CheckCircle2, RotateCcw, Database, UserRound } from 'lucide-react'
import { useAccountStore } from '@/store/accountStore'

// Panel de administración: dispositivos activos (con y sin cuenta), cuentas de respaldo, canciones
// más escuchadas y errores que reportan las apps (con su causa y cómo se soluciona).

type Activos = { total: number; porApp: Record<string, number> }
type Err = {
  mensaje: string
  veces: number
  dispositivos: number
  ultima: string
  donde: string[]
  paginas: string[]
  versiones: string[]
  sinInternet: number
  causa: string
  solucion: string
  grave: boolean
  resuelto: string | null
  notaAnterior: string | null
}
type Song = { track: string; titulo: string; artista: string; veces: number }
type Data = {
  ok: boolean
  error?: string
  faltaSql?: boolean
  activos?: { hoy: Activos; semana: Activos; mes: Activos }
  dispositivos?: { total: number; mes: number; conCuenta: number; sinCuenta: number; versiones: [string, number][] }
  cuentas?: { email: string; respaldo: number; dispositivos: number; apps: string[]; ultimaVez: number }[]
  canciones?: { semana: Song[]; mes: Song[] }
  errores?: Err[]
}

const APP_NAME: Record<string, string> = { media: 'PulsoMedia', music: 'PulsoMusic', web: 'Web' }
const fmt = (t: number | string) => {
  const ms = typeof t === 'number' ? t : Date.parse(t)
  if (!ms) return '—'
  const d = Math.floor((Date.now() - ms) / 86400000)
  if (d <= 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 30) return `hace ${d} días`
  return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface-1 border border-white/8 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-white font-bold mb-3">
        {icon} {title}
      </h2>
      {children}
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2/60 border border-white/5 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
    </div>
  )
}

const byApp = (a?: Activos) =>
  a
    ? Object.entries(a.porApp)
        .map(([k, v]) => `${APP_NAME[k] ?? k} ${v}`)
        .join(' · ')
    : ''

export default function AdminClient() {
  const token = useAccountStore((s) => s.token)
  const email = useAccountStore((s) => s.email)
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [songsRange, setSongsRange] = useState<'semana' | 'mes'>('semana')
  const [notes, setNotes] = useState<Record<string, string>>({})
  useEffect(() => setMounted(true), [])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    const d = (await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: 'Sin conexión' }))) as Data
    setData(d)
    setLoading(false)
  }, [token])
  useEffect(() => {
    load()
  }, [load])

  const mark = async (mensaje: string, action: 'resolver' | 'reabrir') => {
    await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, mensaje, nota: notes[mensaje] ?? '' }) }).catch(() => {})
    load()
  }

  if (!mounted) return <div className="pt-24 min-h-screen" />

  if (!token)
    return (
      <div className="pt-28 px-4 max-w-md mx-auto text-center">
        <ShieldCheck className="w-10 h-10 text-violet-300 mx-auto mb-3" />
        <h1 className="text-white text-xl font-bold">Administración</h1>
        <p className="text-slate-400 text-sm mt-2">Inicia sesión con la cuenta de administrador para ver el panel.</p>
        <button onClick={() => useAccountStore.getState().setOpen(true)} className="mt-5 px-5 py-2.5 rounded-full bg-violet-500 text-white text-sm font-bold">
          Iniciar sesión
        </button>
      </div>
    )

  if (data && !data.ok && data.error === 'admin')
    return (
      <div className="pt-28 px-4 max-w-md mx-auto text-center">
        <ShieldCheck className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <h1 className="text-white text-xl font-bold">Sin acceso</h1>
        <p className="text-slate-400 text-sm mt-2">La cuenta {email} no es administradora.</p>
      </div>
    )

  const s = data?.ok ? data : null
  const songs = s?.canciones?.[songsRange] ?? []
  const errores = s?.errores ?? []
  const abiertos = errores.filter((e) => !e.resuelto)

  return (
    <div className="pt-24 pb-10 px-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white font-display">
          <ShieldCheck className="w-6 h-6 text-violet-300" /> Administración
        </h1>
        <button onClick={load} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-surface-2 border border-white/10 text-slate-200">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Actualizar
        </button>
      </div>

      {data && !data.ok && <p className="rounded-xl bg-red-500/10 border border-red-400/30 text-red-200 text-sm p-3 mb-4">{data.error}</p>}

      {s?.faltaSql && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-400/30 p-4 mb-5 text-sm text-amber-100">
          <p className="flex items-center gap-2 font-bold">
            <Database className="w-4 h-4" /> Falta preparar la base de datos
          </p>
          <p className="mt-1 text-amber-100/80">
            Abre Supabase → SQL Editor, pega el contenido de <b>supabase-migrations.sql</b> (del repositorio) y ejecútalo una vez. Después vuelve aquí y toca Actualizar.
          </p>
        </div>
      )}

      {s && !s.faltaSql && (
        <div className="space-y-5">
          <Card icon={<Smartphone className="w-5 h-5 text-violet-300" />} title="Dispositivos activos">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Hoy" value={s.activos?.hoy.total ?? 0} sub={byApp(s.activos?.hoy)} />
              <Stat label="7 días" value={s.activos?.semana.total ?? 0} sub={byApp(s.activos?.semana)} />
              <Stat label="30 días" value={s.activos?.mes.total ?? 0} sub={byApp(s.activos?.mes)} />
              <Stat label="Desde siempre" value={s.dispositivos?.total ?? 0} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Stat label="Con cuenta (30 días)" value={s.dispositivos?.conCuenta ?? 0} sub="Respaldo de la biblioteca" />
              <Stat label="Sin cuenta (30 días)" value={s.dispositivos?.sinCuenta ?? 0} sub="Solo la app o la web" />
            </div>
            {!!s.dispositivos?.versiones.length && (
              <div className="mt-3">
                <p className="text-xs text-slate-400 mb-1.5">Versiones en uso (30 días)</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.dispositivos.versiones.map(([v, n]) => {
                    const [app, ver] = v.split(' ')
                    return (
                      <span key={v} className="rounded-full bg-surface-2 border border-white/8 px-2.5 py-1 text-xs text-slate-200">
                        {APP_NAME[app] ?? app} {ver} · <b>{n}</b>
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card icon={<Users className="w-5 h-5 text-violet-300" />} title={`Cuentas de respaldo (${s.cuentas?.length ?? 0})`}>
            {!s.cuentas?.length ? (
              <p className="text-slate-400 text-sm">Todavía no hay cuentas.</p>
            ) : (
              <div className="divide-y divide-white/5 max-h-80 overflow-y-auto -mx-1">
                {s.cuentas.map((c) => (
                  <div key={c.email} className="flex items-center gap-3 px-1 py-2">
                    <UserRound className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="text-sm text-white truncate flex-1 min-w-0">{c.email}</span>
                    <span className="text-xs text-slate-400 shrink-0 hidden sm:block">{c.apps.map((a) => APP_NAME[a] ?? a).join(', ')}</span>
                    <span className="text-xs text-slate-400 shrink-0">{c.dispositivos} disp.</span>
                    <span className="text-xs text-slate-400 shrink-0 w-24 text-right">{fmt(c.ultimaVez)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card icon={<Music2 className="w-5 h-5 text-violet-300" />} title="Canciones más escuchadas">
            <div className="flex gap-1.5 mb-3">
              {(['semana', 'mes'] as const).map((r) => (
                <button key={r} onClick={() => setSongsRange(r)} className={`px-3 py-1 rounded-full text-xs font-semibold ${songsRange === r ? 'bg-white text-black' : 'bg-surface-2 text-slate-300'}`}>
                  {r === 'semana' ? '7 días' : '30 días'}
                </button>
              ))}
            </div>
            {!songs.length ? (
              <p className="text-slate-400 text-sm">Sin datos todavía.</p>
            ) : (
              <ol className="divide-y divide-white/5">
                {songs.slice(0, 30).map((t, i) => (
                  <li key={t.track} className="flex items-center gap-3 py-1.5">
                    <span className="w-6 text-right text-slate-500 text-sm tabular-nums">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://i.ytimg.com/vi/${t.track}/default.jpg`} alt="" className="w-10 h-10 rounded object-cover bg-surface-2" loading="lazy" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-white truncate">{t.titulo || t.track}</span>
                      <span className="block text-xs text-slate-400 truncate">{t.artista}</span>
                    </span>
                    <span className="text-sm text-slate-300 tabular-nums shrink-0">{t.veces}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card icon={<Bug className="w-5 h-5 text-violet-300" />} title={`Errores (30 días) · ${abiertos.length} abiertos`}>
            {!errores.length ? (
              <p className="text-slate-400 text-sm">Ningún error reportado.</p>
            ) : (
              <div className="space-y-3">
                {errores.map((e) => (
                  <div key={e.mensaje} className={`rounded-xl border p-3 ${e.resuelto ? 'border-emerald-400/20 bg-emerald-500/5 opacity-70' : e.grave ? 'border-red-400/25 bg-red-500/5' : 'border-white/10 bg-surface-2/40'}`}>
                    <div className="flex items-start gap-2">
                      <p className="text-sm text-white font-semibold break-words flex-1 min-w-0">{e.mensaje}</p>
                      <span className="text-xs text-slate-400 shrink-0 text-right">
                        {e.veces} veces · {e.dispositivos} disp.
                        <br />
                        {fmt(e.ultima)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 break-words">
                      Dónde: {e.donde.join(', ')}
                      {e.paginas.length ? ` · Páginas: ${e.paginas.join(', ')}` : ''} · Versiones: {e.versiones.map((v) => v.replace(/^(\w+)/, (m) => APP_NAME[m] ?? m)).join(', ')}
                      {e.sinInternet ? ` · ${e.sinInternet} sin internet` : ''}
                    </p>
                    <div className="mt-2 text-xs leading-relaxed">
                      <p className="text-slate-300">
                        <b className="text-slate-200">Causa:</b> {e.causa}
                      </p>
                      <p className="text-slate-300">
                        <b className="text-slate-200">Cómo se soluciona:</b> {e.solucion}
                      </p>
                      {e.notaAnterior && <p className="text-amber-200 mt-1">Volvió a pasar después de marcarlo resuelto ({e.notaAnterior}).</p>}
                    </div>
                    {e.resuelto ? (
                      <div className="mt-2 flex items-center gap-2 text-xs text-emerald-300">
                        <CheckCircle2 className="w-4 h-4" /> Resuelto: {e.resuelto}
                        <button onClick={() => mark(e.mensaje, 'reabrir')} className="ml-auto inline-flex items-center gap-1 text-slate-400 hover:text-white">
                          <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={notes[e.mensaje] ?? ''}
                          onChange={(ev) => setNotes((n) => ({ ...n, [e.mensaje]: ev.target.value }))}
                          placeholder="Nota (qué se hizo)"
                          className="flex-1 min-w-0 rounded-lg bg-black/30 border border-white/10 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                        />
                        <button onClick={() => mark(e.mensaje, 'resolver')} className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 text-emerald-200 px-2.5 py-1.5 text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Marcar resuelto
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
      {!data && <Loader2 className="w-6 h-6 text-slate-500 animate-spin mx-auto mt-10" />}
    </div>
  )
}
