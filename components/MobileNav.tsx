'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, TvMinimalPlay, Music2, Library, Radio, MonitorPlay, Clapperboard } from 'lucide-react'
import { useAppFlavor } from '@/lib/app-flavor'

const items = [
  { href: '/', label: 'Inicio', Icon: Home, active: 'text-violet-400' },
  { href: '/peliculas', label: 'Películas', Icon: Clapperboard, active: 'text-violet-400' },
  { href: '/tube', label: 'PulsoTube', Icon: MonitorPlay, active: 'text-violet-400' },
  { href: '/music', label: 'Música', Icon: Music2, active: 'text-violet-400' },
  { href: '/radio', label: 'En vivo', Icon: Radio, active: 'text-violet-400' },
]

// PulsoMusic: solo música, videos musicales, radios y biblioteca
const musicItems = [
  { href: '/music', label: 'Música', Icon: Music2, active: 'text-violet-400' },
  // Videos: la sección a pantalla completa (vertical); la búsqueda y los géneros están dentro
  { href: '/music/feed', label: 'Videos', Icon: MonitorPlay, active: 'text-violet-400' },
  { href: '/radio', label: 'Radios', Icon: Radio, active: 'text-violet-400' },
  { href: '/music/library', label: 'Biblioteca', Icon: Library, active: 'text-violet-400' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname.startsWith('/movie') || pathname === '/search' || pathname === '/peliculas'
  if (href === '/music') return pathname === '/music' || pathname.startsWith('/play') || pathname.startsWith('/music/album') || pathname.startsWith('/music/artist')
  if (href === '/radio') return pathname.startsWith('/radio') || pathname.startsWith('/tv')
  if (href === '/peliculas') return pathname.startsWith('/peliculas') || pathname.startsWith('/cine') || pathname.startsWith('/movie')
  if (href === '/tube') return pathname.startsWith('/tube') || pathname.startsWith('/play')
  if (href === '/music/feed') return pathname.startsWith('/music/feed') || pathname.startsWith('/music/videos')
  return pathname.startsWith(href)
}

// Barra de navegación inferior: solo en móvil (en escritorio los enlaces están en el Header).
export default function MobileNav() {
  const pathname = usePathname()
  const music = useAppFlavor() === 'music'
  const list = music ? musicItems : items

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-[85] h-14 bg-surface-1 border-t border-white/8 pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      <ul className={`grid ${music ? 'grid-cols-4' : 'grid-cols-5'} h-full`}>
        {list.map(({ href, label, Icon, active }) => {
          const on = isActive(pathname, href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  on ? active : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
