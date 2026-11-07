'use client'

import { Download, Loader2 } from 'lucide-react'
import { useOfflineStore } from '@/store/offlineStore'
import { downloadWholeLibrary, useLibraryJob } from '@/lib/yt-convert'

// «Descargar toda mi biblioteca»: baja en segundo plano todo lo que falta (discos, álbumes
// guardados y Me gusta; lo de YouTube convertido a audio) y muestra en qué disco va
export default function LibraryDownloadAll() {
  const job = useLibraryJob()
  const progress = useOfflineStore((s) => s.progress[job.gid])
  const label = !job.running
    ? 'Descargar toda mi biblioteca'
    : job.phase === 'buscando' || !progress
      ? `Disco ${job.index} de ${job.total}: buscando «${job.title}»…`
      : `Disco ${job.index} de ${job.total} «${job.title}»: canción ${Math.min(progress.done + 1, progress.total)}/${progress.total} · ${Math.round(progress.current * 100)}%`
  return (
    <button
      onClick={() => !job.running && downloadWholeLibrary().catch(() => 0)}
      disabled={job.running}
      className="mb-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-11 py-2 px-5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-sm font-semibold text-left disabled:opacity-90"
    >
      {job.running ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Download className="w-4 h-4 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  )
}
