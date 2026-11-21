'use client'

import { useEffect, useState } from 'react'
import { getNative } from '@/lib/native'

// Versiones publicadas de las esferas (esferas.json del release) y lo instalado en el reloj
// (lo manda la app del reloj al conectarse: { paquete: versión }). Solo dentro de la app de Android
// se sabe qué tiene el reloj.

export type PublishedFace = { file: string; name: string; package: string; version: number; size?: number }

let published: Promise<PublishedFace[]> | null = null

export function publishedFaces(): Promise<PublishedFace[]> {
  if (!published) {
    published = fetch('/api/apk/version?f=esferas')
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? (d as PublishedFace[]) : []))
      .catch(() => [])
  }
  return published
}

type Installed = Record<string, number>

function readInstalled(): Installed | null {
  try {
    const raw = (getNative() as { wearInfo?: () => string } | null)?.wearInfo?.()
    if (!raw) return null
    const o = JSON.parse(raw) as { installed?: Installed }
    return o.installed ?? {}
  } catch {
    return null
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __cpnWatchInstalled?: (o: Installed) => void }).__cpnWatchInstalled = (o) =>
    window.dispatchEvent(new CustomEvent<Installed>('cpn-watch-installed', { detail: o }))
}

/** Versión para mostrar de una esfera: «2.N» */
export const faceLabel = (v: number) => `2.${Math.max(0, v - 1000)}`

/** Lo instalado en el reloj (null: fuera de la app o el reloj aún no lo informó) */
export function useWatchInstalled(): Installed | null {
  const [inst, setInst] = useState<Installed | null>(null)
  useEffect(() => {
    setInst(readInstalled())
    const on = (e: Event) => setInst((e as CustomEvent<Installed>).detail)
    window.addEventListener('cpn-watch-installed', on)
    return () => window.removeEventListener('cpn-watch-installed', on)
  }, [])
  return inst
}

export function usePublishedFaces(): PublishedFace[] | null {
  const [list, setList] = useState<PublishedFace[] | null>(null)
  useEffect(() => {
    publishedFaces().then(setList)
  }, [])
  return list
}
