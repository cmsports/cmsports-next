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

  FASES_ORDEN: ['avance', '32vos', '16vos', '8vos', 'cuartos', 'semis', 'final'] as const,

  FASE_LABELS: {
    inscripcion: 'Inscripcion',
    grupos: 'Fase de grupos',
    avance: 'Llave de avance',
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
