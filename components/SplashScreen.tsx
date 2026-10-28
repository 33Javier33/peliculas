'use client'

import { useEffect, useRef, useState } from 'react'

// Pantalla de inicio con la animación de la marca. Sale una vez por apertura de la app
// (no al cambiar de pantalla ni al recargar en la misma sesión). Se puede saltar tocándola.
// Viene dibujada desde el servidor para que aparezca antes que la app; si ya se vio en
// esta sesión, el script de SPLASH_SCRIPT la esconde antes de que se vea.

const KEY = 'cpn-splash-seen'

/** Va en el <head>: esconde la pantalla de inicio si ya se mostró en esta sesión */
export const SPLASH_SCRIPT = `try{if(sessionStorage.getItem('${KEY}'))document.documentElement.setAttribute('data-splash','done')}catch(e){}`

export default function SplashScreen() {
  const [state, setState] = useState<'show' | 'leaving' | 'gone'>('show')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let seen = false
    try {
      seen = !!sessionStorage.getItem(KEY)
      sessionStorage.setItem(KEY, '1')
    } catch {}
    if (seen) return setState('gone')

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const video = videoRef.current
    video?.play().catch(() => {})
    // Si el video no arranca (ahorro de datos o de batería), se muestra la imagen un momento
    const max = setTimeout(() => setState('leaving'), 4500)
    return () => {
      clearTimeout(max)
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    if (state === 'leaving') {
      document.body.style.overflow = ''
      const t = setTimeout(() => setState('gone'), 450)
      return () => clearTimeout(t)
    }
  }, [state])

  if (state === 'gone') return null

  return (
    <div
      id="cpn-splash"
      onClick={() => setState('leaving')}
      className={`fixed inset-0 z-[200] bg-[#0b0a24] flex items-center justify-center overflow-hidden transition-opacity duration-[450ms] ${
        state === 'leaving' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="Carlos P. Nauto Interactive"
      role="img"
    >
      {/* Fondo difuminado para pantallas anchas (computador, tablet) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/splash-poster.webp" alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-50 scale-110" />
      <video
        ref={videoRef}
        src="/brand/splash.mp4"
        poster="/brand/splash-poster.webp"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={() => setState('leaving')}
        className="relative h-full w-full object-contain"
      />
    </div>
  )
}
