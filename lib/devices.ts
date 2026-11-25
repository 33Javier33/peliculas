'use client'

// Dispositivos de una cuenta: PulsoMedia, PulsoMusic y el navegador comparten lo que suena.
// Cada uno avisa qué suena (cada pocos segundos, con sesión iniciada) y recibe órdenes de los otros:
// «pasa la música aquí», «pausa», «siguiente», etc.
import { create } from 'zustand'
import { callAccount } from '@/lib/account-sync'
import { useAccountStore } from '@/store/accountStore'
import { useMusicStore } from '@/store/musicStore'
import { isNativeApp, reportAccount, getNative } from '@/lib/native'
import { isMusicApp, appBrand } from '@/lib/app-flavor'
import type { MusicVideo } from '@/lib/youtube-music'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabasePublic } from '@/lib/supabase-public'

export interface Track {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  audioUrl?: string
  /** Segundo en que va y duración (solo al avisar lo que suena) */
  pos?: number
  dur?: number
}
export interface Device {
  device: string
  name: string
  app: string
  playing: boolean
  track: Track | null
  at: number
}
export type CmdType = 'take' | 'pause' | 'play' | 'next' | 'prev'
interface Cmd {
  id?: string
  type: CmdType
  payload: { track?: Track; pos?: number; dur?: number } | null
  from: string
  at: number
}

interface DevicesState {
  others: Device[]
  setOthers: (o: Device[]) => void
  /** Control remoto activo (como Spotify Connect): la barra maneja otro dispositivo y la local se oculta */
  remote: boolean
  setRemote: (v: boolean) => void
}
export const useDevicesStore = create<DevicesState>()((set) => ({
  others: [],
  setOthers: (others) => set({ others }),
  remote: false,
  setRemote: (remote) => set({ remote }),
}))

const KEY = 'cpn-device-id'
export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'sin-id'
  }
}
export const deviceName = () => `${appBrand()} · ${isNativeApp() ? 'teléfono' : 'navegador'}`

/** Lo que suena aquí (para mostrarlo a los otros dispositivos) */
export function localState() {
  const st = useMusicStore.getState()
  const v = st.queue[st.currentIndex]
  const time = (window as unknown as { __cpnTime?: () => { t: number; d: number } }).__cpnTime?.()
  const track: Track | null = v
    ? {
        id: v.id,
        title: v.title.slice(0, 140),
        channelTitle: (v.channelTitle || '').slice(0, 80),
        thumbnail: v.thumbnail?.startsWith('http') ? v.thumbnail : '',
        ...(v.audioUrl?.startsWith('https://') ? { audioUrl: v.audioUrl } : {}),
      }
    : null
  return {
    playing: !!v && st.isPlaying,
    track: track ? { ...track, pos: time?.t ?? 0, dur: time?.d ?? 0 } : null,
  }
}

function toVideo(t: Track): MusicVideo {
  return { id: t.id, title: t.title, channelTitle: t.channelTitle, thumbnail: t.thumbnail, publishedAt: '', description: '', ...(t.audioUrl ? { audioUrl: t.audioUrl } : {}) } as MusicVideo
}

/** Empieza una canción en el segundo en que iba en el otro dispositivo */
function takeHere(track: Track, pos: number, dur: number) {
  const st = useMusicStore.getState()
  st.play([toVideo(track)], 0)
  st.setIsPlaying(true)
  if (pos <= 1) return
  // Se espera a que el audio cargue para ir al segundo
  let tries = 0
  const iv = setInterval(() => {
    const w = window as unknown as { __cpnSeek?: (s: number) => void; __cpnTime?: () => { d: number } }
    tries++
    if ((w.__cpnTime?.().d ?? 0) > 0 || tries > 40) {
      clearInterval(iv)
      if (dur > 0 && pos < dur) w.__cpnSeek?.(pos)
    }
  }, 250)
}

// Cada orden llega dos veces (canal en vivo y aviso al servidor): se aplica solo la primera
const applied: string[] = []
function apply(c: Cmd) {
  if (c.id) {
    if (applied.includes(c.id)) return
    applied.push(c.id)
    if (applied.length > 50) applied.shift()
  }
  const st = useMusicStore.getState()
  if (c.type === 'take' && c.payload?.track) takeHere(c.payload.track, c.payload.pos ?? 0, c.payload.dur ?? 0)
  else if (c.type === 'pause') st.setIsPlaying(false)
  else if (c.type === 'play') st.setIsPlaying(true)
  else if (c.type === 'next') st.playNext()
  else if (c.type === 'prev') st.playPrev()
}

// ── Canal en vivo de la cuenta (Supabase Realtime): órdenes y lo que suena llegan al instante ──
let live: { name: string; ch: RealtimeChannel; ready: boolean } | null = null

function joinLive(name: string | undefined) {
  if (live?.name === name) return
  if (live) supabasePublic().removeChannel(live.ch)
  live = null
  if (!name) return
  const ch = supabasePublic().channel(name, { config: { broadcast: { self: false } } })
  const cur = { name, ch, ready: false }
  live = cur
  ch.on('broadcast', { event: 'cmd' }, ({ payload }) => {
    const p = payload as { to?: string; cmd?: Cmd }
    if (p?.to === deviceId() && p.cmd) apply(p.cmd)
  })
    .on('broadcast', { event: 'state' }, ({ payload }) => {
      const dev = payload as Device
      if (!dev?.device || dev.device === deviceId()) return
      const others = useDevicesStore.getState().others.filter((o) => o.device !== dev.device)
      useDevicesStore.getState().setOthers([...others, dev])
    })
    .subscribe((status) => {
      cur.ready = status === 'SUBSCRIBED'
      if (cur.ready) broadcastState()
    })
}

/** ¿Conectado al canal en vivo? (entonces los avisos al servidor pueden ser menos seguidos) */
export const liveReady = () => !!live?.ready

function broadcast(event: 'cmd' | 'state', payload: unknown) {
  if (live?.ready) live.ch.send({ type: 'broadcast', event, payload }).catch(() => {})
}

function broadcastState() {
  const local = localState()
  broadcast('state', { device: deviceId(), name: deviceName(), app: isMusicApp() ? 'music' : 'media', playing: local.playing, track: local.track, at: Date.now() })
}

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

/** Un aviso al servidor: manda lo que suena, recibe los otros dispositivos y sus órdenes */
export async function presenceNow(cmd?: { id?: string; to: string; type: CmdType; payload?: Cmd['payload'] }): Promise<boolean> {
  const token = useAccountStore.getState().token
  if (!token) {
    joinLive(undefined)
    return false
  }
  const local = localState()
  broadcastState()
  const r = await callAccount<{ others: Device[]; cmds: Cmd[]; realtime?: { channel: string } }>({
    action: 'presence',
    token,
    device: deviceId(),
    name: deviceName(),
    app: isMusicApp() ? 'music' : 'media',
    state: { playing: local.playing, track: local.track },
    ...(cmd ? { cmd } : {}),
  }).catch(() => null)
  if (!r?.ok) return false
  useDevicesStore.getState().setOthers(r.others ?? [])
  for (const c of r.cmds ?? []) apply(c)
  joinLive(r.realtime?.channel)
  return true
}

/** Orden a otro dispositivo: al instante por el canal en vivo y, de respaldo, por el servidor */
async function command(to: string, type: CmdType, payload: Cmd['payload'] = null) {
  const id = newId()
  broadcast('cmd', { to, cmd: { id, type, payload, from: deviceName(), at: Date.now() } })
  await presenceNow({ id, to, type, payload })
}

/** Manda una orden a otro dispositivo (pausa, siguiente… o «pasa la música aquí») */
export async function sendTo(device: Device, type: CmdType) {
  if (type === 'take') {
    const local = localState()
    if (!local.track) return
    // Aquí se detiene; el otro lo empieza en el mismo segundo
    const { pos, dur, ...track } = local.track as Track & { pos: number; dur: number }
    useMusicStore.getState().setIsPlaying(false)
    await command(device.device, type, { track, pos, dur })
    return
  }
  await command(device.device, type)
  // Sin canal en vivo, el otro la recibe en su próximo aviso: se vuelve a preguntar para ver el cambio
  if (!live?.ready) for (const ms of [3000, 9000]) setTimeout(() => presenceNow(), ms)
}

/** Trae aquí lo que suena en el otro dispositivo (y lo pausa allá) */
export async function takeFrom(device: Device) {
  if (!device.track) return
  const { pos, dur, ...track } = device.track as Track & { pos: number; dur: number }
  takeHere(track, pos ?? 0, dur ?? 0)
  await command(device.device, 'pause')
}

/** Le da al teléfono la cuenta (y este dispositivo), para que avise lo que suena en segundo plano */
/**
 * ¿La app del teléfono avisa «qué suena» con mesura? (PulsoMedia 1.0.167+ / PulsoMusic 1.0.114+:
 * solo al cambiar y cada 5 min). Las versiones anteriores avisaban cada 10-30 s aunque estuviera en
 * pausa: a esas no se les da la cuenta (dejan de avisar) y avisa la página, con mesura.
 */
export function nativeHandlesPresence(): boolean {
  if (!isNativeApp()) return false
  try {
    const n = Number(String(getNative()?.version?.() ?? '').split('.')[2])
    return isFinite(n) && n >= (isMusicApp() ? 114 : 167)
  } catch {
    return false
  }
}

export function syncNativeAccount() {
  const token = nativeHandlesPresence() ? useAccountStore.getState().token : ''
  reportAccount(JSON.stringify({ token: token ?? '', device: deviceId(), name: deviceName(), app: isMusicApp() ? 'music' : 'media' }))
}

/** Lo que el teléfono le pide a este dispositivo (lo llama la app nativa al recibir órdenes) */
if (typeof window !== 'undefined') {
  ;(window as unknown as { __cpnDeviceCmd?: (c: Cmd) => void }).__cpnDeviceCmd = (c) => apply(c)
}
