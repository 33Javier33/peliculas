'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import InstallAppButton from '@/components/InstallAppButton'
import { useMusicStore } from '@/store/musicStore'

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  // La búsqueda depende de la sección: música, videos/películas de YouTube o catálogo TMDB.
  const section = pathname.startsWith('/music') ? 'music' : pathname.startsWith('/cine') ? 'cine' : 'movies'
  // Etiqueta de la sección actual junto a la marca (como "INTERACTIVE · MUSIC")
  const sectionLabel =
    pathname === '/music/library'
      ? 'Biblioteca'
      : section === 'music'
        ? 'Music'
        : section === 'cine'
          ? 'Videos'
          : pathname === '/'
            ? 'Inicio'
            : 'Películas'
  const isMusicPlaying = useMusicStore((s) => s.hasHydrated && s.isVisible && s.isPlaying)
  const searchTarget = section === 'music' ? '/music' : section === 'cine' ? '/cine' : '/search'
  const searchPlaceholder =
    section === 'music'
      ? 'Buscar música, artistas...'
      : section === 'cine'
        ? 'Buscar videos y películas...'
        : 'Buscar películas...'

  useEffect(() => {
    if (pathname === searchTarget) {
      setQuery(searchParams.get('q') || '')
    } else {
      setQuery('')
    }
  }, [pathname, searchParams, searchTarget])

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (isMobileSearchOpen) {
      setTimeout(() => mobileInputRef.current?.focus(), 100)
    }
  }, [isMobileSearchOpen])

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = query.trim()
      if (!trimmed) return
      setIsMobileSearchOpen(false)
      router.push(`${searchTarget}?q=${encodeURIComponent(trimmed)}`)
    },
    [query, router, searchTarget]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setQuery('')
        setIsMobileSearchOpen(false)
        inputRef.current?.blur()
        mobileInputRef.current?.blur()
      }
    },
    []
  )

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-obsidian/95 backdrop-blur-md shadow-lg shadow-black/30 border-b border-white/8'
          : 'bg-gradient-to-b from-obsidian/80 to-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 group"
            aria-label="Carlos P. Nauto Interactive - Inicio"
          >
            <Image
              src="/brand/logo-mark.png"
              alt="Carlos P. Nauto Interactive"
              width={40}
              height={40}
              priority
              className="w-10 h-10 rounded-xl shadow-md shadow-violet-500/20 group-hover:scale-105 transition-transform duration-200"
            />
            <div className="flex flex-col leading-none">
              <span className="font-bold text-sm leading-tight bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-lime-300 bg-clip-text text-transparent">
                Carlos P. Nauto
              </span>
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] whitespace-nowrap">
                <span className="text-slate-400">Interactive</span>
                <span className="text-slate-600" aria-hidden>·</span>
                <span className="text-violet-300 font-bold">{sectionLabel}</span>
                {isMusicPlaying && (
                  <span className="flex items-end gap-[2px] h-2.5" aria-label="Reproduciendo música">
                    <span className="w-[2px] h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-[2px] h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-[2px] h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </span>
            </div>
          </Link>

          <form
            onSubmit={handleSearch}
            className="hidden md:flex flex-1 max-w-xl items-center"
            role="search"
          >
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg
                  className="w-4 h-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-surface-1 border border-white/8 text-white placeholder-slate-500 rounded-full pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-violet-400/70 focus:bg-surface-1 focus:ring-2 focus:ring-violet-400/20 transition-all duration-200"
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    inputRef.current?.focus()
                  }}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </form>

          <div className="flex items-center gap-2">
            <InstallAppButton />
            <button
              onClick={() => setIsMobileSearchOpen(true)}
              className="md:hidden p-2 text-slate-400 hover:text-white hover:bg-surface-1 rounded-lg transition-all duration-200"
              aria-label="Abrir búsqueda"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>

            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-medium transition-colors duration-200 px-3 py-2 rounded-lg hover:bg-surface-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Inicio
            </Link>
            <Link
              href="/cine"
              className="hidden sm:inline-flex items-center gap-1.5 text-slate-400 hover:text-violet-400 text-sm font-medium transition-colors duration-200 px-3 py-2 rounded-lg hover:bg-violet-500/10"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
              </svg>
              CineLatino
            </Link>
            <Link
              href="/music"
              className="hidden sm:inline-flex items-center gap-1.5 text-slate-400 hover:text-violet-400 text-sm font-medium transition-colors duration-200 px-3 py-2 rounded-lg hover:bg-violet-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              Music
            </Link>
          </div>
        </div>
      </div>

      {isMobileSearchOpen && (
        <div className="md:hidden bg-obsidian/98 backdrop-blur-md border-t border-white/8 px-4 py-3">
          <form onSubmit={handleSearch} className="flex items-center gap-2" role="search">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg
                  className="w-4 h-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                ref={mobileInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-surface-1 border border-white/8 text-white placeholder-slate-500 rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-violet-400/70 focus:ring-2 focus:ring-violet-400/20 transition-all duration-200"
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
            <button
              type="submit"
              className="bg-violet-500 hover:bg-violet-500 shadow-glow text-white font-bold px-4 py-2.5 rounded-full text-sm transition-colors duration-200 shrink-0"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileSearchOpen(false)
                setQuery('')
              }}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              aria-label="Cerrar búsqueda"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </form>
        </div>
      )}
    </header>
  )
}
