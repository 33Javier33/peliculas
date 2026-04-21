'use client'

import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pathname === '/search') {
      const currentQuery = searchParams.get('q') || ''
      setQuery(currentQuery)
    } else {
      setQuery('')
    }
  }, [pathname, searchParams])

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
      router.push(`/search?q=${encodeURIComponent(trimmed)}`)
    },
    [query, router]
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
          ? 'bg-[#0f172a]/95 backdrop-blur-md shadow-lg shadow-black/30 border-b border-[#2d3748]'
          : 'bg-gradient-to-b from-[#0f172a]/80 to-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 group"
            aria-label="CarlosPN Films - Inicio"
          >
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center shadow-md group-hover:bg-amber-300 transition-colors duration-200">
              <span className="text-[#0f172a] font-black text-xs leading-none">CP</span>
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-white font-bold text-sm leading-tight">
                CarlosPN <span className="text-amber-400">Films</span>
              </span>
              <span className="text-slate-500 text-[9px] uppercase tracking-widest">
                Interactive®
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
                placeholder="Buscar películas..."
                aria-label="Buscar películas"
                className="w-full bg-[#1e293b] border border-[#2d3748] text-white placeholder-slate-500 rounded-full pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-amber-400/70 focus:bg-[#1a2236] focus:ring-2 focus:ring-amber-400/20 transition-all duration-200"
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
            <button
              onClick={() => setIsMobileSearchOpen(true)}
              className="md:hidden p-2 text-slate-400 hover:text-white hover:bg-[#1e293b] rounded-lg transition-all duration-200"
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
              className="hidden sm:inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-medium transition-colors duration-200 px-3 py-2 rounded-lg hover:bg-[#1e293b]"
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
              className="hidden sm:inline-flex items-center gap-1.5 text-slate-400 hover:text-red-400 text-sm font-medium transition-colors duration-200 px-3 py-2 rounded-lg hover:bg-red-500/10"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
              </svg>
              CineLatino
            </Link>
            <Link
              href="/music"
              className="hidden sm:inline-flex items-center gap-1.5 text-slate-400 hover:text-purple-400 text-sm font-medium transition-colors duration-200 px-3 py-2 rounded-lg hover:bg-purple-500/10"
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
        <div className="md:hidden bg-[#0f172a]/98 backdrop-blur-md border-t border-[#2d3748] px-4 py-3">
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
                placeholder="Buscar películas..."
                aria-label="Buscar películas"
                className="w-full bg-[#1e293b] border border-[#2d3748] text-white placeholder-slate-500 rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/20 transition-all duration-200"
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
            <button
              type="submit"
              className="bg-amber-400 hover:bg-amber-300 text-[#0f172a] font-bold px-4 py-2.5 rounded-full text-sm transition-colors duration-200 shrink-0"
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
