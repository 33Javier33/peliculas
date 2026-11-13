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
    id: 'tactica',
    name: 'Táctica',
    file: 'Esfera-Tactica.apk',
    description:
      'Estilo militar: caja de fecha sobre rejilla, indicadores ALM (alarma puesta), SIG (conexión) y DST (horario de verano), hora en panel con dos puntos que parpadean, segundos y AM/PM, medidor de batería en columna, arcos de segundos y de batería en el borde, y cajas de ritmo cardíaco y pasos. 7 temas.',
    features: ['Digital', '7 temas', 'ALM/SIG/DST', 'Batería', 'Ritmo cardíaco', 'Pasos', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-13',
  },
  {
    id: 'lcdtotal',
    name: 'LCD Total',
    file: 'Esfera-Lcdtotal.apk',
    description:
      'Toda la esfera es una pantalla de cristal líquido con luz de fondo (tócala y se ilumina más): fecha con año, ALM, SIG y DST que se encienden de verdad, caja de batería, hora con segundos y celdas de ritmo cardíaco y pasos. 8 pantallas (claras y en negativo) y 5 colores de luz.',
    features: ['Digital', 'LCD', '8 pantallas', 'Luz de fondo', 'ALM/SIG/DST', 'Ritmo cardíaco', 'Pasos', 'PulsoMedia'],
    added: '2026-11-13',
  },
  {
    id: 'databank',
    name: 'Data Pulso',
    file: 'Esfera-Databank.apk',
    description:
      'El reloj retro con el frente relleno y un halo de luz alrededor: pantalla de cristal líquido con luz al tocar LIGHT, botones SCH, TEL, ADJUST y MEMO, temperatura, pasos, batería y ritmo. Colores del frente, del halo, del marco y de la pantalla.',
    features: ['Digital', 'Retro LCD', '6 frentes', '7 halos', 'Pasos', 'Temperatura', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-13',
  },
  {
    id: 'lcdpro',
    name: 'LCD Pro',
    file: 'Esfera-Lcdpro.apk',
    description:
      'Pantalla de cristal líquido completa: atardecer/amanecer, batería, hora, día, fecha y segundos, con celdas de ritmo cardíaco, kilómetros y pasos. Arriba clima, sensación térmica y presión (la mide el reloj); abajo el próximo evento. 8 temas claros y oscuros.',
    features: ['Digital', 'LCD', '8 temas', 'Presión', 'Kilómetros', 'Eventos', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-13',
  },
  {
    id: 'lcdcolor',
    name: 'LCD Color',
    file: 'Esfera-Lcdcolor.apk',
    description:
      'Pantalla de cristal líquido de colores (12 temas: lila, rosa, fucsia, celeste, menta, ámbar…) con hora grande y sus «8» apagados, barra de batería y de segundos, ritmo, fecha, pasos y fase lunar. Accesos APP1, APP2, HORA y uno abajo.',
    features: ['Digital', 'LCD', '12 temas', 'Ritmo cardíaco', 'Pasos', 'Fase lunar', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-13',
  },
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
      'Reloj digital retro de los 80: pantalla de cristal líquido con reflejo y luz (toca LIGHT y se ilumina 3 segundos), dígitos de segmentos con sus «8» apagados, marco curvo y botones SCH, TEL, ADJUST y MEMO que abren lo que elijas. Pantalla clásica, invertida o con luz azul; temperatura, pasos, batería y ritmo.',
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

/** Página de cada esfera: imágenes (public/esferas/<id>/1.webp…), descripción completa y qué se personaliza */
export interface WatchFaceDetail {
  gallery: number
  long: string
  customize: string[]
}

const COMMON = [
  'Accesos que abren PulsoMedia, PulsoMusic, alarmas, temporizador, ajustes o batería (eliges cuál en cada lugar)',
  'Datos de los círculos o recuadros (clima, ritmo cardíaco, pasos, eventos…)',
]

export const WATCH_FACE_DETAILS: Record<string, WatchFaceDetail> = {
  explorer: {
    gallery: 3,
    long: 'Una esfera analógica de aventura sobre un mapa topográfico. El bisel es una brújula: tócalo y gira para que la N apunte al norte. Muestra la altitud con el barómetro del reloj, la fecha y un círculo con el dato que elijas (por ejemplo el clima).',
    customize: ['Brújula al norte (sí / no)', 'Segundero suave o por segundos', ...COMMON],
  },
  cronografo: {
    gallery: 2,
    long: 'Cronógrafo deportivo con bisel taquímetro, fondo de fibra de carbono y agujas naranjas con luminiscente. Tres círculos de datos (ritmo cardíaco, clima y pasos), día, fecha y batería.',
    customize: ['Segundero suave o por segundos', ...COMMON],
  },
  digital: {
    gallery: 2,
    long: 'Digital limpia que usa toda la pantalla: hora grande, fecha, y abajo batería y pasos lado a lado. Un anillo de segundos corre suave por el borde y se completa cada minuto.',
    customize: ['8 colores', 'Anillo de segundos: suave, por segundos o apagado', 'Marcas del borde: suaves, clásicas, puntos o ninguna', ...COMMON],
  },
  hud: {
    gallery: 2,
    long: 'Panel de instrumentos con hora grande y brillo cian. El arco cian muestra la batería y el naranja los segundos. Tres círculos de datos y 6 accesos en el bisel.',
    customize: ['Segundero suave o por segundos', ...COMMON],
  },
  neon: {
    gallery: 2,
    long: 'Cuatro arcos de neón (cian, rosa, morado y naranja) con 8 accesos sobre ellos. Hora cian con borde rosa, día, mes y año, batería y dos datos.',
    customize: COMMON,
  },
  sport: {
    gallery: 2,
    long: 'Digital deportiva: día; mes, fecha y año; hora en 12/24 h como el teléfono; minutos con su raya; AM/PM y segundos; batería; ritmo cardíaco y pasos. Una marca roja recorre el borde con los segundos. Toca la hora o los minutos para abrir PulsoMedia o PulsoMusic.',
    customize: ['9 temas de color', 'Segundero suave o por segundos', 'Permiso para leer el ritmo cardíaco del sensor', ...COMMON],
  },
  sportpro: {
    gallery: 3,
    long: 'Como Sport, pero con un color para cada parte: hora, minutos, número del día, raya, datos y marcas, y un brillo de fondo. La batería tiene forma de reloj.',
    customize: ['10 colores para cada parte', 'Brillo de fondo (rojo, verde, azul, morado, gris o ninguno)', 'Segundero suave o por segundos', 'Permiso para leer el ritmo cardíaco', ...COMMON],
  },
  info: {
    gallery: 4,
    long: 'Toda la información de un vistazo: fecha, próximo evento, fase lunar, día del año, semana, hora con segundos y zona horaria, batería con su barra, ritmo cardíaco, pasos con kilómetros y clima. La pantalla siempre activa puede ser mínima (solo la hora) o completa.',
    customize: ['8 colores principales', 'Color de los minutos y de las marcas', 'Pantalla siempre activa: mínima o completa', 'Segundero suave o por segundos', ...COMMON],
  },
  clasica: {
    gallery: 3,
    long: 'Limpia y completa: humedad, clima y UV arriba; temperatura mínima, actual y máxima; día, mes, fecha y AM/PM; hora con segundos; próximo evento con fase lunar; hora mundial, ritmo cardíaco, pasos y batería. Un triángulo rojo recorre el borde con los segundos.',
    customize: ['8 temas (negro, blanco, grafito, azul noche, verde militar, arena, rojo vino, celeste)', 'Pantalla siempre activa de bajo consumo o completa', 'Segundero suave o por segundos', ...COMMON],
  },
  retro: {
    gallery: 3,
    long: 'Reloj digital retro de los 80 con pantalla de cristal líquido: dígitos de segmentos con sus «8» apagados, letras de puntos, marco curvo y botones rotulados. LIGHT ilumina la pantalla 3 segundos; SCH, TEL, ADJUST y MEMO abren lo que elijas.',
    customize: ['Pantalla clásica gris, invertida o con luz azul', 'Color de los dígitos (invertida)', 'Frente a color o blanco y negro', 'Marco de colores u oculto', 'Temperatura de la batería (°C/°F) o del clima', ...COMMON],
  },
  lcdcolor: {
    gallery: 4,
    long: 'Pantalla de cristal líquido de colores con hora grande y sus «8» apagados, barra de batería y de segundos, ritmo cardíaco, fecha, pasos y fase lunar. En pantalla siempre activa se vuelve oscura con segmentos claros.',
    customize: ['12 temas (lila, rosa, fucsia, celeste, menta, ámbar, perla, verde clásico, naranja, rojo, noche, negro)', 'Segundero suave o por segundos', ...COMMON],
  },
  lcdpro: {
    gallery: 4,
    long: 'Pantalla de cristal líquido completa: amanecer/atardecer, batería, hora, día, fecha y segundos, con celdas de ritmo cardíaco, kilómetros y pasos. Arriba clima, sensación térmica y presión (la mide el reloj); abajo el próximo evento.',
    customize: ['8 temas claros y oscuros', ...COMMON],
  },
  databank: {
    gallery: 2,
    long: 'El reloj retro con el frente relleno de color y un halo de luz alrededor. Tiene todo lo de la Retro LCD: luz al tocar LIGHT, botones que abren lo que elijas, temperatura, pasos, batería y ritmo cardíaco.',
    customize: ['6 colores de frente', '7 halos de luz (o sin halo)', 'Pantalla, dígitos, marco y frente a color o B/N', 'Temperatura de la batería o del clima', ...COMMON],
  },
  lcdtotal: {
    gallery: 2,
    long: 'Toda la esfera es una pantalla de cristal líquido con luz de fondo (tócala y se ilumina más). Fecha en letras de segmentos con año, ALM, SIG y DST que se encienden de verdad (alarma puesta, conexión y horario de verano), caja de batería con forma de pila, hora grande con segundos y celdas de ritmo cardíaco y pasos.',
    customize: ['8 pantallas (claras y en negativo)', '5 colores de luz de fondo', 'Segundos visibles u ocultos', ...COMMON],
  },
  tactica: {
    gallery: 2,
    long: 'Estilo militar: caja de fecha sobre rejilla, ALM, SIG y DST reales, hora en panel con dos puntos que parpadean, segundos y AM/PM, panel de batería con pila de 6 barras, arcos de segundos y batería en el borde y cajas de ritmo cardíaco y pasos.',
    customize: ['7 temas (caqui, desierto, ártico, rojo, verde, blanco, naranja)', 'Dos puntos que parpadean o fijos', 'Segundos visibles u ocultos', 'Segundero suave o por segundos', ...COMMON],
  },
}
