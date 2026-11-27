'use client'

import { useEffect, useState } from 'react'
import { Disc3, Loader2 } from 'lucide-react'
import type { SongInfo } from '@/lib/music-info'

// Acerca de la canción que suena: su historia, en qué se inspira, la letra o cómo se grabó
// (Wikipedia, en español o, si no hay, en inglés). Se lee aquí mismo, dentro de la app.
export default function SongAboutCard({ title, artist, className = '' }: { title: string; artist: string; className?: string }) {
  const [state, setState] = useState<{ key: string; song: SongInfo | null; loading: boolean }>({ key: '', song: null, loading: true })
  const [more, setMore] = useState(false)
  const key = `${artist}|${title}`
  useEffect(() => {
    let cancelled = false
    setMore(false)
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
          <div>
            <p className="text-white font-semibold">{song.title}</p>
            {song.description && <p className="text-slate-400 text-xs first-letter:uppercase">{song.description}</p>}
          </div>
          {song.intro.map((p, i) => (
            <p key={i} className="text-slate-300 text-sm leading-6">
              {p}
            </p>
          ))}
          {song.sections.length > 0 &&
            (more ? (
              song.sections.map((s) => (
                <div key={s.title}>
                  <p className="text-white text-sm font-bold mt-1">{s.title}</p>
                  {s.paras.map((p, i) => (
                    <p key={i} className="mt-1 text-slate-300 text-sm leading-6">
                      {p}
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
