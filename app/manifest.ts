import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Carlos P. Nauto Interactive',
    short_name: 'Carlos P. Nauto',
    description: 'Películas, videos musicales, música, radio y TV en vivo.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0B0C10',
    theme_color: '#0B0C10',
    lang: 'es',
    categories: ['entertainment', 'music', 'video'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Música', url: '/music', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Radio', url: '/radio', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'TV en vivo', url: '/tv', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Biblioteca', url: '/music/library', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
