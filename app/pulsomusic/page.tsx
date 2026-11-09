import type { Metadata } from 'next'
import AppMusicPage from '../app-music/page'

// Enlace nuevo para compartir PulsoMusic: WhatsApp guardó la vista previa antigua de /app-music
const DESC = 'Música, radios y videos musicales con la pantalla bloqueada, descargas sin internet, ecualizador y la TV. App para Android.'
export const metadata: Metadata = {
  title: { absolute: 'PulsoMusic — app de música para Android' },
  description: DESC,
  applicationName: 'PulsoMusic',
  // Vista previa al compartir (WhatsApp…): nombre e imagen de PulsoMusic
  openGraph: { title: 'PulsoMusic', siteName: 'PulsoMusic', description: DESC, type: 'website', locale: 'es_ES', images: [{ url: '/brand/og-music.jpg', width: 1200, height: 630, alt: 'PulsoMusic' }] },
  twitter: { card: 'summary_large_image', title: 'PulsoMusic', description: DESC, images: ['/brand/og-music.jpg'] },
}

export default AppMusicPage
