/**
 * Agrupa la asistencia por día, por semana y por grupo, para el Panorama.
 *
 * Existe porque el Panorama respondía "¿cómo venimos hace tres meses?" cuando
 * lo que se necesita saber es "¿qué hago esta semana?". Un promedio trimestral
 * esconde justamente lo accionable: que el grupo del martes se cayó, que hoy
 * faltó media lista, que alguien no aparece hace dos semanas.
 *
 * Acá no se decide si un día cuenta como falta o no: eso ya lo resolvió
 * `calendarioJugador` en historialAsistencia.ts. Esto solo junta lo ya resuelto
 * y lo corta por fecha, por semana y por grupo.
 */

import type { DiaCalendario } from './historialAsistencia'

/** El calendario ya armado de un jugador. */
export type CalendarioDeJugador = {
  jugador: { id: string; nombre: string }
  dias: DiaCalendario[]
}

export type Conteo = {
  presentes: number
  ausentes: number
  /** Días vencidos que nadie registró. No son faltas: es lista sin pasar. */
  pendientes: number
  /** Sobre los días ya resueltos. null cuando no hay ninguno todavía. */
  porcentaje: number | null
}

const DIA_POR_INDICE = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const

function comoFecha(iso: string): Date {
  // Mediodía y no medianoche: así ningún cambio de horario de verano corre la
  // fecha un día para atrás al construirla.
  return new Date(`${iso}T12:00:00`)
}

function aIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** El lunes de la semana a la que pertenece esa fecha. */
export function lunesDeLaSemana(fecha: string): string {
  const d = comoFecha(fecha)
  // getDay() da 0 el domingo. El domingo pertenece a la semana que arranca el
  // lunes anterior, seis días atrás, no al lunes siguiente.
  const desplazamiento = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - desplazamiento)
  return aIso(d)
}

/** El viernes de esa misma semana. La semana laboral del club es lun–vie. */
export function viernesDeLaSemana(fecha: string): string {
  const d = comoFecha(lunesDeLaSemana(fecha))
  d.setDate(d.getDate() + 4)
  return aIso(d)
}

export function sumarDias(fecha: string, n: number): string {
  const d = comoFecha(fecha)
  d.setDate(d.getDate() + n)
  return aIso(d)
}

export function sumarSemanas(fecha: string, n: number): string {
  return sumarDias(fecha, n * 7)
}

export function diaDeLaSemana(fecha: string): string {
  return DIA_POR_INDICE[comoFecha(fecha).getDay()]
}

function conteoVacio(): Conteo {
  return { presentes: 0, ausentes: 0, pendientes: 0, porcentaje: null }
}

function acumular(acc: Conteo, estado: DiaCalendario['estado']) {
  if (estado === 'presente') acc.presentes++
  else if (estado === 'ausente') acc.ausentes++
  else if (estado === 'pendiente') acc.pendientes++
  // 'extraordinaria' queda fuera a propósito: vino a un grupo que no era el
  // suyo, no le suma ni le resta. Es la misma regla que en `indicadores`.
}

function cerrar(acc: Conteo): Conteo {
  const resueltos = acc.presentes + acc.ausentes
  return { ...acc, porcentaje: resueltos > 0 ? Math.round((acc.presentes / resueltos) * 100) : null }
}

/** Suma todos los días de todos los jugadores dentro del rango. */
export function conteoDelRango(
  calendarios: CalendarioDeJugador[],
  desde: string,
  hasta: string,
): Conteo {
  const acc = conteoVacio()
  for (const { dias } of calendarios) {
    for (const d of dias) {
      if (d.fecha < desde || d.fecha > hasta) continue
      acumular(acc, d.estado)
    }
  }
  return cerrar(acc)
}

export type ResumenDia = Conteo & {
  fecha: string
  dia: string
  /** Cuántos jugadores tenían que venir ese día. 0 = no había clases. */
  programados: number
}

/**
 * Un resumen por cada día del rango, incluidos los días sin clases.
 *
 * Los días vacíos se devuelven igual, con `programados: 0`: la tira de la
 * semana necesita dibujar los cinco días aunque el miércoles no entrene nadie,
 * o el lunes se correría al lugar del martes.
 */
export function resumenPorDia(
  calendarios: CalendarioDeJugador[],
  desde: string,
  hasta: string,
): ResumenDia[] {
  const porFecha = new Map<string, Conteo & { programados: number }>()

  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    porFecha.set(f, { ...conteoVacio(), programados: 0 })
  }

  for (const { dias } of calendarios) {
    for (const d of dias) {
      const acc = porFecha.get(d.fecha)
      if (!acc) continue // fuera del rango pedido
      if (d.estado === 'extraordinaria') continue
      acc.programados++
      acumular(acc, d.estado)
    }
  }

  return [...porFecha.entries()]
    .map(([fecha, acc]) => ({ ...cerrar(acc), programados: acc.programados, fecha, dia: diaDeLaSemana(fecha) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export type ResumenSemana = Conteo & {
  /** Lunes de esa semana. */
  inicio: string
  programados: number
}

/** Una fila por semana, de la más vieja a la más nueva. */
export function resumenPorSemana(
  calendarios: CalendarioDeJugador[],
  desde: string,
  hasta: string,
): ResumenSemana[] {
  const porSemana = new Map<string, Conteo & { programados: number }>()

  // Se siembran todas las semanas del rango para que una semana sin actividad
  // aparezca como hueco en la tendencia en vez de desaparecer y hacer creer
  // que las dos semanas de al lado fueron seguidas.
  for (let f = lunesDeLaSemana(desde); f <= hasta; f = sumarSemanas(f, 1)) {
    porSemana.set(f, { ...conteoVacio(), programados: 0 })
  }

  for (const { dias } of calendarios) {
    for (const d of dias) {
      if (d.fecha < desde || d.fecha > hasta) continue
      if (d.estado === 'extraordinaria') continue
      const inicio = lunesDeLaSemana(d.fecha)
      const acc = porSemana.get(inicio)
      if (!acc) continue
      acc.programados++
      acumular(acc, d.estado)
    }
  }

  return [...porSemana.entries()]
    .map(([inicio, acc]) => ({ ...cerrar(acc), programados: acc.programados, inicio }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
}

export type ResumenGrupo = Conteo & {
  nombre: string
  /** Jugadores distintos que pasaron por el grupo en el rango. */
  jugadores: number
}

/**
 * Resumen por grupo de entrenamiento dentro del rango.
 *
 * Cada jornada se cuenta en el grupo al que pertenecía ESE día (`dia.bloques`,
 * que `calendarioJugador` ya resolvió por fecha), no en el grupo actual del
 * jugador: un cambio de grupo a mitad de camino no debe reescribir a qué
 * grupo perteneció lo que ya se vivió.
 */
export function resumenPorGrupo(
  calendarios: CalendarioDeJugador[],
  desde: string,
  hasta: string,
): ResumenGrupo[] {
  const m = new Map<string, Conteo & { programados: number; jugadores: Set<string> }>()

  for (const { jugador, dias } of calendarios) {
    for (const d of dias) {
      if (d.fecha < desde || d.fecha > hasta) continue
      if (d.estado === 'extraordinaria') continue
      for (const nombre of d.bloques) {
        const acc = m.get(nombre) ?? { ...conteoVacio(), programados: 0, jugadores: new Set<string>() }
        acc.programados++
        acumular(acc, d.estado)
        acc.jugadores.add(jugador.id)
        m.set(nombre, acc)
      }
    }
  }

  return [...m.entries()]
    .map(([nombre, acc]) => ({ ...cerrar(acc), nombre, jugadores: acc.jugadores.size }))
    .sort((a, b) => (b.porcentaje ?? -1) - (a.porcentaje ?? -1))
}

/**
 * La diferencia en puntos entre dos períodos.
 *
 * `null` cuando alguno de los dos no tiene días resueltos: sin con qué
 * comparar, mostrar "0" o una flecha plana sería inventar una estabilidad
 * que nadie midió.
 */
export function diferencia(actual: Conteo, anterior: Conteo): number | null {
  if (actual.porcentaje === null || anterior.porcentaje === null) return null
  return actual.porcentaje - anterior.porcentaje
}

export type FilaJugador = {
  jugador: { id: string; nombre: string }
  presentes: number
  ausentes: number
  porcentaje: number | null
}

/**
 * Ordena de peor a mejor asistencia, desempatando por volumen de faltas.
 *
 * El desempate importa: sin él, alguien con una sola falta sobre una sola
 * sesión programada encabeza la lista con 0%, igual que alguien que faltó
 * veinte veces. Los dos siguen apareciendo —nadie del club queda fuera del
 * ranking— pero arriba queda el que de verdad conviene mirar.
 */
export function ordenarPorRiesgo(filas: FilaJugador[]): FilaJugador[] {
  return [...filas].sort((a, b) => {
    const pa = a.porcentaje ?? 101 // sin datos resueltos va al final
    const pb = b.porcentaje ?? 101
    if (pa !== pb) return pa - pb
    if (b.ausentes !== a.ausentes) return b.ausentes - a.ausentes
    return a.jugador.nombre.localeCompare(b.jugador.nombre, 'es')
  })
}

/** El espejo del anterior: mejor asistencia primero, desempatando por volumen. */
export function ordenarPorMerito(filas: FilaJugador[]): FilaJugador[] {
  return [...filas].sort((a, b) => {
    const pa = a.porcentaje ?? -1
    const pb = b.porcentaje ?? -1
    if (pa !== pb) return pb - pa
    // A igual porcentaje, más sesiones sostenidas vale más que un 100% de una.
    if (b.presentes !== a.presentes) return b.presentes - a.presentes
    return a.jugador.nombre.localeCompare(b.jugador.nombre, 'es')
  })
}
