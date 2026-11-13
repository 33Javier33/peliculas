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
    id: 'clasica',
    name: 'Clásica',
    file: 'Esfera-Clasica.apk',
    description:
      'Limpia y completa: humedad, clima y UV arriba; temperatura mínima, actual y máxima; día, mes, fecha y AM/PM; hora grande con segundos; próximo evento con fase lunar; hora mundial, ritmo cardíaco, pasos y batería. 8 temas y pantalla siempre activa de bajo consumo.',
    features: ['Digital', '8 temas', 'Bajo consumo', 'Clima', 'Eventos', 'Hora mundial', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-13',
  },
  {
    id: 'retro',
    name: 'Retro LCD',
    file: 'Esfera-Retro.apk',
    description:
      'Reloj digital retro de los 80: pantalla de cristal líquido con dígitos de segmentos y sus «8» apagados, letras de puntos, marco octogonal y botones rotulados. Pantalla clásica gris, invertida (6 colores) o con luz azul; frente a color o blanco y negro; marco de colores u oculto. Pasos, temperatura (batería °C/°F o clima), batería y ritmo cardíaco. 4 esquinas y un ícono arriba como accesos (PulsoMedia, PulsoMusic…).',
    features: ['Digital', 'Retro LCD', '3 pantallas', 'Pasos', 'Temperatura', 'Ritmo cardíaco', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-12',
  },
  {
    id: 'info',
    name: 'Info',
    file: 'Esfera-Info.apk',
    description:
      'Toda la información de un vistazo: fecha, próximo evento, fase lunar, día del año, semana, hora con segundos y zona horaria, batería, ritmo cardíaco, pasos con distancia y clima. 8 colores y pantalla siempre activa mínima (solo la hora) o completa.',
    features: ['Digital', 'Fase lunar', 'Eventos', 'Clima', 'Ritmo cardíaco', 'Pasos y km', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-12',
  },
  {
    id: 'sportpro',
    name: 'Sport Pro',
    file: 'Esfera-Sportpro.apk',
    description:
      'Digital deportiva con un color para cada parte (hora, minutos, fecha, raya, datos y marcas: 10 colores) y brillo de fondo. Toca la hora o los minutos para abrir PulsoMedia o PulsoMusic, y la batería para ver su consumo.',
    features: ['Digital', '10 colores por parte', 'PulsoMedia', 'PulsoMusic', 'Ritmo cardíaco', 'Pasos', 'Segundos'],
    added: '2026-11-12',
  },
  {
    id: 'sport',
    name: 'Sport',
    file: 'Esfera-Sport.apk',
    description:
      'Digital deportiva con 9 temas de color: día, mes, fecha y año, hora 12/24 h como el teléfono, segundos, batería, ritmo cardíaco y pasos. Toca la hora o los minutos para abrir PulsoMedia o PulsoMusic.',
    features: ['Digital', '9 temas', 'PulsoMedia', 'PulsoMusic', 'Ritmo cardíaco', 'Pasos', 'Batería'],
    added: '2026-11-12',
  },
  {
    id: 'neon',
    name: 'Neón',
    file: 'Esfera-Neon.apk',
    description:
      'Cuatro arcos de neón con 8 accesos que eliges tú (PulsoMedia, PulsoMusic, alarmas, temporizador, ajustes), hora cian con borde rosa, fecha con año, batería y dos datos.',
    features: ['Digital', '8 accesos', 'PulsoMedia', 'PulsoMusic', 'Batería', 'Pasos'],
    added: '2026-11-12',
  },
  {
    id: 'hud',
    name: 'HUD',
    file: 'Esfera-Hud.apk',
    description:
      'Panel de instrumentos: hora grande con brillo, arco de batería, arco de segundos, tres datos y 6 accesos en el bisel (PulsoMedia, PulsoMusic, alarmas…).',
    features: ['Digital', '6 accesos', 'PulsoMedia', 'PulsoMusic', 'Batería', 'Segundos'],
    added: '2026-11-12',
  },
  {
    id: 'digital',
    name: 'Digital',
    file: 'Esfera-Digital.apk',
    description:
      'Hora grande que usa toda la pantalla, fecha, y abajo batería y pasos lado a lado. Un anillo de segundos corre suave por el borde y se completa cada minuto. 8 colores, marcas del borde suaves, clásicas, en puntos o sin marcas, y accesos a PulsoMedia y PulsoMusic.',
    features: ['Digital', 'Anillo de segundos', '8 colores', 'Batería', 'Pasos', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-13',
  },
  {
    id: 'cronografo',
    name: 'Cronógrafo',
    file: 'Esfera-Cronografo.apk',
    description: 'Deportiva con bisel taquímetro y fibra de carbono: ritmo cardíaco, clima y pasos en tres círculos, día, fecha, batería y accesos a PulsoMedia y PulsoMusic.',
    features: ['Analógica', 'PulsoMedia', 'PulsoMusic', 'Ritmo cardíaco', 'Clima', 'Pasos'],
    added: '2026-11-12',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    file: 'Esfera-Explorer.apk',
    description: 'Mapa topográfico con brújula en el bisel (tócalo y la N apunta al norte), altitud, un dato a elegir como el clima y accesos a PulsoMedia y PulsoMusic.',
    features: ['Analógica', 'Brújula', 'PulsoMedia', 'PulsoMusic', 'Altitud', 'Clima'],
    added: '2026-11-12',
  },
]

export const watchFaceById = (id: string) => WATCH_FACES.find((f) => f.id === id)
