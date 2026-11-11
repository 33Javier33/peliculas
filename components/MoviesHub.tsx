'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import FreeMoviesClient from '@/components/FreeMoviesClient'
import CineClientPage from '@/components/CineClientPage'

// Películas en un solo lugar: gratis (dominio público y Pluto TV) y CineLatino (películas en YouTube)
export default function MoviesHub() {
  const params = useSearchParams()
  const router = useRouter()
  const [tab, setTab] = useState<'gratis' | 'cine'>(params.get('tab') === 'cine' ? 'cine' : 'gratis')
  const pick = (t: 'gratis' | 'cine') => {
    setTab(t)
    router.replace(t === 'cine' ? '/peliculas?tab=cine' : '/peliculas', { scroll: false })
  }
  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-2">
        <div role="tablist" aria-label="Películas" className="inline-flex p-1 rounded-full bg-surface-2/80 border border-white/8">
          {(['gratis', 'cine'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => pick(t)}
              className={`px-5 py-1.5 rounded-full text-sm font-bold font-display ${tab === t ? 'bg-white text-black' : 'text-slate-300 hover:text-white'}`}
            >
              {t === 'gratis' ? 'Gratis' : 'CineLatino'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'gratis' ? <FreeMoviesClient /> : <CineClientPage initialItems={[]} initialVideoDetails={{}} />}
    </>
  )
}
