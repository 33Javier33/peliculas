'use client'

import { useEffect, useState } from 'react'

// «Reproducción automática» de videos de YouTube que no son música (películas, documentales…):
// al terminar sigue el próximo de la lista. Los videos musicales siempre siguen solos.
const KEY = 'cpn-autoplay-videos'

export function getAutoplay(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function setAutoplay(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {}
  window.dispatchEvent(new Event(KEY))
}

export function useAutoplay(): boolean {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const read = () => setOn(getAutoplay())
    read()
    window.addEventListener(KEY, read)
    return () => window.removeEventListener(KEY, read)
  }, [])
  return on
}
