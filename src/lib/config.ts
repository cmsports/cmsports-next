export const CONFIG = {
  MENSUALIDAD_BASE: 25000,

  SESIONES_LIMITE_DEFAULT: 12,

  PLANES: [
    { sesiones: 4, monto: 15000 },
    { sesiones: 8, monto: 25000 },
    { sesiones: 12, monto: 30000 },
    { sesiones: 16, monto: 40000 },
  ] as const,

  TORNEO_MIN_JUGADORES: 4,
  TORNEO_JUGADORES_POR_GRUPO: 3,
  TORNEO_MAX_GRUPOS: 32,
  TORNEO_MAX_CLASIFICADOS: 64,

  // Tope de una liguilla, donde los partidos crecen al cuadrado.
  //
  // Nació en 200 pensando en un torneo de un día, y eso estaba mal encuadrado:
  // una liguilla NO se juega de una sentada. El calendario sale repartido en
  // fechas —30 inscritos son 29 fechas de 15 partidos— y así se juega semana a
  // semana, como una liga. Spinhouse pidió soportar cerca de 30 (2026-09-09).
  //
  // 500 cubre eso con margen:
  //   · una rueda    → hasta 32 inscritos (496 partidos, 31 fechas)
  //   · ida y vuelta → hasta 22 inscritos (462 partidos, 42 fechas)
  //
  // Y sigue frenando lo que no es una decisión sino un error de dedo: 30 a ida
  // y vuelta son 870 partidos en 58 fechas, más de un año de liga semanal.
  // Cuando eso pasa, el aviso propone la salida real —una sola rueda— en vez
  // de mandar a cambiar de formato.
  LIGUILLA_MAX_PARTIDOS: 500,

  // Tope de partidos de la fase de grupos del torneo tradicional.
  //
  // Hasta la auditoría del 2026-09-10 el tradicional NO tenía tope real:
  // `calcularNumGrupos` capa en 32 grupos, así que la validación que existía
  // —"más de 32 grupos"— nunca podía dispararse. Pasados los ~96 inscritos lo
  // que crece es el tamaño de cada grupo, y los partidos con su cuadrado:
  // 300 inscritos daban 32 grupos de ~9 y más de mil partidos, en silencio.
  //
  // 600 deja pasar unos 200 inscritos (grupos de ~6) y frena lo que ningún club
  // puede jugar. Se mide en partidos y no en jugadores porque es lo que de
  // verdad duele: 32 grupos de 3 son 96 partidos y 32 de 8 son 896.
  GRUPOS_MAX_PARTIDOS: 600,

  // El camino del cuadro, de la ronda más grande a la final.
  //
  // Hasta el 2026-09-10 empezaba en '32vos', y eso le ponía un techo invisible:
  // `determinarFaseInicial` devuelve la primera fase que cubre el tamaño, pero
  // como no había nada más arriba, TODO cuadro mayor a 64 caía igual en '32vos'
  // y el camino quedaba corto. Con 65 inscritos el torneo terminaba con DOS
  // partidos en 'final'; con 129, con cuatro. No daba error: daba dos campeones.
  //
  // Con '64vos' y '128vos' el cuadro llega hasta 256 inscritos, que es techo de
  // sobra para un club de 140. Agregarlas al principio no toca a nadie:
  // `siguienteFase('32vos')` sigue siendo '16vos'.
  FASES_ORDEN: ['avance', '128vos', '64vos', '32vos', '16vos', '8vos', 'cuartos', 'semis', 'final'] as const,

  FASE_LABELS: {
    inscripcion: 'Inscripcion',
    grupos: 'Fase de grupos',
    avance: 'Llave de avance',
    '128vos': '128vos de final',
    '64vos': '64vos de final',
    '32vos': '32vos de final',
    '16vos': '16vos de final',
    '8vos': '8vos de final',
    cuartos: 'Cuartos de final',
    semis: 'Semifinal',
    tercer_lugar: '3er lugar',
    final: 'Final',
    finalizado: 'Finalizado',
  } as const,

  CATEGORIAS_INGRESO: [
    'mensualidad',
    'inscripcion_torneo',
    'arriendo_cancha',
    'donacion',
    'clase_extraordinaria',
    'otro_ingreso',
  ] as const,

  CATEGORIAS_GASTO: [
    'sueldo_profesor',
    'sueldo_staff',
    'arriendo_cancha',
    'material_deportivo',
    'servicios_basicos',
    'mantenimiento',
    'otro_gasto',
  ] as const,

  CATEGORIA_LABELS: {
    mensualidad: 'Mensualidad',
    inscripcion_torneo: 'Inscripcion torneo',
    arriendo_cancha: 'Arriendo cancha',
    donacion: 'Donacion',
    clase_extraordinaria: 'Clase extra',
    otro_ingreso: 'Otro ingreso',
    sueldo_profesor: 'Sueldo profesor',
    sueldo_staff: 'Sueldo staff',
    material_deportivo: 'Material deportivo',
    servicios_basicos: 'Servicios basicos',
    mantenimiento: 'Mantenimiento',
    otro_gasto: 'Otro gasto',
  } as const,

  MESES: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ] as const,
} as const

export type FaseOrden = (typeof CONFIG.FASES_ORDEN)[number]
export type CategoriaIngreso = (typeof CONFIG.CATEGORIAS_INGRESO)[number]
export type CategoriaGasto = (typeof CONFIG.CATEGORIAS_GASTO)[number]
export type Categoria = CategoriaIngreso | CategoriaGasto
