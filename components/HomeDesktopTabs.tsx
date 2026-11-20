'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const ForYouVideoGrid = dynamic(() => import('@/components/ForYouVideoGrid'), { ssr: false })

// Inicio en el computador, como YouTube: filtros arriba (Todo, Para ti, Películas, Música…) y la
// cuadrícula de videos. En el teléfono y en las apps el inicio queda como siempre (sin filtros).

type Tab = 'todo' | 'para-ti' | 'peliculas' | 'musica'

const TABS: { id: Tab; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'para-ti', label: 'Para ti' },
  { id: 'peliculas', label: 'Películas' },
  { id: 'musica', label: 'Música' },
]
const LINKS = [
  { href: '/tube', label: 'PulsoTube' },
  { href: '/music/videos', label: 'Videos musicales' },
  { href: '/radio', label: 'En vivo' },
  { href: '/tv', label: 'TV' },
  { href: '/music/feed', label: 'Videos a pantalla completa' },
]

/** ¿Pantalla de computador? (la cuadrícula solo se carga ahí: en el teléfono no gasta datos) */
function useDesktop() {
  const [desk, setDesk] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setDesk(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desk
}

export default function HomeDesktopTabs({
  hero,
  intro,
  movies,
  services,
  music,
}: {
  hero: React.ReactNode
  intro: React.ReactNode
  movies: React.ReactNode
  services: React.ReactNode
  music: React.ReactNode
}) {
  const desktop = useDesktop()
  const [tab, setTab] = useState<Tab>('todo')
  // En el teléfono se ve todo; en el computador, según el filtro
  const vis = (...tabs: Tab[]) => (tabs.includes(tab) ? '' : 'lg:hidden')
  const chip = 'shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors'
  return (
    <div className="lg:pt-16">
      <div className="hidden lg:block sticky top-16 z-30 bg-obsidian/95 backdrop-blur border-b border-white/5">
        <div className="flex gap-3 overflow-x-auto px-6 py-3 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => (setTab(t.id), window.scrollTo({ top: 0 }))} className={`${chip} ${tab === t.id ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/15'}`}>
              {t.label}
            </button>
          ))}
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`${chip} bg-white/10 text-white hover:bg-white/15`}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Portada grande: en el teléfono siempre; en el computador, en Películas */}
      <div className={tab === 'peliculas' ? '' : 'lg:hidden'}>{hero}</div>

      <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-6 py-14 lg:py-6 space-y-16 lg:space-y-12">
        {desktop && (tab === 'todo' || tab === 'para-ti') && <ForYouVideoGrid limit={tab === 'para-ti' ? 36 : 12} />}
        <div className={`space-y-16 lg:space-y-12 ${vis('todo')}`}>{intro}</div>
        <div className={vis('todo', 'peliculas')}>{movies}</div>
        <div className={vis('todo', 'peliculas')}>{services}</div>
        <div className={vis('todo', 'musica')}>{music}</div>
      </div>
    </div>
  )
}
