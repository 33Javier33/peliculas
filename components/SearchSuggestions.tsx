'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Search, ArrowUpLeft, X } from 'lucide-react'

export type SuggestKind = 'music' | 'video' | 'movies' | 'radio'

interface Options {
  kind: SuggestKind
  /** Texto actual del buscador */
  value: string
  /** Cambia el texto (flecha ↖: completar sin buscar) */
  onChange: (value: string) => void
  /** Se elige una sugerencia o búsqueda reciente: buscar */
  onPick: (value: string) => void
  /** Sugerencias locales extra (p. ej. ciudades), filtradas por lo escrito */
  extra?: string[]
  /** onKeyDown propio del input, se sigue llamando */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** false: sin desplegable (p. ej. donde el filtro ya es instantáneo) */
  enabled?: boolean
}

const cache = new Map<string, string[]>()
const RECENT_MAX = 6
const recentKey = (kind: SuggestKind) => `cpn-recent-searches-${kind}`

function readRecent(kind: SuggestKind): string[] {
  try {
    return JSON.parse(localStorage.getItem(recentKey(kind)) || '[]')
  } catch {
    return []
  }
}

/** Guarda una búsqueda en "recientes" (también cuando se busca con Enter). */
export function rememberSearch(kind: SuggestKind, q: string) {
  const query = q.trim()
  if (!query) return
  try {
    const list = [query, ...readRecent(kind).filter((r) => r.toLowerCase() !== query.toLowerCase())].slice(0, RECENT_MAX)
    localStorage.setItem(recentKey(kind), JSON.stringify(list))
  } catch {}
}

/**
 * Sugerencias mientras se escribe, como en los buscadores: búsquedas recientes con el
 * campo vacío y autocompletado al escribir. Devuelve props para el <input> y el desplegable.
 */
export function useSearchSuggestions({ kind, value, onChange, onPick, extra, onKeyDown, enabled = true }: Options) {
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [active, setActive] = useState(-1)
  const requestId = useRef(0)
  const q = value.trim()

  // Autocompletado con una pequeña espera para no consultar en cada tecla
  useEffect(() => {
    if (!open || q.length < 2) {
      setRemote([])
      return
    }
    const key = `${kind}:${q.toLowerCase()}`
    if (cache.has(key)) {
      setRemote(cache.get(key)!)
      return
    }
    const id = ++requestId.current
    const timer = setTimeout(() => {
      fetch(`/api/suggest?kind=${kind}&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((d: { suggestions?: string[] }) => {
          cache.set(key, d.suggestions ?? [])
          if (id === requestId.current) setRemote(d.suggestions ?? [])
        })
        .catch(() => {})
    }, 180)
    return () => clearTimeout(timer)
  }, [q, kind, open])

  const items = useMemo(() => {
    const lower = q.toLowerCase()
    if (!q) return recent.map((text) => ({ text, recent: true }))
    const matchingRecent = recent.filter((r) => r.toLowerCase().startsWith(lower) && r.toLowerCase() !== lower)
    const local = (extra ?? []).filter((e) => e.toLowerCase().includes(lower))
    const seen = new Set<string>()
    return [
      ...matchingRecent.map((text) => ({ text, recent: true })),
      ...[...local, ...remote].map((text) => ({ text, recent: false })),
    ]
      .filter((i) => i.text.toLowerCase() !== lower && !seen.has(i.text.toLowerCase()) && seen.add(i.text.toLowerCase()))
      .slice(0, 8)
  }, [q, recent, remote, extra])

  useEffect(() => setActive(-1), [items])

  const pick = useCallback(
    (text: string) => {
      setOpen(false)
      rememberSearch(kind, text)
      onPick(text)
    },
    [kind, onPick]
  )

  const removeRecent = (text: string) => {
    const list = readRecent(kind).filter((r) => r !== text)
    try {
      localStorage.setItem(recentKey(kind), JSON.stringify(list))
    } catch {}
    setRecent(list)
  }

  const inputProps = {
    onFocus: () => {
      setRecent(readRecent(kind))
      setOpen(true)
    },
    onBlur: () => setOpen(false),
    onInput: () => setOpen(true),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (open && items.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length))
        return
      }
      if (e.key === 'Enter') {
        if (open && active >= 0 && items[active]) {
          e.preventDefault()
          pick(items[active].text)
          return
        }
        rememberSearch(kind, value)
        setOpen(false)
      }
      if (e.key === 'Escape') setOpen(false)
      onKeyDown?.(e)
    },
    role: 'combobox',
    'aria-expanded': open && items.length > 0,
    'aria-autocomplete': 'list' as const,
    autoComplete: 'off',
  }

  const dropdown =
    enabled && open && items.length > 0 ? (
      <ul
        role="listbox"
        className="absolute left-0 right-0 top-full mt-2 z-[60] bg-surface-1 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/60 py-1.5 overflow-hidden text-left"
        // Evita que el input pierda el foco antes del toque
        onMouseDown={(e) => e.preventDefault()}
      >
        {!q && (
          <li className="px-4 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 font-display">
            Búsquedas recientes
          </li>
        )}
        {items.map((item, idx) => {
          const lower = item.text.toLowerCase()
          const typed = q && lower.startsWith(q.toLowerCase()) ? item.text.slice(0, q.length) : ''
          const rest = typed ? item.text.slice(q.length) : item.text
          return (
            <li
              key={item.text}
              role="option"
              aria-selected={idx === active}
              className={`flex items-center gap-3 pl-4 pr-1.5 ${idx === active ? 'bg-white/8' : 'hover:bg-white/5'}`}
            >
              {item.recent ? (
                <Clock className="w-4 h-4 text-slate-500 shrink-0" />
              ) : (
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
              )}
              <button type="button" onClick={() => pick(item.text)} className="flex-1 min-w-0 text-left py-2.5 text-sm truncate">
                {/* Como en los buscadores: lo escrito normal, el resto resaltado */}
                <span className="text-slate-300">{typed}</span>
                <span className="text-white font-semibold">{rest}</span>
              </button>
              {item.recent && !q ? (
                <button
                  type="button"
                  onClick={() => removeRecent(item.text)}
                  className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-white shrink-0"
                  aria-label={`Quitar "${item.text}" de recientes`}
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange(item.text + ' ')}
                  className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-white shrink-0"
                  aria-label={`Completar con "${item.text}"`}
                >
                  <ArrowUpLeft className="w-4 h-4" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    ) : null

  return { inputProps, dropdown, close: () => setOpen(false) }
}
