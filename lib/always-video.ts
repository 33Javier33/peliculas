'use client'

import { useEffect, useState } from 'react'

// «Ver siempre el video»: las canciones que tienen video se ven como video en el reproductor (al
// bloquear el teléfono o salir de la app pasan a audio y al volver, otra vez al video).
const KEY = 'cpn-always-video'

export function getAlwaysVideo(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setAlwaysVideo(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {}
  window.dispatchEvent(new Event('cpn-always-video'))
}

export function useAlwaysVideo(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const read = () => setOn(getAlwaysVideo())
    read()
    window.addEventListener('cpn-always-video', read)
    return () => window.removeEventListener('cpn-always-video', read)
  }, [])
  return on
}
