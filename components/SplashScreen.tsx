'use client'

import { useEffect, useRef, useState } from 'react'

// Pantalla de inicio: la animación de Carlos P. Nauto Interactive pasa al logo de PulsoMedia. Sale una vez por apertura de la app
// (no al cambiar de pantalla ni al recargar en la misma sesión). Se puede saltar tocándola.
// Viene dibujada desde el servidor para que aparezca antes que la app; si ya se vio en
// esta sesión, el script de SPLASH_SCRIPT la esconde antes de que se vea.

const KEY = 'cpn-splash-seen'

/** Va en el <head>: esconde la pantalla de inicio si ya se mostró en esta sesión */
export const SPLASH_SCRIPT = `try{if(/CPNFlavor\\/music/.test(navigator.userAgent))document.documentElement.setAttribute('data-app','music')}catch(e){}try{if(sessionStorage.getItem('${KEY}'))document.documentElement.setAttribute('data-splash','done')}catch(e){}`

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
    // PulsoMusic: su propia pantalla (logo animado con su nombre), sin el video de PulsoMedia
    if (document.documentElement.dataset.app === 'music') {
      videoRef.current?.pause()
      const t = setTimeout(() => setState('leaving'), 2400)
      return () => {
        clearTimeout(t)
        document.body.style.overflow = prev
      }
    }
    const video = videoRef.current
    video?.play().catch(() => {})
    // Si el video no arranca (ahorro de datos o de batería), se muestra la imagen un momento
    const max = setTimeout(() => setState('leaving'), 7000)
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
      aria-label="Pulso"
      role="img"
    >
      {/* PulsoMusic (solo se ve en esa app: html[data-app=music]) */}
      <div className="cpn-splash-music absolute inset-0 flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_50%_40%,#3b0d4f_0%,#0b0a24_60%)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-mark.png" alt="" className="w-28 h-28 rounded-3xl shadow-[0_0_60px_rgba(217,70,239,0.55)] animate-[cpn-splash-pop_0.9s_cubic-bezier(.2,1.4,.4,1)_both]" />
        <p className="text-4xl font-black font-display tracking-tight animate-[cpn-splash-rise_0.8s_ease-out_0.35s_both]">
          <span className="text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]">Pulso</span>
          <span className="text-white">Music</span>
        </p>
        <p className="text-slate-400 text-xs tracking-[0.2em] uppercase animate-[cpn-splash-rise_0.8s_ease-out_0.7s_both]">por Carlos P. Nauto Interactive</p>
      </div>
      {/* Fondo difuminado para pantallas anchas (computador, tablet) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/splash-poster.webp" alt="" className="cpn-splash-media absolute inset-0 w-full h-full object-cover blur-2xl opacity-50 scale-110" />
      <video
        ref={videoRef}
        src="/brand/splash.mp4"
        poster="/brand/splash-poster.webp"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={() => setState('leaving')}
        className="cpn-splash-media relative h-full w-full object-contain"
      />
    </div>
  )
}
