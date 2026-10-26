// Reglas puras del módulo Votaciones (migración 303): armar las dos listas que
// el profe decide —quién vota y a quién se vota— y contar los resultados.
// El servidor vuelve a validar todo en los RPC; esto es lo que la pantalla
// necesita para no mandar listas vacías ni mostrar porcentajes absurdos.

import { fechaChile } from '@/lib/domain/fechaChile'

export type JugadorVotacion = {
  id: string
  nombre: string | null
  estado: string | null
  categoria: string | null
  categorias?: string[] | null
  /** 'YYYY-MM-DD'. Vacía en fichas antiguas: esos jugadores no entran por edad. */
  fecha_nacimiento?: string | null
}

/** Cómo el profe arma una de las dos listas. */
export type Seleccion = {
  modo: 'todos' | 'edad' | 'categorias' | 'jugadores'
  categorias: ReadonlySet<string>
  jugadores: ReadonlySet<string>
  /** Rango de edad en años cumplidos, ambos extremos incluidos. `null` = sin tope. */
  edadMin: number | null
  edadMax: number | null
}

export const seleccionVacia = (): Seleccion => ({
  modo: 'edad', categorias: new Set(), jugadores: new Set(), edadMin: null, edadMax: null,
})

/**
 * Años cumplidos a `hoy` (YYYY-MM-DD, hora de Chile). Cuenta el cumpleaños: a
 * alguien que cumple 14 la semana que viene todavía se le da 13, a diferencia
 * de `calcularEdad`, que resta años de calendario. `null` si no hay fecha o no
 * se entiende.
 */
export function edadCumplida(fechaNacimiento: string | null | undefined, hoy: string): number | null {
  const n = fechaNacimiento?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const h = hoy.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!n || !h) return null
  const edad = Number(h[1]) - Number(n[1]) - ((h[2] < n[2] || (h[2] === n[2] && h[3] < n[3])) ? 1 : 0)
  return edad >= 0 ? edad : null
}

export function enRangoDeEdad(edad: number | null, min: number | null, max: number | null): boolean {
  if (edad === null) return false
  if (min === null && max === null) return false
  return (min === null || edad >= min) && (max === null || edad <= max)
}

/** Activos sin fecha de nacimiento: los que el filtro por edad no puede ubicar. */
export function sinFechaDeNacimiento(jugadores: readonly JugadorVotacion[]): number {
  return jugadores.filter(j => j.estado === 'activo' && !j.fecha_nacimiento).length
}

/**
 * Un jugador puede competir en varias categorías (la suya por edad + TC), igual
 * que en el filtro del listado de Jugadores: si tiene `categorias`, manda esa
 * lista; si no, la categoría suelta.
 */
export function enCategoria(j: JugadorVotacion, categoria: string): boolean {
  return j.categorias?.length ? j.categorias.includes(categoria) : j.categoria === categoria
}

/**
 * Ids de los jugadores que quedan en la lista. "Todos" y "categorías" toman
 * solo a los activos —un retirado no debería votar ni ser candidato por
 * arrastre—; los jugadores elegidos uno por uno entran tal cual, porque ahí el
 * profe decidió con nombre y apellido.
 */
export function idsDeSeleccion(jugadores: readonly JugadorVotacion[], sel: Seleccion, hoy: string = fechaChile()): string[] {
  if (sel.modo === 'jugadores') {
    const existentes = new Set(jugadores.map(j => j.id))
    return [...sel.jugadores].filter(id => existentes.has(id))
  }
  const activos = jugadores.filter(j => j.estado === 'activo')
  if (sel.modo === 'todos') return activos.map(j => j.id)
  if (sel.modo === 'edad') {
    return activos.filter(j => enRangoDeEdad(edadCumplida(j.fecha_nacimiento, hoy), sel.edadMin, sel.edadMax)).map(j => j.id)
  }
  if (sel.categorias.size === 0) return []
  return activos
    .filter(j => [...sel.categorias].some(c => enCategoria(j, c)))
    .map(j => j.id)
}

/** Texto corto de cuántos entran, para mostrar bajo cada selector. */
export function resumenSeleccion(cantidad: number, unidad: 'votantes' | 'candidatos'): string {
  if (cantidad === 0) return `Sin ${unidad} todavía`
  const singular = unidad === 'votantes' ? 'votante' : 'candidato'
  return `${cantidad} ${cantidad === 1 ? singular : unidad}`
}

export type ErrorCreacion = string | null

/** Lo mínimo para que el formulario deje apretar "Crear votación". */
export function validarCreacion(p: {
  titulo: string
  tipo: 'jugadores' | 'opciones'
  votantes: readonly string[]
  candidatos: readonly string[]
  opciones: readonly string[]
}): ErrorCreacion {
  if (!p.titulo.trim()) return 'Ponle un nombre a la votación'
  if (p.votantes.length === 0) return 'Elige quiénes pueden votar'
  if (p.tipo === 'jugadores') {
    if (p.candidatos.length < 2) return 'Elige al menos dos candidatos'
  } else {
    // Sin mirar mayúsculas, igual que el RPC: "Sábado" y "sábado" son una.
    const distintas = new Set(p.opciones.map(o => o.trim().toLowerCase()).filter(Boolean))
    if (distintas.size < 2) return 'Escribe al menos dos opciones distintas'
    if (distintas.size > 20) return 'Máximo 20 opciones'
  }
  return null
}

/**
 * Lista de votantes que queda al editar. Los que ya votaron van siempre: su
 * voto es secreto y no se puede retirar, así que el servidor no deja sacarlos y
 * acá ni siquiera se ofrece. Si la selección los incluye no se repiten.
 */
export function idsDeEdicion(jugadores: readonly JugadorVotacion[], sel: Seleccion, yaVotaron: ReadonlySet<string>): string[] {
  return [...new Set([...idsDeSeleccion(jugadores, sel), ...yaVotaron])]
}

/** Lo mínimo para guardar los cambios de una votación existente. */
export function validarEdicion(p: { titulo: string; votantes: readonly string[] | null }): ErrorCreacion {
  if (!p.titulo.trim()) return 'Ponle un nombre a la votación'
  if (p.votantes !== null && p.votantes.length === 0) return 'Elige quiénes pueden votar'
  return null
}

export type VotanteVotacion = { id: string; nombre: string | null; voto: boolean }

/**
 * Las que el alumno todavía tiene que votar: abiertas y sin voto suyo. No
 * filtra por habilitado porque el RLS ya le entrega solo esas (migración 303).
 */
export function votacionesPendientes<V extends { id: string; estado: string }>(
  votaciones: readonly V[], votadas: ReadonlySet<string>,
): V[] {
  return votaciones.filter(v => v.estado === 'abierta' && !votadas.has(v.id))
}

export type OpcionResultado = { id: string; texto: string; votos: number }

export type ResultadoVotacion = {
  titulo: string
  descripcion: string | null
  tipo: 'jugadores' | 'opciones'
  estado: 'abierta' | 'cerrada'
  creado_en: string
  cerrada_en: string | null
  habilitados: number
  votos_total: number
  opciones: OpcionResultado[]
  votaron: string[]
  faltan: string[]
}

/** Porcentaje entero sobre el total de votos; 0 si todavía no votó nadie. */
export function porcentajeDeVotos(votos: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((votos / total) * 100)
}

/** Quién va ganando. Con empate en el primer lugar devuelve a todos los empatados. */
export function ganadores(opciones: readonly OpcionResultado[]): OpcionResultado[] {
  const max = Math.max(0, ...opciones.map(o => o.votos))
  if (max === 0) return []
  return opciones.filter(o => o.votos === max)
}
