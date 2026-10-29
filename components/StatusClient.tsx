'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, RefreshCw, Copy, Activity } from 'lucide-react'

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
    const r = await fetch('/api/tv?list=pluto')
    const d = (await r.json()) as { channels?: { name: string; url: string }[] }
    const ch = d.channels?.[0]
    if (!ch) throw new Error('no hay canales para probar')
    const text = await fetch(ch.url).then((x) => (x.ok ? x.text() : Promise.reject(new Error(`HTTP ${x.status}`))))
    if (!text.includes('#EXTM3U')) throw new Error('la respuesta no es video')
    out.push({ id: 'pluto-device', area: 'Este teléfono', name: 'Pluto TV desde el teléfono', ok: true, ms: Date.now() - t0, detail: `«${ch.name}» responde` })
  } catch (err) {
    out.push({ id: 'pluto-device', area: 'Este teléfono', name: 'Pluto TV desde el teléfono', ok: false, ms: Date.now() - t0, detail: (err as Error).message })
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
