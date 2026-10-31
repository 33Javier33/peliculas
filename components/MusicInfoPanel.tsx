'use client'

import TranslatableText from '@/components/TranslatableText'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, Disc3, UserRound, CalendarDays, Tag, ListMusic, Building2, Heart } from 'lucide-react'
import FollowArtistButton from '@/components/FollowArtistButton'
import type { WikiSummary } from '@/lib/music-info'

// "Sobre el disco" y "Sobre el artista": datos del catálogo (fecha, sello, géneros…) y un
// resumen de Wikipedia cuando existe.

export interface AlbumFacts {
  title: string
  type?: string
  releaseDate?: string
  label?: string
  genres: string[]
  tracks: number
  duration: number
  fans?: number
}

const TYPE_LABEL: Record<string, string> = { album: 'Álbum', single: 'Sencillo', ep: 'EP', compile: 'Recopilatorio' }

function longDate(d?: string) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const date = new Date(`${d}T12:00:00`)
  return date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}

function minutes(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

function WikiText({ info }: { info: WikiSummary }) {
  return (
    <div>
      <TranslatableText text={info.extract} className="text-slate-300 text-sm leading-relaxed" />
      <div className="flex items-center gap-4 mt-2">
        <a href={info.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs">
          Wikipedia{info.lang === 'en' ? ' (en inglés)' : ''} <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

export default function MusicInfoPanel({
  artist,
  album,
}: {
  artist: { id?: number; name: string; picture?: string; fans?: number; albums?: number }
  album?: AlbumFacts
}) {
  const [info, setInfo] = useState<{ artist: WikiSummary | null; album: WikiSummary | null } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ artist: artist.name })
    if (album) params.set('album', album.title)
    let cancelled = false
    fetch(`/api/music-info?${params}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setInfo(d))
      .catch(() => !cancelled && setInfo({ artist: null, album: null }))
    return () => {
      cancelled = true
    }
  }, [artist.name, album?.title])

  const picture = artist.picture || info?.artist?.image
  const facts: [React.ReactNode, string, string | undefined][] = album
    ? [
        [<CalendarDays key="d" className="w-4 h-4" />, 'Lanzamiento', longDate(album.releaseDate)],
        [<Disc3 key="t" className="w-4 h-4" />, 'Tipo', TYPE_LABEL[album.type || 'album'] || 'Álbum'],
        [<ListMusic key="c" className="w-4 h-4" />, 'Canciones', `${album.tracks} · ${minutes(album.duration)}`],
        [<Tag key="g" className="w-4 h-4" />, 'Género', album.genres.join(', ') || undefined],
        [<Building2 key="l" className="w-4 h-4" />, 'Sello', album.label],
        [<Heart key="f" className="w-4 h-4" />, 'Fans en Deezer', album.fans ? album.fans.toLocaleString('es') : undefined],
      ]
    : []

  return (
    <div className="mt-10 space-y-6">
      {album && (
        <section className="rounded-2xl bg-surface-1/60 border border-white/8 p-5">
          <h2 className="flex items-center gap-2 text-white font-bold text-lg font-display mb-4">
            <Disc3 className="w-5 h-5 text-violet-300" /> Sobre el disco
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
            {facts
              .filter(([, , v]) => v)
              .map(([icon, label, value]) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="mt-0.5 text-slate-500">{icon}</span>
                  <div className="min-w-0">
                    <dt className="text-slate-500 text-xs">{label}</dt>
                    <dd className="text-white text-sm font-semibold">{value}</dd>
                  </div>
                </div>
              ))}
          </dl>
          {info === null ? (
            <div className="space-y-2" aria-hidden>
              <div className="h-3 rounded bg-white/5 w-full animate-pulse" />
              <div className="h-3 rounded bg-white/5 w-5/6 animate-pulse" />
            </div>
          ) : info.album ? (
            <WikiText info={info.album} />
          ) : null}
        </section>
      )}

      <section className="rounded-2xl bg-surface-1/60 border border-white/8 p-5">
        <h2 className="flex items-center gap-2 text-white font-bold text-lg font-display mb-4">
          <UserRound className="w-5 h-5 text-violet-300" /> {album ? 'Sobre el artista' : 'Biografía'}
        </h2>
        <div className="flex items-center gap-4 mb-4">
          {album && (
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-surface-2 border border-white/10 shrink-0">
              {picture && <Image src={picture} alt={artist.name} fill sizes="64px" className="object-cover" unoptimized={!picture.includes('dzcdn')} />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {album && <p className="text-white font-bold font-display text-lg truncate">{artist.name}</p>}
            {info?.artist?.description && <p className="text-slate-400 text-sm first-letter:uppercase">{info.artist.description}</p>}
            {(artist.fans || artist.albums) && (
              <p className="text-slate-500 text-xs mt-0.5">
                {[artist.albums ? `${artist.albums} lanzamientos` : '', artist.fans ? `${artist.fans.toLocaleString('es')} fans` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        </div>
        {info === null ? (
          <div className="space-y-2" aria-hidden>
            <div className="h-3 rounded bg-white/5 w-full animate-pulse" />
            <div className="h-3 rounded bg-white/5 w-4/6 animate-pulse" />
          </div>
        ) : info.artist ? (
          <WikiText info={info.artist} />
        ) : (
          <p className="text-slate-500 text-sm">No encontramos una biografía de {artist.name}.</p>
        )}
        {album && artist.id ? (
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Link href={`/music/artist/${artist.id}`} className="inline-flex items-center px-5 py-2.5 rounded-full bg-surface-2 border border-white/10 text-white text-sm font-semibold hover:border-violet-400">
              Ver discografía
            </Link>
            <FollowArtistButton artist={{ id: artist.id, name: artist.name, picture: artist.picture || '' }} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
