'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Carlos P. Nauto Interactive Error]', error)
  }, [error])

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-6xl mb-6">⚠️</div>
      <h2 className="text-3xl font-bold text-white mb-3">Algo salió mal</h2>
      <p className="text-slate-400 mb-2 max-w-md">
        {error.message || 'Ocurrió un error inesperado al cargar el contenido.'}
      </p>
      {error.message?.includes('TMDB_API_KEY') && (
        <p className="text-violet-400 text-sm mb-6 max-w-md bg-violet-400/10 border border-violet-400/30 rounded-lg px-4 py-3">
          Crea un archivo <code className="font-mono bg-surface-2 px-1 rounded">.env.local</code>{' '}
          con tu <code className="font-mono bg-surface-2 px-1 rounded">TMDB_API_KEY</code>. Puedes
          obtenerla gratis en themoviedb.org.
        </p>
      )}
      <button
        onClick={reset}
        className="mt-4 bg-violet-500 hover:bg-violet-500 shadow-glow text-white font-bold px-6 py-3 rounded-full transition-all duration-200 hover:scale-105"
      >
        Intentar de nuevo
      </button>
    </div>
  )
}
