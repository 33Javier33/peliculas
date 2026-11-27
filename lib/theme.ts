// Tema de colores de la app (Configuración → Tema). Se guarda en el teléfono o computador y se
// aplica antes de que se dibuje la página (SPLASH_SCRIPT), así no hay parpadeo de colores.

export type ThemeId = 'original' | 'hifi' | 'esmeralda' | 'oceano' | 'ambar' | 'rosa' | 'musgo' | 'acero' | 'hacker'

export const THEMES: { id: ThemeId; name: string; desc: string; colors: [string, string, string] }[] = [
  { id: 'original', name: 'Original', desc: 'El color de cada app', colors: ['#8b5cf6', '#d63454', '#16181f'] },
  { id: 'hifi', name: 'Hi-Fi', desc: 'Negro profundo y blanco', colors: ['#ffffff', '#9a9a9a', '#050505'] },
  { id: 'esmeralda', name: 'Esmeralda', desc: 'Verde sobre carbón', colors: ['#53e076', '#22b154', '#131313'] },
  { id: 'oceano', name: 'Océano', desc: 'Azul profundo', colors: ['#38bdf8', '#6366f1', '#080d16'] },
  { id: 'ambar', name: 'Ámbar', desc: 'Dorado cálido', colors: ['#fbbf24', '#f97316', '#120e0a'] },
  { id: 'rosa', name: 'Rosa', desc: 'Rosa neón', colors: ['#f472b6', '#d946ef', '#0f0a0f'] },
  { id: 'musgo', name: 'Musgo', desc: 'Verde opaco', colors: ['#7d9e81', '#606f4f', '#0e100e'] },
  { id: 'acero', name: 'Acero', desc: 'Azul opaco', colors: ['#7a92ac', '#6a6f96', '#0d0f13'] },
  { id: 'hacker', name: 'Hacker', desc: 'Negro y verde terminal', colors: ['#56a05e', '#2c7035', '#030503'] },
]

const KEY = 'cpn-theme'

export function getTheme(): ThemeId {
  try {
    const t = localStorage.getItem(KEY) as ThemeId | null
    if (t && THEMES.some((x) => x.id === t)) return t
  } catch {}
  return 'original'
}

export function setTheme(id: ThemeId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {}
  const html = document.documentElement
  if (id === 'original') html.removeAttribute('data-theme')
  else html.setAttribute('data-theme', id)
}
