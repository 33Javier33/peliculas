'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Cast, MonitorSmartphone, Tv2, X, Airplay } from 'lucide-react'

// Transmitir a la TV:
//  - Chromecast / Google TV / TV con Chromecast integrado (Chrome en Android y PC): se manda
//    la dirección del video y la TV lo reproduce sola (el teléfono queda libre).
//  - AirPlay (iPhone/iPad/Mac con Safari) hacia Apple TV o TV compatibles.
//  - Duplicar pantalla: se explica cómo hacerlo desde el teléfono (Smart View, Transmitir…).

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void
    cast?: any
    chrome?: any
  }
}

let castLoad: Promise<boolean> | null = null
function loadCast(): Promise<boolean> {
  if (castLoad) return castLoad
  castLoad = new Promise((resolve) => {
    // Solo los navegadores Chrome/Chromium pueden usar Chromecast
    if (!/Chrome|CriOS/.test(navigator.userAgent) || /CriOS/.test(navigator.userAgent)) return resolve(false)
    window.__onGCastApiAvailable = (available) => {
      if (!available) return resolve(false)
      try {
        window.cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        })
        resolve(true)
      } catch {
        resolve(false)
      }
    }
    const s = document.createElement('script')
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
    s.async = true
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
    setTimeout(() => resolve(false), 8000)
  })
  return castLoad
}

export interface CastMedia {
  /** Dirección del video (puede ser relativa: se completa con el dominio de la app) */
  url: string
  /** Otra dirección del mismo video (p. ej. la del intermediario): se prueba si la TV no puede con la primera */
  altUrl?: string
  title: string
  poster?: string
  live?: boolean
}

const absolute = (url: string) => (url.startsWith('/') ? `${window.location.origin}${url}` : url)
const isHls = (url: string) => /m3u8|\/api\/hls/i.test(url)

export default function CastButton({
  videoRef,
  media,
  className = '',
}: {
  videoRef: RefObject<HTMLVideoElement>
  media: CastMedia
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [castReady, setCastReady] = useState(false)
  const [airplay, setAirplay] = useState(false)
  const [castingTo, setCastingTo] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  // Lo que informa la TV: cargando, reproduciendo o error
  const [tvState, setTvState] = useState<'' | 'loading' | 'playing' | 'error'>('')
  const mediaRef = useRef(media)
  mediaRef.current = media

  useEffect(() => {
    setAirplay(typeof (window as any).WebKitPlaybackTargetAvailabilityEvent !== 'undefined')
    loadCast().then((ok) => {
      if (!ok) return
      setCastReady(true)
      const ctx = window.cast.framework.CastContext.getInstance()
      const update = () => {
        const session = ctx.getCurrentSession()
        setCastingTo(session ? session.getCastDevice()?.friendlyName || 'tu TV' : null)
      }
      ctx.addEventListener(window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, update)
      update()
    })
  }, [])

  /** Manda una dirección a la TV. La SDK no rechaza la promesa al fallar: devuelve un código de error. */
  const loadOnTv = async (session: any, m: CastMedia, url: string) => {
    const hls = isHls(url)
    const info = new window.chrome.cast.media.MediaInfo(absolute(url), hls ? 'application/x-mpegurl' : 'video/mp4')
    info.streamType = m.live ? window.chrome.cast.media.StreamType.LIVE : window.chrome.cast.media.StreamType.BUFFERED
    const meta = new window.chrome.cast.media.GenericMediaMetadata()
    meta.title = m.title
    meta.subtitle = 'Carlos P. Nauto Interactive'
    if (m.poster) meta.images = [new window.chrome.cast.Image(absolute(m.poster))]
    info.metadata = meta
    const request = new window.chrome.cast.media.LoadRequest(info)
    request.autoplay = true
    // El video sigue en la TV desde el punto en que iba (películas)
    const video = videoRef.current
    if (!m.live && video && video.currentTime > 5) request.currentTime = video.currentTime
    const error = await session.loadMedia(request)
    if (error) throw new Error(String(error))
    return session.getMediaSession()
  }

  const sendToCast = async (m: CastMedia) => {
    const ctx = window.cast.framework.CastContext.getInstance()
    if (!ctx.getCurrentSession()) await ctx.requestSession()
    const session = ctx.getCurrentSession()
    if (!session) return
    setTvState('loading')
    const urls = [m.url, m.altUrl].filter((u, i, a): u is string => !!u && a.indexOf(u) === i)

    for (let i = 0; i < urls.length; i++) {
      const isLast = i === urls.length - 1
      try {
        const mediaSession = await loadOnTv(session, m, urls[i])
        videoRef.current?.pause()
        // Se espera a que la TV confirme que reproduce; si da error, se prueba la otra dirección
        const ok = await new Promise<boolean>((resolve) => {
          if (!mediaSession) return resolve(true)
          const timer = setTimeout(() => resolve(true), 20000)
          const check = (alive: boolean) => {
            const state = mediaSession.playerState
            if (state === 'PLAYING' || state === 'BUFFERING' || state === 'PAUSED') {
              if (state === 'PLAYING') {
                clearTimeout(timer)
                resolve(true)
              }
            } else if (!alive || (state === 'IDLE' && mediaSession.idleReason === 'ERROR')) {
              clearTimeout(timer)
              resolve(false)
            }
          }
          mediaSession.addUpdateListener(check)
          check(true)
        })
        if (ok) {
          setTvState('playing')
          return
        }
      } catch (err) {
        if (isLast) {
          setTvState('error')
          throw err
        }
        continue
      }
      if (isLast) setTvState('error')
    }
  }

  // Si se cambia de canal mientras se transmite, la TV cambia también
  const lastSent = useRef('')
  useEffect(() => {
    if (!castingTo || lastSent.current === media.url) return
    lastSent.current = media.url
    sendToCast(media).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.url, castingTo])

  const chromecast = async () => {
    setMessage('')
    try {
      lastSent.current = mediaRef.current.url
      await sendToCast(mediaRef.current)
    } catch (err) {
      const code = (err as any)?.code || String(err)
      if (!/cancel/i.test(code)) setMessage('La TV no pudo abrir este video. Prueba otro canal o usa "Duplicar pantalla".')
    }
  }

  const stopCasting = () => {
    window.cast?.framework.CastContext.getInstance().endCurrentSession(true)
    lastSent.current = ''
    setTvState('')
    videoRef.current?.play().catch(() => {})
  }

  const airPlay = () => {
    const video = videoRef.current as any
    video?.webkitShowPlaybackTargetPicker?.()
    setOpen(false)
  }

  // Android sin Chromecast por SDK: la API de reproducción remota del navegador
  const remotePlayback = async () => {
    const video = videoRef.current as any
    try {
      await video?.remote?.prompt()
      setOpen(false)
    } catch {
      setMessage('Tu navegador no permite enviar este video. Usa "Duplicar pantalla".')
    }
  }
  const hasRemote = typeof window !== 'undefined' && 'remote' in HTMLMediaElement.prototype && !castReady

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`shrink-0 w-10 h-10 rounded-full bg-surface-2 border border-white/8 flex items-center justify-center ${
          castingTo ? 'text-emerald-400' : 'text-slate-300'
        } ${className}`}
        aria-label="Transmitir a la TV"
        title="Transmitir a la TV"
      >
        <Cast className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-md bg-surface-1 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Transmitir a la TV"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold font-display text-lg">Ver en la TV</h3>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>

            {castingTo && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-emerald-300 text-sm font-semibold truncate">Conectado a {castingTo}</p>
                  <p className="text-slate-400 text-xs">
                    {tvState === 'loading'
                      ? 'Cargando el video en la TV…'
                      : tvState === 'playing'
                        ? 'Reproduciendo en la TV'
                        : tvState === 'error'
                          ? 'La TV no pudo reproducir este video'
                          : 'Toca Chromecast para enviar el video'}
                  </p>
                </div>
                <button onClick={stopCasting} className="shrink-0 text-xs font-bold text-white bg-white/10 rounded-full px-3 py-1.5">
                  Detener
                </button>
              </div>
            )}

            <div className="space-y-2">
              {castReady && (
                <Option
                  icon={<Cast className="w-5 h-5" />}
                  title={castingTo ? 'Enviar este video a la TV' : 'Chromecast / Google TV'}
                  text="La TV reproduce el video sola; puedes usar el teléfono."
                  onClick={chromecast}
                />
              )}
              {hasRemote && (
                <Option icon={<Tv2 className="w-5 h-5" />} title="Enviar a un televisor" text="TV o dispositivo de transmisión en la misma red Wi-Fi." onClick={remotePlayback} />
              )}
              {airplay && (
                <Option icon={<Airplay className="w-5 h-5" />} title="AirPlay" text="Apple TV o televisores compatibles con AirPlay." onClick={airPlay} />
              )}
            </div>

            {message && <p className="mt-3 text-amber-300 text-sm">{message}</p>}

            <div className="mt-4 rounded-2xl bg-surface-2/60 border border-white/8 p-4">
              <p className="flex items-center gap-2 text-white font-semibold text-sm mb-2">
                <MonitorSmartphone className="w-5 h-5 text-violet-300" /> Duplicar pantalla (screen mirroring)
              </p>
              <ul className="text-slate-400 text-sm space-y-1.5 list-disc pl-5">
                <li>
                  <b className="text-slate-200">Android:</b> baja la barra de notificaciones y toca <i>Smart View</i> (Samsung),{' '}
                  <i>Transmitir</i>, <i>Proyección inalámbrica</i> o <i>Duplicar pantalla</i>. Elige tu TV.
                </li>
                <li>
                  <b className="text-slate-200">iPhone:</b> abre el Centro de control y toca <i>Duplicar pantalla</i>. Elige tu Apple TV o TV con AirPlay.
                </li>
                <li>Luego pon el video en pantalla completa y gira el teléfono.</li>
                <li>El teléfono y la TV deben estar en la misma red Wi-Fi.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Option({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 text-left rounded-2xl bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20 px-4 py-3"
    >
      <span className="shrink-0 w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center">{icon}</span>
      <span className="min-w-0">
        <span className="block text-white font-semibold text-sm">{title}</span>
        <span className="block text-slate-400 text-xs">{text}</span>
      </span>
    </button>
  )
}
