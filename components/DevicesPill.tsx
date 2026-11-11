'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Smartphone, Laptop, Play, Pause, SkipBack, SkipForward, ArrowRightLeft, X } from 'lucide-react'
import { useAccountStore } from '@/store/accountStore'
import { useMusicStore } from '@/store/musicStore'
import { useDevicesStore, presenceNow, localState, sendTo, takeFrom, deviceName, syncNativeAccount, type Device, type CmdType } from '@/lib/devices'
import Image from 'next/image'

// Dispositivos de la cuenta: con sesión, el encabezado muestra dónde suena la música (PulsoMedia,
// PulsoMusic o el navegador) y un panel para pasarla de uno a otro o mandarle órdenes.
export default function DevicesPill() {
  const token = useAccountStore((s) => s.token)
  const others = useDevicesStore((s) => s.others)
  const playingHere = useMusicStore((s) => s.isPlaying)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Al empezar, pausar o cambiar de canción se avisa de inmediato (no se espera al siguiente aviso)
  const trackId = useMusicStore((s) => s.queue[s.currentIndex]?.id ?? '')
  useEffect(() => {
    // La app del teléfono también avisa en segundo plano: se le da la cuenta
    syncNativeAccount()
    if (token) presenceNow()
  }, [token, playingHere, trackId])

  // Aviso periódico: cada 8 s mientras algo suena o hay otros dispositivos; si no, cada 30 s
  useEffect(() => {
    if (!token) return
    let alive = true
    let t: ReturnType<typeof setTimeout>
    const tick = async () => {
      if (!alive) return
      if (document.visibilityState === 'visible' || localState().playing) await presenceNow()
      const busy = localState().playing || useDevicesStore.getState().others.some((o) => o.playing || o.track)
      if (alive) t = setTimeout(tick, busy ? 8000 : 15000)
    }
    tick()
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [token])

  if (!mounted || !token || others.length === 0) return null
  const playingElsewhere = others.find((o) => o.playing)
  const label = playingElsewhere
    ? `Suena en ${playingElsewhere.name.split(' · ')[0]}`
    : `${others.length + 1} dispositivos`

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`hidden sm:inline-flex items-center gap-1.5 max-w-[200px] rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
          playingElsewhere ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200' : 'bg-surface-2/70 border-white/10 text-slate-200 hover:text-white'
        }`}
        aria-label={`Dispositivos: ${label}`}
        title="Elegir dónde suena la música"
      >
        {playingElsewhere ? <Smartphone className="w-3.5 h-3.5 shrink-0" /> : <Laptop className="w-3.5 h-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </button>
      {/* Móvil: un ícono (el texto no cabe junto a los demás íconos) */}
      <button
        onClick={() => setOpen(true)}
        className={`sm:hidden p-2 rounded-lg ${playingElsewhere ? 'text-emerald-300' : 'text-slate-400 hover:text-white'}`}
        aria-label={`Dispositivos: ${label}`}
      >
        <ArrowRightLeft className="w-5 h-5" />
      </button>
      {/* Barra «Suena en …» (como Spotify): se ve en cualquier pantalla mientras suena en otro dispositivo */}
      {createPortal(<NowElsewhere />, document.body)}
      {/* En la raíz de la página: el encabezado tiene su propio nivel y taparía el panel */}
      {open && createPortal(<DevicesPanel onClose={() => setOpen(false)} playingHere={playingHere} />, document.body)}
    </>
  )
}

function DevicesPanel({ onClose, playingHere }: { onClose: () => void; playingHere: boolean }) {
  const others = useDevicesStore((s) => s.others)
  const [busy, setBusy] = useState<string | null>(null)
  const [sent, setSent] = useState('')
  const local = localState()
  const here = local.track
  // «pull»: traer aquí lo que suena allá (no es una orden que llegue al otro)
  const act = async (d: Device, type: CmdType | 'pull', label: string) => {
    setBusy(d.device + type)
    if (type === 'take') await sendTo(d, 'take')
    else if (type === 'pull') await takeFrom(d)
    else await sendTo(d, type)
    setBusy(null)
    setSent(label)
    setTimeout(() => setSent(''), 2500)
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[80vh] overflow-y-auto bg-surface-1 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Dispositivos de tu cuenta"
      >
        <div className="flex items-center justify-between">
          <p className="text-white font-bold">Dónde suena la música</p>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-slate-500 text-xs mt-1">Tu cuenta, en todas tus apps y navegadores. Los cambios llegan en unos segundos.</p>

        {/* Este dispositivo */}
        <div className="mt-4 rounded-2xl bg-surface-2/60 border border-white/8 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Este dispositivo</p>
          <p className="text-white text-sm font-semibold mt-1 truncate">{deviceName()}</p>
          <p className="text-slate-400 text-xs truncate">{here ? (playingHere ? `Suena: ${here.title}` : `En pausa: ${here.title}`) : 'No hay música cargada'}</p>
        </div>

        <p className="mt-5 mb-2 text-[11px] uppercase tracking-wider text-slate-500 font-bold">Otros dispositivos</p>
        {others.length === 0 && <p className="text-slate-500 text-sm">No hay otros dispositivos con tu cuenta activos.</p>}
        <div className="flex flex-col gap-2">
          {others.map((d) => {
            const Icon = d.app === 'music' || d.name.includes('teléfono') ? Smartphone : Laptop
            return (
              <div key={d.device} className="rounded-2xl bg-surface-2/60 border border-white/8 p-3">
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-violet-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-semibold truncate">{d.name}</p>
                    <p className={`text-xs truncate ${d.playing ? 'text-emerald-300' : 'text-slate-400'}`}>
                      {d.track ? `${d.playing ? 'Suena' : 'En pausa'}: ${d.track.title}` : 'Sin música'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {d.playing ? (
                    <>
                      <button onClick={() => act(d, 'pull', 'Sonando aquí')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-violet-500 text-white disabled:opacity-50">
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Escuchar aquí
                      </button>
                      <button onClick={() => act(d, 'prev', 'Anterior')} disabled={busy !== null} className="p-2 text-slate-300 hover:text-white" aria-label="Anterior en ese dispositivo">
                        <SkipBack className="w-4 h-4" />
                      </button>
                      <button onClick={() => act(d, 'pause', 'Pausado')} disabled={busy !== null} className="p-2 text-slate-300 hover:text-white" aria-label="Pausar en ese dispositivo">
                        <Pause className="w-4 h-4" />
                      </button>
                      <button onClick={() => act(d, 'next', 'Siguiente')} disabled={busy !== null} className="p-2 text-slate-300 hover:text-white" aria-label="Siguiente en ese dispositivo">
                        <SkipForward className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {d.track && (
                        <button onClick={() => act(d, 'pull', 'Sonando aquí')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-violet-500 text-white disabled:opacity-50">
                          <ArrowRightLeft className="w-3.5 h-3.5" /> Escuchar aquí
                        </button>
                      )}
                      {here && playingHere && (
                        <button onClick={() => act(d, 'take', 'Pasada a ese dispositivo')} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-surface-1 border border-white/10 text-slate-200 disabled:opacity-50">
                          Pasar la música allí
                        </button>
                      )}
                      {d.track && (
                        <button onClick={() => act(d, 'play', 'Sonando allí')} disabled={busy !== null} className="p-2 text-slate-300 hover:text-white" aria-label="Reproducir en ese dispositivo">
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {sent && <p className="mt-3 text-xs text-emerald-300">{sent}</p>}
      </div>
    </div>
  )
}

/** Lo que suena en otro dispositivo de la cuenta, con sus controles y «Escuchar aquí» */
function NowElsewhere() {
  const others = useDevicesStore((s) => s.others)
  const playingHere = useMusicStore((s) => s.isPlaying)
  const [busy, setBusy] = useState(false)
  const d = others.find((o) => o.playing)
  if (!d || !d.track || playingHere) return null
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    await fn()
    setBusy(false)
  }
  return (
    <div className="fixed inset-x-0 bottom-14 sm:bottom-0 z-[81] border-t border-emerald-400/30 bg-surface-1/[0.98] sm:backdrop-blur-xl px-3 py-2 flex items-center gap-3 shadow-[0_-8px_24px_rgba(0,0,0,0.45)]">
      <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-surface-2 shrink-0">
        {d.track.thumbnail?.startsWith('http') && <Image src={d.track.thumbnail} alt="" fill sizes="44px" className="object-cover" unoptimized />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-emerald-300 text-[11px] font-semibold truncate flex items-center gap-1">
          <Smartphone className="w-3 h-3 shrink-0" /> Suena en {d.name}
        </p>
        <p className="text-white text-sm font-semibold truncate">{d.track.title}</p>
        <p className="text-slate-400 text-xs truncate">{d.track.channelTitle}</p>
      </div>
      <button onClick={() => run(() => sendTo(d, 'pause'))} disabled={busy} className="p-2 text-white" aria-label="Pausar en ese dispositivo">
        <Pause className="w-5 h-5" />
      </button>
      <button onClick={() => run(() => sendTo(d, 'next'))} disabled={busy} className="p-2 text-slate-200" aria-label="Siguiente en ese dispositivo">
        <SkipForward className="w-5 h-5" />
      </button>
      <button onClick={() => run(() => takeFrom(d))} disabled={busy} className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-violet-500 text-white disabled:opacity-50">
        <ArrowRightLeft className="w-3.5 h-3.5" /> Escuchar aquí
      </button>
      <button onClick={() => run(() => takeFrom(d))} disabled={busy} className="sm:hidden p-2 text-violet-300" aria-label="Escuchar aquí">
        <ArrowRightLeft className="w-5 h-5" />
      </button>
    </div>
  )
}
