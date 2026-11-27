// Uso de las apps y la web, para el panel de administración (/admin): dispositivos activos,
// canciones más escuchadas y errores. Va DIRECTO a Supabase (no pasa por Vercel, no gasta su cuota)
// y sin datos personales: el dispositivo es un número al azar.
import { supabasePublic } from '@/lib/supabase-public'
import { getNative, isNativeApp } from '@/lib/native'
import { isMusicApp } from '@/lib/app-flavor'
import { useAccountStore } from '@/store/accountStore'

/** Correo de la cuenta personal (si hay sesión): el panel muestra a quién le pasa cada cosa */
const email = () => {
  try {
    return useAccountStore.getState().email ?? ''
  } catch {
    return ''
  }
}

const DEVICE_KEY = 'cpn-uso-device'

function device(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return ''
  }
}

export const usageApp = () => (isNativeApp() ? (isMusicApp() ? 'music' : 'media') : 'web')

export function usageVersion(): string {
  try {
    if (isNativeApp()) return String(getNative()?.version?.() ?? '')
  } catch {}
  return String(process.env.NEXT_PUBLIC_APP_VERSION ?? '')
}

const rpc = (fn: string, args: Record<string, unknown>) => {
  try {
    void supabasePublic()
      .rpc(fn, args)
      .then(
        () => {},
        () => {}
      )
  } catch {}
}

/** Una vez al día por dispositivo: que se usó hoy (y si tiene cuenta) */
export function pingDaily(hasAccount: boolean) {
  try {
    const day = new Date().toISOString().slice(0, 10) + (hasAccount ? 'c' : '')
    if (localStorage.getItem('cpn-uso-dia') === day) return
    localStorage.setItem('cpn-uso-dia', day)
  } catch {
    return
  }
  rpc('uso_ping', { p_device: device(), p_app: usageApp(), p_version: usageVersion(), p_cuenta: hasAccount, p_email: hasAccount ? email() : '' })
}

let lastPlay = ''
/** Una canción empezó a sonar */
export function reportPlay(t: { id: string; title: string; channelTitle?: string }) {
  if (!t.id || t.id === lastPlay) return
  lastPlay = t.id
  const title = t.title.replace(/^[^-–]+[-–]\s*/, '') || t.title
  const artist = (/ [-–] /.test(t.title) ? t.title.split(/ [-–] /)[0] : '') || t.channelTitle || ''
  rpc('uso_play', { p_track: t.id.replace(/^yta-/, ''), p_titulo: title, p_artista: artist, p_device: device() })
}

// Errores que no dicen nada útil (o que no son de la app)
const NOISE = /ResizeObserver loop|^Script error\.?$|AbortError|The play\(\) request was interrupted|NotAllowedError|cancelled|Load failed$|top\.GLOBALS|chrome-extension:/i

/**
 * El texto del error. Algunos llegan como un «evento» del navegador (salía «[object Event]»): casi
 * siempre es un archivo externo que no se pudo cargar (sin conexión o bloqueado); se dice cuál.
 */
function describe(err: unknown): string {
  if (typeof err === 'string') return err
  if (typeof Event !== 'undefined' && err instanceof Event) {
    const t = err.target as (Element & { src?: string; href?: string; url?: string; currentSrc?: string }) | null
    const tag = t && 'tagName' in t ? t.tagName.toLowerCase() : t && 'url' in t ? 'conexión en vivo' : 'recurso'
    let where = ''
    try {
      const u = new URL(String(t?.currentSrc || t?.src || t?.href || t?.url || ''), location.href)
      where = ` ${u.hostname}${u.pathname.slice(0, 60)}`
    } catch {}
    return `No se pudo cargar un recurso externo (${tag}${where}) · evento «${err.type}»`
  }
  const e = err as { message?: string; name?: string } | null
  return String(e?.message || e?.name || err || '')
}

/** Un error de la app (como mucho una vez cada 6 h el mismo, por dispositivo) */
export function reportError(where: string, err: unknown) {
  try {
    let msg = describe(err)
    msg = msg.trim().slice(0, 500)
    if (!msg || NOISE.test(msg)) return
    // Un archivo externo que no cargó sin internet no es una falla de la app (se reintenta solo)
    if (/^No se pudo cargar un recurso externo/.test(msg) && typeof navigator !== 'undefined' && navigator.onLine === false) return
    const key = 'cpn-uso-err'
    const seen = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, number>
    const sig = `${where}|${msg.slice(0, 120)}`
    const now = Date.now()
    if (seen[sig] && now - seen[sig] < 6 * 3600 * 1000) return
    seen[sig] = now
    // (se guardan solo los últimos 40)
    const keep = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 40)
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(keep)))
    rpc('uso_error', {
      p_device: device(),
      p_app: usageApp(),
      p_version: usageVersion(),
      p_donde: where.slice(0, 60),
      p_mensaje: msg,
      p_online: typeof navigator === 'undefined' ? true : navigator.onLine,
      p_pagina: typeof location === 'undefined' ? '' : location.pathname.slice(0, 200),
      p_email: email(),
    })
  } catch {}
}
