'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { getNative } from '@/lib/native'

// Botón de descarga del APK, con respuesta visible al tocarlo:
// - App 1.0.22+: la app descarga la actualización ella misma, muestra el avance, la revisa
//   (si llegó dañada no la instala) y abre el instalador de Android.
// - App 1.0.16–1.0.21: la descarga Android (barra en la notificación) y abre el instalador al terminar.
// - Apps más antiguas: se abre el navegador del teléfono.
// - Navegador: descarga normal del archivo.
const GITHUB = 'https://github.com/33Javier33/peliculas/releases/download/android-latest/CarlosPNauto.apk'

type Native = ReturnType<typeof getNative> & { canDownload?: () => boolean; updateApp?: (url: string) => void }
type State =
  | { s: 'idle' }
  | { s: 'start' }
  | { s: 'downloading'; done: number; total: number }
  | { s: 'verifying' }
  | { s: 'permission' }
  | { s: 'installing' }
  | { s: 'handed' } // la descarga quedó en manos de Android o del navegador
  | { s: 'error'; message: string }

const mb = (b: number) => (b / 1048576).toFixed(1).replace('.', ',')

export default function DownloadApkButton() {
  const [mode, setMode] = useState<'web' | 'old' | 'dm' | 'native'>('web')
  const [st, setSt] = useState<State>({ s: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const n = getNative() as Native | null
    setMode(!n ? 'web' : n.updateApp ? 'native' : n.canDownload ? 'dm' : 'old')
    const w = window as unknown as { __cpnApkUpdate?: (d: { state: string; done: number; total: number; message: string }) => void }
    w.__cpnApkUpdate = (d) => {
      if (d.state === 'downloading') setSt({ s: 'downloading', done: d.done, total: d.total })
      else if (d.state === 'error') setSt({ s: 'error', message: d.message || 'No se pudo descargar' })
      else setSt({ s: d.state as 'start' | 'verifying' | 'permission' | 'installing' })
    }
    return () => {
      delete w.__cpnApkUpdate
      clearTimeout(timer.current)
    }
  }, [])

  const busy = st.s === 'start' || st.s === 'downloading' || st.s === 'verifying'

  const onClick = (e: React.MouseEvent) => {
    if (busy) {
      e.preventDefault()
      return
    }
    if (mode === 'native') {
      e.preventDefault()
      setSt({ s: 'start' })
      ;(getNative() as Native).updateApp!('/api/apk')
      return
    }
    // Las demás: el enlace hace la descarga; aquí solo se muestra que algo pasó
    setSt({ s: 'start' })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSt({ s: 'handed' }), 1800)
  }

  const pct = st.s === 'downloading' && st.total > 0 ? Math.round((st.done / st.total) * 100) : null

  let label: React.ReactNode = (
    <>
      <Download className="w-5 h-5" /> {mode === 'native' || mode === 'dm' ? 'Actualizar la app (5 MB)' : 'Descargar la app (5 MB)'}
    </>
  )
  if (st.s === 'start') label = (<><Loader2 className="w-5 h-5 animate-spin" /> Iniciando descarga…</>)
  else if (st.s === 'downloading')
    label = (
      <>
        <Loader2 className="w-5 h-5 animate-spin" /> Descargando… {pct != null ? `${pct}% (${mb(st.done)} de ${mb(st.total)} MB)` : `${mb(st.done)} MB`}
      </>
    )
  else if (st.s === 'verifying') label = (<><ShieldCheck className="w-5 h-5" /> Revisando el archivo…</>)
  else if (st.s === 'permission') label = (<><ShieldCheck className="w-5 h-5" /> Permite instalar y vuelve</>)
  else if (st.s === 'installing') label = (<><CheckCircle2 className="w-5 h-5" /> Abriendo el instalador…</>)
  else if (st.s === 'handed') label = (<><CheckCircle2 className="w-5 h-5" /> Descarga iniciada</>)
  else if (st.s === 'error') label = (<><AlertTriangle className="w-5 h-5" /> Reintentar descarga</>)

  return (
    <>
      <a
        href={mode === 'old' ? GITHUB : '/api/apk'}
        download={mode === 'web' ? 'CarlosPNauto.apk' : undefined}
        onClick={onClick}
        aria-busy={busy}
        className={`relative overflow-hidden mt-6 flex items-center justify-center gap-2 w-full rounded-full text-white font-bold py-4 shadow-glow select-none transition-transform active:scale-[0.97] ${
          st.s === 'error' ? 'bg-rose-500' : busy ? 'bg-violet-700 cursor-progress' : 'bg-violet-500 hover:bg-violet-400'
        }`}
      >
        {pct != null && <span className="absolute inset-y-0 left-0 bg-violet-400/60 transition-[width] duration-200" style={{ width: `${pct}%` }} />}
        <span className="relative flex items-center gap-2 text-sm sm:text-base">{label}</span>
      </a>
      <p className="text-slate-400 text-xs mt-2 text-center min-h-[2.5em]" aria-live="polite">
        {st.s === 'error' && <span className="text-rose-300">{st.message}. Toca el botón para intentarlo otra vez.</span>}
        {st.s === 'verifying' && 'Se comprueba que el archivo llegó completo antes de instalarlo.'}
        {st.s === 'permission' && 'Android pide permitir "instalar apps desconocidas" para esta app. Actívalo y vuelve: el instalador se abre solo.'}
        {st.s === 'installing' && 'Toca "Actualizar" en el instalador de Android. No pierdes nada de lo guardado.'}
        {(st.s === 'start' || st.s === 'handed') && mode === 'dm' && 'Mira el avance en la notificación. Al terminar se abre el instalador.'}
        {(st.s === 'start' || st.s === 'handed') && mode === 'web' && 'Al terminar, abre el archivo desde la notificación o en Descargas e instálalo.'}
        {mode === 'old' && (st.s === 'idle' || st.s === 'start' || st.s === 'handed') &&
          'Se abrirá el navegador del teléfono para descargarla. Después abre el archivo desde la notificación e instálalo encima.'}
      </p>
    </>
  )
}
