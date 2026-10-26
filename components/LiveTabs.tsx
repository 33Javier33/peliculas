'use client'

import Link from 'next/link'
import { Radio, Tv } from 'lucide-react'
import { LIVE_COUNTRIES } from '@/lib/live'

export function countryName(code: string): string {
  if (!code || code === 'WORLD') return 'Todo el mundo'
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

/** Encabezado común de "En vivo": título y chips Radio / TV. */
export function LiveHeader({ active }: { active: 'radio' | 'tv' }) {
  const chip = 'shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold font-display transition-colors'
  const on = `${chip} bg-violet-300 text-violet-950`
  const off = `${chip} bg-surface-2/60 border border-white/8 text-slate-300 hover:text-white`
  return (
    <>
      <p className="flex items-center gap-2 text-emerald-400 text-[11px] font-bold uppercase tracking-[0.08em] font-display">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" /> En vivo
      </p>
      <h1 className="text-[32px] leading-[38px] sm:text-[40px] sm:leading-[48px] font-extrabold text-white mt-1 mb-5">
        {active === 'radio' ? 'Radio' : 'Televisión'}
      </h1>
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        <Link href="/radio" className={active === 'radio' ? on : off}>
          <Radio className="w-4 h-4" /> Radio
        </Link>
        <Link href="/tv" className={active === 'tv' ? on : off}>
          <Tv className="w-4 h-4" /> TV
        </Link>
      </div>
    </>
  )
}

/** Selector de país (incluye el detectado aunque no esté en la lista). */
export function CountrySelect({
  value,
  onChange,
  includeWorld = true,
}: {
  value: string
  onChange: (code: string) => void
  includeWorld?: boolean
}) {
  const codes = Array.from(new Set([value, ...LIVE_COUNTRIES].filter((c) => c && c !== 'WORLD')))
  const options = codes
    .map((c) => ({ code: c, name: countryName(c) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="País"
      className="bg-surface-1 border border-white/8 text-white rounded-full px-4 py-3 text-sm font-semibold focus:outline-none focus:border-violet-500"
    >
      {includeWorld && <option value="WORLD">🌎 Todo el mundo</option>}
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.name}
        </option>
      ))}
    </select>
  )
}
