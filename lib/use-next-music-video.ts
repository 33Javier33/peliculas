'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isMusicVideo, nextMusicVideo, nextOtherVideo, type VideoRef } from '@/lib/next-music-video'

/**
 * Deja listo el video siguiente (para seguir al terminar o con «Siguiente»): con videos musicales,
 * otro musical; con películas y otros, el que sigue en la lista (music dice cuál es el caso).
 */
export function useNextMusicVideo(cur: VideoRef | null, list: VideoRef[], go: (v: VideoRef) => void, seconds = 0) {
  const [next, setNext] = useState<VideoRef | null>(null)
  const played = useRef(new Set<string>())
  const listRef = useRef(list)
  listRef.current = list
  const music = !!cur && isMusicVideo(cur.title, cur.channel, seconds)
  useEffect(() => {
    setNext(null)
    if (!cur) return
    played.current.add(cur.id)
    let cancelled = false
    // Música: otro video musical. Lo demás (películas, documentales…): el que sigue en la lista
    // o, si no hay, otro del mismo canal
    ;(music ? nextMusicVideo(cur, listRef.current, played.current) : nextOtherVideo(cur, listRef.current, played.current))
      .then((v) => !cancelled && setNext(v))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [cur?.id, music]) // eslint-disable-line react-hooks/exhaustive-deps
  const advance = useCallback(() => {
    if (next) go(next)
  }, [next, go])
  return { next, advance, music }
}
