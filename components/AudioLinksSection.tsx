'use client'

import TranslatableText from '@/components/TranslatableText'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Play, Shuffle, Trash2, Loader2, Plus, ChevronDown, ExternalLink, Disc3, ListOrdered, ListPlus } from 'lucide-react'
import { usePlaylistStore } from '@/store/playlistStore'
import { useView } from '@/components/ViewToggle'
import { useMusicStore } from '@/store/musicStore'
import { useLinksStore, type LinkAlbum } from '@/store/linksStore'
import type { MusicVideo } from '@/lib/youtube-music'
import { useTrackState } from '@/components/TrackState'
import { toEntries, fetchAlbums } from '@/lib/link-albums'

// "Desde un enlace": pegar la dirección de un archivo de audio (MP3, M4A, OGG…), de una lista
// (.m3u/.pls) o de una página que tenga archivos de audio. Suenan con la pantalla bloqueada.
// Las canciones quedan ordenadas por disco, con su carátula e información (p. ej. Internet Archive).

/** Archivo de Internet Archive de una canción agregada antes (para ordenarla en su disco) */
const archiveIdOf = (t: MusicVideo) => t.description.match(/^https:\/\/archive\.org\/download\/([^/]+)\//)?.[1]
const organizing = new Set<string>()

export default function AudioLinksSection() {
  const tracks = useLinksStore((s) => s.tracks)
  const albums = useLinksStore((s) => s.albums)
  const addAlbum = useLinksStore((s) => s.addAlbum)
  const removeTrack = useLinksStore((s) => s.removeTrack)
  const removeAlbum = useLinksStore((s) => s.removeAlbum)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const view = useView()
  // "Ir al álbum" desde el reproductor: /music/library?album=ID abre ese disco aquí
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!mounted) return
    const wanted = new URLSearchParams(window.location.search).get('album')
    if (!wanted || !albums.some((a) => a.id === wanted)) return
    setOpen(wanted)
    setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Canciones que no están en ningún disco (agregadas antes de ordenarse por disco)
  const loose = useMemo(() => {
    const inAlbum = new Set(albums.flatMap((a) => a.trackIds))
    return tracks.filter((t) => !inAlbum.has(t.id))
  }, [tracks, albums])

  // Las de Internet Archive se ordenan solas en su disco, con su información
  useEffect(() => {
    if (!mounted) return
    const groups = new Map<string, string[]>()
    for (const t of loose) {
      const id = archiveIdOf(t)
      if (id && !organizing.has(id)) groups.set(id, [...(groups.get(id) ?? []), t.id])
    }
    for (const [id, ids] of Array.from(groups.entries())) {
      organizing.add(id)
      fetchAlbums(`https://archive.org/details/${id}`)
        .then((list) =>
          list.forEach((a, i) => {
            const { album, tracks: items } = toEntries(a)
            addAlbum(album, items, i === 0 ? ids : [])
          })
        )
        .catch(() => {})
    }
  }, [mounted, loose, addAlbum])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const link = url.trim()
    if (!link) return
    setBusy(true)
    setMessage(null)
    try {
      const list = await fetchAlbums(link)
      let added = 0
      let firstId = ''
      for (const a of list) {
        const { album, tracks: items } = toEntries(a)
        added += addAlbum(album, items)
        firstId ||= album.id
      }
      const names = list.map((a) => a.title).join(', ')
      setMessage({
        ok: true,
        text: added ? `${names}: ${added} ${added === 1 ? 'canción agregada' : 'canciones agregadas'}` : `${names} ya estaba en tu lista`,
      })
      setOpen(firstId)
      setUrl('')
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    }
    setBusy(false)
  }

  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  // shuffle: true = aleatorio, false = en orden, sin indicar = sigue el modo que esté puesto
  const play = (list: MusicVideo[], index: number, shuffle?: boolean) => {
    if (!list.length) return
    const st = useMusicStore.getState()
    if (shuffle !== undefined && shuffle !== st.shuffle) st.toggleShuffle()
    st.play(list, shuffle ? Math.floor(Math.random() * list.length) : index)
  }
  const currentId = useMusicStore((s) => (s.isVisible ? s.queue[s.currentIndex]?.id : undefined))
  const shuffleOn = useMusicStore((s) => s.shuffle)

  // Discos (los más nuevos primero) y, al final, las canciones sueltas
  const groups = useMemo(() => {
    const list = [...albums]
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((a) => ({ album: a, items: a.trackIds.map((id) => byId.get(id)).filter((t): t is MusicVideo => !!t) }))
      .filter((g) => g.items.length)
    if (loose.length)
      list.push({
        album: { id: 'loose', title: 'Otros enlaces', artist: 'Canciones sueltas', source: '', addedAt: 0, trackIds: [] },
        items: loose,
      })
    return list
  }, [albums, byId, loose])

  if (!mounted) return null
  return (
    <section ref={sectionRef} className="mb-10 rounded-2xl bg-surface-1/60 border border-white/8 p-4 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="flex items-center gap-2 text-white font-bold text-lg font-display">
            <Link2 className="w-5 h-5 text-sky-400" /> Desde un enlace
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">MP3 y otros audios de internet: suenan con la pantalla bloqueada</p>
        </div>
        {tracks.length > 0 && (
          <ModeButtons
            label="todo"
            shuffleOn={shuffleOn}
            active={!!currentId && byId.has(currentId)}
            onOrder={() => play(groups.flatMap((g) => g.items), 0, false)}
            onShuffle={() => play(groups.flatMap((g) => g.items), 0, true)}
          />
        )}
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Pega un enlace a un MP3 o a una página con audios"
          aria-label="Enlace de audio"
          className="min-w-0 flex-1 bg-surface-2 border border-white/10 text-white placeholder-slate-500 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
        />
        <button type="submit" disabled={busy || !url.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-sky-500 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
        </button>
      </form>
      {message && <p className={`text-sm mt-2 ${message.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{message.text}</p>}

      {/* Discos en una fila que se desliza de lado (así la sección no se alarga); el elegido se abre abajo */}
      {/* Vista Lista: los discos uno bajo otro (con altura fija, para no alargar la página) */}
      {groups.length > 0 && view === 'list' && (
        <ul className="mt-4 divide-y divide-white/5 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-white/5">
          {groups.map(({ album, items }) => {
            const playing = !!currentId && items.some((t) => t.id === currentId)
            return (
              <li
                key={album.id}
                onClick={() => setOpen(open === album.id ? null : album.id)}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5 ${open === album.id ? 'bg-violet-500/10' : ''}`}
              >
                <span className="w-10 h-10 rounded-lg overflow-hidden bg-surface-2 shrink-0 flex items-center justify-center">
                  {album.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={album.cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <Disc3 className="w-5 h-5 text-slate-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold truncate ${playing ? 'text-violet-300' : 'text-white'}`}>{album.title}</span>
                  <span className="block text-slate-500 text-xs truncate">
                    {album.artist} · {items.length} {items.length === 1 ? 'canción' : 'canciones'}
                  </span>
                </span>
                {playing && <span className="text-violet-300 text-[11px] font-semibold shrink-0">Sonando</span>}
              </li>
            )
          })}
        </ul>
      )}
      {groups.length > 0 && view === 'grid' && (
        <div className="mt-4 -mx-4 px-4 flex gap-3 overflow-x-auto snap-x scroll-px-4 [scrollbar-width:none] pb-1">
          {groups.map(({ album, items }) => (
            <AlbumCard
              key={album.id}
              album={album}
              count={items.length}
              selected={open === album.id}
              playing={!!currentId && items.some((t) => t.id === currentId)}
              onClick={() => setOpen(open === album.id ? null : album.id)}
            />
          ))}
        </div>
      )}
      {groups
        .filter((g) => g.album.id === open)
        .map(({ album, items }) => (
          <ul key={album.id} className="mt-3">
            <AlbumRow
              album={album}
              items={items}
              open
              onToggle={() => setOpen(null)}
              onPlay={(i, shuffle) => play(items, i, shuffle)}
              currentId={currentId}
              shuffleOn={shuffleOn}
              onRemoveTrack={removeTrack}
              onRemoveAlbum={album.id === 'loose' ? () => items.forEach((t) => removeTrack(t.id)) : () => removeAlbum(album.id)}
            />
          </ul>
        ))}
      <p className="text-slate-600 text-xs mt-3">Usa enlaces de audio que tengas derecho a escuchar (tu música, música libre, podcasts).</p>
    </section>
  )
}

function AlbumRow({
  album,
  items,
  open,
  onToggle,
  onPlay,
  onRemoveTrack,
  onRemoveAlbum,
  currentId,
  shuffleOn,
}: {
  album: LinkAlbum
  items: MusicVideo[]
  open: boolean
  onToggle: () => void
  onPlay: (index: number, shuffle?: boolean) => void
  onRemoveTrack: (id: string) => void
  onRemoveAlbum: () => void
  currentId?: string
  shuffleOn: boolean
}) {
  const [confirm, setConfirm] = useState(false)
  const [coverFailed, setCoverFailed] = useState(false)
  const playingIndex = currentId ? items.findIndex((t) => t.id === currentId) : -1
  const playingTrack = playingIndex >= 0 ? items[playingIndex] : undefined
  const details = [album.artist, album.year, `${items.length} ${items.length === 1 ? 'canción' : 'canciones'}`].filter(Boolean).join(' · ')
  return (
    <li className={`rounded-xl bg-surface-2/60 border overflow-hidden ${playingTrack ? 'border-violet-400/40' : 'border-white/5'}`}>
      <div className="flex items-center gap-3 p-2">
        <button onClick={onToggle} className="min-w-0 flex-1 flex items-center gap-3 text-left" aria-expanded={open}>
          <span className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-surface-1 flex items-center justify-center">
            {album.cover && !coverFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={album.cover} alt="" loading="lazy" onError={() => setCoverFailed(true)} className="w-full h-full object-cover" />
            ) : (
              <Disc3 className="w-7 h-7 text-slate-500" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-white text-sm font-semibold truncate">{album.title}</span>
            {playingTrack ? (
              <span className="block text-violet-300 text-xs truncate">
                Sonando: {playingTrack.title.replace(/^[^-–]+[-–]\s*/, '') || playingTrack.title}
              </span>
            ) : (
              <span className="block text-slate-400 text-xs truncate">{details}</span>
            )}
          </span>
          <ChevronDown className={`shrink-0 w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={() => onPlay(0)} className="shrink-0 w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center" aria-label={`Reproducir ${album.title}`}>
          <Play className="w-4 h-4 fill-white" />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <ModeButtons label={album.title} shuffleOn={shuffleOn} active={!!playingTrack} onOrder={() => onPlay(0, false)} onShuffle={() => onPlay(0, true)} />
            <button
              onClick={() => usePlaylistStore.getState().openAdd(items)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-1 border border-white/10 text-slate-200 text-xs"
            >
              <ListPlus className="w-3.5 h-3.5" /> A playlist
            </button>
            {album.source && (
              <a href={album.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-1 border border-white/10 text-slate-300 text-xs">
                <ExternalLink className="w-3.5 h-3.5" /> Ver página
              </a>
            )}
            <button
              onClick={() => (confirm ? onRemoveAlbum() : setConfirm(true))}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${confirm ? 'bg-red-500/20 border-red-400/40 text-red-300' : 'bg-surface-1 border-white/10 text-slate-400'}`}
            >
              <Trash2 className="w-3.5 h-3.5" /> {confirm ? '¿Quitar todo el disco?' : 'Quitar disco'}
            </button>
          </div>
          {album.description && (
            <div className="mb-2">
              <TranslatableText text={album.description} className="text-slate-400 text-xs leading-relaxed" />
            </div>
          )}
          <ol className="divide-y divide-white/5 max-h-80 overflow-y-auto overscroll-contain">
            {items.map((t, i) => (
              <li key={t.id} className={`flex items-center gap-3 py-2 ${t.id === currentId ? 'bg-violet-500/10 -mx-2 px-2 rounded-lg' : ''}`}>
                <TrackNumber id={t.id} n={i + 1} />
                <button onClick={() => onPlay(i)} className="min-w-0 flex-1 text-left" aria-current={t.id === currentId ? 'true' : undefined}>
                  <p className={`text-sm truncate ${t.id === currentId ? 'text-violet-300 font-semibold' : 'text-white'}`}>{t.title.replace(/^[^-–]+[-–]\s*/, '') || t.title}</p>
                  {t.channelTitle !== album.artist && <p className="text-slate-500 text-xs truncate">{t.channelTitle}</p>}
                </button>
                {t.duration && <span className="shrink-0 text-slate-500 text-xs tabular-nums">{t.duration}</span>}
                <button onClick={() => onRemoveTrack(t.id)} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400" aria-label="Quitar de la lista">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  )
}

function AlbumCard({
  album,
  count,
  selected,
  playing,
  onClick,
}: {
  album: LinkAlbum
  count: number
  selected: boolean
  playing: boolean
  onClick: () => void
}) {
  const [failed, setFailed] = useState(false)
  return (
    <button onClick={onClick} aria-pressed={selected} className="snap-start shrink-0 w-28 text-left group">
      <span
        className={`relative block w-28 h-28 rounded-xl overflow-hidden bg-surface-2 border-2 ${selected ? 'border-violet-400' : playing ? 'border-violet-400/50' : 'border-transparent'}`}
      >
        {album.cover && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={album.cover} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center">
            <Disc3 className="w-10 h-10 text-slate-500" />
          </span>
        )}
        {playing && (
          <span className="absolute bottom-1.5 left-1.5 flex items-end gap-[2px] h-4 px-1.5 py-0.5 rounded bg-black/60">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-[3px] rounded-full bg-violet-300 origin-bottom animate-eq" style={{ height: `${[60, 100, 75][i]}%`, animationDelay: `${i * 140}ms` }} />
            ))}
          </span>
        )}
      </span>
      <span className={`block mt-1.5 text-xs font-semibold truncate ${selected ? 'text-violet-300' : 'text-white'}`}>{album.title}</span>
      <span className="block text-[11px] text-slate-500 truncate">
        {album.artist} · {count}
      </span>
    </button>
  )
}

/** "En orden" y "Aleatorio": el modo puesto se ve marcado mientras suena esta lista */
function ModeButtons({
  label,
  shuffleOn,
  active,
  onOrder,
  onShuffle,
}: {
  label: string
  shuffleOn: boolean
  active: boolean
  onOrder: () => void
  onShuffle: () => void
}) {
  const on = 'bg-violet-500 border-violet-400 text-white'
  const off = 'bg-surface-1 border-white/10 text-slate-200'
  return (
    <div className="flex items-center gap-2">
      <button onClick={onOrder} aria-pressed={active && !shuffleOn} aria-label={`Reproducir ${label} en orden`} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${active && !shuffleOn ? on : off}`}>
        <ListOrdered className="w-3.5 h-3.5" /> En orden
      </button>
      <button onClick={onShuffle} aria-pressed={active && shuffleOn} aria-label={`Reproducir ${label} en aleatorio`} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${active && shuffleOn ? on : off}`}>
        <Shuffle className="w-3.5 h-3.5" /> Aleatorio
      </button>
    </div>
  )
}

/** Número de la canción; la que suena muestra barras (o un círculo mientras carga) */
function TrackNumber({ id, n }: { id: string; n: number }) {
  const state = useTrackState(id)
  if (!state) return <span className="w-6 shrink-0 text-right text-slate-500 text-xs tabular-nums">{n}</span>
  if (state === 'loading') return <Loader2 className="w-4 h-4 mx-1 shrink-0 text-violet-300 animate-spin" aria-label="Cargando" />
  return (
    <span className="w-6 shrink-0 flex items-end justify-end gap-[2px] h-3.5" aria-label={state === 'playing' ? 'Sonando' : 'En pausa'}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-violet-300 origin-bottom ${state === 'playing' ? 'animate-eq' : ''}`}
          style={{ height: `${[60, 100, 75][i]}%`, animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  )
}
