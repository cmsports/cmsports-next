/**
 * Mesas: el recurso escaso desde el que se deriva el cupo.
 *
 * ── El modelo, y por qué es un número ───────────────────────────────────
 *
 * La sede tiene N mesas. Cada bloque usa K. A cualquier hora, lo que se solapa
 * no puede sumar más de N. Eso es todo.
 *
 * No se registra CUÁL mesa usa cada bloque, y es a propósito: el formulario
 * pide que "el cupo dependa del NÚMERO de mesas disponibles", el club sabe que
 * tiene doce y que Adultos usa cinco, y asignar mesas concretas a cada bloque
 * de cada día es media hora de clicks para un dato que se resuelve hablando en
 * la sala. La migración 251 lo cuenta entero.
 *
 * ── Buin no se entera de nada de esto ───────────────────────────────────
 *
 * `cupoDelBloque` mira `cupos.modo`, cuyo default es `'numero'`. Con ese modo
 * devuelve `cupo_maximo` tal cual y no toca una sola mesa. Además
 * `bloques_horario.mesas` es NULL en todos los bloques que no son de Spinhouse,
 * así que aunque alguien encendiera el modo, un bloque sin mesas declaradas
 * sigue con su cupo escrito a mano.
 *
 * ── La validación de verdad va en la base ───────────────────────────────
 *
 * Esto es lógica pura: sirve para pintar la pantalla y avisar antes de que
 * alguien apriete. **No es la garantía.** Dos personas guardando bloques que se
 * solapan en el mismo segundo pasan las dos comprobaciones de cliente.
 *
 * Ver `docs/plan-spinhouse-maestro.md` §5.1.
 */

import { minutosDelDia } from './horario'
import type { LectorConfig } from './clubConfig'

/** Un rango de horas dentro de un día. `'HH:MM'` o `'HH:MM:SS'`, da igual. */
export type Franja = { inicio: string; fin: string }

export type ModalidadClase = 'grupal' | 'particular'

/** Algo que ocupa mesas en una franja: un bloque o un arriendo. */
export type UsoDeMesas = Franja & {
  /** Cuántas mesas ocupa. */
  mesas: number
  /** Qué lo ocupa, para que un bloque que se está editando no se cuente a sí mismo. */
  id?: string | null
  /** Cómo se llama en pantalla. */
  etiqueta?: string
}

/**
 * Si dos rangos de horas se pisan.
 *
 * **Las desigualdades son estrictas, y eso no es un detalle.** Con `>=`, una
 * clase que empieza justo cuando termina el arriendo quedaría bloqueada sin
 * razón: programar cada hora en punto es exactamente lo que hace una sala.
 *
 *     19:00–20:00 con 20:00–21:00  →  NO se solapan
 *     19:00–20:00 con 19:30–20:30  →  sí se solapan
 *     18:00–21:00 con 19:00–20:00  →  sí (la contiene)
 *
 * Un rango vacío o invertido no se solapa con nada: no ocupa tiempo. Eso evita
 * que una fila mal cargada bloquee media sala.
 */
export function seSolapan(a: Franja, b: Franja): boolean {
  const aDesde = minutosDelDia(a.inicio)
  const aHasta = minutosDelDia(a.fin)
  const bDesde = minutosDelDia(b.inicio)
  const bHasta = minutosDelDia(b.fin)

  if (aHasta <= aDesde || bHasta <= bDesde) return false

  return aHasta > bDesde && aDesde < bHasta
}

/** Cuántos jugadores entran por mesa, según la modalidad y lo que dice el club. */
export function jugadoresPorMesa(config: LectorConfig, modalidad: ModalidadClase): number {
  return modalidad === 'particular'
    ? config('cupos.por_mesa_particular')
    : config('cupos.por_mesa_grupal')
}

/**
 * Cuántas mesas ocupa un bloque, según cuánta gente tiene inscrita.
 *
 * **Se deriva, no se declara.** Si en cada mesa juegan dos, ocho alumnos ocupan
 * cuatro mesas y el noveno obliga a una quinta. Pedirle al admin que escriba
 * "Adultos usa 5" es trabajo manual que además se desactualiza solo: entra un
 * alumno y el número queda viejo sin que nadie se entere.
 *
 * Redondea hacia arriba porque una mesa a medio usar sigue ocupada: tres
 * alumnos con dos por mesa necesitan dos mesas, no una y media.
 */
export function mesasNecesarias(jugadores: number, porMesa: number): number {
  if (jugadores <= 0 || porMesa <= 0) return 0
  return Math.ceil(jugadores / porMesa)
}

/**
 * Las mesas que ocupa un bloque: las que declaró a mano, o las que necesita.
 *
 * `declaradas` es un override para el caso en que un bloque reserva más de lo
 * que su inscripción pide —un grupo que recién arranca y quiere guardarse el
 * espacio—. Sin ese valor, que es lo normal, sale de la gente inscrita.
 */
export function mesasDelBloque(params: {
  config: LectorConfig
  inscritos: number
  declaradas?: number | null
  modalidad?: ModalidadClase
}): number {
  const { config, inscritos, declaradas, modalidad = 'grupal' } = params
  if (declaradas != null && declaradas > 0) return declaradas
  return mesasNecesarias(inscritos, jugadoresPorMesa(config, modalidad))
}

/**
 * Cuánta gente entra en un bloque.
 *
 * Con `cupos.modo = 'numero'` —el default— devuelve el `cupo_maximo` escrito a
 * mano y no mira las mesas para nada: ese es el caso de todos los clubes salvo
 * Spinhouse.
 *
 * Con `'por_mesas'` el techo lo pone la sala: las mesas que este bloque ya
 * ocupa más las que quedan libres a esa hora, por los jugadores que entran en
 * cada una. O sea que el cupo **baja cuando otro bloque se solapa y sube cuando
 * ese otro se va**, que es exactamente cómo se comporta una sala de verdad.
 */
export function cupoDelBloque(params: {
  config: LectorConfig
  cupoMaximo: number
  inscritos?: number
  declaradas?: number | null
  totalSede?: number
  usos?: readonly UsoDeMesas[]
  franja?: Franja
  bloqueId?: string | null
  modalidad?: ModalidadClase
}): number {
  const {
    config, cupoMaximo, inscritos = 0, declaradas = null,
    totalSede, usos, franja, bloqueId = null, modalidad = 'grupal',
  } = params

  if (config('cupos.modo') === 'numero') return cupoMaximo

  const porMesa = jugadoresPorMesa(config, modalidad)

  // Sin datos de la sala no hay techo que calcular: se cae al número escrito a
  // mano en vez de inventar un cupo. "No sé cuántas mesas hay" no puede
  // significar "no entra nadie".
  if (totalSede == null || totalSede <= 0 || !usos || !franja) return cupoMaximo

  const propias = mesasDelBloque({ config, inscritos, declaradas, modalidad })
  const libres  = mesasLibres({ total: totalSede, usos, franja, excluirId: bloqueId })

  return (propias + libres) * porMesa
}

/**
 * Cuántas mesas están ocupadas en una franja.
 *
 * `excluirId` es el bloque que se está editando: sus propias mesas no cuentan,
 * porque justamente se están cambiando.
 */
export function mesasEnUso(
  usos: readonly UsoDeMesas[],
  franja: Franja,
  excluirId?: string | null,
): number {
  return usos
    .filter(u => (excluirId == null || u.id !== excluirId))
    .filter(u => seSolapan(u, franja))
    .reduce((total, u) => total + Math.max(0, u.mesas), 0)
}

/** Cuántas quedan libres en esa franja. Nunca negativo. */
export function mesasLibres(params: {
  total: number
  usos: readonly UsoDeMesas[]
  franja: Franja
  excluirId?: string | null
}): number {
  const { total, usos, franja, excluirId = null } = params
  return Math.max(0, total - mesasEnUso(usos, franja, excluirId))
}

/**
 * Si el bloque puede usar esa cantidad de mesas, y si no, por qué no.
 *
 * El mensaje sale de acá y no de la pantalla a propósito: "error de validación"
 * obliga a escribirle al club por WhatsApp; "a esa hora quedan 3 mesas libres de
 * 12, y Adultos usa 5" se resuelve solo.
 */
export function puedeUsarMesas(params: {
  total: number
  usos: readonly UsoDeMesas[]
  franja: Franja
  mesas: number
  excluirId?: string | null
}): { ok: true } | { ok: false; motivo: string } {
  const { total, usos, franja, mesas, excluirId = null } = params

  if (!Number.isInteger(mesas) || mesas < 0) {
    return { ok: false, motivo: 'Las mesas se cuentan con un número entero.' }
  }
  if (mesas === 0) return { ok: true }

  if (total <= 0) {
    return { ok: false, motivo: 'Esta sede todavía no tiene mesas cargadas.' }
  }
  if (mesas > total) {
    return { ok: false, motivo: `La sede tiene ${total} ${total === 1 ? 'mesa' : 'mesas'} en total.` }
  }

  const libres = mesasLibres({ total, usos, franja, excluirId })
  if (mesas > libres) {
    const ocupantes = usos
      .filter(u => (excluirId == null || u.id !== excluirId))
      .filter(u => seSolapan(u, franja) && u.mesas > 0)
      .map(u => `${u.etiqueta ?? 'otro bloque'} (${u.mesas})`)

    return {
      ok: false,
      motivo: libres === 0
        ? `A esa hora no queda ninguna mesa libre de las ${total}.${ocupantes.length ? ' Las está usando ' + ocupantes.join(', ') + '.' : ''}`
        : `A esa hora quedan ${libres} ${libres === 1 ? 'mesa libre' : 'mesas libres'} de ${total}.${ocupantes.length ? ' El resto lo usa ' + ocupantes.join(', ') + '.' : ''}`,
    }
  }

  return { ok: true }
}

/**
 * Los tramos en que se parte el día, sacados de lo que de verdad hay.
 *
 * No son horas redondas: con filas de una hora, un bloque de 19:00 a 19:30 se
 * vería ocupando hasta las 20:00 y el tablero mentiría justo donde importa.
 */
export function tramosDelDia(usos: readonly Franja[]): Franja[] {
  const cortes = [...new Set(usos.flatMap(u => [u.inicio.slice(0, 5), u.fin.slice(0, 5)]))]
    .sort((a, b) => minutosDelDia(a) - minutosDelDia(b))

  const out: Franja[] = []
  for (let i = 0; i < cortes.length - 1; i++) out.push({ inicio: cortes[i], fin: cortes[i + 1] })
  return out
}
