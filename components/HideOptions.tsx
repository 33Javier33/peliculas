'use client'

import { EyeOff, UserX } from 'lucide-react'
import { hideArtist, hideSong } from '@/lib/hide'

/** «No me interesa»: ocultar esta canción/video o todo el artista (en los menús ⋮) */
export default function HideOptions({
  track,
  artist,
  kind = 'canción',
  onDone,
}: {
  track: { id: string; title: string; channelTitle?: string; artist?: string }
  artist: string
  kind?: 'canción' | 'video'
  onDone: () => void
}) {
  const item = 'w-full flex items-center gap-4 px-5 py-3.5 text-left text-white hover:bg-white/5'
  const name = artist.replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim()
  return (
    <div className="border-t border-white/8 mt-1">
      <button
        className={item}
        onClick={() => {
          hideSong({ ...track, artist: name })
          onDone()
        }}
      >
        <EyeOff className="w-5 h-5 text-rose-300" />
        <span className="min-w-0">
          <span className="block font-semibold">No me interesa {kind === 'video' ? 'este video' : 'esta canción'}</span>
          <span className="block text-slate-400 text-xs truncate">No vuelve a aparecer en tus listas ni recomendaciones</span>
        </span>
      </button>
      {name && (
        <button
          className={item}
          onClick={() => {
            hideArtist(name)
            onDone()
          }}
        >
          <UserX className="w-5 h-5 text-rose-300" />
          <span className="min-w-0">
            <span className="block font-semibold truncate">No recomendar a {name}</span>
            <span className="block text-slate-400 text-xs truncate">Se oculta todo lo suyo · se recupera en Configuración</span>
          </span>
        </button>
      )}
    </div>
  )
}
