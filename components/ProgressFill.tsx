'use client'

import type { OfflineProgress } from '@/store/offlineStore'

// Relleno de avance para los botones de descarga: la barra se va llenando (con un brillo que
// corre encima). Sin porcentaje todavía (preparando, o sin tamaño conocido) se ve solo el brillo.
export default function ProgressFill({ value, className = 'bg-violet-500/35' }: { value: number | null; className?: string }) {
  const pct = value === null ? null : Math.max(0, Math.min(1, value)) * 100
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {pct !== null && <span className={`absolute inset-y-0 left-0 transition-[width] duration-300 ease-out ${className}`} style={{ width: `${pct}%` }} />}
      <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[cpn-shimmer_1.4s_ease-in-out_infinite]" />
    </span>
  )
}

/** Texto del avance de una canción: «42 %», «3,1 MB» o «preparando…» */
export function progressText(p: OfflineProgress | undefined): string {
  if (!p) return 'preparando…'
  if (p.current > 0) return `${Math.round(p.current * 100)} %`
  if (p.bytes && p.bytes > 0) return `${(p.bytes / 1048576).toFixed(1).replace('.', ',')} MB`
  return 'preparando…'
}
