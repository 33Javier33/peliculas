'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Recuerda el recorrido dentro de la app para que "volver" funcione como el botón
// atrás del teléfono: guarda la lista de pantallas visitadas y la posición de scroll
// de cada una para restaurarla al regresar.
//
// No se usa el evento popstate para saber si fue un "volver": el router de Next dibuja
// la pantalla anterior antes de que ese evento llegue a nosotros. En su lugar, si la
// pantalla nueva es la penúltima de la lista, es un "volver".

const STACK_KEY = 'cpn-nav-stack'
const scrollKey = (url: string) => `cpn-scroll:${url}`
const currentUrl = () => `${window.location.pathname}${window.location.search}`
const pathOf = (url: string) => url.split('?')[0]

// Estado a nivel de módulo: el componente puede volver a montarse al cambiar de pantalla
const nav = { initialized: false, restoring: false, lockKey: '', lockUntil: 0 }

function readStack(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STACK_KEY) || '[]')
  } catch {
    return []
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-50)))
  } catch {}
}

/** ¿Hay una pantalla anterior de la app a la que volver? */
export function canGoBackInApp(): boolean {
  return readStack().length > 1
}

function init() {
  if (nav.initialized) return
  nav.initialized = true
  try {
    window.history.scrollRestoration = 'manual'
  } catch {}

  // Guarda la posición mientras se desplaza (salvo durante la restauración). Como mucho
  // cada 300 ms y al terminar: escribir en cada fotograma hacía el scroll menos fluido.
  let timer: ReturnType<typeof setTimeout> | undefined
  window.addEventListener(
    'scroll',
    () => {
      if (nav.restoring || timer) return
      timer = setTimeout(() => {
        timer = undefined
        if (nav.restoring) return
        const key = scrollKey(currentUrl())
        // Recién tocado un enlace/botón: el router mueve la pantalla antes de cambiar de dirección
        if (key === nav.lockKey && Date.now() < nav.lockUntil) return
        try {
          sessionStorage.setItem(key, String(Math.round(window.scrollY)))
        } catch {}
      }, 300)
    },
    { passive: true }
  )

  // Al tocar (o enviar una búsqueda) se fija la posición actual de esta pantalla
  const snapshot = () => {
    if (nav.restoring) return
    const key = scrollKey(currentUrl())
    try {
      sessionStorage.setItem(key, String(Math.round(window.scrollY)))
    } catch {}
    nav.lockKey = key
    nav.lockUntil = Date.now() + 1500
  }
  window.addEventListener('click', snapshot, { capture: true })
  window.addEventListener('submit', snapshot, { capture: true })
  // Si el usuario toca o desplaza, se deja de restaurar
  const stop = () => {
    nav.restoring = false
  }
  window.addEventListener('touchstart', stop, { passive: true })
  window.addEventListener('wheel', stop, { passive: true })
}

function restoreScroll(y: number) {
  nav.restoring = true
  const started = Date.now()
  const tryRestore = () => {
    if (!nav.restoring) return
    const maxY = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, Math.min(y, Math.max(0, maxY)))
    if (maxY >= y || Date.now() - started > 3000) {
      // Un instante más para que el último scroll no se guarde como cambio del usuario
      setTimeout(() => {
        nav.restoring = false
      }, 150)
      return
    }
    setTimeout(tryRestore, 100)
  }
  requestAnimationFrame(tryRestore)
}

export default function NavigationMemory() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const url = `${pathname}?${searchParams.toString()}`

  useEffect(() => {
    init()
    const full = currentUrl()
    const stack = readStack()
    const top = stack[stack.length - 1]
    let isBack = false

    if (!top) {
      stack.push(full)
    } else if (pathOf(top) === pathOf(full)) {
      // Misma pantalla (cambió la búsqueda o el filtro): se actualiza, no es una pantalla nueva
      stack[stack.length - 1] = full
    } else if (stack.length >= 2 && stack[stack.length - 2] === full) {
      stack.pop()
      isBack = true
    } else {
      stack.push(full)
    }
    writeStack(stack)

    if (isBack) {
      // Se lee ahora: la pantalla se acaba de dibujar y aún no hubo scroll que la pise
      let y = 0
      try {
        y = Number(sessionStorage.getItem(scrollKey(full)) || '0')
      } catch {}
      if (y > 0) restoreScroll(y)
    }
  }, [url])

  return null
}
