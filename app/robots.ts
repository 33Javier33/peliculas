import type { MetadataRoute } from 'next'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://peliculas-neon.vercel.app'

// Buscadores (Google, Bing): pueden recorrer la app; las direcciones internas (/api) no
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/estado'] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  }
}
