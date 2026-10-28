'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clapperboard, ExternalLink } from 'lucide-react'
import type { WatchProvider, WatchProvidersRegion } from '@/lib/tmdb'
import { countryName } from '@/components/LiveTabs'

// "Dónde ver": servicios con la película en el país del usuario (suscripción, gratis,
// alquiler o compra), con datos de JustWatch entregados por TMDB.

const GROUPS: { key: keyof WatchProvidersRegion; label: string }[] = [
  { key: 'free', label: 'Gratis' },
  { key: 'ads', label: 'Gratis con anuncios' },
  { key: 'flatrate', label: 'Suscripción' },
  { key: 'rent', label: 'Alquiler' },
  { key: 'buy', label: 'Compra' },
]

export default function WatchProviders({ movieId, title }: { movieId: number; title: string }) {
  const [data, setData] = useState<{ country: string; providers: WatchProvidersRegion | null } | null>(null)

  useEffect(() => {
    fetch(`/api/watch-providers?id=${movieId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ country: '', providers: null }))
  }, [movieId])

  if (!data) return null
  const p = data.providers
  const groups = GROUPS.map((g) => ({ ...g, list: (p?.[g.key] as WatchProvider[] | undefined) ?? [] })).filter((g) => g.list.length > 0)
  const onPluto = groups.some((g) => g.list.some((x) => /pluto/i.test(x.provider_name)))
  const where = data.country ? countryName(data.country) : 'tu país'

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-8 bg-emerald-500 rounded-full" />
        <h2 className="text-2xl font-bold text-white">Dónde ver en {where}</h2>
      </div>

      {groups.length === 0 ? (
        <p className="text-slate-400 text-sm">
          No está disponible en servicios de {where} por ahora.{' '}
          <Link href="/peliculas" className="text-violet-300 font-semibold">
            Mira películas gratis aquí →
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{g.label}</p>
              <div className="flex flex-wrap gap-3">
                {g.list.map((x) => (
                  <a
                    key={x.provider_id}
                    href={p?.link || `https://www.justwatch.com/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl bg-surface-1 border border-white/8 hover:border-violet-500/50 pr-3"
                    title={`Ver "${title}" en ${x.provider_name}`}
                  >
                    {x.logo_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`https://image.tmdb.org/t/p/w92${x.logo_path}`} alt="" className="w-10 h-10 rounded-l-xl object-cover" loading="lazy" />
                    ) : (
                      <span className="w-10 h-10" />
                    )}
                    <span className="text-white text-sm font-semibold">{x.provider_name}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
          {onPluto && (
            <Link
              href="/peliculas"
              className="inline-flex items-center gap-2 rounded-full bg-violet-500 text-white text-sm font-semibold px-4 py-2"
            >
              <Clapperboard className="w-4 h-4" /> Está en Pluto TV: búscala en Películas gratis
            </Link>
          )}
          {p?.link && (
            <a href={p.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-slate-500 text-xs hover:text-slate-300">
              Datos de JustWatch <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </section>
  )
}
