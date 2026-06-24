'use server'

import { createClient } from '@/lib/supabase/server'
import {
  generarFixtureDivision,
  generarBloquesHorario,
  distribuirEnFechas,
  programarFecha,
  asignarArbitros,
  validarMovimientoPartido,
  esResultadoBo5Valido,
  determinarGanadorBo5,
  type PartidoAProgramar,
  type PartidoProgramado,
  type PartidoExistente,
} from '@/lib/domain/liga'

async function requireAdminClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, clubId: null }
  const { data: perfil } = await supabase.from('perfiles').select('club_id,rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin' || !perfil.club_id) return { error: 'Acceso denegado' as const, supabase: null, clubId: null }
  return { error: null, supabase, clubId: perfil.club_id }
}

// Asigna la lista de jugadores de una división. Si la división ya tiene
// fixture generado, exige `regenerarFixture: true` (borra fixture y
// resultados existentes) — evita modificaciones accidentales de jugadores
// con partidos ya generados.
export async function asignarJugadoresDivision(params: {
  divisionId: string
  jugadorIds: string[]
  regenerarFixture?: boolean
}) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { divisionId, jugadorIds, regenerarFixture } = params
  const idsUnicos = Array.from(new Set(jugadorIds))
  if (idsUnicos.length < 2) return { error: 'Una división necesita al menos 2 jugadores' }

  const { data: division } = await supabase.from('liga_divisiones').select('id, fixture_generado').eq('id', divisionId).single()
  if (!division) return { error: 'División no encontrada' }

  if (division.fixture_generado && !regenerarFixture) {
    return { error: 'La división ya tiene fixture generado. Confirma la regeneración para modificar la lista de jugadores.' }
  }

  if (division.fixture_generado && regenerarFixture) {
    await supabase.from('liga_partidos').delete().eq('division_id', divisionId)
    await supabase.from('liga_divisiones').update({ fixture_generado: false }).eq('id', divisionId)
  }

  await supabase.from('liga_division_jugadores').delete().eq('division_id', divisionId)
  await supabase.from('liga_division_jugadores').insert(
    idsUnicos.map(jugadorId => ({ division_id: divisionId, jugador_id: jugadorId })),
  )

  return { success: true, totalJugadores: idsUnicos.length }
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

// Motor de programación (Paso 3): toma todos los partidos pendientes
// (sin fecha asignada) de la liga y les asigna fecha (1-4), mesa y bloque
// horario, además del árbitro. La Fecha 5 (ajuste) queda fuera de la
// programación inicial — se reserva para incidencias (Paso 6).
export async function generarProgramacionLiga(params: { ligaId: string }) {
  const { error: authErr, supabase } = await requireAdminClub()
  if (authErr) return { error: authErr }

  const { ligaId } = params

  const { data: fechas } = await supabase
    .from('liga_fechas')
    .select('id, numero')
    .eq('liga_id', ligaId)
    .eq('es_ajuste', false)
    .order('numero', { ascending: true })

  const { data: mesas } = await supabase
    .from('liga_mesas')
    .select('id, numero')
    .eq('liga_id', ligaId)
    .order('numero', { ascending: true })

  if (!fechas?.length) return { error: 'Crea primero las fechas regulares de la liga (1 a 4)' }
  if (!mesas?.length) return { error: 'Crea primero las mesas disponibles de la liga' }

  const { data: partidosPendientes } = await supabase
    .from('liga_partidos')
    .select('id, division_id, jugador_a_id, jugador_b_id, orden_fixture')
    .eq('liga_id', ligaId)
    .is('fecha_id', null)
    .order('orden_fixture', { ascending: true })

  if (!partidosPendientes?.length) return { error: 'No hay partidos pendientes por programar' }

  const divisionIds = Array.from(new Set(partidosPendientes.map(p => p.division_id)))
  const { data: divisionJugadores } = await supabase
    .from('liga_division_jugadores')
    .select('division_id, jugador_id')
    .in('division_id', divisionIds)

  const jugadoresPorDivision = new Map<string, string[]>()
  for (const dj of divisionJugadores || []) {
    const arr = jugadoresPorDivision.get(dj.division_id) ?? []
    arr.push(dj.jugador_id)
    jugadoresPorDivision.set(dj.division_id, arr)
  }

  const aProgramar: PartidoAProgramar[] = partidosPendientes.map(p => ({
    id: p.id,
    divisionId: p.division_id,
    jugadorAId: p.jugador_a_id,
    jugadorBId: p.jugador_b_id,
    ordenFixture: p.orden_fixture,
  }))

  const bloques = generarBloquesHorario()
  const mesasNumeros = mesas.map(m => m.numero)
  const capacidadPorFecha = mesasNumeros.length * bloques.length

  const { fechas: chunks, sobrantes } = distribuirEnFechas(aProgramar, fechas.length, capacidadPorFecha)

  const todosProgramados: PartidoProgramado[] = []
  const sinAsignarTotal: PartidoAProgramar[] = [...sobrantes]
  let carryOver: PartidoAProgramar[] = []

  for (let i = 0; i < fechas.length; i++) {
    const cola = [...carryOver, ...chunks[i]]
    if (cola.length === 0) continue
    const { programados, sinAsignar } = programarFecha(cola, fechas[i].numero, mesasNumeros, bloques)
    todosProgramados.push(...programados)
    carryOver = i < fechas.length - 1 ? sinAsignar : []
    if (i === fechas.length - 1) sinAsignarTotal.push(...sinAsignar)
  }

  const conArbitros = asignarArbitros(todosProgramados, jugadoresPorDivision)

  const fechaIdPorNumero = new Map(fechas.map(f => [f.numero, f.id]))
  const mesaIdPorNumero = new Map(mesas.map(m => [m.numero, m.id]))

  const tamanoLote = 25
  for (let i = 0; i < conArbitros.length; i += tamanoLote) {
    const lote = conArbitros.slice(i, i + tamanoLote)
    await Promise.all(
      lote.map(p =>
        supabase
          .from('liga_partidos')
          .update({
            fecha_id: fechaIdPorNumero.get(p.fechaNumero) ?? null,
            mesa_id: mesaIdPorNumero.get(p.mesaNumero) ?? null,
            bloque_horario: p.bloqueHorario,
            arbitro_id: p.arbitroId,
          })
          .eq('id', p.id),
      ),
    )
  }

  return {
    success: true,
    totalProgramados: conArbitros.length,
    totalSinProgramar: sinAsignarTotal.length,
    sinProgramarIds: sinAsignarTotal.map(p => p.id),
  }
}

// Mueve un partido a otra mesa/bloque (misma fecha o distinta) validando en
// el servidor las reglas inquebrantables (HC-01, HC-03/06, HC-04). Usado por
// la interfaz de Drag & Drop (Paso 4).
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

  const { data: partidosFecha } = await supabase
    .from('liga_partidos')
    .select('id, fecha_id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id, arbitro_id')
    .eq('fecha_id', fechaId)

  const aPartidoExistente = (p: { id: string; fecha_id: string | null; mesa_id: string | null; bloque_horario: string | null; jugador_a_id: string; jugador_b_id: string; arbitro_id: string | null }): PartidoExistente => ({
    id: p.id,
    fechaId: p.fecha_id,
    mesaId: p.mesa_id,
    bloqueHorario: p.bloque_horario,
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
    const { data: partidosFecha } = await supabase
      .from('liga_partidos')
      .select('id, fecha_id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id, arbitro_id')
      .eq('fecha_id', partido.fecha_id)

    const aPartidoExistente = (p: typeof partido & { arbitro_id?: string | null }): PartidoExistente => ({
      id: p.id,
      fechaId: p.fecha_id,
      mesaId: p.mesa_id,
      bloqueHorario: p.bloque_horario,
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

// ─── CRUD básico de ligas/divisiones/mesas (módulo visible) ────────────────

export async function crearLiga(params: { nombre: string; numDivisiones?: number; jugadoresPorDivision?: number }) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr) return { error: authErr }
  if (!params.nombre.trim()) return { error: 'El nombre es obligatorio' }

  const { data: liga, error } = await supabase
    .from('ligas')
    .insert({ club_id: clubId, nombre: params.nombre.trim() })
    .select('id')
    .single()
  if (error || !liga) return { error: 'No se pudo crear la liga: ' + (error?.message ?? '') }

  // 5 fechas: 1-4 regulares, 5 de ajuste (Anexo A / Sección 4)
  await supabase.from('liga_fechas').insert(
    [1, 2, 3, 4, 5].map(numero => ({ liga_id: liga.id, numero, es_ajuste: numero === 5 })),
  )

  // Anexo B: si se especifica cantidad de divisiones, se crean automáticamente
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

// ─── Estados de fecha + registro de resultados (Paso 5) ───────────────────

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
  if (partido.estado === 'finalizado') return { error: 'Este partido ya tiene un resultado registrado' }
  if (!['programado', 'en_juego'].includes(partido.estado)) {
    return { error: 'Este partido no está en condiciones de recibir un resultado (walkover/pendiente se resuelven aparte)' }
  }

  if (!partido.fecha_id) return { error: 'El partido no tiene una fecha asignada' }
  const { data: fecha } = await supabase.from('liga_fechas').select('estado').eq('id', partido.fecha_id).single()
  if (!fecha || fecha.estado !== 'en_juego') {
    return { error: 'Solo se pueden registrar resultados en una fecha "En Juego". Inicia la fecha primero.' }
  }

  const ganadorId = determinarGanadorBo5(setsA, setsB, partido.jugador_a_id, partido.jugador_b_id)

  const { error } = await supabase
    .from('liga_partidos')
    .update({ sets_a: setsA, sets_b: setsB, ganador_id: ganadorId, estado: 'finalizado', observaciones: observaciones || null })
    .eq('id', partidoId)
  if (error) return { error: 'No se pudo registrar el resultado: ' + error.message }

  return { success: true, ganadorId }
}

// ─── Partidos no jugados (Paso 6) ──────────────────────────────────────────
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
  if (!['programado', 'en_juego'].includes(partido.estado)) {
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
  if (!['programado', 'en_juego'].includes(partido.estado)) {
    return { error: 'Este partido ya fue resuelto' }
  }

  const { data: fechaAjuste } = await supabase
    .from('liga_fechas')
    .select('id')
    .eq('liga_id', partido.liga_id)
    .eq('es_ajuste', true)
    .single()
  if (!fechaAjuste) return { error: 'Esta liga no tiene Fecha 5 (ajuste) configurada' }

  const { error } = await supabase
    .from('liga_partidos')
    .update({ fecha_id: fechaAjuste.id, mesa_id: null, bloque_horario: null, estado: 'pendiente' })
    .eq('id', params.partidoId)
  if (error) return { error: 'No se pudo reprogramar el partido: ' + error.message }

  return { success: true }
}
