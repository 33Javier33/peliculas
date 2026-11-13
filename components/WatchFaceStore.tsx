'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, LayoutGrid, List } from 'lucide-react'
import { WATCH_FACES, type WatchFace } from '@/lib/watchfaces'
import InstallOnWatchButton from '@/components/InstallOnWatchButton'

type View = 'grid' | 'list'
const KEY = 'cpn-esferas-vista'

const isNew = (f: WatchFace) => Date.now() - new Date(f.added).getTime() < 14 * 86400000

function DownloadLink({ f, compact = false }: { f: WatchFace; compact?: boolean }) {
  return (
    <a
      href={`/api/apk?f=esfera&id=${f.id}`}
      className={`flex items-center justify-center gap-1.5 rounded-full bg-violet-500 text-white font-bold active:scale-[0.97] transition-transform ${
        compact ? 'px-3 py-2 text-xs' : 'w-full py-2.5 text-sm'
      }`}
      aria-label={`Descargar la esfera ${f.name}`}
    >
      <Download className="w-4 h-4" /> Descargar
    </a>
  )
}

function Preview({ f, size }: { f: WatchFace; size: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/esferas/${f.id}.webp`} alt={`Esfera ${f.name}`} loading="lazy" className={`${size} rounded-full object-cover bg-black shadow-lg`} />
  )
}

// Tienda de esferas: vista en mosaico o en lista, cada una con su descarga
export default function WatchFaceStore() {
  const [view, setView] = useState<View>('grid')
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY)
      if (v === 'grid' || v === 'list') setView(v)
    } catch {}
    // Las esferas se publican junto a la app (mismo número que PulsoMedia)
    fetch('/api/apk/version')
      .then((r) => r.json())
      .then((d: { version?: string | null }) => setVersion(d.version ?? null))
      .catch(() => {})
  }, [])

  const choose = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(KEY, v)
    } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-slate-400 text-sm">
          {WATCH_FACES.length} esferas{version ? ` · versión ${version}` : ''}
        </p>
        <div className="flex rounded-full bg-surface-1 border border-white/8 p-1" role="group" aria-label="Vista">
          {(
            [
              ['grid', LayoutGrid, 'Mosaico'],
              ['list', List, 'Lista'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => choose(v)}
              aria-pressed={view === v}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === v ? 'bg-white text-black' : 'text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'grid' ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {WATCH_FACES.map((f) => (
            <div key={f.id} className="rounded-2xl bg-surface-1 border border-white/8 p-3 flex flex-col items-center text-center">
              <div className="relative">
                <Preview f={f} size="w-full max-w-[9rem] aspect-square" />
                {isNew(f) && <span className="absolute -top-1 -right-1 rounded-full bg-amber-400 text-black text-[10px] font-bold px-2 py-0.5">Nueva</span>}
              </div>
              <p className="mt-2 text-white font-semibold text-sm">{f.name}</p>
              <p className="text-slate-500 text-[11px] leading-tight mt-0.5 line-clamp-2">{f.features.join(' · ')}</p>
              <div className="mt-3 w-full space-y-2">
                <InstallOnWatchButton file={f.file} />
                <DownloadLink f={f} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {WATCH_FACES.map((f) => (
            <li key={f.id} className="rounded-2xl bg-surface-1 border border-white/8 p-3 flex gap-3">
              <Preview f={f} size="w-20 h-20 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm flex items-center gap-2">
                  {f.name}
                  {isNew(f) && <span className="rounded-full bg-amber-400 text-black text-[10px] font-bold px-2 py-0.5">Nueva</span>}
                </p>
                <p className="text-slate-400 text-xs mt-1">{f.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <InstallOnWatchButton file={f.file} compact />
                  <DownloadLink f={f} compact />
                  <span className="text-slate-500 text-[11px]">{f.file}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 rounded-2xl bg-surface-1/60 border border-white/8 p-4 text-sm text-slate-400 space-y-2">
        <p>
          <b className="text-white">Instalar en el reloj (desde la app):</b> el teléfono la descarga y se la pasa al reloj; en el reloj
          confirmas la instalación. Necesita la app del reloj de PulsoMedia o PulsoMusic (según la app que uses) ya instalada en el reloj; la
          primera vez el reloj pide permitir que instale apps.
        </p>
        <p>
          <b className="text-white">Cómo instalar una esfera:</b> igual que la app del reloj (con Wear Installer 2), eligiendo el archivo de
          la esfera. <Link href="/app-reloj#instalar" className="text-violet-300 underline">Ver los pasos</Link>.
        </p>
        <p>
          <b className="text-white">Para ponerla:</b> mantén presionada la esfera actual del reloj y desliza hasta la nueva (o «Añadir
          esfera»). Para elegir los datos de sus círculos (clima, ritmo cardíaco, pasos…): mantenla presionada → <b>Personalizar</b>.
        </p>
        <p>
          <b className="text-white">Accesos a PulsoMedia y PulsoMusic:</b> todas las esferas traen íconos que, al tocarlos, abren la app
          del reloj de PulsoMedia o de PulsoMusic (instálalas desde <Link href="/app-reloj" className="text-violet-300 underline">App para el reloj</Link>).
          En Personalizar eliges qué abre cada ícono: PulsoMedia, PulsoMusic, alarmas, temporizador, ajustes o nada.
        </p>
        <p>La hora, la fecha y la batería funcionan solas en el reloj, sin el teléfono.</p>
      </div>
    </div>
  )
}
