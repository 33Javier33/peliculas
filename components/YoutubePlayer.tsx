'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { X, ExternalLink, TvMinimalPlay, Heart, Clock3, RefreshCw, Loader2, AlertCircle, Settings2, Cast, MonitorSmartphone } from 'lucide-react'
import CastButton, { loadCast } from '@/components/CastButton'
import { useMusicStore } from '@/store/musicStore'

interface YoutubePlayerProps {
  videoId: string
  title: string
  channelTitle: string
  onClose: () => void
  liked?: boolean
  later?: boolean
  onToggleLike?: () => void
  onToggleLater?: () => void
}

interface VideoCandidate {
  url: string
  quality: number
}

// Calidades que se pueden pedir a YouTube (vq). "Máxima" pide la más alta que tenga el video.
const QUALITIES = [
  { id: 'highres', label: 'Máxima (4K si hay)' },
  { id: 'hd1080', label: '1080p' },
  { id: 'hd720', label: '720p' },
  { id: 'large', label: '480p' },
  { id: 'medium', label: '360p' },
  { id: 'auto', label: 'Automática' },
]
const QUALITY_HEIGHT: Record<string, number> = { highres: 9999, hd1080: 1080, hd720: 720, large: 480, medium: 360, auto: 9999 }

// Si YouTube no confirma que el reproductor cargó en este tiempo, se ofrece otra fuente
const LOAD_TIMEOUT_MS = 12000

/**
 * Reproductor de la sección Videos. Usa el reproductor de YouTube y, si el video no se
 * puede ver insertado (el dueño lo bloqueó fuera de YouTube, restricción por país…),
 * cambia solo a una fuente alternativa (Piped/Invidious) con un <video> propio.
 */
export default function YoutubePlayer({
  videoId,
  title,
  channelTitle,
  onClose,
  liked,
  later,
  onToggleLike,
  onToggleLater,
}: YoutubePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [mode, setMode] = useState<'youtube' | 'alt'>('youtube')
  const [ytReady, setYtReady] = useState(false)
  const [ytSlow, setYtSlow] = useState(false)
  const [autoSwitched, setAutoSwitched] = useState(false)
  const [alt, setAlt] = useState<{ candidates: VideoCandidate[]; index: number } | null>(null)
  const [altStatus, setAltStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  // Calidad pedida a YouTube (se recuerda). Por defecto la más alta disponible.
  const [quality, setQuality] = useState<string>(() => {
    try {
      return localStorage.getItem('cpn-video-quality') || 'highres'
    } catch {
      return 'highres'
    }
  })
  const [qualityOpen, setQualityOpen] = useState(false)
  // Transmitir a la TV: YouTube no deja enviar sus videos desde otra web; se abre en la app de
  // YouTube (que sí transmite) en el mismo segundo, o se usa la fuente alternativa con Chromecast
  const [castOpen, setCastOpen] = useState(false)
  const altVideoRef = useRef<HTMLVideoElement>(null)
  // Transmitir desde la app: se abre YouTube en la TV (Chromecast / Google TV) y se le indica el video
  const [tvStatus, setTvStatus] = useState<'' | 'connecting' | 'playing' | 'error' | 'unsupported'>('')
  const [tvName, setTvName] = useState('')
  const [tvError, setTvError] = useState('')
  const tvSessionRef = useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const castToTv = async () => {
    setTvError('')
    setTvStatus('connecting')
    if (!(await loadCast())) return setTvStatus('unsupported')
    const cast = (window as any).chrome?.cast // eslint-disable-line @typescript-eslint/no-explicit-any
    const NS = 'urn:x-cast:com.google.youtube.mdx'
    const fail = (msg: string) => {
      setTvError(msg)
      setTvStatus('error')
    }
    cast.requestSession(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session: any) => {
        tvSessionRef.current = session
        setTvName(session.receiver?.friendlyName || 'tu TV')
        let done = false
        const timer = setTimeout(() => !done && fail('La TV no respondió. Prueba de nuevo.'), 15000)
        session.addMessageListener(NS, async (_ns: string, message: string) => {
          let data: { type?: string; data?: { screenId?: string } }
          try {
            data = JSON.parse(message)
          } catch {
            return
          }
          const screenId = data.data?.screenId
          if (done || data.type !== 'mdxSessionStatus' || !screenId) return
          done = true
          clearTimeout(timer)
          try {
            const r = await fetch('/api/yt-cast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ screenId, videoId, currentTime: timeRef.current }),
            })
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || 'No se pudo enviar')
            setTvStatus('playing')
            // El video sigue en la TV: aquí se pausa
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
            altVideoRef.current?.pause()
          } catch (err) {
            fail((err as Error).message)
          }
        })
        session.sendMessage(NS, { type: 'getMdxSessionStatus' }, () => {}, () => fail('No se pudo hablar con YouTube en la TV'))
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: any) => (/cancel/i.test(err?.code || '') ? setTvStatus('') : fail('No se pudo conectar con la TV')),
      new cast.SessionRequest('233637DE') // la app de YouTube del Chromecast / Google TV
    )
  }
  const stopTv = () => {
    try {
      tvSessionRef.current?.stop(() => {}, () => {})
    } catch {}
    tvSessionRef.current = null
    setTvStatus('')
  }
  // Segundo en que va el video (para seguir desde ahí al cambiar la calidad)
  const timeRef = useRef(0)
  const [startAt, setStartAt] = useState(0)
  const chooseQuality = (q: string) => {
    setQualityOpen(false)
    if (q === quality) return
    try {
      localStorage.setItem('cpn-video-quality', q)
    } catch {}
    setStartAt(Math.floor(timeRef.current))
    setQuality(q)
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    // El video y la música no suenan a la vez
    useMusicStore.getState().setIsPlaying(false)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  const switchToAlt = useCallback((automatic: boolean) => {
    setAutoSwitched(automatic)
    setMode('alt')
  }, [])

  // Mensajes del reproductor de YouTube: "listo" o "error" (video no insertable, eliminado…)
  useEffect(() => {
    if (mode !== 'youtube') return
    setYtReady(false)
    setYtSlow(false)
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin)) return
      let data: { event?: string; info?: unknown }
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (data.event === 'onReady' || data.event === 'initialDelivery' || data.event === 'infoDelivery') setYtReady(true)
      const info = data.info as { currentTime?: number } | undefined
      if (typeof info?.currentTime === 'number') timeRef.current = info.currentTime
      if (data.event === 'onError') switchToAlt(true)
    }
    window.addEventListener('message', onMessage)
    const slow = setTimeout(() => setYtSlow(true), LOAD_TIMEOUT_MS)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(slow)
    }
  }, [mode, videoId, switchToAlt])

  // Pide al iframe que avise de sus eventos (API de YouTube vía postMessage)
  const handleIframeLoad = () => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    const send = () => {
      win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
      // Pide la calidad elegida (YouTube la respeta si el video la tiene y la conexión alcanza)
      if (quality !== 'auto') win.postMessage(JSON.stringify({ event: 'command', func: 'setPlaybackQuality', args: [quality] }), '*')
    }
    send()
    setTimeout(send, 1000)
    setTimeout(send, 3000)
  }

  // Fuente alternativa
  useEffect(() => {
    if (mode !== 'alt') return
    let cancelled = false
    setAltStatus('loading')
    setAlt(null)
    fetch(`/api/video-source?id=${encodeURIComponent(videoId)}`)
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d: { candidates?: VideoCandidate[] }) => {
        if (cancelled) return
        if (d.candidates?.length) {
          // La fuente alternativa más cercana a la calidad elegida (sin pasarse)
          const want = QUALITY_HEIGHT[quality] ?? 9999
          const sorted = [...d.candidates].sort((a, b) => b.quality - a.quality)
          const idx = Math.max(0, sorted.findIndex((c) => c.quality <= want))
          setAlt({ candidates: sorted, index: idx })
          setAltStatus('ready')
        } else setAltStatus('error')
      })
      .catch(() => !cancelled && setAltStatus('error'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, videoId])

  const handleAltError = () => {
    if (alt && alt.index + 1 < alt.candidates.length) setAlt({ ...alt, index: alt.index + 1 })
    else setAltStatus('error')
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const iconBtn = 'p-2 rounded-lg transition-all duration-200'

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-obsidian border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center shrink-0">
            <TvMinimalPlay className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate max-w-[45vw] sm:max-w-[60vw]">{title}</p>
            <p className="text-slate-400 text-xs truncate">{channelTitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {onToggleLater && (
            <button
              onClick={onToggleLater}
              className={`${iconBtn} ${later ? 'text-emerald-400' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              aria-label={later ? 'Quitar de Ver más tarde' : 'Ver más tarde'}
              aria-pressed={later}
              title={later ? 'Quitar de Ver más tarde' : 'Ver más tarde'}
            >
              <Clock3 className="w-5 h-5" />
            </button>
          )}
          {onToggleLike && (
            <button
              onClick={onToggleLike}
              className={`${iconBtn} ${liked ? 'text-violet-300' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              aria-label={liked ? 'Quitar de Me gusta' : 'Me gusta'}
              aria-pressed={liked}
              title={liked ? 'Quitar de Me gusta' : 'Me gusta'}
            >
              <Heart className={`w-5 h-5 ${liked ? 'fill-violet-300' : ''}`} />
            </button>
          )}
          <button
            onClick={() => setCastOpen(true)}
            className={`${iconBtn} text-slate-400 hover:text-white hover:bg-white/10`}
            aria-label="Ver en la TV"
            title="Ver en la TV"
          >
            <Cast className="w-5 h-5" />
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${iconBtn} text-slate-400 hover:text-white hover:bg-white/10 hidden sm:block`}
            title="Abrir en YouTube"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button onClick={onClose} className={`${iconBtn} text-slate-400 hover:text-white hover:bg-white/10`} title="Cerrar (Esc)" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 min-h-0 gap-3">
        <div className="w-full max-w-6xl">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-2xl shadow-black bg-black">
            {mode === 'youtube' ? (
              <iframe
                ref={iframeRef}
                key={`${videoId}-${quality}`}
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&color=white&hl=es&cc_lang_pref=es&playsinline=1&enablejsapi=1${
                  quality !== 'auto' ? `&vq=${quality}` : ''
                }${startAt ? `&start=${startAt}` : ''}&origin=${encodeURIComponent(origin)}`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={handleIframeLoad}
                className="absolute inset-0 w-full h-full"
              />
            ) : altStatus === 'ready' && alt ? (
              <video
                ref={altVideoRef}
                key={alt.candidates[alt.index].url}
                src={alt.candidates[alt.index].url}
                controls
                autoPlay
                playsInline
                onError={handleAltError}
                className="absolute inset-0 w-full h-full bg-black"
              />
            ) : altStatus === 'loading' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
                <Loader2 className="w-10 h-10 text-violet-300 animate-spin" />
                <p className="text-sm">{autoSwitched ? 'YouTube no permite verlo aquí. Buscando otra fuente…' : 'Buscando otra fuente…'}</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
                <AlertCircle className="w-9 h-9 text-red-400" />
                <p className="text-white font-semibold">Este video no está disponible en ninguna fuente</p>
                <p className="text-slate-400 text-sm">Puede estar eliminado o bloqueado en tu país.</p>
                <a
                  href={`https://www.youtube.com/watch?v=${videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-2 bg-surface-2 border border-white/10 text-slate-200 text-sm font-semibold px-4 py-2 rounded-full"
                >
                  <ExternalLink className="w-4 h-4" /> Abrir en YouTube
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Cambiar de fuente a mano (si queda en negro, sin sonido, etc.) */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <div className="relative">
            <button
              onClick={() => setQualityOpen((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold bg-surface-2/80 border border-white/10 text-slate-200 hover:text-white"
              aria-haspopup="menu"
              aria-expanded={qualityOpen}
            >
              <Settings2 className="w-4 h-4" /> Calidad: {QUALITIES.find((q) => q.id === quality)?.label ?? 'Máxima'}
            </button>
            {qualityOpen && (
              <div role="menu" className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 w-44 rounded-xl bg-surface-1 border border-white/10 shadow-2xl overflow-hidden">
                {QUALITIES.map((q) => (
                  <button
                    key={q.id}
                    role="menuitemradio"
                    aria-checked={q.id === quality}
                    onClick={() => chooseQuality(q.id)}
                    className={`w-full text-left px-4 py-2.5 text-sm ${q.id === quality ? 'bg-violet-500/20 text-violet-200 font-semibold' : 'text-slate-200 hover:bg-white/5'}`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {mode === 'youtube' ? (
            <button
              onClick={() => switchToAlt(false)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-colors ${
                ytSlow && !ytReady
                  ? 'bg-violet-500 text-white shadow-glow'
                  : 'bg-surface-2/80 border border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4" /> ¿No carga? Probar otra fuente
            </button>
          ) : (
            <>
              {altStatus === 'ready' && alt && alt.candidates.length > 1 && (
                <button
                  onClick={handleAltError}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold bg-surface-2/80 border border-white/10 text-slate-300 hover:text-white"
                >
                  <RefreshCw className="w-4 h-4" /> Otra fuente ({alt.index + 1}/{alt.candidates.length})
                </button>
              )}
              <button
                onClick={() => setMode('youtube')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold bg-surface-2/80 border border-white/10 text-slate-300 hover:text-white"
              >
                <TvMinimalPlay className="w-4 h-4" /> Volver al reproductor de YouTube
              </button>
            </>
          )}
        </div>
      </div>
      {castOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setCastOpen(false)}>
          <div
            className="w-full sm:max-w-md bg-surface-1 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Ver en la TV"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold font-display text-lg">Ver en la TV</h3>
              <button onClick={() => setCastOpen(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            {tvStatus === 'playing' ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-emerald-300 text-sm font-semibold truncate">Reproduciendo en {tvName}</p>
                  <p className="text-slate-400 text-xs">Usa el control de la TV para pausar o adelantar</p>
                </div>
                <button onClick={stopTv} className="shrink-0 text-xs font-bold text-white bg-white/10 rounded-full px-3 py-1.5">
                  Detener
                </button>
              </div>
            ) : (
              <button
                onClick={castToTv}
                disabled={tvStatus === 'connecting'}
                className="w-full flex items-center gap-3 text-left rounded-2xl bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20 px-4 py-3 mb-2 disabled:opacity-70"
              >
                <span className="shrink-0 w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center">
                  {tvStatus === 'connecting' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cast className="w-5 h-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-white font-semibold text-sm">
                    {tvStatus === 'connecting' ? 'Conectando con la TV…' : 'Transmitir a Chromecast / Google TV'}
                  </span>
                  <span className="block text-slate-400 text-xs">La TV abre YouTube y pone este video desde el mismo segundo.</span>
                </span>
              </button>
            )}
            {tvStatus === 'unsupported' && (
              <p className="text-amber-300 text-sm mb-2">Para transmitir abre esta app con Google Chrome (en Android o computador).</p>
            )}
            {tvStatus === 'error' && <p className="text-amber-300 text-sm mb-2">{tvError}</p>}
            {mode === 'alt' && altStatus === 'ready' && alt && (
              <div className="flex items-center gap-3 rounded-2xl bg-violet-500/10 border border-violet-500/30 px-4 py-3 mb-2">
                <CastButton videoRef={altVideoRef} media={{ url: alt.candidates[alt.index].url, title, poster: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }} />
                <span className="text-slate-300 text-sm">Enviar esta fuente con Chromecast o AirPlay</span>
              </div>
            )}
            <div className="rounded-2xl bg-surface-2/60 border border-white/8 p-4">
              <p className="flex items-center gap-2 text-white font-semibold text-sm mb-2">
                <MonitorSmartphone className="w-5 h-5 text-violet-300" /> Duplicar pantalla
              </p>
              <ul className="text-slate-400 text-sm space-y-1.5 list-disc pl-5">
                <li>
                  <b className="text-slate-200">Android:</b> baja la barra de notificaciones y toca <i>Smart View</i>, <i>Transmitir</i> o{' '}
                  <i>Duplicar pantalla</i>.
                </li>
                <li>
                  <b className="text-slate-200">iPhone:</b> Centro de control → <i>Duplicar pantalla</i>.
                </li>
                <li>Luego pon el video en pantalla completa.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
