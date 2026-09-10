// Torneos por equipos: sistemas Swaythling y Corbillon.
//
// Es la modalidad que rompe el supuesto que atraviesa todo el módulo: que un
// partido es entre DOS JUGADORES. Acá el participante es un equipo, un
// encuentro contiene cinco partidos, y uno de esos cinco puede ser un dobles
// con cuatro personas.
//
// ── Los dos sistemas, y por qué son dos ────────────────────────────────────
//
// El formulario del club los pidió juntos —"formato Copa Swaythling: 4
// individuales y un dobles, o 5 individuales"—, pero son dos sistemas
// distintos del reglamento ITTF:
//
//   Swaythling Cup   5 individuales · 3 jugadores por equipo
//                    A-X · B-Y · C-Z · A-Y · B-X
//
//   Corbillon Cup    4 individuales + 1 dobles · 2 a 4 jugadores
//                    A-X · B-Y · DOBLES · A-Y · B-X
//
// Los dos al mejor de 5: **el encuentro termina apenas un equipo gana 3**, así
// que un 3-0 juega tres partidos y un 3-2 los cinco.
//
// Que con DOS jugadores se pueda formar equipo (Corbillon) no es trivia: es la
// razón por la que ese sistema se usa tanto en clubes chicos. Para un club de
// 140 alumnos donde armar tríos cuesta, probablemente sea el que de verdad se
// juegue.
//
// ⚠️ **El orden de los partidos es reglamento, no configuración.** Va acá como
// constante y no en `club_config`: si alguien lo "mejora", el torneo deja de
// ser Swaythling. El orden existe para que el más fuerte y el más débil de cada
// equipo no jueguen seguido, y cambiarlo cambia el juego.

export type SistemaEquipos = 'swaythling' | 'corbillon'

export const SISTEMAS: ReadonlyArray<SistemaEquipos> = ['swaythling', 'corbillon']

export const SISTEMA_LABEL: Record<SistemaEquipos, string> = {
  swaythling: 'Swaythling · 5 individuales',
  corbillon: 'Corbillon · 4 individuales y un dobles',
}

export const SISTEMA_EXPLICACION: Record<SistemaEquipos, string> = {
  swaythling: 'tres jugadores por equipo, cinco individuales',
  corbillon: 'dos a cuatro jugadores, cuatro individuales y un dobles',
}

/**
 * Normaliza lo que venga del cliente o de la base a un sistema conocido.
 *
 * Corbillon es el default y no por gusto: admite equipos de DOS jugadores,
 * mientras Swaythling exige tres. En un club donde armar tríos cuesta, el
 * default tiene que ser el que se puede jugar.
 */
export function sistemaDe(valor: string | null | undefined): SistemaEquipos {
  return valor === 'swaythling' ? 'swaythling' : 'corbillon'
}

/** Cuántos partidos hay que ganar para llevarse el encuentro. */
export const PARTIDOS_PARA_GANAR = 3

/** Cuántos partidos tiene un encuentro completo. */
export const PARTIDOS_POR_ENCUENTRO = 5

/**
 * Un cruce del encuentro: qué posiciones se enfrentan.
 *
 * `a` y `b` son ÍNDICES dentro de la alineación de cada equipo, no ids: el
 * orden es del reglamento y no depende de quién juegue.
 */
export interface Cruce {
  /** 1 a 5, el orden en que se juegan. */
  numero: number
  tipo: 'individual' | 'dobles'
  /** Índices en `Alineacion.individuales` del equipo A. Vacío si es dobles. */
  a: number[]
  b: number[]
}

/**
 * El orden de los cinco partidos, por sistema. Reglamento ITTF.
 *
 * Swaythling: A-X, B-Y, C-Z, A-Y, B-X (A=0, B=1, C=2 / X=0, Y=1, Z=2)
 * Corbillon:  A-X, B-Y, dobles, A-Y, B-X (A=0, B=1 / X=0, Y=1)
 */
export const CRUCES: Record<SistemaEquipos, ReadonlyArray<Cruce>> = {
  swaythling: [
    { numero: 1, tipo: 'individual', a: [0], b: [0] },
    { numero: 2, tipo: 'individual', a: [1], b: [1] },
    { numero: 3, tipo: 'individual', a: [2], b: [2] },
    { numero: 4, tipo: 'individual', a: [0], b: [1] },
    { numero: 5, tipo: 'individual', a: [1], b: [0] },
  ],
  corbillon: [
    { numero: 1, tipo: 'individual', a: [0], b: [0] },
    { numero: 2, tipo: 'individual', a: [1], b: [1] },
    { numero: 3, tipo: 'dobles', a: [], b: [] },
    { numero: 4, tipo: 'individual', a: [0], b: [1] },
    { numero: 5, tipo: 'individual', a: [1], b: [0] },
  ],
}

/** Cuántos individuales declara cada equipo en su alineación. */
export function individualesQuePide(sistema: SistemaEquipos): number {
  return sistema === 'swaythling' ? 3 : 2
}

/** El mínimo de jugadores que necesita un equipo para presentarse. */
export function minJugadoresPorEquipo(sistema: SistemaEquipos): number {
  return individualesQuePide(sistema)
}

/**
 * Quién juega qué en ESTE encuentro.
 *
 * ⚠️ Va por encuentro y no por equipo. Un mismo equipo puede alinear distinto
 * contra dos rivales, y esa es justamente la decisión táctica del sistema:
 * dónde poner al mejor sabiendo el orden fijo de los cruces.
 */
export interface Alineacion {
  /** Quién juega A y B (y C en Swaythling), en ese orden. */
  individuales: string[]
  /**
   * Los dos del dobles, solo en Corbillon.
   *
   * Pueden ser distintos de los individuales: el reglamento lo permite, y es
   * parte de por qué el sistema admite equipos de hasta cuatro.
   */
  dobles?: readonly [string, string]
}

export interface ErrorAlineacion {
  equipo: 'a' | 'b'
  motivo: string
}

/**
 * Revisa una alineación antes de generar los partidos.
 *
 * Se valida acá y no en la pantalla porque de esto salen los partidos: una
 * alineación con un hueco genera un partido sin rival, que después nadie sabe
 * cómo cerrar.
 */
export function validarAlineacion(
  sistema: SistemaEquipos,
  alineacion: Alineacion,
  equipo: 'a' | 'b',
): ErrorAlineacion | null {
  const pide = individualesQuePide(sistema)
  const ind = alineacion.individuales ?? []

  if (ind.length !== pide) {
    return { equipo, motivo: `El sistema ${SISTEMA_LABEL[sistema]} necesita ${pide} jugadores en los individuales, y hay ${ind.length}.` }
  }
  if (ind.some(id => !id)) {
    return { equipo, motivo: 'Falta asignar a alguien en la alineación.' }
  }
  if (new Set(ind).size !== ind.length) {
    return { equipo, motivo: 'Un jugador no puede ocupar dos puestos en el mismo encuentro.' }
  }

  if (sistema === 'corbillon') {
    const d = alineacion.dobles
    if (!d || d.length !== 2 || !d[0] || !d[1]) {
      return { equipo, motivo: 'Falta declarar la pareja de dobles.' }
    }
    if (d[0] === d[1]) {
      return { equipo, motivo: 'La pareja de dobles tiene que ser dos jugadores distintos.' }
    }
  }

  return null
}

export interface PartidoDeEncuentro {
  numero: number
  tipo: 'individual' | 'dobles'
  /** Uno para individual, dos para dobles. */
  jugadoresA: string[]
  jugadoresB: string[]
}

/**
 * Los cinco partidos del encuentro, con las personas ya puestas.
 *
 * Devuelve los CINCO aunque el encuentro se corte antes: cuáles se juegan de
 * verdad lo decide el resultado, no el armado. Generarlos todos permite
 * mostrar el encuentro completo desde el principio, que es lo que los capitanes
 * miran para decidir su alineación.
 */
export function generarPartidosDelEncuentro(
  sistema: SistemaEquipos,
  alineacionA: Alineacion,
  alineacionB: Alineacion,
): PartidoDeEncuentro[] {
  return CRUCES[sistema].map(c => {
    if (c.tipo === 'dobles') {
      return {
        numero: c.numero,
        tipo: 'dobles' as const,
        jugadoresA: [...(alineacionA.dobles ?? [])],
        jugadoresB: [...(alineacionB.dobles ?? [])],
      }
    }
    return {
      numero: c.numero,
      tipo: 'individual' as const,
      jugadoresA: c.a.map(i => alineacionA.individuales[i]),
      jugadoresB: c.b.map(i => alineacionB.individuales[i]),
    }
  })
}

export interface ResultadoParcial {
  numero: number
  /** 'a', 'b', o null si todavía no se jugó. */
  ganador: 'a' | 'b' | null
}

export interface ResultadoEncuentro {
  puntosA: number
  puntosB: number
  ganador: 'a' | 'b' | null
  terminado: boolean
  /** Los números de partido que ya no hace falta jugar. */
  noSeJuegan: number[]
}

/**
 * El marcador del encuentro, y qué partidos dejaron de hacer falta.
 *
 * ⚠️ **El encuentro se corta apenas alguien llega a 3.** Es la diferencia más
 * grande con todo lo demás del módulo, donde cada partido generado se juega. Un
 * 3-0 deja los partidos 4 y 5 sin jugar para siempre, y eso NO es un torneo a
 * medias: es el resultado correcto.
 *
 * Cualquier reporte que cuente partidos jugados tiene que contar con eso, o va
 * a ver encuentros "incompletos" que están perfectamente terminados.
 */
export function resultadoEncuentro(parciales: readonly ResultadoParcial[]): ResultadoEncuentro {
  const enOrden = [...parciales].sort((x, y) => x.numero - y.numero)

  let puntosA = 0
  let puntosB = 0
  let ganador: 'a' | 'b' | null = null
  const noSeJuegan: number[] = []

  for (const p of enOrden) {
    if (ganador) {
      // Ya estaba definido antes de este partido: no hacía falta jugarlo.
      noSeJuegan.push(p.numero)
      continue
    }
    if (p.ganador === 'a') puntosA++
    else if (p.ganador === 'b') puntosB++

    if (puntosA >= PARTIDOS_PARA_GANAR) ganador = 'a'
    else if (puntosB >= PARTIDOS_PARA_GANAR) ganador = 'b'
  }

  return { puntosA, puntosB, ganador, terminado: ganador !== null, noSeJuegan }
}

/**
 * Cuál es el próximo partido a jugar, o `null` si el encuentro terminó.
 *
 * Lo usa la pantalla del profe: de pie en la cancha, lo único que necesita
 * saber es a quién llamar a la mesa ahora.
 */
export function proximoPartido(parciales: readonly ResultadoParcial[]): number | null {
  const { terminado } = resultadoEncuentro(parciales)
  if (terminado) return null
  const pendiente = [...parciales].sort((x, y) => x.numero - y.numero).find(p => p.ganador === null)
  return pendiente?.numero ?? null
}
