// El cálculo de asistencia, en un solo lugar.
//
// Todas las vistas —el calendario histórico, el perfil del jugador, los
// rankings del profesor, los promedios del club— salen de acá. Si cada pantalla
// hiciera su propia cuenta, tarde o temprano dos mostrarían números distintos
// para lo mismo, que es exactamente el problema que este módulo evita.
//
// La regla de oro: las sesiones programadas se cuentan recorriendo las fechas
// reales del calendario, nunca multiplicando semanas por días. Agosto de 2026
// tiene cinco lunes y septiembre cuatro; quien entrena solo los lunes debe
// cinco sesiones un mes y cuatro el otro.

import { vigenteEn, type Vigencia } from './vigencia'

export type EstadoDia = 'presente' | 'ausente' | 'pendiente'

/** Un día del calendario del jugador: le tocaba entrenar y esto pasó. */
export type DiaCalendario = {
  fecha: string
  dia: string
  estado: EstadoDia
  bloques: string[]        // nombres de los grupos que le tocaban ese día
}

export type BloqueVigente = Vigencia & {
  id: string
  nombre: string
  sede: string
  dia_semana: string
}

export type InscripcionVigente = Vigencia & {
  bloque_id: string
  jugador_id: string
}

export type RegistroAsistencia = {
  jugador_id: string
  fecha: string
  estado: 'presente' | 'ausente'
}

/** Excepción: ese día ese bloque no se dictó. */
export type Excepcion = { bloque_id: string; fecha: string }

const DIA_POR_INDICE = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

/** Fechas de lunes a viernes en el rango, con su día de la semana. */
export function diasHabiles(desde: string, hasta: string): { fecha: string; dia: string }[] {
  const out: { fecha: string; dia: string }[] = []
  if (desde > hasta) return out
  const d = new Date(desde + 'T12:00:00')
  const fin = new Date(hasta + 'T12:00:00')
  while (d <= fin) {
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) out.push({ fecha: iso(d), dia: DIA_POR_INDICE[dow] })
    d.setDate(d.getDate() + 1)
  }
  return out
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type DatosHistorial = {
  bloques: BloqueVigente[]
  inscripciones: InscripcionVigente[]
  asistencias: RegistroAsistencia[]
  excepciones: Excepcion[]
}

/**
 * El calendario de un jugador entre dos fechas.
 *
 * Solo devuelve los días en que le tocaba entrenar. Un día sin programación no
 * aparece: no es una falta, simplemente no había clase para él.
 */
/**
 * Los índices que el cálculo necesita, armados una sola vez.
 *
 * Existe porque el panorama del club llama al calendario ciento tres veces
 * sobre los mismos datos. Sin esto, cada llamada recorría todas las
 * inscripciones y todas las asistencias del club para quedarse con las de una
 * sola persona: cien veces el mismo trabajo para tirarlo noventa y nueve.
 */
export type IndiceHistorial = {
  bloquePorId: Map<string, BloqueVigente>
  inscripcionesDe: Map<string, InscripcionVigente[]>
  estadoDe: Map<string, Map<string, 'presente' | 'ausente'>>
  sinClase: Set<string>
}

export function indexar(datos: DatosHistorial): IndiceHistorial {
  const inscripcionesDe = new Map<string, InscripcionVigente[]>()
  for (const i of datos.inscripciones) {
    const previas = inscripcionesDe.get(i.jugador_id)
    if (previas) previas.push(i); else inscripcionesDe.set(i.jugador_id, [i])
  }

  // Un jugador tiene un estado por día, no por grupo: si entrena dos veces el
  // mismo día es una sola jornada.
  const estadoDe = new Map<string, Map<string, 'presente' | 'ausente'>>()
  for (const a of datos.asistencias) {
    let suyas = estadoDe.get(a.jugador_id)
    if (!suyas) { suyas = new Map(); estadoDe.set(a.jugador_id, suyas) }
    suyas.set(a.fecha, a.estado)
  }

  return {
    bloquePorId: new Map(datos.bloques.map(b => [b.id, b])),
    inscripcionesDe,
    estadoDe,
    sinClase: new Set(datos.excepciones.map(e => `${e.bloque_id}|${e.fecha}`)),
  }
}

export function calendarioJugador(
  jugadorId: string,
  desde: string,
  hasta: string,
  datos: DatosHistorial,
  indice?: IndiceHistorial,
): DiaCalendario[] {
  const { bloquePorId, inscripcionesDe, estadoDe: todos, sinClase } = indice ?? indexar(datos)
  const mias = inscripcionesDe.get(jugadorId) ?? []
  const estadoDe = todos.get(jugadorId) ?? new Map<string, 'presente' | 'ausente'>()

  const out: DiaCalendario[] = []
  for (const { fecha, dia } of diasHabiles(desde, hasta)) {
    const nombres: string[] = []
    for (const i of mias) {
      if (!vigenteEn(i, fecha)) continue
      const b = bloquePorId.get(i.bloque_id)
      if (!b || b.dia_semana !== dia) continue
      if (!vigenteEn(b, fecha)) continue
      if (sinClase.has(`${b.id}|${fecha}`)) continue
      if (!nombres.includes(b.nombre)) nombres.push(b.nombre)
    }
    if (nombres.length === 0) continue
    out.push({ fecha, dia, estado: estadoDe.get(fecha) ?? 'pendiente', bloques: nombres })
  }
  return out
}

export type Indicadores = {
  programados: number
  presentes: number
  ausentes: number
  pendientes: number
  /** Sobre los días ya resueltos. null si todavía no hay ninguno. */
  porcentaje: number | null
  rachaPresentes: number
  rachaAusentes: number
  mejorRacha: number
  ultimaAsistencia: string | null
  ultimaAusencia: string | null
  /** Día de la semana con mejor porcentaje. null si no hay días resueltos. */
  mejorDia: { dia: string; porcentaje: number } | null
  porMes: { mes: string; presentes: number; ausentes: number; pendientes: number; porcentaje: number | null }[]
}

/**
 * Los indicadores de un calendario ya armado.
 *
 * Los pendientes quedan fuera del porcentaje a propósito: un entrenamiento que
 * el profe no alcanzó a registrar no es una falta del alumno.
 */
export function indicadores(dias: DiaCalendario[]): Indicadores {
  const orden = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha))

  const presentes  = orden.filter(d => d.estado === 'presente')
  const ausentes   = orden.filter(d => d.estado === 'ausente')
  const pendientes = orden.filter(d => d.estado === 'pendiente')
  const resueltos  = presentes.length + ausentes.length

  // Las rachas se cuentan hacia atrás desde el último día resuelto: un
  // pendiente en el medio no corta una racha, porque no se sabe qué pasó.
  const resueltosOrden = orden.filter(d => d.estado !== 'pendiente')
  let rachaPresentes = 0
  let rachaAusentes = 0
  for (let i = resueltosOrden.length - 1; i >= 0; i--) {
    if (resueltosOrden[i].estado !== 'presente') break
    rachaPresentes++
  }
  for (let i = resueltosOrden.length - 1; i >= 0; i--) {
    if (resueltosOrden[i].estado !== 'ausente') break
    rachaAusentes++
  }

  let mejorRacha = 0
  let corriendo = 0
  for (const d of resueltosOrden) {
    if (d.estado === 'presente') { corriendo++; mejorRacha = Math.max(mejorRacha, corriendo) }
    else corriendo = 0
  }

  // Por día de la semana
  const porDia = new Map<string, { si: number; no: number }>()
  for (const d of resueltosOrden) {
    const acc = porDia.get(d.dia) ?? { si: 0, no: 0 }
    if (d.estado === 'presente') acc.si++; else acc.no++
    porDia.set(d.dia, acc)
  }
  let mejorDia: Indicadores['mejorDia'] = null
  for (const [dia, { si, no }] of porDia) {
    const pct = Math.round((si / (si + no)) * 100)
    if (!mejorDia || pct > mejorDia.porcentaje) mejorDia = { dia, porcentaje: pct }
  }

  // Por mes
  const meses = new Map<string, { presentes: number; ausentes: number; pendientes: number }>()
  for (const d of orden) {
    const mes = d.fecha.slice(0, 7)
    const acc = meses.get(mes) ?? { presentes: 0, ausentes: 0, pendientes: 0 }
    if (d.estado === 'presente') acc.presentes++
    else if (d.estado === 'ausente') acc.ausentes++
    else acc.pendientes++
    meses.set(mes, acc)
  }

  return {
    programados: orden.length,
    presentes: presentes.length,
    ausentes: ausentes.length,
    pendientes: pendientes.length,
    porcentaje: resueltos > 0 ? Math.round((presentes.length / resueltos) * 100) : null,
    rachaPresentes,
    rachaAusentes,
    mejorRacha,
    ultimaAsistencia: presentes.at(-1)?.fecha ?? null,
    ultimaAusencia: ausentes.at(-1)?.fecha ?? null,
    mejorDia,
    porMes: [...meses.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, v]) => ({
        mes,
        ...v,
        porcentaje: v.presentes + v.ausentes > 0
          ? Math.round((v.presentes / (v.presentes + v.ausentes)) * 100)
          : null,
      })),
  }
}
