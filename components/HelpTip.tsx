'use client'

import { useEffect, useRef, useState } from 'react'

// Ayuda discreta: un «?» chiquito al lado de lo que conviene explicar. Al tocarlo aparece una
// explicación corta (se cierra tocando fuera). Se pueden ocultar todas en Configuración.
const KEY = 'cpn-help-tips'

export function helpTipsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function setHelpTips(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {}
  window.dispatchEvent(new Event(KEY))
}

export function useHelpTips(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const read = () => setOn(helpTipsOn())
    read()
    window.addEventListener(KEY, read)
    return () => window.removeEventListener(KEY, read)
  }, [])
  return on
}

export default function HelpTip({ text, title, className = '' }: { text: string; title?: string; className?: string }) {
  const on = useHelpTips()
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!pos) return
    const close = (e: Event) => {
      const t = e.target as Node
      if (box.current?.contains(t) || btn.current?.contains(t)) return
      setPos(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null)
    document.addEventListener('pointerdown', close, true)
    window.addEventListener('scroll', close, true)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', esc)
    }
  }, [pos])

  if (!on) return null
  const toggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (pos) return setPos(null)
    const r = btn.current!.getBoundingClientRect()
    const w = Math.min(280, window.innerWidth - 24)
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12))
    const up = r.bottom > window.innerHeight - 180
    setPos({ top: up ? r.top - 8 : r.bottom + 8, left, up })
  }
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        className={`inline-flex shrink-0 items-center justify-center w-4 h-4 rounded-full border border-slate-500/60 text-slate-400 hover:text-white hover:border-white/70 text-[10px] font-bold leading-none align-middle ${className}`}
        aria-label={`Ayuda: ${title ?? text.slice(0, 40)}`}
        aria-expanded={!!pos}
      >
        ?
      </button>
      {pos && (
        <span
          ref={box}
          role="tooltip"
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: Math.min(280, window.innerWidth - 24), transform: pos.up ? 'translateY(-100%)' : undefined }}
          className="block z-[200] rounded-xl bg-surface-2 border border-white/15 shadow-2xl shadow-black/60 px-3.5 py-3 text-left normal-case tracking-normal"
        >
          {title && <span className="block text-white text-xs font-bold mb-1">{title}</span>}
          <span className="block text-slate-300 text-xs leading-relaxed font-normal">{text}</span>
        </span>
      )}
    </>
  )
}
