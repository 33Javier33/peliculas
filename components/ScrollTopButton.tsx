'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

// Botones flotantes para moverse por secciones (títulos de sección, pestañas…):
// - Subir: cada toque sube a la sección anterior; mantenerlo presionado sube de una vez.
// - Bajar: cada toque baja a la siguiente sección; mantenerlo presionado baja hasta el final.
const OFFSET = 88 // altura del encabezado

function steps(): number[] {
  return Array.from(document.querySelectorAll<HTMLElement>('main h2, main [data-scroll-step]'))
    .filter((el) => el.offsetParent !== null)
    .map((el) => el.getBoundingClientRect().top + window.scrollY - OFFSET)
}
const stepsAbove = () => steps().filter((y) => y < window.scrollY - 24).sort((a, b) => b - a)
const stepsBelow = () => steps().filter((y) => y > window.scrollY + 24).sort((a, b) => a - b)
const bottom = () => document.documentElement.scrollHeight - window.innerHeight

function useHold(onTap: () => void, onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const held = useRef(false)
  return {
    onClick: () => !held.current && onTap(),
    onPointerDown: () => {
      held.current = false
      timer.current = setTimeout(() => {
        held.current = true
        onHold()
      }, 600)
    },
    onPointerUp: () => clearTimeout(timer.current),
    onPointerLeave: () => clearTimeout(timer.current),
  }
}

const btn =
  'fixed right-3 z-[70] w-11 h-11 rounded-full bg-surface-2/95 border border-white/15 text-white shadow-xl shadow-black/50 flex items-center justify-center transition-all duration-200 active:scale-90'

export default function ScrollTopButton() {
  const [showUp, setShowUp] = useState(false)
  const [showDown, setShowDown] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      setShowUp(window.scrollY > 400)
      // Abajo: mientras quede página por recorrer
      setShowDown(bottom() - window.scrollY > 80)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    // La página crece al cargar contenido: se revisa al cambiar de tamaño (y de vez en cuando)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null
    ro?.observe(document.body)
    const t = setInterval(onScroll, 1500)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      ro?.disconnect()
      clearInterval(t)
    }
  }, [])

  const up = useHold(
    () => window.scrollTo({ top: Math.max(0, stepsAbove()[0] ?? 0), behavior: 'smooth' }),
    () => window.scrollTo({ top: 0, behavior: 'smooth' })
  )
  const down = useHold(
    () => {
      const next = stepsBelow()[0]
      // Sin más secciones: baja una pantalla
      window.scrollTo({ top: Math.min(bottom(), next ?? window.scrollY + window.innerHeight * 0.8), behavior: 'smooth' })
    },
    () => window.scrollTo({ top: bottom(), behavior: 'smooth' })
  )

  return (
    <>
      <button
        {...up}
        aria-label="Subir a la sección anterior (mantener para ir al inicio)"
        title="Subir (mantén presionado para ir al inicio)"
        className={`${btn} bottom-[calc(56px+92px+12px+52px)] sm:bottom-[164px] ${
          showUp ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
        }`}
      >
        <ChevronUp className="w-5 h-5" />
      </button>
      <button
        {...down}
        aria-label="Bajar a la sección siguiente (mantener para ir al final)"
        title="Bajar (mantén presionado para ir al final)"
        className={`${btn} bottom-[calc(56px+92px+12px)] sm:bottom-[112px] ${
          showDown ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3 pointer-events-none'
        }`}
      >
        <ChevronDown className="w-5 h-5" />
      </button>
    </>
  )
}
