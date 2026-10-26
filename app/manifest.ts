import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'CarlosPN Films — Carlos P. Nauto Interactive',
    short_name: 'CarlosPN',
    description: 'Reproductor de películas, videos musicales y música.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    lang: 'es',
    categories: ['entertainment', 'music', 'video'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Música', url: '/music', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Videos', url: '/cine', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Biblioteca', url: '/music/library', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
