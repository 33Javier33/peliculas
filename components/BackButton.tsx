'use client'

import { useRouter } from 'next/navigation'
import { canGoBackInApp } from '@/components/NavigationMemory'

/**
 * "Volver": regresa a la pantalla anterior de verdad (donde estabas, con su scroll y
 * su búsqueda). Si se entró directo (p. ej. desde un enlace compartido), va a `fallbackHref`.
 */
export default function BackButton({
  fallbackHref,
  className,
  children,
}: {
  fallbackHref: string
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => (canGoBackInApp() ? router.back() : router.push(fallbackHref))}
      className={className}
    >
      {children}
    </button>
  )
}
