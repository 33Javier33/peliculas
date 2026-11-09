'use client'

import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { isNativeApp } from '@/lib/native'

// Enlace compartido abierto en el navegador de un Android: botón para abrirlo en la app PulsoMedia
// (si está instalada; si no, sigue en la web). Funciona aunque Android no abra la app solo.
export default function OpenInAppBanner({ className = '' }: { className?: string }) {
  const [href, setHref] = useState<string | null>(null)
  // Enlace compartido desde PulsoMusic (?app=music): se abre en PulsoMusic
  const [music, setMusic] = useState(false)
  useEffect(() => {
    if (isNativeApp() || !/Android/i.test(navigator.userAgent)) return
    const { host, pathname, search, href: here } = window.location
    const m = new URLSearchParams(search).get('app') === 'music'
    setMusic(m)
    setHref(`intent://${host}${pathname}${search}#Intent;scheme=https;package=${m ? 'cl.carlospnauto.music' : 'cl.carlospnauto.app'};S.browser_fallback_url=${encodeURIComponent(here)};end`)
  }, [])
  if (!href) return null
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-fuchsia-500/20 border border-white/10 px-4 py-3 ${className}`}
    >
      <Smartphone className="w-5 h-5 text-cyan-300 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-white text-sm font-semibold">Abrir en la app {music ? 'PulsoMusic' : 'PulsoMedia'}</span>
        <span className="block text-slate-400 text-xs">
          Suena con la pantalla apagada. Si no la tienes, sigue aquí o{' '}
          <span
            role="link"
            className="underline"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              window.location.href = music ? '/pulsomusic' : '/app-android'
            }}
          >
            descárgala
          </span>
          .
        </span>
      </span>
    </a>
  )
}
