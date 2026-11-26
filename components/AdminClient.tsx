'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Users, Smartphone, Music2, Bug, RefreshCw, Loader2, CheckCircle2, RotateCcw, Database, UserRound, LogOut, Play, Pause, Layers, ChevronDown, Globe, Info } from 'lucide-react'
import { callAccount } from '@/lib/account-sync'
import { useMusicStore } from '@/store/musicStore'

// Sesión de administrador: aparte de la cuenta personal (no la cierra ni la reemplaza) y guardada en
// este dispositivo hasta cerrarla aquí. Así se pasa de una a otra sin pedir otro código.
import { ADMIN_KEY } from '@/lib/admin-session'
type AdminSession = { email: string; token: string }
function readAdmin(): AdminSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null') as AdminSession | null
    return s?.token ? s : null
  } catch {
    return null
  }
}

function AdminLogin({ onDone }: { onDone: (s: AdminSession) => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [mail, setMail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await callAccount({ action: 'requestCode', email: mail.trim() }).catch(() => null)
    setBusy(false)
    if (r?.ok) setStep('code')
    else setError(r?.error || 'No se pudo enviar el código.')
  }
  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await callAccount<{ token?: string; email?: string }>({ action: 'verifyCode', email: mail.trim(), code, device: 'Administración' }).catch(() => null)
    setBusy(false)
    if (r?.ok && r.token && r.email) {
      const s = { email: r.email, token: r.token }
      try {
        localStorage.setItem(ADMIN_KEY, JSON.stringify(s))
      } catch {}
      onDone(s)
    } else setError(r?.error || 'No se pudo verificar el código.')
  }
  const input = 'w-full bg-surface-2 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-violet-500'
  return (
    <div className="pt-28 px-4 max-w-sm mx-auto">
      <ShieldCheck className="w-10 h-10 text-violet-300 mx-auto mb-3" />
      <h1 className="text-white text-xl font-bold text-center">Administración</h1>
      <p className="text-slate-400 text-sm mt-2 text-center">
        Entra con la cuenta de administrador. Es aparte de tu cuenta personal: esa sigue abierta, y esta queda guardada en este dispositivo.
      </p>
      {step === 'email' ? (
        <form onSubmit={request} className="mt-5 space-y-3">
          <input type="email" required value={mail} onChange={(e) => setMail(e.target.value)} placeholder="Correo de administrador" className={input} autoComplete="email" />
          <button disabled={busy} className="w-full py-3 rounded-xl bg-violet-500 text-white font-bold disabled:opacity-60">
            {busy ? 'Enviando…' : 'Enviar código'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-5 space-y-3">
          <p className="text-slate-300 text-sm text-center">Código enviado a {mail}</p>
          <input inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código" className={input} autoComplete="one-time-code" />
          <button disabled={busy} className="w-full py-3 rounded-xl bg-violet-500 text-white font-bold disabled:opacity-60">
            {busy ? 'Verificando…' : 'Entrar'}
          </button>
          <button type="button" onClick={() => setStep('email')} className="w-full text-slate-400 text-sm">
            Cambiar correo
          </button>
        </form>
      )}
      {error && <p className="mt-3 text-red-300 text-sm text-center">{error}</p>}
    </div>
  )
}

// Panel de administración: dispositivos activos (con y sin cuenta, por día y por app), versiones,
// cuentas de respaldo, canciones más escuchadas (se pueden escuchar aquí) y errores con fecha y
// hora exactas, a quién le pasó y en qué app, su causa y cómo se soluciona.

type Activos = { total: number; nuevos?: number; porApp: Record<string, number> }
type Caso = { at: string; app: string; version: string; cuenta: string; device: string; pagina: string; online: boolean; donde: string }
type Err = {
  mensaje: string
  veces: number
  dispositivos: number
  primera?: string
  ultima: string
  donde: string[]
  paginas: string[]
  versiones: string[]
  sinInternet: number
  casos?: Caso[] | null
  causa: string
  solucion: string
  grave: boolean
  resuelto: string | null
  notaAnterior: string | null
}
type Song = { track: string; titulo: string; artista: string; veces: number; personas?: number; ultimaVez?: string }
type Version = { app: string; version: string; dispositivos: number; ultimaVez: string; ultima: boolean }
type Cuenta = { email: string; respaldo: number; dispositivos: number; apps: string[]; ultimaVez: number; desde?: string | null; canciones30?: number }
type Data = {
  ok: boolean
  error?: string
  faltaSql?: boolean
  sqlViejo?: boolean
  activos?: { hoy: Activos; semana: Activos; mes: Activos }
  diario?: { dia: string; total: number; porApp: Record<string, number> }[]
  porApp?: { app: string; activos: number; conCuenta: number; sinCuenta: number; nuevos: number }[]
  dispositivos?: { total: number; mes: number; conCuenta: number; sinCuenta: number }
  versiones?: Version[]
  cuentas?: Cuenta[]
  canciones?: { semana: Song[]; mes: Song[] }
  errores?: Err[]
}

const APP_NAME: Record<string, string> = { media: 'App PulsoMedia', music: 'App PulsoMusic', web: 'Web (navegador)' }
const appName = (a: string) => APP_NAME[a] ?? a
const ago = (t: number | string | null | undefined) => {
  const ms = typeof t === 'number' ? t : t ? Date.parse(t) : 0
  if (!ms) return '—'
  const d = Math.floor((Date.now() - ms) / 86400000)
  if (d <= 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 30) return `hace ${d} días`
  return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}
/** Fecha y hora exactas (hora del teléfono o computador) */
const exact = (t: string | number | null | undefined) => {
  const ms = typeof t === 'number' ? t : t ? Date.parse(t) : 0
  if (!ms) return '—'
  return new Date(ms).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function Card({ icon, title, help, children }: { icon: React.ReactNode; title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface-1 border border-white/8 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-white font-bold">
        {icon} {title}
      </h2>
      {help && <p className="mt-1 mb-3 text-xs text-slate-400 leading-relaxed">{help}</p>}
      {!help && <div className="mb-3" />}
      {children}
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2/60 border border-white/5 px-3 py-2.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 leading-snug">{sub}</p>}
    </div>
  )
}

const byApp = (a?: Activos) =>
  a
    ? Object.entries(a.porApp)
        .map(([k, v]) => `${appName(k).replace(/^App /, '')} ${v}`)
        .join(' · ')
    : ''

/** Dispositivos activos por día (30 días): una barra por día, el número al pasar el dedo o el mouse */
function DailyBars({ days }: { days: { dia: string; total: number; porApp: Record<string, number> }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.total))
  const h = hover ?? days.length - 1
  const sel = days[h]
  const label = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div>
      <p className="text-xs text-slate-300 h-5">
        {sel ? (
          <>
            <b className="text-white">{label(sel.dia)}</b>: {sel.total} {sel.total === 1 ? 'dispositivo' : 'dispositivos'}
            {sel.total > 0 && <span className="text-slate-400"> ({byApp({ total: sel.total, porApp: sel.porApp })})</span>}
          </>
        ) : null}
      </p>
      <div className="mt-2 flex items-end gap-[2px] h-24 border-b border-white/10" role="img" aria-label="Dispositivos activos por día, últimos 30 días" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <button
            key={d.dia}
            type="button"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${label(d.dia)}: ${d.total}`}
            className="flex-1 h-full flex items-end group"
          >
            <span
              className={`w-full rounded-t-[4px] transition-colors ${i === h ? 'bg-violet-300' : 'bg-violet-500/60 group-hover:bg-violet-400'}`}
              style={{ height: d.total ? `${Math.max(4, (d.total / max) * 100)}%` : '2px', opacity: d.total ? 1 : 0.35 }}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>{days[0] ? label(days[0].dia) : ''}</span>
        <span>máx. {max}</span>
        <span>hoy</span>
      </div>
    </div>
  )
}

function SongList({ songs }: { songs: Song[] }) {
  const currentId = useMusicStore((s) => (s.isVisible ? s.queue[s.currentIndex]?.id : undefined))
  const playing = useMusicStore((s) => s.isPlaying)
  const toVideo = (t: Song) => ({ id: t.track, title: t.artista ? `${t.artista} - ${t.titulo}` : t.titulo, channelTitle: t.artista, thumbnail: `https://i.ytimg.com/vi/${t.track}/hqdefault.jpg`, publishedAt: '', description: '' })
  const play = (i: number) => {
    const st = useMusicStore.getState()
    if (currentId === songs[i].track) return st.setIsPlaying(!playing)
    st.play(songs.map(toVideo), i)
    st.setIsPlaying(true)
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-slate-400">
          <b className="text-slate-300">Veces</b> = cuántas veces sonó · <b className="text-slate-300">Personas</b> = cuántos dispositivos distintos la escucharon
        </p>
        <button onClick={() => play(0)} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white text-black px-3 py-1 text-xs font-bold">
          <Play className="w-3.5 h-3.5 fill-black" /> Escuchar todas
        </button>
      </div>
      <div className="grid grid-cols-[1.75rem_2.5rem_minmax(0,1fr)_3rem_3.5rem] gap-x-2 px-1 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-white/8">
        <span className="text-right">#</span>
        <span />
        <span>Canción · artista</span>
        <span className="text-right">Veces</span>
        <span className="text-right">Personas</span>
      </div>
      {/* ~7 canciones a la vista; el resto con la barra de desplazamiento */}
      <ol className="max-h-[392px] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
        {songs.map((t, i) => {
          const on = currentId === t.track
          return (
            <li key={t.track} className={`grid grid-cols-[1.75rem_2.5rem_minmax(0,1fr)_3rem_3.5rem] gap-x-2 items-center px-1 h-14 border-b border-white/5 ${on ? 'bg-white/5' : ''}`}>
              <span className="text-right text-slate-500 text-sm tabular-nums">{i + 1}</span>
              <button onClick={() => play(i)} className="relative w-10 h-10 rounded overflow-hidden bg-surface-2 group" aria-label={on && playing ? `Pausar ${t.titulo}` : `Escuchar ${t.titulo}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${t.track}/default.jpg`} alt="" className="w-full h-full object-cover" loading="lazy" />
                <span className={`absolute inset-0 flex items-center justify-center bg-black/50 ${on ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                  {on && playing ? <Pause className="w-4 h-4 text-white fill-white" /> : <Play className="w-4 h-4 text-white fill-white" />}
                </span>
              </button>
              <button onClick={() => play(i)} className="min-w-0 text-left">
                <span className={`block text-sm truncate ${on ? 'text-violet-300' : 'text-white'}`}>{t.titulo || t.track}</span>
                <span className="block text-xs text-slate-400 truncate">
                  {t.artista || 'Artista desconocido'}
                  {t.ultimaVez ? ` · última vez ${ago(t.ultimaVez + 'T12:00:00')}` : ''}
                </span>
              </button>
              <span className="text-right text-sm text-slate-200 tabular-nums">{t.veces}</span>
              <span className="text-right text-sm text-slate-400 tabular-nums">{t.personas ?? '—'}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ErrorCard({ e, note, setNote, onMark }: { e: Err; note: string; setNote: (v: string) => void; onMark: (a: 'resolver' | 'reabrir') => void }) {
  const [open, setOpen] = useState(false)
  const casos = e.casos ?? []
  const apps = Array.from(new Set(casos.map((c) => c.app)))
  return (
    <div className={`rounded-xl border p-3 ${e.resuelto ? 'border-emerald-400/20 bg-emerald-500/5 opacity-70' : e.grave ? 'border-red-400/25 bg-red-500/5' : 'border-white/10 bg-surface-2/40'}`}>
      <p className="text-sm text-white font-semibold break-words">{e.mensaje}</p>
      <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>
          <b className="text-slate-300">{e.veces}</b> {e.veces === 1 ? 'vez' : 'veces'} · <b className="text-slate-300">{e.dispositivos}</b> {e.dispositivos === 1 ? 'dispositivo' : 'dispositivos'}
        </span>
        <span>
          Última: <b className="text-slate-300">{exact(e.ultima)}</b>
        </span>
        {e.primera && e.veces > 1 && <span>Primera: {exact(e.primera)}</span>}
        <span>{(apps.length ? apps : e.versiones.map((v) => v.split(' ')[0])).map(appName).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span>
      </div>
      <div className="mt-2 text-xs leading-relaxed">
        <p className="text-slate-300">
          <b className="text-slate-200">Causa:</b> {e.causa}
        </p>
        <p className="text-slate-300">
          <b className="text-slate-200">Cómo se soluciona:</b> {e.solucion}
        </p>
        {e.notaAnterior && <p className="text-amber-200 mt-1">Volvió a pasar después de marcarlo resuelto ({e.notaAnterior}).</p>}
      </div>
      <button onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} /> {open ? 'Ocultar' : 'Ver'} cuándo y a quién ({casos.length || e.veces})
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-white/8 overflow-hidden">
          {casos.length ? (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-white/5 text-slate-400 sticky top-0">
                  <tr>
                    <th className="text-left font-semibold px-2 py-1.5">Fecha y hora</th>
                    <th className="text-left font-semibold px-2 py-1.5">Usuario</th>
                    <th className="text-left font-semibold px-2 py-1.5">Dónde</th>
                    <th className="text-left font-semibold px-2 py-1.5 hidden sm:table-cell">Página</th>
                  </tr>
                </thead>
                <tbody>
                  {casos.map((c, i) => (
                    <tr key={i} className="border-t border-white/5 align-top">
                      <td className="px-2 py-1.5 text-slate-200 whitespace-nowrap">{exact(c.at)}</td>
                      <td className="px-2 py-1.5 text-slate-300 break-all">{c.cuenta || <span className="text-slate-500">Sin cuenta · disp. {c.device.slice(0, 6)}</span>}</td>
                      <td className="px-2 py-1.5 text-slate-300">
                        {appName(c.app)} {c.version}
                        {!c.online && <span className="text-amber-300"> · sin internet</span>}
                        {c.donde && <span className="block text-slate-500">{c.donde}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-slate-400 hidden sm:table-cell">{c.pagina || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-2 text-[11px] text-slate-400">
              Este error se anotó antes de que se guardara el detalle de cada caso. Dónde: {e.donde.join(', ')}
              {e.paginas.length ? ` · Páginas: ${e.paginas.join(', ')}` : ''} · Versiones: {e.versiones.join(', ')}
            </p>
          )}
        </div>
      )}
      {e.resuelto ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4" /> Resuelto: {e.resuelto}
          <button onClick={() => onMark('reabrir')} className="ml-auto inline-flex items-center gap-1 text-slate-400 hover:text-white">
            <RotateCcw className="w-3.5 h-3.5" /> Reabrir
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Nota (qué se hizo)" className="flex-1 min-w-0 rounded-lg bg-black/30 border border-white/10 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500" />
          <button onClick={() => onMark('resolver')} className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 text-emerald-200 px-2.5 py-1.5 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Marcar resuelto
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdminClient() {
  const [session, setSession] = useState<AdminSession | null>(null)
  const token = session?.token ?? null
  const email = session?.email ?? ''
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [songsRange, setSongsRange] = useState<'semana' | 'mes'>('semana')
  const [notes, setNotes] = useState<Record<string, string>>({})
  useEffect(() => {
    setSession(readAdmin())
    setMounted(true)
  }, [])
  const logoutAdmin = () => {
    if (token) callAccount({ action: 'logout', token }).catch(() => {})
    try {
      localStorage.removeItem(ADMIN_KEY)
    } catch {}
    setSession(null)
    setData(null)
  }

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
  if (!token) return <AdminLogin onDone={setSession} />

  if (data && !data.ok && data.error === 'admin')
    return (
      <div className="pt-28 px-4 max-w-md mx-auto text-center">
        <ShieldCheck className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <h1 className="text-white text-xl font-bold">Sin acceso</h1>
        <p className="text-slate-400 text-sm mt-2">La cuenta {email} no es administradora.</p>
        <button onClick={logoutAdmin} className="mt-5 px-5 py-2.5 rounded-full bg-surface-2 border border-white/10 text-white text-sm font-bold">
          Entrar con otra cuenta
        </button>
      </div>
    )

  const s = data?.ok ? data : null
  const songs = s?.canciones?.[songsRange] ?? []
  const errores = s?.errores ?? []
  const abiertos = errores.filter((e) => !e.resuelto)
  const versiones = s?.versiones ?? []
  const viejas = versiones.filter((v) => !v.ultima && v.app !== 'web').reduce((n, v) => n + v.dispositivos, 0)
  const versionApps = Array.from(new Set(versiones.map((v) => v.app)))

  return (
    <div className="pt-24 pb-10 px-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white font-display">
          <ShieldCheck className="w-6 h-6 text-violet-300" /> Administración
        </h1>
        <button onClick={load} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-surface-2 border border-white/10 text-slate-200">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Actualizar
        </button>
        <button onClick={logoutAdmin} title={`Cerrar sesión de administrador (${email})`} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-surface-2 border border-white/10 text-slate-300">
          <LogOut className="w-3.5 h-3.5" /> Salir
        </button>
      </div>
      <p className="-mt-4 mb-5 text-xs text-slate-500">Administrador: {email} · tu cuenta personal sigue abierta aparte</p>

      {data && !data.ok && <p className="rounded-xl bg-red-500/10 border border-red-400/30 text-red-200 text-sm p-3 mb-4">{data.error}</p>}

      {(s?.faltaSql || s?.sqlViejo) && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-400/30 p-4 mb-5 text-sm text-amber-100">
          <p className="flex items-center gap-2 font-bold">
            <Database className="w-4 h-4" /> {s?.faltaSql ? 'Falta preparar la base de datos' : 'Falta actualizar la base de datos'}
          </p>
          <p className="mt-1 text-amber-100/80">
            Abre Supabase → SQL Editor, pega el contenido de <b>supabase-migrations.sql</b> (del repositorio) y ejecútalo
            {s?.sqlViejo ? ' de nuevo (trae lo nuevo: detalle de errores, personas por canción y actividad por día)' : ' una vez'}. Después vuelve aquí y toca Actualizar.
          </p>
        </div>
      )}

      {s && !s.faltaSql && (
        <div className="space-y-5">
          <Card
            icon={<Smartphone className="w-5 h-5 text-violet-300" />}
            title="Dispositivos activos"
            help="Cada teléfono, tablet o computador que abrió la app o la web cuenta como un dispositivo (sin datos personales). «Nuevos» = los que la abrieron por primera vez en ese período."
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Hoy" value={s.activos?.hoy.total ?? 0} sub={`${s.activos?.hoy.nuevos ?? 0} nuevos · ${byApp(s.activos?.hoy)}`} />
              <Stat label="7 días" value={s.activos?.semana.total ?? 0} sub={`${s.activos?.semana.nuevos ?? 0} nuevos · ${byApp(s.activos?.semana)}`} />
              <Stat label="30 días" value={s.activos?.mes.total ?? 0} sub={`${s.activos?.mes.nuevos ?? 0} nuevos · ${byApp(s.activos?.mes)}`} />
              <Stat label="Desde siempre" value={s.dispositivos?.total ?? 0} sub="Todos los que se han registrado" />
            </div>
            {!!s.diario?.length && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-300 mb-1">Activos por día (últimos 30 días)</p>
                <DailyBars days={s.diario} />
              </div>
            )}
            {!!s.porApp?.length && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-300 mb-1.5">Por app (últimos 30 días)</p>
                <div className="rounded-xl border border-white/8 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5 text-slate-400">
                      <tr>
                        <th className="text-left font-semibold px-3 py-2">Dónde</th>
                        <th className="text-right font-semibold px-3 py-2">Activos</th>
                        <th className="text-right font-semibold px-3 py-2">Con cuenta</th>
                        <th className="text-right font-semibold px-3 py-2">Sin cuenta</th>
                        <th className="text-right font-semibold px-3 py-2">Nuevos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.porApp.map((a) => (
                        <tr key={a.app} className="border-t border-white/5">
                          <td className="px-3 py-2 text-white">
                            <span className="inline-flex items-center gap-1.5">
                              {a.app === 'web' ? <Globe className="w-3.5 h-3.5 text-slate-400" /> : <Smartphone className="w-3.5 h-3.5 text-slate-400" />}
                              {appName(a.app)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-200 tabular-nums">{a.activos}</td>
                          <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{a.conCuenta}</td>
                          <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{a.sinCuenta}</td>
                          <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{a.nuevos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>

          <Card
            icon={<Layers className="w-5 h-5 text-violet-300" />}
            title="Versiones en uso"
            help="Qué versión tiene cada dispositivo (últimos 30 días). Las apps desactualizadas no reciben los arreglos del teléfono hasta que se actualizan; la web se actualiza sola."
          >
            {viejas > 0 && (
              <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-400/25 px-3 py-2 text-xs text-amber-100">
                <Info className="w-4 h-4 shrink-0 mt-px" /> {viejas} {viejas === 1 ? 'dispositivo usa' : 'dispositivos usan'} una versión de la app que no es la última.
              </p>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
              {versionApps.map((app) => (
                <div key={app} className="rounded-xl border border-white/8 p-3">
                  <p className="text-xs font-semibold text-white mb-2">{appName(app)}</p>
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                    {versiones
                      .filter((v) => v.app === app)
                      .map((v) => (
                        <li key={v.version} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-200 tabular-nums">{v.version}</span>
                          {v.ultima ? (
                            <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-1.5 py-px text-[10px] font-semibold">más nueva</span>
                          ) : app !== 'web' ? (
                            <span className="rounded-full bg-amber-500/15 text-amber-300 px-1.5 py-px text-[10px] font-semibold">desactualizada</span>
                          ) : null}
                          <span className="ml-auto text-slate-400 tabular-nums">
                            {v.dispositivos} disp. · {ago(v.ultimaVez)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card
            icon={<Users className="w-5 h-5 text-violet-300" />}
            title={`Usuarios con cuenta (${s.cuentas?.length ?? 0})`}
            help="Personas que iniciaron sesión con su correo para respaldar su biblioteca (Me gusta, playlists, discos). Las que usan la app sin cuenta solo aparecen en «Dispositivos activos»."
          >
            {!s.cuentas?.length ? (
              <p className="text-slate-400 text-sm">Todavía no hay cuentas.</p>
            ) : (
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-xs min-w-[620px]">
                    <thead className="bg-white/5 text-slate-400 sticky top-0">
                      <tr>
                        <th className="text-left font-semibold px-3 py-2">Correo</th>
                        <th className="text-left font-semibold px-3 py-2">Usa</th>
                        <th className="text-right font-semibold px-3 py-2">Dispositivos</th>
                        <th className="text-right font-semibold px-3 py-2">Canciones (30 días)</th>
                        <th className="text-right font-semibold px-3 py-2">Último respaldo</th>
                        <th className="text-right font-semibold px-3 py-2">Última actividad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.cuentas.map((c) => (
                        <tr key={c.email} className="border-t border-white/5">
                          <td className="px-3 py-2 text-white">
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="w-3.5 h-3.5 text-slate-500" />
                              {c.email}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-300">{c.apps.length ? c.apps.map((a) => appName(a).replace(/^App /, '')).join(', ') : '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{c.dispositivos}</td>
                          <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{c.canciones30 ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-400" title={exact(c.respaldo)}>
                            {ago(c.respaldo)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400" title={exact(c.ultimaVez)}>
                            {ago(c.ultimaVez)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>

          <Card icon={<Music2 className="w-5 h-5 text-violet-300" />} title="Canciones más escuchadas" help="Lo que más sonó en las apps y la web. Toca una canción para escucharla aquí.">
            <div className="flex gap-1.5 mb-3">
              {(['semana', 'mes'] as const).map((r) => (
                <button key={r} onClick={() => setSongsRange(r)} className={`px-3 py-1 rounded-full text-xs font-semibold ${songsRange === r ? 'bg-white text-black' : 'bg-surface-2 text-slate-300'}`}>
                  {r === 'semana' ? 'Últimos 7 días' : 'Últimos 30 días'}
                </button>
              ))}
            </div>
            {!songs.length ? <p className="text-slate-400 text-sm">Sin datos todavía.</p> : <SongList songs={songs} />}
          </Card>

          <Card
            icon={<Bug className="w-5 h-5 text-violet-300" />}
            title={`Errores (30 días) · ${abiertos.length} abiertos`}
            help="Agrupados por mensaje. Toca «Ver cuándo y a quién» para ver la fecha y hora exactas de cada caso, el usuario (o «Sin cuenta») y si fue en la web o en la app."
          >
            {!errores.length ? (
              <p className="text-slate-400 text-sm">Ningún error reportado.</p>
            ) : (
              <div className="space-y-3 max-h-[900px] overflow-y-auto pr-1">
                {errores.map((e) => (
                  <ErrorCard key={e.mensaje} e={e} note={notes[e.mensaje] ?? ''} setNote={(v) => setNotes((n) => ({ ...n, [e.mensaje]: v }))} onMark={(a) => mark(e.mensaje, a)} />
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
