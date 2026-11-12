import Link from 'next/link'
import type { Metadata } from 'next'
import WatchVersionStatus from '@/components/WatchVersionStatus'
import { Watch, Download, Smartphone, Wifi, Music2, Compass } from 'lucide-react'

export const metadata: Metadata = {
  title: 'App para el reloj (Wear OS)',
  description: 'Controla tu música desde el reloj: biblioteca, playlists, radios y NTS en Wear OS (TicWatch, Galaxy Watch y otros).',
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full bg-violet-500 text-white text-sm font-bold flex items-center justify-center">{n}</span>
      <div className="min-w-0">
        <p className="text-white font-semibold text-sm">{title}</p>
        <div className="text-slate-400 text-sm mt-1 space-y-1">{children}</div>
      </div>
    </li>
  )
}

// Página para instalar la app del reloj (Wear OS)
export default function WatchAppPage() {
  return (
    <div className="pt-20 bg-obsidian pb-8">
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white font-display">
          <Watch className="w-7 h-7 text-violet-300" /> App para el reloj
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          Elige qué suena sin sacar el teléfono: tu biblioteca en aleatorio, tus canciones y playlists, las radios de Internet Archive, NTS
          y tus radios favoritas. Con carátula, avance, ♥ Me gusta y el volumen (botones − y +, el bisel o la corona).
        </p>
        <p className="text-slate-500 text-xs mt-2">
          Para relojes con Wear OS 3 o más nuevo: TicWatch Pro 3 y Pro 5, Galaxy Watch 4, 5, 6 y 7, Pixel Watch y otros. Necesita la app
          de Android 1.0.28 o más nueva en el teléfono.
        </p>

        <a
          href="/api/apk?f=reloj"
          className="mt-6 flex items-center justify-center gap-2 w-full rounded-full bg-violet-500 text-white font-bold py-3 text-sm shadow-glow active:scale-[0.97] transition-transform"
        >
          <Download className="w-5 h-5" /> Descargar la app del reloj
        </a>
        <WatchVersionStatus flavor="media" />
        {/* Cada app tiene su reloj: el de PulsoMusic solo funciona con PulsoMusic en el teléfono */}
        <div id="pulsomusic" className="mt-4 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-400/30 p-4 scroll-mt-24">
          <p className="text-white font-semibold text-sm">¿Usas PulsoMusic en el teléfono?</p>
          <p className="text-slate-400 text-xs mt-1">Instala el reloj de PulsoMusic (archivo <b>PulsoMusic-Reloj.apk</b>, mismos pasos de abajo). Cada reloj trabaja con su app.</p>
          <a
            href="/api/apk?f=reloj&app=music"
            className="mt-3 flex items-center justify-center gap-2 w-full rounded-full bg-fuchsia-500 text-white font-bold py-3 text-sm active:scale-[0.97] transition-transform"
          >
            <Download className="w-5 h-5" /> Descargar el reloj de PulsoMusic
          </a>
          <WatchVersionStatus flavor="music" />
        </div>

        {/* Esfera de reloj: funciona sola, con cualquiera de las dos apps */}
        <div id="esfera" className="mt-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 p-4 scroll-mt-24">
          <p className="flex items-center gap-2 text-white font-semibold text-sm">
            <Compass className="w-4 h-4 text-amber-300" /> Esfera Explorer (nueva)
          </p>
          <p className="text-slate-400 text-xs mt-1">
            Esfera para TicWatch y Galaxy Watch 4 Classic: mapa topográfico, altitud (barómetro), fecha y un círculo con el dato que
            elijas (clima, batería, pasos…). <b>Brújula:</b> toca el bisel (el anillo de N, NE, E…) y gira para que la N apunte al
            norte; tócalo otra vez para dejarlo fijo. Archivo <b>Esfera-Explorer.apk</b>, se instala con los mismos pasos de abajo.
          </p>
          <a
            href="/api/apk?f=esfera"
            className="mt-3 flex items-center justify-center gap-2 w-full rounded-full bg-amber-500 text-black font-bold py-3 text-sm active:scale-[0.97] transition-transform"
          >
            <Download className="w-5 h-5" /> Descargar la esfera Explorer
          </a>
          <p className="text-slate-500 text-xs mt-2">
            Para ponerla: mantén presionada la esfera actual del reloj → desliza hasta <b>Explorer</b> (o «Añadir esfera»). Para elegir el
            dato del círculo derecho o la brújula: mantenla presionada → <b>Personalizar</b> (engranaje).
          </p>
        </div>

        <h2 className="mt-10 text-lg font-bold text-white font-display">Cómo instalarla</h2>
        <p className="text-slate-400 text-xs mt-1">
          Wear OS no instala archivos tocándolos en el teléfono: se pasan una vez con una app de instalación. Son unos minutos.
        </p>
        <ol className="mt-5 space-y-5">
          <Step n={1} title="Activa las opciones de desarrollador del reloj">
            <p>
              <b>TicWatch:</b> Ajustes → Sistema → Información → toca <b>Número de compilación</b> 7 veces.
            </p>
            <p>
              <b>Galaxy Watch:</b> Ajustes → Información del reloj → Información de software → toca <b>Versión de software</b> 5 veces.
            </p>
          </Step>
          <Step n={2} title="Activa la depuración por Wi-Fi">
            <p>
              En el reloj: Ajustes → <b>Opciones de desarrollador</b> → activa <b>Depuración ADB</b> y <b>Depuración inalámbrica</b>.
              El reloj y el teléfono tienen que estar en el <b>mismo Wi-Fi</b>.
            </p>
          </Step>
          <Step n={3} title="Instala en el teléfono una app para pasar apps al reloj">
            <p>
              Desde Google Play: <b>Wear Installer 2</b> (o <b>Bugjaeger</b>). Toca arriba <b>Descargar la app del reloj</b> para tener el
              archivo <b>CarlosPNauto-Reloj.apk</b>.
            </p>
          </Step>
          <Step n={4} title="Conecta el teléfono con el reloj">
            <p>
              En el reloj, dentro de Depuración inalámbrica, toca <b>Vincular dispositivo nuevo</b>: muestra una dirección (IP y puerto) y
              un código. Escríbelos en Wear Installer 2 cuando los pida.
            </p>
          </Step>
          <Step n={5} title="Instala la app">
            <p>
              En Wear Installer 2 elige el archivo <b>CarlosPNauto-Reloj.apk</b> (en Descargas) y toca instalar. Si el reloj pregunta
              «¿Permitir depuración?», toca <b>Permitir</b>.
            </p>
          </Step>
          <Step n={6} title="Listo">
            <p>
              Abre <b>PulsoMedia</b> en el reloj. Con la app abierta en el teléfono (o sonando en segundo plano), toca{' '}
              <Music2 className="inline w-4 h-4" /> para elegir qué escuchar. Puedes apagar la depuración después.
            </p>
          </Step>
        </ol>

        <div className="mt-10 rounded-2xl bg-surface-1 border border-white/8 p-4 text-sm text-slate-400 space-y-2">
          <p className="flex items-start gap-2">
            <Smartphone className="w-4 h-4 shrink-0 mt-0.5 text-violet-300" />
            Si la app del teléfono está cerrada, el reloj lo avisa y con <b>Abrir en el teléfono</b> la abre.
          </p>
          <p className="flex items-start gap-2">
            <Wifi className="w-4 h-4 shrink-0 mt-0.5 text-violet-300" />
            Actualizaciones: se instalan igual (pasos 4 y 5), encima de la anterior.
          </p>
          <p className="flex items-start gap-2">
            <Watch className="w-4 h-4 shrink-0 mt-0.5 text-violet-300" />
            <span>
              Al sonar música aparece el ícono de la app en la esfera (permite las notificaciones la primera vez que abras la app del reloj):
              al tocarlo se abre la app del reloj. Si además aparecen los controles multimedia del sistema, puedes apagarlos en el reloj:
              Ajustes → General (o Aplicaciones) → <b>Iniciar controles multimedia automáticamente</b>.
            </span>
          </p>
        </div>

        <Link href="/app-android" className="inline-block mt-6 text-violet-300 text-sm underline">
          App para el teléfono (Android)
        </Link>
      </div>
    </div>
  )
}
