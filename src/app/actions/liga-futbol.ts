'use server'

import { requireAdminClub } from '@/lib/auth/require'
import { fechaChile } from '@/lib/domain/fechaChile'
import {
  generarFixtureEquipos, generarFixtureGrupos, totalFechas, asignarHorarios, sumarDias, calcularMarcador,
  calcularTablaPosiciones, clasificarPorTabla, clasificarPorGrupos, generarBracketPlayoffs, armarSiguienteRonda,
  siguienteFasePlayoff, ganadorPartido, perdedorPartido, type FasePlayoff, type EquipoStats,
} from '@/lib/domain/liga-futbol'

function generarCodigoPublico(nombre: string): string {
  const base = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6)
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${base || 'LIGA'}${rand}`
}

// ─── Liga ───────────────────────────────────────────────────────────────

export async function crearLigaFutbol(params: {
  nombre: string
  deporte_variante?: string
  categoria?: string
  formato?: string
  max_equipos?: number
  ruedas?: number
  dia_juego?: string
  horarios?: string[]
  cancha?: string
  direccion_cancha?: string
  monto_inscripcion?: number
  fecha_inicio?: string
  fecha_fin?: string
  puntos_victoria?: number
  puntos_empate?: number
  puntos_derrota?: number
  puntos_wo_perdedor?: number
  goles_wo_favor?: number
  goles_wo_contra?: number
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión', ligaId: null }

  const nombre = params.nombre?.trim()
  if (!nombre) return { error: 'El nombre es obligatorio', ligaId: null }

  const codigo = generarCodigoPublico(nombre)

  const { data, error } = await supabase.from('lf_ligas').insert({
    club_id: clubId,
    nombre,
    deporte_variante: params.deporte_variante || 'futbol_7',
    categoria: params.categoria || 'todo_competidor',
    formato: params.formato || 'todos_vs_todos',
    max_equipos: params.max_equipos || 12,
    ruedas: params.ruedas || 1,
    dia_juego: params.dia_juego || null,
    horarios: params.horarios || [],
    cancha: params.cancha || null,
    direccion_cancha: params.direccion_cancha || null,
    monto_inscripcion: params.monto_inscripcion || 0,
    fecha_inicio: params.fecha_inicio || null,
    fecha_fin: params.fecha_fin || null,
    puntos_victoria: params.puntos_victoria ?? 3,
    puntos_empate: params.puntos_empate ?? 1,
    puntos_derrota: params.puntos_derrota ?? 0,
    puntos_wo_perdedor: params.puntos_wo_perdedor ?? 0,
    goles_wo_favor: params.goles_wo_favor ?? 3,
    goles_wo_contra: params.goles_wo_contra ?? 0,
    codigo_publico: codigo,
  }).select('id').single()

  if (error) return { error: error.message, ligaId: null }
  return { error: null, ligaId: data.id }
}

export async function editarLigaFutbol(ligaId: string, params: {
  nombre?: string
  deporte_variante?: string
  categoria?: string
  formato?: string
  max_equipos?: number
  ruedas?: number
  dia_juego?: string | null
  horarios?: string[]
  cancha?: string | null
  direccion_cancha?: string | null
  monto_inscripcion?: number
  fecha_inicio?: string | null
  fecha_fin?: string | null
  puntos_victoria?: number
  puntos_empate?: number
  puntos_derrota?: number
  puntos_wo_perdedor?: number
  goles_wo_favor?: number
  goles_wo_contra?: number
  reglamento?: string | null
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { error } = await supabase.from('lf_ligas')
    .update({ ...params, actualizado_en: new Date().toISOString() })
    .eq('id', ligaId)
    .eq('club_id', clubId)

  if (error) return { error: error.message }
  return { error: null }
}

export async function eliminarLigaFutbol(ligaId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: liga } = await supabase.from('lf_ligas')
    .select('estado').eq('id', ligaId).eq('club_id', clubId).single()
  if (!liga) return { error: 'Liga no encontrada' }
  if (liga.estado !== 'inscripcion') return { error: 'Solo se puede eliminar una liga en estado de inscripción' }

  const { error } = await supabase.from('lf_ligas').delete().eq('id', ligaId).eq('club_id', clubId)
  if (error) return { error: error.message }
  return { error: null }
}

// Copia la configuración de una liga para armar la siguiente temporada
// (ej. "Apertura 2026" → "Clausura 2026"): mismos equipos, plantillas y
// reglas, pero sin fixture, resultados ni pagos — arranca de cero.
export async function clonarLigaFutbol(ligaId: string, nuevoNombre: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión', ligaId: null }

  const nombre = nuevoNombre?.trim()
  if (!nombre) return { error: 'El nombre es obligatorio', ligaId: null }

  const { data: original } = await supabase.from('lf_ligas').select('*').eq('id', ligaId).eq('club_id', clubId).single()
  if (!original) return { error: 'Liga no encontrada', ligaId: null }

  const { data: nueva, error: errLiga } = await supabase.from('lf_ligas').insert({
    club_id: clubId,
    nombre,
    deporte_variante: original.deporte_variante,
    categoria: original.categoria,
    formato: original.formato,
    max_equipos: original.max_equipos,
    ruedas: original.ruedas,
    dia_juego: original.dia_juego,
    horarios: original.horarios,
    cancha: original.cancha,
    direccion_cancha: original.direccion_cancha,
    monto_inscripcion: original.monto_inscripcion,
    puntos_victoria: original.puntos_victoria,
    puntos_empate: original.puntos_empate,
    puntos_derrota: original.puntos_derrota,
    puntos_wo_perdedor: original.puntos_wo_perdedor,
    goles_wo_favor: original.goles_wo_favor,
    goles_wo_contra: original.goles_wo_contra,
    fechas_suspension_roja: original.fechas_suspension_roja,
    amarillas_acumulacion_suspension: original.amarillas_acumulacion_suspension,
    amarillas_acumulacion_fechas: original.amarillas_acumulacion_fechas,
    cupos_playoffs: original.cupos_playoffs,
    tercer_lugar: original.tercer_lugar,
    reglamento: original.reglamento,
    codigo_publico: generarCodigoPublico(nombre),
  }).select('id').single()
  if (errLiga || !nueva) return { error: errLiga?.message ?? 'No se pudo crear la liga', ligaId: null }

  const { data: gruposOriginales } = await supabase.from('lf_grupos').select('*').eq('liga_id', ligaId).order('orden')
  const mapaGrupos = new Map<string, string>()
  if (gruposOriginales && gruposOriginales.length > 0) {
    const { data: gruposNuevos } = await supabase.from('lf_grupos').insert(
      gruposOriginales.map(g => ({ liga_id: nueva.id, nombre: g.nombre, orden: g.orden, clasifican: g.clasifican })),
    ).select('id')
    gruposOriginales.forEach((g, i) => { if (gruposNuevos?.[i]) mapaGrupos.set(g.id, gruposNuevos[i].id) })
  }

  const { data: equiposOriginales } = await supabase.from('lf_equipos').select('*').eq('liga_id', ligaId)
  const mapaEquipos = new Map<string, string>()
  if (equiposOriginales && equiposOriginales.length > 0) {
    const { data: equiposNuevos } = await supabase.from('lf_equipos').insert(
      equiposOriginales.map(e => ({
        liga_id: nueva.id,
        grupo_id: e.grupo_id ? mapaGrupos.get(e.grupo_id) ?? null : null,
        nombre: e.nombre, logo_url: e.logo_url, color_principal: e.color_principal, color_secundario: e.color_secundario,
        delegado_nombre: e.delegado_nombre, delegado_telefono: e.delegado_telefono, delegado_email: e.delegado_email,
      })),
    ).select('id')
    equiposOriginales.forEach((e, i) => { if (equiposNuevos?.[i]) mapaEquipos.set(e.id, equiposNuevos[i].id) })

    const { data: jugadoresOriginales } = await supabase.from('lf_jugadores')
      .select('*').in('equipo_id', equiposOriginales.map(e => e.id))
    if (jugadoresOriginales && jugadoresOriginales.length > 0) {
      await supabase.from('lf_jugadores').insert(
        jugadoresOriginales.map(j => ({
          equipo_id: mapaEquipos.get(j.equipo_id)!,
          nombre: j.nombre, rut: j.rut, numero: j.numero, posicion: j.posicion, fecha_nacimiento: j.fecha_nacimiento,
        })),
      )
    }
  }

  return { error: null, ligaId: nueva.id }
}

// ─── Equipos ────────────────────────────────────────────────────────────

export async function crearEquipo(params: {
  liga_id: string
  nombre: string
  delegado_nombre?: string
  delegado_telefono?: string
  delegado_email?: string
  color_principal?: string
  color_secundario?: string
  observaciones?: string
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión', equipoId: null }

  const nombre = params.nombre?.trim()
  if (!nombre) return { error: 'El nombre del equipo es obligatorio', equipoId: null }

  const { data: liga } = await supabase.from('lf_ligas')
    .select('id, max_equipos, club_id').eq('id', params.liga_id).single()
  if (!liga || liga.club_id !== clubId) return { error: 'Liga no encontrada', equipoId: null }

  const { count } = await supabase.from('lf_equipos')
    .select('id', { count: 'exact', head: true }).eq('liga_id', params.liga_id)
  if ((count ?? 0) >= liga.max_equipos) return { error: `Ya se alcanzó el máximo de ${liga.max_equipos} equipos`, equipoId: null }

  const { data, error } = await supabase.from('lf_equipos').insert({
    liga_id: params.liga_id,
    nombre,
    delegado_nombre: params.delegado_nombre || null,
    delegado_telefono: params.delegado_telefono || null,
    delegado_email: params.delegado_email || null,
    color_principal: params.color_principal || null,
    color_secundario: params.color_secundario || null,
    observaciones: params.observaciones || null,
  }).select('id').single()

  if (error) return { error: error.message, equipoId: null }
  return { error: null, equipoId: data.id }
}

export async function editarEquipo(equipoId: string, params: {
  nombre?: string
  delegado_nombre?: string | null
  delegado_telefono?: string | null
  delegado_email?: string | null
  color_principal?: string | null
  color_secundario?: string | null
  observaciones?: string | null
  grupo_id?: string | null
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: equipo } = await supabase.from('lf_equipos')
    .select('liga_id, lf_ligas!inner(club_id)').eq('id', equipoId).single() as any
  if (!equipo || equipo.lf_ligas?.club_id !== clubId) return { error: 'Equipo no encontrado' }

  const { error } = await supabase.from('lf_equipos').update(params).eq('id', equipoId)
  if (error) return { error: error.message }
  return { error: null }
}

export async function eliminarEquipo(equipoId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: equipo } = await supabase.from('lf_equipos')
    .select('liga_id, lf_ligas!inner(club_id)').eq('id', equipoId).single() as any
  if (!equipo || equipo.lf_ligas?.club_id !== clubId) return { error: 'Equipo no encontrado' }

  const { count } = await supabase.from('lf_partidos')
    .select('id', { count: 'exact', head: true })
    .or(`equipo_local_id.eq.${equipoId},equipo_visita_id.eq.${equipoId}`)
    .in('estado', ['en_curso', 'finalizado', 'wo'])
  if ((count ?? 0) > 0) return { error: 'No se puede eliminar un equipo con partidos jugados' }

  const { error } = await supabase.from('lf_equipos').delete().eq('id', equipoId)
  if (error) return { error: error.message }
  return { error: null }
}

export async function registrarPagoEquipo(equipoId: string, monto: number, metodo?: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  if (monto <= 0) return { error: 'El monto debe ser mayor a 0' }

  const { data: equipo } = await supabase.from('lf_equipos')
    .select('nombre, monto_pagado, liga_id, lf_ligas!inner(club_id, nombre, monto_inscripcion)').eq('id', equipoId).single() as any
  if (!equipo || equipo.lf_ligas?.club_id !== clubId) return { error: 'Equipo no encontrado' }

  const nuevoPagado = (equipo.monto_pagado || 0) + monto
  const inscripcion = equipo.lf_ligas.monto_inscripcion || 0
  const estado = nuevoPagado >= inscripcion ? 'pagado' : 'abonado'

  const { error } = await supabase.from('lf_equipos')
    .update({ monto_pagado: nuevoPagado, estado_inscripcion: estado })
    .eq('id', equipoId)
  if (error) return { error: error.message }

  // El pago del equipo ya quedó registrado arriba pase lo que pase acá abajo:
  // si el club no tiene Finanzas o el RPC falla, no le decimos al admin que el
  // cobro no se hizo cuando el dinero sí entró.
  const { data: club } = await supabase.from('clubes').select('modulos_habilitados').eq('id', clubId).single()
  const finanzasHabilitada = !club?.modulos_habilitados || club.modulos_habilitados.includes('finanzas')
  if (finanzasHabilitada) {
    const descripcion = `${equipo.lf_ligas.nombre} - ${equipo.nombre}${metodo ? ` (${metodo})` : ''}`
    await supabase.rpc('registrar_movimiento_financiero_atomico', {
      p_tipo: 'ingreso',
      p_categoria: 'inscripcion_liga',
      p_descripcion: descripcion,
      p_monto: monto,
      p_fecha: fechaChile(),
      p_profesor_id: null,
      p_mes_correspondiente: null,
      p_anio_correspondiente: null,
      p_idempotency_key: crypto.randomUUID(),
    })
  }

  return { error: null }
}

// ─── Jugadores de equipo ────────────────────────────────────────────────

export async function crearJugadorEquipo(params: {
  equipo_id: string
  nombre: string
  rut?: string
  numero?: number
  posicion?: string
  fecha_nacimiento?: string
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión', jugadorId: null }

  const nombre = params.nombre?.trim()
  if (!nombre) return { error: 'El nombre es obligatorio', jugadorId: null }

  const { data: equipo } = await supabase.from('lf_equipos')
    .select('liga_id, lf_ligas!inner(club_id)').eq('id', params.equipo_id).single() as any
  if (!equipo || equipo.lf_ligas?.club_id !== clubId) return { error: 'Equipo no encontrado', jugadorId: null }

  const { data, error } = await supabase.from('lf_jugadores').insert({
    equipo_id: params.equipo_id,
    nombre,
    rut: params.rut || null,
    numero: params.numero ?? null,
    posicion: params.posicion || null,
    fecha_nacimiento: params.fecha_nacimiento || null,
  }).select('id').single()

  if (error) return { error: error.message, jugadorId: null }
  return { error: null, jugadorId: data.id }
}

export async function editarJugadorEquipo(jugadorId: string, params: {
  nombre?: string
  rut?: string | null
  numero?: number | null
  posicion?: string | null
  fecha_nacimiento?: string | null
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: jugador } = await supabase.from('lf_jugadores')
    .select('equipo_id, lf_equipos!inner(liga_id, lf_ligas!inner(club_id))').eq('id', jugadorId).single() as any
  if (!jugador || jugador.lf_equipos?.lf_ligas?.club_id !== clubId) return { error: 'Jugador no encontrado' }

  const { error } = await supabase.from('lf_jugadores').update(params).eq('id', jugadorId)
  if (error) return { error: error.message }
  return { error: null }
}

export async function eliminarJugadorEquipo(jugadorId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: jugador } = await supabase.from('lf_jugadores')
    .select('equipo_id, lf_equipos!inner(liga_id, lf_ligas!inner(club_id))').eq('id', jugadorId).single() as any
  if (!jugador || jugador.lf_equipos?.lf_ligas?.club_id !== clubId) return { error: 'Jugador no encontrado' }

  const { error } = await supabase.from('lf_jugadores').delete().eq('id', jugadorId)
  if (error) return { error: error.message }
  return { error: null }
}

// ─── Grupos ─────────────────────────────────────────────────────────────

export async function crearGrupo(ligaId: string, nombre: string, clasifican?: number) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión', grupoId: null }

  const { data: liga } = await supabase.from('lf_ligas')
    .select('formato, club_id').eq('id', ligaId).single()
  if (!liga || liga.club_id !== clubId) return { error: 'Liga no encontrada', grupoId: null }
  if (liga.formato !== 'grupos_playoffs') return { error: 'Solo aplica para formato grupos + playoffs', grupoId: null }

  const { count } = await supabase.from('lf_grupos')
    .select('id', { count: 'exact', head: true }).eq('liga_id', ligaId)

  const { data, error } = await supabase.from('lf_grupos').insert({
    liga_id: ligaId,
    nombre: nombre?.trim() || `Grupo ${String.fromCharCode(65 + (count ?? 0))}`,
    orden: (count ?? 0),
    clasifican: clasifican ?? 2,
  }).select('id').single()

  if (error) return { error: error.message, grupoId: null }
  return { error: null, grupoId: data.id }
}

export async function asignarEquipoAGrupo(equipoId: string, grupoId: string | null) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: equipo } = await supabase.from('lf_equipos')
    .select('liga_id, lf_ligas!inner(club_id)').eq('id', equipoId).single() as any
  if (!equipo || equipo.lf_ligas?.club_id !== clubId) return { error: 'Equipo no encontrado' }

  const { error } = await supabase.from('lf_equipos')
    .update({ grupo_id: grupoId }).eq('id', equipoId)
  if (error) return { error: error.message }
  return { error: null }
}

// ─── Fixture ────────────────────────────────────────────────────────────

// Genera (o regenera) el calendario completo de la liga: borra fechas y
// partidos existentes y crea uno nuevo desde cero. Solo tiene sentido antes
// de que arranque la liga — una vez jugada una fecha, los partidos se
// reprograman individualmente, no se regenera todo.
export async function generarFixtureLiga(ligaId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: liga } = await supabase.from('lf_ligas')
    .select('id, club_id, formato, ruedas, horarios, fecha_inicio, cancha').eq('id', ligaId).single()
  if (!liga || liga.club_id !== clubId) return { error: 'Liga no encontrada' }

  const { data: equipos } = await supabase.from('lf_equipos')
    .select('id, grupo_id').eq('liga_id', ligaId)
  if (!equipos || equipos.length < 2) return { error: 'Se necesitan al menos 2 equipos para generar el fixture' }

  let partidos
  if (liga.formato === 'grupos_playoffs') {
    const { data: grupos } = await supabase.from('lf_grupos').select('id').eq('liga_id', ligaId).order('orden')
    if (!grupos || grupos.length === 0) return { error: 'Creá al menos un grupo antes de generar el fixture' }
    const sinGrupo = equipos.filter(e => !e.grupo_id)
    if (sinGrupo.length > 0) return { error: `Hay ${sinGrupo.length} equipo(s) sin grupo asignado` }
    partidos = generarFixtureGrupos(
      grupos.map(g => ({ id: g.id, equipoIds: equipos.filter(e => e.grupo_id === g.id).map(e => e.id) })),
      liga.ruedas,
    )
  } else {
    partidos = generarFixtureEquipos(equipos.map(e => e.id), liga.ruedas)
  }

  if (partidos.length === 0) return { error: 'No se pudo generar el fixture con los equipos actuales' }

  // Borra fixture previo (solo lo no jugado — si ya hay partidos finalizados no debería haberse llegado hasta acá,
  // pero por seguridad no se toca nada con estado distinto de 'programado').
  const { data: fechasExistentes } = await supabase.from('lf_fechas')
    .select('id').eq('liga_id', ligaId).eq('es_playoff', false)
  const fechaIds = (fechasExistentes || []).map(f => f.id)
  if (fechaIds.length > 0) {
    const { count: jugados } = await supabase.from('lf_partidos')
      .select('id', { count: 'exact', head: true })
      .in('fecha_id', fechaIds)
      .not('estado', 'in', '(programado)')
    if ((jugados ?? 0) > 0) return { error: 'Ya hay partidos jugados: no se puede regenerar el fixture completo' }

    // Si el delete falla, el fixture nuevo se crea ENCIMA del viejo sin
    // avisar: mismo patrón que dejó grupos duplicados en torneos (migraciones
    // 213/214 de la auditoría 2026-08-26).
    const { error: errBorrarPartidos } = await supabase.from('lf_partidos').delete().in('fecha_id', fechaIds)
    if (errBorrarPartidos) return { error: 'No se pudo borrar el fixture anterior: ' + errBorrarPartidos.message }
    const { error: errBorrarFechas } = await supabase.from('lf_fechas').delete().in('id', fechaIds)
    if (errBorrarFechas) return { error: 'No se pudieron borrar las fechas anteriores: ' + errBorrarFechas.message }
  }

  const numFechas = totalFechas(partidos)
  const horarios = liga.horarios || []
  const fechaBase = liga.fecha_inicio

  const fechasAInsertar = Array.from({ length: numFechas }, (_, i) => ({
    liga_id: ligaId,
    numero: i + 1,
    nombre: `Fecha ${i + 1}`,
    fecha: fechaBase ? sumarDias(fechaBase, i * 7) : null,
    es_playoff: false,
  }))

  const { data: fechasCreadas, error: errFechas } = await supabase.from('lf_fechas')
    .insert(fechasAInsertar).select('id, numero')
  if (errFechas || !fechasCreadas) return { error: errFechas?.message ?? 'No se pudieron crear las fechas' }

  const fechaIdPorNumero = new Map(fechasCreadas.map(f => [f.numero, f.id]))

  const partidosAInsertar = Object.entries(
    partidos.reduce<Record<number, typeof partidos>>((acc, p) => {
      (acc[p.ronda] ??= []).push(p)
      return acc
    }, {}),
  ).flatMap(([ronda, deLaRonda]) =>
    asignarHorarios(deLaRonda, horarios).map(p => ({
      liga_id: ligaId,
      fecha_id: fechaIdPorNumero.get(Number(ronda)) ?? null,
      grupo_id: p.grupoId ?? null,
      equipo_local_id: p.equipoLocalId,
      equipo_visita_id: p.equipoVisitaId,
      hora: p.hora,
      cancha: liga.cancha,
      estado: 'programado',
    })),
  )

  const { error: errPartidos } = await supabase.from('lf_partidos').insert(partidosAInsertar)
  if (errPartidos) return { error: errPartidos.message }

  const { error: errEstado } = await supabase.from('lf_ligas')
    .update({ estado: 'en_curso' }).eq('id', ligaId).eq('estado', 'inscripcion')
  if (errEstado) return { error: 'El fixture se creó, pero la liga no pasó a "en curso": ' + errEstado.message }

  return { error: null }
}

export async function reprogramarPartido(partidoId: string, params: {
  fecha_id?: string | null
  nueva_fecha?: string | null
  nueva_hora?: string | null
  cancha?: string | null
  observaciones?: string | null
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: partido } = await supabase.from('lf_partidos')
    .select('liga_id, lf_ligas!inner(club_id)').eq('id', partidoId).single() as any
  if (!partido || partido.lf_ligas?.club_id !== clubId) return { error: 'Partido no encontrado' }

  const estado = params.nueva_fecha || params.nueva_hora ? 'reprogramado' : undefined

  const { error } = await supabase.from('lf_partidos')
    .update({ ...params, ...(estado && { estado }) })
    .eq('id', partidoId)
  if (error) return { error: error.message }
  return { error: null }
}

export async function intercambiarLocalVisita(partidoId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: partido } = await supabase.from('lf_partidos')
    .select('equipo_local_id, equipo_visita_id, estado, liga_id, lf_ligas!inner(club_id)')
    .eq('id', partidoId).single() as any
  if (!partido || partido.lf_ligas?.club_id !== clubId) return { error: 'Partido no encontrado' }
  if (partido.estado !== 'programado') return { error: 'Solo se puede intercambiar local/visita en partidos no jugados' }

  const { error } = await supabase.from('lf_partidos')
    .update({ equipo_local_id: partido.equipo_visita_id, equipo_visita_id: partido.equipo_local_id })
    .eq('id', partidoId)
  if (error) return { error: error.message }
  return { error: null }
}

// ─── Resultados, goles y tarjetas ───────────────────────────────────────

async function partidoDelClub(supabase: any, partidoId: string, clubId: string) {
  const { data } = await supabase.from('lf_partidos')
    .select('id, liga_id, fecha_id, equipo_local_id, equipo_visita_id, estado, lf_ligas!inner(club_id, fechas_suspension_roja, amarillas_acumulacion_suspension, amarillas_acumulacion_fechas)')
    .eq('id', partidoId).single()
  if (!data || data.lf_ligas?.club_id !== clubId) return null
  return data
}

export async function iniciarPartido(partidoId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const partido = await partidoDelClub(supabase, partidoId, clubId)
  if (!partido) return { error: 'Partido no encontrado' }

  const { error } = await supabase.from('lf_partidos').update({ estado: 'en_curso' }).eq('id', partidoId)
  if (error) return { error: error.message }
  return { error: null }
}

export async function registrarResultado(partidoId: string, golesLocal: number, golesVisita: number) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }
  if (golesLocal < 0 || golesVisita < 0) return { error: 'El marcador no puede ser negativo' }

  const partido = await partidoDelClub(supabase, partidoId, clubId)
  if (!partido) return { error: 'Partido no encontrado' }

  const { error } = await supabase.from('lf_partidos')
    .update({ goles_local: golesLocal, goles_visita: golesVisita, estado: 'finalizado' })
    .eq('id', partidoId)
  if (error) return { error: error.message }
  const errPlayoff = await avanzarPlayoffSiCorresponde(supabase, partidoId)
  if (errPlayoff) return { error: `Resultado guardado pero el playoff no avanzó: ${errPlayoff}` }
  return { error: null }
}

/** Devuelve el mensaje de error, o null si el marcador quedó bien guardado. */
async function recalcularMarcadorPartido(supabase: any, partidoId: string, equipoLocalId: string, equipoVisitaId: string): Promise<string | null> {
  const { data: goles } = await supabase.from('lf_goles')
    .select('equipo_id, tipo').eq('partido_id', partidoId)
  const { golesLocal, golesVisita } = calcularMarcador(goles || [], equipoLocalId, equipoVisitaId)
  const { error } = await supabase.from('lf_partidos')
    .update({ goles_local: golesLocal, goles_visita: golesVisita }).eq('id', partidoId)
  // Si esto falla, el gol queda registrado en lf_goles pero el marcador del
  // partido no lo refleja: misma forma que A-03 de la auditoría 2026-08-26
  // (ganador propagado sin revisar si la ronda siguiente aceptó el cambio).
  return error ? error.message : null
}

export async function registrarGol(params: {
  partido_id: string; jugador_id: string; equipo_id: string; minuto?: number; tipo?: 'normal' | 'penal' | 'autogol'
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión', golId: null }

  const partido = await partidoDelClub(supabase, params.partido_id, clubId)
  if (!partido) return { error: 'Partido no encontrado', golId: null }

  const { data, error } = await supabase.from('lf_goles').insert({
    partido_id: params.partido_id,
    jugador_id: params.jugador_id,
    equipo_id: params.equipo_id,
    minuto: params.minuto ?? null,
    tipo: params.tipo || 'normal',
  }).select('id').single()
  if (error) return { error: error.message, golId: null }

  const errRecalc = await recalcularMarcadorPartido(supabase, params.partido_id, partido.equipo_local_id, partido.equipo_visita_id)
  if (errRecalc) return { error: `Gol guardado pero el marcador no se actualizó: ${errRecalc}`, golId: data.id }
  if (partido.estado === 'programado') {
    const { error: errEstado } = await supabase.from('lf_partidos').update({ estado: 'en_curso' }).eq('id', params.partido_id)
    if (errEstado) return { error: `Gol guardado pero el partido no pasó a en curso: ${errEstado.message}`, golId: data.id }
  }

  return { error: null, golId: data.id }
}

export async function eliminarGol(golId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: gol } = await supabase.from('lf_goles')
    .select('partido_id, lf_partidos!inner(equipo_local_id, equipo_visita_id, lf_ligas!inner(club_id))')
    .eq('id', golId).single() as any
  if (!gol || gol.lf_partidos?.lf_ligas?.club_id !== clubId) return { error: 'Gol no encontrado' }

  const { error } = await supabase.from('lf_goles').delete().eq('id', golId)
  if (error) return { error: error.message }

  const errRecalc = await recalcularMarcadorPartido(supabase, gol.partido_id, gol.lf_partidos.equipo_local_id, gol.lf_partidos.equipo_visita_id)
  if (errRecalc) return { error: `Gol borrado pero el marcador no se actualizó: ${errRecalc}` }
  return { error: null }
}

// Al llegar a la fecha de suspensión (roja directa, doble amarilla, o acumulación),
// arma el rango [fecha_desde, fecha_hasta] buscando las próximas jornadas regulares
// de la liga a partir de la fecha del partido. Si no encuentra suficientes fechas
// futuras (ronda es la última), guarda la sanción igual sin el rango — el admin
// puede completarlo a mano.
async function crearSancionAutomatica(supabase: any, params: {
  ligaId: string; jugadorId: string; equipoId: string; tarjetaId: string
  tipo: 'suspension_fechas'; fechasSuspension: number; motivo: string; fechaPartidoId: string | null
}): Promise<string | null> {
  let fechaDesdeId: string | null = null
  let fechaHastaId: string | null = null

  if (params.fechaPartidoId) {
    const { data: fechaActual } = await supabase.from('lf_fechas')
      .select('numero').eq('id', params.fechaPartidoId).single()
    if (fechaActual) {
      const { data: siguientes } = await supabase.from('lf_fechas')
        .select('id, numero').eq('liga_id', params.ligaId).eq('es_playoff', false)
        .gt('numero', fechaActual.numero).order('numero').limit(params.fechasSuspension)
      if (siguientes && siguientes.length > 0) {
        fechaDesdeId = siguientes[0].id
        fechaHastaId = siguientes[siguientes.length - 1].id
      }
    }
  }

  const { error } = await supabase.from('lf_sanciones').insert({
    liga_id: params.ligaId,
    jugador_id: params.jugadorId,
    equipo_id: params.equipoId,
    tarjeta_id: params.tarjetaId,
    tipo: params.tipo,
    fechas_suspension: params.fechasSuspension,
    fecha_desde_id: fechaDesdeId,
    fecha_hasta_id: fechaHastaId,
    motivo: params.motivo,
  })
  // Si esto falla, la tarjeta queda registrada pero el jugador no queda
  // suspendido de verdad: puede seguir jugando las fechas que debería perderse.
  return error ? error.message : null
}

export async function registrarTarjeta(params: {
  partido_id: string; jugador_id: string; equipo_id: string
  tipo: 'amarilla' | 'roja' | 'doble_amarilla'; minuto?: number; motivo?: string
}) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión', tarjetaId: null }

  const partido = await partidoDelClub(supabase, params.partido_id, clubId)
  if (!partido) return { error: 'Partido no encontrado', tarjetaId: null }

  const { data: tarjeta, error } = await supabase.from('lf_tarjetas').insert({
    partido_id: params.partido_id,
    jugador_id: params.jugador_id,
    equipo_id: params.equipo_id,
    tipo: params.tipo,
    minuto: params.minuto ?? null,
    motivo: params.motivo || null,
  }).select('id').single()
  if (error) return { error: error.message, tarjetaId: null }

  const liga = partido.lf_ligas

  if (params.tipo === 'roja' || params.tipo === 'doble_amarilla') {
    const errSancion = await crearSancionAutomatica(supabase, {
      ligaId: partido.liga_id, jugadorId: params.jugador_id, equipoId: params.equipo_id,
      tarjetaId: tarjeta.id, tipo: 'suspension_fechas',
      fechasSuspension: liga.fechas_suspension_roja,
      motivo: params.tipo === 'roja' ? 'Tarjeta roja directa' : 'Doble tarjeta amarilla',
      fechaPartidoId: partido.fecha_id,
    })
    if (errSancion) return { error: `Tarjeta guardada pero la suspensión no se registró: ${errSancion}`, tarjetaId: tarjeta.id }
  } else if (params.tipo === 'amarilla') {
    const { count } = await supabase.from('lf_tarjetas')
      .select('id', { count: 'exact', head: true })
      .eq('jugador_id', params.jugador_id).eq('tipo', 'amarilla')
    if (count && liga.amarillas_acumulacion_suspension > 0 && count % liga.amarillas_acumulacion_suspension === 0) {
      const errSancion = await crearSancionAutomatica(supabase, {
        ligaId: partido.liga_id, jugadorId: params.jugador_id, equipoId: params.equipo_id,
        tarjetaId: tarjeta.id, tipo: 'suspension_fechas',
        fechasSuspension: liga.amarillas_acumulacion_fechas,
        motivo: `Acumulación de ${count} tarjetas amarillas`,
        fechaPartidoId: partido.fecha_id,
      })
      if (errSancion) return { error: `Tarjeta guardada pero la suspensión no se registró: ${errSancion}`, tarjetaId: tarjeta.id }
    }
  }

  return { error: null, tarjetaId: tarjeta.id }
}

export async function eliminarTarjeta(tarjetaId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: tarjeta } = await supabase.from('lf_tarjetas')
    .select('partido_id, lf_partidos!inner(lf_ligas!inner(club_id))')
    .eq('id', tarjetaId).single() as any
  if (!tarjeta || tarjeta.lf_partidos?.lf_ligas?.club_id !== clubId) return { error: 'Tarjeta no encontrada' }

  // ponytail: no revierte sanciones ya creadas a partir de esta tarjeta —
  // si la tarjeta fue un error de carga, el admin anula la sanción a mano.
  const { error } = await supabase.from('lf_tarjetas').delete().eq('id', tarjetaId)
  if (error) return { error: error.message }
  return { error: null }
}

export async function registrarWO(partidoId: string, equipoWoId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const partido = await partidoDelClub(supabase, partidoId, clubId)
  if (!partido) return { error: 'Partido no encontrado' }
  if (equipoWoId !== partido.equipo_local_id && equipoWoId !== partido.equipo_visita_id) {
    return { error: 'El equipo indicado no juega este partido' }
  }

  const { data: liga } = await supabase.from('lf_ligas')
    .select('goles_wo_favor, goles_wo_contra').eq('id', partido.liga_id).single()
  const golesFavor = liga?.goles_wo_favor ?? 3
  const golesContra = liga?.goles_wo_contra ?? 0
  const esLocalElQueFalta = equipoWoId === partido.equipo_local_id

  const { error } = await supabase.from('lf_partidos').update({
    estado: 'wo',
    equipo_wo_id: equipoWoId,
    goles_local: esLocalElQueFalta ? golesContra : golesFavor,
    goles_visita: esLocalElQueFalta ? golesFavor : golesContra,
  }).eq('id', partidoId)
  if (error) return { error: error.message }
  const errPlayoff = await avanzarPlayoffSiCorresponde(supabase, partidoId)
  if (errPlayoff) return { error: `Resultado guardado pero el playoff no avanzó: ${errPlayoff}` }
  return { error: null }
}

export async function suspenderPartido(partidoId: string, observaciones?: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const partido = await partidoDelClub(supabase, partidoId, clubId)
  if (!partido) return { error: 'Partido no encontrado' }

  const { error } = await supabase.from('lf_partidos')
    .update({ estado: 'suspendido', observaciones: observaciones || null })
    .eq('id', partidoId)
  if (error) return { error: error.message }
  return { error: null }
}

export async function finalizarPartido(partidoId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const partido = await partidoDelClub(supabase, partidoId, clubId)
  if (!partido) return { error: 'Partido no encontrado' }

  const { error } = await supabase.from('lf_partidos').update({ estado: 'finalizado' }).eq('id', partidoId)
  if (error) return { error: error.message }
  const errPlayoff = await avanzarPlayoffSiCorresponde(supabase, partidoId)
  if (errPlayoff) return { error: `Resultado guardado pero el playoff no avanzó: ${errPlayoff}` }
  return { error: null }
}

export async function terminarFecha(fechaId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: fecha } = await supabase.from('lf_fechas')
    .select('id, liga_id, lf_ligas!inner(club_id)').eq('id', fechaId).single() as any
  if (!fecha || fecha.lf_ligas?.club_id !== clubId) return { error: 'Fecha no encontrada' }

  const { data: partidos } = await supabase.from('lf_partidos').select('estado').eq('fecha_id', fechaId)
  const sinCerrar = (partidos || []).filter((p: { estado: string }) => !['finalizado', 'wo', 'suspendido'].includes(p.estado))
  if (sinCerrar.length > 0) return { error: `Hay ${sinCerrar.length} partido(s) sin resultado` }

  const { error } = await supabase.from('lf_fechas').update({ estado: 'finalizada' }).eq('id', fechaId)
  if (error) return { error: error.message }
  return { error: null }
}

// ─── Playoffs ────────────────────────────────────────────────────────────

function labelFase(fase: FasePlayoff): string {
  if (fase === 'cuartos') return 'Cuartos de final'
  if (fase === 'semifinal') return 'Semifinal'
  if (fase === 'tercer_lugar') return 'Tercer lugar'
  return 'Final'
}

// Se llama después de cerrar cualquier partido. Si pertenece a una fecha de
// playoffs y con ese cierre TODOS los partidos de su fase quedaron
// decididos, arma la fecha y los partidos de la fase siguiente (y el de
// tercer lugar, si corresponde) con los ganadores/perdedores ya conocidos.
// Idempotente: si la fase siguiente ya fue creada, no hace nada.
// Devuelve el mensaje de error si alguna escritura falló a medio camino
// (mismo riesgo que A-03: el ganador queda determinado pero la ronda
// siguiente no se llega a crear), o null si todo quedó bien.
async function avanzarPlayoffSiCorresponde(supabase: any, partidoId: string): Promise<string | null> {
  const { data: partido } = await supabase.from('lf_partidos')
    .select('liga_id, lf_fechas!inner(es_playoff, fase_playoff)').eq('id', partidoId).single()
  if (!partido?.lf_fechas?.es_playoff) return null
  const fase: FasePlayoff | null = partido.lf_fechas.fase_playoff
  if (!fase) return null

  const { data: partidosFase } = await supabase.from('lf_partidos')
    .select('equipo_local_id, equipo_visita_id, goles_local, goles_visita, estado, equipo_wo_id, orden_bracket, lf_fechas!inner(fase_playoff)')
    .eq('liga_id', partido.liga_id).eq('lf_fechas.fase_playoff', fase)
    .order('orden_bracket')
  if (!partidosFase || partidosFase.length === 0) return null
  if (!partidosFase.every((p: any) => p.estado === 'finalizado' || p.estado === 'wo')) return null

  const ganadores: string[] = []
  const perdedores: string[] = []
  for (const p of partidosFase) {
    const datos = {
      equipoLocalId: p.equipo_local_id, equipoVisitaId: p.equipo_visita_id,
      golesLocal: p.goles_local ?? 0, golesVisita: p.goles_visita ?? 0,
      estado: p.estado, equipoWoId: p.equipo_wo_id,
    }
    const g = ganadorPartido(datos)
    if (!g) return null // empate sin resolver — el bracket espera a que el admin corrija el resultado
    ganadores.push(g)
    perdedores.push(perdedorPartido(datos)!)
  }

  const siguienteFase = siguienteFasePlayoff(fase)
  if (!siguienteFase) {
    if (fase === 'final') {
      const { error } = await supabase.from('lf_ligas').update({ estado: 'finalizada' }).eq('id', partido.liga_id)
      if (error) return `La final quedó decidida pero la liga no se marcó como finalizada: ${error.message}`
    }
    return null
  }

  const { count: yaExiste } = await supabase.from('lf_fechas')
    .select('id', { count: 'exact', head: true }).eq('liga_id', partido.liga_id).eq('fase_playoff', siguienteFase)
  if ((yaExiste ?? 0) > 0) return null

  const { data: ultimaFecha } = await supabase.from('lf_fechas')
    .select('numero').eq('liga_id', partido.liga_id).order('numero', { ascending: false }).limit(1).single()
  let siguienteNumero = (ultimaFecha?.numero ?? 0) + 1

  const partidosSiguienteRonda = armarSiguienteRonda(siguienteFase, ganadores)
  const { data: fechaCreada, error: errFecha } = await supabase.from('lf_fechas').insert({
    liga_id: partido.liga_id, numero: siguienteNumero, nombre: labelFase(siguienteFase),
    es_playoff: true, fase_playoff: siguienteFase,
  }).select('id').single()
  if (errFecha || !fechaCreada) return `Ganadores de ${fase} decididos pero no se pudo crear la fecha de ${siguienteFase}: ${errFecha?.message ?? 'sin datos'}`
  siguienteNumero++

  const { error: errPartidos } = await supabase.from('lf_partidos').insert(partidosSiguienteRonda.map(p => ({
    liga_id: partido.liga_id, fecha_id: fechaCreada.id,
    equipo_local_id: p.equipoLocalId, equipo_visita_id: p.equipoVisitaId,
    orden_bracket: p.posicion, estado: 'programado',
  })))
  if (errPartidos) return `Se creó la fecha de ${siguienteFase} pero no sus partidos: ${errPartidos.message}`

  if (fase === 'semifinal') {
    const { data: liga } = await supabase.from('lf_ligas').select('tercer_lugar').eq('id', partido.liga_id).single()
    if (liga?.tercer_lugar) {
      const partidoTercerLugar = armarSiguienteRonda('tercer_lugar', perdedores)
      if (partidoTercerLugar.length > 0) {
        const { data: fechaTercer, error: errFechaTercer } = await supabase.from('lf_fechas').insert({
          liga_id: partido.liga_id, numero: siguienteNumero, nombre: labelFase('tercer_lugar'),
          es_playoff: true, fase_playoff: 'tercer_lugar',
        }).select('id').single()
        if (errFechaTercer || !fechaTercer) return `Se armó la final pero no el partido de tercer lugar: ${errFechaTercer?.message ?? 'sin datos'}`
        const { error: errPartidoTercer } = await supabase.from('lf_partidos').insert(partidoTercerLugar.map(p => ({
          liga_id: partido.liga_id, fecha_id: fechaTercer.id,
          equipo_local_id: p.equipoLocalId, equipo_visita_id: p.equipoVisitaId,
          orden_bracket: p.posicion, estado: 'programado',
        })))
        if (errPartidoTercer) return `Se creó la fecha de tercer lugar pero no el partido: ${errPartidoTercer.message}`
      }
    }
  }
  return null
}

export async function iniciarPlayoffs(ligaId: string) {
  const { error: authErr, supabase, clubId } = await requireAdminClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  const { data: liga } = await supabase.from('lf_ligas')
    .select('club_id, formato, estado, cupos_playoffs, puntos_victoria, puntos_empate, puntos_derrota, puntos_wo_perdedor')
    .eq('id', ligaId).single()
  if (!liga || liga.club_id !== clubId) return { error: 'Liga no encontrada' }
  if (liga.formato === 'todos_vs_todos') return { error: 'Este formato no tiene fase de playoffs' }
  if (liga.estado !== 'en_curso') return { error: 'La liga debe estar en curso para iniciar playoffs' }

  const { data: fechasRegulares } = await supabase.from('lf_fechas')
    .select('estado').eq('liga_id', ligaId).eq('es_playoff', false)
  if ((fechasRegulares || []).some((f: { estado: string }) => f.estado !== 'finalizada')) {
    return { error: 'Todavía hay fechas de la fase regular sin terminar' }
  }

  const reglas = {
    puntosVictoria: liga.puntos_victoria, puntosEmpate: liga.puntos_empate,
    puntosDerrota: liga.puntos_derrota, puntosWoPerdedor: liga.puntos_wo_perdedor,
  }

  let clasificados: string[]

  if (liga.formato === 'grupos_playoffs') {
    const { data: grupos } = await supabase.from('lf_grupos').select('id, clasifican').eq('liga_id', ligaId).order('orden')
    if (!grupos || grupos.length === 0) return { error: 'La liga no tiene grupos configurados' }

    const gruposConTabla: { tabla: EquipoStats[]; clasifican: number }[] = []
    for (const g of grupos) {
      const { data: equiposGrupo } = await supabase.from('lf_equipos').select('id').eq('grupo_id', g.id)
      const { data: partidosGrupo } = await supabase.from('lf_partidos')
        .select('equipo_local_id, equipo_visita_id, goles_local, goles_visita, estado, equipo_wo_id')
        .eq('grupo_id', g.id)
      const tabla = calcularTablaPosiciones(
        (equiposGrupo || []).map((e: { id: string }) => e.id),
        (partidosGrupo || []).map((p: any) => ({
          equipoLocalId: p.equipo_local_id, equipoVisitaId: p.equipo_visita_id,
          golesLocal: p.goles_local ?? 0, golesVisita: p.goles_visita ?? 0,
          estado: p.estado, equipoWoId: p.equipo_wo_id,
        })),
        reglas,
      )
      gruposConTabla.push({ tabla, clasifican: g.clasifican })
    }
    clasificados = clasificarPorGrupos(gruposConTabla)
  } else {
    const { data: equipos } = await supabase.from('lf_equipos').select('id').eq('liga_id', ligaId)
    const { data: partidos } = await supabase.from('lf_partidos')
      .select('equipo_local_id, equipo_visita_id, goles_local, goles_visita, estado, equipo_wo_id')
      .eq('liga_id', ligaId)
    const tabla = calcularTablaPosiciones(
      (equipos || []).map((e: { id: string }) => e.id),
      (partidos || []).map((p: any) => ({
        equipoLocalId: p.equipo_local_id, equipoVisitaId: p.equipo_visita_id,
        golesLocal: p.goles_local ?? 0, golesVisita: p.goles_visita ?? 0,
        estado: p.estado, equipoWoId: p.equipo_wo_id,
      })),
      reglas,
    )
    clasificados = clasificarPorTabla(tabla, liga.cupos_playoffs)
  }

  if (![2, 4, 8].includes(clasificados.length)) {
    return { error: `Se necesitan 2, 4 u 8 equipos clasificados para armar el bracket (hay ${clasificados.length})` }
  }

  const bracket = generarBracketPlayoffs(clasificados)
  if (bracket.length === 0) return { error: 'No se pudo armar el bracket' }

  const { data: ultimaFecha } = await supabase.from('lf_fechas')
    .select('numero').eq('liga_id', ligaId).order('numero', { ascending: false }).limit(1).single()
  const siguienteNumero = (ultimaFecha?.numero ?? 0) + 1
  const fase = bracket[0].fase

  const { data: fechaCreada, error: errFecha } = await supabase.from('lf_fechas').insert({
    liga_id: ligaId, numero: siguienteNumero, nombre: labelFase(fase), es_playoff: true, fase_playoff: fase,
  }).select('id').single()
  if (errFecha || !fechaCreada) return { error: errFecha?.message ?? 'No se pudo crear la fecha de playoffs' }

  const { error: errPartidos } = await supabase.from('lf_partidos').insert(bracket.map(p => ({
    liga_id: ligaId, fecha_id: fechaCreada.id,
    equipo_local_id: p.equipoLocalId, equipo_visita_id: p.equipoVisitaId,
    orden_bracket: p.posicion, estado: 'programado',
  })))
  if (errPartidos) return { error: errPartidos.message }

  const { error: errEstadoLiga } = await supabase.from('lf_ligas').update({ estado: 'playoffs' }).eq('id', ligaId)
  if (errEstadoLiga) return { error: `Bracket creado pero la liga no pasó a playoffs: ${errEstadoLiga.message}` }
  return { error: null }
}
