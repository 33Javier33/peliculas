'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { getNative } from '@/lib/native'

const build = (v: string | null | undefined) => Number(String(v ?? '').split('.').pop()) || 0

// Versión publicada del APK, qué trae y (dentro de la app) si la instalada está al día
export default function ApkVersionInfo() {
  const [latest, setLatest] = useState<{ version?: string | null; notes?: string; date?: string } | null>(null)
  const [installed, setInstalled] = useState<string | null>(null)
  useEffect(() => {
    try {
      setInstalled(getNative()?.version() ?? null)
    } catch {}
    fetch('/api/apk/version')
      .then((r) => r.json())
      .then(setLatest)
      .catch(() => {})
  }, [])
  if (!latest?.version) return null
  const upToDate = installed && build(installed) >= build(latest.version)
  return (
    <div className="mt-5 rounded-2xl bg-surface-1/60 border border-white/8 p-4 text-sm">
      <p className="flex items-center gap-2 text-white font-semibold">
        <Sparkles className="w-4 h-4 text-violet-300" /> Última versión: {latest.version}
        {latest.date && <span className="text-slate-500 font-normal text-xs">· {latest.date}</span>}
      </p>
      {latest.notes && <p className="text-slate-400 text-xs mt-1">Novedad: {latest.notes}</p>}
      {installed &&
        (upToDate ? (
          <p className="flex items-center gap-1.5 text-emerald-300 text-xs mt-2">
            <CheckCircle2 className="w-4 h-4" /> Tienes la versión {installed}: está al día.
          </p>
        ) : (
          <p className="text-amber-300 text-xs mt-2">Tienes la versión {installed}: descarga la nueva e instálala encima.</p>
        ))}
    </div>
  )
}
