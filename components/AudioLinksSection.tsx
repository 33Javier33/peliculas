'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link2, Play, Shuffle, Trash2, Loader2, Plus, ChevronDown, ExternalLink, Disc3, ListOrdered } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { useLinksStore, type LinkAlbum } from '@/store/linksStore'
import type { MusicVideo } from '@/lib/youtube-music'
import { useTrackState } from '@/components/TrackState'

// "Desde un enlace": pegar la dirección de un archivo de audio (MP3, M4A, OGG…), de una lista
// (.m3u/.pls) o de una página que tenga archivos de audio. Suenan con la pantalla bloqueada.
// Las canciones quedan ordenadas por disco, con su carátula e información (p. ej. Internet Archive).

interface ApiTrack {
  title: string
  url: string
  playUrl: string
  artist?: string
  duration?: number
}
interface ApiAlbum {
  title: string
  artist?: string
  year?: string
  cover?: string
  description?: string
  source: string
  tracks: ApiTrack[]
}

const fmt = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : undefined)

function toEntries(a: ApiAlbum): { album: Omit<LinkAlbum, 'trackIds' | 'addedAt'>; tracks: MusicVideo[] } {
  let host = ''
  try {
    host = new URL(a.source).hostname.replace(/^www\./, '')
  } catch {}
  const albumArtist = a.artist || host || 'Enlace'
  const tracks = a.tracks.map((t) => {
    // Sin artista: "Artista - Título" en el nombre del archivo
    const parts = t.title.split(/\s+[-–]\s+/)
    const artist = t.artist || (parts.length > 1 ? parts[0] : albumArtist)
    const title = !t.artist && parts.length > 1 ? parts.slice(1).join(' - ') : t.title
    return {
      id: `link-${hash(t.url)}`,
      title: `${artist} - ${title}`,
      channelTitle: artist,
      thumbnail: a.cover || '/icons/icon-512.png',
      publishedAt: '',
      description: t.url,
      duration: fmt(t.duration),
      album: a.title,
      audioUrl: t.playUrl,
    }
  })
  return {
    album: {
      id: `album-${hash(`${a.source}|${a.title}`)}`,
      title: a.title,
      artist: albumArtist,
      year: a.year,
      cover: a.cover,
      description: a.description,
      source: a.source,
    },
    tracks,
  }
}

async function fetchAlbums(link: string): Promise<ApiAlbum[]> {
  const r = await fetch(`/api/audio-link?url=${encodeURIComponent(link)}`)
  const d = (await r.json()) as { albums?: ApiAlbum[]; tracks?: ApiTrack[]; error?: string }
  if (!r.ok || !d.tracks?.length) throw new Error(d.error || 'No se encontraron archivos de audio')
  return d.albums?.length ? d.albums : [{ title: link, source: link, tracks: d.tracks }]
}

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
  // Al entrar, queda abierto el disco que está sonando
  useEffect(() => {
    if (!mounted || open || !currentId) return
    const playing = albums.find((a) => a.trackIds.includes(currentId))
    if (playing) setOpen(playing.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

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
    <section className="mb-10 rounded-2xl bg-surface-1/60 border border-white/8 p-4">
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

      {groups.length > 0 && (
        <ul className="mt-4 space-y-2">
          {groups.map(({ album, items }) => (
            <AlbumRow
              key={album.id}
              album={album}
              items={items}
              open={open === album.id}
              onToggle={() => setOpen(open === album.id ? null : album.id)}
              onPlay={(i, shuffle) => play(items, i, shuffle)}
              currentId={currentId}
              shuffleOn={shuffleOn}
              onRemoveTrack={removeTrack}
              onRemoveAlbum={album.id === 'loose' ? () => items.forEach((t) => removeTrack(t.id)) : () => removeAlbum(album.id)}
            />
          ))}
        </ul>
      )}
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
  const [moreInfo, setMoreInfo] = useState(false)
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
            <button onClick={() => setMoreInfo(!moreInfo)} className={`block text-left text-slate-400 text-xs leading-relaxed mb-2 whitespace-pre-line ${moreInfo ? '' : 'line-clamp-3'}`}>
              {album.description}
            </button>
          )}
          <ol className="divide-y divide-white/5">
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

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
