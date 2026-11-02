'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Listas largas por partes: se dibujan las primeras filas y se agregan más al acercarse al final
 * (como en Spotify). Dibujar cientos de filas de una vez dejaba el teléfono ocupado 1–2 segundos
 * al abrir la Biblioteca, y la música que sonaba se cortaba en ese momento.
 * Devuelve la parte visible y una "marca" para poner al final de la lista.
 */
export function useProgressive<T>(list: T[], first = 30, step = 30): [T[], (el: Element | null) => void] {
  const [n, setN] = useState(first)
  useEffect(() => setN(first), [list, first])
  const obs = useRef<IntersectionObserver | null>(null)
  const more = useCallback(
    (el: Element | null) => {
      obs.current?.disconnect()
      obs.current = null
      if (!el || typeof IntersectionObserver === 'undefined') return
      obs.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) setN((x) => x + step)
        },
        { rootMargin: '900px 0px' }
      )
      obs.current.observe(el)
    },
    [step]
  )
  useEffect(() => () => obs.current?.disconnect(), [])
  return [n >= list.length ? list : list.slice(0, n), more]
}
