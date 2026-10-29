'use client'

import { useEffect, useState } from 'react'
import { Link2, Play, Shuffle, Trash2, Loader2, Plus } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { useLinksStore } from '@/store/linksStore'
import type { MusicVideo } from '@/lib/youtube-music'

// "Desde un enlace": pegar la dirección de un archivo de audio (MP3, M4A, OGG…), de una lista
// (.m3u/.pls) o de una página que tenga archivos de audio. Suenan con la pantalla bloqueada.
export default function AudioLinksSection() {
  const tracks = useLinksStore((s) => s.tracks)
  const addTracks = useLinksStore((s) => s.addTracks)
  const removeTrack = useLinksStore((s) => s.removeTrack)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const link = url.trim()
    if (!link) return
    setBusy(true)
    setMessage(null)
    try {
      const r = await fetch(`/api/audio-link?url=${encodeURIComponent(link)}`)
      const d = (await r.json()) as { tracks?: { title: string; url: string; playUrl: string }[]; error?: string }
      if (!r.ok || !d.tracks?.length) throw new Error(d.error || 'No se encontraron archivos de audio')
      let host = ''
      try {
        host = new URL(link).hostname.replace(/^www\./, '')
      } catch {}
      const list: MusicVideo[] = d.tracks.map((t) => {
        const parts = t.title.split(/\s+[-–]\s+/)
        const artist = parts.length > 1 ? parts[0] : host || 'Enlace'
        const title = parts.length > 1 ? parts.slice(1).join(' - ') : t.title
        return {
          id: `link-${hash(t.url)}`,
          title: `${artist} - ${title}`,
          channelTitle: artist,
          thumbnail: '/icons/icon-512.png',
          publishedAt: '',
          description: t.url,
          audioUrl: t.playUrl,
        }
      })
      const n = addTracks(list)
      setMessage({ ok: true, text: n ? `${n} ${n === 1 ? 'canción agregada' : 'canciones agregadas'}` : 'Esas canciones ya estaban en tu lista' })
      setUrl('')
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    }
    setBusy(false)
  }

  const playAll = (index: number, shuffle = false) => {
    const st = useMusicStore.getState()
    if (shuffle !== st.shuffle) st.toggleShuffle()
    st.play(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : index)
  }

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
          <div className="flex items-center gap-2">
            <button onClick={() => playAll(0)} className="w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center" aria-label="Reproducir enlaces">
              <Play className="w-4 h-4 fill-white" />
            </button>
            <button onClick={() => playAll(0, true)} className="w-10 h-10 rounded-full bg-surface-2 border border-white/10 text-white flex items-center justify-center" aria-label="Enlaces en aleatorio">
              <Shuffle className="w-4 h-4" />
            </button>
          </div>
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

      {tracks.length > 0 && (
        <ul className="mt-3 divide-y divide-white/5">
          {tracks.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <button onClick={() => playAll(i)} className="min-w-0 flex-1 text-left">
                <p className="text-white text-sm font-semibold truncate">{t.title.replace(/^[^-–]+[-–]\s*/, '') || t.title}</p>
                <p className="text-slate-500 text-xs truncate">{t.channelTitle}</p>
              </button>
              <button onClick={() => removeTrack(t.id)} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400" aria-label="Quitar de la lista">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-slate-600 text-xs mt-3">Usa enlaces de audio que tengas derecho a escuchar (tu música, música libre, podcasts).</p>
    </section>
  )
}

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
