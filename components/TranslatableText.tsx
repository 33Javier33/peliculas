'use client'

import { useState } from 'react'
import { Languages, Loader2 } from 'lucide-react'
import { useLangStore } from '@/store/langStore'
import { LANGUAGES, translateText } from '@/lib/translate'

// Texto con botón "Traducir" (al idioma elegido; se puede cambiar el idioma y volver al original)
const cache = new Map<string, string>()

export default function TranslatableText({ text, className = '', clamp = true }: { text: string; className?: string; clamp?: boolean }) {
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const [shown, setShown] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)

  const translate = async (to: string) => {
    const key = `${to}|${text}`
    setError('')
    const hit = cache.get(key)
    if (hit) return setShown(hit)
    setBusy(true)
    try {
      const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, to }) })
      const d = (await r.json().catch(() => ({}))) as { text?: string }
      // Si el servidor no pudo, se intenta desde el propio teléfono
      const out = r.ok && d.text ? d.text : (await translateText(text, to)).text
      cache.set(key, out)
      setShown(out)
    } catch {
      setError('No se pudo traducir ahora')
    }
    setBusy(false)
  }

  const long = text.length > 280
  return (
    <div>
      <p
        onClick={() => long && setExpanded(!expanded)}
        className={`${className} whitespace-pre-line ${clamp && long && !expanded ? 'line-clamp-4 cursor-pointer' : ''}`}
      >
        {shown ?? text}
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {shown ? (
          <button onClick={() => setShown(null)} className="inline-flex items-center gap-1.5 text-xs text-violet-300 font-semibold">
            <Languages className="w-3.5 h-3.5" /> Ver original
          </button>
        ) : (
          <button onClick={() => translate(lang)} disabled={busy} className="inline-flex items-center gap-1.5 text-xs text-violet-300 font-semibold disabled:opacity-60">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />} Traducir
          </button>
        )}
        <select
          value={lang}
          onChange={(e) => {
            setLang(e.target.value)
            if (shown) translate(e.target.value)
          }}
          aria-label="Idioma de la traducción"
          className="bg-transparent text-xs text-slate-400 border border-white/10 rounded-full px-2 py-0.5 focus:outline-none"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} className="bg-surface-1">
              {l.name}
            </option>
          ))}
        </select>
        {long && clamp && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-slate-500">
            {expanded ? 'Ver menos' : 'Ver más'}
          </button>
        )}
        {error && <span className="text-xs text-amber-300">{error}</span>}
      </div>
    </div>
  )
}
