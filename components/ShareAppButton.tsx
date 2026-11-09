'use client'

import { useEffect, useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { getNative } from '@/lib/native'
import { isMusicApp } from '@/lib/app-flavor'

// Compartir la app con el enlace que corresponde: dentro de la app de Android, la página para
// descargar la APK; en iPhone, la de instalarla desde Safari; en el resto, la página principal.
const SITE = 'https://peliculas-neon.vercel.app'

function target(): { url: string; text: string } {
  const origin = typeof window !== 'undefined' && /^https:/.test(window.location.origin) ? window.location.origin : SITE
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  // Desde PulsoMusic: directo a la descarga de PulsoMusic (sin mezclarla con PulsoMedia)
  if (isMusicApp()) return { url: `${origin}/app-music`, text: 'Te comparto PulsoMusic: música, radios y videos musicales, con la pantalla bloqueada y sin internet. Descarga la app para Android:' }
  if (getNative() || /CPNApp\//.test(ua) || /Android/i.test(ua))
    return { url: `${origin}/app-android`, text: 'Te comparto PulsoMedia: música, radios, TV y películas gratis. Descarga la app para Android:' }
  if (/iPhone|iPad|iPod/i.test(ua)) return { url: `${origin}/app-iphone`, text: 'Te comparto PulsoMedia: música, radios, TV y películas gratis. Instálala en tu iPhone:' }
  return { url: origin, text: 'Te comparto PulsoMedia: música, radios, TV y películas gratis:' }
}

export default function ShareAppButton({ className = '', label = 'Compartir la app', compact = false }: { className?: string; label?: string; compact?: boolean }) {
  const [done, setDone] = useState<'copied' | null>(null)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 3000)
    return () => clearTimeout(t)
  }, [done])

  const share = async () => {
    const { url, text } = target()
    const native = getNative()
    // App de Android: el menú Compartir del teléfono
    if (native?.share) return native.share(`${text}\n${url}`)
    try {
      if (navigator.share) return await navigator.share({ title: isMusicApp() ? 'PulsoMusic' : 'PulsoMedia', text, url })
    } catch {
      return
    }
    // Sin menú de compartir (apps antiguas): WhatsApp y el enlace copiado
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setDone('copied')
    } catch {}
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank')
  }

  if (compact)
    return (
      <button onClick={share} className={`p-2 text-slate-400 hover:text-white hover:bg-surface-1 rounded-lg transition-all ${className}`} aria-label={label} title={label}>
        {done ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
      </button>
    )
  return (
    <button
      onClick={share}
      className={`inline-flex items-center gap-2 rounded-full bg-surface-2 border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:border-violet-400 ${className}`}
    >
      {done ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-violet-300" />}
      {done ? 'Enlace copiado' : label}
    </button>
  )
}
