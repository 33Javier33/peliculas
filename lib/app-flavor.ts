'use client'
// ¿Qué app es? PulsoMedia (completa: películas, videos, TV, música) o PulsoMusic (solo música,
// radios y videos musicales). En el navegador (sin app) es la completa.
import { useEffect, useState } from 'react'
import { getNative } from '@/lib/native'

export type AppFlavor = 'media' | 'music'

export function appFlavor(): AppFlavor {
  if (typeof window === 'undefined') return 'media'
  try {
    const f = (getNative() as unknown as { flavor?: () => string } | null)?.flavor?.()
    if (f === 'music') return 'music'
  } catch {}
  return /CPNFlavor\/music/.test(navigator.userAgent) ? 'music' : 'media'
}

export const isMusicApp = () => appFlavor() === 'music'

/** Parámetro para las descargas y la versión de la app (?app=music en PulsoMusic) */
export const apkQuery = (flavor: AppFlavor = appFlavor()) => (flavor === 'music' ? 'app=music' : '')


/** La app que es (después de dibujar: en el servidor siempre «media») */
export function useAppFlavor(): AppFlavor {
  const [f, setF] = useState<AppFlavor>('media')
  useEffect(() => setF(appFlavor()), [])
  return f
}

/** Nombre de la app (para los textos de carpetas y respaldo) */
export const brandName = (f: AppFlavor) => (f === 'music' ? 'PulsoMusic' : 'PulsoMedia')

/** Nombre de la app en uso (para los textos al compartir) */
export const appBrand = () => brandName(appFlavor())

/** Enlace compartido desde PulsoMusic: lleva ?app=music (así se abre y se descarga PulsoMusic) */
export function withAppParam(url: string): string {
  if (!isMusicApp()) return url
  return url + (url.includes('?') ? '&' : '?') + 'app=music'
}
