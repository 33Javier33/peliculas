'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, RefreshCw, Copy, Activity } from 'lucide-react'
import { findAudioCandidates } from '@/lib/audio-sources'
import { getNative } from '@/lib/native'

// Página de diagnóstico: prueba cada fuente (Pluto, TV, radio, música, películas) desde el
// servidor y algunas cosas desde este teléfono (Pluto directo, transmitir a la TV).

interface Check {
  id: string
  area: string
  name: string
  ok: boolean
  ms: number
  detail: string
}

async function deviceChecks(): Promise<Check[]> {
  const out: Check[] = []
  // ¿El teléfono puede abrir Pluto directo (sin intermediario)?
  const t0 = Date.now()
  try {
    const r = await fetch('/api/tv?list=pluto', { cache: 'no-store' })
    const d = (await r.json()) as { channels?: { name: string; url: string }[] }
    const ch = d.channels?.[0]
    if (!ch) throw new Error('no hay canales para probar')
    const get = (u: string) => fetch(u).then((x) => (x.ok ? x.text() : Promise.reject(new Error(`HTTP ${x.status}`))))
    let text = await get(ch.url)
    if (!text.includes('#EXTM3U')) throw new Error('la respuesta no es video')
    // Lista principal → primera calidad → primer segmento (este va directo desde Pluto)
    const firstUri = (t: string) => t.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#'))?.trim() || ''
    let uri = firstUri(text)
    if (/\.m3u8|\/api\/hls/.test(uri) && !/\.ts(\?|$)/.test(uri)) {
      text = await get(uri)
      uri = firstUri(text)
    }
    let detail = `«${ch.name}» responde`
    if (uri) {
      const seg = await fetch(uri, { headers: { Range: 'bytes=0-1023' } }).catch(() => null)
      detail += seg && (seg.ok || seg.status === 206) ? ' · video directo OK' : ' · video directo bloqueado (se usará el intermediario)'
    }
    out.push({ id: 'pluto-device', area: 'Este teléfono', name: 'Pluto TV desde el teléfono', ok: true, ms: Date.now() - t0, detail })
  } catch (err) {
    out.push({ id: 'pluto-device', area: 'Este teléfono', name: 'Pluto TV desde el teléfono', ok: false, ms: Date.now() - t0, detail: (err as Error).message })
  }
  // App de Android: audio sacado por el propio teléfono
  const native = getNative()
  if (native) {
    const t2 = Date.now()
    const ok = await new Promise<string>((resolve) => {
      const a = new Audio()
      a.muted = true
      a.preload = 'auto'
      const done = (v: string) => {
        a.removeAttribute('src')
        a.load()
        resolve(v)
      }
      a.oncanplay = () => done('')
      a.onerror = () => done('el teléfono no pudo obtener el audio')
      setTimeout(() => done('sin respuesta en 15 s'), 15000)
      a.src = `${native.audioBase()}/yt/kJQP7kiw5Fk`
    })
    out.push({
      id: 'native-audio',
      area: 'Este teléfono',
      name: `App de Android ${native.version()}: audio desde el teléfono`,
      ok: !ok,
      ms: Date.now() - t2,
      detail: ok || 'funciona: la música sigue con la pantalla bloqueada',
    })
  }

  // Audio para pantalla bloqueada, buscado desde este teléfono (como lo hace la música)
  const t1 = Date.now()
  try {
    const list = await findAudioCandidates('kJQP7kiw5Fk')
    if (list.length === 0) throw new Error('ningún servidor de audio respondió')
    // ¿Alguno suena de verdad? (se prueba con un reproductor de audio, sin sonido)
    let okSource = ''
    for (const c of list.slice(0, 4)) {
      const ok = await new Promise<boolean>((resolve) => {
        const a = new Audio()
        a.muted = true
        a.preload = 'auto'
        const done = (v: boolean) => {
          a.removeAttribute('src')
          a.load()
          resolve(v)
        }
        a.oncanplay = () => done(true)
        a.onerror = () => done(false)
        setTimeout(() => done(false), 8000)
        a.src = c.url
      })
      if (ok) {
        okSource = new URL(c.source).hostname
        break
      }
    }
    if (!okSource) throw new Error(`${list.length} fuentes encontradas, pero ninguna se puede reproducir`)
    out.push({ id: 'audio-device', area: 'Este teléfono', name: 'Audio con pantalla bloqueada (desde el teléfono)', ok: true, ms: Date.now() - t1, detail: `suena desde ${okSource}` })
  } catch (err) {
    out.push({ id: 'audio-device', area: 'Este teléfono', name: 'Audio con pantalla bloqueada (desde el teléfono)', ok: false, ms: Date.now() - t1, detail: (err as Error).message })
  }

  const chrome = /Chrome/.test(navigator.userAgent) && !/CriOS|SamsungBrowser|EdgA|OPR/.test(navigator.userAgent)
  out.push({
    id: 'cast',
    area: 'Este teléfono',
    name: 'Transmitir con Chromecast',
    ok: chrome,
    ms: 0,
    detail: chrome ? 'Navegador compatible (Chrome)' : 'Este navegador no permite Chromecast: abre la app con Google Chrome',
  })
  out.push({
    id: 'airplay',
    area: 'Este teléfono',
    name: 'AirPlay',
    ok: typeof (window as unknown as { WebKitPlaybackTargetAvailabilityEvent?: unknown }).WebKitPlaybackTargetAvailabilityEvent !== 'undefined',
    ms: 0,
    detail: 'Solo en iPhone/iPad con Safari',
  })
  return out
}

export default function StatusClient() {
  const [server, setServer] = useState<Check[] | null>(null)
  const [device, setDevice] = useState<Check[] | null>(null)
  const [at, setAt] = useState('')
  const [copied, setCopied] = useState(false)

  const run = useCallback(() => {
    setServer(null)
    setDevice(null)
    fetch('/api/estado', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { checks: Check[]; at: string; region: string }) => {
        setServer(d.checks)
        setAt(`${new Date(d.at).toLocaleString('es')} · país ${d.region}`)
      })
      .catch(() => setServer([{ id: 'api', area: 'Servidor', name: 'Servidor de la app', ok: false, ms: 0, detail: 'no responde' }]))
    deviceChecks().then(setDevice)
  }, [])
  useEffect(run, [run])

  const all = [...(server ?? []), ...(device ?? [])]
  const copy = async () => {
    const text = [`Estado ${at} · v${process.env.NEXT_PUBLIC_APP_VERSION}`, ...all.map((c) => `${c.ok ? '✅' : '❌'} ${c.name}: ${c.detail} (${c.ms} ms)`)].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const areas = Array.from(new Set(all.map((c) => c.area)))
  const failing = all.filter((c) => !c.ok).length

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white font-display">
          <Activity className="w-6 h-6 text-violet-300" /> Estado de las fuentes
        </h1>
        <p className="text-slate-400 text-sm mt-1 mb-5">
          Prueba en este momento cada servicio que usa la app. {at && <span className="text-slate-500">{at}</span>}
        </p>

        <div className="flex gap-2 mb-6">
          <button onClick={run} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-violet-500 text-white text-sm font-semibold">
            <RefreshCw className="w-4 h-4" /> Volver a probar
          </button>
          <button onClick={copy} disabled={!server} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-2 border border-white/10 text-white text-sm font-semibold disabled:opacity-50">
            <Copy className="w-4 h-4" /> {copied ? 'Copiado' : 'Copiar resultado'}
          </button>
        </div>

        {server && device && (
          <p className={`mb-5 text-sm font-semibold ${failing ? 'text-amber-300' : 'text-emerald-300'}`}>
            {failing ? `${failing} ${failing === 1 ? 'fuente con problemas' : 'fuentes con problemas'}` : 'Todo funciona'}
          </p>
        )}

        {!server && (
          <p className="flex items-center gap-2 text-slate-400 text-sm mb-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Probando (puede tardar hasta un minuto)…
          </p>
        )}

        {areas.map((area) => (
          <section key={area} className="mb-6">
            <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{area}</h2>
            <ul className="rounded-2xl bg-surface-1/60 border border-white/8 divide-y divide-white/5">
              {all
                .filter((c) => c.area === area)
                .map((c) => (
                  <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                    {c.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-semibold">{c.name}</p>
                      <p className={`text-xs ${c.ok ? 'text-slate-400' : 'text-red-300'}`}>{c.detail}</p>
                    </div>
                    {c.ms > 0 && <span className="text-slate-600 text-xs shrink-0">{(c.ms / 1000).toFixed(1)} s</span>}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
