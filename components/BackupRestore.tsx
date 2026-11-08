'use client'
import { useAppFlavor, brandName } from '@/lib/app-flavor'

import HelpTip from '@/components/HelpTip'

import { useEffect, useRef, useState } from 'react'
import { ArchiveRestore } from 'lucide-react'
import { getNative } from '@/lib/native'
import { restoreBackupFile } from '@/lib/local-backup'
import { useOfflineStore } from '@/store/offlineStore'

// «Recuperar respaldo»: elige el archivo PulsoMedia-respaldo.json (Descargas/PulsoMedia) y vuelven
// tus playlists, Me gusta, álbumes y artistas (se juntan con lo que ya tengas)
export default function BackupRestore({ compact = false }: { compact?: boolean }) {
  const brand = brandName(useAppFlavor())
  const input = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [native, setNative] = useState(false)
  useEffect(() => setNative(!!getNative()), [])
  const pick = async (f: File | undefined) => {
    if (!f) return
    try {
      const r = await restoreBackupFile(f)
      const text = `Listo: volvieron ${r.playlists} playlists, ${r.songs} Me gusta y ${r.albums} discos`
      setMsg({ ok: true, text })
      useOfflineStore.getState().notify(text)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || 'No se pudo leer el respaldo' })
    }
  }
  return (
    <div className={compact ? 'mt-3' : 'mb-3 rounded-xl bg-surface-2/60 border border-white/8 p-3'}>
      {!compact && (
        <p className="text-slate-300 text-xs mb-2">
          {native
            ? `Tu biblioteca y playlists se respaldan solas en Descargas/${brand} (el archivo queda aunque desinstales la app).`
            : 'Si tienes un respaldo de PulsoMedia (archivo .json), recupéralo aquí.'}
        </p>
      )}
      <button
        onClick={() => input.current?.click()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/15 border border-violet-400/40 text-violet-200 text-sm font-semibold"
      >
        <ArchiveRestore className="w-4 h-4" /> Recuperar respaldo
      </button>
      <HelpTip className="ml-2" title="Respaldo" text={`La app de Android guarda sola tus playlists, Me gusta, álbumes y artistas en Descargas/${brand}/${brand}-respaldo.json. Ese archivo queda aunque desinstales la app: elígelo aquí y vuelve todo, junto con lo que ya tengas.`} />
      <input ref={input} type="file" accept=".json,application/json,text/plain,*/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</p>}
    </div>
  )
}
