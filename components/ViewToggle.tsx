'use client'

import { useEffect, useState } from 'react'
import { List, LayoutGrid } from 'lucide-react'
import { useViewStore, type ViewMode } from '@/store/viewStore'

/** Vista elegida (Lista o Mosaico). Antes de cargar lo guardado en el teléfono, "list". */
export function useView(): ViewMode {
  const view = useViewStore((s) => s.view)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? view : 'list'
}

/** Botones Lista / Mosaico (la elección vale para todas las secciones) */
export default function ViewToggle({ compact = false }: { compact?: boolean }) {
  const view = useView()
  const setView = useViewStore((s) => s.setView)
  return (
    <div className="inline-flex shrink-0 bg-surface-1 border border-white/10 rounded-full p-1" role="group" aria-label="Vista">
      {(
        [
          ['list', List, 'Lista'],
          ['grid', LayoutGrid, 'Mosaico'],
        ] as const
      ).map(([value, Icon, label]) => (
        <button
          key={value}
          onClick={() => setView(value)}
          aria-pressed={view === value}
          aria-label={label}
          className={`inline-flex items-center gap-1.5 ${compact ? 'px-2.5 py-1.5' : 'px-3.5 py-1.5'} rounded-full text-xs font-semibold transition-colors ${
            view === value ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {!compact && label}
        </button>
      ))}
    </div>
  )
}
