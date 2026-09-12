// Ligas por jornadas — la forma de programar de Spinhouse.
//
// ── Qué es una jornada ──────────────────────────────────────────────────────
// Un fin de semana. Cada división juega UNA tarde: varias mesas a la vez
// (tres, típicamente), bloques de 30 minutos desde una hora fija, y cada
// jugador juega `porJugador` partidos (tres) y arbitra en los bloques en que
// no juega. Los bloques no se fijan de antemano: son los que hagan falta para
// que entren los partidos en las mesas (10 jugadores → 15 partidos → 5
// bloques de 3 mesas → de 15:00 a 17:30).
//
// Es otro objetivo que el del motor de `liga.ts` (una mesa por división,
// fecha larga, permanencia mínima): acá se optimiza que cada uno venga una
// tarde, juegue tres y se vaya, con las mesas llenas. Por eso es un motor
// aparte y no un parámetro más del otro.
//
// Tres piezas, todas puras:
//   1. `elegirPartidosDeJornada`: qué partidos de los pendientes se juegan.
//   2. `distribuirEnBloques`: en qué bloque y mesa va cada uno.
//   3. `asignarArbitrosJornada`: quién arbitra cada uno.
// Y el lector `parsearProgramacionJornada`, que entiende el texto de la
// programación que el club ya publica en PDF, para cargarla tal cual.

export interface PartidoPendiente {
  id: string
  jugadorAId: string
  jugadorBId: string
}

export interface PartidoDeJornada {
  id: string
  jugadorAId: string
  jugadorBId: string
  /** Índice de bloque desde 0. */
  bloque: number
  /** Número de mesa (de las que tiene la división esa tarde). */
  mesa: number
  arbitroId: string | null
}

export const BLOQUE_MINUTOS_JORNADA = 30
export const HUECO_MAX_JORNADA = 1

function horaAMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function minutosAHora(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** La hora de un índice de bloque: 0 → horaInicio, 1 → +30, … */
export function horaDeBloque(indice: number, horaInicio: string, bloqueMinutos = BLOQUE_MINUTOS_JORNADA): string {
  return minutosAHora(horaAMinutos(horaInicio) + indice * bloqueMinutos)
}

/** Cuántos bloques ocupa una división: sus partidos repartidos en sus mesas. */
export function bloquesNecesarios(partidos: number, mesas: number): number {
  if (partidos <= 0 || mesas <= 0) return 0
  return Math.ceil(partidos / mesas)
}

// ─── 1. Qué partidos se juegan esta jornada ─────────────────────────────────

/**
 * Elige, de los pendientes, un conjunto donde cada jugador juegue a lo más
 * `porJugador` partidos, lo más lleno posible y lo más parejo posible (que
 * todos lleguen a `porJugador`, salvo que a alguien no le queden rivales).
 *
 * Es un reparto voraz con reintentos: se ordena a los jugadores por cuántos
 * pendientes les quedan (el más apretado primero), y cada uno toma partidos
 * contra rivales que todavía tienen cupo, prefiriendo al rival con más
 * pendientes (que es al que más le va a costar completar después). Se repite
 * unas cuantas veces con desempates distintos y se queda con el mejor
 * conjunto. Con divisiones de hasta 16 jugadores es instantáneo.
 */
export function elegirPartidosDeJornada(
  pendientes: readonly PartidoPendiente[],
  jugadorIds: readonly string[],
  porJugador: number,
  intentos = 12,
): PartidoPendiente[] {
  if (!pendientes.length || porJugador < 1) return []
  const jugadores = new Set(jugadorIds)
  const validos = pendientes.filter(p => jugadores.has(p.jugadorAId) && jugadores.has(p.jugadorBId))

  const pendientesDe = new Map<string, number>()
  for (const p of validos) {
    pendientesDe.set(p.jugadorAId, (pendientesDe.get(p.jugadorAId) ?? 0) + 1)
    pendientesDe.set(p.jugadorBId, (pendientesDe.get(p.jugadorBId) ?? 0) + 1)
  }

  let mejor: PartidoPendiente[] = []
  let mejorPuntaje = -1

  // Un generador determinista para que la misma entrada dé la misma salida
  // (las pruebas y el admin ven lo mismo dos veces seguidas).
  let semilla = 7
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff }

  for (let intento = 0; intento < intentos; intento++) {
    const cupo = new Map<string, number>(jugadorIds.map(j => [j, porJugador]))
    const usados = new Set<string>()
    const elegidos: PartidoPendiente[] = []

    const orden = [...jugadorIds].sort((a, b) => {
      const d = (pendientesDe.get(a) ?? 0) - (pendientesDe.get(b) ?? 0)
      return d !== 0 ? d : (intento === 0 ? 0 : azar() - 0.5)
    })

    for (const j of orden) {
      while ((cupo.get(j) ?? 0) > 0) {
        const candidatos = validos.filter(p =>
          !usados.has(p.id) &&
          (p.jugadorAId === j || p.jugadorBId === j) &&
          (cupo.get(p.jugadorAId === j ? p.jugadorBId : p.jugadorAId) ?? 0) > 0,
        )
        if (!candidatos.length) break
        candidatos.sort((x, y) => {
          const rx = x.jugadorAId === j ? x.jugadorBId : x.jugadorAId
          const ry = y.jugadorAId === j ? y.jugadorBId : y.jugadorAId
          const d = (pendientesDe.get(ry) ?? 0) - (pendientesDe.get(rx) ?? 0)
          return d !== 0 ? d : (intento === 0 ? 0 : azar() - 0.5)
        })
        const p = candidatos[0]
        usados.add(p.id)
        elegidos.push(p)
        cupo.set(p.jugadorAId, (cupo.get(p.jugadorAId) ?? 0) - 1)
        cupo.set(p.jugadorBId, (cupo.get(p.jugadorBId) ?? 0) - 1)
      }
    }

    // Más partidos primero; a igual cantidad, más jugadores completos.
    const completos = jugadorIds.filter(j => (cupo.get(j) ?? 0) === 0).length
    const puntaje = elegidos.length * 100 + completos
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = elegidos }
  }

  return mejor
}

// ─── 2. En qué bloque y mesa ────────────────────────────────────────────────

/**
 * Reparte los partidos elegidos en bloques de `mesas.length` partidos, sin
 * que nadie juegue dos a la vez y con la regla del hueco: entre dos partidos
 * de un mismo jugador no queda más de `huecoMax` bloques libres. Se usa el
 * mínimo de bloques posible; si con hueco 1 no hay forma, se relaja a 2 y
 * después se rinde a un reparto voraz sin la regla (avisando).
 *
 * Es una búsqueda en profundidad bloque por bloque con la misma poda que el
 * solver de `liga.ts`: quien jugó hace `huecoMax + 1` bloques y todavía tiene
 * partidos está OBLIGADO a jugar ahora, así que los obligados se colocan
 * primero y si no caben, la rama muere.
 */
export function distribuirEnBloques(
  partidos: readonly PartidoPendiente[],
  mesas: readonly number[],
  huecoMax = HUECO_MAX_JORNADA,
  presupuestoNodos = 20_000,
): { partidos: PartidoDeJornada[]; huecoRespetado: boolean } {
  const k = mesas.length
  if (!partidos.length || k === 0) return { partidos: [], huecoRespetado: true }

  const exacto = (hueco: number): PartidoDeJornada[] | null => {
    const m = partidos.length
    const B = bloquesNecesarios(m, k)
    const restantes = new Map<string, number>()
    for (const p of partidos) {
      restantes.set(p.jugadorAId, (restantes.get(p.jugadorAId) ?? 0) + 1)
      restantes.set(p.jugadorBId, (restantes.get(p.jugadorBId) ?? 0) + 1)
    }
    const ultimo = new Map<string, number>()
    const usado = new Set<string>()
    const salida: PartidoDeJornada[] = []
    let nodos = 0
    let agotado = false

    const dfs = (b: number): boolean => {
      if (usado.size === m) return true
      if (b >= B || agotado) return false

      // Quién está obligado a jugar en este bloque por la regla del hueco.
      const obligados = new Set<string>()
      for (const [j, u] of ultimo) {
        if ((restantes.get(j) ?? 0) > 0 && b - u > hueco) obligados.add(j)
      }
      // Cuántos partidos como mínimo van acá para que el resto quepa después.
      const minimoAca = Math.max(1, (m - usado.size) - (B - b - 1) * k)

      const candidatos = partidos.filter(p => !usado.has(p.id))
      candidatos.sort((x, y) => {
        const ox = Number(obligados.has(x.jugadorAId)) + Number(obligados.has(x.jugadorBId))
        const oy = Number(obligados.has(y.jugadorAId)) + Number(obligados.has(y.jugadorBId))
        if (oy !== ox) return oy - ox
        const rx = (restantes.get(x.jugadorAId) ?? 0) + (restantes.get(x.jugadorBId) ?? 0)
        const ry = (restantes.get(y.jugadorAId) ?? 0) + (restantes.get(y.jugadorBId) ?? 0)
        return ry - rx
      })

      const enBloque: PartidoPendiente[] = []
      const jugando = new Set<string>()

      const cerrar = (): boolean => {
        if (enBloque.length < minimoAca) return false
        for (const j of obligados) if (!jugando.has(j)) return false
        const previo = enBloque.map(p => ({ p, ua: ultimo.get(p.jugadorAId), ub: ultimo.get(p.jugadorBId) }))
        enBloque.forEach((p, i) => {
          usado.add(p.id)
          restantes.set(p.jugadorAId, (restantes.get(p.jugadorAId) ?? 0) - 1)
          restantes.set(p.jugadorBId, (restantes.get(p.jugadorBId) ?? 0) - 1)
          ultimo.set(p.jugadorAId, b); ultimo.set(p.jugadorBId, b)
          salida.push({ id: p.id, jugadorAId: p.jugadorAId, jugadorBId: p.jugadorBId, bloque: b, mesa: mesas[i], arbitroId: null })
        })
        if (dfs(b + 1)) return true
        salida.splice(salida.length - enBloque.length, enBloque.length)
        for (const { p, ua, ub } of previo) {
          usado.delete(p.id)
          restantes.set(p.jugadorAId, (restantes.get(p.jugadorAId) ?? 0) + 1)
          restantes.set(p.jugadorBId, (restantes.get(p.jugadorBId) ?? 0) + 1)
          if (ua === undefined) ultimo.delete(p.jugadorAId); else ultimo.set(p.jugadorAId, ua)
          if (ub === undefined) ultimo.delete(p.jugadorBId); else ultimo.set(p.jugadorBId, ub)
        }
        return false
      }

      // Llenar el bloque primero (mesas llenas); cerrar con menos solo cuando
      // no queda cómo llenarlo.
      const elegir = (desde: number): boolean => {
        if (++nodos > presupuestoNodos) { agotado = true; return false }
        if (enBloque.length === k) return cerrar()
        for (let i = desde; i < candidatos.length; i++) {
          const p = candidatos[i]
          if (jugando.has(p.jugadorAId) || jugando.has(p.jugadorBId)) continue
          enBloque.push(p); jugando.add(p.jugadorAId); jugando.add(p.jugadorBId)
          if (elegir(i + 1)) return true
          enBloque.pop(); jugando.delete(p.jugadorAId); jugando.delete(p.jugadorBId)
          if (agotado) return false
        }
        return enBloque.length > 0 && enBloque.length < k ? cerrar() : false
      }

      return elegir(0)
    }

    return dfs(0) ? salida : null
  }

  const conHueco = exacto(huecoMax)
  if (conHueco) return { partidos: conHueco, huecoRespetado: true }
  const relajado = exacto(huecoMax + 1)
  if (relajado) return { partidos: relajado, huecoRespetado: false }

  // Voraz de respaldo: bloque a bloque, sin repetir jugador dentro del bloque.
  const usado = new Set<string>()
  const salida: PartidoDeJornada[] = []
  let b = 0
  while (usado.size < partidos.length) {
    const jugando = new Set<string>()
    let i = 0
    for (const p of partidos) {
      if (i >= k) break
      if (usado.has(p.id) || jugando.has(p.jugadorAId) || jugando.has(p.jugadorBId)) continue
      usado.add(p.id); jugando.add(p.jugadorAId); jugando.add(p.jugadorBId)
      salida.push({ id: p.id, jugadorAId: p.jugadorAId, jugadorBId: p.jugadorBId, bloque: b, mesa: mesas[i], arbitroId: null })
      i++
    }
    if (i === 0) break
    b++
  }
  return { partidos: salida, huecoRespetado: false }
}

// ─── 3. Quién arbitra ───────────────────────────────────────────────────────

/**
 * Árbitro para cada partido, de la misma división: alguien que no juega en
 * ese bloque ni arbitra otro partido del mismo bloque. Se prefiere a quien
 * juega en el bloque anterior o siguiente (ya está en el club), después a
 * quien todavía tiene partidos por delante, y siempre al que menos ha
 * arbitrado. Si no alcanza la gente (pocos jugadores para muchas mesas), el
 * partido queda sin árbitro y se avisa.
 */
export function asignarArbitrosJornada(
  partidos: readonly PartidoDeJornada[],
  jugadorIds: readonly string[],
): PartidoDeJornada[] {
  const porBloque = new Map<number, PartidoDeJornada[]>()
  for (const p of partidos) {
    const arr = porBloque.get(p.bloque) ?? []
    arr.push(p)
    porBloque.set(p.bloque, arr)
  }
  const bloques = [...porBloque.keys()].sort((a, b) => a - b)
  const juegaEn = new Map<string, Set<number>>()
  for (const p of partidos) {
    for (const j of [p.jugadorAId, p.jugadorBId]) {
      if (!juegaEn.has(j)) juegaEn.set(j, new Set())
      juegaEn.get(j)!.add(p.bloque)
    }
  }
  const veces = new Map<string, number>()
  const ultimoBloqueDe = (j: string) => Math.max(-1, ...(juegaEn.get(j) ?? []))
  const primerBloqueDe = (j: string) => Math.min(Infinity, ...(juegaEn.get(j) ?? []))

  const salida: PartidoDeJornada[] = []
  for (const b of bloques) {
    const enBloque = [...(porBloque.get(b) ?? [])].sort((x, y) => x.mesa - y.mesa)
    const jugando = new Set(enBloque.flatMap(p => [p.jugadorAId, p.jugadorBId]))
    const ocupados = new Set<string>()
    for (const p of enBloque) {
      const candidatos = jugadorIds.filter(j => !jugando.has(j) && !ocupados.has(j))
      if (!candidatos.length) { salida.push({ ...p, arbitroId: null }); continue }
      candidatos.sort((x, y) => {
        // 1) Ya está en el club: juega en el bloque de al lado.
        const ax = Number(juegaEn.get(x)?.has(b - 1) || juegaEn.get(x)?.has(b + 1))
        const ay = Number(juegaEn.get(y)?.has(b - 1) || juegaEn.get(y)?.has(b + 1))
        if (ay !== ax) return ay - ax
        // 2) Dentro de su ventana de actividad (no lo hace quedarse más ni venir antes).
        const dentroX = Number(primerBloqueDe(x) <= b && b <= ultimoBloqueDe(x))
        const dentroY = Number(primerBloqueDe(y) <= b && b <= ultimoBloqueDe(y))
        if (dentroY !== dentroX) return dentroY - dentroX
        // 3) Todavía le quedan partidos por delante (va a estar igual).
        const px = Number(ultimoBloqueDe(x) > b), py = Number(ultimoBloqueDe(y) > b)
        if (py !== px) return py - px
        // 4) El que menos ha arbitrado.
        return (veces.get(x) ?? 0) - (veces.get(y) ?? 0)
      })
      const arbitro = candidatos[0]
      ocupados.add(arbitro)
      veces.set(arbitro, (veces.get(arbitro) ?? 0) + 1)
      salida.push({ ...p, arbitroId: arbitro })
    }
  }
  return salida
}

/** Las tres piezas juntas: lo que la pantalla llama para proponer una jornada. */
export function programarJornadaDivision(params: {
  pendientes: readonly PartidoPendiente[]
  jugadorIds: readonly string[]
  porJugador: number
  mesas: readonly number[]
}): { partidos: PartidoDeJornada[]; huecoRespetado: boolean; sinArbitro: number } {
  let elegidos = elegirPartidosDeJornada(params.pendientes, params.jugadorIds, params.porJugador)
  // La cola: cuando lo que sobra cabe en dos bloques más (o menos), no vale
  // la pena citar a la gente otro fin de semana por un puñado de partidos.
  // La división termina hoy, aunque alguien juegue uno de más.
  const sobran = params.pendientes.length - elegidos.length
  if (sobran > 0 && sobran <= params.mesas.length * 2) {
    const conColas = elegirPartidosDeJornada(params.pendientes, params.jugadorIds, params.porJugador + 1)
    if (conColas.length === params.pendientes.length) elegidos = conColas
  }
  const { partidos, huecoRespetado } = distribuirEnBloques(elegidos, params.mesas)
  const conArbitros = asignarArbitrosJornada(partidos, params.jugadorIds)
  return { partidos: conArbitros, huecoRespetado, sinArbitro: conArbitros.filter(p => !p.arbitroId).length }
}

// ─── Lector de la programación publicada ────────────────────────────────────
//
// Entiende el texto de la "Programación oficial" que el club imprime: por
// día, por división, filas "HH:MM mesa Jugador A vs Jugador B Árbitro". En el
// texto copiado del PDF el rival y el árbitro vienen pegados sin separador,
// así que el árbitro se reconoce como sufijo entre los nombres ya conocidos:
// primero los que aparecen como jugador A (siempre completos) y, por
// iteración, los que se van despejando. Lo que no se pueda separar queda
// marcado para que el admin lo resuelva en pantalla.

export interface FilaProgramada {
  hora: string
  mesa: number
  jugadorA: string
  jugadorB: string
  arbitro: string | null
  /** El rival y el árbitro no se pudieron separar: `jugadorB` trae todo. */
  ambiguo: boolean
}

export interface DivisionProgramada {
  nombre: string
  mesas: number[]
  filas: FilaProgramada[]
}

export interface DiaProgramado {
  /** Texto tal cual ("Sábado 12 de septiembre"), y la fecha ISO si se pudo leer. */
  etiqueta: string
  fecha: string | null
  horaInicio: string | null
  divisiones: DivisionProgramada[]
}

export interface ProgramacionParseada {
  jornada: number | null
  dias: DiaProgramado[]
  /** Todos los nombres que aparecen, ya normalizados a como están escritos. */
  nombres: string[]
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

const RE_DIA = /^(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)\s+(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?(?:.*?desde\s+las\s+(\d{1,2}:\d{2}))?/i
const RE_DIVISION = /^(.+?)\s+[—–-]+\s+mesas?\s+(\d+)(?:\s+(?:a|al|-|–|y)\s+(\d+))?/i
const RE_FILA = /^(\d{1,2}:\d{2})\s+(\d+)\s+(.+?)\s+vs\.?\s+(.+)$/i
const RE_JORNADA = /jornada\s+(\d+)/i

function limpiar(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function parsearProgramacionJornada(texto: string, anioPorDefecto = new Date().getFullYear()): ProgramacionParseada {
  const lineas = texto.split(/\r?\n/).map(limpiar).filter(Boolean)
  const dias: DiaProgramado[] = []
  let jornada: number | null = null
  let diaActual: DiaProgramado | null = null
  let divisionActual: DivisionProgramada | null = null
  // Filas crudas: el "B + árbitro" se separa al final, con todos los nombres.
  const crudas: Array<{ division: DivisionProgramada; hora: string; mesa: number; jugadorA: string; resto: string }> = []

  for (const linea of lineas) {
    const mj = linea.match(RE_JORNADA)
    if (mj && jornada === null) jornada = Number(mj[1])

    const md = linea.match(RE_DIA)
    if (md) {
      const mes = MESES[md[3].toLowerCase()]
      const anio = md[4] ? Number(md[4]) : anioPorDefecto
      const fecha = mes ? `${anio}-${String(mes).padStart(2, '0')}-${md[2].padStart(2, '0')}` : null
      diaActual = { etiqueta: limpiar(linea.replace(/·.*$/, '')), fecha, horaInicio: md[5] ?? null, divisiones: [] }
      dias.push(diaActual)
      divisionActual = null
      continue
    }

    const mf = linea.match(RE_FILA)
    if (mf) {
      if (!diaActual) { diaActual = { etiqueta: 'Sin día', fecha: null, horaInicio: null, divisiones: [] }; dias.push(diaActual) }
      if (!divisionActual) { divisionActual = { nombre: 'Sin división', mesas: [], filas: [] }; diaActual.divisiones.push(divisionActual) }
      crudas.push({ division: divisionActual, hora: mf[1].padStart(5, '0'), mesa: Number(mf[2]), jugadorA: limpiar(mf[3]), resto: limpiar(mf[4]) })
      continue
    }

    const mdv = linea.match(RE_DIVISION)
    if (mdv) {
      const desde = Number(mdv[2])
      const hasta = mdv[3] ? Number(mdv[3]) : desde
      const mesas = Array.from({ length: Math.max(1, hasta - desde + 1) }, (_, i) => desde + i)
      if (!diaActual) { diaActual = { etiqueta: 'Sin día', fecha: null, horaInicio: null, divisiones: [] }; dias.push(diaActual) }
      divisionActual = { nombre: limpiar(mdv[1]), mesas, filas: [] }
      diaActual.divisiones.push(divisionActual)
      continue
    }
  }

  // Separar "rival + árbitro". Si el texto trae tabulador o dos espacios (copiado
  // de una planilla), ya viene separado; si no, el árbitro es un sufijo conocido.
  const conocidos = new Set<string>(crudas.map(c => c.jugadorA))
  const pendientes = crudas.map(c => ({ ...c, jugadorB: null as string | null, arbitro: null as string | null }))
  for (const c of pendientes) {
    const partes = c.resto.split(/\t|\s{2,}/).map(limpiar).filter(Boolean)
    if (partes.length === 2) { c.jugadorB = partes[0]; c.arbitro = partes[1]; conocidos.add(partes[0]); conocidos.add(partes[1]) }
  }
  let cambio = true
  while (cambio) {
    cambio = false
    for (const c of pendientes) {
      if (c.jugadorB) continue
      const sufijos = [...conocidos].filter(n => c.resto.endsWith(' ' + n) && c.resto.length > n.length + 1)
      // Si hay varios sufijos conocidos, el más largo es el árbitro completo.
      sufijos.sort((a, b) => b.length - a.length)
      if (sufijos.length) {
        const arbitro = sufijos[0]
        const jugadorB = limpiar(c.resto.slice(0, c.resto.length - arbitro.length))
        c.jugadorB = jugadorB
        c.arbitro = arbitro
        conocidos.add(jugadorB)
        cambio = true
      }
    }
  }
  // Segunda pasada: si el RIVAL ya es conocido como prefijo, el resto es el árbitro.
  for (const c of pendientes) {
    if (c.jugadorB) continue
    const prefijos = [...conocidos].filter(n => c.resto.startsWith(n + ' ') && c.resto.length > n.length + 1)
    prefijos.sort((a, b) => b.length - a.length)
    if (prefijos.length) {
      c.jugadorB = prefijos[0]
      c.arbitro = limpiar(c.resto.slice(prefijos[0].length))
      conocidos.add(c.arbitro)
    }
  }

  for (const c of pendientes) {
    c.division.filas.push({
      hora: c.hora,
      mesa: c.mesa,
      jugadorA: c.jugadorA,
      jugadorB: c.jugadorB ?? c.resto,
      arbitro: c.jugadorB ? c.arbitro : null,
      ambiguo: !c.jugadorB,
    })
  }

  return { jornada, dias, nombres: [...conocidos].sort((a, b) => a.localeCompare(b, 'es')) }
}

/** Para casar nombres del PDF con jugadores del sistema: sin tildes, en minúscula, un espacio. */
export function normalizarNombre(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Suma días a una fecha ISO (YYYY-MM-DD) sin pasar por zonas horarias. */
export function sumarDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d + dias)
  const f = new Date(t)
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`
}
