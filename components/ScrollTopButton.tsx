'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronUp } from 'lucide-react'

// Botón flotante para subir: cada toque sube a la sección anterior (títulos de sección,
// pestañas…), de a una, hasta llegar arriba. Mantenerlo presionado sube de una vez.
const OFFSET = 88 // altura del encabezado

function stepsAbove(): number[] {
  const marks = Array.from(document.querySelectorAll<HTMLElement>('main h2, main [data-scroll-step]'))
  return marks
    .filter((el) => el.offsetParent !== null)
    .map((el) => el.getBoundingClientRect().top + window.scrollY - OFFSET)
    .filter((y) => y < window.scrollY - 24)
    .sort((a, b) => b - a)
}

export default function ScrollTopButton() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const up = () => {
    const [next] = stepsAbove()
    window.scrollTo({ top: Math.max(0, next ?? 0), behavior: 'smooth' })
  }
  const holdTimer = useRef<ReturnType<typeof setTimeout>>()
  const held = useRef(false)

  return (
    <button
      onClick={() => !held.current && up()}
      onPointerDown={() => {
        held.current = false
        holdTimer.current = setTimeout(() => {
          held.current = true
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }, 600)
      }}
      onPointerUp={() => clearTimeout(holdTimer.current)}
      onPointerLeave={() => clearTimeout(holdTimer.current)}
      aria-label="Subir a la sección anterior (mantener para ir al inicio)"
      title="Subir (mantén presionado para ir al inicio)"
      className={`fixed right-3 bottom-[calc(56px+92px+12px)] sm:bottom-[112px] z-[70] w-11 h-11 rounded-full bg-surface-2/95 border border-white/15 text-white shadow-xl shadow-black/50 flex items-center justify-center transition-all duration-200 ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
      }`}
    >
      <ChevronUp className="w-5 h-5" />
    </button>
  )
}
