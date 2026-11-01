'use client'

import { useEffect, useState } from 'react'
import { UserRound, Disc3, ExternalLink } from 'lucide-react'
import TranslatableText from '@/components/TranslatableText'
import { loadMusicInfo, FactsChips, type MusicInfo } from '@/components/MusicInfoPanel'

// "Sobre el artista" compacto (pantalla del reproductor, biblioteca): biografía de Wikipedia y
// datos de MusicBrainz (país, años, tipo, géneros) de lo que suene, venga de donde venga.
export default function ArtistAboutCard({ artist, album, className = '' }: { artist: string; album?: string; className?: string }) {
  const [info, setInfo] = useState<MusicInfo | null>(null)
  // Créditos con varios nombres ("Amalia Mendoza;Mariachi Vargas", "Bill Haley and his Comets"): el principal
  const name = artist
    .split(/;|\s+(?:and his|y su|with his|con su)\s+/i)[0]
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .trim()

  useEffect(() => {
    if (!name) return
    let cancelled = false
    setInfo(null)
    loadMusicInfo(name, album).then((d) => !cancelled && setInfo(d))
    return () => {
      cancelled = true
    }
  }, [name, album])

  // Sin nada que contar (artista desconocido): no se muestra
  if (!name || (info && !info.artist && !info.facts && !info.album)) return null

  const picture = info?.artist?.image
  return (
    <section className={`rounded-2xl bg-surface-1/80 border border-white/8 p-4 text-left ${className}`}>
      <h3 className="flex items-center gap-2 text-white font-bold font-display mb-3">
        <UserRound className="w-4 h-4 text-violet-300" /> Sobre el artista
      </h3>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-14 h-14 shrink-0 rounded-full overflow-hidden bg-surface-2 border border-white/10 flex items-center justify-center">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture} alt={name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <UserRound className="w-6 h-6 text-slate-500" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold truncate">{name}</p>
          {(info?.artist?.description || info?.facts?.note) && (
            <p className="text-slate-400 text-xs first-letter:uppercase line-clamp-2">{info?.artist?.description || info?.facts?.note}</p>
          )}
        </div>
      </div>
      {info === null ? (
        <div className="space-y-2" aria-hidden>
          <div className="h-3 rounded bg-white/5 w-full animate-pulse" />
          <div className="h-3 rounded bg-white/5 w-4/6 animate-pulse" />
        </div>
      ) : (
        <>
          <FactsChips facts={info.facts} />
          {info.artist && <TranslatableText text={info.artist.extract} className="text-slate-300 text-sm leading-relaxed" />}
          {info.album && (
            <div className="mt-4 pt-3 border-t border-white/8">
              <p className="flex items-center gap-2 text-white text-sm font-semibold mb-1.5">
                <Disc3 className="w-4 h-4 text-violet-300" /> {info.album.title}
              </p>
              <TranslatableText text={info.album.extract} className="text-slate-300 text-sm leading-relaxed" />
            </div>
          )}
          {info.artist && (
            <a href={info.artist.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs">
              Wikipedia{info.artist.lang === 'en' ? ' (en inglés)' : ''} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </>
      )}
    </section>
  )
}
