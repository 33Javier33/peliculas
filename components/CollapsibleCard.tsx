'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

// Tarjeta que se expande: cerrada ocupa una línea (ícono, título y descripción corta); abierta
// muestra la sección completa con un botón para cerrarla. Se recuerda si quedó abierta. Lo
// abierto una vez queda armado (al cerrar y volver a abrir siguen los resultados de la búsqueda).
export default function CollapsibleCard({
  id,
  icon,
  title,
  desc,
  children,
}: {
  id: string
  icon: React.ReactNode
  title: string
  desc: string
  children: React.ReactNode
}) {
  const key = `cpn-card-${id}`
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === '1') {
        setOpen(true)
        setLoaded(true)
      }
    } catch {}
  }, [key])
  const toggle = (v: boolean) => {
    setOpen(v)
    if (v) setLoaded(true)
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {}
  }

  return (
    <div className="mb-3">
      {!open && (
        <button
          onClick={() => toggle(true)}
          aria-expanded={false}
          className="w-full flex items-center gap-3 rounded-2xl bg-surface-1/60 border border-white/8 hover:border-violet-400/40 px-4 py-3 text-left"
        >
          <span className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center shrink-0">{icon}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-white text-sm font-bold font-display truncate">{title}</span>
            <span className="block text-slate-500 text-xs truncate">{desc}</span>
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      )}
      {loaded && (
        <div className={open ? 'relative [&>section]:mb-0 [&>section>*:first-child]:pr-10' : 'hidden'}>
          <button
            onClick={() => toggle(false)}
            aria-label={`Cerrar ${title}`}
            title="Cerrar"
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-surface-2 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          {children}
        </div>
      )}
    </div>
  )
}
