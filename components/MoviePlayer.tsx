'use client'

import TranslatableText from '@/components/TranslatableText'
import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, X, Clock, Cast, Download, CheckCircle2, Trash2, Subtitles, RotateCcw } from 'lucide-react'
import type { FreeMovie } from '@/lib/pluto'
import type { ArchiveVideo } from '@/lib/archive'
import { useMusicStore } from '@/store/musicStore'
import { useMovieStore, movieKey } from '@/store/movieStore'
import { getVideoParts, formatSize } from '@/lib/offline-files'
import CastButton, { useIsCasting, useCastStore } from '@/components/CastButton'
import HlsQualityMenu, { levelFor, readQualityPref, type QualityPref } from '@/components/HlsQuality'

// Reproductor de películas a pantalla completa: HLS (Pluto TV) o MP4/WebM (Internet Archive y
// Wikimedia Commons). Sigue donde quedaste, muestra subtítulos en español si la película los
// trae y se puede descargar para verla sin conexión.

const clock = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

/** Las películas de dominio público se pueden guardar en el teléfono (Pluto TV no) */
export const canSaveMovie = (m: FreeMovie) => m.source === 'archive' || m.source === 'commons'

export default function MoviePlayer({ movie, onClose }: { movie: FreeMovie; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [info, setInfo] = useState<ArchiveVideo | null>(
    movie.source === 'archive' ? null : { url: movie.url, download: movie.url, subtitles: [] }
  )
  const [url, setUrl] = useState(movie.source === 'archive' ? '' : movie.url)
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading')
  const download = useMovieStore((s) => s.downloads[movie.id])
  const progress = useMovieStore((s) => s.active[movie.id])
  const saved = useMovieStore((s) => s.watching[movie.id])
  const [resumeNote, setResumeNote] = useState<number | null>(null)
  const startAt = useRef<number>(saved?.t ?? 0)

  // Descargada: se ve desde el teléfono (sin internet)
  const [offlineUrl, setOfflineUrl] = useState<string | null>(null)
  const [offlineChecked, setOfflineChecked] = useState(!download?.done)
  useEffect(() => {
    if (!download?.done) return setOfflineChecked(true)
    let objectUrl = ''
    let cancelled = false
    getVideoParts(movieKey(movie.id), download.parts, download.mime)
      .then((blob) => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setOfflineUrl(objectUrl)
      })
      .catch(() => {})
      .finally(() => !cancelled && setOfflineChecked(true))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // Solo al abrir (o al terminar de descargar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id, download?.done])

  // Las películas del archivo traen la dirección del video y sus subtítulos al abrirlas
  useEffect(() => {
    setStatus('loading')
    if (movie.source !== 'archive') return
    const id = movie.id.replace(/^archive-/, '')
    let cancelled = false
    fetch(`/api/free-movies?archive=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ArchiveVideo) => {
        if (cancelled) return
        setInfo(d)
        setUrl(d.url)
      })
      .catch(() => !cancelled && !useMovieStore.getState().downloads[movie.id]?.done && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [movie])

  // Cerrar con la tecla Escape y bloquear el scroll de fondo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Mientras se ve en la TV, el teléfono no la reproduce; al dejar de transmitir sigue desde ese punto
  const casting = useIsCasting()
  // Calidad de video (por defecto la más alta; se recuerda)
  const hlsRef = useRef<import('hls.js').default | null>(null)
  const [levels, setLevels] = useState<{ height?: number }[]>([])
  const [quality, setQuality] = useState<QualityPref>('max')
  const qualityRef = useRef<QualityPref>('max')
  useEffect(() => {
    const q = readQualityPref()
    qualityRef.current = q
    setQuality(q)
  }, [])
  const changeQuality = (q: QualityPref) => {
    qualityRef.current = q
    setQuality(q)
    const h = hlsRef.current
    if (!h) return
    h.capLevelToPlayerSize = q === 'auto'
    h.currentLevel = levelFor(q, h.levels)
  }
  const castDevice = useCastStore((s) => s.device)

  // "Seguir viendo": se guarda dónde vas (cada 10 segundos, al pausar y al cerrar)
  const savable = canSaveMovie(movie)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !savable) return
    let last = 0
    const save = () => {
      if (video.currentTime > 0) useMovieStore.getState().saveProgress(movie, video.currentTime, video.duration)
    }
    const onTime = () => {
      if (Math.abs(video.currentTime - last) < 10) return
      last = video.currentTime
      save()
    }
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('pause', save)
    return () => {
      save()
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('pause', save)
    }
  }, [movie, savable])

  // Fuentes en orden: la copia del teléfono, la de internet y la de respaldo
  const sources = [offlineUrl, url, movie.fallbackUrl].filter((s, i, a): s is string => !!s && a.indexOf(s) === i)
  const [srcIdx, setSrcIdx] = useState(0)
  useEffect(() => setSrcIdx(0), [offlineUrl, url])
  const src = offlineChecked ? sources[srcIdx] : undefined

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src || casting) return
    useMusicStore.getState().setIsPlaying(false)
    let destroyed = false
    const onMeta = () => {
      const at = startAt.current
      if (at > 30 && (!video.duration || at < video.duration - 60)) {
        video.currentTime = at
        setResumeNote(at)
      }
    }
    video.addEventListener('loadedmetadata', onMeta, { once: true })
    let hls: import('hls.js').default | null = null
    const onPlaying = () => setStatus('playing')
    video.addEventListener('playing', onPlaying)
    const next = () => {
      if (destroyed) return
      if (srcIdx + 1 < sources.length) setSrcIdx(srcIdx + 1)
      else setStatus('error')
    }

    if (!/m3u8|\/api\/hls/.test(src)) {
      video.src = src
      video.onerror = next
      video.play().catch(() => {})
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (destroyed) return
        if (!Hls.isSupported()) {
          video.src = src
          video.onerror = next
          video.play().catch(() => {})
          return
        }
        const instance = new Hls({ enableWorker: true, maxBufferLength: 60, capLevelToPlayerSize: qualityRef.current === 'auto', fragLoadingMaxRetry: 6 })
        hls = instance
        hlsRef.current = instance
        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          setLevels(instance.levels.map((l) => ({ height: l.height })))
          const lvl = levelFor(qualityRef.current, instance.levels)
          if (lvl >= 0) instance.currentLevel = lvl
        })
        let recoveries = 0
        instance.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal || destroyed) return
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries++ < 2) instance.recoverMediaError()
          else next()
        })
        instance.loadSource(src)
        instance.attachMedia(video)
        video.play().catch(() => {})
      })
    }

    return () => {
      destroyed = true
      if (video.currentTime > 5) startAt.current = video.currentTime
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('loadedmetadata', onMeta)
      video.onerror = null
      hls?.destroy()
      hlsRef.current = null
      video.removeAttribute('src')
      video.load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, casting])

  // El aviso "Continuando desde…" se oculta solo
  useEffect(() => {
    if (resumeNote === null) return
    const t = setTimeout(() => setResumeNote(null), 6000)
    return () => clearTimeout(t)
  }, [resumeNote])

  const subtitles = info?.subtitles ?? []
  // Subtítulos en español activados de entrada si la película no está hablada en español
  const defaultSub = movie.spanish ? -1 : subtitles.findIndex((s) => s.lang === 'es')

  const downloadUrl = info?.download || (movie.source === 'commons' ? movie.url : '')
  const pct = progress !== undefined ? Math.round(progress * 100) : null

  return (
    <div className="fixed inset-0 z-[110] bg-obsidian overflow-y-auto" role="dialog" aria-label={movie.title}>
      <div className="max-w-5xl mx-auto sm:pt-6">
        <div className="relative aspect-video bg-black sm:rounded-2xl overflow-hidden" data-cpn-video="">
          <video
            ref={videoRef}
            controls
            playsInline
            autoPlay
            poster={movie.backdrop || (movie.landscape ? movie.poster : undefined)}
            className={`w-full h-full ${casting ? 'invisible' : ''}`}
          >
            {subtitles.map((s, i) => (
              <track key={s.src} kind="subtitles" src={s.src} srcLang={s.lang} label={s.label} default={i === defaultSub} />
            ))}
          </video>
          {!casting && levels.length > 0 && (
            <HlsQualityMenu levels={levels} pref={quality} onChange={changeQuality} className="absolute top-2 left-2 z-20" />
          )}
          {resumeNote !== null && !casting && (
            <button
              onClick={() => {
                const v = videoRef.current
                if (v) v.currentTime = 0
                setResumeNote(null)
              }}
              className="absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded-full bg-black/75 border border-white/15 px-3 py-1.5 text-xs text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Seguías en {clock(resumeNote)} · Ver desde el inicio
            </button>
          )}
          {casting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-violet-950 to-black text-center px-6">
              <Cast className="w-10 h-10 text-emerald-400" />
              <p className="text-white font-semibold">Viendo en {castDevice || 'la TV'}</p>
              <p className="text-slate-400 text-sm">Pausa, adelanta o detén desde el botón de transmitir o la notificación.</p>
            </div>
          )}
          {status === 'loading' && !casting && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Loader2 className="w-10 h-10 text-violet-300 animate-spin" />
            </div>
          )}
          {status === 'error' && !casting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-center px-6">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-white font-semibold">Esta película no se pudo cargar</p>
              <p className="text-slate-400 text-sm">
                {typeof navigator !== 'undefined' && !navigator.onLine ? 'Sin conexión: descárgala para verla sin internet.' : 'Prueba con otra o vuelve a intentarlo más tarde.'}
              </p>
            </div>
          )}
        </div>
        <div className="px-4 sm:px-1 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-white text-xl font-bold font-display">{movie.title}</h2>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 text-sm mt-1">
                {movie.year && <span>{movie.year}</span>}
                {movie.duration ? (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {movie.duration} min
                  </span>
                ) : null}
                {movie.genre && <span>{movie.genre}</span>}
                {movie.spanish && <span className="px-1.5 rounded bg-emerald-500/15 text-emerald-300 text-xs font-semibold">Español</span>}
                {subtitles.some((s) => s.lang === 'es') && (
                  <span className="flex items-center gap-1 text-xs text-sky-300">
                    <Subtitles className="w-3.5 h-3.5" /> Subtítulos en español
                  </span>
                )}
                {movie.rating && <span className="px-1.5 rounded border border-white/20 text-xs">{movie.rating}</span>}
              </p>
            </div>
            {url && <CastButton videoRef={videoRef} media={{ url, altUrl: movie.fallbackUrl, title: movie.title, poster: movie.poster }} />}
            <button
              onClick={onClose}
              className="shrink-0 w-10 h-10 rounded-full bg-surface-2 border border-white/8 flex items-center justify-center text-slate-300"
              aria-label="Cerrar película"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {savable && (downloadUrl || download) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {download?.done ? (
                <>
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-4 py-2 text-sm font-semibold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" /> Descargada · {formatSize(download.size)}
                  </span>
                  <button
                    onClick={() => confirm(`¿Borrar "${movie.title}" del teléfono?`) && useMovieStore.getState().remove(movie.id)}
                    className="flex items-center gap-1.5 rounded-full bg-surface-2 border border-white/8 px-4 py-2 text-sm text-slate-300"
                  >
                    <Trash2 className="w-4 h-4" /> Borrar
                  </button>
                </>
              ) : pct !== null || download ? (
                <>
                  <span className="relative overflow-hidden flex items-center gap-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 px-4 py-2 text-sm font-semibold text-violet-200">
                    <span className="absolute inset-y-0 left-0 bg-violet-500/25" style={{ width: `${pct ?? 0}%` }} />
                    {pct !== null ? <Loader2 className="relative w-4 h-4 animate-spin" /> : <Download className="relative w-4 h-4" />}
                    <span className="relative">{pct !== null ? `Descargando ${pct}%` : 'Descarga en pausa'}</span>
                  </span>
                  {pct === null && downloadUrl && (
                    <button onClick={() => useMovieStore.getState().download(movie, download?.url || downloadUrl)} className="rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-white">
                      Continuar
                    </button>
                  )}
                  <button onClick={() => useMovieStore.getState().cancel(movie.id)} className="rounded-full bg-surface-2 border border-white/8 px-4 py-2 text-sm text-slate-300">
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => useMovieStore.getState().download(movie, downloadUrl)}
                  className="flex items-center gap-1.5 rounded-full bg-surface-2 border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:border-violet-500/60"
                >
                  <Download className="w-4 h-4" /> Descargar para ver sin internet
                  {info?.downloadSize ? <span className="text-slate-400 font-normal">· {formatSize(info.downloadSize)}</span> : null}
                </button>
              )}
            </div>
          )}

          {movie.summary && (
            <div className="mt-4">
              <TranslatableText text={movie.summary} className="text-slate-300 text-sm leading-relaxed" />
            </div>
          )}
          {movie.source && movie.source !== 'pluto' && (
            <p className="text-slate-600 text-xs mt-4">
              {movie.source === 'commons' ? 'Wikimedia Commons' : 'Internet Archive'} · película de dominio público o con licencia libre
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
