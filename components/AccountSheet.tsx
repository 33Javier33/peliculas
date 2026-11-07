'use client'

import HelpTip from '@/components/HelpTip'

import { useEffect, useState } from 'react'
import { useSwipeDown } from '@/lib/use-swipe-down'
import SheetHandle from '@/components/SheetHandle'
import { X, Mail, Loader2, CheckCircle2, Cloud, LogOut, RefreshCw, AlertCircle } from 'lucide-react'
import { useAccountStore } from '@/store/accountStore'
import { callAccount } from '@/lib/account-sync'

// Iniciar sesión con el correo (código de 6 dígitos) para respaldar la biblioteca y las
// preferencias y tenerlas en otros dispositivos. No es obligatorio.
export default function AccountSheet() {
  const { open, email, token, syncedAt, status, setOpen, setSession, clear } = useAccountStore()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [mail, setMail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    fetch('/api/cuenta')
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setConfigured(!!d.configured))
      .catch(() => setConfigured(null))
  }, [open])

  const swipe = useSwipeDown(() => useAccountStore.getState().setOpen(false))
  if (!open) return null

  const request = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    const r = await callAccount({ action: 'requestCode', email: mail.trim() }).catch(() => null)
    setBusy(false)
    if (r?.ok) {
      setStep('code')
      setCode('')
    } else setError(r?.error === 'not_configured' ? 'Las cuentas aún no están activadas.' : r?.error || 'No se pudo enviar el código.')
  }
  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const device = /Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone' : 'Computador'
    const r = await callAccount<{ token?: string; email?: string }>({ action: 'verifyCode', email: mail.trim(), code, device }).catch(() => null)
    setBusy(false)
    if (r?.ok && r.token && r.email) {
      setSession(r.email, r.token)
      setStep('email')
    } else setError(r?.error || 'No se pudo verificar el código.')
  }
  const logout = async () => {
    if (token) callAccount({ action: 'logout', token }).catch(() => {})
    clear()
  }

  const input = 'w-full bg-surface-2 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-violet-500'
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Cuenta">
      <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-label="Cerrar" />
      <div style={swipe.style} className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-surface-1 border border-white/10 px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
        <SheetHandle className="sm:hidden -mb-2" />
        <div {...swipe.dragProps} className="flex items-center gap-3">
          <Cloud className="w-5 h-5 text-violet-300" />
          <p className="flex-1 flex items-center gap-2 text-white font-bold font-display">{token ? 'Tu cuenta' : 'Respalda tu biblioteca'} <HelpTip title="Cuenta" text="Con tu correo, tu biblioteca, playlists y Me gusta se guardan en la nube. Si cambias de teléfono o reinstalas la app, inicias sesión y vuelve todo. No necesitas contraseña: llega un código a tu correo." /></p>
          <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-slate-300" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {token ? (
          <div className="mt-4 space-y-4">
            <p className="flex items-center gap-2 text-white">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" /> {email}
            </p>
            <p className="text-slate-400 text-sm">
              Tus canciones guardadas, playlists, discos, artistas seguidos, radios favoritas y preferencias se respaldan solas. Entra
              con este correo en otro teléfono o computador y aparecerán ahí.
            </p>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              {status === 'syncing' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Respaldando…
                </>
              ) : status === 'error' ? (
                <span className="text-amber-300">No se pudo respaldar ahora; se reintentará solo.</span>
              ) : syncedAt ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5" /> Último respaldo: {new Date(syncedAt).toLocaleString('es')}
                </>
              ) : (
                'Preparando el primer respaldo…'
              )}
            </p>
            <button onClick={logout} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-full border border-white/10 text-slate-300 text-sm">
              <LogOut className="w-4 h-4" /> Cerrar sesión (lo guardado sigue en este teléfono)
            </button>
          </div>
        ) : configured === false ? (
          <p className="mt-4 flex items-start gap-2 text-slate-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> Las cuentas todavía no están activadas en la app. Pronto podrás respaldar
            tu biblioteca con tu correo.
          </p>
        ) : step === 'email' ? (
          <form onSubmit={request} className="mt-4 space-y-3">
            <p className="text-slate-400 text-sm">
              Inicia sesión con tu correo para respaldar tu biblioteca y preferencias y usarlas en otros dispositivos. No es
              obligatorio: sin cuenta todo sigue guardado en este teléfono.
            </p>
            <input type="email" inputMode="email" autoComplete="email" required value={mail} onChange={(e) => setMail(e.target.value)} placeholder="tu@correo.com" aria-label="Correo" className={input} />
            <button type="submit" disabled={busy || !mail.trim()} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-full bg-violet-500 text-white font-semibold disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Enviarme un código
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-4 space-y-3">
            <p className="text-slate-400 text-sm">
              Te enviamos un código de 6 dígitos a <b className="text-white">{mail}</b>. Revisa también la carpeta de spam.
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              aria-label="Código de verificación"
              className={`${input} text-center tracking-[0.5em] text-2xl font-bold`}
            />
            <button type="submit" disabled={busy || code.length !== 6} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-full bg-violet-500 text-white font-semibold disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Entrar
            </button>
            <div className="flex justify-between text-xs">
              <button type="button" onClick={() => setStep('email')} className="text-slate-400">
                Cambiar correo
              </button>
              <button type="button" onClick={() => request()} disabled={busy} className="text-violet-300">
                Enviar otro código
              </button>
            </div>
          </form>
        )}
        {error && <p className="mt-3 text-amber-300 text-sm">{error}</p>}
      </div>
    </div>
  )
}
