'use client'

import { useState } from 'react'
import { Wrench, Loader2 } from 'lucide-react'

// «Reparar la app»: si algo se traba (no suena, pantalla en negro…), vuelve a cargar la app desde
// cero SIN borrar tu biblioteca ni tus descargas. Evita tener que desinstalar.
export default function RepairAppButton() {
  const [busy, setBusy] = useState(false)
  const repair = async () => {
    if (!confirm('Se vuelve a cargar la app desde cero. Tu biblioteca, playlists y descargas NO se borran. ¿Continuar?')) return
    setBusy(true)
    try {
      // Solo la copia guardada de la app (no las carátulas ni la música)
      for (const k of await caches.keys()) if (k.startsWith('cpn-cache')) await caches.delete(k)
      for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister()
      sessionStorage.clear()
    } catch {}
    location.replace(`/?reparada=${Date.now()}`)
  }
  return (
    <button onClick={repair} disabled={busy} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
      {busy ? <Loader2 className="w-4 h-4 text-amber-300 animate-spin" /> : <Wrench className="w-4 h-4 text-amber-300" />}
      <span className="min-w-0 flex-1">
        <span className="block text-white text-sm font-semibold">Reparar la app</span>
        <span className="block text-slate-500 text-xs">Si no suena o algo se traba. No borra tu biblioteca ni tus descargas (no desinstales)</span>
      </span>
    </button>
  )
}
