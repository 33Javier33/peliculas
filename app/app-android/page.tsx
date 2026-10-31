import type { Metadata } from 'next'
import { ShieldCheck, Smartphone, RefreshCw } from 'lucide-react'
import ApkVersionInfo from '@/components/ApkVersionInfo'
import DownloadApkButton from '@/components/DownloadApkButton'

export const metadata: Metadata = { title: 'App para Android', robots: { index: false } }

// Página para instalar la app de Android (APK)
export default function AndroidAppPage() {
  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white font-display">
          <Smartphone className="w-7 h-7 text-violet-300" /> App para Android
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          La música sigue sonando con el teléfono bloqueado y en otras apps, con controles en la notificación.
        </p>

        <ApkVersionInfo />

        <DownloadApkButton />

        <ol className="mt-8 space-y-3 text-slate-300 text-sm list-decimal pl-5">
          <li>Toca <b>Descargar la app</b>. Si el navegador avisa que el archivo puede ser dañino, elige <b>Descargar de todos modos</b>.</li>
          <li>Abre el archivo <b>CarlosPNauto.apk</b> (en la notificación o en la app <i>Archivos → Descargas</i>).</li>
          <li>Si Android lo pide, permite <b>instalar apps desconocidas</b> para ese navegador o para Archivos, y vuelve atrás.</li>
          <li>
            Toca <b>Instalar</b>. Si aparece Play Protect, toca <b>Más detalles → Instalar de todos modos</b> (es tu app, solo que no viene
            de Google Play).
          </li>
          <li>Ábrela y acepta los permisos de notificaciones.</li>
        </ol>

        <h2 className="mt-10 flex items-center gap-2 text-lg font-bold text-white font-display">
          <RefreshCw className="w-5 h-5 text-violet-300" /> Cómo actualizar la app
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Cuando hay una versión nueva, la app te avisa arriba con <b>Actualizar</b>. Las mejoras de la página llegan solas; solo hay que
          instalar un APK nuevo cuando cambia algo del teléfono (audio, notificaciones, pantalla bloqueada).
        </p>
        <ol className="mt-4 space-y-3 text-slate-300 text-sm list-decimal pl-5">
          <li>
            Toca <b>Descargar la app</b> aquí arriba (siempre es la última versión).
          </li>
          <li>
            Dentro de la app, al terminar la descarga se abre solo el instalador (la primera vez Android pide <b>permitir instalar desde
            esta app</b>). En el navegador, abre el archivo descargado. Toca <b>Actualizar</b> (o <b>Instalar</b>). <b>No desinstales la anterior</b>: la nueva se instala
            encima y conservas tus canciones guardadas, playlists, artistas seguidos y discos.
          </li>
          <li>
            Para ver qué versión tienes: mantén presionado el ícono de la app → <b>Información de la app</b> (abajo dice la versión), o
            entra a esta página desde la app.
          </li>
          <li>
            Si Android dice <b>&quot;conflicto con un paquete&quot;</b> (solo pasa con versiones anteriores a la 1.0.8), desinstala la vieja
            una única vez y luego instala la nueva.
          </li>
        </ol>

        <p className="mt-6 flex items-start gap-2 text-slate-500 text-xs">
          <ShieldCheck className="w-4 h-4 shrink-0" /> Las versiones nuevas se instalan encima de la anterior, sin perder nada.
        </p>
        <p className="mt-3 text-slate-500 text-xs">
          ¿Tienes iPhone?{' '}
          <a href="/app-iphone" className="text-violet-300 underline">
            Instálala desde Safari
          </a>
          .
        </p>
      </div>
    </div>
  )
}
