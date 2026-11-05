'use client'

import { useEffect } from 'react'

// Pantalla cuando algo falla: en vez de dejar la app en negro, ofrece ir a la Biblioteca (que
// funciona sin conexión) o reintentar, y muestra el detalle para poder arreglarlo.
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const chunk = /ChunkLoad|Loading chunk|Failed to fetch dynamically|importing a module script/i.test(`${error?.name} ${error?.message}`)
  useEffect(() => {
    console.error('[PulsoMedia]', error)
    try {
      localStorage.setItem('cpn-last-error', JSON.stringify({ where: 'pantalla', msg: String(error?.message || error).slice(0, 300), at: Date.now(), online: navigator.onLine }))
      // Faltaba una parte de la app (se publicó una versión nueva): con internet se recarga sola una vez
      if (chunk && navigator.onLine && !sessionStorage.getItem('cpn-chunk-reload')) {
        sessionStorage.setItem('cpn-chunk-reload', '1')
        location.reload()
      }
    } catch {}
  }, [error, chunk])
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 bg-[#0B0C10] text-white">
      <div className="text-5xl mb-4">{offline ? '📴' : '⚠️'}</div>
      <h2 className="text-2xl font-bold mb-2">{offline ? 'Sin conexión' : 'Algo salió mal'}</h2>
      <p className="text-slate-400 text-sm max-w-sm mb-6">
        {offline ? 'Esta pantalla necesita internet. Tu música descargada sigue disponible en la Biblioteca.' : 'Prueba de nuevo o vuelve a tu Biblioteca.'}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <a href="/music/library" className="px-5 py-3 rounded-full bg-violet-500 text-white font-bold text-sm">
          Ir a mi biblioteca
        </a>
        <button onClick={() => (reset ? reset() : location.reload())} className="px-5 py-3 rounded-full border border-white/15 text-white text-sm font-semibold">
          Reintentar
        </button>
      </div>
      <p className="mt-8 text-[11px] text-slate-600 max-w-sm break-words">Detalle: {String(error?.message || error).slice(0, 200)}</p>
    </div>
  )
}
