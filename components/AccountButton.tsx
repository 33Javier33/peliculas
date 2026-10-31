'use client'

import { useEffect, useState } from 'react'
import { UserRound, CloudCheck } from 'lucide-react'
import { useAccountStore } from '@/store/accountStore'

// Botón de cuenta (junto a la lupa en Biblioteca): con sesión muestra la inicial del correo
export default function AccountButton() {
  const email = useAccountStore((s) => s.email)
  const setOpen = useAccountStore((s) => s.setOpen)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const logged = mounted && !!email
  return (
    <button
      onClick={() => setOpen(true)}
      className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
        logged ? 'bg-violet-500 text-white font-bold text-sm' : 'text-slate-400 hover:text-white hover:bg-surface-1'
      }`}
      aria-label={logged ? `Cuenta: ${email}` : 'Iniciar sesión para respaldar tu biblioteca'}
      title={logged ? `Respaldada en ${email}` : 'Respaldar tu biblioteca'}
    >
      {logged ? email!.charAt(0).toUpperCase() : <UserRound className="w-5 h-5" />}
      {logged && <CloudCheck className="absolute -bottom-1 -right-1 w-4 h-4 p-0.5 rounded-full bg-emerald-500 text-white" />}
    </button>
  )
}
