'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { getNative } from '@/lib/native'

// Botón de descarga del APK. Dentro de la app: las versiones nuevas la descargan e instalan
// ellas mismas; las anteriores (que no saben descargar) la abren en el navegador del teléfono.
const GITHUB = 'https://github.com/33Javier33/peliculas/releases/download/android-latest/CarlosPNauto.apk'

export default function DownloadApkButton() {
  const [oldApp, setOldApp] = useState(false)
  useEffect(() => {
    const n = getNative() as (ReturnType<typeof getNative> & { canDownload?: () => boolean }) | null
    setOldApp(!!n && !n.canDownload)
  }, [])
  return (
    <>
      <a
        href={oldApp ? GITHUB : '/api/apk'}
        download={oldApp ? undefined : 'CarlosPNauto.apk'}
        className="mt-6 flex items-center justify-center gap-2 w-full rounded-full bg-violet-500 text-white font-bold py-4 shadow-glow"
      >
        <Download className="w-5 h-5" /> Descargar la app (5 MB)
      </a>
      {oldApp && (
        <p className="text-slate-400 text-xs mt-2 text-center">
          Se abrirá el navegador del teléfono para descargarla. Después abre el archivo desde la notificación e instálalo encima.
        </p>
      )}
    </>
  )
}
