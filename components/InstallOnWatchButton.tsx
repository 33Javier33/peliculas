'use client'

import { useEffect, useState } from 'react'
import { Watch, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getNative } from '@/lib/native'
import { appFlavor, type AppFlavor } from '@/lib/app-flavor'

// Instalar en el reloj sin salir de la app: el teléfono descarga el APK y se lo pasa a su app del
// reloj (PulsoMedia o PulsoMusic), que lo instala. Solo dentro de la app de Android.

const RELEASE = 'https://github.com/33Javier33/peliculas/releases/download/android-latest/'

type Progress = { name: string; state: 'download' | 'send' | 'sent' | 'done' | 'error'; pct?: number; msg?: string }
type Bridge = { installOnWatch?: (url: string, name: string) => void }

if (typeof window !== 'undefined') {
  ;(window as unknown as { __cpnWatchInstall?: (p: Progress) => void }).__cpnWatchInstall = (p) =>
    window.dispatchEvent(new CustomEvent<Progress>('cpn-watch-install', { detail: p }))
}

export function canInstallOnWatch() {
  return typeof (getNative() as Bridge | null)?.installOnWatch === 'function'
}

/** onlyFlavor: solo en esa app (la app del reloj de PulsoMedia solo la instala PulsoMedia, y así) */
export default function InstallOnWatchButton({ file, compact = false, onlyFlavor }: { file: string; compact?: boolean; onlyFlavor?: AppFlavor }) {
  const [able, setAble] = useState(false)
  const [p, setP] = useState<Progress | null>(null)

  useEffect(() => {
    setAble(canInstallOnWatch() && (!onlyFlavor || appFlavor() === onlyFlavor))
    const on = (e: Event) => {
      const d = (e as CustomEvent<Progress>).detail
      if (d?.name === file) setP(d)
    }
    window.addEventListener('cpn-watch-install', on)
    return () => window.removeEventListener('cpn-watch-install', on)
  }, [file, onlyFlavor])

  if (!able) return null
  const busy = p && (p.state === 'download' || p.state === 'send')
  const label = !p
    ? 'Instalar en el reloj'
    : p.state === 'download'
      ? `Descargando ${p.pct ?? 0}%`
      : p.state === 'send'
        ? `Enviando al reloj ${p.pct ?? 0}%`
        : p.state === 'sent'
          ? 'Confirma en el reloj'
          : p.state === 'done'
            ? 'Instalada en el reloj'
            : 'Reintentar'

  return (
    <div className={compact ? '' : 'w-full'}>
      <button
        disabled={!!busy}
        onClick={() => {
          setP({ name: file, state: 'download', pct: 0 })
          ;(getNative() as Bridge).installOnWatch?.(RELEASE + file, file)
        }}
        className={`flex items-center justify-center gap-1.5 rounded-full border border-violet-300/50 text-violet-100 font-bold active:scale-[0.97] transition-transform disabled:opacity-80 ${
          compact ? 'px-3 py-2 text-xs' : 'w-full py-2.5 text-sm'
        }`}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : p?.state === 'done' ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
        ) : p?.state === 'error' ? (
          <AlertTriangle className="w-4 h-4 text-amber-300" />
        ) : (
          <Watch className="w-4 h-4" />
        )}
        {label}
      </button>
      {p?.msg && <p className={`mt-1 text-[11px] text-center ${p.state === 'error' ? 'text-amber-300' : 'text-slate-400'}`}>{p.msg}</p>}
    </div>
  )
}
