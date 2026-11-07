'use client'

import HelpTip from '@/components/HelpTip'

import { X, SlidersHorizontal, Sparkles, Info } from 'lucide-react'
import { useEqStore, EQ_BANDS, EQ_PRESETS } from '@/store/eqStore'
import { useMusicStore } from '@/store/musicStore'
import { useEffect, useState } from 'react'
import { hasNativeEq } from '@/lib/native'
import { useSwipeDown } from '@/lib/use-swipe-down'
import SheetHandle from '@/components/SheetHandle'

// Ventana del ecualizador: preajustes, 5 bandas, nivelador de volumen y alta calidad
export default function EqualizerSheet() {
  const { open, enabled, preset, gains, leveler, applies, native, setOpen, setEnabled, setPreset, setGain, setLeveler, engine, setEngine, setNative } = useEqStore()
  const [phoneEq, setPhoneEq] = useState(false)
  useEffect(() => setPhoneEq(hasNativeEq()), [])
  const audioBoost = useMusicStore((s) => s.audioBoost)
  const setAudioBoost = useMusicStore((s) => s.setAudioBoost)
  const swipe = useSwipeDown(() => setOpen(false))
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Ecualizador">
      <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-label="Cerrar" />
      <div style={swipe.style} className="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface-1 border border-white/10 px-5 pt-1 pb-[max(20px,env(safe-area-inset-bottom))]">
        {/* Se cierra arrastrando hacia abajo desde arriba */}
        <div {...swipe.dragProps} className="-mx-5 px-5 pb-1">
        <SheetHandle />
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-5 h-5 text-violet-300" />
          <p className="flex-1 flex items-center gap-2 text-white font-bold font-display">Ecualizador <HelpTip title="Ecualizador" text="Cambia el sonido (más graves, voces…). En la app de Android lo hace el teléfono y solo baja bandas, así nunca satura: si suena más bajo, sube un poco el volumen. «Normal» deja el sonido tal cual." /></p>
          {/* Interruptor */}
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative w-12 h-7 rounded-full transition-colors ${enabled ? 'bg-violet-500' : 'bg-white/15'}`}
            aria-label={enabled ? 'Apagar ecualizador' : 'Prender ecualizador'}
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${enabled ? 'left-6' : 'left-1'}`} />
          </button>
          <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-slate-300" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        </div>

        {/* Nota informativa (no es un error): dónde se aplica el ecualizador */}
        <p className="flex items-start gap-2 mt-3 text-slate-500 text-xs leading-relaxed">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {engine === 'app' && phoneEq
            ? applies
              ? 'Lo aplica la app a la canción que suena.'
              : 'La app ecualiza los discos de archive.org, tu música descargada y las canciones de YouTube de la app.'
            : native === 'ok'
            ? 'Lo aplica el teléfono con su ecualizador liviano: solo baja bandas, así nunca satura ni chisporrotea. Si suena más bajo, sube un poco el volumen.'
            : native === 'busy'
              ? 'Otra app de ecualizador del teléfono tiene el control del sonido. Ciérrala o desactívala para usar este.'
              : native === 'unsupported'
                ? 'Este teléfono no permite ecualizar desde la app. La música suena normal, sin ecualizar.'
                : applies
                  ? 'Se aplica a la canción que suena ahora.'
            : 'Se aplica a los discos de archive.org, a tu música del teléfono y a las canciones de la app de Android. Esta canción se escucha sin ecualizar (radios, YouTube en el navegador u otros sitios).'}
        </p>

        {/* App de Android: el ecualizador lo puede aplicar el teléfono o la propia app */}
        {phoneEq && (
          <div className="mt-3 rounded-xl bg-surface-2/60 border border-white/8 p-2.5">
            <p className="text-slate-300 text-xs font-semibold mb-2">¿Quién aplica el ecualizador?</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['phone', 'El teléfono', 'Sin chasquidos'],
                  ['app', 'La app', 'Si el del teléfono no se nota'],
                ] as const
              ).map(([id, label, note]) => (
                <button
                  key={id}
                  onClick={() => {
                    setEngine(id)
                    setNative(null)
                  }}
                  className={`rounded-lg px-2 py-2 text-left ${engine === id ? 'bg-violet-500 text-white' : 'bg-surface-1 text-slate-300'}`}
                  aria-pressed={engine === id}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className={`block text-[11px] ${engine === id ? 'text-white/80' : 'text-slate-500'}`}>{note}</span>
                </button>
              ))}
            </div>
            {engine === 'phone' && (native === 'busy' || native === 'unsupported') && (
              <p className="mt-2 text-amber-200 text-xs">El del teléfono no está disponible ahora: elige «La app».</p>
            )}
          </div>
        )}

        {/* Preajustes */}
        <div className="flex flex-wrap gap-2 mt-4">
          {EQ_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${
                enabled && preset === p.id ? 'bg-violet-500 border-violet-400 text-white' : 'bg-surface-2 border-white/10 text-slate-300'
              }`}
            >
              {p.name}
            </button>
          ))}
          {preset === 'custom' && <span className="px-3 py-1.5 rounded-full border border-violet-400/50 text-violet-300 text-xs font-semibold">Personalizado</span>}
        </div>

        {/* Bandas */}
        <div className={`mt-5 space-y-3 ${enabled ? '' : 'opacity-50'}`}>
          {EQ_BANDS.map((b, i) => (
            <label key={b.freq} className="flex items-center gap-3">
              <span className="w-28 shrink-0">
                <span className="block text-white text-xs font-semibold">{b.label}</span>
                <span className="block text-slate-500 text-[10px]">{b.freq >= 1000 ? `${b.freq / 1000} kHz` : `${b.freq} Hz`}</span>
              </span>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={gains[i] ?? 0}
                onChange={(e) => setGain(i, Number(e.target.value))}
                className="flex-1 accent-violet-500"
                aria-label={`${b.label} (${b.freq} Hz)`}
              />
              <span className="w-10 text-right text-slate-300 text-xs tabular-nums">
                {(gains[i] ?? 0) > 0 ? '+' : ''}
                {gains[i] ?? 0} dB
              </span>
            </label>
          ))}
        </div>

        {/* Nivelador */}
        <button onClick={() => setLeveler(!leveler)} className="mt-5 w-full flex items-center gap-3 text-left" role="switch" aria-checked={leveler}>
          <span className="min-w-0 flex-1">
            <span className="block text-white text-sm font-semibold">Nivelar volumen</span>
            <span className="block text-slate-500 text-xs">Las partes suaves se oyen más y las fuertes no saturan (útil con audífonos o de noche)</span>
          </span>
          <span className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${leveler && enabled ? 'bg-violet-500' : 'bg-white/15'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${leveler && enabled ? 'left-5' : 'left-1'}`} />
          </span>
        </button>

        {/* Alta calidad */}
        <button onClick={() => setAudioBoost(!audioBoost)} className="mt-4 w-full flex items-center gap-3 text-left" role="switch" aria-checked={audioBoost}>
          <Sparkles className={`w-5 h-5 shrink-0 ${audioBoost ? 'text-violet-300' : 'text-slate-500'}`} />
          <span className="min-w-0 flex-1">
            <span className="block text-white text-sm font-semibold">Alta calidad</span>
            <span className="block text-slate-500 text-xs">Elige la versión con más calidad de cada canción (gasta más datos)</span>
          </span>
          <span className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${audioBoost ? 'bg-violet-500' : 'bg-white/15'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${audioBoost ? 'left-5' : 'left-1'}`} />
          </span>
        </button>
      </div>
    </div>
  )
}
