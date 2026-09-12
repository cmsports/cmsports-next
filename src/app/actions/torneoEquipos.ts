'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { modalidadDe } from '@/lib/domain/modalidadTorneo'
import { generarRoundRobin } from '@/lib/domain/torneos'
import { resumirPartido } from '@/lib/domain/marcador'
import {
  generarPartidosDelEncuentro,
  minJugadoresPorEquipo,
  resultadoEncuentro,
  sistemaDe,
  validarAlineacion,
  type Alineacion,
  type SistemaEquipos,
} from '@/lib/domain/torneoEquipos'

// Torneos por equipos (modalidad `equipos`, migración 266): Swaythling o
// Corbillon, todos contra todos entre los equipos.
//
//   · Los jugadores se inscriben en el torneo como siempre (la MESA). De ahí
//     se arman los equipos, con nombre y club de procedencia opcional; pueden
//     ser mixtos.
//   · "Generar encuentros" arma el todos contra todos entre equipos
//     (`torneo_encuentros`, fase 'grupos', un orden por encuentro).
//   · Cada encuentro se arma declarando las dos alineaciones, y de ahí salen
//     sus cinco partidos en `torneo_partidos` (fase 'grupos', orden
//     1000 + encuentro×10 + número, para no chocar con nada).
//   · El resultado de cada partido va set a set; el encuentro se cierra solo
//     apenas un equipo llega a 3, y los partidos que sobran no se juegan.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const MAX_JUGADORES_POR_EQUIPO = 5

async function torneoDeEquipos(db: Db, torneoId: string, clubId: string) {
  const { data: t } = await db
    .from('torneos').select('id, club_id, formato, sistema_equipos, fase, estado, nombre')
    .eq('id', torneoId).maybeSingle()
  if (!t || t.club_id !== clubId) return { error: 'Torneo no encontrado' as const, torneo: null }
  if (modalidadDe(t.formato) !== 'equipos') return { error: 'Este torneo no es por equipos.' as const, torneo: null }
  return { error: null, torneo: { ...t, sistema: sistemaDe(t.sistema_equipos) as SistemaEquipos } }
}

async function hayEncuentros(db: Db, torneoId: string): Promise<boolean> {
  const { count } = await db.from('torneo_encuentros').select('id', { count: 'exact', head: true }).eq('torneo_id', torneoId)
  return (count ?? 0) > 0
}

/** Los inscritos del torneo: la MESA, igual que en las otras modalidades. */
async function inscritosDelTorneo(db: Db, torneoId: string): Promise<Set<string>> {
  const { data: mesa } = await db.from('torneo_grupos').select('id').eq('torneo_id', torneoId).eq('nombre', 'MESA').maybeSingle()
  if (!mesa) return new Set()
  const { data } = await db.from('grupo_jugadores').select('jugador_id').eq('grupo_id', mesa.id)
  return new Set(((data || []) as Array<{ jugador_id: string }>).map(r => r.jugador_id))
}

/** Crea o edita un equipo con su plantel. El plantel se puede tocar hasta que se generen los encuentros. */
export async function guardarEquipo(params: {
  torneoId: string
  equipoId?: string
  nombre: string
  clubProcedencia?: string | null
  jugadorIds: string[]
}): Promise<{ error?: string; equipoId?: string }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase
  const { error: errT, torneo } = await torneoDeEquipos(db, params.torneoId, clubId)
  if (errT) return { error: errT }

  const nombre = params.nombre.trim().slice(0, 60)
  if (!nombre) return { error: 'El equipo necesita un nombre.' }
  const ids = [...new Set(params.jugadorIds.filter(Boolean))]
  const min = minJugadoresPorEquipo(torneo.sistema)
  if (ids.length < min) return { error: `Un equipo ${torneo.sistema === 'swaythling' ? 'Swaythling' : 'Corbillon'} necesita al menos ${min} jugadores.` }
  if (ids.length > MAX_JUGADORES_POR_EQUIPO) return { error: `Un equipo lleva como máximo ${MAX_JUGADORES_POR_EQUIPO} jugadores.` }

  const inscritos = await inscritosDelTorneo(db, torneo.id)
  const noInscritos = ids.filter(id => !inscritos.has(id))
  if (noInscritos.length) return { error: 'Hay jugadores que no están inscritos en el torneo. Inscríbelos primero en la mesa.' }

  if (await hayEncuentros(db, torneo.id)) {
    return { error: 'Los encuentros ya están armados: el plantel no se puede cambiar. Si hace falta, borra los encuentros y vuelve a generarlos.' }
  }

  // Nadie en dos equipos.
  const { data: otros } = await db
    .from('torneo_equipo_jugadores').select('jugador_id, equipo_id, torneo_equipos!inner(torneo_id)')
    .eq('torneo_equipos.torneo_id', torneo.id)
  const repetidos = ((otros || []) as Array<{ jugador_id: string; equipo_id: string }>)
    .filter(r => r.equipo_id !== params.equipoId && ids.includes(r.jugador_id))
  if (repetidos.length) return { error: 'Un jugador ya está en otro equipo de este torneo.' }

  let equipoId = params.equipoId
  if (equipoId) {
    const { error } = await db.from('torneo_equipos').update({ nombre, club_procedencia: params.clubProcedencia?.trim() || null })
      .eq('id', equipoId).eq('torneo_id', torneo.id)
    if (error) return { error: 'No se pudo guardar el equipo: ' + error.message }
    const { error: errBorrar } = await db.from('torneo_equipo_jugadores').delete().eq('equipo_id', equipoId)
    if (errBorrar) return { error: 'No se pudo actualizar el plantel: ' + errBorrar.message }
  } else {
    const { count } = await db.from('torneo_equipos').select('id', { count: 'exact', head: true }).eq('torneo_id', torneo.id)
    const { data: nuevo, error } = await db
      .from('torneo_equipos').insert({ torneo_id: torneo.id, nombre, club_procedencia: params.clubProcedencia?.trim() || null, orden: count ?? 0 })
      .select('id').single()
    if (error || !nuevo) return { error: error?.code === '23505' ? 'Ya hay un equipo con ese nombre.' : 'No se pudo crear el equipo: ' + (error?.message ?? '') }
    equipoId = nuevo.id as string
  }
  const { error: errPlantel } = await db
    .from('torneo_equipo_jugadores').insert(ids.map((jugador_id, orden) => ({ equipo_id: equipoId, jugador_id, orden })))
  if (errPlantel) return { error: 'No se pudo guardar el plantel: ' + errPlantel.message }
  return { equipoId }
}

export async function eliminarEquipo(params: { torneoId: string; equipoId: string }): Promise<{ error?: string; success?: true }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase
  const { error: errT, torneo } = await torneoDeEquipos(db, params.torneoId, clubId)
  if (errT) return { error: errT }
  if (await hayEncuentros(db, torneo.id)) return { error: 'Los encuentros ya están armados: no se puede borrar un equipo.' }
  const { error } = await db.from('torneo_equipos').delete().eq('id', params.equipoId).eq('torneo_id', torneo.id)
  if (error) return { error: 'No se pudo borrar el equipo: ' + error.message }
  return { success: true }
}

/** El todos contra todos entre los equipos. Cierra la inscripción del torneo. */
export async function generarEncuentros(params: { torneoId: string }): Promise<{ error?: string; encuentros?: number }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase
  const { error: errT, torneo } = await torneoDeEquipos(db, params.torneoId, clubId)
  if (errT) return { error: errT }
  if (await hayEncuentros(db, torneo.id)) return { error: 'Los encuentros ya están generados.' }

  const { data: equipos } = await db.from('torneo_equipos').select('id, nombre, orden').eq('torneo_id', torneo.id).order('orden')
  const lista = (equipos || []) as Array<{ id: string; nombre: string }>
  if (lista.length < 2) return { error: 'Hacen falta al menos dos equipos.' }
  const { data: planteles } = await db.from('torneo_equipo_jugadores').select('equipo_id').in('equipo_id', lista.map(e => e.id))
  const min = minJugadoresPorEquipo(torneo.sistema)
  for (const e of lista) {
    const n = ((planteles || []) as Array<{ equipo_id: string }>).filter(p => p.equipo_id === e.id).length
    if (n < min) return { error: `El equipo "${e.nombre}" tiene ${n} jugador${n === 1 ? '' : 'es'} y necesita ${min}.` }
  }

  const cruces = generarRoundRobin(lista.map(e => e.id))
  const { error } = await db.from('torneo_encuentros').insert(cruces.map(([a, b]: [string, string], i: number) => ({
    torneo_id: torneo.id, fase: 'grupos', orden: i + 1, equipo_a_id: a, equipo_b_id: b, sistema: torneo.sistema,
  })))
  if (error) return { error: 'No se pudieron crear los encuentros: ' + error.message }

  // La inscripción queda cerrada: el torneo pasa a "grupos", que es la fase
  // en que se juega el todos contra todos.
  const { error: errFase } = await db.from('torneos').update({ fase: 'grupos', estado: 'en_curso' }).eq('id', torneo.id)
  if (errFase) return { error: 'Los encuentros se crearon pero no se pudo cerrar la inscripción: ' + errFase.message }
  return { encuentros: cruces.length }
}

/** Borra todos los encuentros (y sus partidos), solo si no hay ningún resultado cargado. Vuelve a inscripción. */
export async function borrarEncuentros(params: { torneoId: string }): Promise<{ error?: string; success?: true }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase
  const { error: errT, torneo } = await torneoDeEquipos(db, params.torneoId, clubId)
  if (errT) return { error: errT }
  const { count } = await db.from('torneo_partidos').select('id', { count: 'exact', head: true })
    .eq('torneo_id', torneo.id).not('encuentro_id', 'is', null).not('ganador', 'is', null)
  if ((count ?? 0) > 0) return { error: 'Ya hay resultados cargados: no se pueden borrar los encuentros.' }
  // Los partidos caen en cascada con el encuentro (migración 266).
  const { error } = await db.from('torneo_encuentros').delete().eq('torneo_id', torneo.id)
  if (error) return { error: 'No se pudieron borrar los encuentros: ' + error.message }
  const { error: errFase } = await db.from('torneos').update({ fase: 'inscripcion' }).eq('id', torneo.id)
  if (errFase) return { error: 'No se pudo reabrir la inscripción: ' + errFase.message }
  return { success: true }
}

/**
 * Declara las dos alineaciones de un encuentro y genera sus cinco partidos.
 * Se puede rearmar mientras ningún partido tenga resultado.
 */
export async function armarEncuentro(params: {
  torneoId: string
  encuentroId: string
  alineacionA: Alineacion
  alineacionB: Alineacion
}): Promise<{ error?: string; success?: true }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase
  const { error: errT, torneo } = await torneoDeEquipos(db, params.torneoId, clubId)
  if (errT) return { error: errT }

  const { data: enc } = await db.from('torneo_encuentros').select('id, orden, equipo_a_id, equipo_b_id, sistema')
    .eq('id', params.encuentroId).eq('torneo_id', torneo.id).maybeSingle()
  if (!enc) return { error: 'Encuentro no encontrado' }
  const sistema = sistemaDe(enc.sistema)

  const errA = validarAlineacion(sistema, params.alineacionA, 'a')
  if (errA) return { error: `Equipo A: ${errA.motivo}` }
  const errB = validarAlineacion(sistema, params.alineacionB, 'b')
  if (errB) return { error: `Equipo B: ${errB.motivo}` }

  // Cada persona tiene que ser de su equipo.
  const { data: planteles } = await db.from('torneo_equipo_jugadores').select('equipo_id, jugador_id').in('equipo_id', [enc.equipo_a_id, enc.equipo_b_id])
  const de = (equipoId: string) => new Set(((planteles || []) as Array<{ equipo_id: string; jugador_id: string }>).filter(p => p.equipo_id === equipoId).map(p => p.jugador_id))
  const plantelA = de(enc.equipo_a_id), plantelB = de(enc.equipo_b_id)
  const todosA = [...params.alineacionA.individuales, ...(params.alineacionA.dobles ?? [])]
  const todosB = [...params.alineacionB.individuales, ...(params.alineacionB.dobles ?? [])]
  if (todosA.some(id => !plantelA.has(id))) return { error: 'Equipo A: hay alguien que no es del plantel.' }
  if (todosB.some(id => !plantelB.has(id))) return { error: 'Equipo B: hay alguien que no es del plantel.' }

  // Rearmar solo si no hay resultados.
  const { data: existentes } = await db.from('torneo_partidos').select('id, ganador').eq('encuentro_id', enc.id)
  if (((existentes || []) as Array<{ ganador: string | null }>).some(p => p.ganador)) {
    return { error: 'Este encuentro ya tiene resultados: la alineación no se puede cambiar.' }
  }
  if ((existentes || []).length) {
    const { error } = await db.from('torneo_partidos').delete().eq('encuentro_id', enc.id)
    if (error) return { error: 'No se pudo rearmar el encuentro: ' + error.message }
  }

  const partidos = generarPartidosDelEncuentro(sistema, params.alineacionA, params.alineacionB)
  const { error } = await db.from('torneo_partidos').insert(partidos.map(p => ({
    torneo_id: torneo.id,
    fase: 'grupos',
    orden: 1000 + enc.orden * 10 + p.numero,
    encuentro_id: enc.id,
    numero_en_encuentro: p.numero,
    jugador_a: p.jugadoresA[0] ?? null,
    jugador_b: p.jugadoresB[0] ?? null,
    jugador_a2: p.tipo === 'dobles' ? p.jugadoresA[1] ?? null : null,
    jugador_b2: p.tipo === 'dobles' ? p.jugadoresB[1] ?? null : null,
  })))
  if (error) return { error: 'No se pudieron crear los partidos del encuentro: ' + error.message }
  return { success: true }
}

/**
 * El resultado de un partido del encuentro, set a set. Después recalcula el
 * encuentro: apenas un equipo llega a 3 queda como ganador. Sirve también
 * para corregir (vuelve a evaluar el encuentro con el nuevo resultado).
 */
export async function marcarPartidoDeEncuentro(params: {
  torneoId: string
  partidoId: string
  parciales: Array<[number, number]>
}): Promise<{ error?: string; encuentroTerminado?: boolean }> {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !clubId) return { error: authErr ?? 'Sin club' }
  const db: Db = supabase
  const { error: errT, torneo } = await torneoDeEquipos(db, params.torneoId, clubId)
  if (errT) return { error: errT }

  const { data: partido } = await db.from('torneo_partidos')
    .select('id, encuentro_id, numero_en_encuentro, jugador_a, jugador_b')
    .eq('id', params.partidoId).eq('torneo_id', torneo.id).maybeSingle()
  if (!partido || !partido.encuentro_id) return { error: 'Partido no encontrado' }
  if (!partido.jugador_a || !partido.jugador_b) return { error: 'Este partido no tiene los dos lados armados.' }

  const pares: Array<[number, number]> = []
  for (const set of params.parciales ?? []) {
    if (!Array.isArray(set) || set.length !== 2 || typeof set[0] !== 'number' || typeof set[1] !== 'number') return { error: 'Parciales inválidos.' }
    pares.push([set[0], set[1]])
  }
  const resumen = resumirPartido(pares, 'bo5')
  if (!resumen) return { error: 'Parciales inválidos. Cada set se gana a 11 con dos de ventaja, y el partido termina al llegar a 3 sets.' }

  const { data: enc } = await db.from('torneo_encuentros').select('id, equipo_a_id, equipo_b_id').eq('id', partido.encuentro_id).maybeSingle()
  if (!enc) return { error: 'Encuentro no encontrado' }

  // ¿Hacía falta jugar este partido? Si el encuentro ya estaba definido antes
  // de él, no se acepta un resultado (sería inventar un partido que no se juega).
  const { data: hermanos } = await db.from('torneo_partidos').select('id, numero_en_encuentro, ganador, jugador_a, jugador_b').eq('encuentro_id', enc.id)
  const lista = (hermanos || []) as Array<{ id: string; numero_en_encuentro: number; ganador: string | null; jugador_a: string | null; jugador_b: string | null }>
  const ladoDe = (p: { ganador: string | null; jugador_a: string | null; jugador_b: string | null }): 'a' | 'b' | null =>
    !p.ganador ? null : p.ganador === p.jugador_a ? 'a' : p.ganador === p.jugador_b ? 'b' : null
  const antes = resultadoEncuentro(lista.map(p => ({ numero: p.numero_en_encuentro, ganador: p.id === partido.id ? null : ladoDe(p) })))
  if (antes.noSeJuegan.includes(partido.numero_en_encuentro)) {
    return { error: 'Este partido ya no se juega: el encuentro quedó definido antes.' }
  }

  const ganador = resumen.setsA > resumen.setsB ? partido.jugador_a : partido.jugador_b
  const { error } = await db.from('torneo_partidos').update({
    ganador, sets_a: resumen.setsA, sets_b: resumen.setsB, puntos_a: resumen.puntosA, puntos_b: resumen.puntosB,
  }).eq('id', partido.id)
  if (error) return { error: 'No se pudo guardar el resultado: ' + error.message }

  // El encuentro, con este resultado puesto.
  const despues = resultadoEncuentro(lista.map(p => ({
    numero: p.numero_en_encuentro,
    ganador: p.id === partido.id ? (ganador === partido.jugador_a ? 'a' : 'b') : ladoDe(p),
  })))
  const ganadorEquipo = despues.ganador === 'a' ? enc.equipo_a_id : despues.ganador === 'b' ? enc.equipo_b_id : null
  const { error: errEnc } = await db.from('torneo_encuentros').update({ ganador_equipo_id: ganadorEquipo }).eq('id', enc.id)
  if (errEnc) return { error: 'El partido quedó guardado pero no se pudo cerrar el encuentro: ' + errEnc.message }
  return { encuentroTerminado: despues.terminado }
}
