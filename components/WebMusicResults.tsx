'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Globe, Play, Loader2, UserRound, Disc3, TvMinimalPlay } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import type { CatalogArtist, CatalogAlbum } from '@/lib/catalog'
import ArchiveInlineResults from '@/components/ArchiveInlineResults'
import { useMusicStore } from '@/store/musicStore'
import { cachedJson } from '@/lib/client-cache'

// Lo mismo buscado fuera de tu biblioteca: Internet Archive, música libre, artistas y álbumes del
// catálogo y, al final, canciones de YouTube
export default function WebMusicResults({ query }: { query: string }) {
  const q = query.trim()
  const [catalog, setCatalog] = useState<{ artists: CatalogArtist[]; albums: CatalogAlbum[] } | null>(null)
  const [yt, setYt] = useState<MusicVideo[] | null>(null)
  useEffect(() => {
    setCatalog(null)
    setYt(null)
    if (q.length < 2) return
    let cancelled = false
    cachedJson<{ artists: CatalogArtist[]; albums: CatalogAlbum[] }>(`/api/catalog/search?q=${encodeURIComponent(q)}`, 6 * 3600_000).then(
      (d) => !cancelled && setCatalog(d ?? { artists: [], albums: [] })
    )
    cachedJson<{ videos?: MusicVideo[] }>(`/api/youtube/music?q=${encodeURIComponent(q)}`, 6 * 3600_000).then((d) => !cancelled && setYt(d?.videos ?? []))
    return () => {
      cancelled = true
    }
  }, [q])
  if (q.length < 2) return null
  const head = 'flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-[0.08em] font-display mb-3'
  return (
    <div className="mt-4 rounded-2xl bg-surface-1/40 border border-white/8 p-3 sm:p-4">
      <p className="flex items-center gap-2 text-white text-sm font-semibold mb-3">
        <Globe className="w-4 h-4 text-cyan-300" /> También en internet
      </p>
      <ArchiveInlineResults query={q} />
      <ArchiveInlineResults query={q} scope="free" />
      {catalog === null ? (
        <p className="flex items-center gap-2 text-slate-500 text-xs mb-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando artistas y álbumes…
        </p>
      ) : (
        <>
          {catalog.artists.length > 0 && (
            <div className="mb-5">
              <p className={head}>
                <UserRound className="w-3.5 h-3.5" /> Artistas
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
                {catalog.artists.slice(0, 10).map((a) => (
                  <Link key={a.id} href={`/music/artist/${a.id}`} className="shrink-0 w-20 text-center">
                    <span className="block w-20 h-20 rounded-full overflow-hidden bg-surface-2">
                      {a.picture && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.picture} alt="" loading="lazy" className="w-full h-full object-cover" />
                      )}
                    </span>
                    <span className="block text-white text-xs font-semibold mt-1 line-clamp-2">{a.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {catalog.albums.length > 0 && (
            <div className="mb-5">
              <p className={head}>
                <Disc3 className="w-3.5 h-3.5" /> Álbumes
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
                {catalog.albums.slice(0, 12).map((a) => (
                  <Link key={a.id} href={`/music/album/${a.id}`} className="shrink-0 w-28">
                    <span className="block w-28 h-28 rounded-xl overflow-hidden bg-surface-2">
                      {a.cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                      )}
                    </span>
                    <span className="block text-white text-xs font-semibold mt-1 truncate">{a.title}</span>
                    <span className="block text-slate-500 text-[10px] truncate">{a.artist.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {yt === null ? (
        <p className="flex items-center gap-2 text-slate-500 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando en YouTube…
        </p>
      ) : yt.length > 0 ? (
        <div>
          <p className={head}>
            <TvMinimalPlay className="w-3.5 h-3.5" /> En YouTube
          </p>
          <ul className="divide-y divide-white/5">
            {yt.slice(0, 15).map((v, i) => (
              <li key={v.id}>
                <button onClick={() => useMusicStore.getState().play(yt.slice(0, 15), i)} className="w-full flex items-center gap-3 py-2 text-left">
                  <span className="w-14 h-10 rounded-lg overflow-hidden bg-surface-2 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-white text-sm truncate">{v.title}</span>
                    <span className="block text-slate-500 text-xs truncate">{v.channelTitle}</span>
                  </span>
                  <Play className="w-4 h-4 text-violet-300 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
