'use client'

import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { faceLabel, usePublishedFaces, useWatchInstalled } from '@/lib/watch-installed'

// Versión publicada de la esfera y, dentro de la app, si la del reloj está al día o desactualizada
export default function FaceVersionBadge({ file, compact = false }: { file: string; compact?: boolean }) {
  const list = usePublishedFaces()
  const installed = useWatchInstalled()
  const f = list?.find((x) => x.file === file)
  if (!f) return null
  const have = installed ? installed[f.package] : undefined
  const size = compact ? 'text-[10px]' : 'text-[11px]'
  return (
    <div className={`${size} leading-tight`}>
      <span className="text-slate-500">Versión {faceLabel(f.version)}</span>
      {have !== undefined &&
        (have >= f.version ? (
          <span className="flex items-center justify-center gap-1 text-emerald-300 mt-0.5">
            <CheckCircle2 className="w-3 h-3" /> En tu reloj, al día
          </span>
        ) : (
          <span className="flex items-center justify-center gap-1 text-amber-300 mt-0.5">
            <AlertTriangle className="w-3 h-3" /> En tu reloj: {have >= 1000 ? faceLabel(have) : 'anterior'} · desactualizada
          </span>
        ))}
    </div>
  )
}
