import { MODULOS_KEYS, type Modulo } from '@/lib/domain/modulos'

// Las claves salen del catálogo único (`src/lib/domain/modulos.ts`). Este
// archivo tenía su propia copia con 8 módulos y se quedó atrás.
export const MODULOS_CLUB = MODULOS_KEYS
export type ModuloClub = Modulo

const RUTAS_POR_MODULO: ReadonlyArray<{ modulo: ModuloClub; rutas: readonly string[] }> = [
  // El torneo interno y el ranking viven en rutas propias que no cuelgan de
  // /torneos: sin nombrarlas acá, apagar el módulo las dejaba abiertas por URL.
  { modulo: 'torneos', rutas: ['/torneos', '/torneos-internos', '/ranking'] },
  { modulo: 'torneo_oficial', rutas: ['/torneo-oficial'] },
  { modulo: 'liga', rutas: ['/liga'] },
  // `/mi-horario` es la vista del jugador de lo mismo que el staff arma en
  // `/horario`, así que depende del mismo módulo. La ruta /clases ya no está:
  // esa pantalla se eliminó y su página quedó como redirect a /dashboard.
  { modulo: 'clases', rutas: ['/horario', '/mi-horario'] },
  { modulo: 'calendario', rutas: ['/calendario'] },
  { modulo: 'asistencia', rutas: ['/asistencia'] },
  { modulo: 'mensualidades', rutas: ['/mensualidades', '/estado-cuenta'] },
  { modulo: 'finanzas', rutas: ['/finanzas', '/reportes'] },
  { modulo: 'tienda', rutas: ['/tienda'] },
  // Estos cuatro faltaban: el sidebar sí los escondía cuando el módulo estaba
  // apagado, pero la URL directa seguía abriendo la pantalla. Las claves están
  // cruzadas respecto del nombre visible y así es como viven en la base:
  // `tienda_buin` es "Tienda del profe" y `tienda_asociacion` es "Tienda Buin".
  { modulo: 'tienda_buin', rutas: ['/tienda-profe'] },
  { modulo: 'tienda_asociacion', rutas: ['/tienda-buin'] },
  { modulo: 'bibliografia', rutas: ['/bibliografia-tdm'] },
  { modulo: 'libro_profe', rutas: ['/libro-profe'] },
  { modulo: 'feedback', rutas: ['/feedbacks'] },
  { modulo: 'tecnico', rutas: ['/tecnico'] },
  // /superadmin/tareas no se lista: el proxy ya cierra todo /superadmin a
  // quien no es superadmin, y no es un módulo que un club active.
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
