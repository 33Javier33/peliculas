'use client'

import { useState } from 'react'
import { Settings2 } from 'lucide-react'

// Calidad de video para los reproductores HLS (TV en vivo, películas gratis).
// "Máxima" fija la calidad más alta del canal; "Automática" la ajusta a la conexión.

export type QualityPref = 'max' | 'auto' | number // número = alto en píxeles (1080, 720…)

const KEY = 'cpn-hls-quality'

export function readQualityPref(): QualityPref {
  try {
    const v = localStorage.getItem(KEY)
    if (!v) return 'max'
    return v === 'auto' || v === 'max' ? v : Number(v) || 'max'
  } catch {
    return 'max'
  }
}

function saveQualityPref(p: QualityPref) {
  try {
    localStorage.setItem(KEY, String(p))
  } catch {}
}

/** Nivel de hls.js para una preferencia (-1 = automático) */
export function levelFor(pref: QualityPref, levels: { height?: number }[]): number {
  if (pref === 'auto' || levels.length === 0) return -1
  const sorted = levels.map((l, i) => ({ h: l.height || 0, i })).sort((a, b) => b.h - a.h)
  if (pref === 'max') return sorted[0].i
  return (sorted.find((l) => l.h <= pref) ?? sorted[sorted.length - 1]).i
}

export default function HlsQualityMenu({
  levels,
  pref,
  onChange,
  className = '',
}: {
  levels: { height?: number }[]
  pref: QualityPref
  onChange: (p: QualityPref) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const heights = Array.from(new Set(levels.map((l) => l.height || 0).filter(Boolean))).sort((a, b) => b - a)
  if (heights.length < 2 && pref === 'max') return null
  const label = pref === 'auto' ? 'Auto' : pref === 'max' ? `Máx${heights[0] ? ` ${heights[0]}p` : ''}` : `${pref}p`
  const pick = (p: QualityPref) => {
    setOpen(false)
    saveQualityPref(p)
    onChange(p)
  }
  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 px-2.5 rounded-full bg-black/55 backdrop-blur text-white text-xs font-semibold inline-flex items-center gap-1"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Calidad de video"
      >
        <Settings2 className="w-3.5 h-3.5" /> {label}
      </button>
      {open && (
        <div role="menu" className="absolute top-full mt-1 left-0 z-30 w-36 rounded-xl bg-surface-1 border border-white/10 shadow-2xl overflow-hidden">
          {(['max', ...heights, 'auto'] as QualityPref[]).map((p) => (
            <button
              key={String(p)}
              role="menuitemradio"
              aria-checked={p === pref}
              onClick={() => pick(p)}
              className={`w-full text-left px-3 py-2 text-sm ${p === pref ? 'bg-violet-500/20 text-violet-200 font-semibold' : 'text-slate-200 hover:bg-white/5'}`}
            >
              {p === 'max' ? 'Máxima' : p === 'auto' ? 'Automática' : `${p}p`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
