'use client'

import TranslatableText from '@/components/TranslatableText'
import { useEffect, useMemo, useState } from 'react'
import { Play, Shuffle, Plus, Check, ListPlus, ExternalLink, Loader2, Disc3, AlertCircle, Share2 } from 'lucide-react'
import { fetchAlbums, toEntries, type ApiAlbum } from '@/lib/link-albums'
import { useMusicStore } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'
import { usePlaylistStore } from '@/store/playlistStore'
import ViewToggle, { useView } from '@/components/ViewToggle'
import TrackTiles from '@/components/TrackTiles'
import BackButton from '@/components/BackButton'
import { playlistShareUrl, shareLink } from '@/lib/share'

// Página de un disco de Internet Archive (como la de un álbum): canciones, escuchar, guardar
export default function ArchiveAlbumClient({ id }: { id: string }) {
  const url = `https://archive.org/details/${encodeURIComponent(id)}`
  const [albums, setAlbums] = useState<ApiAlbum[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const view = useView()
  const addAlbum = useLinksStore((s) => s.addAlbum)
  const savedSources = useLinksStore((s) => s.albums.map((a) => a.source).join('|'))

  useEffect(() => {
    let cancelled = false
    fetchAlbums(url)
      .then((list) => !cancelled && setAlbums(list))
      .catch((err) => !cancelled && setError((err as Error).message))
    return () => {
      cancelled = true
    }
  }, [url])

  const entries = useMemo(() => (albums ?? []).map(toEntries), [albums])
  const tracks = useMemo(() => entries.flatMap((e) => e.tracks), [entries])
  const first = albums?.[0]
  const saved = savedSources.split('|').includes(url)

  const play = (index: number, shuffle?: boolean) => {
    if (!tracks.length) return
    const st = useMusicStore.getState()
    if (shuffle !== undefined && shuffle !== st.shuffle) st.toggleShuffle()
    st.play(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : index)
  }
  const save = () => {
    let added = 0
    for (const e of entries) added += addAlbum(e.album, e.tracks)
    setNotice(added ? `Guardado en tu biblioteca (${added} canciones)` : 'Ya estaba guardado')
  }

  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <BackButton fallbackHref="/music/library" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-4">
          Volver
        </BackButton>

        {error ? (
          <div className="flex items-start gap-3 bg-surface-1 border border-white/8 rounded-xl px-4 py-4 text-sm text-slate-300">
            <AlertCircle className="w-5 h-5 text-amber-300 shrink-0" />
            <div>
              <p>{error}</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-violet-300 underline">
                Abrir en archive.org
              </a>
            </div>
          </div>
        ) : !albums ? (
          <div className="flex items-center gap-3 text-slate-400 py-16 justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-violet-300" /> Cargando el disco…
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-end gap-5 mb-6">
              <span className="w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden bg-surface-2 shrink-0 mx-auto sm:mx-0 flex items-center justify-center shadow-2xl shadow-violet-900/40">
                {first?.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={first.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Disc3 className="w-16 h-16 text-slate-600" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.12em]">Disco · Internet Archive</p>
                <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight break-words">{first?.title}</h1>
                <p className="text-slate-400 text-sm mt-1">
                  {[first?.artist, first?.year, `${tracks.length} ${tracks.length === 1 ? 'canción' : 'canciones'}`].filter(Boolean).join(' · ')}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <button onClick={() => play(0, false)} className="inline-flex items-center gap-2 bg-violet-500 text-white font-bold px-5 py-2.5 rounded-full text-sm">
                    <Play className="w-4 h-4 fill-white" /> Reproducir
                  </button>
                  <button onClick={() => play(0, true)} className="inline-flex items-center gap-2 bg-surface-1 border border-white/10 text-white font-semibold px-4 py-2.5 rounded-full text-sm">
                    <Shuffle className="w-4 h-4" /> Aleatorio
                  </button>
                  <button
                    onClick={save}
                    disabled={saved}
                    className={`h-10 px-4 rounded-full border flex items-center gap-1.5 text-sm ${saved ? 'border-emerald-400/40 text-emerald-300' : 'bg-surface-1 border-white/10 text-slate-200'}`}
                  >
                    {saved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {saved ? 'Guardado' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => usePlaylistStore.getState().openAdd(tracks)}
                    className="w-10 h-10 rounded-full bg-surface-1 border border-white/10 text-slate-200 flex items-center justify-center"
                    aria-label="Agregar a playlist"
                  >
                    <ListPlus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () =>
                      shareLink(first?.title || 'Disco', `Escucha "${first?.title}" en Carlos P. Nauto Interactive`, await playlistShareUrl(first?.title || 'Disco', tracks))
                    }
                    className="w-10 h-10 rounded-full bg-surface-1 border border-white/10 text-slate-200 flex items-center justify-center"
                    aria-label="Compartir el disco"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-surface-1 border border-white/10 text-slate-200 flex items-center justify-center" aria-label="Ver en archive.org">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <span className="ml-auto">
                    <ViewToggle />
                  </span>
                </div>
                {notice && <p className="text-emerald-300 text-sm mt-2">{notice}</p>}
              </div>
            </div>
            {first?.description && (
              <div className="mb-5">
                <TranslatableText text={first.description} className="text-slate-400 text-sm leading-relaxed" />
              </div>
            )}
            <TrackTiles
              tracks={tracks}
              view={view}
              numbered
              onPlay={(i) => play(i)}
              actions={(t) => (
                <button onClick={() => usePlaylistStore.getState().openAdd([t])} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-black/40 sm:bg-transparent" aria-label="Agregar a playlist">
                  <ListPlus className="w-4 h-4" />
                </button>
              )}
            />
          </>
        )}
      </div>
    </div>
  )
}
