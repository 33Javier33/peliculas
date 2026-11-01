'use client'

import { useEffect, useMemo, useState } from 'react'
import { HardDriveDownload, Play, Shuffle, Trash2, Disc3, WifiOff } from 'lucide-react'
import { useOfflineStore, type OfflineItem } from '@/store/offlineStore'
import { useMusicStore } from '@/store/musicStore'
import { formatSize, storageEstimate } from '@/lib/offline-files'

// "Descargadas": todo lo que se puede escuchar sin internet (discos, playlists y enlaces
// descargados), agrupado, con cuánto ocupa y para borrarlo
export default function DownloadsSection() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const items = useOfflineStore((s) => s.items)
  const progress = useOfflineStore((s) => s.progress)
  const removeGroup = useOfflineStore((s) => s.removeGroup)
  const [confirm, setConfirm] = useState<string | null>(null)
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

  useEffect(() => {
    if (!mounted) return
    storageEstimate().then((e) => e && setFree(Math.max(0, e.quota - e.usage)))
  }, [mounted, total])

  if (!mounted || (!groups.length && !Object.keys(progress).length)) return null

  const play = (list: OfflineItem[], shuffle = false) => {
    const st = useMusicStore.getState()
    if (shuffle !== st.shuffle) st.toggleShuffle()
    st.play(
      list.map((i) => i.track),
      shuffle ? Math.floor(Math.random() * list.length) : 0
    )
  }

  return (
    <section id="descargas" data-scroll-step className="mb-10 rounded-2xl bg-surface-1/60 border border-white/8 p-4 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="flex items-center gap-2 text-white font-bold text-lg font-display">
            <HardDriveDownload className="w-5 h-5 text-emerald-400" /> Descargadas
          </h2>
          <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5" /> Suenan sin internet · ocupan {formatSize(total)}
            {free !== null && <span className="text-slate-600"> · libre en el teléfono: {formatSize(free)}</span>}
          </p>
        </div>
        {groups.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => play(groups.flatMap((g) => g.list))} className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center" aria-label="Escuchar todas las descargas">
              <Play className="w-4 h-4 fill-white" />
            </button>
            <button onClick={() => play(groups.flatMap((g) => g.list), true)} className="w-10 h-10 rounded-full bg-surface-2 border border-white/10 text-white flex items-center justify-center" aria-label="Descargas en aleatorio">
              <Shuffle className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <ul className="divide-y divide-white/5 max-h-80 overflow-y-auto overscroll-contain">
        {groups.map((g) => {
          const size = g.list.reduce((s, i) => s + i.size, 0)
          const p = progress[g.id]
          return (
            <li key={g.id} className="flex items-center gap-3 py-2">
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
                    {g.list.length} {g.list.length === 1 ? 'canción' : 'canciones'} · {formatSize(size)}
                    {p ? ` · descargando ${p.done}/${p.total}` : ''}
                  </span>
                </span>
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
            </li>
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
