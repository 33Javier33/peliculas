'use client'

import { useEffect, useState } from 'react'
import { Disc3, Loader2, Languages } from 'lucide-react'
import type { SongInfo } from '@/lib/music-info'
import { useLangStore } from '@/store/langStore'
import { LANGUAGES, translateText } from '@/lib/translate'

// Traducciones ya hechas (por canción e idioma)
const done = new Map<string, string[]>()

/** Traduce varios textos de una vez (pocas consultas): primero desde el propio dispositivo (no gasta
 * el servidor) y si no se puede, por el servidor. Si al volver no calzan las partes, uno por uno */
async function translateAll(items: string[], to: string): Promise<string[]> {
  const one = async (text: string) => {
    try {
      return (await translateText(text, to)).text
    } catch {
      const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, to }) })
      const d = (await r.json().catch(() => ({}))) as { text?: string }
      if (!r.ok || !d.text) throw new Error('sin traducción')
      return d.text
    }
  }
  // Grupos de hasta ~4500 letras, separados por una línea en blanco
  const groups: number[][] = []
  let cur: number[] = []
  let len = 0
  items.forEach((t, i) => {
    if (len + t.length > 4500 && cur.length) {
      groups.push(cur)
      cur = []
      len = 0
    }
    cur.push(i)
    len += t.length + 2
  })
  if (cur.length) groups.push(cur)
  const out = [...items]
  await Promise.all(
    groups.map(async (g) => {
      const joined = await one(g.map((i) => items[i]).join('\n\n'))
      const parts = joined.split(/\n\s*\n/).map((x) => x.trim())
      if (parts.length === g.length) g.forEach((i, k) => (out[i] = parts[k]))
      else await Promise.all(g.map(async (i) => (out[i] = await one(items[i]))))
    })
  )
  return out
}

// Acerca de la canción que suena: su historia, en qué se inspira, la letra o cómo se grabó
// (Wikipedia, en español o, si no hay, en inglés). Se lee aquí mismo, dentro de la app.
export default function SongAboutCard({ title, artist, className = '' }: { title: string; artist: string; className?: string }) {
  const [state, setState] = useState<{ key: string; song: SongInfo | null; loading: boolean }>({ key: '', song: null, loading: true })
  const [more, setMore] = useState(false)
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  // Traducción a la vista (null = el texto original)
  const [tr, setTr] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [trError, setTrError] = useState('')
  const key = `${artist}|${title}`
  useEffect(() => {
    let cancelled = false
    setMore(false)
    setTr(null)
    setTrError('')
    setState({ key, song: null, loading: true })
    fetch(`/api/song-info?${new URLSearchParams({ artist, title })}`)
      .then((r) => (r.ok ? r.json() : { song: null }))
      .catch(() => ({ song: null }))
      .then((d: { song: SongInfo | null }) => {
        if (!cancelled) setState({ key, song: d.song, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const { song, loading } = state
  // Todos los textos en orden: título del artículo, descripción, introducción y cada sección
  const texts = song ? [song.description || '', ...song.intro, ...song.sections.flatMap((s) => [s.title, ...s.paras])] : []
  const translate = async (to: string) => {
    if (!song) return
    const k = `${key}|${to}`
    setTrError('')
    const hit = done.get(k)
    if (hit) return setTr(hit)
    setBusy(true)
    try {
      const out = await translateAll(texts.map((t) => t || ' '), to)
      done.set(k, out)
      setTr(out)
    } catch {
      setTrError('No se pudo traducir ahora')
    }
    setBusy(false)
  }
  // Texto a mostrar (traducido o el original), por posición
  let n = 0
  const T = () => {
    const i = n++
    return tr?.[i]?.trim() || texts[i]
  }
  const langName = (c: string) => LANGUAGES.find((l) => l.code === c)?.name ?? c
  return (
    <section className={`rounded-2xl bg-surface-2/50 border border-white/8 p-4 ${className}`}>
      <h3 className="flex items-center gap-2 text-white font-bold text-sm">
        <Disc3 className="w-4 h-4 text-violet-300" /> Acerca de esta canción
      </h3>
      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Buscando su historia…
        </p>
      ) : !song ? (
        <p className="mt-2 text-slate-400 text-sm">Todavía no hay información sobre «{title}». Si es muy conocida, puede que aparezca más adelante.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {/* Traductor: al idioma elegido (se recuerda) y de vuelta al original */}
          <div className="flex flex-wrap items-center gap-2">
            {tr ? (
              <button onClick={() => setTr(null)} className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1 text-xs text-violet-300 font-semibold">
                <Languages className="w-3.5 h-3.5" /> Ver original
              </button>
            ) : (
              <button
                onClick={() => translate(lang)}
                disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-60 ${
                  song.lang !== lang ? 'bg-violet-500/20 text-violet-200' : 'bg-white/8 text-violet-300'
                }`}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />} Traducir al {langName(lang)}
              </button>
            )}
            <select
              value={lang}
              onChange={(e) => {
                setLang(e.target.value)
                if (tr) translate(e.target.value)
              }}
              aria-label="Idioma de la traducción"
              className="bg-transparent text-xs text-slate-300 border border-white/10 rounded-full px-2 py-1 focus:outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-surface-1">
                  {l.name}
                </option>
              ))}
            </select>
            {song.lang === 'en' && !tr && <span className="text-[11px] text-slate-500">El texto está en inglés</span>}
            {trError && <span className="text-[11px] text-amber-300">{trError}</span>}
          </div>
          <div>
            <p className="text-white font-semibold">{song.title}</p>
            {(() => {
              const d = T()
              return song.description ? <p className="text-slate-400 text-xs first-letter:uppercase">{d}</p> : null
            })()}
          </div>
          {song.intro.map((_, i) => (
            <p key={i} className="text-slate-300 text-sm leading-6">
              {T()}
            </p>
          ))}
          {song.sections.length > 0 &&
            (more ? (
              song.sections.map((s) => (
                <div key={s.title}>
                  <p className="text-white text-sm font-bold mt-1">{T()}</p>
                  {s.paras.map((_, i) => (
                    <p key={i} className="mt-1 text-slate-300 text-sm leading-6">
                      {T()}
                    </p>
                  ))}
                </div>
              ))
            ) : (
              <button onClick={() => setMore(true)} className="text-violet-300 text-sm font-semibold">
                Leer más: {song.sections.map((s) => s.title.toLowerCase()).join(', ')}
              </button>
            ))}
          {/* Licencia de Wikipedia (CC BY-SA): se indica la fuente */}
          <p className="text-[11px] text-slate-500">
            Texto de Wikipedia{song.lang === 'en' ? ' (en inglés)' : ''}, licencia CC BY-SA ·{' '}
            <a href={song.url} target="_blank" rel="noopener noreferrer" className="underline">
              fuente
            </a>
          </p>
        </div>
      )}
    </section>
  )
}
