import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Check, Sparkles } from 'lucide-react'
import { WATCH_FACES, WATCH_FACE_DETAILS, watchFaceById } from '@/lib/watchfaces'
import WatchFaceGallery from '@/components/WatchFaceGallery'
import InstallOnWatchButton from '@/components/InstallOnWatchButton'
import { DownloadLink } from '@/components/WatchFaceStore'

export function generateStaticParams() {
  return WATCH_FACES.map((f) => ({ id: f.id }))
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const f = watchFaceById(params.id)
  return f ? { title: `Esfera ${f.name}`, description: f.description } : {}
}

// Página de una esfera: imágenes, descripción, qué se personaliza e instalar
export default function WatchFacePage({ params }: { params: { id: string } }) {
  const f = watchFaceById(params.id)
  if (!f) notFound()
  const d = WATCH_FACE_DETAILS[f.id]
  return (
    <div className="pt-20 bg-obsidian pb-8">
      <div className="max-w-xl mx-auto px-4 py-6">
        <Link href="/esferas" className="inline-flex items-center gap-1 text-violet-300 text-sm">
          <ChevronLeft className="w-4 h-4" /> Tienda de esferas
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-white font-display">{f.name}</h1>
        <p className="text-[11px] tracking-[0.2em] text-slate-500 font-semibold mt-0.5">CARLOS P. NAUTO INTERACTIVE</p>

        <div className="mt-4">
          <WatchFaceGallery id={f.id} name={f.name} count={d?.gallery ?? 0} />
        </div>

        <div className="mt-5 space-y-2">
          <InstallOnWatchButton file={f.file} />
          <DownloadLink f={f} />
        </div>

        <p className="mt-5 text-slate-300 text-sm leading-relaxed">{d?.long ?? f.description}</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {f.features.map((x) => (
            <span key={x} className="rounded-full bg-surface-1 border border-white/8 px-2.5 py-1 text-[11px] text-slate-300">
              {x}
            </span>
          ))}
        </div>

        {d && (
          <div className="mt-6 rounded-2xl bg-surface-1 border border-white/8 p-4">
            <p className="flex items-center gap-2 text-white font-semibold text-sm">
              <Sparkles className="w-4 h-4 text-violet-300" /> Lo que puedes personalizar
            </p>
            <p className="text-slate-500 text-xs mt-1">En el reloj: mantén presionada la esfera → Personalizar.</p>
            <ul className="mt-3 space-y-2">
              {d.customize.map((x) => (
                <li key={x} className="flex gap-2 text-slate-300 text-sm">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300" /> {x}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-6 text-slate-500 text-xs">
          Archivo {f.file}. Funciona en relojes con Wear OS 3 o más nuevo (TicWatch, Galaxy Watch 4 en adelante, Pixel Watch y otros). Algunas
          imágenes muestran los textos en inglés; en el reloj salen en español.
        </p>
        <Link href="/app-reloj#instalar" className="inline-block mt-3 text-violet-300 text-sm underline">
          Cómo instalar una esfera
        </Link>
      </div>
    </div>
  )
}
