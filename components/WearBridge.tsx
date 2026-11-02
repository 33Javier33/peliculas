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

// Reloj (Wear OS): la app del reloj pide la biblioteca y elige qué suena; el teléfono lo hace aquí.
// Llega por window.__cpnWear({ a, k, id }) y se responde con CPNNative.wearReply(ruta, json).

interface WearCmd {
  a: 'browse' | 'play'
  k?: 'shuffle' | 'song' | 'playlist' | 'genre' | 'nts' | 'radio'
  id?: string
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

async function library() {
  const st = useMusicStore.getState()
  const saved = [...st.saved].sort((a, b) => b.savedAt - a.savedAt)
  const n = await nts()
  return {
    songs: saved.slice(0, 80).map((t) => ({ id: t.id, ...short(t) })),
    playlists: usePlaylistStore.getState().playlists.map((p) => ({ id: p.id, t: p.name.slice(0, 50), s: `${p.tracks.length} canciones` })),
    genres: ARCHIVE_RADIO_GENRES.map((g) => ({ id: g.id, t: `${g.icon} ${g.label}`, s: 'Radio de archive.org' })),
    nts: [
      ...(n?.live ?? []).map((c) => ({ id: `live-${c.id}`, t: `NTS ${c.id} · En vivo`, s: c.now.title.slice(0, 50) })),
      ...(n?.mixtapes ?? []).map((m) => ({ id: `mix-${m.alias}`, t: m.title, s: m.subtitle.slice(0, 50) })),
    ],
    radios: useLiveStore.getState().favoriteRadios.map((r) => ({ id: r.id, t: r.title.slice(0, 50), s: r.channelTitle.slice(0, 40) })),
    total: saved.length,
  }
}

async function play(k: WearCmd['k'], id = '') {
  const st = useMusicStore.getState()
  const setShuffle = (on: boolean) => {
    if (useMusicStore.getState().shuffle !== on) useMusicStore.getState().toggleShuffle()
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
      if (c.a === 'browse') library().then((d) => reply('/cpn/library', d))
      else if (c.a === 'play')
        play(c.k, c.id)
          .catch(() => {})
          .finally(() => reply('/cpn/played', { ok: true }))
    }
  }, [])
  return null
}
