'use client'

import { useState } from 'react'
import { Users, Loader2, Check } from 'lucide-react'
import type { MusicVideo } from '@/lib/youtube-music'
import { publish, readAlias, saveAlias } from '@/lib/community'
import { useAccountStore } from '@/store/accountStore'

// Compartir una playlist (o una mezcla de tu biblioteca) en la comunidad, con tu nombre público.
export default function CommunityShareButton({
  shareKey,
  name,
  tracks,
  kind = 'playlist',
  genre,
  compact = false,
}: {
  shareKey: string
  name: string
  tracks: MusicVideo[]
  kind?: 'playlist' | 'mix'
  genre?: string
  compact?: boolean
}) {
  const [state, setState] = useState<'idle' | 'alias' | 'busy' | 'done'>('idle')
  const [alias, setAlias] = useState('')
  const [msg, setMsg] = useState('')

  const go = async () => {
    setMsg('')
    if (!useAccountStore.getState().token) {
      setMsg('Inicia sesión con tu correo para compartir')
      useAccountStore.getState().setOpen(true)
      return
    }
    if (!readAlias()) {
      setAlias('')
      setState('alias')
      return
    }
    setState('busy')
    const r = await publish({ key: shareKey, name, tracks, kind, genre })
    if (r.ok) {
      setState('done')
      setMsg(`Compartida: ${r.count} canciones en la comunidad`)
    } else {
      setState('idle')
      setMsg(r.error)
      if (r.needLogin) useAccountStore.getState().setOpen(true)
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        onClick={go}
        disabled={state === 'busy'}
        className={`inline-flex items-center gap-1.5 rounded-full border text-xs font-semibold transition-colors ${
          compact ? 'w-9 h-9 justify-center' : 'px-3.5 py-2'
        } ${state === 'done' ? 'border-emerald-400/50 text-emerald-300 bg-emerald-500/10' : 'border-white/10 text-slate-200 bg-surface-1 hover:border-violet-400/50'}`}
        aria-label={`Compartir ${name} en la comunidad`}
        title="Compartir en la comunidad"
      >
        {state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : state === 'done' ? <Check className="w-4 h-4" /> : <Users className="w-4 h-4" />}
        {!compact && (state === 'done' ? 'Compartida' : 'Compartir en la comunidad')}
      </button>
      {msg && <span className={`mt-1 text-[11px] ${state === 'done' ? 'text-emerald-300' : 'text-amber-300'}`}>{msg}</span>}

      {state === 'alias' && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setState('idle')}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              if (!alias.trim()) return
              saveAlias(alias)
              go()
            }}
            className="w-full max-w-sm rounded-2xl bg-surface-1 border border-white/10 p-5"
          >
            <p className="text-white font-bold font-display">Tu nombre en la comunidad</p>
            <p className="text-slate-400 text-xs mt-1">
              Es lo que verán los demás junto a lo que compartas. Tu correo nunca se muestra.
            </p>
            <input
              autoFocus
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              maxLength={40}
              placeholder="Por ejemplo: Carlos"
              className="mt-3 w-full bg-surface-2 border border-white/10 text-white placeholder-slate-500 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setState('idle')} className="px-4 py-2 rounded-full text-sm text-slate-300">
                Cancelar
              </button>
              <button type="submit" disabled={!alias.trim()} className="px-4 py-2 rounded-full text-sm font-semibold bg-violet-500 text-white disabled:opacity-50">
                Compartir
              </button>
            </div>
          </form>
        </div>
      )}
    </span>
  )
}
