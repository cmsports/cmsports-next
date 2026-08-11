'use server'

import { requireAdmin } from '@/lib/auth/require'
import { fechaChile } from '@/lib/domain/fechaChile'
import {
  calcularNumGrupos,
  generarRoundRobin,
  nombreGrupo,
  seedingSerpenteoConClubes,
  type JugadorTorneo,
} from '@/lib/domain/torneos'
import {
  gamesParaGanarFormato,
  ganadorDesdeSets,
  parsearSetsTexto,
  type SetMarcador,
} from '@/lib/domain/oficial-ittf'

type Resultado<T = Record<string, never>> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbOficial(supabase: NonNullable<Awaited<ReturnType<typeof requireAdmin>>['supabase']>) {
  return supabase as any
}

export async function crearCampeonatoOficial(params: {
  nombre: string
  sede?: string
  zona?: string
  fechaInicio: string
  fechaFin?: string
}): Promise<Resultado<{ id: string }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const nombre = params.nombre.trim()
  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.fechaInicio)) return { error: 'Fecha de inicio inválida' }

  const { data, error: err } = await db.from('oficial_campeonatos').insert({
    club_id: perfil.club_id,
    nombre,
    sede: params.sede?.trim() || null,
    zona: params.zona?.trim() || null,
    fecha_inicio: params.fechaInicio,
    fecha_fin: params.fechaFin || null,
    estado: 'inscripcion',
    creado_por: perfil.id,
  }).select('id').single()

  if (err || !data) return { error: err?.message || 'No se pudo crear el campeonato' }
  return { id: data.id }
}

export async function crearEventoOficial(params: {
  campeonatoId: string
  nombre: string
  categoria: string
  genero: 'varones' | 'damas' | 'mixto'
  formatoPartido?: 'bo3' | 'bo5' | 'bo7'
}): Promise<Resultado<{ id: string }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: camp } = await db.from('oficial_campeonatos').select('id')
    .eq('id', params.campeonatoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!camp) return { error: 'Campeonato no encontrado' }

  const nombre = params.nombre.trim()
  const categoria = params.categoria.trim()
  if (!nombre || !categoria) return { error: 'Nombre y categoría son obligatorios' }

  const { data, error: err } = await db.from('oficial_eventos').insert({
    club_id: perfil.club_id,
    campeonato_id: params.campeonatoId,
    nombre,
    categoria,
    genero: params.genero,
    formato_partido: params.formatoPartido || 'bo5',
    fase: 'inscripcion',
    estado: 'en_curso',
  }).select('id').single()

  if (err || !data) return { error: err?.message || 'No se pudo crear el evento' }
  return { id: data.id }
}

export async function inscribirJugadorOficial(params: {
  eventoId: string
  nombre: string
  asociacion?: string
  codigoFederativo?: string
  genero?: 'V' | 'D'
  ranking?: number
  jugadorId?: string
}): Promise<Resultado<{ id: string }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: evento } = await db.from('oficial_eventos').select('id, fase')
    .eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }
  if (evento.fase !== 'inscripcion') return { error: 'La inscripción ya está cerrada' }

  const nombre = params.nombre.trim()
  if (!nombre) return { error: 'El nombre es obligatorio' }

  const { count } = await db.from('oficial_inscritos').select('id', { count: 'exact', head: true })
    .eq('evento_id', params.eventoId)

  const { data, error: err } = await db.from('oficial_inscritos').insert({
    club_id: perfil.club_id,
    evento_id: params.eventoId,
    nombre,
    asociacion: params.asociacion?.trim() || null,
    codigo_federativo: params.codigoFederativo?.trim() || null,
    genero: params.genero || null,
    ranking: params.ranking ?? null,
    jugador_id: params.jugadorId || null,
    orden_inscripcion: (count ?? 0) + 1,
  }).select('id').single()

  if (err || !data) {
    if (err?.code === '23505') return { error: 'Ese jugador ya está inscrito' }
    return { error: err?.message || 'No se pudo inscribir' }
  }
  return { id: data.id }
}

export async function configurarCabezasOficial(params: {
  eventoId: string
  cabezas: Array<{ inscritoId: string; numero: number }>
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: evento } = await db.from('oficial_eventos').select('id, fase')
    .eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }
  if (evento.fase !== 'inscripcion') return { error: 'Solo se pueden editar cabezas en inscripción' }

  const ordenados = [...params.cabezas].sort((a, b) => a.numero - b.numero)
  if (ordenados.some((c, i) => c.numero !== i + 1)) {
    return { error: 'La numeración de cabezas debe ser correlativa desde 1' }
  }

  await db.from('oficial_inscritos').update({ cabeza_numero: null })
    .eq('evento_id', params.eventoId).eq('club_id', perfil.club_id)

  for (const c of ordenados) {
    const { error: err } = await db.from('oficial_inscritos').update({ cabeza_numero: c.numero })
      .eq('id', c.inscritoId).eq('evento_id', params.eventoId).eq('club_id', perfil.club_id)
    if (err) return { error: 'No se pudo guardar las cabezas de serie' }
  }
  return {}
}

export async function formarGruposOficial(params: { eventoId: string }): Promise<Resultado<{ numGrupos: number }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: evento } = await db.from('oficial_eventos').select('id, fase, campeonato_id')
    .eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }
  if (evento.fase !== 'inscripcion') return { error: 'Los grupos ya fueron formados' }

  const { data: inscritos } = await db.from('oficial_inscritos')
    .select('id, nombre, asociacion, cabeza_numero')
    .eq('evento_id', params.eventoId).eq('club_id', perfil.club_id).order('orden_inscripcion')

  if (!inscritos || inscritos.length < 4) return { error: 'Se necesitan al menos 4 inscritos' }

  const numGrupos = calcularNumGrupos(inscritos.length, 3)
  const cabezas = [...inscritos].filter(i => i.cabeza_numero != null)
    .sort((a, b) => (a.cabeza_numero ?? 0) - (b.cabeza_numero ?? 0))
  if (cabezas.length > numGrupos) {
    return { error: `Hay ${cabezas.length} cabezas para ${numGrupos} grupos` }
  }

  const jugadores: JugadorTorneo[] = inscritos.map(i => ({
    id: i.id,
    nombre: i.nombre,
    club: i.asociacion?.trim() || null,
  }))

  const asignaciones = seedingSerpenteoConClubes(jugadores, numGrupos, cabezas.map(c => c.id))

  await db.from('oficial_partidos').delete().eq('evento_id', params.eventoId)
  await db.from('oficial_grupo_inscritos').delete().in('grupo_id',
    (await db.from('oficial_grupos').select('id').eq('evento_id', params.eventoId)).data?.map((g: { id: string }) => g.id) ?? [])
  await db.from('oficial_grupos').delete().eq('evento_id', params.eventoId)

  const gruposInsert = Array.from({ length: numGrupos }, (_, i) => ({
    club_id: perfil.club_id!,
    evento_id: params.eventoId,
    nombre: nombreGrupo(i),
    orden: i,
  }))

  const { data: grupos, error: gErr } = await db.from('oficial_grupos').insert(gruposInsert).select('id, orden')
  if (gErr || !grupos) return { error: gErr?.message || 'No se pudieron crear los grupos' }

  const grupoPorOrden = new Map(grupos.map((g: { id: string; orden: number }) => [g.orden, g.id]))
  const miembros = asignaciones.map((a, idx) => ({
    club_id: perfil.club_id!,
    grupo_id: grupoPorOrden.get(a.grupoIndex)!,
    inscrito_id: a.jugadorId,
    orden: idx,
  }))

  const { error: mErr } = await db.from('oficial_grupo_inscritos').insert(miembros)
  if (mErr) return { error: mErr.message || 'No se pudieron asignar inscritos' }

  const partidos: Array<Record<string, unknown>> = []
  for (const g of grupos) {
    const ids = asignaciones.filter(a => a.grupoIndex === g.orden).map(a => a.jugadorId)
    generarRoundRobin(ids).forEach(([a, b], i) => {
      partidos.push({
        club_id: perfil.club_id!,
        evento_id: params.eventoId,
        grupo_id: g.id,
        fase: 'grupos',
        orden: i,
        inscrito_a_id: a,
        inscrito_b_id: b,
      })
    })
  }

  const { error: pErr } = await db.from('oficial_partidos').insert(partidos)
  if (pErr) return { error: pErr.message || 'No se pudieron crear los partidos' }

  await db.from('oficial_eventos').update({ fase: 'grupos', actualizado_en: new Date().toISOString() })
    .eq('id', params.eventoId)
  await db.from('oficial_campeonatos').update({ estado: 'en_curso', actualizado_en: new Date().toISOString() })
    .eq('id', evento.campeonato_id).eq('club_id', perfil.club_id)

  return { numGrupos }
}

export async function registrarResultadoOficial(params: {
  partidoId: string
  setsTexto?: string
  sets?: SetMarcador[]
  ganadorId?: string
  esWalkover?: boolean
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: partido } = await db.from('oficial_partidos')
    .select('id, evento_id, inscrito_a_id, inscrito_b_id, ganador_id')
    .eq('id', params.partidoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!partido) return { error: 'Partido no encontrado' }
  if (!partido.inscrito_a_id || !partido.inscrito_b_id) return { error: 'Faltan jugadores' }
  if (partido.ganador_id) return { error: 'El partido ya tiene resultado' }

  const { data: evento } = await db.from('oficial_eventos').select('formato_partido')
    .eq('id', partido.evento_id).maybeSingle()
  const meta = gamesParaGanarFormato(evento?.formato_partido || 'bo5')

  let sets: SetMarcador[] = params.sets ?? []
  if (params.setsTexto?.trim()) {
    const parsed = parsearSetsTexto(params.setsTexto)
    if ('error' in parsed) return { error: parsed.error }
    sets = parsed
  }

  let ganadorId = params.ganadorId || null
  const esWalkover = Boolean(params.esWalkover)

  if (esWalkover) {
    if (!ganadorId) return { error: 'En W.O. debes indicar el ganador' }
    if (ganadorId !== partido.inscrito_a_id && ganadorId !== partido.inscrito_b_id) {
      return { error: 'El ganador no pertenece al partido' }
    }
    sets = []
  } else {
    if (!sets.length) return { error: 'Indica los sets (ej. 11-6; 11-8; 11-4)' }
    const derivado = ganadorDesdeSets(partido.inscrito_a_id, partido.inscrito_b_id, sets, meta)
    if (!derivado) return { error: `Los sets no definen un ganador al mejor de ${meta * 2 - 1}` }
    if (ganadorId && ganadorId !== derivado) return { error: 'El ganador no coincide con los sets' }
    ganadorId = derivado
  }

  const { error: err } = await db.from('oficial_partidos').update({
    ganador_id: ganadorId,
    sets,
    es_walkover: esWalkover,
    actualizado_en: new Date().toISOString(),
  }).eq('id', params.partidoId)

  if (err) return { error: err.message || 'No se pudo guardar el resultado' }
  return {}
}

/** Guarda sets completados durante el marcador en vivo (sin cerrar el partido). */
export async function sincronizarSetsMarcadorOficial(params: {
  partidoId: string
  sets: SetMarcador[]
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: partido } = await db.from('oficial_partidos')
    .select('id, ganador_id')
    .eq('id', params.partidoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!partido) return { error: 'Partido no encontrado' }
  if (partido.ganador_id) return { error: 'El partido ya está cerrado' }

  const { error: err } = await db.from('oficial_partidos').update({
    sets: params.sets,
    actualizado_en: new Date().toISOString(),
  }).eq('id', params.partidoId)

  if (err) return { error: err.message || 'No se pudo sincronizar' }
  return {}
}

export async function hoyChileOficial(): Promise<string> {
  return fechaChile()
}
