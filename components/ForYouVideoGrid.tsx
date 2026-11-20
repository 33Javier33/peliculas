'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cachedJson } from '@/lib/client-cache'
import { decodeEntities, type MusicVideo } from '@/lib/youtube-music'
import { useTaste } from '@/components/PulsoTubeClient'
import { withoutBlocked, useBlockedVersion } from '@/store/blockStore'

// Inicio en el computador, como YouTube: cuadrícula de videos parecidos a lo que miras, te gusta
// y escuchas. Sin historial todavía: los videos musicales más vistos de tu país.

type Card = { id: string; title: string; channel: string; views?: string; duration?: string }

const toCard = (v: MusicVideo): Card => ({
  id: v.id,
  title: decodeEntities(v.title),
  channel: decodeEntities(v.channelTitle || ''),
  views: v.viewCount,
  duration: v.duration,
})

export default function ForYouVideoGrid({ limit = 12 }: { limit?: number }) {
  const taste = useTaste()
  const router = useRouter()
  const [cards, setCards] = useState<Card[] | null>(null)
  const tasteKey = taste.ids.join(',') + '|' + taste.artists.join(',')
  useEffect(() => {
    let alive = true
    const qs = new URLSearchParams()
    taste.ids.forEach((id) => qs.append('ids', id))
    taste.artists.forEach((a) => qs.append('artist', a))
    qs.set('genres', '2')
    // Guardado 6 h en el navegador: no se le pide al servidor en cada visita
    const req = taste.ids.length || taste.artists.length
      ? cachedJson<{ videos?: MusicVideo[] }>(`/api/youtube/for-you?${qs.toString()}`, 6 * 3600_000, (d) => !!d?.videos?.length)
      : cachedJson<{ videos?: MusicVideo[] }>('/api/youtube/music', 6 * 3600_000, (d) => !!d?.videos?.length)
    req
      .then((d) => alive && setCards((d?.videos ?? []).filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id)).map(toCard)))
      .catch(() => alive && setCards([]))
    return () => {
      alive = false
    }
  }, [tasteKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const blockedVersion = useBlockedVersion()
  const shown = useMemo(() => (cards ? withoutBlocked(cards).slice(0, limit) : null), [cards, limit, blockedVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  if (shown && shown.length === 0) return null
  return (
    <section aria-label="Videos para ti">
      <h2 className="text-xl font-bold text-white mb-4">{taste.ids.length || taste.artists.length ? 'Para ti' : 'Lo más visto en música'}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
        {!shown
          ? Array.from({ length: Math.min(limit, 8) }).map((_, i) => (
              <div key={i} aria-hidden>
                <div className="aspect-video rounded-xl bg-surface-1 animate-pulse" />
                <div className="mt-3 h-4 w-4/5 rounded bg-surface-1 animate-pulse" />
                <div className="mt-2 h-3 w-1/2 rounded bg-surface-1 animate-pulse" />
              </div>
            ))
          : shown.map((v) => (
              <button key={v.id} onClick={() => router.push(`/tube?play=${v.id}`)} className="group text-left min-w-0">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  {v.duration && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">{v.duration}</span>}
                </div>
                <div className="mt-3 flex gap-3">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {(v.channel || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-white text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-violet-200">{v.title}</span>
                    <span className="block text-slate-400 text-sm truncate mt-1">{v.channel}</span>
                    {v.views && <span className="block text-slate-500 text-sm">{v.views} vistas</span>}
                  </span>
                </div>
              </button>
            ))}
      </div>
    </section>
  )
}
