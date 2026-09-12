'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { generarFixtureDivision } from '@/lib/domain/liga'
import {
  horaDeBloque,
  normalizarNombre,
  parsearProgramacionJornada,
  programarJornadaDivision,
  sumarDias,
  type PartidoPendiente,
  type ProgramacionParseada,
} from '@/lib/domain/ligaJornadas'

// Ligas en modo `jornadas` (migración 272): la forma de programar de
// Spinhouse. Dos entradas:
//   · importarProgramacionJornada: carga la programación que el club ya
//     publicó (pegando el texto del PDF), tal cual, con sus horas, mesas y
//     árbitros. Crea lo que falte —divisiones, jugadores, fixture, jornada—
//     y programa los partidos sobre eso.
//   · proyectarJornada: propone la siguiente jornada con el motor de
//     `ligaJornadas.ts`, con el día y las mesas de cada división que el
//     admin decidió para ESA jornada.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type Fila = Record<string, unknown>

/** Lo que la pantalla muestra antes de confirmar una importación. */
export interface PrevisualizacionImportacion {
  jornada: number | null
  dias: Array<{ etiqueta: string; fecha: string | null; divisiones: Array<{ nombre: string; mesas: number[]; partidos: number; existe: boolean }> }>
  jugadores: { encontrados: string[]; nuevos: string[] }
  filasAmbiguas: Array<{ division: string; hora: string; mesa: number; texto: string }>
  totalPartidos: number
}

async function ligaDelClub(db: Db, ligaId: string, clubId: string | null) {
  const { data: liga } = await db
    .from('ligas')
    .select('id, club_id, modo_programacion, partidos_por_jugador_por_fecha, hora_inicio, bloque_minutos, estado')
    .eq('id', ligaId)
    .single()
  if (!liga || liga.club_id !== clubId) return { error: 'Liga no encontrada' as const, liga: null }
  if (liga.modo_programacion !== 'jornadas') {
    return { error: 'Esta liga no se programa por jornadas. Se elige al crearla.' as const, liga: null }
  }
  return { error: null, liga }
}

/**
 * Casa los nombres de la programación con los jugadores del club. Sin
 * tildes ni mayúsculas: "Óscar Vásquez" y "Oscar Vasquez" son la misma
 * persona. Lo que no está se crea como jugador del club, igual que
 * `crearJugadorExternoLiga`: la liga es el lugar donde esta gente existe.
 */
async function resolverJugadores(db: Db, clubId: string, nombres: string[], crear: boolean) {
  const { data: existentes } = await db
    .from('jugadores').select('id, nombre').eq('club_id', clubId)
  const porNombre = new Map<string, { id: string; nombre: string }>()
  for (const j of (existentes || []) as Array<{ id: string; nombre: string | null }>) {
    if (j.nombre) porNombre.set(normalizarNombre(j.nombre), { id: j.id, nombre: j.nombre })
  }
  const idPorNombre = new Map<string, string>()
  const encontrados: string[] = []
  const nuevos: string[] = []
  for (const n of nombres) {
    const hit = porNombre.get(normalizarNombre(n))
    if (hit) { idPorNombre.set(n, hit.id); encontrados.push(n) } else nuevos.push(n)
  }
  if (crear && nuevos.length) {
    const { data: creados, error } = await db
      .from('jugadores')
      .insert(nuevos.map(nombre => ({
        club_id: clubId, nombre, categoria: 'principiante', sesiones_limite: 0, estado: 'activo', es_externo: true,
      })))
      .select('id, nombre')
    if (error) return { error: 'No se pudieron crear los jugadores nuevos: ' + error.message, idPorNombre, encontrados, nuevos }
    for (const j of (creados || []) as Array<{ id: string; nombre: string }>) idPorNombre.set(j.nombre, j.id)
  }
  return { error: null, idPorNombre, encontrados, nuevos }
}

export async function importarProgramacionJornada(params: {
  ligaId: string
  texto: string
  /** Solo mirar qué haría, sin escribir nada. */
  soloPrevisualizar?: boolean
}): Promise<{ error?: string; previsualizacion?: PrevisualizacionImportacion; resumen?: {
  jornada: number
  divisionesCreadas: number
  jugadoresCreados: number
  partidosProgramados: number
  noEncontrados: string[]
} }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase

  const { error: errLiga, liga } = await ligaDelClub(db, params.ligaId, clubId)
  if (errLiga) return { error: errLiga }

  const prog: ProgramacionParseada = parsearProgramacionJornada(params.texto)
  const totalPartidos = prog.dias.reduce((s, d) => s + d.divisiones.reduce((t, x) => t + x.filas.length, 0), 0)
  if (!totalPartidos) return { error: 'No encontré partidos en el texto. Las filas tienen que verse como "15:00 1 Jugador A vs Jugador B Árbitro".' }
  if (prog.jornada === null) return { error: 'No encontré el número de jornada ("Jornada 1"). Agrégalo al texto.' }
  if (prog.dias.some(d => !d.fecha)) return { error: 'A un día le falta la fecha ("Sábado 12 de septiembre").' }

  const filasAmbiguas = prog.dias.flatMap(d => d.divisiones.flatMap(x =>
    x.filas.filter(f => f.ambiguo).map(f => ({ division: x.nombre, hora: f.hora, mesa: f.mesa, texto: `${f.jugadorA} vs ${f.jugadorB}` })),
  ))

  const { data: divisionesExistentes } = await db
    .from('liga_divisiones').select('id, nombre, orden, fixture_generado').eq('liga_id', liga.id).order('orden')
  const divisionPorNombre = new Map<string, { id: string; fixture_generado: boolean }>()
  for (const d of (divisionesExistentes || []) as Array<{ id: string; nombre: string; fixture_generado: boolean }>) {
    divisionPorNombre.set(normalizarNombre(d.nombre), { id: d.id, fixture_generado: d.fixture_generado })
  }

  const resuelto = await resolverJugadores(db, clubId, prog.nombres, false)

  const previsualizacion: PrevisualizacionImportacion = {
    jornada: prog.jornada,
    dias: prog.dias.map(d => ({
      etiqueta: d.etiqueta, fecha: d.fecha,
      divisiones: d.divisiones.map(x => ({ nombre: x.nombre, mesas: x.mesas, partidos: x.filas.length, existe: divisionPorNombre.has(normalizarNombre(x.nombre)) })),
    })),
    jugadores: { encontrados: resuelto.encontrados, nuevos: resuelto.nuevos },
    filasAmbiguas,
    totalPartidos,
  }
  if (params.soloPrevisualizar) return { previsualizacion }
  if (filasAmbiguas.length) {
    return { error: `Hay ${filasAmbiguas.length} fila(s) donde no pude separar el rival del árbitro. Sepáralos con dos espacios o un tabulador y vuelve a intentar.`, previsualizacion }
  }

  // ── Escritura, en el orden en que cada paso depende del anterior ────────

  // 1. Jugadores que faltan.
  const conCreacion = await resolverJugadores(db, clubId, prog.nombres, true)
  if (conCreacion.error) return { error: conCreacion.error }
  const idPorNombre = conCreacion.idPorNombre

  // 2. Divisiones que faltan, en el orden en que aparecen.
  let divisionesCreadas = 0
  let ordenSiguiente = (divisionesExistentes || []).length
  for (const d of prog.dias) for (const x of d.divisiones) {
    const clave = normalizarNombre(x.nombre)
    if (divisionPorNombre.has(clave)) continue
    const { data: nueva, error } = await db
      .from('liga_divisiones').insert({ liga_id: liga.id, nombre: x.nombre, orden: ordenSiguiente++ }).select('id').single()
    if (error || !nueva) return { error: `No se pudo crear la división ${x.nombre}: ${error?.message ?? ''}` }
    divisionPorNombre.set(clave, { id: nueva.id, fixture_generado: false })
    divisionesCreadas++
  }

  // 3. Cada jugador en su división, y el fixture completo de la división.
  const jugadoresPorDivision = new Map<string, Set<string>>()
  for (const d of prog.dias) for (const x of d.divisiones) {
    const divId = divisionPorNombre.get(normalizarNombre(x.nombre))!.id
    const ids = jugadoresPorDivision.get(divId) ?? new Set<string>()
    for (const f of x.filas) for (const n of [f.jugadorA, f.jugadorB, f.arbitro]) {
      const id = n ? idPorNombre.get(n) : null
      if (id) ids.add(id)
    }
    jugadoresPorDivision.set(divId, ids)
  }
  for (const [divId, ids] of jugadoresPorDivision) {
    const { data: ya } = await db.from('liga_division_jugadores').select('jugador_id').eq('division_id', divId)
    const yaIds = new Set(((ya || []) as Array<{ jugador_id: string }>).map(r => r.jugador_id))
    const faltan = [...ids].filter(id => !yaIds.has(id))
    if (faltan.length) {
      const { error } = await db.from('liga_division_jugadores').insert(faltan.map(jugador_id => ({ division_id: divId, jugador_id })))
      if (error) return { error: 'No se pudo inscribir a los jugadores en su división: ' + error.message }
    }
    const div = [...divisionPorNombre.values()].find(v => v.id === divId)!
    if (!div.fixture_generado) {
      const todos = [...new Set([...yaIds, ...ids])]
      const fixture = generarFixtureDivision(todos)
      const { error } = await db.from('liga_partidos').insert(fixture.map(p => ({
        liga_id: liga.id, division_id: divId, jugador_a_id: p.jugadorA, jugador_b_id: p.jugadorB, orden_fixture: p.orden,
      })))
      if (error) return { error: 'No se pudo generar el fixture de una división: ' + error.message }
      const { error: errFlag } = await db.from('liga_divisiones').update({ fixture_generado: true }).eq('id', divId)
      if (errFlag) return { error: 'No se pudo marcar el fixture como generado: ' + errFlag.message }
      div.fixture_generado = true
    }
  }

  // 4. Mesas: las que nombra la programación.
  const numerosMesa = [...new Set(prog.dias.flatMap(d => d.divisiones.flatMap(x => x.filas.map(f => f.mesa))))]
  const { data: mesasExistentes } = await db.from('liga_mesas').select('id, numero').eq('liga_id', liga.id)
  const mesaIdPorNumero = new Map<number, string>(((mesasExistentes || []) as Array<{ id: string; numero: number }>).map(m => [m.numero, m.id]))
  const mesasFaltan = numerosMesa.filter(n => !mesaIdPorNumero.has(n))
  if (mesasFaltan.length) {
    const { data: creadas, error } = await db.from('liga_mesas').insert(mesasFaltan.map(numero => ({ liga_id: liga.id, numero }))).select('id, numero')
    if (error) return { error: 'No se pudieron crear las mesas: ' + error.message }
    for (const m of (creadas || []) as Array<{ id: string; numero: number }>) mesaIdPorNumero.set(m.numero, m.id)
  }

  // 5. La jornada (liga_fechas.numero) con la fecha del primer día, y la sesión
  //    de cada división: qué día y qué mesas.
  const fechasOrdenadas = prog.dias.map(d => d.fecha!).sort()
  const primerDia = fechasOrdenadas[0]
  const { data: fechaExistente } = await db
    .from('liga_fechas').select('id, estado').eq('liga_id', liga.id).eq('numero', prog.jornada).maybeSingle()
  let fechaId: string
  if (fechaExistente) {
    if (fechaExistente.estado !== 'programada') return { error: `La jornada ${prog.jornada} ya está ${fechaExistente.estado}; no se puede reimportar.` }
    fechaId = fechaExistente.id
    const { error } = await db.from('liga_fechas').update({ fecha: primerDia }).eq('id', fechaId)
    if (error) return { error: 'No se pudo actualizar la jornada: ' + error.message }
    // Lo que esa jornada tenía y no se jugó se suelta: la hoja pegada manda.
    // Si no, un partido que otro motor dejó ahí se quedaría colado.
    const errLiberar = await liberarJornada(db, fechaId)
    if (errLiberar) return { error: errLiberar }
  } else {
    const { data: nueva, error } = await db
      .from('liga_fechas').insert({ liga_id: liga.id, numero: prog.jornada, es_ajuste: false, fecha: primerDia }).select('id').single()
    if (error || !nueva) return { error: 'No se pudo crear la jornada: ' + (error?.message ?? '') }
    fechaId = nueva.id
  }
  const diaOffsetDe = (fechaISO: string) => Math.round((Date.parse(fechaISO) - Date.parse(primerDia)) / 86_400_000)
  for (const d of prog.dias) for (const x of d.divisiones) {
    const divId = divisionPorNombre.get(normalizarNombre(x.nombre))!.id
    const diaOffset = diaOffsetDe(d.fecha!)
    const { error } = await db.from('liga_fecha_sesiones').upsert(
      { fecha_id: fechaId, division_id: divId, dia_offset: diaOffset, mesas: x.mesas },
      { onConflict: 'fecha_id,division_id' },
    )
    if (error) return { error: 'No se pudo guardar el día y las mesas de una división: ' + error.message }
  }

  // 6. Los partidos: cada fila busca su par en el fixture y queda programada.
  const noEncontrados: string[] = []
  let partidosProgramados = 0
  for (const d of prog.dias) for (const x of d.divisiones) {
    const divId = divisionPorNombre.get(normalizarNombre(x.nombre))!.id
    const { data: fixture } = await db
      .from('liga_partidos')
      .select('id, jugador_a_id, jugador_b_id, estado')
      .eq('division_id', divId).is('deleted_at', null)
    const porPar = new Map<string, { id: string; estado: string }>()
    for (const p of (fixture || []) as Array<{ id: string; jugador_a_id: string; jugador_b_id: string; estado: string }>) {
      porPar.set([p.jugador_a_id, p.jugador_b_id].sort().join('|'), { id: p.id, estado: p.estado })
    }
    for (const f of x.filas) {
      const a = idPorNombre.get(f.jugadorA), b = idPorNombre.get(f.jugadorB)
      const arb = f.arbitro ? idPorNombre.get(f.arbitro) ?? null : null
      const par = a && b ? porPar.get([a, b].sort().join('|')) : undefined
      if (!par || par.estado === 'finalizado' || par.estado === 'walkover') {
        noEncontrados.push(`${x.nombre}: ${f.jugadorA} vs ${f.jugadorB}`)
        continue
      }
      const { error } = await db.from('liga_partidos').update({
        fecha_id: fechaId, dia_offset: diaOffsetDe(d.fecha!), mesa_id: mesaIdPorNumero.get(f.mesa) ?? null,
        bloque_horario: f.hora, arbitro_id: arb, estado: 'programado',
      }).eq('id', par.id)
      if (error) return { error: `No se pudo programar ${f.jugadorA} vs ${f.jugadorB}: ${error.message}` }
      partidosProgramados++
    }
  }

  return {
    resumen: { jornada: prog.jornada, divisionesCreadas, jugadoresCreados: conCreacion.nuevos.length, partidosProgramados, noEncontrados },
  }
}

/** Qué día y qué mesas usa cada división en una jornada que se va a proyectar. */
export interface SesionProyectada {
  divisionId: string
  diaOffset: number
  mesas: number[]
}

export interface ResumenDivisionJornada {
  divisionId: string
  partidos: number
  bloques: number
  horaFin: string
  sinArbitro: number
  huecoRespetado: boolean
  pendientesRestantes: number
}

type LigaJornadas = { id: string; partidos_por_jugador_por_fecha: number | null; bloque_minutos: number | null; hora_inicio: string | null }

/** Suelta lo que una jornada tenía programado y no se jugó. */
async function liberarJornada(db: Db, fechaId: string): Promise<string | null> {
  const { error } = await db.from('liga_partidos')
    .update({ fecha_id: null, dia_offset: 0, mesa_id: null, bloque_horario: null, arbitro_id: null, estado: 'pendiente' })
    .eq('fecha_id', fechaId).not('estado', 'in', '("finalizado","walkover")').is('deleted_at', null)
  return error ? 'No se pudo liberar la jornada: ' + error.message : null
}

function validarSesiones(sesiones: SesionProyectada[]): string | null {
  if (!sesiones.length) return 'Elige al menos una división con su día y sus mesas.'
  for (const s of sesiones) if (!s.mesas.length) return 'Cada división necesita al menos una mesa.'
  // Dos divisiones no pueden compartir una mesa el mismo día.
  const ocupadas = new Set<string>()
  for (const s of sesiones) for (const m of s.mesas) {
    const clave = `${s.diaOffset}:${m}`
    if (ocupadas.has(clave)) return `La mesa ${m} está repetida entre dos divisiones el mismo día.`
    ocupadas.add(clave)
  }
  return null
}

/**
 * Arma UNA jornada: la fecha (nueva o existente sin arrancar), las mesas, la
 * sesión de cada división y sus partidos. Es lo que hace `proyectarJornada`
 * y lo que `programarLigaCompleta` repite hasta que no quede nada por jugar.
 */
async function proyectarJornadaCore(db: Db, liga: LigaJornadas, params: {
  numero: number
  fecha: string
  horaInicio: string
  sesiones: SesionProyectada[]
}): Promise<{ error?: string; resumen?: ResumenDivisionJornada[] }> {
  const errSesiones = validarSesiones(params.sesiones)
  if (errSesiones) return { error: errSesiones }

  // La jornada: existente (si no arrancó) o nueva.
  const { data: fechaExistente } = await db
    .from('liga_fechas').select('id, estado').eq('liga_id', liga.id).eq('numero', params.numero).maybeSingle()
  let fechaId: string
  if (fechaExistente) {
    if (fechaExistente.estado !== 'programada') return { error: `La jornada ${params.numero} ya está ${fechaExistente.estado}.` }
    fechaId = fechaExistente.id
    // Lo que tenía programado y no se jugó se suelta: se vuelve a repartir.
    const errLiberar = await liberarJornada(db, fechaId)
    if (errLiberar) return { error: errLiberar }
    const { error: errFecha } = await db.from('liga_fechas').update({ fecha: params.fecha }).eq('id', fechaId)
    if (errFecha) return { error: 'No se pudo actualizar la jornada: ' + errFecha.message }
  } else {
    const { data: nueva, error } = await db
      .from('liga_fechas').insert({ liga_id: liga.id, numero: params.numero, es_ajuste: false, fecha: params.fecha }).select('id').single()
    if (error || !nueva) return { error: 'No se pudo crear la jornada: ' + (error?.message ?? '') }
    fechaId = nueva.id
  }

  // Mesas que hagan falta.
  const numerosMesa = [...new Set(params.sesiones.flatMap(s => s.mesas))]
  const { data: mesasExistentes } = await db.from('liga_mesas').select('id, numero').eq('liga_id', liga.id)
  const mesaIdPorNumero = new Map<number, string>(((mesasExistentes || []) as Array<{ id: string; numero: number }>).map(m => [m.numero, m.id]))
  const mesasFaltan = numerosMesa.filter(n => !mesaIdPorNumero.has(n))
  if (mesasFaltan.length) {
    const { data: creadas, error } = await db.from('liga_mesas').insert(mesasFaltan.map(numero => ({ liga_id: liga.id, numero }))).select('id, numero')
    if (error) return { error: 'No se pudieron crear las mesas: ' + error.message }
    for (const m of (creadas || []) as Array<{ id: string; numero: number }>) mesaIdPorNumero.set(m.numero, m.id)
  }

  const resumen: ResumenDivisionJornada[] = []
  for (const s of params.sesiones) {
    const { error: errSesion } = await db.from('liga_fecha_sesiones').upsert(
      { fecha_id: fechaId, division_id: s.divisionId, dia_offset: s.diaOffset, mesas: s.mesas },
      { onConflict: 'fecha_id,division_id' },
    )
    if (errSesion) return { error: 'No se pudo guardar el día y las mesas de una división: ' + errSesion.message }

    const [{ data: miembros }, { data: pendientesRaw }] = await Promise.all([
      db.from('liga_division_jugadores').select('jugador_id').eq('division_id', s.divisionId),
      db.from('liga_partidos').select('id, jugador_a_id, jugador_b_id')
        .eq('division_id', s.divisionId).is('fecha_id', null).is('deleted_at', null)
        .not('estado', 'in', '("finalizado","walkover")').order('orden_fixture'),
    ])
    const jugadorIds = ((miembros || []) as Array<{ jugador_id: string }>).map(m => m.jugador_id)
    const pendientes: PartidoPendiente[] = ((pendientesRaw || []) as Array<{ id: string; jugador_a_id: string; jugador_b_id: string }>)
      .map(p => ({ id: p.id, jugadorAId: p.jugador_a_id, jugadorBId: p.jugador_b_id }))

    const { partidos, huecoRespetado, sinArbitro } = programarJornadaDivision({
      pendientes, jugadorIds, porJugador: liga.partidos_por_jugador_por_fecha ?? 3, mesas: s.mesas,
    })
    for (const p of partidos) {
      const { error } = await db.from('liga_partidos').update({
        fecha_id: fechaId,
        dia_offset: s.diaOffset,
        mesa_id: mesaIdPorNumero.get(p.mesa) ?? null,
        bloque_horario: horaDeBloque(p.bloque, params.horaInicio, liga.bloque_minutos ?? 30),
        arbitro_id: p.arbitroId,
        estado: 'programado',
      }).eq('id', p.id)
      if (error) return { error: 'No se pudo guardar un partido de la jornada: ' + error.message }
    }
    const bloques = partidos.length ? Math.max(...partidos.map(p => p.bloque)) + 1 : 0
    resumen.push({
      divisionId: s.divisionId,
      partidos: partidos.length,
      bloques,
      horaFin: horaDeBloque(bloques, params.horaInicio, liga.bloque_minutos ?? 30),
      sinArbitro,
      huecoRespetado,
      pendientesRestantes: pendientes.length - partidos.length,
    })
  }

  return { resumen }
}

export async function proyectarJornada(params: {
  ligaId: string
  numero: number
  /** Fecha ISO del primer día (el sábado). */
  fecha: string
  horaInicio: string
  sesiones: SesionProyectada[]
}): Promise<{ error?: string; resumen?: ResumenDivisionJornada[] }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase

  const { error: errLiga, liga } = await ligaDelClub(db, params.ligaId, clubId)
  if (errLiga) return { error: errLiga }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.fecha)) return { error: 'La fecha de la jornada va como AAAA-MM-DD.' }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(params.horaInicio)) return { error: 'La hora de inicio va como HH:MM.' }
  return proyectarJornadaCore(db, liga, params)
}

/**
 * La liga entera, como la arma Spinhouse: una jornada por fin de semana
 * hasta que cada división termine su todos contra todos. Cada división
 * repite el día y las mesas de su última jornada (o el reparto de la
 * Jornada 1: dos divisiones el sábado y dos el domingo, tres mesas cada
 * una).
 *
 * Nunca toca una jornada que ya existe —ni la que se pegó de la hoja
 * publicada ni una que ya arrancó—: parte después de la última y sigue
 * hasta que no quede nada por jugar. Para rehacer UNA jornada está
 * `proyectarJornada` desde la pantalla de jornadas.
 */
export async function programarLigaCompleta(params: {
  ligaId: string
  /** Primer sábado de la primera jornada nueva. Si ya hay jornadas, se ignora: sigue 7 días después de la última. */
  fechaInicio?: string
  horaInicio?: string
  /**
   * Rehacer: borra antes las jornadas proyectadas que no han empezado (sin
   * ningún resultado) desde este número, y las vuelve a armar. La Jornada 1
   * pegada de la hoja se protege pasando 2.
   */
  rehacerDesde?: number
}): Promise<{ error?: string; jornadas?: Array<{ numero: number; fecha: string; resumen: ResumenDivisionJornada[] }>; jornadasBorradas?: number }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase

  const { error: errLiga, liga } = await ligaDelClub(db, params.ligaId, clubId)
  if (errLiga) return { error: errLiga }
  const horaInicio = params.horaInicio ?? String(liga.hora_inicio ?? '15:00').slice(0, 5)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horaInicio)) return { error: 'La hora de inicio va como HH:MM.' }

  const [{ data: divisiones }, { data: fechasRaw }] = await Promise.all([
    db.from('liga_divisiones').select('id, orden').eq('liga_id', liga.id).order('orden'),
    db.from('liga_fechas').select('id, numero, fecha, estado').eq('liga_id', liga.id).eq('es_ajuste', false).order('numero'),
  ])
  const divs = (divisiones || []) as Array<{ id: string; orden: number }>
  let lista = (fechasRaw || []) as Array<{ id: string; numero: number; fecha: string | null; estado: string }>

  // Rehacer: solo jornadas que siguen "programada" y sin un solo resultado.
  let jornadasBorradas = 0
  if (params.rehacerDesde && params.rehacerDesde >= 1) {
    for (const f of lista.filter(f => f.numero >= params.rehacerDesde!)) {
      if (f.estado !== 'programada') return { error: `La jornada ${f.numero} ya está ${f.estado}; no se puede rehacer desde ahí.` }
      const { count } = await db.from('liga_partidos').select('id', { count: 'exact', head: true })
        .eq('fecha_id', f.id).is('deleted_at', null).in('estado', ['finalizado', 'walkover'])
      if ((count ?? 0) > 0) return { error: `La jornada ${f.numero} ya tiene resultados; no se puede rehacer desde ahí.` }
    }
    for (const f of lista.filter(f => f.numero >= params.rehacerDesde!)) {
      const errLiberar = await liberarJornada(db, f.id)
      if (errLiberar) return { error: errLiberar }
      // Las sesiones caen en cascada con la fecha (migración 272).
      const { error } = await db.from('liga_fechas').delete().eq('id', f.id)
      if (error) return { error: 'No se pudo borrar la jornada ' + f.numero + ': ' + error.message }
      jornadasBorradas++
    }
    lista = lista.filter(f => f.numero < params.rehacerDesde!)
  }

  // De dónde parte: después de la última jornada que existe.
  const ultima = lista[lista.length - 1] ?? null
  let numero = (ultima?.numero ?? 0) + 1
  let fecha: string
  if (ultima?.fecha) fecha = sumarDias(ultima.fecha, 7)
  else if (params.fechaInicio && /^\d{4}-\d{2}-\d{2}$/.test(params.fechaInicio)) fecha = params.fechaInicio
  else return { error: 'Falta la fecha del primer sábado (AAAA-MM-DD).' }

  // El reparto de cada división: su última sesión, o el de la Jornada 1.
  const sesionPorDivision = new Map<string, { diaOffset: number; mesas: number[] }>()
  if (lista.length) {
    const { data: sesiones } = await db
      .from('liga_fecha_sesiones').select('division_id, dia_offset, mesas, liga_fechas!inner(numero)')
      .in('fecha_id', lista.map(f => f.id))
    const filas = (sesiones || []) as Array<{ division_id: string; dia_offset: number; mesas: number[]; liga_fechas: { numero: number } | Array<{ numero: number }> }>
    const numeroDe = (x: typeof filas[number]['liga_fechas']) => (Array.isArray(x) ? x[0]?.numero : x?.numero) ?? 0
    for (const s of filas.sort((a, b) => numeroDe(a.liga_fechas) - numeroDe(b.liga_fechas))) {
      sesionPorDivision.set(s.division_id, { diaOffset: s.dia_offset, mesas: s.mesas })
    }
  }
  const sinSesion = divs.filter(d => !sesionPorDivision.has(d.id))
  sinSesion.forEach((d, i) => {
    const mesasPorDivision = 3
    const posEnDia = i % 2
    const desde = posEnDia * mesasPorDivision + 1
    sesionPorDivision.set(d.id, { diaOffset: Math.floor(i / 2) % 2, mesas: Array.from({ length: mesasPorDivision }, (_, k) => desde + k) })
  })

  const pendientesDe = async (divisionId: string) => {
    const { count } = await db.from('liga_partidos').select('id', { count: 'exact', head: true })
      .eq('division_id', divisionId).is('fecha_id', null).is('deleted_at', null)
      .not('estado', 'in', '("finalizado","walkover")')
    return count ?? 0
  }

  const jornadas: NonNullable<Awaited<ReturnType<typeof programarLigaCompleta>>['jornadas']> = []
  const TOPE = 40
  for (let i = 0; i < TOPE; i++) {
    const sesiones: SesionProyectada[] = []
    for (const d of divs) {
      if ((await pendientesDe(d.id)) === 0) continue
      const s = sesionPorDivision.get(d.id)!
      sesiones.push({ divisionId: d.id, diaOffset: s.diaOffset, mesas: s.mesas })
    }
    if (!sesiones.length) break
    const res = await proyectarJornadaCore(db, liga, { numero, fecha, horaInicio, sesiones })
    if (res.error) return { error: `Jornada ${numero}: ${res.error}`, jornadas }
    const programados = (res.resumen ?? []).reduce((t, r) => t + r.partidos, 0)
    if (!programados) return { error: `La jornada ${numero} no pudo programar ningún partido; revisa que cada división tenga al menos dos jugadores.`, jornadas }
    jornadas.push({ numero, fecha, resumen: res.resumen ?? [] })
    numero++
    fecha = sumarDias(fecha, 7)
  }
  if (!jornadas.length) return { error: 'No queda ningún partido por programar: todas las divisiones ya tienen su liga completa.' }

  return { jornadas, jornadasBorradas }
}

/**
 * Después de marcar un resultado en modo jornadas: la liga pasa a "en
 * curso" con el primer partido jugado, y la jornada queda "finalizada"
 * cuando no le queda ningún partido abierto. Sin botones de iniciar o
 * terminar fecha: eso es del modo mesa_unica.
 */
export async function actualizarEstadosJornada(params: { partidoId: string }): Promise<{ error?: string; jornadaTerminada?: boolean }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase

  const { data: partido } = await db.from('liga_partidos').select('liga_id, fecha_id').eq('id', params.partidoId).maybeSingle()
  if (!partido) return { error: 'Partido no encontrado' }
  const { error: errLiga } = await ligaDelClub(db, partido.liga_id, clubId)
  if (errLiga) return { error: errLiga }

  const { error: errEstado } = await db.from('ligas').update({ estado: 'en_curso' }).eq('id', partido.liga_id).eq('estado', 'planificacion')
  if (errEstado) return { error: 'No se pudo poner la liga en curso: ' + errEstado.message }
  if (!partido.fecha_id) return { jornadaTerminada: false }

  const { count } = await db.from('liga_partidos').select('id', { count: 'exact', head: true })
    .eq('fecha_id', partido.fecha_id).is('deleted_at', null).not('estado', 'in', '("finalizado","walkover")')
  const abiertos = count ?? 0
  const { error } = await db.from('liga_fechas').update({ estado: abiertos === 0 ? 'finalizada' : 'en_juego' })
    .eq('id', partido.fecha_id).neq('estado', abiertos === 0 ? 'finalizada' : 'en_juego')
  if (error) return { error: 'No se pudo actualizar la jornada: ' + error.message }
  return { jornadaTerminada: abiertos === 0 }
}

/** El pie de la hoja de programación (reglas, contacto). Texto libre del club. */
export async function guardarPieProgramacion(params: { ligaId: string; pie: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase
  const { error: errLiga } = await ligaDelClub(db, params.ligaId, clubId)
  if (errLiga) return { error: errLiga }
  const pie = params.pie.trim().slice(0, 600) || null
  const { error } = await db.from('ligas').update({ pie_programacion: pie }).eq('id', params.ligaId)
  if (error) return { error: 'No se pudo guardar el pie: ' + error.message }
  return { success: true }
}

/** La jornada tal como se imprime: por día, división, hora y mesa. */
export async function leerJornada(params: { ligaId: string; numero: number }): Promise<{ error?: string; jornada?: {
  numero: number
  fecha: string | null
  estado: string
  dias: Array<{
    diaOffset: number
    fecha: string | null
    divisiones: Array<{
      divisionId: string
      nombre: string
      mesas: number[]
      partidos: Array<{ id: string; hora: string; mesa: number; jugadorA: string; jugadorB: string; arbitro: string | null; estado: string; setsA: number | null; setsB: number | null; parciales: Array<[number, number]> | null }>
    }>
  }>
} }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase

  const { data: fecha } = await db
    .from('liga_fechas').select('id, numero, fecha, estado, ligas!inner(club_id)')
    .eq('liga_id', params.ligaId).eq('numero', params.numero).maybeSingle()
  if (!fecha) return { error: 'Jornada no encontrada' }

  const [{ data: sesiones }, { data: partidos }, { data: divisiones }, { data: mesas }] = await Promise.all([
    db.from('liga_fecha_sesiones').select('division_id, dia_offset, mesas').eq('fecha_id', fecha.id),
    db.from('liga_partidos')
      .select('id, division_id, dia_offset, bloque_horario, mesa_id, arbitro_id, estado, sets_a, sets_b, parciales, ja:jugador_a_id(nombre), jb:jugador_b_id(nombre), arb:arbitro_id(nombre)')
      .eq('fecha_id', fecha.id).is('deleted_at', null),
    db.from('liga_divisiones').select('id, nombre, orden').eq('liga_id', params.ligaId).order('orden'),
    db.from('liga_mesas').select('id, numero').eq('liga_id', params.ligaId),
  ])
  const numeroDeMesa = new Map<string, number>(((mesas || []) as Array<{ id: string; numero: number }>).map(m => [m.id, m.numero]))
  const nombreDivision = new Map<string, string>(((divisiones || []) as Array<{ id: string; nombre: string }>).map(d => [d.id, d.nombre]))
  const nombre = (x: unknown) => (Array.isArray(x) ? (x[0] as Fila | undefined)?.nombre : (x as Fila | null)?.nombre) as string | undefined

  const porDia = new Map<number, Map<string, { mesas: number[]; partidos: Fila[] }>>()
  for (const s of (sesiones || []) as Array<{ division_id: string; dia_offset: number; mesas: number[] }>) {
    const dia = porDia.get(s.dia_offset) ?? new Map()
    dia.set(s.division_id, { mesas: s.mesas, partidos: [] })
    porDia.set(s.dia_offset, dia)
  }
  for (const p of (partidos || []) as Fila[]) {
    // El partido lleva puesto su día (migración 275). Si la división no tiene
    // sesión declarada ese día, se muestra igual, sin rango de mesas.
    const divId = p.division_id as string
    const diaOffset = Number(p.dia_offset ?? 0)
    const dia = porDia.get(diaOffset) ?? new Map()
    const d = dia.get(divId) ?? { mesas: [], partidos: [] }
    d.partidos.push(p)
    dia.set(divId, d)
    porDia.set(diaOffset, dia)
  }

  const ordenDivision = new Map<string, number>(((divisiones || []) as Array<{ id: string; orden: number }>).map(d => [d.id, d.orden]))
  const dias = [...porDia.entries()].sort((a, b) => a[0] - b[0]).map(([diaOffset, divs]) => ({
    diaOffset,
    fecha: fecha.fecha ? sumarDias(fecha.fecha, diaOffset) : null,
    divisiones: [...divs.entries()]
      .sort((a, b) => (ordenDivision.get(a[0]) ?? 0) - (ordenDivision.get(b[0]) ?? 0))
      .map(([divisionId, d]) => ({
        divisionId,
        nombre: nombreDivision.get(divisionId) ?? '',
        mesas: d.mesas,
        partidos: d.partidos
          .map(p => ({
            id: p.id as string,
            hora: String(p.bloque_horario ?? '').slice(0, 5),
            mesa: numeroDeMesa.get(p.mesa_id as string) ?? 0,
            jugadorA: nombre(p.ja) ?? '',
            jugadorB: nombre(p.jb) ?? '',
            arbitro: nombre(p.arb) ?? null,
            estado: p.estado as string,
            setsA: (p.sets_a as number | null) ?? null,
            setsB: (p.sets_b as number | null) ?? null,
            parciales: Array.isArray(p.parciales) ? (p.parciales as Array<[number, number]>) : null,
          }))
          .sort((a, b) => a.hora.localeCompare(b.hora) || a.mesa - b.mesa),
      })),
  }))

  return { jornada: { numero: fecha.numero, fecha: fecha.fecha, estado: fecha.estado, dias } }
}
