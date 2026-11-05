'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Deslizar hacia abajo para cerrar una ventana (ecualizador, cola…). Se arrastra desde la barrita
 * de arriba o la cabecera (`dragProps`); la ventana sigue al dedo (`style`) y al soltar se cierra
 * si bajó lo suficiente o rápido, si no vuelve a su lugar.
 */
export function useSwipeDown(onClose: () => void, threshold = 90) {
  const [dy, setDy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ y: number; t: number; id: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Botones e interruptores de la cabecera siguen funcionando con un toque
    if ((e.target as HTMLElement).closest('button, input, select, a, [role="switch"]')) return
    start.current = { y: e.clientY, t: Date.now(), id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return
    setDy(Math.max(0, e.clientY - start.current.y))
  }, [])
  const end = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current
      if (!s || s.id !== e.pointerId) return
      start.current = null
      setDragging(false)
      const moved = Math.max(0, e.clientY - s.y)
      const speed = moved / Math.max(1, Date.now() - s.t)
      if (moved > threshold || (moved > 30 && speed > 0.6)) {
        setDy(window.innerHeight)
        setTimeout(() => {
          onClose()
          setDy(0)
        }, 180)
      } else setDy(0)
    },
    [onClose, threshold]
  )

  return {
    dragProps: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, style: { touchAction: 'none' as const } },
    style: { transform: dy ? `translateY(${dy}px)` : undefined, transition: dragging ? 'none' : 'transform 180ms ease-out' },
  }
}
