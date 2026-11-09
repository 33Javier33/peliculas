import Link from 'next/link'
import type { Metadata, Viewport } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import './globals.css'
import Image from 'next/image'
import Header from '@/components/Header'
import MobileNav from '@/components/MobileNav'
import SafeBoundary from '@/components/SafeBoundary'
import NativeLinkBridge from '@/components/NativeLinkBridge'
import NavigationMemory from '@/components/NavigationMemory'
import SplashScreen, { SPLASH_SCRIPT } from '@/components/SplashScreen'
import NativePip from '@/components/NativePip'
import AddToPlaylistSheet from '@/components/AddToPlaylistSheet'
import EqualizerSheet from '@/components/EqualizerSheet'
import ScrollTopButton from '@/components/ScrollTopButton'
import VersionWatcher from '@/components/VersionWatcher'
import WearBridge from '@/components/WearBridge'
import FocusIntoView from '@/components/FocusIntoView'
import AppUpdateBanner from '@/components/AppUpdateBanner'
import AccountSync from '@/components/AccountSync'
import AccountSheet from '@/components/AccountSheet'
import OfflineBanner from '@/components/OfflineBanner'
import OfflineManager from '@/components/OfflineManager'
import MusicAppGuard from '@/components/MusicAppGuard'

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
    default: 'PulsoMedia — Música, radios, TV y películas gratis',
    template: '%s | PulsoMedia',
  },
  description:
    'PulsoMedia (de Carlos P. Nauto Interactive): escucha música con letra karaoke, radios en vivo y radios infinitas por género, TV en vivo y películas gratis. App gratis para Android, iPhone y web.',
  keywords: [
    'PulsoMedia',
    'Pulso Media',
    'Carlos P. Nauto',
    'Carlos P. Nauto Interactive',
    'CarlosPNauto',
    'Musica Carlos P Nauto',
    'música gratis',
    'radio online',
    'radios en vivo',
    'TV en vivo',
    'películas gratis',
    'letras de canciones',
    'karaoke',
    'app de música',
    'Internet Archive',
  ],
  // Verificación de Google Search Console (la clave se pone en Vercel: NEXT_PUBLIC_GOOGLE_VERIFICATION)
  verification: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION } : undefined,
  openGraph: {
    title: 'PulsoMedia',
    description: 'Música con letra karaoke, radios, TV en vivo y películas gratis. App para Android, iPhone y web.',
    type: 'website',
    locale: 'es_ES',
    images: [{ url: '/brand/og.jpg', width: 1200, height: 630, alt: 'PulsoMedia' }],
  },
  applicationName: 'PulsoMedia',
  authors: [{ name: 'Carlos P. Nauto Interactive' }],
  creator: 'Carlos P. Nauto Interactive',
  publisher: 'Carlos P. Nauto Interactive',
  appleWebApp: {
    capable: true,
    title: 'PulsoMedia',
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
        {/* Para Google: qué es la app (nombre, tipo y que es gratis) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'PulsoMedia',
              alternateName: ['Pulso Media', 'Carlos P. Nauto Interactive', 'Carlos P. Nauto', 'Música Carlos P. Nauto', 'CarlosPNauto'],
              url: process.env.NEXT_PUBLIC_SITE_URL || 'https://peliculas-neon.vercel.app',
              applicationCategory: 'MultimediaApplication',
              operatingSystem: 'Android, iOS, Web',
              inLanguage: 'es',
              description: 'Música con letra karaoke, radios en vivo y por género, TV en vivo y películas gratis.',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            }),
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <link rel="preload" href="/brand/splash-poster.webp" as="image" />
      </head>
      <body className="min-h-screen bg-obsidian text-white font-sans pb-14 sm:pb-0">
        <SafeBoundary name="SplashScreen">
          <SplashScreen />
        </SafeBoundary>
        <SafeBoundary name="NativePip">
          <NativePip />
        </SafeBoundary>
        <SafeBoundary name="AddToPlaylistSheet">
          <AddToPlaylistSheet />
        </SafeBoundary>
        <SafeBoundary name="EqualizerSheet">
          <EqualizerSheet />
        </SafeBoundary>
        <SafeBoundary name="ScrollTopButton">
          <ScrollTopButton />
        </SafeBoundary>
        <SafeBoundary name="VersionWatcher">
          <VersionWatcher />
        </SafeBoundary>
        <SafeBoundary name="NativeLinkBridge">
          <NativeLinkBridge />
        </SafeBoundary>
        <SafeBoundary name="WearBridge">
          <WearBridge />
        </SafeBoundary>
        <SafeBoundary name="FocusIntoView">
          <FocusIntoView />
        </SafeBoundary>
        <SafeBoundary name="AppUpdateBanner">
          <AppUpdateBanner />
        </SafeBoundary>
        <SafeBoundary name="AccountSync">
          <AccountSync />
        </SafeBoundary>
        <SafeBoundary name="AccountSheet">
          <AccountSheet />
        </SafeBoundary>
        <SafeBoundary name="OfflineBanner">
          <OfflineBanner />
        </SafeBoundary>
        <MusicAppGuard />
        <SafeBoundary name="OfflineManager">
          <OfflineManager />
        </SafeBoundary>
        <SafeBoundary name="Header">
          <Suspense fallback={<div className="fixed top-0 left-0 right-0 h-16 z-50 bg-obsidian" />}>
            <Header />
          </Suspense>
        </SafeBoundary>
        <main>{children}</main>
        <footer className="bg-surface-1 border-t border-white/8 pt-7 pb-6 mt-2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Image src="/brand/logo-mark.png" alt="" width={36} height={36} className="w-9 h-9 rounded-lg" />
              <span className="flex flex-col items-start leading-tight">
                <span className="font-bold bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-pink-400 bg-clip-text text-transparent">
                  Pulso<span className="cpn-brand-media">Media</span>
                  <span className="cpn-brand-music">Music</span>
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">por Carlos P. Nauto Interactive</span>
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
              <Link href="/estado" className="underline hover:text-slate-400">
                Estado de las fuentes
              </Link> ·{' '}
              <Link href="/app-android" className="underline hover:text-slate-400">
                App para Android
              </Link> ·{' '}
              <Link href="/app-iphone" className="underline hover:text-slate-400">
                App para iPhone
              </Link>
            </p>
          </div>
        </footer>
        <SafeBoundary name="MusicPlayerBar">
          <MusicPlayerBar />
        </SafeBoundary>
        <SafeBoundary name="MobileNav">
          <MobileNav />
        </SafeBoundary>
        <Suspense fallback={null}>
          <NavigationMemory />
        </Suspense>
      </body>
    </html>
  )
}
