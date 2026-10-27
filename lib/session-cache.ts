// Caché de la sesión (se borra al cerrar la app): guarda los resultados de una
// búsqueda para mostrarlos al instante al volver atrás, sin repetir la consulta.
const PREFIX = 'cpn-session:'

export function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeSession<T>(key: string, value: T) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Sin espacio o sin acceso: no es grave, solo no habrá caché
  }
}

/** Actualiza una entrada existente (o la crea) mezclando campos. */
export function patchSession<T extends object>(key: string, patch: Partial<T>) {
  writeSession(key, { ...(readSession<T>(key) ?? {}), ...patch })
}
