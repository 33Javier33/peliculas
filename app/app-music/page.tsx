import Link from 'next/link'
import type { Metadata } from 'next'
import { ShieldCheck, Music2 } from 'lucide-react'
import DownloadApkButton from '@/components/DownloadApkButton'
import ShareAppButton from '@/components/ShareAppButton'

export const metadata: Metadata = {
  title: 'PulsoMusic para Android',
  description: 'Descarga PulsoMusic: música, radios y videos musicales con la pantalla bloqueada, descargas, ecualizador y la TV.',
}

// Descarga de PulsoMusic (lo que se comparte desde PulsoMusic: solo esta app, sin confundir)
export default function MusicAppPage() {
  return (
    <div className="pt-20 bg-obsidian pb-8">
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="flex items-center gap-2 text-3xl font-black font-display">
          <Music2 className="w-8 h-8 text-fuchsia-300" />
          <span>
            <span className="text-cyan-300">Pulso</span>
            <span className="text-white">Music</span>
          </span>
        </h1>
        <p className="text-slate-300 text-sm mt-2">
          Música, radios y videos musicales. Suena con la pantalla bloqueada, descarga para escuchar sin internet, ecualizador, letras,
          video de cada canción y transmisión a la TV.
        </p>

        <DownloadApkButton app="music" />
        <div className="mt-3">
          <ShareAppButton label="Compartir PulsoMusic" />
        </div>
        <Link href="/app-reloj#pulsomusic" className="mt-3 inline-flex items-center gap-1.5 text-fuchsia-200 text-sm font-semibold">
          ⌚ ¿Tienes reloj con Wear OS? Instala el reloj de PulsoMusic →
        </Link>

        <ol className="mt-8 space-y-3 text-slate-300 text-sm list-decimal pl-5">
          <li>Toca <b>Descargar la app</b>. Si el navegador avisa que el archivo puede ser dañino, elige <b>Descargar de todos modos</b>.</li>
          <li>Abre el archivo <b>PulsoMusic.apk</b> (en la notificación o en <i>Archivos → Descargas</i>).</li>
          <li>Si Android lo pide, permite <b>instalar apps desconocidas</b> y vuelve atrás.</li>
          <li>
            Toca <b>Instalar</b>. Si aparece Play Protect, toca <b>Más detalles → Instalar de todos modos</b> (no viene de Google Play,
            por eso no la reconoce).
          </li>
          <li>Ábrela y acepta los permisos de notificaciones y de música.</li>
        </ol>
        <p className="mt-6 flex items-start gap-2 text-slate-500 text-xs">
          <ShieldCheck className="w-4 h-4 shrink-0" /> Las versiones nuevas se instalan encima de la anterior, sin perder nada.
        </p>
      </div>
    </div>
  )
}
