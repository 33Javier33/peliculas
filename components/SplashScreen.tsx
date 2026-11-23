'use client'

import { useEffect, useRef, useState } from 'react'

// Pantalla de inicio: la animación de Carlos P. Nauto Interactive pasa al logo de PulsoMedia. Sale una vez por apertura de la app
// (no al cambiar de pantalla ni al recargar en la misma sesión). Se puede saltar tocándola.
// Viene dibujada desde el servidor para que aparezca antes que la app; si ya se vio en
// esta sesión, el script de SPLASH_SCRIPT la esconde antes de que se vea.

const KEY = 'cpn-splash-seen'
// Bordes de arriba y abajo de la animación de PulsoMusic: se funden con el fondo
const FADE = 'linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)'

/** Va en el <head>: esconde la pantalla de inicio si ya se mostró en esta sesión */
export const SPLASH_SCRIPT = `try{var th=localStorage.getItem('cpn-theme');if(th&&th!=='original')document.documentElement.setAttribute('data-theme',th)}catch(e){}try{if(/CPNFlavor\\/music/.test(navigator.userAgent))document.documentElement.setAttribute('data-app','music')}catch(e){}try{if(sessionStorage.getItem('${KEY}'))document.documentElement.setAttribute('data-splash','done')}catch(e){}`

export default function SplashScreen() {
  const [state, setState] = useState<'show' | 'leaving' | 'gone'>('show')
  const videoRef = useRef<HTMLVideoElement>(null)
  const musicRef = useRef<HTMLVideoElement>(null)
  const musicBgRef = useRef<HTMLVideoElement>(null)

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
      // La animación (3 s) se cierra sola al terminar; si no arranca, la imagen un momento
      musicRef.current?.play().catch(() => {})
      musicBgRef.current?.play().catch(() => {})
      const t = setTimeout(() => setState('leaving'), 4500)
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
      {/* PulsoMusic (solo se ve en esa app: html[data-app=music]): su imagen de presentación */}
      {/* Fondo con los mismos colores de los bordes de la animación (arriba gris, abajo casi negro):
          no se nota dónde termina el video. (Antes era otra imagen difuminada y cambiaba el color) */}
      <div className="cpn-splash-music absolute inset-0 items-center justify-center bg-[linear-gradient(180deg,#47494f_0%,#2a2b30_35%,#202025_50%,#151418_70%,#0c0b0e_100%)]">
        {/* Detrás, la misma animación agrandada y difuminada: rellena los bordes con sus propios
            colores, cuadro a cuadro (no se nota dónde termina el video) */}
        <video
          ref={musicBgRef}
          src="/brand/splash-music.mp4"
          poster="/brand/splash-music.webp"
          muted
          playsInline
          preload="none"
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover blur-2xl scale-110"
        />
        {/* Animación de presentación (solo se descarga en PulsoMusic: preload none y play al abrir) */}
        <video
          ref={musicRef}
          src="/brand/splash-music.mp4"
          poster="/brand/splash-music.webp"
          muted
          playsInline
          preload="none"
          onEnded={() => setState('leaving')}
          aria-label="PulsoMusic, por Carlos P. Nauto Interactive"
          // La caja mide lo mismo que la animación (9:16): el difuminado cae justo en sus bordes
          style={{ maskImage: FADE, WebkitMaskImage: FADE }}
          className="relative aspect-[9/16] w-full max-w-[calc(100dvh*9/16)] object-cover"
        />
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
