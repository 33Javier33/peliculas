/**
 * Monitor de salud periódico: detecta fallas de conexión, latencia y fluidez
 * Se ejecuta cada 5 minutos en background y registra métricas
 */

interface HealthMetric {
  timestamp: number
  type: 'connection' | 'latency' | 'audio' | 'video' | 'error'
  status: 'ok' | 'warning' | 'error'
  value?: number
  message?: string
}

const METRICS_KEY = 'cpn-health-metrics'
const MAX_METRICS = 288 // 24 horas a intervalos de 5 min
const CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutos

class HealthMonitor {
  private metrics: HealthMetric[] = []
  private timerId: NodeJS.Timeout | null = null

  constructor() {
    this.loadMetrics()
  }

  private loadMetrics() {
    try {
      const stored = localStorage?.getItem(METRICS_KEY)
      if (stored) {
        this.metrics = JSON.parse(stored).slice(-MAX_METRICS)
      }
    } catch (e) {
      console.error('Health monitor: error loading metrics', e)
    }
  }

  private saveMetrics() {
    try {
      localStorage?.setItem(METRICS_KEY, JSON.stringify(this.metrics))
    } catch (e) {
      console.error('Health monitor: error saving metrics', e)
    }
  }

  async checkConnection(): Promise<HealthMetric> {
    const start = Date.now()
    try {
      const res = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' })
      const latency = Date.now() - start
      const status = res.ok ? (latency > 2000 ? 'warning' : 'ok') : 'error'
      return { timestamp: start, type: 'connection', status, value: latency, message: `${latency}ms` }
    } catch (e) {
      return { timestamp: Date.now(), type: 'connection', status: 'error', message: String(e) }
    }
  }

  async checkLatency(): Promise<HealthMetric> {
    const start = Date.now()
    try {
      await fetch('/robots.txt', { cache: 'no-store' })
      const latency = Date.now() - start
      const status = latency > 3000 ? 'warning' : 'ok'
      return { timestamp: start, type: 'latency', status, value: latency }
    } catch (e) {
      return { timestamp: Date.now(), type: 'latency', status: 'error', message: String(e) }
    }
  }

  checkAudio(): HealthMetric {
    const audio = document.querySelector('audio') as HTMLAudioElement | null
    const timestamp = Date.now()
    if (!audio) return { timestamp, type: 'audio', status: 'ok', message: 'No audio element' }

    const status = audio.error ? 'error' : audio.paused && audio.currentTime > 0 ? 'warning' : 'ok'
    const message = audio.error ? `Error: ${audio.error.message}` : `buffered: ${audio.buffered.length} ranges`
    return { timestamp, type: 'audio', status, message }
  }

  checkVideo(): HealthMetric {
    const video = document.querySelector('video') as HTMLVideoElement | null
    const timestamp = Date.now()
    if (!video) return { timestamp, type: 'video', status: 'ok', message: 'No video element' }

    const status = video.error ? 'error' : video.paused && video.currentTime > 0 ? 'warning' : 'ok'
    const message = video.error ? `Error: ${video.error.message}` : `buffered: ${video.buffered.length} ranges`
    return { timestamp, type: 'video', status, message }
  }

  recordError(error: Error) {
    this.metrics.push({
      timestamp: Date.now(),
      type: 'error',
      status: 'error',
      message: error.message,
    })
    this.saveMetrics()
    if (this.metrics.filter((m) => m.status === 'error').length > 5) {
      console.warn('⚠️ Multiple errors detected in last hour')
    }
  }

  async runCheck() {
    const checks = [this.checkConnection(), this.checkLatency()]
    const results = await Promise.all(checks)
    this.metrics.push(this.checkAudio(), this.checkVideo(), ...results)
    if (this.metrics.length > MAX_METRICS) this.metrics = this.metrics.slice(-MAX_METRICS)
    this.saveMetrics()

    const errors = results.filter((m) => m.status === 'error')
    if (errors.length > 0) {
      console.warn('🔴 Health check failed:', errors.map((m) => m.message).join(', '))
    }
  }

  start() {
    if (this.timerId) return
    this.runCheck().catch(console.error)
    this.timerId = setInterval(() => this.runCheck().catch(console.error), CHECK_INTERVAL)
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  getMetrics(hours = 24) {
    const since = Date.now() - hours * 60 * 60 * 1000
    return this.metrics.filter((m) => m.timestamp > since)
  }

  getSummary(hours = 1) {
    const metrics = this.getMetrics(hours)
    return {
      total: metrics.length,
      errors: metrics.filter((m) => m.status === 'error').length,
      warnings: metrics.filter((m) => m.status === 'warning').length,
      ok: metrics.filter((m) => m.status === 'ok').length,
      types: {
        connection: metrics.filter((m) => m.type === 'connection'),
        latency: metrics.filter((m) => m.type === 'latency'),
        audio: metrics.filter((m) => m.type === 'audio'),
        video: metrics.filter((m) => m.type === 'video'),
        error: metrics.filter((m) => m.type === 'error'),
      },
    }
  }
}

export const healthMonitor = typeof window !== 'undefined' ? new HealthMonitor() : null
