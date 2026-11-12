import type { Metadata } from 'next'
import Link from 'next/link'
import { Watch } from 'lucide-react'
import WatchFaceStore from '@/components/WatchFaceStore'

export const metadata: Metadata = {
  title: 'Tienda de esferas para el reloj',
  description: 'Esferas para relojes Wear OS (TicWatch, Galaxy Watch y otros): descárgalas e instálalas en tu reloj.',
}

export default function WatchFacesPage() {
  return (
    <div className="pt-20 bg-obsidian pb-8">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white font-display">
          <Watch className="w-7 h-7 text-violet-300" /> Tienda de esferas
        </h1>
        <p className="text-[11px] tracking-[0.2em] text-slate-500 font-semibold mt-1">CARLOS P. NAUTO INTERACTIVE</p>
        <p className="text-slate-400 text-sm mt-2 mb-6">
          Esferas para tu reloj con Wear OS 3 o más nuevo: TicWatch, Galaxy Watch 4 (también el Classic), 5, 6 y 7, Pixel Watch y otros.
        </p>
        <WatchFaceStore />
        <Link href="/app-reloj" className="inline-block mt-6 text-violet-300 text-sm underline">
          App para el reloj
        </Link>
      </div>
    </div>
  )
}
