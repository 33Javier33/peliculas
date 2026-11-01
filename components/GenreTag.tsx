'use client'

import { useEffect, useState } from 'react'
import { genreOfArtist, genreCacheSnapshot, GENRE_LABELS } from '@/lib/library-radio'

// Géneros ya conocidos de los artistas (MusicBrainz), con aviso cuando se conoce uno nuevo
export function useGenreCache() {
  const [cache, setCache] = useState<ReturnType<typeof genreCacheSnapshot>>({})
  useEffect(() => {
    const update = () => setCache(genreCacheSnapshot())
    update()
    window.addEventListener('cpn-genres', update)
    return () => window.removeEventListener('cpn-genres', update)
  }, [])
  return cache
}

/** " · Rock" junto al artista de una canción, si se conoce su género */
export default function GenreTag({ artist, cache }: { artist: string; cache: ReturnType<typeof genreCacheSnapshot> }) {
  const g = artist ? genreOfArtist(artist, cache) : null
  if (!g) return null
  return <span className="text-violet-300/80"> · {GENRE_LABELS[g]}</span>
}
