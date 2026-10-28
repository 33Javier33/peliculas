'use client'

import { useEffect, useState } from 'react'
import { UserPlus, UserCheck } from 'lucide-react'
import { useFollowStore } from '@/store/followStore'

/** Botón Seguir / Siguiendo de un artista o grupo */
export default function FollowArtistButton({
  artist,
  size = 'md',
}: {
  artist: { id: number; name: string; picture: string }
  size?: 'sm' | 'md'
}) {
  const following = useFollowStore((s) => s.artists.some((a) => a.id === artist.id))
  const toggleFollow = useFollowStore((s) => s.toggleFollow)
  // El estado guardado se conoce solo en el navegador
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const on = mounted && following

  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleFollow(artist)
      }}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold font-display transition-colors ${
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm'
      } ${on ? 'bg-white/10 text-white border border-white/20' : 'bg-violet-500 text-white shadow-glow hover:bg-violet-400'}`}
    >
      {on ? <UserCheck className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> : <UserPlus className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
      {on ? 'Siguiendo' : 'Seguir'}
    </button>
  )
}
