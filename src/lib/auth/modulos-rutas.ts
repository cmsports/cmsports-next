export const MODULOS_CLUB = [
  'torneos', 'liga', 'clases', 'calendario', 'asistencia',
  'mensualidades', 'finanzas', 'redes', 'tienda',
] as const

export type ModuloClub = typeof MODULOS_CLUB[number]

const RUTAS_POR_MODULO: ReadonlyArray<{ modulo: ModuloClub; rutas: readonly string[] }> = [
  { modulo: 'torneos', rutas: ['/torneos', '/torneos-externos'] },
  { modulo: 'liga', rutas: ['/liga', '/ranking'] },
  { modulo: 'clases', rutas: ['/clases', '/mis-clases'] },
  { modulo: 'calendario', rutas: ['/calendario'] },
  { modulo: 'asistencia', rutas: ['/asistencia'] },
  { modulo: 'mensualidades', rutas: ['/mensualidades', '/estado-cuenta'] },
  { modulo: 'finanzas', rutas: ['/finanzas', '/reportes'] },
  { modulo: 'redes', rutas: ['/redes-sociales'] },
  { modulo: 'tienda', rutas: ['/tienda'] },
]

function coincideRuta(pathname: string, ruta: string) {
  return pathname === ruta || pathname.startsWith(`${ruta}/`)
}

export function moduloRequeridoPorRuta(pathname: string): ModuloClub | null {
  for (const grupo of RUTAS_POR_MODULO) {
    if (grupo.rutas.some(ruta => coincideRuta(pathname, ruta))) return grupo.modulo
  }
  return null
}

export function puedeAccederModulo(pathname: string, modulos: readonly string[]) {
  const requerido = moduloRequeridoPorRuta(pathname)
  return !requerido || modulos.includes(requerido)
}
