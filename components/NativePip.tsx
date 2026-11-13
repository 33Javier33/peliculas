'use client'

import { useEffect } from 'react'
import { isNativeApp, reportVideoActive } from '@/lib/native'
import { PIP_EVENT } from '@/lib/pip'

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
    const w = window as unknown as { __cpnPip?: (on: boolean) => void; __cpnPipSoon?: number }
    let last = false
    const root = document.documentElement
    const native = () => (window as unknown as { CPNNative?: { inPip?: () => boolean } }).CPNNative
    // La ventanita ya se cerró pero la página siguió en modo ventanita (video estirado a toda la
    // pantalla, sin menús ni botones): se vuelve a la app normal
    const fix = () => {
      if (!root.classList.contains('cpn-pip')) return
      // Apps antiguas (sin inPip): la ventanita siempre es angosta; la app completa no
      let inPip = window.innerWidth < 500 && window.innerHeight < 500
      try {
        const f = native()?.inPip
        if (f) inPip = !!f.call(native())
      } catch {}
      if (!inPip) w.__cpnPip?.(false)
    }
    const check = () => {
      fix()
      const now = playing()
      if (now !== last) reportVideoActive((last = now))
    }
    const timer = setInterval(check, 1000)
    w.__cpnPip = (on) => {
      document.documentElement.classList.toggle('cpn-pip', on)
      if (!on) w.__cpnPipSoon = 0
      // Los reproductores vuelven a mirar si la app se ve (al cerrar la ventanita con la app
      // en segundo plano, recién ahí pasan al audio)
      window.dispatchEvent(new Event(PIP_EVENT))
    }
    // Al abrir la app o volver a verla: nunca empezar con el video estirado
    root.classList.remove('cpn-pip')
    const onVisible = () => document.visibilityState === 'visible' && fix()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
      reportVideoActive(false)
    }
  }, [])
  return null
}
