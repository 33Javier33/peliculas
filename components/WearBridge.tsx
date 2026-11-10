'use client'

import { useEffect } from 'react'
import { getNative } from '@/lib/native'
import { useMusicStore } from '@/store/musicStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useLiveStore } from '@/store/liveStore'
import { fetchRadioTracks } from '@/lib/archive-radio-client'
import { ARCHIVE_RADIO_GENRES } from '@/components/ArchiveRadioSection'
import { liveTrack, mixtapeTrack, type NtsData } from '@/components/NtsClient'
import { smartShuffle } from '@/lib/smart-shuffle'
import type { MusicVideo } from '@/lib/youtube-music'
import { fetchAlbums, toEntries } from '@/lib/link-albums'
import { songArtist } from '@/lib/library-radio'
import { libraryMixes } from '@/lib/community'
import { ytIdOf } from '@/lib/pip'

// Reloj (Wear OS): la app del reloj pide la biblioteca y elige qué suena; el teléfono lo hace aquí.
// Llega por window.__cpnWear({ a, k, id }) y se responde con CPNNative.wearReply(ruta, json).

interface WearCmd {
  a: 'browse' | 'play' | 'search' | 'items' | 'video' | 'videoend'
  k?: 'shuffle' | 'song' | 'playlist' | 'genre' | 'nts' | 'radio' | 'archive' | 'artist' | 'album' | 'mix' | 'queue' | 'yt'
  /** Segundo en que quedó el video del reloj (al cerrarlo, la canción sigue desde ahí) */
  at?: number
  id?: string
  q?: string
  /** Empezar por esta canción (al tocar una canción dentro de un artista, disco o playlist) */
  start?: string
  /** Aleatorio */
  shuffle?: boolean
}

/** Canciones de YouTube de la última búsqueda del reloj (para tocar una y seguir con las demás) */
let lastYt: MusicVideo[] = []

/**
 * Búsqueda desde el reloj: primero canciones de YouTube y, al final, discos de Internet Archive.
 * Las de YouTube llevan id «yt:ID»; las de archive.org, su identificador.
 */
async function searchMusic(q: string) {
  const [yt, ia] = await Promise.all([
    fetch(`/api/youtube/music?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .catch(() => ({})) as Promise<{ videos?: MusicVideo[] }>,
    fetch(`/api/archive-audio?by=all&q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .catch(() => ({})) as Promise<{ results?: { id: string; title: string; artist?: string; year?: string }[] }>,
  ])
  lastYt = (yt.videos ?? []).filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id)).slice(0, 20)
  return [
    ...lastYt.map((v) => ({ ...item(v), id: `yt:${v.id}` })),
    ...(ia.results ?? []).slice(0, 12).map((r) => ({
      id: r.id,
      t: r.title.slice(0, 60),
      s: ['Internet Archive', r.artist, r.year].filter(Boolean).join(' · ').slice(0, 50),
      img: `https://archive.org/services/img/${r.id}`,
    })),
  ]
}

type Bridge = { wearReply?: (path: string, json: string) => void }

const short = (t: MusicVideo) => {
  const m = t.title.match(/^(.+?)\s[-–—]\s(.+)$/)
  return { t: (m ? m[2] : t.title).slice(0, 60), s: ((t as { artist?: string }).artist || (m ? m[1] : t.channelTitle) || '').slice(0, 40) }
}

let ntsCache: { at: number; data: NtsData } | null = null
async function nts(): Promise<NtsData | null> {
  if (ntsCache && Date.now() - ntsCache.at < 60000) return ntsCache.data
  const d = (await fetch('/api/nts').then((r) => (r.ok ? r.json() : null)).catch(() => null)) as NtsData | null
  if (d) ntsCache = { at: Date.now(), data: d }
  return d
}

const img = (t?: MusicVideo) => (t?.thumbnail?.startsWith('http') ? t.thumbnail : '')
const item = (t: MusicVideo) => ({ id: t.id, ...short(t), img: img(t) })

/** Canciones guardadas de un artista o de un disco (como en la biblioteca del teléfono) */
const savedSorted = () => [...useMusicStore.getState().saved].sort((a, b) => b.savedAt - a.savedAt)
const albumOf = (t: MusicVideo) => (t.album || '').trim()
function groupTracks(k: string, id: string): MusicVideo[] {
  if (k === 'artist') return savedSorted().filter((t) => songArtist(t).toLowerCase() === id.toLowerCase())
  if (k === 'album') {
    // Álbum guardado con su ♥
    if (id.startsWith('saved:')) return useMusicStore.getState().savedAlbums.find((a) => a.id === id.slice(6))?.tracks ?? []
    const [album, artist] = id.split('||')
    return savedSorted().filter((t) => albumOf(t) === album && songArtist(t).toLowerCase() === (artist || '').toLowerCase())
  }
  if (k === 'playlist') return usePlaylistStore.getState().playlists.find((p) => p.id === id)?.tracks ?? []
  if (k === 'mix') return libraryMixes().find((m) => m.genre === id)?.tracks ?? []
  return []
}

/** Lo que está sonando ahora (la cola): desde unas canciones antes de la actual; id = su posición */
function queueItems() {
  const { queue, currentIndex } = useMusicStore.getState()
  const from = Math.max(0, currentIndex - 3)
  return queue.slice(from, from + 100).map((t, j) => {
    const i = from + j
    const it = item(t)
    return { ...it, id: String(i), s: i === currentIndex ? `▶ Sonando · ${it.s}`.slice(0, 50) : it.s }
  })
}

async function library() {
  const saved = savedSorted()
  const n = await nts()
  // Artistas y discos de la biblioteca (con su foto: la carátula de una de sus canciones)
  const artists = new Map<string, { t: string; n: number; img: string }>()
  const albums = new Map<string, { t: string; s: string; n: number; img: string }>()
  for (const t of saved) {
    const a = songArtist(t)
    if (a) {
      const k = a.toLowerCase()
      const prev = artists.get(k)
      artists.set(k, { t: prev?.t ?? a, n: (prev?.n ?? 0) + 1, img: prev?.img || img(t) })
    }
    const al = albumOf(t)
    if (al) {
      const key = `${al}||${a}`
      const prev = albums.get(key)
      albums.set(key, { t: al, s: a, n: (prev?.n ?? 0) + 1, img: prev?.img || img(t) })
    }
  }
  return {
    songs: saved.slice(0, 80).map(item),
    playlists: usePlaylistStore.getState().playlists.map((p) => ({ id: p.id, t: p.name.slice(0, 50), s: `${p.tracks.length} canciones`, img: img(p.tracks[0]) })),
    artists: Array.from(artists.entries())
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 60)
      .map(([, v]) => ({ id: v.t, t: v.t.slice(0, 50), s: `${v.n} ${v.n === 1 ? 'canción' : 'canciones'}`, img: v.img })),
    albums: [
      ...useMusicStore.getState().savedAlbums.map((a) => ({ id: `saved:${a.id}`, t: a.title.slice(0, 50), s: a.artist.slice(0, 40), img: a.cover?.startsWith('http') ? a.cover : img(a.tracks[0]) })),
      ...Array.from(albums.entries())
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 60)
      .map(([id, v]) => ({ id, t: v.t.slice(0, 50), s: v.s.slice(0, 40), img: v.img })),
    ],
    mixes: libraryMixes().map((m) => ({ id: m.genre, t: `Tu ${m.label}`, s: `${m.tracks.length} canciones`, img: img(m.tracks[0]) })),
    genres: ARCHIVE_RADIO_GENRES.map((g) => ({ id: g.id, t: `${g.icon} ${g.label}`, s: 'Radio de archive.org' })),
    nts: [
      ...(n?.live ?? []).map((c) => ({ id: `live-${c.id}`, t: `NTS ${c.id} · En vivo`, s: c.now.title.slice(0, 50) })),
      ...(n?.mixtapes ?? []).map((m) => ({ id: `mix-${m.alias}`, t: m.title, s: m.subtitle.slice(0, 50) })),
    ],
    radios: useLiveStore.getState().favoriteRadios.map((r) => ({ id: r.id, t: r.title.slice(0, 50), s: r.channelTitle.slice(0, 40) })),
    total: saved.length,
  }
}

async function play(k: WearCmd['k'], id = '', start = '', shuffle = false) {
  const st = useMusicStore.getState()
  // Una canción de la cola que está sonando
  if (k === 'queue') {
    const i = Number(id)
    if (Number.isInteger(i) && i >= 0 && i < st.queue.length) st.playIndex(i)
    useMusicStore.getState().setIsPlaying(true)
    return
  }
  const setShuffle = (on: boolean) => {
    if (useMusicStore.getState().shuffle !== on) useMusicStore.getState().toggleShuffle()
  }
  // Artista, disco, playlist o mezcla de la biblioteca: desde la canción tocada (o en aleatorio)
  if (k === 'artist' || k === 'album' || k === 'mix' || (k === 'playlist' && (start || shuffle))) {
    const list = groupTracks(k, id)
    if (!list.length) return
    setShuffle(shuffle || k === 'mix')
    const i = start ? Math.max(0, list.findIndex((t) => t.id === start)) : shuffle ? Math.floor(Math.random() * list.length) : 0
    useMusicStore.getState().play(list, i)
    useMusicStore.getState().setIsPlaying(true)
    return
  }
  if (k === 'yt') {
    // Una canción de YouTube de la búsqueda del reloj: suena y siguen las demás encontradas
    const i = lastYt.findIndex((t) => t.id === id)
    if (i < 0) return
    setShuffle(false)
    useMusicStore.getState().play(lastYt, i)
    useMusicStore.getState().setIsPlaying(true)
    return
  }
  if (k === 'shuffle') {
    const list = smartShuffle(st.saved)
    if (!list.length) return
    setShuffle(true)
    st.play(list, 0)
  } else if (k === 'song') {
    const list = [...st.saved].sort((a, b) => b.savedAt - a.savedAt)
    const i = list.findIndex((t) => t.id === id)
    if (i >= 0) st.play(list, i)
  } else if (k === 'playlist') {
    const p = usePlaylistStore.getState().playlists.find((x) => x.id === id)
    if (p?.tracks.length) {
      setShuffle(false)
      st.play(p.tracks, 0)
    }
  } else if (k === 'genre') {
    const tracks = await fetchRadioTracks(id)
    if (!tracks.length) return
    setShuffle(false)
    useMusicStore.getState().play(tracks, 0)
  } else if (k === 'nts') {
    const n = await nts()
    const live = n?.live.find((c) => `live-${c.id}` === id)
    const mix = n?.mixtapes.find((m) => `mix-${m.alias}` === id)
    const t = live ? liveTrack(live) : mix ? mixtapeTrack(mix) : null
    if (t) useMusicStore.getState().play([t], 0)
  } else if (k === 'archive') {
    // Un disco de Internet Archive elegido en la búsqueda del reloj
    const list = (await fetchAlbums(`https://archive.org/details/${encodeURIComponent(id)}`)).map(toEntries)
    const tracks = list.flatMap((e) => e.tracks)
    if (!tracks.length) return
    setShuffle(false)
    useMusicStore.getState().play(tracks, 0)
  } else if (k === 'radio') {
    const r = useLiveStore.getState().favoriteRadios.find((x) => x.id === id)
    if (r) useMusicStore.getState().play([r], 0)
  }
  useMusicStore.getState().setIsPlaying(true)
}

export default function WearBridge() {
  useEffect(() => {
    const n = getNative() as (ReturnType<typeof getNative> & Bridge) | null
    if (!n?.wearReply) return
    const reply = (path: string, data: unknown) => {
      try {
        n.wearReply!(path, JSON.stringify(data))
      } catch {}
    }
    ;(window as unknown as { __cpnWear?: (c: WearCmd) => void }).__cpnWear = (c) => {
      if (c.a === 'browse')
        library().then((d) => {
          // Los mensajes al reloj tienen un límite (~100 KB): con una biblioteca enorme se recortan las listas
          let lib = d
          for (let n = 60; JSON.stringify(lib).length > 90000 && n > 10; n -= 10)
            lib = { ...d, songs: d.songs.slice(0, n), artists: d.artists.slice(0, n), albums: d.albums.slice(0, n), playlists: d.playlists.slice(0, n) }
          reply('/cpn/library', lib)
        })
      else if (c.a === 'search' && c.q) searchMusic(c.q).then((results) => reply('/cpn/search', { q: c.q, results }))
      else if (c.a === 'video') {
        // Ver en el reloj el video de lo que suena: el teléfono se pausa y le pasa el video
        const st = useMusicStore.getState()
        const cur = st.queue[st.currentIndex]
        const id = ytIdOf(cur)
        if (!cur || !id) return reply('/cpn/video', { error: cur ? 'Esta canción no tiene video' : 'No hay nada sonando' })
        const time = (window as unknown as { __cpnTime?: () => { t: number } }).__cpnTime?.()
        st.setIsPlaying(false)
        const v = n as unknown as { wearVideo?: (id: string, at: number, title: string) => void }
        if (v.wearVideo) v.wearVideo(id, time?.t ?? 0, cur.title)
        else reply('/cpn/video', { error: 'Actualiza la app del teléfono' })
      } else if (c.a === 'videoend' && c.id) {
        // Se cerró el video del reloj: la canción sigue en el teléfono desde ese segundo
        const st = useMusicStore.getState()
        if (ytIdOf(st.queue[st.currentIndex]) !== c.id) return
        const act = (window as unknown as { __cpnNativeAction?: (a: string) => void }).__cpnNativeAction
        if (typeof c.at === 'number' && c.at > 1) act?.(`seek:${Math.round(c.at * 1000)}`)
        st.setIsPlaying(true)
      }
      else if (c.a === 'items' && c.k === 'queue') reply('/cpn/items', { k: 'queue', id: 'now', items: queueItems() })
      else if (c.a === 'items' && c.k && c.id) reply('/cpn/items', { k: c.k, id: c.id, items: groupTracks(c.k, c.id).slice(0, 120).map(item) })
      else if (c.a === 'play')
        play(c.k, c.id, c.start, c.shuffle)
          .catch(() => {})
          .finally(() => reply('/cpn/played', { ok: true }))
    }
  }, [])
  return null
}
