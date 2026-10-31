import type { Metadata } from 'next'
import { Share, PlusSquare, Smartphone, Music2, Radio, Info } from 'lucide-react'

export const metadata: Metadata = { title: 'App para iPhone', robots: { index: false } }

// iPhone: Apple no deja instalar apps fuera de la App Store, así que la app se instala desde
// Safari ("Agregar a pantalla de inicio"): queda con su ícono y se abre a pantalla completa.
export default function IphoneAppPage() {
  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white font-display">
          <Smartphone className="w-7 h-7 text-violet-300" /> App para iPhone
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          En iPhone la app se instala desde Safari: queda con su ícono en la pantalla de inicio y se abre a pantalla completa, como
          cualquier app. No ocupa espacio y se actualiza sola.
        </p>

        <ol className="mt-8 space-y-4 text-slate-300 text-sm">
          <li className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-violet-500 text-white font-bold flex items-center justify-center">1</span>
            <span>
              Abre <b>peliculas-neon.vercel.app</b> en <b>Safari</b> (no funciona desde Chrome ni desde otra app).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-violet-500 text-white font-bold flex items-center justify-center">2</span>
            <span>
              Toca el botón <b>Compartir</b> <Share className="inline w-4 h-4 -mt-1 text-sky-400" /> (abajo en el centro, o arriba en iPad).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-violet-500 text-white font-bold flex items-center justify-center">3</span>
            <span>
              Desliza hacia abajo y toca <b>Agregar a pantalla de inicio</b> <PlusSquare className="inline w-4 h-4 -mt-1 text-slate-200" />.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-violet-500 text-white font-bold flex items-center justify-center">4</span>
            <span>
              Toca <b>Agregar</b>. Abre la app desde el nuevo ícono <b>Carlos P. Nauto</b>.
            </span>
          </li>
        </ol>

        <div className="mt-8 rounded-2xl bg-surface-1/60 border border-white/8 p-4 space-y-3 text-sm">
          <p className="flex items-start gap-2 text-slate-300">
            <Radio className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>
              <b>Con la pantalla bloqueada deberían seguir sonando:</b> radios, discos de Internet Archive y música libre, enlaces MP3 y la música
              que agregues desde el teléfono.
            </span>
          </p>
          <p className="flex items-start gap-2 text-slate-300">
            <Music2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>
              <b>Canciones de YouTube:</b> suenan con la app abierta, pero iPhone las detiene al bloquear la pantalla (en Android la app
              propia sí las mantiene sonando).
            </span>
          </p>
          <p className="flex items-start gap-2 text-slate-500 text-xs">
            <Info className="w-4 h-4 shrink-0" />
            <span>
              Una app de iPhone descargable como el APK no es posible: Apple solo permite instalar apps desde la App Store, que pide una
              cuenta de desarrollador pagada y no acepta apps que reproducen YouTube de esta forma.
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
