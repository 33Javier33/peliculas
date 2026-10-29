import type { Metadata, Viewport } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import './globals.css'
import Image from 'next/image'
import Header from '@/components/Header'
import MobileNav from '@/components/MobileNav'
import NavigationMemory from '@/components/NavigationMemory'
import SplashScreen, { SPLASH_SCRIPT } from '@/components/SplashScreen'

const MusicPlayerBar = dynamic(() => import('@/components/MusicPlayerBar'), { ssr: false })

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://peliculas-neon.vercel.app'),
  title: {
    default: 'Carlos P. Nauto Interactive — Películas, videos y música',
    template: '%s | Carlos P. Nauto Interactive',
  },
  description:
    'Reproductor de películas, videos musicales y música. Descubre estrenos, tendencias y tus canciones favoritas.',
  keywords: ['películas', 'cine', 'videos musicales', 'música', 'reproductor', 'estrenos', 'trailer', 'TMDB'],
  openGraph: {
    title: 'Carlos P. Nauto Interactive',
    description: 'Películas, videos musicales y música en un solo reproductor.',
    type: 'website',
    locale: 'es_ES',
    images: [{ url: '/brand/og.jpg', width: 1200, height: 630, alt: 'Carlos P. Nauto Interactive' }],
  },
  applicationName: 'Carlos P. Nauto Interactive',
  authors: [{ name: 'Carlos P. Nauto Interactive' }],
  creator: 'Carlos P. Nauto Interactive',
  publisher: 'Carlos P. Nauto Interactive',
  appleWebApp: {
    capable: true,
    title: 'Carlos P. Nauto',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#0B0C10',
  viewportFit: 'cover',
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <link rel="preload" href="/brand/splash-poster.webp" as="image" />
      </head>
      <body className="min-h-screen bg-obsidian text-white font-sans pb-14 sm:pb-0">
        <SplashScreen />
        <Suspense fallback={<div className="fixed top-0 left-0 right-0 h-16 z-50 bg-obsidian" />}>
          <Header />
        </Suspense>
        <main className="min-h-screen pb-20">{children}</main>
        <footer className="bg-surface-1 border-t border-white/8 py-10 mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Image src="/brand/logo-mark.png" alt="" width={36} height={36} className="w-9 h-9 rounded-lg" />
              <span className="font-bold bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-lime-300 bg-clip-text text-transparent">
                Carlos P. Nauto Interactive
              </span>
            </div>
            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()}{' '}
              <span className="text-violet-400 font-medium">Carlos P. Nauto Interactive</span>. Todos los
              datos son proporcionados por{' '}
              <span className="text-blue-400 font-medium">TMDB</span>.
            </p>
            <p className="text-slate-600 text-xs mt-2">
              Versión {APP_VERSION} ·{' '}
              <a href="/estado" className="underline hover:text-slate-400">
                Estado de las fuentes
              </a>
            </p>
          </div>
        </footer>
        <MusicPlayerBar />
        <MobileNav />
        <Suspense fallback={null}>
          <NavigationMemory />
        </Suspense>
      </body>
    </html>
  )
}
