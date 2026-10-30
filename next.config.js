const { version } = require('./package.json')

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  // youtubei.js se usa tal cual en el servidor (audio propio, /api/stream)
  experimental: {
    serverComponentsExternalPackages: ['youtubei.js'],
  },
  images: {
    // Las carátulas se cargan directo de YouTube, Deezer y TMDB (ya vienen en el tamaño justo).
    // La optimización de Vercel tiene un límite mensual gratis: al pasarlo, dejaban de verse.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      // Portadas de álbumes y fotos de artistas (Deezer)
      {
        protocol: 'https',
        hostname: '*.dzcdn.net',
      },
    ],
  },
}

module.exports = nextConfig
