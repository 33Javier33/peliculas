import { useEffect } from 'react'
import { healthMonitor } from '@/lib/health-monitor'

/**
 * Hook para iniciar el monitor de salud (tests periódicos de conexión y fluidez)
 * Usa este hook en el componente principal de la app para ejecutarlo en background
 */
export function useHealthMonitor() {
  useEffect(() => {
    if (!healthMonitor) return

    healthMonitor.start()

    // Si hay errores críticos, envía un resumen a la consola cada 30 min
    const reportInterval = setInterval(() => {
      if (!healthMonitor) return
      const summary = healthMonitor.getSummary(24)
      if (summary.errors > 0 || summary.warnings > 0) {
        console.warn('📊 Health report (24h):', summary)
        if (summary.errors > 10) {
          console.error('🚨 Critical: múltiples errores detectados. Verifica tu conexión.')
        }
      }
    }, 30 * 60 * 1000)

    return () => {
      clearInterval(reportInterval)
      if (healthMonitor) healthMonitor.stop()
    }
  }, [])
}
