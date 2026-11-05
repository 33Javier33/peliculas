'use client'

import { Component, type ReactNode } from 'react'

// Si una pieza de la app falla (por ejemplo, sin conexión), solo esa se oculta: el resto sigue
// funcionando. Se vuelve a intentar sola unas veces y el error queda anotado (Configuración).
export function noteError(where: string, err: unknown) {
  try {
    const e = err as Error
    localStorage.setItem('cpn-last-error', JSON.stringify({ where, msg: String(e?.message || err).slice(0, 300), at: Date.now(), online: navigator.onLine }))
  } catch {}
}

export default class SafeBoundary extends Component<{ name: string; children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  private tries = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    noteError(this.props.name, error)
    console.error(`[PulsoMedia] ${this.props.name}:`, error)
    // Reintento (p. ej. al volver la conexión)
    if (this.tries < 3) {
      this.tries++
      this.timer = setTimeout(() => this.setState({ failed: false }), 4000 * this.tries)
    }
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer)
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
