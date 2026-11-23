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
    id: 'vinilo',
    name: 'Vinilo',
    file: 'Esfera-Vinilo.apk',
    description:
      'Un tocadiscos en tu reloj: la hora con segundos en una pantalla de cristal líquido, batería, clima, luna y AM/PM, la fecha con su interruptor, pasos en un reloj chico y el ritmo cardíaco en la base del brazo. Cuando suena PulsoMusic o PulsoMedia el disco gira, el brazo avanza con la canción y abajo aparece lo que suena. Toca el disco y se abre un mini reproductor retro.',
    features: ['Digital', 'Disco que gira', 'Mini reproductor', 'Canción sonando', 'Pasos', 'Ritmo cardíaco', 'Calorías', 'Distancia', '7 colores', 'PulsoMusic', 'PulsoMedia'],
    added: '2026-11-21',
  },
  {
    id: 'horizonte',
    name: 'Horizonte',
    file: 'Esfera-Horizonte.apk',
    description:
      'De agujas en dos colores: arriba oscuro y abajo el color del tema, números finos girados, la fecha y tres círculos de datos (batería, pasos y ritmo cardíaco) que puedes cambiar. 10 colores, 4 estilos de agujas y 5 segunderos. Opcional: toca el centro y se abre el reproductor de PulsoMusic o PulsoMedia con la hora y la batería.',
    features: ['Analógica', '10 colores', '4 agujas', '5 segunderos', 'Reproductor', 'Batería', 'Pasos', 'Ritmo cardíaco', 'PulsoMusic', 'PulsoMedia'],
    added: '2026-11-20',
  },
  {
    id: 'secuencia',
    name: 'Secuencia',
    file: 'Esfera-Secuencia.apk',
    description:
      'Negra y retro: una franja al centro con la fecha, la hora grande en números cuadrados, los dos puntos que pulsan, los segundos y AM/PM. Arriba y abajo corren las columnas de horas, minutos y segundos (los que vienen y los que pasaron), cada vez más chicos y tenues; los segundos siguen la curva del borde. A la izquierda: notificaciones sin leer, pasos, batería y ritmo cardíaco.',
    features: ['Digital', 'Secuencia de tiempo', 'Segundos en movimiento', '7 colores', 'Notificaciones', 'Pasos', 'Ritmo cardíaco', 'PulsoMusic', 'PulsoMedia'],
    added: '2026-11-20',
  },
  {
    id: 'mundo',
    name: 'LCD Mundo',
    file: 'Esfera-Mundo.apk',
    description:
      'Pantallitas de cristal líquido: clima, próximo evento con la fase de la luna, hora con segundos, fecha, mapa del mundo con la noche según la hora, reloj de agujas, pasos, ritmo cardíaco y batería. Toca el reloj de agujas y se abre el reproductor de lo que suena en PulsoMusic o PulsoMedia.',
    features: ['Digital', 'LCD', 'Mapa mundial', 'Fase lunar', 'Reproductor', '7 colores', 'Ritmo cardíaco', 'Pasos', 'PulsoMusic', 'PulsoMedia'],
    added: '2026-11-19',
  },
  {
    id: 'hibrida',
    name: 'Pulso Híbrida',
    file: 'Esfera-Hibrida.apk',
    description:
      'Agujas y digital a la vez: escala de minutos en el borde, clima, pasos con distancia y meta, próximo evento junto al clima, mini reproductor de PulsoMusic o PulsoMedia siempre a la vista, reloj de agujas con fecha y alarma, hora grande con segundos, mes y días de la semana, batería y ritmo cardíaco con su zona.',
    features: ['Híbrida', 'Mini reproductor', 'Clima', 'Pasos', 'Eventos', 'Ritmo cardíaco', '6 colores', 'PulsoMusic', 'PulsoMedia'],
    added: '2026-11-18',
  },
  {
    id: 'lumina',
    name: 'Lumina',
    file: 'Esfera-Lumina.apk',
    description:
      'Digital retro con luz: pantalla de cristal líquido que se ilumina al tocarla, día y fecha, alarma, batería, hora con segundos, ritmo cardíaco con su estado (Bajo, Normal, Alto), pasos y distancia, APP 1 y APP 2 a los lados y WATER 50 RESIST abajo. 11 pantallas (incluida la clásica de cristal líquido) y 7 colores de frente.',
    features: ['Digital', 'LCD', '11 pantallas', '7 colores', 'Luz', 'Ritmo cardíaco', 'Pasos', 'Distancia', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-15',
  },
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
      'El reloj retro con el frente relleno y un halo de luz alrededor: pantalla de cristal líquido con luz al tocar LIGHT, botones SCH, TEL, ADJUST y MEMO, temperatura, pasos, batería y ritmo. Colores del frente, del halo, del marco y de la pantalla. Nuevo diseño Calculadora: teclado que calcula de verdad y la fecha al lado de la hora.',
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
      'Limpia y completa: humedad, clima y UV arriba; temperatura mínima, actual y máxima; día, mes, fecha y AM/PM; hora grande con segundos; próximo evento con fase lunar; hora mundial, ritmo cardíaco, pasos y batería. Reproductor de PulsoMusic y PulsoMedia en el recuadro del evento. 16 temas y pantalla siempre activa de bajo consumo.',
    features: ['Digital', '16 temas', 'Reproductor', 'Bajo consumo', 'Clima', 'Eventos', 'Hora mundial', 'PulsoMedia', 'PulsoMusic'],
    added: '2026-11-13',
  },
  {
    id: 'retro',
    name: 'Retro LCD',
    file: 'Esfera-Retro.apk',
    description:
      'Reloj digital retro de los 80: pantalla de cristal líquido con reflejo y luz (toca LIGHT y se ilumina 3 segundos), dígitos de segmentos con sus «8» apagados, marco curvo y botones SCH, TEL, ADJUST y MEMO que abren lo que elijas. Pantalla clásica, invertida o con luz azul; temperatura, pasos, batería y ritmo. Nuevo diseño Gaming: pantalla negra con dígitos de color y hora con segundos grandes.',
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
    long: 'Limpia y completa: humedad, clima y UV arriba; temperatura mínima, actual y máxima; día, mes, fecha y AM/PM; hora con segundos; próximo evento con fase lunar; hora mundial, ritmo cardíaco, pasos y batería. Un triángulo rojo recorre el borde con los segundos. Cuando suena PulsoMusic o PulsoMedia, el recuadro del evento muestra la canción con su avance y los botones ◄◄ ►‖ ►|.',
    customize: ['16 temas (negro, blanco, grafito, azul noche, verde militar, arena, rojo vino, celeste, azul eléctrico, morado, menta, naranja, rosa, petróleo, café, gris perla)', 'Reproductor en el evento al sonar PulsoMusic, o apagado', 'Pantalla siempre activa completa (los segundos quedan quietos) o mínima', 'Segundero suave o por segundos', ...COMMON],
  },
  retro: {
    gallery: 3,
    long: 'Reloj digital retro de los 80 con pantalla de cristal líquido: dígitos de segmentos con sus «8» apagados, letras de puntos, marco curvo y botones rotulados. LIGHT ilumina la pantalla 3 segundos; SCH, TEL, ADJUST y MEMO abren lo que elijas. Con el diseño Gaming la pantalla es negra, con dígitos de color, ícono de señal, día y año en puntos, fecha y hora con segundos grandes; el marco es negro (sin luz alrededor) o del color que elijas.',
    customize: [
      'Modo reproductor (opcional, apagado al instalar): al sonar PulsoMusic la pantalla muestra la canción, el artista, la barra y botones ◄ ►‖ ►|; tocar la pantalla cambia entre la vista normal y el reproductor','Diseño Clásico o Gaming', '7 colores del diseño Gaming', 'Marco Gaming: negro, gris, de color u oculto', 'Pantalla clásica gris, invertida o con luz azul', 'Color de los dígitos (invertida)', 'Frente a color o blanco y negro', 'Marco de colores u oculto', 'Temperatura de la batería (°C/°F) o del clima', ...COMMON],
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
    long: 'El reloj retro con el frente relleno de color y un halo de luz alrededor. Tiene todo lo de la Retro LCD: luz al tocar LIGHT, botones que abren lo que elijas, temperatura, pasos, batería y ritmo cardíaco. Con el diseño Calculadora la pantalla iluminada muestra la hora con la fecha al lado, y el teclado es una calculadora que funciona (suma, resta, multiplica y divide; toca la pantalla para volver a la hora). LIGHT, SCH y TEL siguen funcionando.',
    customize: [
      'Modo reproductor (opcional, apagado al instalar): al sonar PulsoMusic la pantalla muestra la canción, el artista, la barra y botones ◄ ►‖ ►|; tocar la pantalla cambia entre la vista normal y el reproductor','Diseño Clásico o Calculadora', 'Pantalla de la calculadora: ámbar, gris, azul, verde o invertida', '6 colores de frente', '7 halos de luz (o sin halo)', 'Pantalla, dígitos, marco y frente a color o B/N', 'Temperatura de la batería o del clima', ...COMMON],
  },
  lcdtotal: {
    gallery: 2,
    long: 'Toda la esfera es una pantalla de cristal líquido con luz de fondo (tócala y se ilumina más). Fecha en letras de segmentos con año, ALM, SIG y DST que se encienden de verdad (alarma puesta, conexión y horario de verano), caja de batería con forma de pila, hora grande con segundos y celdas de ritmo cardíaco y pasos.',
    customize: ['8 pantallas (claras y en negativo)', '5 colores de luz de fondo', 'Segundos visibles u ocultos', 'Bajo consumo: esfera completa tenue o mínima', ...COMMON],
  },
  mundo: {
    gallery: 3,
    long: 'Una esfera de pantallitas de cristal líquido: arriba el clima con su ícono y dos accesos (PulsoMedia y PulsoMusic, o lo que elijas), el próximo evento del calendario con la fase de la luna, la hora con segundos sobre sus «8» apagados, la fecha (día, número y mes), un mapa del mundo con la sombra de la noche según la hora y un reloj de agujas. Abajo, los pasos, el ritmo cardíaco y la batería. Toca el reloj de agujas: se abre un reproductor con la hora, la canción que suena en PulsoMusic o PulsoMedia, su avance y los botones ◄◄ ►‖ ►►; toca fuera de los botones para volver.',
    customize: [
      '7 colores de pantalla: gris, amarillo, crema, lavanda, lima, celeste y menta',
      'Fondo: negro, gris oscuro o grafito',
      'Accesos de arriba visibles u ocultos',
      'Toca el mapa y cambia: noche y día, sol y luna (dónde está cada uno y el crepúsculo), reloj mundial (Nueva York, Los Ángeles, Londres, Tokio y Sídney) y tu día (a qué hora sale y se pone el sol donde estás y cuánta luz queda)',
      'Punto que late suave donde estás (con el permiso de ubicación; si no, la ciudad de tu zona horaria)',
      'En bajo consumo los segundos quedan quietos y vuelven a correr al encender la pantalla',
      'Mapa con la noche (hora mundial) o solo el mapa',
      'Bajo consumo: esfera completa tenue o mínima',
      'Clima: elige el dato en Personalizar',
      ...COMMON,
    ],
  },
  vinilo: {
    gallery: 3,
    long: 'Una esfera con forma de tocadiscos. Arriba el clima y la hora con segundos en una pantalla negra de cristal líquido con borde claro (los segmentos apagados se ven apenas, como en las de verdad); a los lados la batería, la luna y AM/PM. Debajo, la fecha (día y DD - MM) con un interruptor metálico. A la izquierda, los pasos en un reloj chico con aguja roja hacia tu meta. Al centro, un disco de vinilo con surcos y brillo; a la derecha el brazo con su contrapeso y el ritmo cardíaco escrito alrededor de su base. Abajo, las calorías y la distancia. Cuando suena PulsoMusic o PulsoMedia en el teléfono, el disco gira a 33⅓ vueltas, el brazo avanza hacia el centro con la canción y abajo aparece la canción que suena. Toca el disco y se abre un mini reproductor retro con la hora, la batería, la canción, el avance y los botones ◄◄ ►‖ ►►.',
    customize: [
      'Centro del disco: rojo, azul, verde, dorado, violeta, naranja o plata',
      'Números de la pantalla: blanco, cian, ámbar, verde o rojo',
      'Disco que gira al sonar música o siempre quieto',
      'Abajo, al sonar música: la canción o siempre calorías y distancia',
      'Meta de pasos para la aguja: 6.000 a 15.000',
      'Bajo consumo: esfera completa tenue o solo la hora',
      'Clima, pasos, ritmo, calorías y distancia: elige el dato en Personalizar',
      ...COMMON,
    ],
  },
  horizonte: {
    gallery: 3,
    long: 'Una esfera de agujas partida en dos: la mitad de arriba gris oscuro y la de abajo del color del tema. Números finos y angostos girados en el 12, 2, 4, 8 y 10, líneas en las otras horas y triángulos en el 3, 6 y 9. Bajo el 12 va la fecha (mes, día y día de la semana). Tres círculos de datos: batería con su arco, pasos con el arco hacia tu meta y ritmo cardíaco; los tres se pueden cambiar por otro dato. Agujas en dos tonos con punta y segundero rojo con cola. Si activas el reproductor, toca el centro y se abre una pantalla con la hora, la batería, la canción, el avance y los botones ◄◄ ►‖ ►► de PulsoMusic o PulsoMedia.',
    customize: [
      '10 colores del tema: menta, azul, verde, coral, ámbar, lavanda, rosa, celeste, arena y gris',
      'Agujas: lanza (como la foto), bastón, espada o delgadas; en blanco, plata o del color del tema',
      'Segundero: rojo con cola, rojo con círculo, del color del tema, blanco o sin segundero',
      'Segundero suave (continuo) o pulso a pulso',
      'Reproductor: apagado o se abre tocando el centro',
      'Meta de pasos para el arco: 6.000 a 15.000',
      'Bajo consumo: esfera completa tenue o solo agujas y fecha',
      'Los tres círculos: elige el dato en Personalizar',
      ...COMMON,
    ],
  },
  secuencia: {
    gallery: 3,
    long: 'Una esfera negra donde el tiempo se ve correr. Al centro, una franja gris con la fecha (día, mes y número), la hora grande en números cuadrados, los dos puntos que pulsan cada segundo, los segundos y AM/PM. Sobre y bajo la franja están las columnas de horas, minutos y segundos: arriba los que vienen y abajo los que pasaron, cada vez más pequeños y tenues; la de segundos avanza cada segundo y sigue la curva del borde. A la izquierda, las notificaciones sin leer, los pasos, la batería y el ritmo cardíaco. Toca la hora para abrir PulsoMedia y los segundos para PulsoMusic.',
    customize: [
      '7 colores de la hora: blanco, ámbar, cian, verde, rojo, naranja y violeta',
      'Líneas de la franja: gris y bronce, del color de la hora o grises',
      'Dos puntos que pulsan o fijos',
      'Bajo consumo: esfera completa tenue (sin la columna de segundos) o mínima',
      ...COMMON,
    ],
  },
  hibrida: {
    gallery: 3,
    long: 'Una esfera híbrida: un reloj de agujas con fecha y campana de alarma junto a la hora digital grande con segundos. Arriba, el clima y los pasos con la distancia y la meta en 5 tramos de color. Donde va el próximo evento del calendario aparece un mini reproductor cuando suena PulsoMusic o PulsoMedia en el teléfono: título, artista, barra de avance y botones ◄ ►‖ ►|. Abajo, el mes, los días de la semana (el de hoy marcado), la batería y el ritmo cardíaco con su zona (bajo, normal o alto).',
    customize: [
      '6 colores: naranja y cian, verde, azul, rojo, violeta y blanco',
      'Meta de pasos: 6.000, 8.000, 10.000, 12.000 o 15.000',
      'Reproductor siempre visible (sin música muestra «Sin música») u ocultarlo y ver los eventos ahí',
      'Segundero suave o por segundos',
      'Bajo consumo: esfera completa tenue o mínima',
      'Clima: elige el dato en Personalizar',
      ...COMMON,
    ],
  },
  lumina: {
    gallery: 3,
    long: 'Una esfera digital retro con luz. Arriba, triángulos de color y el nombre; al centro, un panel con marco de color con el ritmo cardíaco y su estado (Bajo, Normal o Alto), y una pantalla de cristal líquido con la batería, el día, la fecha (con sus «8» apagados), la campana de la alarma (se enciende si tienes una puesta), la hora grande con segundos e indicador P/24. Abajo, los pasos y la distancia recorrida, y WATER 50 RESIST. Toca la pantalla y se ilumina 3 segundos. APP 1 y APP 2, a los costados, abren PulsoMedia y PulsoMusic (o lo que elijas).',
    customize: [
      'Modo reproductor (opcional, apagado al instalar): al sonar PulsoMusic la pantalla muestra la canción, el artista, la barra y botones ◄ ►‖ ►|; tocar la pantalla cambia entre la vista normal y el reproductor',
      '11 pantallas: clásica de cristal líquido, gris, naranja, verde menta, rojo, amarillo, beige y negativas amarilla, cian, granate y magenta',
      '7 colores de frente: rojo y azul, verde, dorado, rosa, azul, plata y negro',
      'Segundos visibles u ocultos',
      'Distancia en kilómetros o millas',
      'Bajo consumo: esfera completa tenue o mínima',
      ...COMMON,
    ],
  },
  tactica: {
    gallery: 2,
    long: 'Estilo militar: caja de fecha sobre rejilla, ALM, SIG y DST reales, hora en números cuadrados en un panel con dos puntos que parpadean, segundos y AM/PM, panel de batería con pila de 6 barras, arcos de segundos y batería en el borde y cajas de ritmo cardíaco y pasos.',
    customize: ['7 temas (caqui, desierto, ártico, rojo, verde, blanco, naranja)', 'Dos puntos que parpadean o fijos', 'Segundos visibles u ocultos', 'Bajo consumo: esfera completa tenue o mínima', 'Segundero suave o por segundos', ...COMMON],
  },
}
