'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useOfflineStore } from '@/store/offlineStore'
import { downloadWholeLibrary } from '@/lib/yt-convert'

// «Descargar toda mi biblioteca»: baja en segundo plano todo lo que falta (discos, álbumes
// guardados y Me gusta; lo de YouTube convertido a audio)
export default function LibraryDownloadAll() {
  const running = useOfflineStore((s) => Object.keys(s.queue).length)
  const [busy, setBusy] = useState(false)
  const active = busy || running > 0
  return (
    <button
      onClick={async () => {
        if (active) return
        setBusy(true)
        await downloadWholeLibrary().catch(() => 0)
        setBusy(false)
      }}
      disabled={active}
      className="mb-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-sm font-semibold disabled:opacity-70"
    >
      {active ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {active ? `Descargando tu biblioteca… (${running} ${running === 1 ? 'disco' : 'discos'} en cola)` : 'Descargar toda mi biblioteca'}
    </button>
  )
}
