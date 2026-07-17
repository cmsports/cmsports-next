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
    final: 'Final',
    finalizado: 'Finalizado',
  } as const,

  CATEGORIAS_INGRESO: [
    'mensualidad',
    'inscripcion_torneo',
    'arriendo_cancha',
    'donacion',
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
