'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ListEnd, ListStart, ListPlus, Loader2 } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import { useMusicStore } from '@/store/musicStore'

// «Agregar a la cola»: escuchar a continuación o más tarde (al final). Sirve para una canción o
// un álbum completo (las canciones se pueden pedir recién al elegir: `load`).
export default function QueueMenu({
  tracks,
  load,
  label = 'Agregar a la cola',
  className = '',
  overlay = false,
}: {
  tracks?: MusicVideo[]
  load?: () => Promise<MusicVideo[]>
  label?: string
  className?: string
  /** Sobre una carátula (fondo oscuro translúcido) */
  overlay?: boolean
}) {
  const [open, setOpen] = useState(false)
  // Posición del menú (fijo en la pantalla: así no lo recorta la tarjeta que lo contiene)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)
    }
    const y0 = window.scrollY
    const hide = () => Math.abs(window.scrollY - y0) > 40 && setOpen(false)
    document.addEventListener('pointerdown', close, true)
    window.addEventListener('scroll', hide, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      window.removeEventListener('scroll', hide, true)
    }
  }, [open])

  const run = async (next: boolean) => {
    setOpen(false)
    setBusy(true)
    const list = tracks?.length ? tracks : load ? await load().catch(() => []) : []
    setBusy(false)
    const n = useMusicStore.getState().enqueue(list, next)
    setNotice(n ? (next ? `Suena a continuación${n > 1 ? ` (${n})` : ''}` : `Agregada${n > 1 ? `s ${n}` : ''} al final de la cola`) : 'No se pudo agregar')
    setTimeout(() => setNotice(null), 2200)
  }

  return (
    <div ref={box} className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const below = r.bottom + 100 < window.innerHeight
          setPos({ top: below ? r.bottom + 4 : r.top - 96, left: Math.max(8, Math.min(window.innerWidth - 232, r.right - 224)) })
          setOpen((o) => !o)
        }}
        className={
          overlay
            ? 'w-8 h-8 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white hover:text-violet-300'
            : 'w-9 h-9 rounded-full border border-white/10 text-slate-300 hover:text-white flex items-center justify-center'
        }
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListEnd className="w-4 h-4" />}
      </button>
      {open && pos && createPortal(
        <div ref={menu} role="menu" onClick={(e) => e.stopPropagation()} style={{ top: pos.top, left: pos.left }} className="fixed z-[70] w-56 rounded-xl bg-surface-2 border border-white/10 shadow-2xl py-1 text-sm">
          <button role="menuitem" onClick={(e) => (e.preventDefault(), run(true))} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-white hover:bg-white/5">
            <ListStart className="w-4 h-4 text-violet-300" /> Reproducir a continuación
          </button>
          <button role="menuitem" onClick={(e) => (e.preventDefault(), run(false))} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-white hover:bg-white/5">
            <ListPlus className="w-4 h-4 text-violet-300" /> Agregar al final de la cola
          </button>
        </div>,
        document.body
      )}
      {notice && createPortal(
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-[60] rounded-full bg-violet-600 text-white text-sm font-semibold px-4 py-2 shadow-xl whitespace-nowrap" role="status">
          {notice}
        </div>,
        document.body
      )}
    </div>
  )
}
