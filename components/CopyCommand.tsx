'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

// Orden para copiar (permiso de instalar apps en el reloj)
export default function CopyCommand({ cmd }: { cmd: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(cmd).then(() => {
          setOk(true)
          setTimeout(() => setOk(false), 2000)
        }).catch(() => {})
      }}
      className="mt-1 w-full flex items-center gap-2 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-left"
    >
      <code className="flex-1 text-[11px] text-emerald-200 break-all">{cmd}</code>
      {ok ? <Check className="w-4 h-4 text-emerald-300 shrink-0" /> : <Copy className="w-4 h-4 text-slate-400 shrink-0" />}
    </button>
  )
}
