'use client'

import { X, SlidersHorizontal, Sparkles, Info } from 'lucide-react'
import { useEqStore, EQ_BANDS, EQ_PRESETS } from '@/store/eqStore'
import { useMusicStore } from '@/store/musicStore'

// Ventana del ecualizador: preajustes, 5 bandas, nivelador de volumen y alta calidad
export default function EqualizerSheet() {
  const { open, enabled, preset, gains, leveler, applies, setOpen, setEnabled, setPreset, setGain, setLeveler } = useEqStore()
  const audioBoost = useMusicStore((s) => s.audioBoost)
  const setAudioBoost = useMusicStore((s) => s.setAudioBoost)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Ecualizador">
      <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-label="Cerrar" />
      <div className="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface-1 border border-white/10 px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-5 h-5 text-violet-300" />
          <p className="flex-1 text-white font-bold font-display">Ecualizador</p>
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

        {enabled && !applies && (
          <p className="flex items-start gap-2 mt-3 text-amber-300/90 text-xs leading-relaxed">
            <Info className="w-4 h-4 shrink-0" />
            Lo que suena ahora (radio o YouTube desde la web) no permite ecualizar: suena normal. Sí funciona en la app de Android, con
            discos de Internet Archive, enlaces MP3 y tu música del teléfono.
          </p>
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
