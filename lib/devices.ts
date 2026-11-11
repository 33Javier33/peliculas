'use client'

// Dispositivos de una cuenta: PulsoMedia, PulsoMusic y el navegador comparten lo que suena.
// Cada uno avisa qué suena (cada pocos segundos, con sesión iniciada) y recibe órdenes de los otros:
// «pasa la música aquí», «pausa», «siguiente», etc.
import { create } from 'zustand'
import { callAccount } from '@/lib/account-sync'
import { useAccountStore } from '@/store/accountStore'
import { useMusicStore } from '@/store/musicStore'
import { isNativeApp, reportAccount } from '@/lib/native'
import { isMusicApp, appBrand } from '@/lib/app-flavor'
import type { MusicVideo } from '@/lib/youtube-music'

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
  type: CmdType
  payload: { track?: Track; pos?: number; dur?: number } | null
  from: string
  at: number
}

interface DevicesState {
  others: Device[]
  setOthers: (o: Device[]) => void
}
export const useDevicesStore = create<DevicesState>()((set) => ({
  others: [],
  setOthers: (others) => set({ others }),
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

function apply(c: Cmd) {
  const st = useMusicStore.getState()
  if (c.type === 'take' && c.payload?.track) takeHere(c.payload.track, c.payload.pos ?? 0, c.payload.dur ?? 0)
  else if (c.type === 'pause') st.setIsPlaying(false)
  else if (c.type === 'play') st.setIsPlaying(true)
  else if (c.type === 'next') st.playNext()
  else if (c.type === 'prev') st.playPrev()
}

/** Un aviso al servidor: manda lo que suena, recibe los otros dispositivos y sus órdenes */
export async function presenceNow(cmd?: { to: string; type: CmdType; payload?: Cmd['payload'] }): Promise<boolean> {
  const token = useAccountStore.getState().token
  if (!token) return false
  const local = localState()
  const r = await callAccount<{ others: Device[]; cmds: Cmd[] }>({
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
  return true
}

/** Manda una orden a otro dispositivo (pausa, siguiente… o «pasa la música aquí») */
export async function sendTo(device: Device, type: CmdType) {
  if (type === 'take') {
    const local = localState()
    if (!local.track) return
    // Aquí se detiene; el otro lo empieza en el mismo segundo
    const { pos, dur, ...track } = local.track as Track & { pos: number; dur: number }
    useMusicStore.getState().setIsPlaying(false)
    await presenceNow({ to: device.device, type, payload: { track, pos, dur } })
    return
  }
  await presenceNow({ to: device.device, type })
}

/** Trae aquí lo que suena en el otro dispositivo (y lo pausa allá) */
export async function takeFrom(device: Device) {
  if (!device.track) return
  const { pos, dur, ...track } = device.track as Track & { pos: number; dur: number }
  takeHere(track, pos ?? 0, dur ?? 0)
  await presenceNow({ to: device.device, type: 'pause' })
}

/** Le da al teléfono la cuenta (y este dispositivo), para que avise lo que suena en segundo plano */
export function syncNativeAccount() {
  const token = useAccountStore.getState().token
  reportAccount(JSON.stringify({ token: token ?? '', device: deviceId(), name: deviceName(), app: isMusicApp() ? 'music' : 'media' }))
}

/** Lo que el teléfono le pide a este dispositivo (lo llama la app nativa al recibir órdenes) */
if (typeof window !== 'undefined') {
  ;(window as unknown as { __cpnDeviceCmd?: (c: Cmd) => void }).__cpnDeviceCmd = (c) => apply(c)
}
