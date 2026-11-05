'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AudioLines, Loader2, Play, Download, CheckCircle2, FileAudio, ClipboardPaste, AlertCircle, ChevronLeft } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import { youTubeId, convertedTrack, saveConverted, audioFileUrl, CONVERTED_ALBUM } from '@/lib/yt-convert'
import { useMusicStore } from '@/store/musicStore'
import { useOfflineStore } from '@/store/offlineStore'
import { useLinksStore } from '@/store/linksStore'
import { formatSize } from '@/lib/offline-files'

// Convertir a audio: pegas enlaces de YouTube y se guarda solo el sonido (sin video) en tu
// biblioteca, listo para escuchar sin internet o bajar como archivo de audio.
export default function ConvertClient() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<MusicVideo[]>([])
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Al compartir un video desde YouTube a la app (o con ?u=enlace) se convierte al tiro
  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get('u')
    if (u) {
      setText(u)
      convert(u)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const convert = async (raw = text) => {
    setError('')
    const ids = Array.from(new Set(raw.split(/[\s,]+/).map(youTubeId).filter((x): x is string => !!x))).slice(0, 25)
    if (!ids.length) return setError('No encontramos un enlace de YouTube. Copia el enlace del video (por ejemplo https://youtu.be/…) y pégalo aquí.')
    setBusy(true)
    const list = await Promise.all(
      ids.map((id) =>
        fetch(`/api/yt-info?id=${id}`)
          .then((r) => r.json())
          .catch(() => ({ id, title: 'Video de YouTube' }))
          .then((d: { id: string; title: string; channelTitle?: string; thumbnail?: string }) => convertedTrack({ ...d, id }))
      )
    )
    setBusy(false)
    setResults(list)
    // Queda en tu biblioteca y se descarga (sin internet)
    saveConverted(list, true)
  }

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) {
        setText(t)
        convert(t)
      }
    } catch {
      setError('No se pudo leer el portapapeles: mantén presionado el cuadro y elige «Pegar».')
    }
  }

  // Todo lo convertido antes
  const albums = useLinksStore((s) => s.albums)
  const linkTracks = useLinksStore((s) => s.tracks)
  const previous = useMemo(() => {
    const al = albums.find((a) => a.id === CONVERTED_ALBUM)
    return al ? al.trackIds.map((id) => linkTracks.find((t) => t.id === id)).filter((t): t is MusicVideo => !!t) : []
  }, [albums, linkTracks])
  const shown = results.length ? [...results, ...previous.filter((p) => !results.some((r) => r.id === p.id))] : previous

  return (
    <div className="pt-24 pb-40 px-4 max-w-3xl mx-auto min-h-screen">
      <Link href="/music/library" className="inline-flex items-center gap-1 text-slate-400 text-sm hover:text-white">
        <ChevronLeft className="w-4 h-4" /> Biblioteca
      </Link>
      <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold text-white font-display">
        <AudioLines className="w-8 h-8 text-cyan-300" /> Convertir a audio
      </h1>
      <p className="mt-2 text-slate-400 text-sm">
        Pega el enlace de una canción de YouTube: se guarda solo el sonido (sin video) en tu biblioteca, para escucharla sin internet y con la
        pantalla apagada. También puedes bajarla como archivo de audio.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          convert()
        }}
        className="mt-6 rounded-2xl bg-surface-1 border border-white/10 p-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={'https://youtu.be/…\n(puedes pegar varios enlaces, uno por línea)'}
          className="w-full bg-transparent text-white placeholder-slate-500 text-sm resize-none focus:outline-none px-1"
          aria-label="Enlaces de YouTube"
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white font-bold text-sm disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AudioLines className="w-4 h-4" />} Convertir
          </button>
          <button type="button" onClick={paste} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 text-slate-200 text-sm">
            <ClipboardPaste className="w-4 h-4" /> Pegar
          </button>
        </div>
      </form>
      {error && (
        <p className="mt-3 flex items-start gap-2 text-amber-200 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {mounted && shown.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-white font-bold text-lg font-display flex-1">{results.length ? 'Convertidas' : 'Convertidas antes'}</h2>
            <button
              onClick={() => useMusicStore.getState().play(shown, 0)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-violet-500 text-white text-sm font-semibold"
            >
              <Play className="w-4 h-4 fill-white" /> Escuchar
            </button>
          </div>
          <ul className="divide-y divide-white/5 rounded-2xl bg-surface-1/60 border border-white/8">
            {shown.map((t, i) => (
              <Row key={t.id} track={t} onPlay={() => useMusicStore.getState().play(shown, i)} />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 rounded-2xl bg-surface-1/60 border border-white/8 p-4 text-slate-400 text-xs leading-relaxed space-y-1.5">
        <p>
          <b className="text-slate-200">Formato:</b> audio AAC (.m4a), la mejor calidad que entrega YouTube. Suena en la app, en el teléfono y en
          cualquier reproductor, igual que un MP3.
        </p>
        <p>
          <b className="text-slate-200">Dónde queda:</b> Biblioteca → disco «Convertidas de YouTube» y en Descargadas.
        </p>
        <p>Úsalo para tu uso personal y con música que puedas guardar: la tuya, libre o con permiso de quien la publicó.</p>
      </div>
    </div>
  )
}

function Row({ track, onPlay }: { track: MusicVideo; onPlay: () => void }) {
  const key = track.audioUrl ?? ''
  const item = useOfflineStore((s) => s.items[key])
  const progress = useOfflineStore((s) => s.progress[CONVERTED_ALBUM])
  const queued = useOfflineStore((s) => !!s.queue[CONVERTED_ALBUM]?.tracks.some((t) => t.audioUrl === key))
  const vid = key.split('id=')[1]?.slice(0, 11) ?? ''
  const name = track.title
  return (
    <li className="flex items-center gap-3 p-3">
      <button onClick={onPlay} className="relative w-14 h-14 rounded-xl overflow-hidden bg-surface-2 shrink-0" aria-label={`Escuchar ${name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={track.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Play className="w-5 h-5 text-white fill-white" />
        </span>
      </button>
      <span className="min-w-0 flex-1">
        <span className="block text-white text-sm font-semibold line-clamp-2">{name.replace(/^.+?\s[-–—]\s/, '')}</span>
        <span className="block text-slate-400 text-xs truncate">
          {track.channelTitle}
          {item ? ` · sin internet · ${formatSize(item.size)}` : queued && progress ? ` · convirtiendo ${Math.round(progress.current * 100)}%` : ''}
        </span>
      </span>
      {item ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-label="Guardada sin internet" />
      ) : queued ? (
        <Loader2 className="w-5 h-5 text-cyan-300 animate-spin shrink-0" aria-label="Convirtiendo" />
      ) : (
        <button
          onClick={() => saveConverted([track], true)}
          className="w-9 h-9 rounded-full border border-white/10 text-slate-200 flex items-center justify-center shrink-0"
          aria-label={`Guardar ${name} sin internet`}
          title="Guardar sin internet"
        >
          <Download className="w-4 h-4" />
        </button>
      )}
      {vid && (
        <a
          href={audioFileUrl(vid, name)}
          download
          className="w-9 h-9 rounded-full border border-white/10 text-slate-200 flex items-center justify-center shrink-0"
          aria-label={`Bajar ${name} como archivo de audio`}
          title="Bajar archivo de audio (.m4a)"
        >
          <FileAudio className="w-4 h-4" />
        </a>
      )}
    </li>
  )
}
