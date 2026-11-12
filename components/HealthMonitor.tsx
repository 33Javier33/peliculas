'use client'

import { useHealthMonitor } from '@/lib/use-health-monitor'

/**
 * Componente que inicia el monitor de salud (tests periódicos de conexión y fluidez)
 * Se renderiza silenciosamente en el layout para ejecutar en background
 */
export default function HealthMonitorComponent() {
  useHealthMonitor()
  return null
}
