'use client'
import { isMusicApp } from '@/lib/app-flavor'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, X, Smartphone } from 'lucide-react'
import { getNative } from '@/lib/native'

// Avisos de la app de Android:
// - Dentro de la app: si hay un APK más nuevo, avisa y lleva a la página para actualizarlo.
// - En la página web desde un Android: invita (una vez) a instalar la app.
// Se pueden cerrar; el aviso de actualización vuelve solo cuando sale otra versión.

const build = (v: string | null | undefined) => Number(String(v ?? '').split('.').pop()) || 0

type History = { build: number; date?: string; changes?: string[] }[]

/** Todo lo nuevo desde la versión instalada (sin repetir), de lo más nuevo a lo más viejo */
function changesSince(installedBuild: number, history?: History, fallback?: string[]): string[] {
  const out: string[] = []
  for (const h of history ?? []) if (h.build > installedBuild) for (const c of h.changes ?? []) if (!out.includes(c)) out.push(c)
  return out.length ? out : (fallback ?? [])
}

export default function AppUpdateBanner() {
  const [notice, setNotice] = useState<{ kind: 'update' | 'install'; latest?: string; notes?: string; changes?: string[] } | null>(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    const native = getNative()
    const isAndroid = /Android/i.test(navigator.userAgent)
    if (!native && !isAndroid) return
    const read = (k: string) => {
      try {
        return localStorage.getItem(k)
      } catch {
        return null
      }
    }
    let cancelled = false
    fetch(`/api/apk/version${isMusicApp() ? '?app=music' : ''}`)
      .then((r) => r.json())
      .then((d: { version?: string | null; notes?: string; changes?: string[]; history?: History }) => {
        if (cancelled || !d.version) return
        if (native) {
          let installed = ''
          try {
            installed = native.version()
          } catch {}
          // (PulsoMusic numera sus versiones 53 compilaciones más abajo)
          const installedBuild = build(installed) + (isMusicApp() ? 53 : 0)
          if (build(d.version) > build(installed) && read('cpn-update-dismissed') !== d.version)
            setNotice({ kind: 'update', latest: d.version, notes: d.notes, changes: changesSince(installedBuild, d.history, d.changes) })
        } else if (!read('cpn-install-dismissed')) {
          setNotice({ kind: 'install', latest: d.version })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!notice) return null
  const close = () => {
    try {
      if (notice.kind === 'update') localStorage.setItem('cpn-update-dismissed', notice.latest ?? '')
      else localStorage.setItem('cpn-install-dismissed', '1')
    } catch {}
    setNotice(null)
  }

  return (
    <div className="fixed top-[72px] inset-x-0 z-[60] px-3 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md flex items-start gap-3 rounded-2xl bg-surface-1/[0.98] border border-violet-400/30 shadow-2xl shadow-black/60 p-3">
        <span className="w-9 h-9 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center shrink-0">
          {notice.kind === 'update' ? <Download className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">
          {notice.kind === 'update' ? (
            <>
              <p className="text-white text-sm font-semibold">Hay una versión nueva de la app ({notice.latest})</p>
              {notice.changes?.length ? (
                <div className="mt-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-violet-300">Qué trae</p>
                  <ul className={`mt-1 space-y-1 text-xs text-slate-300 ${all ? 'max-h-48 overflow-y-auto pr-1' : ''}`}>
                    {(all ? notice.changes : notice.changes.slice(0, 3)).map((c) => (
                      <li key={c} className="flex gap-1.5 leading-snug">
                        <span className="text-violet-300 shrink-0">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                  {notice.changes.length > 3 && (
                    <button onClick={() => setAll(!all)} className="mt-1 text-[11px] font-semibold text-violet-300">
                      {all ? 'Ver menos' : `Ver todas las novedades (${notice.changes.length})`}
                    </button>
                  )}
                </div>
              ) : (
                notice.notes && <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{notice.notes}</p>
              )}
              <p className="text-slate-500 text-xs mt-1">Se instala encima de la que tienes: no pierdes nada.</p>
            </>
          ) : (
            <>
              <p className="text-white text-sm font-semibold">Instala la app para Android</p>
              <p className="text-slate-400 text-xs mt-0.5">La música sigue sonando con la pantalla bloqueada y con controles en la notificación.</p>
            </>
          )}
          <Link href="/app-android" onClick={close} className="inline-flex items-center gap-1.5 mt-2 px-3.5 py-1.5 rounded-full bg-violet-500 text-white text-xs font-semibold">
            <Download className="w-3.5 h-3.5" /> {notice.kind === 'update' ? 'Actualizar' : 'Ver cómo instalarla'}
          </Link>
        </div>
        <button onClick={close} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white shrink-0" aria-label="Cerrar aviso">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
