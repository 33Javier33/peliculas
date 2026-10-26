'use client'

import { useEffect, useState } from 'react'
import { Download, X, Share, SquarePlus } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Registra el service worker y muestra "Instalar app" cuando el navegador lo permite.
// En iPhone/iPad no existe el aviso automático, así que se muestran las instrucciones.
export default function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    setIsInstalled(standalone)
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent))

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (isInstalled || (!deferred && !isIos)) return null

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt()
      await deferred.userChoice.catch(() => null)
      setDeferred(null)
    } else {
      setShowIosHelp(true)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 bg-violet-500 hover:bg-violet-500 shadow-glow text-white text-xs sm:text-sm font-bold px-3 py-1.5 sm:py-2 rounded-full transition-colors"
        title="Instalar la app"
      >
        <Download className="w-4 h-4" />
        <span>Instalar</span>
      </button>

      {showIosHelp && (
        <div
          className="fixed inset-0 z-[120] bg-black/70 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            className="w-full max-w-sm bg-surface-1 border border-white/8 rounded-2xl p-5 text-sm text-slate-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-bold text-base">Instalar en iPhone / iPad</h2>
              <button onClick={() => setShowIosHelp(false)} className="p-1 text-slate-400 hover:text-white" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="space-y-2 list-decimal list-inside">
              <li>
                Abre esta página en <strong className="text-white">Safari</strong>.
              </li>
              <li>
                Toca <Share className="inline w-4 h-4 -mt-0.5" /> <strong className="text-white">Compartir</strong>.
              </li>
              <li>
                Elige <SquarePlus className="inline w-4 h-4 -mt-0.5" />{' '}
                <strong className="text-white">Agregar a inicio</strong>.
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  )
}
