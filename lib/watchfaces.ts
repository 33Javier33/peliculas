// Tienda de esferas de reloj (Wear OS). Cada esfera es una carpeta de android/esferas-de-reloj y se
// publica como Esfera-<Nombre>.apk. Para agregar una: su carpeta, su imagen en public/esferas y una entrada aquí.

export interface WatchFace {
  /** Nombre de su carpeta en android/esferas-de-reloj */
  id: string
  name: string
  /** Archivo publicado */
  file: string
  description: string
  features: string[]
  /** Fecha en que se agregó (AAAA-MM-DD): las de los últimos 14 días salen como «Nueva» */
  added: string
}

export const WATCH_FACES: WatchFace[] = [
  {
    id: 'digital',
    name: 'Digital',
    file: 'Esfera-Digital.apk',
    description: 'Hora grande y limpia, fecha en cian, batería y pasos. Fácil de leer de un vistazo.',
    features: ['Digital', 'Batería', 'Pasos', '12 / 24 h'],
    added: '2026-11-12',
  },
  {
    id: 'cronografo',
    name: 'Cronógrafo',
    file: 'Esfera-Cronografo.apk',
    description: 'Deportiva con bisel taquímetro y fibra de carbono: ritmo cardíaco, clima y pasos en tres círculos, día, fecha y batería.',
    features: ['Analógica', 'Ritmo cardíaco', 'Clima', 'Pasos', 'Fecha'],
    added: '2026-11-12',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    file: 'Esfera-Explorer.apk',
    description: 'Mapa topográfico con brújula en el bisel (tócalo y la N apunta al norte), altitud y un dato a elegir como el clima.',
    features: ['Analógica', 'Brújula', 'Altitud', 'Clima', 'Fecha'],
    added: '2026-11-12',
  },
]

export const watchFaceById = (id: string) => WATCH_FACES.find((f) => f.id === id)
