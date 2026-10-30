'use client'

import { useEffect } from 'react'
import { isNativeApp, reportVideoActive } from '@/lib/native'

// App de Android: video en ventana flotante al salir de la app.
// Los reproductores marcan su recuadro con data-cpn-video. Aquí se le avisa al teléfono si hay
// un video sonando y, dentro de la ventanita, ese recuadro ocupa todo (clase cpn-pip en <html>).
export default function NativePip() {
  useEffect(() => {
    if (!isNativeApp()) return
    const playing = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-cpn-video]')).some((box) => {
        const video = box.querySelector('video')
        // Con <video> propio se mira si avanza; con YouTube (iframe) lo dice el reproductor
        return video ? !video.paused && !video.ended : box.dataset.cpnVideo === 'playing'
      })
    let last = false
    const check = () => {
      const now = playing()
      if (now !== last) reportVideoActive((last = now))
    }
    const timer = setInterval(check, 1000)
    ;(window as unknown as { __cpnPip?: (on: boolean) => void }).__cpnPip = (on) =>
      document.documentElement.classList.toggle('cpn-pip', on)
    return () => {
      clearInterval(timer)
      reportVideoActive(false)
    }
  }, [])
  return null
}
