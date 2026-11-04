'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListMusic, Loader2, Check } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import { usePlaylistStore } from '@/store/playlistStore'
import { useMusicStore } from '@/store/musicStore'
import { songArtist } from '@/lib/library-radio'
import { cachedJson } from '@/lib/client-cache'

// «Crear playlist del artista» (junto a su biografía): sus canciones más escuchadas y las que
// ya tienes en tu biblioteca, en una playlist nueva lista para escuchar.
export default function ArtistPlaylistButton({ name, id, className = '' }: { name: string; id?: number; className?: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'empty'>('idle')
  const [plId, setPlId] = useState<string | null>(null)
  const make = async () => {
    if (state === 'busy') return
    if (state === 'done' && plId) return router.push(`/music/playlist/${plId}`)
    setState('busy')
    const q = id ? `id=${id}` : `name=${encodeURIComponent(name)}`
    const d = await cachedJson<{ tracks?: MusicVideo[] }>(`/api/catalog/artist-tracks?${q}`, 6 * 3600_000)
    const want = name.trim().toLowerCase()
    const mine = useMusicStore.getState().saved.filter((t) => songArtist(t).toLowerCase() === want)
    const norm = (t: MusicVideo) => t.title.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/^[^-–]+[-–]\s*/, '').trim()
    const seen = new Set<string>()
    const tracks = [...mine, ...(d?.tracks ?? [])].filter((t) => !seen.has(norm(t)) && seen.add(norm(t)))
    if (!tracks.length) {
      setState('empty')
      setTimeout(() => setState('idle'), 2500)
      return
    }
    setPlId(usePlaylistStore.getState().create(`Lo mejor de ${name}`, tracks.slice(0, 50)))
    setState('done')
  }
  return (
    <button
      onClick={make}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
        state === 'done' ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300' : 'bg-violet-500/15 border-violet-400/40 text-violet-200 hover:bg-violet-500/25'
      } ${className}`}
    >
      {state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : state === 'done' ? <Check className="w-4 h-4" /> : <ListMusic className="w-4 h-4" />}
      {state === 'done' ? 'Playlist creada · abrir' : state === 'empty' ? 'No encontramos canciones' : `Crear playlist de ${name}`}
    </button>
  )
}
