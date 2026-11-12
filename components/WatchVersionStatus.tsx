'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Watch } from 'lucide-react'
import { getNative } from '@/lib/native'
import { appFlavor, brandName, type AppFlavor } from '@/lib/app-flavor'

const build = (v: string | null | undefined) => Number(String(v ?? '').split('.').pop()) || 0

type WearInfo = { used?: boolean; v?: string }

// Reloj de una app: versión publicada y (dentro de esa app del teléfono) la que tiene el reloj.
// El reloj y su app del teléfono se publican juntos con el mismo número de versión.
export default function WatchVersionStatus({ flavor }: { flavor: AppFlavor }) {
  const [latest, setLatest] = useState<string | null>(null)
  const [wear, setWear] = useState<WearInfo | null>(null)
  const [here, setHere] = useState(false)

  useEffect(() => {
    const mine = appFlavor() === flavor
    setHere(mine)
    if (mine) {
      try {
        const n = getNative() as { wearInfo?: () => string } | null
        const raw = n?.wearInfo?.()
        if (raw) setWear(JSON.parse(raw) as WearInfo)
      } catch {}
    }
    fetch(`/api/apk/version${flavor === 'music' ? '?app=music' : ''}`)
      .then((r) => r.json())
      .then((d: { version?: string | null }) => setLatest(d.version ?? null))
      .catch(() => {})
  }, [flavor])

  if (!latest) return null
  const name = brandName(flavor)

  let status: React.ReactNode = null
  if (here && wear?.used) {
    if (wear.v && build(wear.v) >= build(latest)) {
      status = (
        <p className="flex items-center gap-1.5 text-emerald-300 text-xs mt-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> Tu reloj tiene la {wear.v}: está al día.
        </p>
      )
    } else {
      status = (
        <p className="flex items-start gap-1.5 text-amber-300 text-xs mt-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            {wear.v ? `Tu reloj tiene la ${wear.v}` : 'Tu reloj tiene una versión anterior'}: está desactualizado. Descarga la {latest} e
            instálala encima.
          </span>
        </p>
      )
    }
  } else if (here && wear) {
    status = (
      <p className="text-slate-400 text-xs mt-2">
        Abre la app en el reloj una vez para ver aquí qué versión tiene (también aparece al final de su pantalla de inicio).
      </p>
    )
  }

  return (
    <div className="mt-3 rounded-xl bg-black/20 border border-white/8 px-3 py-2.5 text-sm">
      <p className="flex items-center gap-2 text-white font-semibold">
        <Watch className="w-4 h-4 text-violet-300" /> Reloj de {name}: versión disponible {latest}
      </p>
      {status}
    </div>
  )
}
