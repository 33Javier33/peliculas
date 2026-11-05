'use client'

import './globals.css'
import ErrorScreen from '@/components/ErrorScreen'

// Error en la estructura de la app (lo que antes dejaba la pantalla en negro con
// "Application error: a client-side exception has occurred")
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: '#0B0C10', fontFamily: 'system-ui, sans-serif' }}>
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  )
}
