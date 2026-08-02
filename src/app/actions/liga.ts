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
  type RestriccionDisponibilidad,
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

  // Anular partidos no jugados de jugadores removidos (batch, 1 round-trip)
  const idsAAnular = partidosAAnular
    .map(({ a, b }) => allPartidos.find(
      p => (p.jugador_a_id === a && p.jugador_b_id === b) || (p.jugador_a_id === b && p.jugador_b_id === a),
    ))
    .filter((p): p is (typeof allPartidos)[number] => !!p)
    .map(p => p.id)
  if (idsAAnular.length > 0) {
    await db.from('liga_partidos').update({ deleted_at: new Date().toISOString() }).in('id', idsAAnular)
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

// Marca de retiro: se guarda como una restricción total (no puede en ninguna
// fecha, a ninguna hora), así el motor de programación deja de considerarlo
// sin necesidad de otra tabla. El motivo distingue el retiro de una
// indisponibilidad común, que sí se puede editar desde el modal.
const MOTIVO_RETIRO = 'retiro'

// ── Restricciones de disponibilidad ────────────────────────────────────────
// Lo que cada jugador avisó que no puede: una fecha entera, o un tramo
// horario. El motor de programación las respeta como regla dura.

export interface RestriccionGuardada {
  id: string
  jugadorId: string
  fechaNumero: number | null
  horaDesde: string | null
  horaHasta: string | null
  motivo: string | null
}

export async function listarRestriccionesLiga(
  params: { ligaId: string },
): Promise<{ restricciones: RestriccionGuardada[]; error?: string }> {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { restricciones: [], error: authErr }

  const { data, error } = await (supabase as any)
    .from('liga_restricciones')
    .select('id, jugador_id, fecha_numero, hora_desde, hora_hasta, motivo')
    .eq('liga_id', params.ligaId)
    .is('deleted_at', null)
    .order('creado_en', { ascending: true })

  // Si la migración todavía no corrió, la liga simplemente no tiene
  // restricciones — no es un error que deba frenar la pantalla.
  if (error) return { restricciones: [] }

  const restricciones: RestriccionGuardada[] = (data || []).map((r: any) => ({
    id: r.id as string,
    jugadorId: r.jugador_id as string,
    fechaNumero: r.fecha_numero as number | null,
    horaDesde: r.hora_desde ? String(r.hora_desde).slice(0, 5) : null,
    horaHasta: r.hora_hasta ? String(r.hora_hasta).slice(0, 5) : null,
    motivo: (r.motivo ?? null) as string | null,
  }))
  return { restricciones }
}

/**
 * Reemplaza TODAS las restricciones de la liga por las que se mandan. El modal
 * muestra el estado completo y lo guarda entero, así que borrar una fila en la
 * pantalla tiene que borrarla de verdad. Se hace por borrado lógico para no
 * perder el rastro de lo que hubo.
 */
export async function guardarRestriccionesLiga(params: {
  ligaId: string
  restricciones: Array<{
    jugadorId: string
    fechaNumero: number | null
    horaDesde: string | null
    horaHasta: string | null
    motivo?: string | null
  }>
}) {
  const { error: authErr, supabase, userId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { ligaId, restricciones } = params
  const db = supabase as any

  for (const r of restricciones) {
    if (r.horaDesde && r.horaHasta && r.horaDesde > r.horaHasta) {
      return { error: `El horario de un jugador está al revés (${r.horaDesde} a ${r.horaHasta}).` }
    }
  }

  // Los retiros quedan afuera del reemplazo: retirar a alguien es una decisión
  // aparte, con efectos sobre sus partidos, y no puede deshacerse de rebote
  // por abrir el modal y apretar Programar.
  const { error: bajaErr } = await db
    .from('liga_restricciones')
    .update({ deleted_at: new Date().toISOString() })
    .eq('liga_id', ligaId)
    .is('deleted_at', null)
    .or(`motivo.is.null,motivo.neq.${MOTIVO_RETIRO}`)
  if (bajaErr) return { error: 'No se pudieron actualizar las restricciones. ¿Corriste la migración 118?' }

  if (restricciones.length > 0) {
    const { error: altaErr } = await db.from('liga_restricciones').insert(
      restricciones.map(r => ({
        liga_id: ligaId,
        jugador_id: r.jugadorId,
        fecha_numero: r.fechaNumero,
        hora_desde: r.horaDesde,
        hora_hasta: r.horaHasta,
        motivo: r.motivo ?? null,
        creado_por: userId,
      })),
    )
    if (altaErr) return { error: 'No se pudieron guardar las restricciones.' }
  }

  return { success: true, total: restricciones.length }
}

/**
 * Retira a un jugador de la liga. Lo ya jugado NUNCA se toca: sus resultados
 * y los puntos que sus rivales le sacaron quedan como están. Lo que cambia es
 * qué pasa con los partidos que le quedaban pendientes, y eso lo decide el
 * admin en el momento:
 *
 *   'walkover' → sus rivales ganan esos partidos por no presentación. Es lo
 *                que hacen las federaciones. Ojo que el que le tocaba jugar
 *                contra él en la fecha 6 gana gratis, y el que ya jugó en la
 *                1 tuvo que ganárselo.
 *   'eliminar' → esos partidos desaparecen. Nadie suma puntos, pero cada uno
 *                termina la liga con distinta cantidad de partidos jugados.
 *
 * En los dos casos queda registrado el retiro, así que si se vuelve a
 * programar, el jugador ya no entra en el horario.
 */
export async function retirarJugadorDeLiga(params: {
  ligaId: string
  jugadorId: string
  modo: 'walkover' | 'eliminar'
}) {
  const { error: authErr, supabase, userId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { ligaId, jugadorId, modo } = params
  const db = supabase as any

  // Sólo lo pendiente. Un partido finalizado o ya resuelto por walkover es
  // historia y no se reescribe.
  const { data: pendientes, error: leerErr } = await db
    .from('liga_partidos')
    .select('id, jugador_a_id, jugador_b_id')
    .eq('liga_id', ligaId)
    .or(`jugador_a_id.eq.${jugadorId},jugador_b_id.eq.${jugadorId}`)
    .not('estado', 'in', '("finalizado","walkover")')
    .is('deleted_at', null)
  if (leerErr) return { error: 'No se pudieron leer los partidos del jugador.' }

  const aResolver = (pendientes || []) as Array<{ id: string; jugador_a_id: string; jugador_b_id: string }>

  if (modo === 'walkover') {
    // Un update por partido: cada uno tiene un ganador distinto (el rival).
    for (const p of aResolver) {
      const rivalId = p.jugador_a_id === jugadorId ? p.jugador_b_id : p.jugador_a_id
      const { error } = await db
        .from('liga_partidos')
        .update({ ganador_id: rivalId, estado: 'walkover', es_walkover: true, sets_a: null, sets_b: null })
        .eq('id', p.id)
        .not('estado', 'in', '("finalizado","walkover")')
      if (error) return { error: 'No se pudieron registrar los walkovers: ' + error.message }
    }
  } else if (aResolver.length > 0) {
    const { error } = await db
      .from('liga_partidos')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', aResolver.map(p => p.id))
    if (error) return { error: 'No se pudieron eliminar los partidos: ' + error.message }
  }

  // Que no vuelva a entrar en el horario si se reprograma.
  const { error: marcaErr } = await db.from('liga_restricciones').insert({
    liga_id: ligaId,
    jugador_id: jugadorId,
    fecha_numero: null,
    hora_desde: null,
    hora_hasta: null,
    motivo: MOTIVO_RETIRO,
    creado_por: userId,
  })
  if (marcaErr) {
    return { error: 'Los partidos se resolvieron, pero no se pudo marcar el retiro. ¿Corriste la migración 118?' }
  }

  return { success: true, partidosAfectados: aResolver.length, modo }
}

/** Cuántos partidos le quedan sin jugar — para mostrarlo antes de confirmar. */
export async function contarPartidosPendientesJugador(params: { ligaId: string; jugadorId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { count, error } = await (supabase as any)
    .from('liga_partidos')
    .select('id', { count: 'exact', head: true })
    .eq('liga_id', params.ligaId)
    .or(`jugador_a_id.eq.${params.jugadorId},jugador_b_id.eq.${params.jugadorId}`)
    .not('estado', 'in', '("finalizado","walkover")')
    .is('deleted_at', null)
  if (error) return { error: 'No se pudieron contar los partidos pendientes.' }

  return { pendientes: count ?? 0 }
}

/** Deshace un retiro: el jugador vuelve a entrar en las próximas programaciones. */
export async function reincorporarJugadorALiga(params: { ligaId: string; jugadorId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { error } = await (supabase as any)
    .from('liga_restricciones')
    .update({ deleted_at: new Date().toISOString() })
    .eq('liga_id', params.ligaId)
    .eq('jugador_id', params.jugadorId)
    .eq('motivo', MOTIVO_RETIRO)
    .is('deleted_at', null)
  if (error) return { error: 'No se pudo reincorporar al jugador.' }

  // Los partidos que se resolvieron al retirarlo no se deshacen solos: si
  // hacen falta, se reprograma o se editan a mano.
  return { success: true }
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

  const [{ data: ligaConfig }, { data: fechas }, { data: mesasRaw }, { data: rawDesdefNull }, { data: rawDesdeAjuste }, { data: rawRestricciones }] = await Promise.all([
    db.from('ligas').select('total_fechas, bloque_minutos, mesas_count').eq('id', ligaId).single(),
    supabase.from('liga_fechas').select('id, numero, estado').eq('liga_id', ligaId).eq('es_ajuste', false).order('numero', { ascending: true }),
    supabase.from('liga_mesas').select('id, numero').eq('liga_id', ligaId).order('numero', { ascending: true }),
    db.from('liga_partidos').select('id, division_id, jugador_a_id, jugador_b_id, orden_fixture').eq('liga_id', ligaId).is('fecha_id', null).not('estado', 'in', '("finalizado","walkover")').is('deleted_at', null).order('orden_fixture', { ascending: true }),
    sinAsignarQuery,
    // Lo que los jugadores avisaron que no pueden. El motor las respeta como
    // regla dura: antes de poner un partido en un bloque, comprueba que los
    // dos jugadores puedan a esa hora de esa fecha.
    db.from('liga_restricciones')
      .select('jugador_id, fecha_numero, hora_desde, hora_hasta')
      .eq('liga_id', ligaId).is('deleted_at', null),
  ])

  // 'HH:MM:SS' de Postgres → 'HH:MM', que es como vienen los bloques.
  const aHoraCorta = (h: string | null) => (h ? h.slice(0, 5) : null)
  const restricciones: RestriccionDisponibilidad[] = (rawRestricciones || []).map((r: any) => ({
    jugadorId: r.jugador_id,
    fechaNumero: r.fecha_numero,
    horaDesde: aHoraCorta(r.hora_desde),
    horaHasta: aHoraCorta(r.hora_hasta),
  }))

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

  // Sólo se reparte en fechas que todavía no arrancaron. Meter partidos en una
  // fecha ya jugada, o en la que se está jugando ahora mismo, es cambiarle el
  // horario a la gente que está en el club.
  const fechasLibres = fechas.filter((f: { estado: string }) => f.estado === 'programada')
  if (!fechasLibres.length) {
    return { error: 'No quedan fechas por jugar donde programar. Todas están en juego o terminadas.' }
  }
  const numerosDeFechaLibres = fechasLibres.map((f: { numero: number }) => f.numero)

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
  const sinAsignarDetalle: Array<{ id: string; motivo: string; jugadores: string[] }> = []

  for (const [divId, partidosDiv] of porDivision) {
    const mesaNumero = mesaPorDivision.get(divId) ?? mesasActivas[0].numero
    const jugadoresDiv = jugadoresPorDivision.get(divId) ?? []
    const { programados: progDiv, sinAsignar: sinDiv } = programarDivision(
      partidosDiv, jugadoresDiv, numerosDeFechaLibres, bloques, mesaNumero, restricciones,
    )
    todosProgramados.push(...progDiv)
    sinAsignarIds.push(...sinDiv.map(p => p.id))
    sinAsignarDetalle.push(...sinDiv.map(p => ({
      id: p.id, motivo: p.motivo, jugadores: p.jugadoresConRestriccion,
    })))
  }

  const conArbitros = asignarArbitrosEficiente(todosProgramados, jugadoresPorDivision, bloques)

  const fechaIdPorNumero = new Map(fechas.map(f => [f.numero, f.id]))
  const mesaIdPorNumero = new Map(mesasActivas.map(m => [m.numero, m.id]))

  // Guardar todos en un único upsert (1 round-trip en lugar de N)
  const { error: upsertErr } = await supabase
    .from('liga_partidos')
    .upsert(
      conArbitros.map(p => ({
        id: p.id,
        liga_id: ligaId,
        division_id: p.divisionId,
        jugador_a_id: p.jugadorAId,
        jugador_b_id: p.jugadorBId,
        orden_fixture: p.ordenFixture,
        fecha_id: fechaIdPorNumero.get(p.fechaNumero) ?? null,
        mesa_id: mesaIdPorNumero.get(p.mesaNumero) ?? null,
        bloque_horario: p.bloqueHorario,
        arbitro_id: p.arbitroId,
      })),
      { onConflict: 'id' },
    )
  let programadosExitosos = 0
  if (upsertErr) {
    sinAsignarIds.push(...conArbitros.map(p => p.id))
  } else {
    programadosExitosos = conArbitros.length
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

  // Para el aviso: si algo quedó afuera, el admin necesita saber por qué y de
  // quién — "faltan bloques" y "Hugo sólo puede en la mañana" se arreglan de
  // maneras muy distintas.
  const porRestriccion = sinAsignarDetalle.filter(d => d.motivo === 'restriccion')
  const idsCulpables = Array.from(new Set(porRestriccion.flatMap(d => d.jugadores)))
  let nombresCulpables: string[] = []
  if (idsCulpables.length > 0) {
    const { data: jugs } = await supabase
      .from('jugadores').select('nombre').in('id', idsCulpables)
    nombresCulpables = (jugs || []).map((j: { nombre: string }) => j.nombre)
  }

  return {
    success: true,
    totalProgramados: programadosExitosos,
    totalSinProgramar: sinAsignarIds.length,
    sinProgramarIds: sinAsignarIds,
    sinProgramarPorRestriccion: porRestriccion.length,
    sinProgramarPorEspacio: sinAsignarDetalle.length - porRestriccion.length,
    jugadoresQueNoEntraron: nombresCulpables,
  }
}

/**
 * Rearma el horario de lo que falta jugar. Es lo que hace falta cuando a mitad
 * de liga alguien avisa que ya no puede: `generarProgramacionLiga` sólo toca
 * partidos sin fecha, así que los que ya estaban puestos en la fecha 5 se
 * quedaban ahí aunque la nueva restricción los prohibiera.
 *
 * Qué se toca y qué no:
 *   - Fechas terminadas o en juego: intactas. Nadie le cambia el horario a la
 *     gente que ya está en el club.
 *   - Partidos finalizados o resueltos por walkover: intactos, son historia.
 *   - El resto (partidos pendientes de fechas que todavía no arrancaron): se
 *     sueltan y se vuelven a repartir con las restricciones vigentes.
 */
export interface ResultadoReprogramacion {
  error?: string
  totalProgramados: number
  totalSinProgramar: number
  sinProgramarPorRestriccion: number
  sinProgramarPorEspacio: number
  jugadoresQueNoEntraron: string[]
  partidosLiberados: number
  fechasRearmadas: number[]
}

const REPROGRAMACION_VACIA: Omit<ResultadoReprogramacion, 'error'> = {
  totalProgramados: 0,
  totalSinProgramar: 0,
  sinProgramarPorRestriccion: 0,
  sinProgramarPorEspacio: 0,
  jugadoresQueNoEntraron: [],
  partidosLiberados: 0,
  fechasRearmadas: [],
}

export async function reprogramarFechasPendientes(
  params: { ligaId: string },
): Promise<ResultadoReprogramacion> {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { ...REPROGRAMACION_VACIA, error: authErr }

  const { ligaId } = params
  const db = supabase as any

  const { data: fechasLibres, error: fechasErr } = await supabase
    .from('liga_fechas')
    .select('id, numero')
    .eq('liga_id', ligaId)
    .eq('es_ajuste', false)
    .eq('estado', 'programada')
  if (fechasErr) return { ...REPROGRAMACION_VACIA, error: 'No se pudieron leer las fechas de la liga.' }
  if (!fechasLibres?.length) {
    return { ...REPROGRAMACION_VACIA, error: 'No quedan fechas por jugar: todas están en juego o terminadas.' }
  }

  // Soltar lo pendiente de esas fechas para que el motor lo reparta de nuevo.
  const { data: liberados, error: liberarErr } = await db
    .from('liga_partidos')
    .update({ fecha_id: null, mesa_id: null, bloque_horario: null, arbitro_id: null })
    .eq('liga_id', ligaId)
    .in('fecha_id', fechasLibres.map(f => f.id))
    .not('estado', 'in', '("finalizado","walkover")')
    .is('deleted_at', null)
    .select('id')
  if (liberarErr) {
    return { ...REPROGRAMACION_VACIA, error: 'No se pudieron liberar los partidos: ' + liberarErr.message }
  }

  const partidosLiberados: number = liberados?.length ?? 0
  const fechasRearmadas = fechasLibres.map(f => f.numero).sort((a, b) => a - b)

  const r = await generarProgramacionLiga({ ligaId })
  if ('error' in r && r.error) {
    return { ...REPROGRAMACION_VACIA, partidosLiberados, fechasRearmadas, error: r.error }
  }
  const ok = r as {
    totalProgramados?: number; totalSinProgramar?: number
    sinProgramarPorRestriccion?: number; sinProgramarPorEspacio?: number
    jugadoresQueNoEntraron?: string[]
  }

  return {
    totalProgramados: ok.totalProgramados ?? 0,
    totalSinProgramar: ok.totalSinProgramar ?? 0,
    sinProgramarPorRestriccion: ok.sinProgramarPorRestriccion ?? 0,
    sinProgramarPorEspacio: ok.sinProgramarPorEspacio ?? 0,
    jugadoresQueNoEntraron: ok.jugadoresQueNoEntraron ?? [],
    partidosLiberados,
    fechasRearmadas,
  }
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
      categoria: 'principiante', sesiones_limite: 0,
      estado: 'activo', es_externo: true,
    })
    .select('id, nombre')
    .single()
  if (error || !data) return { error: 'No se pudo crear el jugador externo: ' + (error?.message ?? '') }

  return { success: true, jugadorId: data.id, jugadorNombre: data.nombre }
}

// ─── CRUD básico de ligas/divisiones/mesas (módulo visible) ────────────────

export async function eliminarLiga(params: { ligaId: string }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { ligaId } = params
  const db = supabase as any

  // Verificar propiedad
  const { data: liga } = await supabase.from('ligas').select('id, club_id').eq('id', ligaId).single()
  if (!liga || liga.club_id !== clubId) return { error: 'Liga no encontrada o sin permiso' }

  // Obtener IDs de divisiones para eliminar hijos
  const { data: divs } = await supabase.from('liga_divisiones').select('id').eq('liga_id', ligaId)
  const divisionIds = (divs || []).map((d: { id: string }) => d.id)

  // Eliminar en orden correcto (hijos antes que padres)
  if (divisionIds.length > 0) {
    await Promise.all([
      db.from('liga_jugador_pagos').delete().in('division_id', divisionIds),
      db.from('liga_division_jugadores').delete().in('division_id', divisionIds),
    ])
  }
  await Promise.all([
    db.from('liga_partidos').delete().eq('liga_id', ligaId),
    supabase.from('liga_fechas').delete().eq('liga_id', ligaId),
    supabase.from('liga_mesas').delete().eq('liga_id', ligaId),
  ])
  if (divisionIds.length > 0) {
    await supabase.from('liga_divisiones').delete().eq('liga_id', ligaId)
  }
  const { error } = await supabase.from('ligas').delete().eq('id', ligaId)
  if (error) return { error: 'No se pudo eliminar: ' + error.message }

  return { success: true }
}

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

export async function actualizarCapacidadDivision(params: {
  divisionId: string
  capacidadMax: number | null
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { divisionId, capacidadMax } = params
  if (capacidadMax !== null && capacidadMax < 2) return { error: 'El cupo mínimo es 2 jugadores' }

  if (capacidadMax !== null) {
    const { count } = await supabase
      .from('liga_division_jugadores')
      .select('jugador_id', { count: 'exact', head: true })
      .eq('division_id', divisionId)
    if ((count ?? 0) > capacidadMax) {
      return { error: `Ya hay ${count} jugadores inscritos. El nuevo cupo no puede ser menor.` }
    }
  }

  const { error } = await supabase
    .from('liga_divisiones')
    .update({ capacidad_max: capacidadMax })
    .eq('id', divisionId)
  if (error) return { error: 'No se pudo actualizar el cupo: ' + error.message }

  return { success: true }
}

// ─── Estados de fecha + registro de resultados ─────────────────────────────

// "Iniciar Fecha": Programada → En Juego. Habilita el registro de
// resultados y bloquea la edición de horarios/mesas/árbitros (Sección 10).
export async function iniciarFecha(params: { fechaId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: fecha } = await supabase.from('liga_fechas').select('id, liga_id, estado').eq('id', params.fechaId).single()
  if (!fecha) return { error: 'Fecha no encontrada' }
  if (fecha.estado !== 'programada') return { error: 'Solo se puede iniciar una fecha que esté en estado "Programada"' }

  const { error } = await supabase.from('liga_fechas').update({ estado: 'en_juego' }).eq('id', params.fechaId)
  if (error) return { error: 'No se pudo iniciar la fecha: ' + error.message }

  // Primera fecha iniciada → liga pasa a "en_curso" (solo si sigue en planificación)
  await (supabase as any)
    .from('ligas')
    .update({ estado: 'en_curso' })
    .eq('id', fecha.liga_id)
    .eq('estado', 'planificacion')

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

// Corrige el resultado de un partido ya resuelto (finalizado o walkover).
// Convierte cualquier estado previo a "finalizado" con el nuevo marcador.
export async function editarResultadoPartido(params: {
  partidoId: string
  setsA: number
  setsB: number
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { partidoId, setsA, setsB } = params
  if (!esResultadoBo5Valido(setsA, setsB)) {
    return { error: 'Marcador inválido. Resultados permitidos en Mejor de 5: 3-0, 3-1, 3-2, 0-3, 1-3, 2-3' }
  }

  const { data: partido } = await supabase
    .from('liga_partidos')
    .select('id, jugador_a_id, jugador_b_id, estado')
    .eq('id', partidoId)
    .single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (!['finalizado', 'walkover'].includes(partido.estado)) {
    return { error: 'Solo se puede editar un resultado ya registrado' }
  }

  const ganadorId = determinarGanadorBo5(setsA, setsB, partido.jugador_a_id, partido.jugador_b_id)

  const { error } = await (supabase as any)
    .from('liga_partidos')
    .update({ sets_a: setsA, sets_b: setsB, ganador_id: ganadorId, estado: 'finalizado', es_walkover: false })
    .eq('id', partidoId)
  if (error) return { error: 'No se pudo actualizar: ' + error.message }

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

  // Guard atómico: solo escribe si sigue abierto (evita doble walkover concurrente)
  const { data: actualizado, error } = await supabase
    .from('liga_partidos')
    .update({ ganador_id: ganadorId, estado: 'walkover', es_walkover: true, sets_a: null, sets_b: null })
    .eq('id', partidoId)
    .not('estado', 'in', '("finalizado","walkover")')
    .select('id')
  if (error) return { error: 'No se pudo registrar el walkover: ' + error.message }
  if (!actualizado?.length) return { error: 'Este partido ya fue resuelto' }

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
export async function terminarFechaAction(params: { fechaId: string; forzar?: boolean }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { data: fecha } = await supabase
    .from('liga_fechas')
    .select('id, liga_id, es_ajuste')
    .eq('id', params.fechaId)
    .single()
  if (!fecha) return { error: 'Fecha no encontrada' }

  // Validar partidos pendientes (a menos que el usuario haya confirmado forzar)
  if (!params.forzar) {
    const { count } = await (supabase as any)
      .from('liga_partidos')
      .select('id', { count: 'exact', head: true })
      .eq('fecha_id', params.fechaId)
      .not('estado', 'in', '("finalizado","walkover","anulado")')
      .is('deleted_at', null)
    if ((count ?? 0) > 0) return { pendientes: count as number }
  }

  const { error } = await supabase
    .from('liga_fechas')
    .update({ estado: 'finalizada' })
    .eq('id', params.fechaId)
  if (error) return { error: 'No se pudo terminar la fecha: ' + error.message }

  // Fecha de reajuste: cierra la liga completa
  if (fecha.es_ajuste) {
    await supabase.from('ligas').update({ estado: 'finalizada' }).eq('id', fecha.liga_id)
    return { success: true, todasTerminadas: false, ligaFinalizada: true, ligaId: fecha.liga_id }
  }

  // Verificar si todas las fechas regulares quedaron finalizadas
  const { data: regularFechas } = await supabase
    .from('liga_fechas')
    .select('estado')
    .eq('liga_id', fecha.liga_id)
    .eq('es_ajuste', false)

  const todasTerminadas = (regularFechas || []).every(f => f.estado === 'finalizada')

  return { success: true, todasTerminadas, ligaFinalizada: false, ligaId: fecha.liga_id }
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

  // Los que NO están ya en reajuste: moverlos ahí sin mesa/bloque (batches paralelos)
  const toMoveIds = todos.filter(p => p.fecha_id !== fechaAjuste.id).map(p => p.id)
  if (toMoveIds.length > 0) {
    await Promise.all(
      Array.from({ length: Math.ceil(toMoveIds.length / 50) }, (_, i) =>
        supabase
          .from('liga_partidos')
          .update({ fecha_id: fechaAjuste.id, mesa_id: null, bloque_horario: null, arbitro_id: null })
          .in('id', toMoveIds.slice(i * 50, (i + 1) * 50)),
      ),
    )
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

  const reajusteResults = await Promise.all(
    conArbitros.map(p =>
      supabase.from('liga_partidos').update({
        mesa_id: mesaIdPorNumero.get(p.mesaNumero) ?? null,
        bloque_horario: p.bloqueHorario,
        arbitro_id: p.arbitroId,
      }).eq('id', p.id).then(r => ({ error: r.error })),
    ),
  )
  const exitosos = reajusteResults.filter(r => !r.error).length

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

// ─── Programar partidos sin fecha de una división (post add-jugador) ─────────
// Busca los partidos con fecha_id=null de la división, verifica slot a slot
// cuáles están libres en las fechas regulares (mesa sin ocupar + jugadores sin
// conflicto) y los asigna. El sobrante va a la fecha de ajuste.
// A diferencia de generarProgramacionLiga, conoce el ocupado real en BD antes
// de asignar → nunca produce conflictos HC-01/HC-03.
export async function programarNuevosPartidosDivision(params: { ligaId: string; divisionId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { ligaId, divisionId } = params
  const db = supabase as any

  const [
    { data: ligaConfig },
    { data: fechasReg },
    { data: fechaAjuste },
    { data: mesaRef },
    { data: rawNuevos },
  ] = await Promise.all([
    db.from('ligas').select('bloque_minutos').eq('id', ligaId).single(),
    supabase.from('liga_fechas').select('id, numero').eq('liga_id', ligaId).eq('es_ajuste', false).order('numero'),
    supabase.from('liga_fechas').select('id').eq('liga_id', ligaId).eq('es_ajuste', true).single(),
    db.from('liga_partidos').select('mesa_id').eq('division_id', divisionId).not('mesa_id', 'is', null).limit(1).single(),
    db.from('liga_partidos')
      .select('id, jugador_a_id, jugador_b_id')
      .eq('division_id', divisionId)
      .is('fecha_id', null)
      .is('deleted_at', null)
      .not('estado', 'in', '("finalizado","walkover")'),
  ])

  if (!rawNuevos?.length) return { success: true, programados: 0, enReajuste: 0 }

  const mesaId: string | null = mesaRef?.mesa_id ?? null
  if (!mesaId) return { error: 'Esta división no tiene mesa asignada. Generá la programación general primero.' }

  const bloqueMinutos: number = ligaConfig?.bloque_minutos ?? 30
  const bloques = generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, bloqueMinutos)
  const fechaIds = (fechasReg || []).map((f: { id: string }) => f.id)
  if (!fechaIds.length) return { error: 'No hay fechas regulares configuradas' }

  // Leer schedule actual de TODAS las fechas regulares para conocer ocupación real
  const { data: existentes } = await db
    .from('liga_partidos')
    .select('fecha_id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id')
    .eq('liga_id', ligaId)
    .in('fecha_id', fechaIds)
    .not('bloque_horario', 'is', null)
    .is('deleted_at', null)

  // ocupadosMesa[fechaId] = set de bloques ya tomados en la mesa de esta división
  // jugandoSlot[fechaId::bloque] = set de jugadores jugando en ese slot (toda la liga)
  const ocupadosMesa = new Map<string, Set<string>>()
  const jugandoSlot = new Map<string, Set<string>>()

  for (const p of (existentes || []) as Array<{ fecha_id: string; mesa_id: string; bloque_horario: string; jugador_a_id: string; jugador_b_id: string }>) {
    const bl = normalizarBloque(p.bloque_horario)
    if (!bl) continue
    if (p.mesa_id === mesaId) {
      if (!ocupadosMesa.has(p.fecha_id)) ocupadosMesa.set(p.fecha_id, new Set())
      ocupadosMesa.get(p.fecha_id)!.add(bl)
    }
    const slot = `${p.fecha_id}::${bl}`
    if (!jugandoSlot.has(slot)) jugandoSlot.set(slot, new Set())
    jugandoSlot.get(slot)!.add(p.jugador_a_id)
    jugandoSlot.get(slot)!.add(p.jugador_b_id)
  }

  const nuevos = (rawNuevos || []) as Array<{ id: string; jugador_a_id: string; jugador_b_id: string }>
  const aProgramar: Array<{ id: string; fechaId: string; bloqueHorario: string }> = []
  const aReajusteIds: string[] = []

  for (const m of nuevos) {
    let asignado = false
    outer: for (const fecha of (fechasReg || []) as Array<{ id: string; numero: number }>) {
      const ocup = ocupadosMesa.get(fecha.id) ?? new Set<string>()
      for (const bloque of bloques) {
        if (ocup.has(bloque)) continue
        const slot = `${fecha.id}::${bloque}`
        const jugando = jugandoSlot.get(slot) ?? new Set<string>()
        if (jugando.has(m.jugador_a_id) || jugando.has(m.jugador_b_id)) continue

        aProgramar.push({ id: m.id, fechaId: fecha.id, bloqueHorario: bloque })
        ocup.add(bloque)
        ocupadosMesa.set(fecha.id, ocup)
        const s2 = jugandoSlot.get(slot) ?? new Set<string>()
        s2.add(m.jugador_a_id); s2.add(m.jugador_b_id)
        jugandoSlot.set(slot, s2)
        asignado = true
        break outer
      }
    }
    if (!asignado) aReajusteIds.push(m.id)
  }

  await Promise.all([
    ...aProgramar.map(p =>
      supabase.from('liga_partidos').update({
        fecha_id: p.fechaId, mesa_id: mesaId, bloque_horario: p.bloqueHorario,
      }).eq('id', p.id),
    ),
    ...(aReajusteIds.length > 0 && fechaAjuste
      ? [supabase.from('liga_partidos').update({ fecha_id: fechaAjuste.id }).in('id', aReajusteIds)]
      : []),
  ])

  return { success: true, programados: aProgramar.length, enReajuste: aReajusteIds.length }
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
