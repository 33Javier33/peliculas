'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Play, ExternalLink } from 'lucide-react'
import type { FreeServiceRow } from '@/lib/tmdb'
import { countryName } from '@/components/LiveTabs'

// Inicio: películas que se pueden ver GRATIS (con anuncios) en Plex, Tubi y Runtime en el país
// del usuario. Tocar el póster abre la ficha de la película; "Ver gratis" abre la película en el
// servicio (página de TMDB/JustWatch con el enlace directo).

export default function FreeServicesSection() {
  const [data, setData] = useState<{ country: string; rows: FreeServiceRow[] } | null>(null)

  useEffect(() => {
    fetch('/api/free-services')
      .then((r) => r.json())
      .then((d) => setData({ country: d.country || '', rows: Array.isArray(d.rows) ? d.rows : [] }))
      .catch(() => setData({ country: '', rows: [] }))
  }, [])

  if (data && data.rows.length === 0) return null
  const where = data?.country ? countryName(data.country) : ''
  const names = data?.rows.map((r) => r.name) ?? ['Plex', 'Tubi', 'Runtime']
  const namesText = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0]

  return (
    <section aria-label="Películas gratis en otros servicios">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-8 bg-emerald-500 rounded-full" />
        <h2 className="text-2xl font-bold text-white">Gratis en {namesText}</h2>
      </div>
      <p className="text-slate-400 text-sm mb-6">
        Películas completas y legales, gratis con anuncios{where ? ` en ${where}` : ''}. Se abren en el servicio (web o su app).
      </p>

      {!data ? (
        <div className="flex gap-3 overflow-hidden" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="w-32 shrink-0 aspect-[2/3] rounded-xl bg-surface-1 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {data.rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-center gap-2 mb-3">
                {row.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`https://image.tmdb.org/t/p/w92${row.logo}`} alt="" className="w-7 h-7 rounded-lg" loading="lazy" />
                )}
                <h3 className="text-white font-bold">{row.name}</h3>
                <a
                  href={row.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                >
                  Ir a {row.name} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
                {row.movies.map((m) => (
                  <div key={m.id} className="w-32 shrink-0 snap-start">
                    <Link href={`/movie/${m.id}`} className="block group">
                      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-1 border border-white/8 group-hover:border-emerald-400/50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                          alt={`Póster de ${m.title}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <p className="mt-1.5 text-white text-xs font-semibold line-clamp-2 leading-snug">{m.title}</p>
                      {m.release_date && <p className="text-slate-500 text-[11px]">{m.release_date.slice(0, 4)}</p>}
                    </Link>
                    <a
                      href={`https://www.themoviedb.org/movie/${m.id}/watch${data.country ? `?locale=${data.country}` : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 flex items-center justify-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 text-[11px] font-bold py-1.5"
                      aria-label={`Ver ${m.title} gratis en ${row.name}`}
                    >
                      <Play className="w-3 h-3 fill-current" /> Ver gratis
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-slate-600 text-[11px]">Disponibilidad según JustWatch y TMDB; puede variar.</p>
        </div>
      )}
    </section>
  )
}
