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
//
// La segunda regla, decidida por el club en julio de 2026: un día que ya pasó
// y quedó sin registrar cuenta como ausencia, no como "no se sabe". Antes se
// dejaba fuera del porcentaje —el argumento era que un olvido del profe no es
// falta del alumno—, pero en la práctica eso hacía que un grupo entero sin
// lista pasada tuviera 100% de asistencia, que es peor mentira que la
// contraria. El olvido ahora se ve, y se corrige a mano donde corresponde.

import { fechaChile } from './fechaChile'
import { vigenteEn, type Vigencia } from './vigencia'

// 'extraordinaria' es un día en que vino a un grupo que no es el suyo. No es un
// estado de asistencia: es un hecho aparte, que no descuenta sesión ni entra en
// el porcentaje. Aparece acá solo para poder pintarlo en el calendario.
export type EstadoDia = 'presente' | 'ausente' | 'pendiente' | 'extraordinaria'

/** Un día del calendario del jugador: le tocaba entrenar y esto pasó. */
export type DiaCalendario = {
  fecha: string
  dia: string
  estado: EstadoDia
  bloques: string[]        // nombres de los grupos que le tocaban ese día
  /** Además de lo anterior, ese día vino a una clase extra. */
  extra: boolean
}

export type BloqueVigente = Vigencia & {
  id: string
  nombre: string
  sede: string
  dia_semana: string
  // El cálculo no las mira; las pantallas que dejan elegir un bloque sí, porque
  // es la hora lo que distingue dos grupos del mismo día.
  hora_inicio?: string
  hora_fin?: string
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

/**
 * Vino a un grupo que no es el suyo. Se cobra aparte y no consume sesión.
 *
 * Al cálculo le alcanza con saber quién y qué día. El resto lo llevan las
 * pantallas que además la editan, y por eso va opcional.
 */
export type ClaseExtra = {
  jugador_id: string
  fecha: string
  id?: string
  bloque_id?: string | null
  monto?: number | null
}

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
  /** Opcional: las pantallas viejas que no las cargan siguen funcionando. */
  extraordinarias?: ClaseExtra[]
  /**
   * Qué día es hoy, para saber cuáles ya vencieron. Por defecto, hoy en Chile.
   *
   * Va acá y no leído del reloj adentro del cálculo para que el módulo siga
   * siendo puro: los tests fijan la fecha y dejan de depender de cuándo se
   * corren. Sin esto, una prueba escrita con fechas de agosto empieza a fallar
   * sola en septiembre.
   */
  hoy?: string
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
  /** Fechas en que cada jugador vino a un grupo que no era el suyo. */
  extrasDe: Map<string, Set<string>>
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

  const extrasDe = new Map<string, Set<string>>()
  for (const e of datos.extraordinarias ?? []) {
    let suyas = extrasDe.get(e.jugador_id)
    if (!suyas) { suyas = new Set(); extrasDe.set(e.jugador_id, suyas) }
    suyas.add(e.fecha)
  }

  return {
    bloquePorId: new Map(datos.bloques.map(b => [b.id, b])),
    inscripcionesDe,
    estadoDe,
    sinClase: new Set(datos.excepciones.map(e => `${e.bloque_id}|${e.fecha}`)),
    extrasDe,
  }
}

export function calendarioJugador(
  jugadorId: string,
  desde: string,
  hasta: string,
  datos: DatosHistorial,
  indice?: IndiceHistorial,
): DiaCalendario[] {
  const { bloquePorId, inscripcionesDe, estadoDe: todos, sinClase, extrasDe } = indice ?? indexar(datos)
  const hoy = datos.hoy ?? fechaChile()
  const mias = inscripcionesDe.get(jugadorId) ?? []
  const estadoDe = todos.get(jugadorId) ?? new Map<string, 'presente' | 'ausente'>()
  const misExtras = extrasDe.get(jugadorId) ?? new Set<string>()

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
    const extra = misExtras.has(fecha)

    // Un día que no le tocaba entrenar solo aparece si vino igual, a una clase
    // extra. Sin eso el día quedaba invisible: la clase existía, se cobraba, y
    // en su calendario no había nada.
    if (nombres.length === 0) {
      if (extra) out.push({ fecha, dia, estado: 'extraordinaria', bloques: [], extra: true })
      continue
    }

    // Si además le tocaba entrenar, manda su estado normal: la extra es algo
    // que pasó ese día, no reemplaza si asistió o faltó a lo suyo.
    //
    // Sin registro, decide la fecha. Un día que ya pasó y nadie marcó cuenta
    // como ausencia: le tocaba entrenar, el cupo estaba tomado y no hay nada
    // que diga que vino. Hoy y lo que viene siguen 'pendiente', porque el profe
    // todavía puede pasar la lista y llamar falta a un día que no terminó sería
    // inventar. Cualquier día se corrige a mano desde Asistencia Histórica.
    const registrado = estadoDe.get(fecha)
    const estado: EstadoDia = registrado ?? (fecha < hoy ? 'ausente' : 'pendiente')
    out.push({ fecha, dia, estado, bloques: nombres, extra })
  }
  return out
}

/**
 * Los grupos que se dictaban ese día y en los que el jugador NO estaba.
 *
 * Es la definición de "un grupo que no es el suyo", que es lo único que hace
 * extraordinaria a una clase. La base vuelve a comprobarlo antes de escribir:
 * esto es para ofrecerle al profe una lista corta y correcta, no para decidir.
 */
export function bloquesSinInscripcion(
  datos: DatosHistorial,
  jugadorId: string,
  fecha: string,
  dia: string,
): BloqueVigente[] {
  const suyos = new Set(
    datos.inscripciones
      .filter(i => i.jugador_id === jugadorId && vigenteEn(i, fecha))
      .map(i => i.bloque_id),
  )
  return datos.bloques.filter(b =>
    b.dia_semana === dia && vigenteEn(b, fecha) && !suyos.has(b.id))
}

export type Indicadores = {
  programados: number
  presentes: number
  ausentes: number
  pendientes: number
  /** Clases a las que vino de más. Se informan, no entran en el porcentaje. */
  extraordinarias: number
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
 * Quedan 'pendiente' solo hoy y los días que vienen, y esos no entran en el
 * porcentaje: todavía no pasaron, no hay nada que contar. Un día vencido sin
 * registro ya llegó como 'ausente' desde `calendarioJugador` y sí pesa.
 *
 * Las clases extraordinarias quedan fuera de todo el cálculo. Vino a un grupo
 * que no era el suyo: eso no le suma asistencia —no era su obligación— y
 * tampoco se la resta. Se cuentan aparte, para poder mostrarlas.
 */
export function indicadores(dias: DiaCalendario[]): Indicadores {
  const extraordinarias = dias.filter(d => d.estado === 'extraordinaria').length
  const orden = dias
    .filter(d => d.estado !== 'extraordinaria')
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

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
    extraordinarias,
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

export type SesionesMes = {
  /** Días del mes que ya ocuparon cupo: vino o faltó. */
  usadas: number
  /** Días que le tocan entrenar en el mes, incluidos los que todavía no llegan. */
  limite: number
}

/**
 * Las sesiones del mes de una fecha, derivadas de los bloques del jugador.
 *
 * Reemplaza a las columnas `jugadores.sesiones_usadas` y `sesiones_limite`, que
 * son cachés cuyo valor correcto depende del calendario pero que solo se
 * refrescan al escribir asistencia. El día 1 el contador seguía mostrando el
 * total del mes anterior hasta que alguien volviera a entrenar, y el límite
 * salía de `entrenamientos_por_semana × 4` —un campo que se escribe a mano al
 * dar de alta y que inscribir en un bloque no actualiza—, así que un jugador de
 * cinco días semanales aparecía con doce sesiones.
 *
 * Acá los dos números salen de los mismos bloques que ya mandan en el resto del
 * sistema, así que respetan vigencias, feriados y cambios de grupo sin que nadie
 * tenga que acordarse de sincronizar nada.
 *
 * Una ausencia gasta sesión igual que una presencia: el cupo se ocupó. Es la
 * misma regla de `indicadores`, de la que esto es un envoltorio.
 */
export function sesionesDelMes(
  jugadorId: string,
  datos: DatosHistorial,
  hoy: string,
  indice?: IndiceHistorial,
): SesionesMes {
  const [anio, mes] = hoy.split('-').map(Number)
  const desde = `${hoy.slice(0, 7)}-01`
  // Día 0 del mes siguiente es el último del actual, y con esto febrero y los
  // bisiestos no son un caso aparte.
  const ultimo = new Date(anio, mes, 0).getDate()
  const hasta = `${hoy.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`

  const ind = indicadores(calendarioJugador(jugadorId, desde, hasta, datos, indice))
  return { usadas: ind.presentes + ind.ausentes, limite: ind.programados }
}
