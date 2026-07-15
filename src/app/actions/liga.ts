'use server'

import {
  generarFixtureDivision,
  generarBloquesHorario,
  programarDivision,
  asignarArbitrosEficiente,
  validarMovimientoPartido,
  normalizarBloque,
  esResultadoBo5Valido,
  determinarGanadorBo5,
  calcularDiffDivision,
  BLOQUE_INICIO,
  BLOQUE_FIN,
  type DiffDivision,
  type PartidoAProgramar,
  type PartidoProgramado,
  type PartidoExistente,
} from '@/lib/domain/liga'
import { requireAdminClub } from '@/lib/auth/require'

// Calcula el diff de cambiar jugadores en una división con fixture ya generado.
// No modifica la BD — solo devuelve qué cambiaría para mostrar en el modal de
// confirmación antes de aplicar los cambios.
export async function calcularDiffFixtureDivision(params: {
  divisionId: string
  nuevosJugadorIds: string[]
}): Promise<{ error: string; data: null } | { error: null; data: DiffDivision }> {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr, data: null }

  const { divisionId, nuevosJugadorIds } = params
  const db = supabase as any

  const { data: actualesRows } = await supabase
    .from('liga_division_jugadores')
    .select('jugador_id')
    .eq('division_id', divisionId)
  const actuales = (actualesRows || []).map((r: { jugador_id: string }) => r.jugador_id)

  // Intentar con filtro deleted_at (requiere migración 016). Si la columna no
  // existe aún, Supabase devuelve error y hacemos fallback sin filtro.
  const { data: conFiltro, error: errFiltro } = await db
    .from('liga_partidos')
    .select('jugador_a_id, jugador_b_id, estado')
    .eq('division_id', divisionId)
    .is('deleted_at', null)

  let partidosRows: Array<{ jugador_a_id: string; jugador_b_id: string; estado: string }> = []
  if (!errFiltro) {
    partidosRows = conFiltro || []
  } else {
    const { data: sinFiltro } = await supabase
      .from('liga_partidos')
      .select('jugador_a_id, jugador_b_id, estado')
      .eq('division_id', divisionId)
    partidosRows = sinFiltro || []
  }

  const partidosActivos = partidosRows.map(p => ({
    jugadorAId: p.jugador_a_id,
    jugadorBId: p.jugador_b_id,
    jugado: ['finalizado', 'walkover'].includes(p.estado),
  }))

  const diff = calcularDiffDivision(actuales, nuevosJugadorIds, partidosActivos)
  return { error: null, data: diff }
}

// Asigna la lista de jugadores de una división de forma incremental:
// - Preserva partidos ya jugados aunque un jugador sea removido (soft delete)
// - Anula partidos no jugados de jugadores removidos
// - Crea partidos nuevos para pares que no existen todavía
// - No borra ni regenera el fixture completo
export async function asignarJugadoresDivision(params: {
  divisionId: string
  jugadorIds: string[]
  regenerarFixture?: boolean  // mantenido por compatibilidad, ya no se usa destructivamente
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { divisionId, jugadorIds } = params
  const nuevosIds = Array.from(new Set(jugadorIds))
  if (nuevosIds.length < 2) return { error: 'Una división necesita al menos 2 jugadores' }

  const { data: division } = await supabase
    .from('liga_divisiones')
    .select('id, liga_id, fixture_generado')
    .eq('id', divisionId)
    .single()
  if (!division) return { error: 'División no encontrada' }

  const db = supabase as any

  // Estado actual de jugadores
  const { data: actualesRows } = await supabase
    .from('liga_division_jugadores')
    .select('jugador_id')
    .eq('division_id', divisionId)
  const actuales = (actualesRows || []).map((r: { jugador_id: string }) => r.jugador_id)

  const jugadoresAgregados = nuevosIds.filter(id => !actuales.includes(id))
  const jugadoresRemovidos = actuales.filter(id => !nuevosIds.includes(id))

  // Actualizar liga_division_jugadores (solo los que cambian)
  if (jugadoresRemovidos.length > 0) {
    await supabase
      .from('liga_division_jugadores')
      .delete()
      .eq('division_id', divisionId)
      .in('jugador_id', jugadoresRemovidos)
  }
  if (jugadoresAgregados.length > 0) {
    await supabase.from('liga_division_jugadores').insert(
      jugadoresAgregados.map(jugadorId => ({ division_id: divisionId, jugador_id: jugadorId })),
    )
  }

  // Si el fixture aún no fue generado, solo guardamos los jugadores.
  // Los partidos los crea generarFixtureDivisionAction cuando el admin lo pida.
  if (!division.fixture_generado) {
    return {
      success: true,
      totalJugadores: nuevosIds.length,
      jugadoresAgregados: jugadoresAgregados.length,
      jugadoresRemovidos: jugadoresRemovidos.length,
      partidosCreados: 0,
      partidosAnulados: 0,
    }
  }

  // Fixture ya generado — aplicar diff incremental sobre los partidos existentes
  const { data: conFiltro, error: errFiltro } = await db
    .from('liga_partidos')
    .select('id, jugador_a_id, jugador_b_id, estado')
    .eq('division_id', divisionId)
    .is('deleted_at', null)

  let allPartidos: Array<{ id: string; jugador_a_id: string; jugador_b_id: string; estado: string }> = []
  if (!errFiltro) {
    allPartidos = conFiltro || []
  } else {
    const { data: sinFiltro } = await supabase
      .from('liga_partidos')
      .select('id, jugador_a_id, jugador_b_id, estado')
      .eq('division_id', divisionId)
    allPartidos = sinFiltro || []
  }

  const { partidosNuevos, partidosAAnular } = calcularDiffDivision(
    actuales,
    nuevosIds,
    allPartidos.map(p => ({
      jugadorAId: p.jugador_a_id,
      jugadorBId: p.jugador_b_id,
      jugado: ['finalizado', 'walkover'].includes(p.estado),
    })),
  )

  // Anular partidos no jugados de jugadores removidos
  for (const { a, b } of partidosAAnular) {
    const partido = allPartidos.find(
      p => (p.jugador_a_id === a && p.jugador_b_id === b) || (p.jugador_a_id === b && p.jugador_b_id === a),
    )
    if (!partido) continue
    const { error: errSoft } = await db
      .from('liga_partidos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', partido.id)
    if (errSoft) {
      await supabase.from('liga_partidos').delete().eq('id', partido.id)
    }
  }

  // Crear partidos nuevos para pares que no existían
  if (partidosNuevos.length > 0) {
    await supabase.from('liga_partidos').insert(
      partidosNuevos.map(({ a, b }, idx) => ({
        liga_id: division.liga_id,
        division_id: divisionId,
        jugador_a_id: a,
        jugador_b_id: b,
        orden_fixture: allPartidos.length + idx,
      })),
    )
  }

  // Mantener fixture_generado = true si quedan partidos activos
  const hayPartidos = allPartidos.length - partidosAAnular.length + partidosNuevos.length > 0
  if (!hayPartidos) {
    await supabase.from('liga_divisiones').update({ fixture_generado: false }).eq('id', divisionId)
  }

  return {
    success: true,
    totalJugadores: nuevosIds.length,
    jugadoresAgregados: jugadoresAgregados.length,
    jugadoresRemovidos: jugadoresRemovidos.length,
    partidosCreados: partidosNuevos.length,
    partidosAnulados: partidosAAnular.length,
  }
}

export async function generarFixtureDivisionAction(params: { divisionId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { divisionId } = params

  const { data: division } = await supabase.from('liga_divisiones').select('id, liga_id, fixture_generado').eq('id', divisionId).single()
  if (!division) return { error: 'División no encontrada' }
  if (division.fixture_generado) return { error: 'El fixture ya fue generado para esta división' }

  const { data: asignados } = await supabase.from('liga_division_jugadores').select('jugador_id').eq('division_id', divisionId)
  const jugadorIds = (asignados || []).map(a => a.jugador_id)

  if (jugadorIds.length < 2) return { error: 'Se necesitan al menos 2 jugadores confirmados para generar el fixture' }

  const fixture = generarFixtureDivision(jugadorIds)
  const inserts = fixture.map(p => ({
    liga_id: division.liga_id,
    division_id: divisionId,
    jugador_a_id: p.jugadorA,
    jugador_b_id: p.jugadorB,
    orden_fixture: p.orden,
  }))

  const { error: insertError } = await supabase.from('liga_partidos').insert(inserts)
  if (insertError) return { error: 'No se pudo generar el fixture: ' + insertError.message }

  await supabase.from('liga_divisiones').update({ fixture_generado: true }).eq('id', divisionId)

  return { success: true, totalPartidos: inserts.length }
}

// Motor de programación (F3): toma todos los partidos sin fecha asignada de la
// liga y les asigna fecha (1 a N-1), mesa y bloque horario + árbitro.
// La última fecha (es_ajuste=true) se reserva para incidencias.
// Usa bloque_minutos y total_fechas de la config de la liga (configurable).
export async function generarProgramacionLiga(params: { ligaId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { ligaId } = params
  const db = supabase as any

  // Fetch reajuste id primero (necesario para la 2da query paralela)
  const { data: fechaAjusteInfo } = await supabase
    .from('liga_fechas').select('id').eq('liga_id', ligaId).eq('es_ajuste', true).single()
  const fechaAjusteId = fechaAjusteInfo?.id ?? null

  // 5 queries en paralelo: config + fechas + mesas + sin-fecha + sinAsignar-en-reajuste
  // Se recogen partidos pendientes de DOS fuentes:
  //   1. fecha_id = null (nunca programados)
  //   2. en reajuste sin mesa asignada (sinAsignar de una corrida anterior)
  const sinAsignarQuery = fechaAjusteId
    ? db.from('liga_partidos').select('id, division_id, jugador_a_id, jugador_b_id, orden_fixture')
        .eq('liga_id', ligaId).eq('fecha_id', fechaAjusteId).is('mesa_id', null)
        .not('estado', 'in', '("finalizado","walkover")').is('deleted_at', null)
        .order('orden_fixture', { ascending: true })
    : Promise.resolve({ data: [] })

  const [{ data: ligaConfig }, { data: fechas }, { data: mesasRaw }, { data: rawDesdefNull }, { data: rawDesdeAjuste }] = await Promise.all([
    db.from('ligas').select('total_fechas, bloque_minutos, mesas_count').eq('id', ligaId).single(),
    supabase.from('liga_fechas').select('id, numero').eq('liga_id', ligaId).eq('es_ajuste', false).order('numero', { ascending: true }),
    supabase.from('liga_mesas').select('id, numero').eq('liga_id', ligaId).order('numero', { ascending: true }),
    db.from('liga_partidos').select('id, division_id, jugador_a_id, jugador_b_id, orden_fixture').eq('liga_id', ligaId).is('fecha_id', null).not('estado', 'in', '("finalizado","walkover")').is('deleted_at', null).order('orden_fixture', { ascending: true }),
    sinAsignarQuery,
  ])

  // Combinar y deduplicar (un partido no puede estar en ambas fuentes, pero por seguridad)
  const seen = new Set<string>()
  const rawPendientes: Array<{ id: string; division_id: string; jugador_a_id: string; jugador_b_id: string; orden_fixture: number }> = []
  for (const p of [...(rawDesdefNull || []), ...(rawDesdeAjuste || [])]) {
    if (!seen.has(p.id)) { seen.add(p.id); rawPendientes.push(p) }
  }
  rawPendientes.sort((a, b) => a.orden_fixture - b.orden_fixture)

  const bloqueMinutos: number = ligaConfig?.bloque_minutos ?? 30
  const totalFechas: number = ligaConfig?.total_fechas ?? 5
  const mesasCountDefault: number = ligaConfig?.mesas_count ?? 4
  const nFechasRegulares = totalFechas - 1

  if (!fechas?.length)
    return { error: `Crea primero las fechas regulares de la liga (1 a ${nFechasRegulares})` }

  // Si no hay mesas creadas, crearlas automáticamente usando mesas_count (default 4)
  let mesasActivas = mesasRaw ?? []
  if (mesasActivas.length === 0) {
    const inserts = Array.from({ length: mesasCountDefault }, (_, i) => ({ liga_id: ligaId, numero: i + 1 }))
    const { data: creadas } = await supabase.from('liga_mesas').insert(inserts).select('id, numero')
    mesasActivas = creadas ?? []
  }

  if (!mesasActivas.length)
    return { error: `No se pudieron crear las ${mesasCountDefault} mesas automáticas. Verifica los permisos de la liga.` }
  const partidosPendientes = (rawPendientes || []) as Array<{ id: string; division_id: string; jugador_a_id: string; jugador_b_id: string; orden_fixture: number }>

  if (!partidosPendientes.length) return { error: 'No hay partidos pendientes por programar' }

  const divisionIds = Array.from(new Set(partidosPendientes.map(p => p.division_id)))
  const [{ data: divisionJugadores }, { data: divisionesData }] = await Promise.all([
    supabase.from('liga_division_jugadores').select('division_id, jugador_id').in('division_id', divisionIds),
    supabase.from('liga_divisiones').select('id, orden').in('id', divisionIds).order('orden', { ascending: true }),
  ])

  const jugadoresPorDivision = new Map<string, string[]>()
  for (const dj of divisionJugadores || []) {
    const arr = jugadoresPorDivision.get(dj.division_id) ?? []
    arr.push(dj.jugador_id)
    jugadoresPorDivision.set(dj.division_id, arr)
  }

  // Mesa fija por división: División[i ordenada] → Mesa[i ordenada por numero]
  const divisionesOrdenadas = (divisionesData || []) as Array<{ id: string; orden: number }>
  const mesaPorDivision = new Map<string, number>()
  divisionesOrdenadas.forEach((div, i) => {
    mesaPorDivision.set(div.id, mesasActivas[i % mesasActivas.length].numero)
  })

  const aProgramar: PartidoAProgramar[] = partidosPendientes.map(p => ({
    id: p.id,
    divisionId: p.division_id,
    jugadorAId: p.jugador_a_id,
    jugadorBId: p.jugador_b_id,
    ordenFixture: p.orden_fixture,
  }))

  const bloques = generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, bloqueMinutos)

  // Agrupar partidos por división y programar cada división en su mesa asignada
  const porDivision = new Map<string, PartidoAProgramar[]>()
  for (const p of aProgramar) {
    const arr = porDivision.get(p.divisionId) ?? []
    arr.push(p)
    porDivision.set(p.divisionId, arr)
  }

  const todosProgramados: PartidoProgramado[] = []
  const sinAsignarIds: string[] = []

  for (const [divId, partidosDiv] of porDivision) {
    const mesaNumero = mesaPorDivision.get(divId) ?? mesasActivas[0].numero
    const jugadoresDiv = jugadoresPorDivision.get(divId) ?? []
    const { programados: progDiv, sinAsignar: sinDiv } = programarDivision(
      partidosDiv, jugadoresDiv, fechas.length, bloques, mesaNumero,
    )
    todosProgramados.push(...progDiv)
    sinAsignarIds.push(...sinDiv.map(p => p.id))
  }

  const conArbitros = asignarArbitrosEficiente(todosProgramados, jugadoresPorDivision, bloques)

  const fechaIdPorNumero = new Map(fechas.map(f => [f.numero, f.id]))
  const mesaIdPorNumero = new Map(mesasActivas.map(m => [m.numero, m.id]))

  // Guardar en lotes; capturar errores individuales (p.ej. HC-01 trigger)
  let programadosExitosos = 0
  const tamanoLote = 25
  for (let i = 0; i < conArbitros.length; i += tamanoLote) {
    const lote = conArbitros.slice(i, i + tamanoLote)
    const resultados = await Promise.all(
      lote.map(p =>
        supabase
          .from('liga_partidos')
          .update({
            fecha_id: fechaIdPorNumero.get(p.fechaNumero) ?? null,
            mesa_id: mesaIdPorNumero.get(p.mesaNumero) ?? null,
            bloque_horario: p.bloqueHorario,
            arbitro_id: p.arbitroId,
          })
          .eq('id', p.id)
          .then(r => ({ id: p.id, error: r.error })),
      ),
    )
    for (const r of resultados) {
      if (r.error) sinAsignarIds.push(r.id)
      else programadosExitosos++
    }
  }

  // Asignar los partidos que no caben en fechas regulares a la fecha de reajuste
  if (sinAsignarIds.length > 0) {
    const { data: fechaAjuste } = await supabase
      .from('liga_fechas')
      .select('id')
      .eq('liga_id', ligaId)
      .eq('es_ajuste', true)
      .single()

    if (fechaAjuste) {
      await supabase
        .from('liga_partidos')
        .update({ fecha_id: fechaAjuste.id, mesa_id: null, bloque_horario: null, arbitro_id: null })
        .in('id', sinAsignarIds)
    }
  }

  return {
    success: true,
    totalProgramados: programadosExitosos,
    totalSinProgramar: sinAsignarIds.length,
    sinProgramarIds: sinAsignarIds,
  }
}

// Limpia la programación de todos los partidos no jugados (estado programado
// o pendiente con fecha asignada) para que puedan ser reprogramados desde cero.
// NO toca partidos finalizados, walkovers ni partidos sin fecha.
export async function limpiarProgramacionLiga(params: { ligaId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const db = supabase as any
  const { data: activos } = await db
    .from('liga_partidos')
    .select('id')
    .eq('liga_id', params.ligaId)
    .in('estado', ['programado', 'pendiente'])
    .not('fecha_id', 'is', null)
    .is('deleted_at', null)

  const ids = (activos || []).map((p: { id: string }) => p.id)
  if (!ids.length) return { success: true, limpiados: 0 }

  const { error } = await supabase
    .from('liga_partidos')
    .update({ fecha_id: null, mesa_id: null, bloque_horario: null, arbitro_id: null })
    .in('id', ids)
  if (error) return { error: 'No se pudo limpiar la programación: ' + error.message }

  return { success: true, limpiados: ids.length }
}

// Mueve un partido a otra mesa/bloque (misma fecha o distinta) validando en
// el servidor las reglas inquebrantables (HC-01, HC-03/06, HC-04). Usado por
// la interfaz de Drag & Drop.
export async function moverPartidoLiga(params: {
  partidoId: string
  fechaId: string
  mesaId: string
  bloqueHorario: string
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { partidoId, fechaId, mesaId, bloqueHorario } = params

  const { data: partido } = await supabase
    .from('liga_partidos')
    .select('id, liga_id, jugador_a_id, jugador_b_id, arbitro_id')
    .eq('id', partidoId)
    .single()
  if (!partido) return { error: 'Partido no encontrado' }

  const [{ data: mesa }, { data: fecha }] = await Promise.all([
    supabase.from('liga_mesas').select('id, liga_id').eq('id', mesaId).single(),
    supabase.from('liga_fechas').select('id, liga_id, estado').eq('id', fechaId).single(),
  ])
  if (!mesa || mesa.liga_id !== partido.liga_id) return { error: 'La mesa no pertenece a esta liga' }
  if (!fecha || fecha.liga_id !== partido.liga_id) return { error: 'La fecha no pertenece a esta liga' }
  if (fecha.estado !== 'programada') return { error: 'Solo se puede reprogramar una fecha en estado "Programada"' }

  const { data: partidosFecha } = await (supabase as any)
    .from('liga_partidos')
    .select('id, fecha_id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id, arbitro_id')
    .eq('fecha_id', fechaId)
    .is('deleted_at', null)

  const aPartidoExistente = (p: { id: string; fecha_id: string | null; mesa_id: string | null; bloque_horario: string | null; jugador_a_id: string; jugador_b_id: string; arbitro_id: string | null }): PartidoExistente => ({
    id: p.id,
    fechaId: p.fecha_id,
    mesaId: p.mesa_id,
    bloqueHorario: normalizarBloque(p.bloque_horario),
    jugadorAId: p.jugador_a_id,
    jugadorBId: p.jugador_b_id,
    arbitroId: p.arbitro_id,
  })

  const partidoActual = aPartidoExistente({
    id: partido.id,
    fecha_id: fechaId,
    mesa_id: mesaId,
    bloque_horario: bloqueHorario,
    jugador_a_id: partido.jugador_a_id,
    jugador_b_id: partido.jugador_b_id,
    arbitro_id: partido.arbitro_id,
  })

  const { valido, motivo } = validarMovimientoPartido(
    partidoActual,
    { fechaId, mesaId, bloqueHorario },
    (partidosFecha || []).map(aPartidoExistente),
  )
  if (!valido) return { error: motivo }

  const { error: updateError } = await supabase
    .from('liga_partidos')
    .update({ fecha_id: fechaId, mesa_id: mesaId, bloque_horario: bloqueHorario })
    .eq('id', partidoId)
  if (updateError) return { error: 'No se pudo mover el partido: ' + updateError.message }

  return { success: true }
}

// Cambia manualmente el árbitro de un partido ya programado, reutilizando la
// misma validación de conflictos del Drag & Drop (HC-04): no puede ser uno
// de los jugadores, ni estar jugando o arbitrando otro partido en ese bloque.
export async function cambiarArbitroPartido(params: { partidoId: string; arbitroId: string | null }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { partidoId, arbitroId } = params

  const { data: partido } = await supabase
    .from('liga_partidos')
    .select('id, fecha_id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id')
    .eq('id', partidoId)
    .single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (!partido.fecha_id || !partido.mesa_id || !partido.bloque_horario) {
    return { error: 'El partido todavía no tiene fecha/mesa/horario asignado' }
  }

  if (arbitroId) {
    const { data: partidosFecha } = await (supabase as any)
      .from('liga_partidos')
      .select('id, fecha_id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id, arbitro_id')
      .eq('fecha_id', partido.fecha_id)
      .is('deleted_at', null)

    const aPartidoExistente = (p: typeof partido & { arbitro_id?: string | null }): PartidoExistente => ({
      id: p.id,
      fechaId: p.fecha_id,
      mesaId: p.mesa_id,
      bloqueHorario: normalizarBloque(p.bloque_horario),
      jugadorAId: p.jugador_a_id,
      jugadorBId: p.jugador_b_id,
      arbitroId: p.arbitro_id ?? null,
    })

    const { valido, motivo } = validarMovimientoPartido(
      { ...aPartidoExistente(partido), arbitroId },
      { fechaId: partido.fecha_id, mesaId: partido.mesa_id, bloqueHorario: partido.bloque_horario },
      (partidosFecha || []).map(aPartidoExistente),
    )
    if (!valido) return { error: motivo }
  }

  const { error } = await supabase.from('liga_partidos').update({ arbitro_id: arbitroId }).eq('id', partidoId)
  if (error) return { error: 'No se pudo cambiar el árbitro: ' + error.message }

  return { success: true }
}

// Crea un jugador externo (igual que en Torneos): no requiere registro
// completo del club, queda guardado en `jugadores` con es_externo = true y
// reutilizable después en cualquier otra liga o torneo.
export async function crearJugadorExternoLiga(params: { nombre: string; rut?: string; telefono?: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const nombre = params.nombre.trim()
  if (!nombre) return { error: 'El nombre es obligatorio' }

  const { data, error } = await supabase
    .from('jugadores')
    .insert({
      club_id: clubId, nombre, rut: params.rut || null, telefono: params.telefono || null,
      categoria: 'principiante', sesiones_limite: 0, elo: 1200,
      estado: 'activo', es_externo: true,
    })
    .select('id, nombre')
    .single()
  if (error || !data) return { error: 'No se pudo crear el jugador externo: ' + (error?.message ?? '') }

  return { success: true, jugadorId: data.id, jugadorNombre: data.nombre }
}

// ─── CRUD básico de ligas/divisiones/mesas (módulo visible) ────────────────

export async function crearLiga(params: {
  nombre: string
  numDivisiones?: number
  jugadoresPorDivision?: number
  totalFechas?: number
  montoInscripcionDefault?: number
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }
  if (!params.nombre.trim()) return { error: 'El nombre es obligatorio' }

  // totalFechas = fechas REGULARES pedidas por el admin; se crea una adicional de ajuste
  const nFechasRegulares = Math.max(1, params.totalFechas ?? 5)
  const totalFechas = nFechasRegulares + 1

  const { data: liga, error } = await (supabase as any)
    .from('ligas')
    .insert({
      club_id: clubId,
      nombre: params.nombre.trim(),
      total_fechas: totalFechas,
      monto_inscripcion_default: params.montoInscripcionDefault ?? null,
    })
    .select('id')
    .single()
  if (error || !liga) return { error: 'No se pudo crear la liga: ' + (error?.message ?? '') }

  // Fechas 1 a nFechasRegulares son regulares; la última (nFechasRegulares+1) es ajuste
  await supabase.from('liga_fechas').insert(
    Array.from({ length: totalFechas }, (_, i) => ({
      liga_id: liga.id,
      numero: i + 1,
      es_ajuste: i + 1 === totalFechas,
    })),
  )

  const numDivisiones = params.numDivisiones ?? 0
  if (numDivisiones > 0) {
    await supabase.from('liga_divisiones').insert(
      Array.from({ length: numDivisiones }, (_, i) => ({
        liga_id: liga.id,
        nombre: `División ${i + 1}`,
        orden: i,
        capacidad_max: params.jugadoresPorDivision ?? null,
      })),
    )
  }

  return { success: true, ligaId: liga.id }
}

export async function crearDivision(params: { ligaId: string; nombre: string; orden?: number }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }
  if (!params.nombre.trim()) return { error: 'El nombre de la división es obligatorio' }

  const { data, error } = await supabase
    .from('liga_divisiones')
    .insert({ liga_id: params.ligaId, nombre: params.nombre.trim(), orden: params.orden ?? 0 })
    .select('id')
    .single()
  if (error || !data) return { error: 'No se pudo crear la división: ' + (error?.message ?? '') }

  return { success: true, divisionId: data.id }
}

export async function crearMesa(params: { ligaId: string; numero: number }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.from('liga_mesas').insert({ liga_id: params.ligaId, numero: params.numero })
  if (error) return { error: 'No se pudo crear la mesa: ' + error.message }

  return { success: true }
}

export async function eliminarMesa(params: { mesaId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await supabase.from('liga_mesas').delete().eq('id', params.mesaId)
  if (error) return { error: 'No se pudo eliminar la mesa: ' + error.message }

  return { success: true }
}

// ─── Estados de fecha + registro de resultados ─────────────────────────────

// "Iniciar Fecha": Programada → En Juego. Habilita el registro de
// resultados y bloquea la edición de horarios/mesas/árbitros (Sección 10).
export async function iniciarFecha(params: { fechaId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: fecha } = await supabase.from('liga_fechas').select('id, estado').eq('id', params.fechaId).single()
  if (!fecha) return { error: 'Fecha no encontrada' }
  if (fecha.estado !== 'programada') return { error: 'Solo se puede iniciar una fecha que esté en estado "Programada"' }

  const { error } = await supabase.from('liga_fechas').update({ estado: 'en_juego' }).eq('id', params.fechaId)
  if (error) return { error: 'No se pudo iniciar la fecha: ' + error.message }

  return { success: true }
}

export async function registrarResultadoPartido(params: {
  partidoId: string
  setsA: number
  setsB: number
  observaciones?: string
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { partidoId, setsA, setsB, observaciones } = params
  if (!esResultadoBo5Valido(setsA, setsB)) {
    return { error: 'Marcador inválido. Resultados permitidos en Mejor de 5: 3-0, 3-1, 3-2, 0-3, 1-3, 2-3' }
  }

  const { data: partido } = await supabase
    .from('liga_partidos')
    .select('id, fecha_id, jugador_a_id, jugador_b_id, estado')
    .eq('id', partidoId)
    .single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (['finalizado', 'walkover'].includes(partido.estado)) {
    return { error: 'Este partido ya fue resuelto' }
  }

  const ganadorId = determinarGanadorBo5(setsA, setsB, partido.jugador_a_id, partido.jugador_b_id)

  // Guard atómico: solo escribe si el partido sigue abierto (evita doble registro)
  const { data: actualizado, error } = await supabase
    .from('liga_partidos')
    .update({ sets_a: setsA, sets_b: setsB, ganador_id: ganadorId, estado: 'finalizado', observaciones: observaciones || null })
    .eq('id', partidoId)
    .not('estado', 'in', '("finalizado","walkover")')
    .select('id')
  if (error) return { error: 'No se pudo registrar el resultado: ' + error.message }
  if (!actualizado?.length) return { error: 'Este partido ya tiene un resultado registrado' }

  return { success: true, ganadorId }
}

// ─── Partidos no jugados ───────────────────────────────────────────────────
// Resolución obligatoria: Walkover (cuenta como victoria/derrota normal) o
// reprogramación a Fecha 5 (sin puntos ni sets, queda "pendiente").

export async function registrarWalkover(params: { partidoId: string; ganadorId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { partidoId, ganadorId } = params

  const { data: partido } = await supabase
    .from('liga_partidos')
    .select('id, jugador_a_id, jugador_b_id, estado')
    .eq('id', partidoId)
    .single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (['finalizado', 'walkover'].includes(partido.estado)) {
    return { error: 'Este partido ya fue resuelto' }
  }
  if (ganadorId !== partido.jugador_a_id && ganadorId !== partido.jugador_b_id) {
    return { error: 'El ganador del walkover debe ser uno de los dos jugadores del partido' }
  }

  const { error } = await supabase
    .from('liga_partidos')
    .update({ ganador_id: ganadorId, estado: 'walkover', es_walkover: true, sets_a: null, sets_b: null })
    .eq('id', partidoId)
  if (error) return { error: 'No se pudo registrar el walkover: ' + error.message }

  return { success: true, ganadorId }
}

export async function reprogramarPartidoAFecha5(params: { partidoId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: partido } = await supabase
    .from('liga_partidos')
    .select('id, liga_id, estado')
    .eq('id', params.partidoId)
    .single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (['finalizado', 'walkover'].includes(partido.estado)) {
    return { error: 'Este partido ya fue resuelto' }
  }

  const { data: fechaAjuste } = await supabase
    .from('liga_fechas')
    .select('id')
    .eq('liga_id', partido.liga_id)
    .eq('es_ajuste', true)
    .single()
  if (!fechaAjuste) return { error: 'Esta liga no tiene fecha de reajuste configurada' }

  const { error } = await supabase
    .from('liga_partidos')
    .update({ fecha_id: fechaAjuste.id, mesa_id: null, bloque_horario: null, estado: 'pendiente' })
    .eq('id', params.partidoId)
  if (error) return { error: 'No se pudo reprogramar el partido: ' + error.message }

  return { success: true }
}

// ─── Terminar fecha regular ───────────────────────────────────────────────────
// Marca la fecha como "finalizada". Si tras esto todas las fechas regulares
// están terminadas, devuelve todasTerminadas=true para que el cliente
// dispare programarEnReajuste automáticamente.
export async function terminarFechaAction(params: { fechaId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: fecha } = await supabase
    .from('liga_fechas')
    .select('id, liga_id, es_ajuste')
    .eq('id', params.fechaId)
    .single()
  if (!fecha) return { error: 'Fecha no encontrada' }
  if (fecha.es_ajuste) return { error: 'La fecha de reajuste no se puede terminar manualmente' }

  const { error } = await supabase
    .from('liga_fechas')
    .update({ estado: 'finalizada' })
    .eq('id', params.fechaId)
  if (error) return { error: 'No se pudo terminar la fecha: ' + error.message }

  // Verificar si todas las fechas regulares quedaron finalizadas
  const { data: regularFechas } = await supabase
    .from('liga_fechas')
    .select('estado')
    .eq('liga_id', fecha.liga_id)
    .eq('es_ajuste', false)

  const todasTerminadas = (regularFechas || []).every(f => f.estado === 'finalizada')

  return { success: true, todasTerminadas, ligaId: fecha.liga_id }
}

// ─── Programar partidos no jugados en la fecha de reajuste ───────────────────
// Recoge TODOS los partidos no resueltos (pendiente/programado) de fechas
// regulares y sin fecha, los mueve al reajuste y los programa con la misma
// lógica de orden y árbitros.
export async function programarEnReajuste(params: { ligaId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }
  const db = supabase as any
  const { ligaId } = params

  const [{ data: ligaConfig }, { data: fechaAjuste }, { data: mesasRaw }] = await Promise.all([
    db.from('ligas').select('bloque_minutos').eq('id', ligaId).single(),
    supabase.from('liga_fechas').select('id').eq('liga_id', ligaId).eq('es_ajuste', true).single(),
    supabase.from('liga_mesas').select('id, numero').eq('liga_id', ligaId).order('numero'),
  ])
  if (!fechaAjuste) return { error: 'Esta liga no tiene fecha de reajuste' }

  const mesas = (mesasRaw || []) as Array<{ id: string; numero: number }>
  const bloqueMinutos: number = ligaConfig?.bloque_minutos ?? 30
  const bloques = generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, bloqueMinutos)

  // Todos los partidos no resueltos de la liga (cliente filtra por fecha)
  const { data: rawAll } = await db
    .from('liga_partidos')
    .select('id, division_id, jugador_a_id, jugador_b_id, orden_fixture, fecha_id, mesa_id')
    .eq('liga_id', ligaId)
    .not('estado', 'in', '("finalizado","walkover")')
    .is('deleted_at', null)

  const todos = (rawAll || []) as Array<{
    id: string; division_id: string; jugador_a_id: string; jugador_b_id: string
    orden_fixture: number; fecha_id: string | null; mesa_id: string | null
  }>

  // Los que NO están ya en reajuste: moverlos ahí sin mesa/bloque
  const toMoveIds = todos.filter(p => p.fecha_id !== fechaAjuste.id).map(p => p.id)
  if (toMoveIds.length > 0) {
    const lote = 50
    for (let i = 0; i < toMoveIds.length; i += lote) {
      await supabase
        .from('liga_partidos')
        .update({ fecha_id: fechaAjuste.id, mesa_id: null, bloque_horario: null, arbitro_id: null })
        .in('id', toMoveIds.slice(i, i + lote))
    }
  }

  // Todos los que van a quedar en reajuste sin programar (incluye ya-en-reajuste sin mesa)
  const toSchedule: PartidoAProgramar[] = todos
    .filter(p => p.fecha_id !== fechaAjuste.id || !p.mesa_id)
    .map(p => ({ id: p.id, divisionId: p.division_id, jugadorAId: p.jugador_a_id, jugadorBId: p.jugador_b_id, ordenFixture: p.orden_fixture }))

  if (!toSchedule.length) return { success: true, total: 0 }

  const divisionIds = Array.from(new Set(toSchedule.map(p => p.divisionId)))
  const [{ data: divJug }, { data: divsData }] = await Promise.all([
    supabase.from('liga_division_jugadores').select('division_id, jugador_id').in('division_id', divisionIds),
    supabase.from('liga_divisiones').select('id, orden').in('id', divisionIds).order('orden'),
  ])

  const jugadoresPorDivision = new Map<string, string[]>()
  for (const dj of divJug || []) {
    const arr = jugadoresPorDivision.get(dj.division_id) ?? []
    arr.push(dj.jugador_id)
    jugadoresPorDivision.set(dj.division_id, arr)
  }

  const mesaPorDivision = new Map<string, number>()
  ;(divsData || []).forEach((div, i) => {
    mesaPorDivision.set(div.id, mesas[i % mesas.length]?.numero ?? 1)
  })

  const porDivision = new Map<string, PartidoAProgramar[]>()
  for (const p of toSchedule) {
    const arr = porDivision.get(p.divisionId) ?? []
    arr.push(p)
    porDivision.set(p.divisionId, arr)
  }

  const todosProgramados: PartidoProgramado[] = []
  for (const [divId, partidosDiv] of porDivision) {
    const mesaNumero = mesaPorDivision.get(divId) ?? mesas[0]?.numero ?? 1
    const jugadoresDiv = jugadoresPorDivision.get(divId) ?? []
    const { programados } = programarDivision(partidosDiv, jugadoresDiv, 1, bloques, mesaNumero)
    todosProgramados.push(...programados)
  }

  const conArbitros = asignarArbitrosEficiente(todosProgramados, jugadoresPorDivision, bloques)
  const mesaIdPorNumero = new Map(mesas.map(m => [m.numero, m.id]))

  let exitosos = 0
  const tam = 25
  for (let i = 0; i < conArbitros.length; i += tam) {
    const resultados = await Promise.all(
      conArbitros.slice(i, i + tam).map(p =>
        supabase.from('liga_partidos').update({
          mesa_id: mesaIdPorNumero.get(p.mesaNumero) ?? null,
          bloque_horario: p.bloqueHorario,
          arbitro_id: p.arbitroId,
        }).eq('id', p.id).then(r => ({ error: r.error }))
      )
    )
    exitosos += resultados.filter(r => !r.error).length
  }

  return { success: true, total: exitosos }
}

// ─── Asignar partido a mano desde el fixture ──────────────────────────────────
// El usuario elige fecha + bloque; la acción busca la mesa de la división,
// valida que no haya conflicto (HC-01) y guarda.
export async function asignarPartidoManual(params: {
  partidoId: string
  fechaId: string
  bloqueHorario: string
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { partidoId, fechaId, bloqueHorario } = params

  const { data: partido } = await supabase
    .from('liga_partidos')
    .select('id, liga_id, division_id, estado')
    .eq('id', partidoId)
    .single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (['finalizado', 'walkover'].includes(partido.estado)) {
    return { error: 'No se puede reubicar un partido ya resuelto' }
  }

  // Mesa de la división: buscar en partidos ya programados de esa división
  const { data: mesaRef } = await supabase
    .from('liga_partidos')
    .select('mesa_id')
    .eq('division_id', partido.division_id)
    .not('mesa_id', 'is', null)
    .neq('id', partidoId)
    .limit(1)
    .single()

  let mesaId: string | null = mesaRef?.mesa_id ?? null
  if (!mesaId) {
    // Sin referencia: asignar por orden de división
    const [{ data: divisiones }, { data: mesas }] = await Promise.all([
      supabase.from('liga_divisiones').select('id, orden').eq('liga_id', partido.liga_id).order('orden'),
      supabase.from('liga_mesas').select('id').eq('liga_id', partido.liga_id).order('numero'),
    ])
    const idx = (divisiones || []).findIndex((d: any) => d.id === partido.division_id)
    const arr = mesas || []
    if (arr.length) mesaId = arr[Math.max(0, idx) % arr.length]?.id ?? arr[0].id
  }
  if (!mesaId) return { error: 'Esta liga no tiene mesas configuradas' }

  // HC-01: verificar que nadie más ocupe esa mesa/bloque en esa fecha
  const { data: conflicto } = await supabase
    .from('liga_partidos')
    .select('id')
    .eq('fecha_id', fechaId)
    .eq('mesa_id', mesaId)
    .eq('bloque_horario', bloqueHorario)
    .neq('id', partidoId)
    .is('deleted_at', null)
    .limit(1)
    .single()
  if (conflicto) return { error: 'Ese horario ya está ocupado en esa mesa' }

  const { error } = await supabase
    .from('liga_partidos')
    .update({ fecha_id: fechaId, mesa_id: mesaId, bloque_horario: bloqueHorario })
    .eq('id', partidoId)
  if (error) return { error: 'No se pudo asignar: ' + error.message }

  return { success: true }
}

// ─── Desprogramar un partido individual ───────────────────────────────────────
export async function desprogramarPartido(params: { partidoId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: partido } = await supabase
    .from('liga_partidos')
    .select('id, estado')
    .eq('id', params.partidoId)
    .single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (['finalizado', 'walkover'].includes(partido.estado)) {
    return { error: 'No se puede desprogramar un partido ya resuelto' }
  }

  const { error } = await supabase
    .from('liga_partidos')
    .update({ fecha_id: null, mesa_id: null, bloque_horario: null, arbitro_id: null })
    .eq('id', params.partidoId)
  if (error) return { error: 'No se pudo desprogramar: ' + error.message }

  return { success: true }
}
