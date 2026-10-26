'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, TvMinimalPlay, Music2, Library } from 'lucide-react'

const items = [
  { href: '/', label: 'Inicio', Icon: Home, active: 'text-amber-400' },
  { href: '/cine', label: 'Videos', Icon: TvMinimalPlay, active: 'text-red-400' },
  { href: '/music', label: 'Música', Icon: Music2, active: 'text-purple-400' },
  { href: '/music/library', label: 'Biblioteca', Icon: Library, active: 'text-pink-400' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname.startsWith('/movie') || pathname === '/search'
  if (href === '/music') return pathname === '/music'
  return pathname.startsWith(href)
}

// Barra de navegación inferior: solo en móvil (en escritorio los enlaces están en el Header).
export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-[85] h-14 bg-[#0b1120]/95 backdrop-blur-md border-t border-[#2d3748] pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      <ul className="grid grid-cols-4 h-full">
        {items.map(({ href, label, Icon, active }) => {
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
