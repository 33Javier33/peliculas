'use client'
import { phoneStorageAvailable, askPhonePermission } from '@/lib/phone-storage'
import type { OfflineFailure } from '@/store/offlineStore'
import { restoreDownloads } from '@/lib/phone-restore'
import { isArchiveFile } from '@/lib/audio-quality'

import GenreTag, { useGenreCache } from '@/components/GenreTag'
import { songArtist } from '@/lib/library-radio'
import { useEffect, useMemo, useState } from 'react'
import { HardDriveDownload, Play, Shuffle, Trash2, Disc3, WifiOff, ChevronDown, Sparkles } from 'lucide-react'
import { useOfflineStore, type OfflineItem } from '@/store/offlineStore'
import { useMusicStore } from '@/store/musicStore'
import { formatSize, storageEstimate } from '@/lib/offline-files'
import { markShuffle, useShuffleOn, SHUFFLE_ON } from '@/lib/shuffle-ui'

// "Descargadas": todo lo que se puede escuchar sin internet (discos, playlists y enlaces
// descargados), agrupado, con cuánto ocupa y para borrarlo
export default function DownloadsSection() {
  const shuffleOn = useShuffleOn('downloads')
  const genres = useGenreCache()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const items = useOfflineStore((s) => s.items)
  const progress = useOfflineStore((s) => s.progress)
  const removeGroup = useOfflineStore((s) => s.removeGroup)
  const [confirm, setConfirm] = useState<string | null>(null)
  // Disco desplegado (para ver y elegir sus canciones)
  const [openId, setOpenId] = useState<string | null>(null)
  const [free, setFree] = useState<number | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; title: string; cover?: string; list: OfflineItem[] }>()
    for (const i of Object.values(items)) {
      const g = map.get(i.groupId) ?? { id: i.groupId, title: i.groupTitle, cover: i.groupCover, list: [] }
      g.list.push(i)
      map.set(i.groupId, g)
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, list: g.list.sort((a, b) => a.savedAt - b.savedAt) }))
      .sort((a, b) => Math.max(...b.list.map((x) => x.savedAt)) - Math.max(...a.list.map((x) => x.savedAt)))
  }, [items])
  const total = useMemo(() => Object.values(items).reduce((sum, i) => sum + i.size, 0), [items])
  // Descargadas antes en calidad normal (se pueden volver a bajar en la mejor calidad)
  const improvable = useMemo(() => Object.values(items).filter((i) => !i.hq && (i.key.startsWith('/api/stream?') || isArchiveFile(i.key))).length, [items])
  const upgrading = progress['mejorar-calidad']

  useEffect(() => {
    if (!mounted) return
    storageEstimate().then((e) => e && setFree(Math.max(0, e.quota - e.usage)))
  }, [mounted, total])

  const onPhone = mounted && phoneStorageAvailable()
  const failures = useOfflineStore((st) => st.failures)
  const failedList = mounted ? Object.values(failures).filter((f) => !items[f.key]) : []
  if (!mounted || (!groups.length && !Object.keys(progress).length && !onPhone && !failedList.length)) return null

  const play = (list: OfflineItem[], shuffle = false) => {
    const st = useMusicStore.getState()
    if (shuffle !== st.shuffle) st.toggleShuffle()
    st.play(
      list.map((i) => i.track),
      shuffle ? Math.floor(Math.random() * list.length) : 0
    )
  }

  const playAt = (list: OfflineItem[], i: number) => {
    const st = useMusicStore.getState()
    if (st.shuffle) st.toggleShuffle()
    st.play(
      list.map((x) => x.track),
      i
    )
  }

  return (
    <section id="descargas" data-scroll-step className="mb-10 rounded-2xl bg-surface-1/60 border border-white/8 p-4 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="flex items-center gap-2 text-white font-bold text-lg font-display">
            <HardDriveDownload className="w-5 h-5 text-emerald-400" /> Canciones descargadas
            <span className="text-slate-400 text-sm font-normal">({Object.keys(items).length})</span>
          </h2>
          <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5" /> Suenan sin internet · ocupan {formatSize(total)}
            {onPhone && <span className="text-emerald-400/80"> · en Música/PulsoMedia (no se borran al desinstalar)</span>}
            {free !== null && <span className="text-slate-600"> · libre en el teléfono: {formatSize(free)}</span>}
          </p>
        </div>
        {groups.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => play(groups.flatMap((g) => g.list))} className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center" aria-label="Escuchar todas las descargas">
              <Play className="w-4 h-4 fill-white" />
            </button>
            <button onClick={() => (play(groups.flatMap((g) => g.list), true), markShuffle('downloads'))} aria-pressed={shuffleOn} className={`w-10 h-10 rounded-full bg-surface-2 border border-white/10 text-white flex items-center justify-center ${shuffleOn ? SHUFFLE_ON : ''}`} aria-label="Descargas en aleatorio">
              <Shuffle className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      {onPhone && <PhoneRecovery />}
      {/* Las que no se pudieron descargar: el motivo y reintentar */}
      {failedList.length > 0 && (
        <div className="mb-3 rounded-xl bg-amber-500/10 border border-amber-400/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <p className="flex-1 text-amber-200 text-sm font-semibold">No se pudieron descargar ({failedList.length})</p>
            <button
              onClick={() => {
                const byGroup = new Map<string, { group: OfflineFailure['group']; tracks: OfflineFailure['track'][] }>()
                for (const f of failedList) {
                  const g = byGroup.get(f.group.id) ?? { group: f.group, tracks: [] }
                  g.tracks.push(f.track)
                  byGroup.set(f.group.id, g)
                }
                for (const g of Array.from(byGroup.values())) useOfflineStore.getState().download(g.group, g.tracks)
              }}
              className="px-3 py-1.5 rounded-full bg-amber-500 text-black text-xs font-bold"
            >
              Reintentar todas
            </button>
          </div>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {failedList.slice(0, 50).map((f) => (
              <li key={f.key} className="flex items-start gap-2 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="block text-white truncate">{f.track.title}</span>
                  <span className="block text-amber-200/80 break-words">Motivo: {f.reason}</span>
                </span>
                <button onClick={() => useOfflineStore.getState().clearFailure(f.key)} className="text-slate-400 underline shrink-0">
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(improvable > 0 || upgrading) && (
        <button
          onClick={() => !upgrading && useOfflineStore.getState().upgrade()}
          className="mb-3 w-full flex items-center gap-3 rounded-xl bg-violet-500/10 border border-violet-400/30 px-3 py-2.5 text-left"
        >
          <Sparkles className="w-4 h-4 text-violet-300 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-white text-sm font-semibold">
              {upgrading ? `Mejorando la calidad… ${upgrading.done}/${upgrading.total}` : `Mejorar la calidad (${improvable} canciones)`}
            </span>
            <span className="block text-slate-400 text-xs">
              {upgrading ? 'Siguen sonando mientras tanto' : 'Se vuelven a bajar en la mejor calidad: originales de archive.org y la mejor pista de YouTube'}
            </span>
          </span>
        </button>
      )}
      <ul className="divide-y divide-white/5 max-h-[28rem] overflow-y-auto overscroll-contain">
        {groups.map((g) => {
          const size = g.list.reduce((s, i) => s + i.size, 0)
          const p = progress[g.id]
          return (
            [<li key={g.id} className="flex items-center gap-3 py-2">
              <button onClick={() => play(g.list)} className="min-w-0 flex-1 flex items-center gap-3 text-left">
                <span className="w-12 h-12 rounded-lg overflow-hidden bg-surface-2 shrink-0 flex items-center justify-center">
                  {g.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <Disc3 className="w-6 h-6 text-slate-500" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-white text-sm font-semibold truncate">{g.title}</span>
                  <span className="block text-slate-500 text-xs">
                    {songArtist(g.list[0].track) && (
                      <>
                        {songArtist(g.list[0].track)}
                        <GenreTag artist={songArtist(g.list[0].track)} cache={genres} />
                        {' · '}
                      </>
                    )}
                    {g.list.length} {g.list.length === 1 ? 'canción' : 'canciones'} · {formatSize(size)}
                    {p ? ` · descargando ${p.done}/${p.total}` : ''}
                  </span>
                </span>
              </button>
              <button
                onClick={() => setOpenId(openId === g.id ? null : g.id)}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white"
                aria-expanded={openId === g.id}
                aria-label={openId === g.id ? `Ocultar las canciones de ${g.title}` : `Ver las canciones de ${g.title}`}
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${openId === g.id ? 'rotate-180' : ''}`} />
              </button>
              {confirm === g.id ? (
                <button
                  onClick={() => {
                    removeGroup(g.id)
                    setConfirm(null)
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-400/40 text-red-300 text-xs font-semibold"
                >
                  Borrar
                </button>
              ) : (
                <button onClick={() => setConfirm(g.id)} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400" aria-label={`Borrar la descarga de ${g.title}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>,
            openId === g.id && (
              <li key={`${g.id}-songs`} className="pb-2">
                <ol className="ml-4 border-l border-white/10 pl-3">
                  {g.list.map((it, i) => (
                    <li key={it.key}>
                      <button onClick={() => playAt(g.list, i)} className="w-full flex items-center gap-2 py-1.5 text-left">
                        <span className="w-5 text-slate-500 text-xs tabular-nums">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-slate-200 text-sm truncate">{it.track.title.replace(/^.+?\s[-–—]\s/, '') || it.track.title}</span>
                          <span className="block text-slate-500 text-[11px]">{formatSize(it.size)}</span>
                        </span>
                        <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ol>
              </li>
            ),
          ]
          )
        })}
      </ul>
      {Object.entries(progress)
        .filter(([id]) => !groups.some((g) => g.id === id))
        .map(([id, p]) => (
          <p key={id} className="text-slate-400 text-xs mt-2">
            Descargando {p.done + 1}/{p.total}…
          </p>
        ))}
    </section>
  )
}


/** Tras reinstalar la app: recupera las descargas guardadas en la música del teléfono */
function PhoneRecovery() {
  const [state, setState] = useState<'idle' | 'busy' | 'denied' | string>('idle')
  const run = async () => {
    setState('busy')
    let n = await restoreDownloads()
    if (n === null) {
      // Falta el permiso para ver la música del teléfono
      if (await askPhonePermission()) n = await restoreDownloads()
    }
    setState(n === null ? 'denied' : n === 0 ? 'Ya está todo recuperado' : `✓ ${n} recuperadas`)
  }
  return (
    <button onClick={run} disabled={state === 'busy'} className="mb-3 w-full flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-3 py-2.5 text-left">
      <HardDriveDownload className="w-4 h-4 text-emerald-300 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-white text-sm font-semibold">
          {state === 'busy' ? 'Buscando en la música del teléfono…' : state === 'idle' ? '¿Reinstalaste la app? Recuperar mis descargas' : state === 'denied' ? 'Permite el acceso a la música para recuperarlas' : state}
        </span>
        <span className="block text-slate-400 text-xs">Las descargas quedan en Música/PulsoMedia del teléfono: se recuperan sin volver a descargarlas</span>
      </span>
    </button>
  )
}
