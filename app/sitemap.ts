import type { MetadataRoute } from 'next'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://peliculas-neon.vercel.app'

// Mapa del sitio para Google: las páginas principales de la app
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const pages: [string, number, MetadataRoute.Sitemap[number]['changeFrequency']][] = [
    ['', 1, 'daily'],
    ['/music', 0.9, 'daily'],
    ['/radio', 0.9, 'daily'],
    ['/tv', 0.8, 'daily'],
    ['/peliculas', 0.8, 'weekly'],
    ['/cine', 0.7, 'daily'],
    ['/music/library', 0.5, 'monthly'],
    ['/app-android', 0.8, 'weekly'],
    ['/app-iphone', 0.6, 'monthly'],
    ['/novedades', 0.6, 'weekly'],
  ]
  return pages.map(([path, priority, changeFrequency]) => ({ url: `${SITE}${path}`, lastModified: now, changeFrequency, priority }))
}
