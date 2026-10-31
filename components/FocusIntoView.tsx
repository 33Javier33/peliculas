'use client'

import { useEffect } from 'react'

// Al tocar un buscador (o cualquier campo de texto) se acomoda la pantalla para que quede a la
// vista y no tapado por el teclado
export default function FocusIntoView() {
  useEffect(() => {
    let target: HTMLElement | null = null
    const center = () => target?.isConnected && target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement
      if (!el.matches?.('input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select')) return
      target = el
      // Esperar a que abra el teclado (la pantalla se achica) y volver a acomodar
      setTimeout(center, 250)
      setTimeout(center, 650)
    }
    const onBlur = () => (target = null)
    const vv = window.visualViewport
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    vv?.addEventListener('resize', center)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      vv?.removeEventListener('resize', center)
    }
  }, [])
  return null
}
