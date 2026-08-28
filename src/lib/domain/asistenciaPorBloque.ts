/**
 * Asistencia repartida por bloque, por mes y por jugador.
 *
 * Vivía adentro de `asistencia-bloque-excel.ts`. Se sacó acá cuando el mismo
 * reporte pasó a poder bajarse también en PDF: dos generadores que recalculan
 * "parecido" es cómo un día el Excel dice 72% y el PDF 68% y no hay manera de
 * saber cuál miente. El cálculo es uno solo; los dos archivos son maquetación.
 *
 * Acá no se decide si un día cuenta como falta: eso ya lo resolvió
 * `calendarioJugador` en historialAsistencia.ts. Esto solo lo reparte.
 */

import { calendarioJugador, indexar, type BloqueVigente, type DatosHistorial } from './historialAsistencia'

export type JugadorDeBloque = {
  id: string
  nombre: string
  categoria?: string | null
  grupo?: string | null
  sede?: string | null
}

export type Conteo = { presentes: number; ausentes: number; pendientes: number }

export function conteoVacio(): Conteo {
  return { presentes: 0, ausentes: 0, pendientes: 0 }
}

function sumar(a: Conteo, b: Conteo): Conteo {
  return {
    presentes: a.presentes + b.presentes,
    ausentes: a.ausentes + b.ausentes,
    pendientes: a.pendientes + b.pendientes,
  }
}

/** El % sobre los días resueltos. `null` no es 0: es "todavía no hay nada". */
export function pctDe(c: Conteo): number | null {
  const resueltos = c.presentes + c.ausentes
  return resueltos > 0 ? Math.round((c.presentes / resueltos) * 100) : null
}

/** "8 de 12" — asistió de programado, que es como lo lee el profe. */
export function razon(c: Conteo): string {
  return `${c.presentes} de ${c.presentes + c.ausentes}`
}

export const DIA_ORDEN: Record<string, number> = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 7 }
export const DIA_LARGO: Record<string, string> = {
  lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo',
}

// Nombre corto de sede para los títulos. 'paine' es la comuna; la cancha es el
// Centro Deportivo Fátima, que es como el profe la reconoce.
const SEDE_CORTA: Record<string, string> = { buin: 'Buin', paine: 'Fátima', ambos: 'Buin y Fátima' }
export function sedeCorta(v: string | null | undefined): string {
  if (!v) return 'Sin sede'
  return SEDE_CORTA[v] ?? v.charAt(0).toUpperCase() + v.slice(1)
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** "2026-08" → "Agosto 2026". */
export function mesLabel(mesKey: string): string {
  const [anio, mes] = mesKey.split('-').map(Number)
  return `${MESES[mes - 1]} ${anio}`
}

/** El horario que identifica un bloque: "Martes 18:30". */
export function horarioDeBloque(b: BloqueVigente): string {
  return `${DIA_LARGO[b.dia_semana] ?? b.dia_semana} ${(b.hora_inicio ?? '').slice(0, 5)}`.trim()
}

export type FilaDeBloque = { jugador: JugadorDeBloque; conteo: Conteo }

export type ResumenBloque = {
  bloque: BloqueVigente
  total: Conteo
  /** De peor a mejor asistencia: lo que hay que mirar va arriba. */
  jugadores: FilaDeBloque[]
}

export type AgrupadoPorBloque = {
  /** Meses con actividad, del más reciente al más viejo. */
  meses: string[]
  /** Los bloques de cada mes, ordenados por día y hora. */
  porMes: Map<string, ResumenBloque[]>
  /** Lo mismo sumado en todo el rango. */
  periodo: ResumenBloque[]
  totalClub: Conteo
  /** Sedes presentes, Buin y Fátima primero. */
  sedes: string[]
}

const ORDEN_SEDES = ['buin', 'paine']

function ordenarBloques(a: BloqueVigente, b: BloqueVigente): number {
  return (DIA_ORDEN[a.dia_semana] ?? 9) - (DIA_ORDEN[b.dia_semana] ?? 9)
    || (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? '')
}

function ordenarFilas(a: FilaDeBloque, b: FilaDeBloque): number {
  return (pctDe(a.conteo) ?? -1) - (pctDe(b.conteo) ?? -1)
    || a.jugador.nombre.localeCompare(b.jugador.nombre, 'es')
}

/**
 * Reparte la asistencia del rango por mes, por bloque y por jugador.
 *
 * Un jugador inscrito en dos bloques suma en los dos: es la misma regla que ya
 * usa el Panorama al repartir por grupo, y no se le resta a uno por estar en el
 * otro. Las clases extraordinarias quedan fuera —vino a un grupo que no era el
 * suyo, no consume sesión—.
 */
export function agruparPorBloque(
  datos: DatosHistorial,
  jugadores: JugadorDeBloque[],
  desde: string,
  hasta: string,
): AgrupadoPorBloque {
  const indice = indexar(datos)
  const bloquePorNombre = new Map(datos.bloques.map(b => [b.nombre, b]))
  const jugadorPorId = new Map(jugadores.map(j => [j.id, j]))

  // mes → bloque.id → jugador.id → conteo. Un solo recorrido: el calendario de
  // cada jugador se arma una vez para todo el rango y de ahí se reparte, no se
  // recalcula por cada combinación mes×bloque.
  const porMesBloque = new Map<string, Map<string, Map<string, Conteo>>>()
  const porBloque = new Map<string, Map<string, Conteo>>()

  const anotar = (destino: Map<string, Map<string, Conteo>>, bloqueId: string, jugadorId: string, estado: string) => {
    let porJugador = destino.get(bloqueId)
    if (!porJugador) { porJugador = new Map(); destino.set(bloqueId, porJugador) }
    const c = porJugador.get(jugadorId) ?? conteoVacio()
    if (estado === 'presente') c.presentes++
    else if (estado === 'ausente') c.ausentes++
    else c.pendientes++
    porJugador.set(jugadorId, c)
  }

  for (const j of jugadores) {
    for (const dia of calendarioJugador(j.id, desde, hasta, datos, indice)) {
      if (dia.estado === 'extraordinaria') continue
      const mesKey = dia.fecha.slice(0, 7)
      for (const nombreBloque of dia.bloques) {
        const bloque = bloquePorNombre.get(nombreBloque)
        if (!bloque) continue
        let delMes = porMesBloque.get(mesKey)
        if (!delMes) { delMes = new Map(); porMesBloque.set(mesKey, delMes) }
        anotar(delMes, bloque.id, j.id, dia.estado)
        anotar(porBloque, bloque.id, j.id, dia.estado)
      }
    }
  }

  const resumir = (fuente: Map<string, Map<string, Conteo>>): ResumenBloque[] =>
    [...fuente.entries()]
      .map(([bloqueId, porJugador]) => {
        const bloque = datos.bloques.find(b => b.id === bloqueId)
        if (!bloque) return null
        const jugadoresDel = [...porJugador.entries()]
          .map(([id, conteo]) => ({ jugador: jugadorPorId.get(id), conteo }))
          .filter((f): f is FilaDeBloque => !!f.jugador)
          .sort(ordenarFilas)
        return { bloque, total: jugadoresDel.reduce((acc, f) => sumar(acc, f.conteo), conteoVacio()), jugadores: jugadoresDel }
      })
      .filter((r): r is ResumenBloque => !!r)
      .sort((a, b) => ordenarBloques(a.bloque, b.bloque))

  const periodo = resumir(porBloque)
  const porMes = new Map([...porMesBloque].map(([mes, fuente]) => [mes, resumir(fuente)] as const))

  const sedes = [...new Set(periodo.map(r => r.bloque.sede ?? ''))]
    .sort((a, b) => {
      const ia = ORDEN_SEDES.indexOf(a), ib = ORDEN_SEDES.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })

  return {
    meses: [...porMes.keys()].sort().reverse(),
    porMes,
    periodo,
    totalClub: periodo.reduce((acc, r) => sumar(acc, r.total), conteoVacio()),
    sedes,
  }
}
