'use client'
import ProgressFill, { progressText } from '@/components/ProgressFill'

import HelpTip from '@/components/HelpTip'

import { Download, Loader2 } from 'lucide-react'
import { useOfflineStore } from '@/store/offlineStore'
import { downloadWholeLibrary, useLibraryJob, stopWholeLibrary } from '@/lib/yt-convert'

// «Descargar toda mi biblioteca»: baja en segundo plano todo lo que falta (discos, álbumes
// guardados y Me gusta; lo de YouTube convertido a audio) y muestra en qué disco va
export default function LibraryDownloadAll() {
  const job = useLibraryJob()
  const progress = useOfflineStore((s) => s.progress[job.gid])
  const label = !job.running
    ? 'Descargar toda mi biblioteca'
    : job.phase === 'buscando' || !progress
      ? `Disco ${job.index}/${job.total} · buscando…`
      : `Disco ${job.index}/${job.total} · canción ${Math.min(progress.done + 1, progress.total)}/${progress.total} · ${progressText(progress)}${progress.failed ? ` · ${progress.failed} fallidas` : ''}`
  return (
    <div className="flex items-center">
    <button
      onClick={() => (job.running ? stopWholeLibrary() : downloadWholeLibrary().catch(() => 0))}
      title={job.running ? `«${job.title}» · toca para detener` : undefined}
      className="relative overflow-hidden mb-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-11 py-2 px-5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-sm font-semibold text-left disabled:opacity-90"
    >
      {job.running && <ProgressFill value={job.total ? (job.index - 1 + (progress ? (progress.done + progress.current) / progress.total : 0)) / job.total || null : null} className="bg-emerald-500/30" />}
      {job.running ? <Loader2 className="relative w-4 h-4 shrink-0 animate-spin" /> : <Download className="relative w-4 h-4 shrink-0" />}
      <span className="relative truncate">{label}</span>
    </button>
    {job.running && <span className="sr-only">Toca para detener</span>}
    <HelpTip className="ml-2 mb-3" title="Descargar toda mi biblioteca" text="Baja todo lo que te falta: discos, álbumes guardados con ♥ y Me gusta (lo de YouTube se convierte a audio). Va un disco tras otro y sigue con la app cerrada o la pantalla bloqueada. Mientras descarga, tócalo para detenerlo. Si varias canciones seguidas no salen, se pausa sola y lo que falta se reintenta más tarde." />
    </div>
  )
}
