/**
 * Mesas: el recurso escaso desde el que se deriva el cupo.
 *
 * ── Qué cambia respecto de cómo funciona hoy ────────────────────────────
 *
 * Hoy el cupo de un bloque es `bloques_horario.cupo_maximo`, un número que
 * alguien escribe a mano (migración 073). Para Spinhouse deja de ser un dato y
 * pasa a ser un cálculo:
 *
 *     cupo = mesas asignadas × jugadores por mesa (según la modalidad)
 *
 * Eso arrastra dos reglas que el sistema no tenía:
 *
 *   1. **Las mesas son un recurso compartido EN EL TIEMPO.** Dos bloques que
 *      se solapan no pueden sumar más mesas que las que tiene la sede. No es
 *      un problema de contar: es de solapamiento de intervalos.
 *   2. **El arriendo libre compite por el mismo recurso.** Una mesa arrendada
 *      de 19:00 a 20:00 no está disponible para la clase de 19:00 a 20:30.
 *
 * ── Buin no se entera de nada de esto ───────────────────────────────────
 *
 * `cupoDelBloque` mira `cupos.modo`, cuyo default es `'numero'`. Con ese modo
 * devuelve `cupo_maximo` tal cual, sin tocar una sola mesa. Un club sin
 * configuración se comporta exactamente como antes.
 *
 * ── La validación de verdad va en la base ───────────────────────────────
 *
 * Este archivo es lógica pura: sirve para pintar la pantalla y para avisarle
 * al usuario antes de que apriete. **No es la garantía.** El formulario de
 * Spinhouse pide que "el sistema impida sobrepasar el cupo", y una
 * comprobación en el navegador no impide nada: dos personas asignando la misma
 * mesa en el mismo segundo pasan las dos. Eso lo tiene que atajar una función
 * atómica en Postgres.
 *
 * Ver `docs/plan-spinhouse-maestro.md` §5.1 y §10.6.
 */

import { minutosDelDia } from './horario'
import type { LectorConfig } from './clubConfig'

/** Un rango de horas dentro de un día. `'HH:MM'` o `'HH:MM:SS'`, da igual. */
export type Franja = { inicio: string; fin: string }

export type ModalidadClase = 'grupal' | 'particular'

/**
 * Una mesa de la sede.
 *
 * `vigente_desde` / `vigente_hasta` en vez de un booleano `activa`, por lo
 * mismo que en `bloque_jugadores`: una mesa que se rompe a mitad de semana
 * tiene que dejar de contar DESDE ESA FECHA, sin borrar el historial de los
 * bloques que la usaban antes. Un booleano no puede responder "¿cuántas mesas
 * había el martes pasado?", y esa pregunta la hace cualquier reporte.
 */
export type Mesa = {
  id: string
  numero: number
  vigente_desde: string | null
  vigente_hasta: string | null
}

/**
 * Que una mesa está ocupada en un rango, sea por una clase o por un arriendo.
 *
 * `origen_id` es qué la ocupa —un bloque o un arriendo—. Sirve para que un
 * bloque que se está editando no compita consigo mismo: sin eso, reasignarle
 * sus propias mesas diría siempre "ya están ocupadas".
 */
export type UsoDeMesa = {
  mesa_id: string
  inicio: string
  fin: string
  origen_id?: string | null
}

/**
 * Si dos rangos de horas se pisan.
 *
 * **Las desigualdades son estrictas, y eso no es un detalle.** Con `>=`, una
 * clase que empieza justo cuando termina el arriendo quedaría bloqueada sin
 * razón: son el caso más común de una sala que programa cada hora en punto.
 *
 *     arriendo 19:00–20:00, clase 20:00–21:00  →  NO se solapan
 *     arriendo 19:00–20:00, clase 19:30–20:30  →  sí se solapan
 *     arriendo 19:00–20:00, clase 18:00–21:00  →  sí (la contiene)
 *
 * Un rango vacío o invertido (fin <= inicio) no se solapa con nada: no ocupa
 * tiempo. Eso evita que una fila mal cargada bloquee media sala.
 */
export function seSolapan(a: Franja, b: Franja): boolean {
  const aDesde = minutosDelDia(a.inicio)
  const aHasta = minutosDelDia(a.fin)
  const bDesde = minutosDelDia(b.inicio)
  const bHasta = minutosDelDia(b.fin)

  if (aHasta <= aDesde || bHasta <= bDesde) return false

  return aHasta > bDesde && aDesde < bHasta
}

/**
 * Si la mesa existe en esa fecha.
 *
 * `vigente_hasta` es el último día en que la mesa sirvió, inclusive — misma
 * semántica que en el resto del proyecto, donde cerrar una vigencia se hace
 * con la fecha de AYER y no la de hoy.
 */
export function mesaVigente(mesa: Mesa, fechaISO: string): boolean {
  if (mesa.vigente_desde && fechaISO < mesa.vigente_desde) return false
  if (mesa.vigente_hasta && fechaISO > mesa.vigente_hasta) return false
  return true
}

/** Las mesas que existen ese día, ordenadas por número. */
export function mesasVigentes(mesas: readonly Mesa[], fechaISO: string): Mesa[] {
  return mesas.filter(m => mesaVigente(m, fechaISO)).sort((a, b) => a.numero - b.numero)
}

/** Cuántos jugadores entran por mesa, según la modalidad y lo que dice el club. */
export function jugadoresPorMesa(config: LectorConfig, modalidad: ModalidadClase): number {
  return modalidad === 'particular'
    ? config('cupos.por_mesa_particular')
    : config('cupos.por_mesa_grupal')
}

/**
 * El cupo de un bloque.
 *
 * Con `cupos.modo = 'numero'` —el default, o sea Buin— devuelve el
 * `cupo_maximo` escrito a mano y no mira las mesas para nada.
 *
 * Un bloque sin mesas asignadas en modo `por_mesas` da **0**, no `null` ni un
 * error: no hay dónde jugar, así que no entra nadie. Devolver `null` obligaría
 * a cada pantalla a decidir qué hacer con eso, y alguna decidiría mal.
 */
export function cupoDelBloque(params: {
  config: LectorConfig
  cupoMaximo: number
  mesasAsignadas: number
  modalidad?: ModalidadClase
}): number {
  const { config, cupoMaximo, mesasAsignadas, modalidad = 'grupal' } = params

  if (config('cupos.modo') === 'numero') return cupoMaximo

  if (mesasAsignadas <= 0) return 0
  return mesasAsignadas * jugadoresPorMesa(config, modalidad)
}

/**
 * Qué mesas quedan libres en una franja.
 *
 * `excluirOrigen` es el bloque que se está editando: sus propias mesas no
 * cuentan como ocupadas, porque justamente se le están reasignando.
 */
export function mesasLibres(params: {
  mesas: readonly Mesa[]
  usos: readonly UsoDeMesa[]
  fechaISO: string
  franja: Franja
  excluirOrigen?: string | null
}): Mesa[] {
  const { mesas, usos, fechaISO, franja, excluirOrigen = null } = params

  const ocupadas = new Set(
    usos
      .filter(u => (excluirOrigen == null || u.origen_id !== excluirOrigen))
      .filter(u => seSolapan(u, franja))
      .map(u => u.mesa_id),
  )

  return mesasVigentes(mesas, fechaISO).filter(m => !ocupadas.has(m.id))
}

/**
 * Si se le pueden asignar esas mesas a ese bloque, y si no, por qué no.
 *
 * El mensaje sale de acá y no de la pantalla a propósito: "error de
 * validación" obliga a escribirle al club por WhatsApp; "la mesa 3 ya está
 * tomada de 19:00 a 20:00" se resuelve solo.
 */
export function puedeAsignarMesas(params: {
  mesas: readonly Mesa[]
  usos: readonly UsoDeMesa[]
  fechaISO: string
  franja: Franja
  mesaIds: readonly string[]
  excluirOrigen?: string | null
}): { ok: true } | { ok: false; motivo: string } {
  const { mesas, usos, fechaISO, franja, mesaIds, excluirOrigen = null } = params

  if (mesaIds.length === 0) return { ok: false, motivo: 'Hay que asignarle al menos una mesa.' }

  const porId = new Map(mesas.map(m => [m.id, m]))
  const libres = new Set(
    mesasLibres({ mesas, usos, fechaISO, franja, excluirOrigen }).map(m => m.id),
  )

  for (const id of mesaIds) {
    const mesa = porId.get(id)
    if (!mesa) return { ok: false, motivo: 'Esa mesa no existe en esta sede.' }

    if (!mesaVigente(mesa, fechaISO)) {
      return { ok: false, motivo: `La mesa ${mesa.numero} no está disponible en esa fecha.` }
    }

    if (!libres.has(id)) {
      const choque = usos.find(
        u => u.mesa_id === id
          && (excluirOrigen == null || u.origen_id !== excluirOrigen)
          && seSolapan(u, franja),
      )
      const cuando = choque ? ` de ${choque.inicio.slice(0, 5)} a ${choque.fin.slice(0, 5)}` : ''
      return { ok: false, motivo: `La mesa ${mesa.numero} ya está tomada${cuando}.` }
    }
  }

  return { ok: true }
}
