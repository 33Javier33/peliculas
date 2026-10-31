import type { Metadata } from 'next'
import { Download, ShieldCheck, Smartphone } from 'lucide-react'

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

        <a
          href="/api/apk"
          download="CarlosPNauto.apk"
          className="mt-6 flex items-center justify-center gap-2 w-full rounded-full bg-violet-500 text-white font-bold py-4 shadow-glow"
        >
          <Download className="w-5 h-5" /> Descargar la app (5 MB)
        </a>

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
