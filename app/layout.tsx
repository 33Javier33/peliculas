import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import './globals.css'
import Header from '@/components/Header'
import MobileNav from '@/components/MobileNav'

const MusicPlayerBar = dynamic(() => import('@/components/MusicPlayerBar'), { ssr: false })

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'CarlosPN Films — Películas, videos y música',
    template: '%s | CarlosPN Films',
  },
  description:
    'Reproductor de películas, videos musicales y música. Descubre estrenos, tendencias y tus canciones favoritas.',
  keywords: ['películas', 'cine', 'videos musicales', 'música', 'reproductor', 'estrenos', 'trailer', 'TMDB'],
  openGraph: {
    title: 'CarlosPN Films',
    description: 'Películas, videos musicales y música en un solo reproductor.',
    type: 'website',
    locale: 'es_ES',
  },
  applicationName: 'CarlosPN Films',
  authors: [{ name: 'Carlos P. Nauto Interactive' }],
  creator: 'Carlos P. Nauto Interactive',
  publisher: 'Carlos P. Nauto Interactive',
  appleWebApp: {
    capable: true,
    title: 'CarlosPN',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
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
  themeColor: '#0f172a',
  viewportFit: 'cover',
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-[#0f172a] text-white font-sans pb-14 sm:pb-0">
        <Suspense fallback={<div className="fixed top-0 left-0 right-0 h-16 z-50 bg-[#0f172a]" />}>
          <Header />
        </Suspense>
        <main className="min-h-screen pb-20">{children}</main>
        <footer className="bg-[#1e293b] border-t border-[#2d3748] py-10 mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-7 h-7 bg-amber-400 rounded-lg flex items-center justify-center">
                <span className="text-[#0f172a] font-black text-xs">CP</span>
              </div>
              <span className="text-white font-bold">
                CarlosPN <span className="text-amber-400">Films</span>
              </span>
            </div>
            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()}{' '}
              <span className="text-amber-400 font-medium">Carlos P. Nauto Interactive</span>. Todos los
              datos son proporcionados por{' '}
              <span className="text-blue-400 font-medium">TMDB</span>.
            </p>
            <p className="text-slate-600 text-xs mt-2">Versión {APP_VERSION}</p>
          </div>
        </footer>
        <MusicPlayerBar />
        <MobileNav />
      </body>
    </html>
  )
}
