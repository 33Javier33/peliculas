'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import FollowArtistButton from '@/components/FollowArtistButton'
import { readSession, writeSession } from '@/lib/session-cache'

// Desde una canción (de YouTube) se busca al artista en el catálogo para poder seguirlo.
type Found = { id: number; name: string; picture: string } | null

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*(-\s*topic|vevo|official|oficial)\s*$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export default function FollowByName({ name }: { name: string }) {
  const [artist, setArtist] = useState<Found>(null)

  useEffect(() => {
    const wanted = norm(name)
    if (!wanted) return setArtist(null)
    const key = `artist-by-name:${wanted}`
    const cached = readSession<Found | 'none'>(key)
    if (cached) return setArtist(cached === 'none' ? null : cached)
    let cancelled = false
    fetch(`/api/catalog/search?q=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d: { artists?: { id: number; name: string; picture: string }[] }) => {
        // Solo si el nombre coincide (para no seguir a otro artista por error)
        const match = (d.artists ?? []).find((a) => norm(a.name) === wanted) ?? null
        writeSession(key, match ?? 'none')
        if (!cancelled) setArtist(match)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [name])

  if (!artist) return null
  return (
    <div className="flex items-center gap-2 mt-2">
      <FollowArtistButton artist={artist} size="sm" />
      <Link href={`/music/artist/${artist.id}`} className="text-xs font-semibold text-violet-300 hover:text-violet-200">
        Ver discografía
      </Link>
    </div>
  )
}
