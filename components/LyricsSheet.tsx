'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Loader2, Languages, Mic2 } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import type { LyricLine, Lyrics } from '@/lib/lyrics'
import { translateText } from '@/lib/translate'

// Letra de la canción como karaoke: la línea que suena se resalta y la lista avanza sola. Tocar
// una línea lleva la canción a ese momento. Si la letra no está en español, se puede ver traducida.

const memo = new Map<string, Promise<Lyrics | null>>()
function loadLyrics(artist: string, title: string, duration: number) {
  const key = `${artist}|${title}`.toLowerCase()
  let p = memo.get(key)
  if (!p) {
    const params = new URLSearchParams({ artist, title })
    if (duration > 0) params.set('duration', String(Math.round(duration)))
    p = fetch(`/api/lyrics?${params}`)
      .then((r) => r.json())
      .then((d: { lyrics?: Lyrics | null }) => d.lyrics ?? null)
      .catch(() => null)
    memo.set(key, p)
  }
  return p
}

/** ¿Parece español? (palabras muy comunes del idioma) */
function looksSpanish(text: string) {
  const words = text.toLowerCase().match(/[a-záéíóúñü]+/g) ?? []
  if (words.length < 8) return true
  const es = new Set(['que', 'de', 'la', 'el', 'y', 'en', 'no', 'me', 'te', 'mi', 'tu', 'un', 'una', 'yo', 'es', 'por', 'con', 'se', 'lo', 'los', 'las', 'del', 'para', 'como', 'pero', 'más', 'quiero', 'amor', 'corazón'])
  const hits = words.filter((w) => es.has(w)).length
  return hits / words.length > 0.12
}

const translations = new Map<string, string[]>()
async function translateLines(lines: string[]): Promise<string[]> {
  const key = lines.join('\n')
  const hit = translations.get(key)
  if (hit) return hit
  const text = lines.map((l) => l || '·').join('\n')
  let out = ''
  try {
    const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, to: 'es' }) })
    const d = (await r.json()) as { text?: string }
    out = r.ok && d.text ? d.text : ''
  } catch {}
  if (!out) out = (await translateText(text, 'es')).text
  const res = out.split('\n').map((l) => (l.trim() === '·' ? '' : l.trim()))
  // Si el traductor juntó o separó líneas, se muestra igual pero sin emparejar mal
  const fixed = res.length === lines.length ? res : lines.map((_, i) => res[i] ?? '')
  translations.set(key, fixed)
  return fixed
}

export default function LyricsSheet({ artist, title, onClose }: { artist: string; title: string; onClose: () => void }) {
  const duration = useMusicStore((s) => s.duration)
  const [lyrics, setLyrics] = useState<Lyrics | null | undefined>(undefined)
  const [active, setActive] = useState(-1)
  const [showEs, setShowEs] = useState(false)
  const [es, setEs] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLyrics(undefined)
    setEs(null)
    setShowEs(false)
    loadLyrics(artist, title, duration).then((l) => !cancelled && setLyrics(l))
    return () => {
      cancelled = true
    }
    // Solo al cambiar de canción
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artist, title])

  const lines: LyricLine[] = useMemo(
    () => lyrics?.synced ?? (lyrics?.plain ? lyrics.plain.split(/\r?\n/).map((text) => ({ t: -1, text })) : []),
    [lyrics]
  )
  const synced = !!lyrics?.synced
  const spanish = useMemo(() => looksSpanish(lines.map((l) => l.text).join(' ')), [lines])

  // Karaoke: se mira el segundo de la canción 4 veces por segundo (solo cambia la pantalla al pasar de línea)
  useEffect(() => {
    if (!synced) return
    const w = window as unknown as { __cpnTime?: () => { t: number } }
    const tick = () => {
      const t = (w.__cpnTime?.().t ?? 0) + 0.25
      let i = -1
      for (let k = 0; k < lines.length; k++) {
        if (lines[k].t <= t) i = k
        else break
      }
      setActive((prev) => (prev === i ? prev : i))
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [synced, lines])

  // La línea que suena queda al centro
  useEffect(() => {
    if (active < 0) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${active}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  const toggleEs = async () => {
    if (showEs) return setShowEs(false)
    if (!es) {
      setBusy(true)
      try {
        setEs(await translateLines(lines.map((l) => l.text)))
      } finally {
        setBusy(false)
      }
    }
    setShowEs(true)
  }

  const seek = (t: number) => {
    const d = (window as unknown as { __cpnTime?: () => { d: number } }).__cpnTime?.().d || duration
    if (t >= 0 && d > 0) useMusicStore.getState().seekTo(Math.min(0.999, t / d))
  }

  return (
    <div className="fixed inset-0 z-[96] flex flex-col bg-gradient-to-b from-violet-950 via-obsidian to-obsidian" role="dialog" aria-label="Letra de la canción">
      <div className="flex items-center gap-3 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3 border-b border-white/8">
        <Mic2 className="w-5 h-5 text-violet-300 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold truncate">{title}</p>
          <p className="text-slate-400 text-sm truncate">{artist}</p>
        </div>
        {lines.length > 0 && !spanish && (
          <button
            onClick={toggleEs}
            className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${showEs ? 'bg-violet-500 text-white' : 'bg-surface-2 border border-white/10 text-slate-200'}`}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />} {showEs ? 'Original' : 'Ver en español'}
          </button>
        )}
        <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-slate-300" aria-label="Cerrar la letra">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-10 text-center">
        {lyrics === undefined ? (
          <div className="flex justify-center pt-20">
            <Loader2 className="w-8 h-8 text-violet-300 animate-spin" />
          </div>
        ) : lyrics?.instrumental ? (
          <p className="pt-20 text-slate-400">Esta canción es instrumental: no tiene letra. 🎶</p>
        ) : !lines.length ? (
          <p className="pt-20 text-slate-400">No encontramos la letra de esta canción.</p>
        ) : (
          <div className="space-y-4 pb-[40vh]">
            {!synced && <p className="text-xs text-slate-500 mb-6">Letra sin tiempos: no se puede seguir como karaoke.</p>}
            {lines.map((l, i) => {
              const on = i === active
              const past = synced && i < active
              return (
                <button
                  key={i}
                  data-line={i}
                  onClick={() => synced && seek(l.t)}
                  className={`block w-full transition-all duration-300 ${synced ? 'cursor-pointer' : 'cursor-default'} ${
                    on ? 'text-white text-2xl font-extrabold scale-105' : past ? 'text-slate-500 text-lg font-semibold' : synced ? 'text-slate-300/70 text-lg font-semibold' : 'text-slate-200 text-lg'
                  }`}
                >
                  {l.text || (synced ? '♪' : ' ')}
                  {showEs && es?.[i] && l.text && <span className={`block mt-1 text-sm font-medium ${on ? 'text-violet-200' : 'text-violet-300/60'}`}>{es[i]}</span>}
                </button>
              )
            })}
            <p className="pt-6 text-[11px] text-slate-600">Letra: {lyrics?.source}</p>
          </div>
        )}
      </div>
    </div>
  )
}
