'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Maximize2, PictureInPicture2, X } from 'lucide-react'
import { getNative } from '@/lib/native'

/**
 * Video de la canción como en YouTube Music: el sonido es SIEMPRE el de la canción (nunca se pausa
 * ni se cambia de reproductor) y el video es solo la imagen, sin sonido, pegada al segundo exacto
 * de la canción. Al bloquear el teléfono o volver a «Canción» solo deja de verse la imagen: la
 * música sigue igual, sin ningún corte.
 *
 * La imagen la entrega el propio teléfono (app de Android: /cv/ID, el mismo video que va a la TV).
 * Si no carga, `onFail` vuelve al video de YouTube de siempre.
 */
export function syncedVideoUrl(id: string): string | null {
  try {
    const base = getNative()?.audioBase?.()
    // ?h=480: imagen liviana (las APK anteriores no lo conocen y dan la de la TV, igual funciona)
    return base ? `${base}/cv/${id}?h=480` : null
  } catch {
    return null
  }
}

/** El audio de la canción (lo expone la barra del reproductor) */
const audioEl = () => (window as unknown as { __cpnAudioEl?: () => HTMLMediaElement | null }).__cpnAudioEl?.() ?? null

export default function SyncedVideo({
  videoId,
  onFail,
  onExpand,
  onFloat,
  onCloseFloat,
  fit = 'contain',
}: {
  /** cover: llena todo el espacio (en el reproductor grande); contain: el video entero */
  fit?: 'cover' | 'contain'
  videoId: string
  onFail: () => void
  onExpand?: () => void
  onFloat?: () => void
  onCloseFloat?: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  // Agrandar: la misma imagen a pantalla completa (sigue pegada a la canción, sin cortes)
  const fullscreen = () => {
    const box = boxRef.current
    if (!box) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else box.requestFullscreen?.().catch(() => {})
  }
  const failRef = useRef(onFail)
  failRef.current = onFail
  const src = syncedVideoUrl(videoId)

  useEffect(() => {
    setReady(false)
    const v = ref.current
    if (!v || !src) return
    let failed = false
    const fail = () => {
      if (failed) return
      failed = true
      failRef.current()
    }
    // Si en 12 s no muestra imagen, se usa el video de YouTube
    const giveUp = setTimeout(() => {
      if (v.readyState < 2) fail()
    }, 12000)
    v.addEventListener('error', fail)
    const onData = () => setReady(true)
    v.addEventListener('loadeddata', onData)

    // Pegado a la canción: si se corre, se corrige (saltos grandes con un salto; chicos acelerando o
    // frenando la imagen de a poco). La canción no se toca nunca.
    let seekingUntil = 0
    const tick = setInterval(() => {
      const a = audioEl()
      if (!a || v.readyState < 1) return
      // Escondida (bloqueo, otra app) o canción en pausa: la imagen se detiene; el sonido sigue igual
      if (document.visibilityState === 'hidden' || a.paused) {
        if (!v.paused) v.pause()
        return
      }
      const now = performance.now()
      if (now < seekingUntil) return
      const d = v.currentTime - a.currentTime
      const ad = Math.abs(d)
      if (ad > 0.6 || v.paused) {
        // (se adelanta un poco lo que tarda en mostrar el cuadro tras el salto)
        try {
          v.currentTime = Math.max(0, a.currentTime + 0.15)
        } catch {}
        v.playbackRate = 1
        seekingUntil = now + 400
        if (v.paused) v.play()?.catch?.(() => {})
        return
      }
      v.playbackRate = ad <= 0.03 ? 1 : ad > 0.2 ? (d < 0 ? 1.2 : 0.8) : d < 0 ? 1.05 : 0.95
    }, 100)
    return () => {
      clearTimeout(giveUp)
      clearInterval(tick)
      v.removeEventListener('error', fail)
      v.removeEventListener('loadeddata', onData)
    }
  }, [src])

  useEffect(() => {
    if (!src) failRef.current()
  }, [src])
  if (!src) return null

  return (
    <div ref={boxRef} data-synced-video className="absolute inset-0 bg-black">
      {!ready && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white/60 animate-spin" />
        </span>
      )}
      <video ref={ref} src={src} muted playsInline preload="auto" className={`absolute inset-0 w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`} aria-label="Video de la canción" />
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        {onFloat && (
          <button onClick={onFloat} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center" aria-label="Ventana flotante" title="Ventana flotante (sigue mientras usas la app)">
            <PictureInPicture2 className="w-5 h-5" />
          </button>
        )}
        {(
          <button onClick={onExpand ?? fullscreen} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center" aria-label="Agrandar">
            <Maximize2 className="w-5 h-5" />
          </button>
        )}
        {onCloseFloat && (
          <button onClick={onCloseFloat} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center" aria-label="Cerrar video (la canción sigue)">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
