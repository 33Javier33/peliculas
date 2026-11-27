'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, X } from 'lucide-react'
import { useSwipeDown } from '@/lib/use-swipe-down'
import SheetHandle from '@/components/SheetHandle'

// Secciones de Música (Escuchado recientemente, Hecho para ti, Artistas que sigues…): al tocar su
// título se abre esta ventana con todo el contenido, cómodo de ver (en cuadrícula, no de lado).

/** Título de sección que se puede tocar (con una flecha que lo indica) */
export function SectionTitle({ children, onOpen, className = '' }: { children: React.ReactNode; onOpen: () => void; className?: string }) {
  return (
    <h2 className={`text-white font-bold text-[22px] leading-7 ${className}`}>
      <button onClick={onOpen} className="group inline-flex items-center gap-1 text-left hover:text-violet-200">
        {children}
        <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-violet-300 transition-transform group-hover:translate-x-0.5" />
      </button>
    </h2>
  )
}

/** Ventana grande con el contenido de una sección (se cierra con la X, tocando afuera, deslizando hacia abajo o con Esc) */
export default function SectionSheet({
  title,
  subtitle,
  action,
  onClose,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  /** Botón al lado del título (p. ej. «Reproducir todo») */
  action?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  const swipe = useSwipeDown(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // La página de atrás no se mueve mientras está abierta
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/65" onClick={onClose} aria-label="Cerrar" />
      <div style={swipe.style} className="relative w-full sm:max-w-3xl h-[92dvh] sm:h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-surface-1 border border-white/10 shadow-2xl">
        <div {...swipe.dragProps} className="shrink-0 px-5 pt-3 pb-3 border-b border-white/8">
          <SheetHandle className="-mb-1 sm:hidden" />
          <div className="mt-2 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-white text-xl font-bold font-display leading-tight">{title}</p>
              {subtitle && <div className="text-slate-400 text-sm mt-0.5">{subtitle}</div>}
            </div>
            {action}
            <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-slate-300" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(env(safe-area-inset-bottom),24px)]">{children}</div>
      </div>
    </div>,
    document.body
  )
}
