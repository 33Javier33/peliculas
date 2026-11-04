// Caché local de respuestas de la app (artistas, discos, biografías…): lo ya consultado se muestra
// al instante y se guarda en el teléfono (localStorage) para la próxima vez. Dos pedidos iguales
// a la vez comparten la misma consulta.
const PREFIX = 'cpn-cache:'
const MAX_ENTRY = 150_000 // caracteres: lo más grande no se guarda en el teléfono (solo en memoria)
const memory = new Map<string, { at: number; data: unknown }>()
const inflight = new Map<string, Promise<unknown>>()

function readStored(url: string): { at: number; data: unknown } | null {
  try {
    const raw = localStorage.getItem(PREFIX + url)
    return raw ? (JSON.parse(raw) as { at: number; data: unknown }) : null
  } catch {
    return null
  }
}

function store(url: string, entry: { at: number; data: unknown }) {
  memory.set(url, entry)
  if (memory.size > 300) memory.delete(memory.keys().next().value as string)
  try {
    const raw = JSON.stringify(entry)
    if (raw.length > MAX_ENTRY) return
    try {
      localStorage.setItem(PREFIX + url, raw)
    } catch {
      // Sin espacio: se borran las entradas más viejas del caché y se reintenta una vez
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
      const aged = keys.map((k) => ({ k, at: (JSON.parse(localStorage.getItem(k) || '{}') as { at?: number }).at ?? 0 })).sort((a, b) => a.at - b.at)
      aged.slice(0, Math.max(10, Math.floor(aged.length / 2))).forEach(({ k }) => localStorage.removeItem(k))
      localStorage.setItem(PREFIX + url, raw)
    }
  } catch {}
}

/** Lo guardado de esta dirección (aunque esté viejo), para mostrar algo al instante */
export function peekCached<T>(url: string): T | null {
  const e = memory.get(url) ?? readStored(url)
  return (e?.data as T) ?? null
}

/**
 * JSON de una dirección de la app con caché: si lo guardado tiene menos de `ttl` ms se usa sin
 * consultar; si no, se consulta (y si falla, se usa lo guardado aunque esté viejo).
 */
export async function cachedJson<T>(url: string, ttl = 3600_000): Promise<T | null> {
  const hit = memory.get(url) ?? readStored(url)
  if (hit && Date.now() - hit.at < ttl) {
    memory.set(url, hit)
    return hit.data as T
  }
  const running = inflight.get(url)
  if (running) return running as Promise<T | null>
  const p = fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      store(url, { at: Date.now(), data })
      return data
    })
    .catch(() => (hit?.data as T) ?? null)
    .finally(() => inflight.delete(url))
  inflight.set(url, p)
  return p
}
