'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Music2, Disc3, Loader2, UserRound } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import type { CatalogAlbum } from '@/lib/catalog'

// Historia del artista: lo que el texto nombra se toca dentro de la app (nada se abre afuera).

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** ♪ Canción nombrada en la historia: se busca su audio y suena aquí */
export function BioSong({ artist, title }: { artist: string; title: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'missing'>('idle')
  const playing = useMusicStore((s) => {
    const cur = s.isVisible ? s.queue[s.currentIndex] : null
    return !!cur && norm(cur.title).includes(norm(title)) && s.isPlaying
  })
  const play = async () => {
    if (state === 'loading') return
    setState('loading')
    const params = new URLSearchParams({ artist, title })
    const id = await fetch(`/api/catalog/resolve?${params}`)
      .then((r) => (r.ok ? r.json() : { id: null }))
      .then((d: { id?: string | null }) => d.id ?? null)
      .catch(() => null)
    if (!id) {
      setState('missing')
      setTimeout(() => setState('idle'), 3000)
      return
    }
    const st = useMusicStore.getState()
    st.play([{ id, title: `${artist} - ${title}`, channelTitle: artist, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, publishedAt: '', description: '' }], 0)
    st.setIsPlaying(true)
    setState('idle')
  }
  return (
    <button
      type="button"
      onClick={play}
      title={state === 'missing' ? 'No la encontramos' : `Escuchar «${title}»`}
      className={`inline-flex items-baseline gap-1 rounded-md px-1 -mx-0.5 font-semibold underline decoration-dotted underline-offset-4 transition-colors ${
        playing ? 'text-emerald-300 decoration-emerald-400/60' : state === 'missing' ? 'text-slate-500 decoration-slate-600' : 'text-violet-300 decoration-violet-400/60 hover:bg-violet-500/15'
      }`}
    >
      {state === 'loading' ? <Loader2 className="w-3.5 h-3.5 self-center animate-spin" /> : <Music2 className="w-3.5 h-3.5 self-center" />}
      «{title}»
    </button>
  )
}

/** 💿 Disco nombrado: abre su página en la app (si no está en el catálogo, la búsqueda) */
export function BioAlbum({ artist, title }: { artist: string; title: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const open = async () => {
    if (loading) return
    setLoading(true)
    const d = await fetch(`/api/catalog/search?q=${encodeURIComponent(`${artist} ${title}`)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as { albums?: CatalogAlbum[] } | null
    const want = norm(title)
    const hit = (d?.albums ?? []).find((a) => norm(a.title) === want) ?? (d?.albums ?? []).find((a) => norm(a.title).startsWith(want) && norm(a.artist?.name || '') === norm(artist))
    setLoading(false)
    router.push(hit ? `/music/album/${hit.id}` : `/music?q=${encodeURIComponent(`${artist} ${title}`)}`)
  }
  return (
    <button type="button" onClick={open} title={`Ver el disco ${title}`} className="inline-flex items-baseline gap-1 rounded-md px-1 -mx-0.5 font-semibold italic text-sky-300 underline decoration-dotted decoration-sky-400/60 underline-offset-4 hover:bg-sky-500/15">
      {loading ? <Loader2 className="w-3.5 h-3.5 self-center animate-spin" /> : <Disc3 className="w-3.5 h-3.5 self-center" />}
      {title}
    </button>
  )
}

/** Otro artista nombrado: se busca en la app */
export function BioArtist({ name }: { name: string }) {
  const router = useRouter()
  return (
    <button type="button" onClick={() => router.push(`/music?q=${encodeURIComponent(name)}`)} title={`Buscar ${name}`} className="inline-flex items-baseline gap-1 rounded-md px-1 -mx-0.5 font-semibold text-white underline decoration-dotted decoration-white/40 underline-offset-4 hover:bg-white/10">
      <UserRound className="w-3.5 h-3.5 self-center text-slate-400" />
      {name}
    </button>
  )
}
