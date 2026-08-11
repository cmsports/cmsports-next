'use server'

import { requireAdmin } from '@/lib/auth/require'
import { fechaChile } from '@/lib/domain/fechaChile'
import { CONFIG, type FaseOrden } from '@/lib/config'
import {
  calcularNumGrupos,
  construirLlavesLayoutNumerado,
  generarRoundRobin,
  nombreGrupo,
  seedingSerpenteoConClubes,
  siguienteFase,
  type JugadorTorneo,
} from '@/lib/domain/torneos'
import {
  clasificarGrupoIttf,
  gamesParaGanarFormato,
  ganadorDesdeSets,
  parsearSetsTexto,
  type PartidoOficialStats,
  type SetMarcador,
} from '@/lib/domain/oficial-ittf'
import {
  prioridadPartidoOficial,
  programarPartidosGreedy,
} from '@/lib/domain/programar-oficial'

type Resultado<T extends object = object> =
  | { error: string; [key: string]: unknown }
  | ({ error?: undefined } & T)

type AdminDb = ReturnType<typeof dbOficial>

type ClasificadoGrupo = { grupoId: string; primeroId: string; segundoId: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbOficial(supabase: NonNullable<Awaited<ReturnType<typeof requireAdmin>>['supabase']>) {
  return supabase as any
}

function llaveFueJugada(partido: { ganador_id: string | null; inscrito_b_id: string | null }) {
  return !!partido.ganador_id && !!partido.inscrito_b_id
}

function perdedorPartido(partido: {
  inscrito_a_id: string | null
  inscrito_b_id: string | null
  ganador_id: string | null
}): string | null {
  if (!partido.ganador_id || !partido.inscrito_a_id || !partido.inscrito_b_id) return null
  return partido.ganador_id === partido.inscrito_a_id ? partido.inscrito_b_id : partido.inscrito_a_id
}

/** Crea o actualiza el partido por 3.er lugar cuando ambas semis tienen ganador. */
async function sincronizarTercerLugarOficial(
  db: AdminDb,
  eventoId: string,
  clubId: string,
): Promise<string | null> {
  const { data: semis, error: semisErr } = await db.from('oficial_partidos')
    .select('id, orden, inscrito_a_id, inscrito_b_id, ganador_id')
    .eq('evento_id', eventoId).eq('fase', 'semis').order('orden')
  if (semisErr) return 'No se pudo revisar las semifinales para 3.er lugar'
  if (!semis || semis.length < 2) return null
  if (semis.some((s: { ganador_id: string | null }) => !s.ganador_id)) return null

  const perdedores = semis
    .map((s: { inscrito_a_id: string | null; inscrito_b_id: string | null; ganador_id: string | null }) => perdedorPartido(s))
    .filter((id: string | null): id is string => !!id)
  if (perdedores.length !== 2) return null

  const { data: existente, error: exErr } = await db.from('oficial_partidos')
    .select('id, ganador_id')
    .eq('evento_id', eventoId).eq('fase', 'tercer_lugar').maybeSingle()
  if (exErr) return 'No se pudo consultar el partido por 3.er lugar'
  if (existente?.ganador_id) return null

  if (existente) {
    const { error: updErr } = await db.from('oficial_partidos').update({
      inscrito_a_id: perdedores[0],
      inscrito_b_id: perdedores[1],
      actualizado_en: new Date().toISOString(),
    }).eq('id', existente.id)
    if (updErr) return 'No se pudo actualizar el partido por 3.er lugar'
  } else {
    const { error: insErr } = await db.from('oficial_partidos').insert({
      club_id: clubId,
      evento_id: eventoId,
      fase: 'tercer_lugar',
      orden: 0,
      inscrito_a_id: perdedores[0],
      inscrito_b_id: perdedores[1],
    })
    if (insErr) return 'No se pudo crear el partido por 3.er lugar'
  }
  return null
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

  const jugadores: JugadorTorneo[] = inscritos.map((i: { id: string; nombre: string; asociacion: string | null }) => ({
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
    .select('id, evento_id, fase, orden, grupo_id, inscrito_a_id, inscrito_b_id, ganador_id')
    .eq('id', params.partidoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!partido) return { error: 'Partido no encontrado' }
  if (!partido.inscrito_a_id) return { error: 'Faltan jugadores' }
  if (!partido.inscrito_b_id) return { error: 'Los BYE avanzan solos; no se registran manualmente' }
  if (partido.ganador_id) return { error: 'El partido ya tiene resultado' }

  const { data: evento } = await db.from('oficial_eventos').select('formato_partido, fase')
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
  }).eq('id', params.partidoId).is('ganador_id', null)

  if (err) return { error: err.message || 'No se pudo guardar el resultado' }

  if (partido.fase !== 'grupos') {
    const errProp = await propagarGanadorPlayoffOficial(db, partido, ganadorId!, perfil.club_id!)
    if (errProp) return { error: errProp }
    if (partido.fase === 'semis') {
      const errTercer = await sincronizarTercerLugarOficial(db, partido.evento_id, perfil.club_id!)
      if (errTercer) return { error: errTercer }
    }
    await avanzarFaseEventoOficial(db, partido.evento_id, partido.fase)
    if (partido.fase === 'tercer_lugar') {
      await db.from('oficial_eventos').update({
        tercer_inscrito_id: ganadorId,
        actualizado_en: new Date().toISOString(),
      }).eq('id', partido.evento_id)
    }
    if (partido.fase === 'final') {
      const perdedorId = ganadorId === partido.inscrito_a_id ? partido.inscrito_b_id : partido.inscrito_a_id
      const { data: ev } = await db.from('oficial_eventos').select('campeonato_id').eq('id', partido.evento_id).maybeSingle()
      await db.from('oficial_eventos').update({
        fase: 'finalizado',
        estado: 'finalizado',
        campeon_inscrito_id: ganadorId,
        subcampeon_inscrito_id: perdedorId,
        actualizado_en: new Date().toISOString(),
      }).eq('id', partido.evento_id)
      if (ev?.campeonato_id) await actualizarEstadoCampeonatoOficial(db, ev.campeonato_id, perfil.club_id!)
    }
  } else if (evento?.fase === 'grupos') {
    await sincronizarLlavesOficial({ eventoId: partido.evento_id })
  }

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

/** Cierra el partido oficial vinculado a un marcador técnico (si existe). */
export async function sincronizarResultadoDesdeMarcador(params: {
  marcadorId: string
  sets: SetMarcador[]
  ganadorLado: 'a' | 'b'
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return {}
  const db = dbOficial(supabase)

  const { data: oficial } = await db.from('oficial_partidos')
    .select('id, inscrito_a_id, inscrito_b_id, ganador_id')
    .eq('club_id', perfil.club_id)
    .eq('marcador_id', params.marcadorId)
    .maybeSingle()

  if (!oficial) return {}
  if (oficial.ganador_id) return {}

  const ganadorId = params.ganadorLado === 'a' ? oficial.inscrito_a_id : oficial.inscrito_b_id
  if (!ganadorId) return { error: 'Faltan inscritos en el partido oficial' }

  return registrarResultadoOficial({
    partidoId: oficial.id,
    sets: params.sets,
    ganadorId,
  })
}

export async function hoyChileOficial(): Promise<string> {
  return fechaChile()
}

async function calcularClasificadosOficial(
  db: AdminDb,
  eventoId: string,
): Promise<{ clasificados: ClasificadoGrupo[] } | { error: string }> {
  const { data: grupos } = await db.from('oficial_grupos')
    .select('id, orden')
    .eq('evento_id', eventoId)
    .order('orden')

  if (!grupos?.length) return { clasificados: [] }

  const grupoIds = grupos.map((g: { id: string }) => g.id)
  const [{ data: miembros }, { data: partidos }] = await Promise.all([
    db.from('oficial_grupo_inscritos').select('grupo_id, inscrito_id').in('grupo_id', grupoIds),
    db.from('oficial_partidos').select('grupo_id, inscrito_a_id, inscrito_b_id, ganador_id, sets, es_walkover')
      .eq('evento_id', eventoId).eq('fase', 'grupos').in('grupo_id', grupoIds),
  ])

  const clasificados: ClasificadoGrupo[] = []

  for (const grupo of grupos) {
    const ids = (miembros || []).filter((m: { grupo_id: string }) => m.grupo_id === grupo.id)
      .map((m: { inscrito_id: string }) => m.inscrito_id)
    if (ids.length < 2) continue

    const partidosGrupo = (partidos || []).filter((p: { grupo_id: string }) => p.grupo_id === grupo.id)
    const jugados = partidosGrupo.filter((p: { ganador_id: string | null }) => p.ganador_id)
    if (!jugados.length) continue

    const statsInput: PartidoOficialStats[] = jugados
      .filter((p: { inscrito_a_id: string | null; inscrito_b_id: string | null }) => p.inscrito_a_id && p.inscrito_b_id)
      .map((p: { inscrito_a_id: string; inscrito_b_id: string; ganador_id: string; sets: SetMarcador[]; es_walkover: boolean }) => ({
        inscritoA: p.inscrito_a_id,
        inscritoB: p.inscrito_b_id,
        ganador: p.ganador_id,
        sets: (p.sets || []) as SetMarcador[],
        esWalkover: p.es_walkover,
      }))

    const stats = clasificarGrupoIttf(ids, statsInput)
    const todosJugados = jugados.length === partidosGrupo.length

    if (!todosJugados) {
      if (stats.length < 2) continue
      const pts2 = stats[1].pts
      const restantes = new Map<string, number>()
      for (const id of ids) restantes.set(id, 0)
      for (const p of partidosGrupo) {
        if (!p.ganador_id) {
          if (p.inscrito_a_id) restantes.set(p.inscrito_a_id, (restantes.get(p.inscrito_a_id) ?? 0) + 1)
          if (p.inscrito_b_id) restantes.set(p.inscrito_b_id, (restantes.get(p.inscrito_b_id) ?? 0) + 1)
        }
      }
      const alguienAlcanza = stats.slice(2).some(s =>
        s.pts + 2 * (restantes.get(s.inscritoId) ?? 0) >= pts2,
      )
      if (alguienAlcanza) continue
    }

    if (stats[0]?.inscritoId && stats[1]?.inscritoId) {
      clasificados.push({
        grupoId: grupo.id,
        primeroId: stats[0].inscritoId,
        segundoId: stats[1].inscritoId,
      })
    }
  }

  return { clasificados }
}

async function propagarGanadorPlayoffOficial(
  db: AdminDb,
  partido: { evento_id: string; fase: string; orden: number },
  ganadorId: string,
  clubId: string,
): Promise<string | null> {
  if (!partido.evento_id || partido.fase === 'grupos') return null
  const faseSiguiente = siguienteFase(partido.fase as FaseOrden)
  if (!faseSiguiente) return null

  const ordenSiguiente = Math.floor(partido.orden / 2)
  const slotGanador = partido.orden % 2 === 0 ? 'inscrito_a_id' : 'inscrito_b_id'

  const { data: existentes, error: buscarError } = await db.from('oficial_partidos')
    .select('id, inscrito_a_id, inscrito_b_id, ganador_id')
    .eq('evento_id', partido.evento_id)
    .eq('fase', faseSiguiente)
    .eq('orden', ordenSiguiente)
    .limit(1)
  if (buscarError) return 'No se pudo consultar la llave siguiente'

  const existente = existentes?.[0]
  if (existente) {
    if (!existente.ganador_id && existente[slotGanador] !== ganadorId) {
      const { error } = await db.from('oficial_partidos').update({ [slotGanador]: ganadorId }).eq('id', existente.id)
      if (error) return 'No se pudo completar la llave siguiente'
    }
  } else {
    const insert: Record<string, unknown> = {
      club_id: clubId,
      evento_id: partido.evento_id,
      fase: faseSiguiente,
      orden: ordenSiguiente,
      inscrito_a_id: slotGanador === 'inscrito_a_id' ? ganadorId : null,
      inscrito_b_id: slotGanador === 'inscrito_b_id' ? ganadorId : null,
    }
    const { error: insertError } = await db.from('oficial_partidos').insert(insert)
    if (insertError?.code === '23505') {
      const { data: concurrente } = await db.from('oficial_partidos')
        .select('id, ganador_id')
        .eq('evento_id', partido.evento_id)
        .eq('fase', faseSiguiente)
        .eq('orden', ordenSiguiente)
        .maybeSingle()
      if (concurrente && !concurrente.ganador_id) {
        const { error } = await db.from('oficial_partidos').update({ [slotGanador]: ganadorId }).eq('id', concurrente.id)
        if (error) return 'No se pudo completar la llave siguiente'
      }
    } else if (insertError) {
      return 'No se pudo crear la llave siguiente'
    }
  }
  return null
}

async function avanzarFaseEventoOficial(db: AdminDb, eventoId: string, faseActual: string) {
  if (faseActual === 'grupos') return
  const faseSiguiente = siguienteFase(faseActual as FaseOrden)
  if (!faseSiguiente) return

  const { data: ronda } = await db.from('oficial_partidos')
    .select('ganador_id').eq('evento_id', eventoId).eq('fase', faseActual)
  if (!ronda?.length || ronda.some((p: { ganador_id: string | null }) => !p.ganador_id)) return

  await db.from('oficial_eventos').update({ fase: 'llaves', actualizado_en: new Date().toISOString() })
    .eq('id', eventoId)
}

export async function sincronizarLlavesOficial(params: { eventoId: string }): Promise<Resultado<{ faseInicial?: string; bracketCreado?: boolean }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const calculo = await calcularClasificadosOficial(db, params.eventoId)
  if ('error' in calculo) return calculo
  const clasificados = calculo.clasificados

  if (clasificados.some(c => c.primeroId === c.segundoId)) {
    return { error: 'Hay un grupo con el mismo jugador como 1° y 2°' }
  }
  const idsUnicos = new Set<string>()
  for (const c of clasificados) {
    for (const id of [c.primeroId, c.segundoId]) {
      if (idsUnicos.has(id)) return { error: 'Hay un jugador clasificado en más de un cupo' }
      idsUnicos.add(id)
    }
  }

  const { data: evento } = await db.from('oficial_eventos').select('fase, clasifican_por_grupo').eq('id', params.eventoId).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }

  const { data: grupos } = await db.from('oficial_grupos').select('id, orden').eq('evento_id', params.eventoId).order('orden')
  const numGrupos = grupos?.length ?? 0
  if (numGrupos < 2) return { error: 'Se requieren al menos 2 grupos' }
  if (numGrupos > CONFIG.TORNEO_MAX_GRUPOS) {
    return { error: `El bracket admite hasta ${CONFIG.TORNEO_MAX_GRUPOS} grupos` }
  }

  const { data: inscritosCabezas } = await db.from('oficial_inscritos')
    .select('id, cabeza_numero').eq('evento_id', params.eventoId).not('cabeza_numero', 'is', null).order('cabeza_numero')
  const { data: miembros } = await db.from('oficial_grupo_inscritos')
    .select('grupo_id, inscrito_id').in('grupo_id', (grupos || []).map((g: { id: string }) => g.id))

  const idxByGrupoId = new Map<string, number>(
    (grupos || []).map((g: { id: string; orden: number }) => [g.id, g.orden] as [string, number]),
  )
  const grupoIdDeInscrito = new Map<string, string>(
    (miembros || []).map((m: { inscrito_id: string; grupo_id: string }) => [m.inscrito_id, m.grupo_id] as [string, string]),
  )

  const cabezasRaw = (inscritosCabezas || []).map((c: { id: string; cabeza_numero: number }) => ({
    inscritoId: c.id,
    numero: c.cabeza_numero,
  }))

  if (cabezasRaw.length > numGrupos) {
    return { error: `Hay ${cabezasRaw.length} cabezas para ${numGrupos} grupos` }
  }

  const slotDe = (inscritoId?: string | null): { grupoIdx: number; pos: 1 | 2 } | null => {
    if (!inscritoId) return null
    const clasificado = clasificados.find(c => c.primeroId === inscritoId || c.segundoId === inscritoId)
    if (clasificado) {
      const grupoIdx = idxByGrupoId.get(clasificado.grupoId)
      return grupoIdx == null ? null : { grupoIdx, pos: clasificado.primeroId === inscritoId ? 1 : 2 }
    }
    const grupoId = grupoIdDeInscrito.get(inscritoId)
    const grupoIdx = grupoId ? idxByGrupoId.get(grupoId) : null
    return grupoIdx == null ? null : { grupoIdx, pos: 1 }
  }

  const cabezasSlots = cabezasRaw.map((c: { inscritoId: string; numero: number }) => {
    const slot = slotDe(c.inscritoId)
    return slot ? { ...slot, numero: c.numero } : null
  }).filter((c: { grupoIdx: number; pos: 1 | 2; numero: number } | null): c is { grupoIdx: number; pos: 1 | 2; numero: number } => !!c)

  const { data: bracketExistente } = await db.from('oficial_partidos')
    .select('id, fase, orden, ganador_id, inscrito_a_id, inscrito_b_id, slot_a_grupo_id, slot_a_posicion, slot_b_grupo_id, slot_b_posicion')
    .eq('evento_id', params.eventoId).neq('fase', 'grupos')

  const gruposListosIdx = clasificados.map(c => idxByGrupoId.get(c.grupoId)).filter((i): i is number => i != null)
  const layout = construirLlavesLayoutNumerado(numGrupos, cabezasSlots, gruposListosIdx)
  if (!layout.matches.length) return { error: 'No se pudo construir un bracket válido' }

  const hayLlavesJugadas = !!bracketExistente?.some(llaveFueJugada)
  const inicialesExistentes = (bracketExistente || []).filter((p: { fase: string }) => p.fase === layout.faseInicial)

  if (bracketExistente?.length && hayLlavesJugadas) {
    // Esqueleto congelado si ya hubo juego real
  } else if (bracketExistente?.length && !hayLlavesJugadas) {
    await db.from('oficial_partidos').delete().eq('evento_id', params.eventoId).neq('fase', 'grupos')
  }

  const realDe = (grupoId: string | null | undefined, pos: number | null | undefined): string | null => {
    if (!grupoId || (pos !== 1 && pos !== 2)) return null
    const c = clasificados.find(x => x.grupoId === grupoId)
    if (!c) return null
    return pos === 1 ? c.primeroId : c.segundoId
  }

  const { data: existentes } = await db.from('oficial_partidos')
    .select('id, orden, inscrito_a_id, inscrito_b_id, ganador_id, slot_a_grupo_id, slot_a_posicion, slot_b_grupo_id, slot_b_posicion')
    .eq('evento_id', params.eventoId).eq('fase', layout.faseInicial)

  if (!existentes?.length) {
    const inserts = layout.matches.map(m => {
      const grupoA = m.a ? grupos![m.a.grupoIdx]?.id ?? null : null
      const grupoB = m.b ? grupos![m.b.grupoIdx]?.id ?? null : null
      const a = realDe(grupoA, m.a?.pos)
      const esBye = m.b === null
      return {
        club_id: perfil.club_id,
        evento_id: params.eventoId,
        fase: layout.faseInicial,
        inscrito_a_id: a,
        inscrito_b_id: esBye ? null : realDe(grupoB, m.b?.pos),
        ganador_id: esBye && a ? a : null,
        orden: m.orden,
        slot_a_grupo_id: grupoA,
        slot_a_posicion: m.a?.pos ?? null,
        slot_b_grupo_id: grupoB,
        slot_b_posicion: m.b?.pos ?? null,
      }
    })
    if (inserts.length) {
      const { error: insErr } = await db.from('oficial_partidos').insert(inserts)
      if (insErr) return { error: 'No se pudo crear el bracket inicial' }
    }
  } else {
    const byOrden = new Map((existentes || []).map((r: { orden: number }) => [r.orden, r]))
    for (const m of layout.matches) {
      const row = byOrden.get(m.orden) as {
        id: string; ganador_id: string | null; inscrito_b_id: string | null
        inscrito_a_id: string | null; slot_a_grupo_id: string | null; slot_a_posicion: number | null
        slot_b_grupo_id: string | null; slot_b_posicion: number | null
      } | undefined
      if (!row || llaveFueJugada(row)) continue
      const grupoA = row.slot_a_grupo_id ?? (m.a ? grupos![m.a.grupoIdx]?.id ?? null : null)
      const posA = row.slot_a_posicion ?? m.a?.pos
      const grupoB = row.slot_b_grupo_id ?? (m.b ? grupos![m.b.grupoIdx]?.id ?? null : null)
      const posB = row.slot_b_posicion ?? m.b?.pos
      const a = realDe(grupoA, posA)
      const esBye = !grupoB || !posB
      const b = esBye ? null : realDe(grupoB, posB)
      const upd: Record<string, unknown> = {}
      if (row.inscrito_a_id !== a) upd.inscrito_a_id = a
      if (row.inscrito_b_id !== b) upd.inscrito_b_id = b
      const ganadorEsperado = esBye && a ? a : null
      if (row.ganador_id !== ganadorEsperado) upd.ganador_id = ganadorEsperado
      if (Object.keys(upd).length) await db.from('oficial_partidos').update(upd).eq('id', row.id)
    }
  }

  const { data: rondaInicial } = await db.from('oficial_partidos')
    .select('evento_id, fase, orden, ganador_id, inscrito_b_id')
    .eq('evento_id', params.eventoId).eq('fase', layout.faseInicial).order('orden')

  for (const p of rondaInicial || []) {
    if (p.ganador_id && !p.inscrito_b_id) {
      const errProp = await propagarGanadorPlayoffOficial(db, p, p.ganador_id, perfil.club_id!)
      if (errProp) return { error: errProp }
    }
  }

  const todosCompletos = clasificados.length === numGrupos
  if (todosCompletos && evento.fase === 'grupos') {
    await db.from('oficial_eventos').update({ fase: 'llaves', actualizado_en: new Date().toISOString() })
      .eq('id', params.eventoId)
  }

  return { faseInicial: layout.faseInicial, bracketCreado: true }
}

export async function actualizarConfigProgramacionOficial(params: {
  campeonatoId: string
  mesasCount: number
  bloqueMinutos: number
  horaInicio: string
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  if (params.mesasCount < 1 || params.mesasCount > 64) return { error: 'Mesas inválidas (1–64)' }
  if (params.bloqueMinutos < 10 || params.bloqueMinutos > 120) return { error: 'Bloque inválido (10–120 min)' }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(params.horaInicio)) return { error: 'Hora de inicio inválida' }

  const { error: err } = await db.from('oficial_campeonatos').update({
    mesas_count: params.mesasCount,
    bloque_minutos: params.bloqueMinutos,
    hora_inicio: params.horaInicio.length === 5 ? `${params.horaInicio}:00` : params.horaInicio,
    actualizado_en: new Date().toISOString(),
  }).eq('id', params.campeonatoId).eq('club_id', perfil.club_id)

  if (err) {
    const msg = err.message || ''
    if (msg.includes('mesas_count') || msg.includes('hora_inicio') || msg.includes('bloque_minutos')) {
      return { error: 'Falta aplicar la migración 158_torneo_oficial_llaves_programacion en Supabase (config de mesas).' }
    }
    return { error: msg || 'No se pudo guardar la configuración' }
  }
  return {}
}

export async function programarCampeonatoOficial(params: {
  campeonatoId: string
  fecha?: string
}): Promise<Resultado<{ programados: number }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: camp } = await db.from('oficial_campeonatos')
    .select('id, fecha_inicio, mesas_count, bloque_minutos, hora_inicio')
    .eq('id', params.campeonatoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!camp) return { error: 'Campeonato no encontrado' }

  const fecha = params.fecha || camp.fecha_inicio
  const hora = String(camp.hora_inicio || '09:00:00').slice(0, 8)
  const inicio = new Date(`${fecha}T${hora}-03:00`)

  const { data: eventos } = await db.from('oficial_eventos').select('id').eq('campeonato_id', params.campeonatoId)
  const eventoIds = (eventos || []).map((e: { id: string }) => e.id)
  if (!eventoIds.length) return { error: 'No hay eventos en el campeonato' }

  const { data: partidos } = await db.from('oficial_partidos')
    .select('id, evento_id, fase, orden, inscrito_a_id, inscrito_b_id, programado_en')
    .in('evento_id', eventoIds)
    .is('programado_en', null)
    .not('inscrito_a_id', 'is', null)

  const pendientes = (partidos || []).filter((p: { inscrito_b_id: string | null }) => p.inscrito_b_id)
  if (!pendientes.length) return { programados: 0 }

  const asignaciones = programarPartidosGreedy(
    pendientes.map((p: { id: string; inscrito_a_id: string; inscrito_b_id: string; fase: string; orden: number }) => ({
      id: p.id,
      inscritoA: p.inscrito_a_id,
      inscritoB: p.inscrito_b_id,
      prioridad: prioridadPartidoOficial(p.fase, p.orden),
    })),
    {
      mesas: camp.mesas_count ?? 8,
      bloqueMinutos: camp.bloque_minutos ?? 25,
      inicio,
    },
  )

  for (const [partidoId, slot] of asignaciones) {
    await db.from('oficial_partidos').update({
      mesa: slot.mesa,
      programado_en: slot.programadoEn.toISOString(),
      actualizado_en: new Date().toISOString(),
    }).eq('id', partidoId)
  }

  return { programados: asignaciones.size }
}

export async function programarEventoOficial(params: { eventoId: string; fecha?: string }): Promise<Resultado<{ programados: number }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: evento } = await db.from('oficial_eventos')
    .select('id, campeonato_id').eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }

  const { data: camp } = await db.from('oficial_campeonatos')
    .select('fecha_inicio, mesas_count, bloque_minutos, hora_inicio')
    .eq('id', evento.campeonato_id).maybeSingle()
  if (!camp) return { error: 'Campeonato no encontrado' }

  const fecha = params.fecha || camp.fecha_inicio
  const hora = String(camp.hora_inicio || '09:00:00').slice(0, 8)
  const inicio = new Date(`${fecha}T${hora}-03:00`)

  const { data: partidos } = await db.from('oficial_partidos')
    .select('id, fase, orden, inscrito_a_id, inscrito_b_id')
    .eq('evento_id', params.eventoId)
    .is('programado_en', null)
    .not('inscrito_a_id', 'is', null)

  const pendientes = (partidos || []).filter((p: { inscrito_b_id: string | null }) => p.inscrito_b_id)
  const asignaciones = programarPartidosGreedy(
    pendientes.map((p: { id: string; inscrito_a_id: string; inscrito_b_id: string; fase: string; orden: number }) => ({
      id: p.id,
      inscritoA: p.inscrito_a_id,
      inscritoB: p.inscrito_b_id,
      prioridad: prioridadPartidoOficial(p.fase, p.orden),
    })),
    {
      mesas: camp.mesas_count ?? 8,
      bloqueMinutos: camp.bloque_minutos ?? 25,
      inicio,
    },
  )

  for (const [partidoId, slot] of asignaciones) {
    await db.from('oficial_partidos').update({
      mesa: slot.mesa,
      programado_en: slot.programadoEn.toISOString(),
    }).eq('id', partidoId)
  }

  return { programados: asignaciones.size }
}

async function actualizarEstadoCampeonatoOficial(db: AdminDb, campeonatoId: string, clubId: string) {
  const { data: eventos } = await db.from('oficial_eventos')
    .select('fase, estado').eq('campeonato_id', campeonatoId).eq('club_id', clubId)
  if (!eventos?.length) return
  const todosFinal = eventos.every((e: { fase: string; estado: string }) =>
    e.fase === 'finalizado' || e.estado === 'finalizado',
  )
  if (todosFinal) {
    await db.from('oficial_campeonatos').update({
      estado: 'finalizado',
      actualizado_en: new Date().toISOString(),
    }).eq('id', campeonatoId).eq('club_id', clubId)
  }
}

/** Corrige un resultado ya registrado (grupos o llaves). */
export async function corregirResultadoOficial(params: {
  partidoId: string
  nuevoGanadorId: string
  setsTexto?: string
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: partido } = await db.from('oficial_partidos')
    .select('id, evento_id, fase, orden, grupo_id, inscrito_a_id, inscrito_b_id, ganador_id, sets, slot_a_grupo_id, slot_b_grupo_id')
    .eq('id', params.partidoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!partido?.ganador_id) return { error: 'El partido no tiene resultado aún' }
  if (params.nuevoGanadorId !== partido.inscrito_a_id && params.nuevoGanadorId !== partido.inscrito_b_id) {
    return { error: 'El ganador debe pertenecer al partido' }
  }
  if (partido.ganador_id === params.nuevoGanadorId) return {}
  if (!params.setsTexto?.trim()) {
    return { error: 'Para corregir el ganador debes ingresar los sets corregidos' }
  }

  if (partido.fase === 'grupos') {
    const { data: llaves } = await db.from('oficial_partidos')
      .select('id, ganador_id, inscrito_b_id, slot_a_grupo_id, slot_b_grupo_id')
      .eq('evento_id', partido.evento_id).neq('fase', 'grupos')
    if (llaves?.length && partido.grupo_id) {
      const afectadas = llaves.filter((p: { slot_a_grupo_id: string | null; slot_b_grupo_id: string | null }) =>
        p.slot_a_grupo_id === partido.grupo_id || p.slot_b_grupo_id === partido.grupo_id,
      )
      if (afectadas.some(llaveFueJugada)) {
        return { error: 'La rama de este grupo ya fue jugada. Reinicia las llaves primero.' }
      }
    }
    const parsed = parsearSetsTexto(params.setsTexto)
    if ('error' in parsed) return { error: parsed.error }
    const sets = parsed
    const { data: eventoGrupo } = await db.from('oficial_eventos')
      .select('formato_partido').eq('id', partido.evento_id).maybeSingle()
    const metaGrupo = gamesParaGanarFormato(eventoGrupo?.formato_partido || 'bo5')
    if (partido.inscrito_a_id && partido.inscrito_b_id) {
      const derivado = ganadorDesdeSets(
        partido.inscrito_a_id,
        partido.inscrito_b_id,
        sets,
        metaGrupo,
      )
      if (!derivado || derivado !== params.nuevoGanadorId) {
        return { error: 'Los sets corregidos no coinciden con el nuevo ganador' }
      }
    }
    await db.from('oficial_partidos').update({
      ganador_id: params.nuevoGanadorId,
      sets,
      es_walkover: false,
      actualizado_en: new Date().toISOString(),
    }).eq('id', params.partidoId)
    await sincronizarLlavesOficial({ eventoId: partido.evento_id })
    return {}
  }

  const faseSiguiente = siguienteFase(partido.fase as FaseOrden)
  if (faseSiguiente) {
    const ordenSig = Math.floor(partido.orden / 2)
    const { data: siguiente } = await db.from('oficial_partidos')
      .select('ganador_id').eq('evento_id', partido.evento_id)
      .eq('fase', faseSiguiente).eq('orden', ordenSig).maybeSingle()
    if (siguiente?.ganador_id) {
      return { error: 'La rama siguiente ya tiene ganador. Corrige primero los partidos posteriores.' }
    }
  }

  if (partido.fase === 'semis') {
    const { data: tercer } = await db.from('oficial_partidos')
      .select('ganador_id').eq('evento_id', partido.evento_id).eq('fase', 'tercer_lugar').maybeSingle()
    if (tercer?.ganador_id) {
      return { error: 'El partido por 3er lugar ya se jugó. Corrige ese resultado primero.' }
    }
  }

  const { data: evento } = await db.from('oficial_eventos').select('formato_partido, campeonato_id').eq('id', partido.evento_id).maybeSingle()
  const meta = gamesParaGanarFormato(evento?.formato_partido || 'bo5')
  const parsed = parsearSetsTexto(params.setsTexto)
  if ('error' in parsed) return { error: parsed.error }
  const sets = parsed
  if (partido.inscrito_a_id && partido.inscrito_b_id) {
    const derivado = ganadorDesdeSets(partido.inscrito_a_id, partido.inscrito_b_id, sets, meta)
    if (!derivado || derivado !== params.nuevoGanadorId) {
      return { error: 'Los sets no coinciden con el ganador indicado' }
    }
  }

  const { error: rpcErr } = await supabase.rpc('corregir_resultado_playoff_oficial_seguro', {
    p_partido_id: params.partidoId,
    p_nuevo_ganador_id: params.nuevoGanadorId,
    p_sets: sets,
  })
  if (rpcErr) {
    const msg = rpcErr.message || ''
    if (msg.includes('corregir_resultado_playoff_oficial_seguro') || msg.includes('Could not find the function')) {
      return { error: 'Falta aplicar la migración 161_corregir_playoff_oficial_seguro en Supabase.' }
    }
    return { error: msg }
  }

  if (partido.fase === 'semis') {
    const errTercer = await sincronizarTercerLugarOficial(db, partido.evento_id, perfil.club_id!)
    if (errTercer) return { error: errTercer }
  }

  if (partido.fase === 'final' && evento?.campeonato_id) {
    await actualizarEstadoCampeonatoOficial(db, evento.campeonato_id, perfil.club_id!)
  }

  return {}
}

export async function intercambiarCuposOficial(params: {
  eventoId: string
  slotA: { partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' }
  slotB: { partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' }
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { eventoId, slotA, slotB } = params
  if (slotA.partidoId === slotB.partidoId && slotA.posicion === slotB.posicion) return {}

  const ids = [...new Set([slotA.partidoId, slotB.partidoId])]
  const { data: filas } = await db.from('oficial_partidos')
    .select('id,evento_id,fase,orden,inscrito_a_id,inscrito_b_id,ganador_id,slot_a_grupo_id,slot_a_posicion,slot_b_grupo_id,slot_b_posicion')
    .in('id', ids).eq('evento_id', eventoId).eq('club_id', perfil.club_id)
  if (!filas || filas.length !== ids.length) return { error: 'No se encontraron ambos cupos' }

  const origen = filas.find((p: { id: string }) => p.id === slotA.partidoId)
  const destino = filas.find((p: { id: string }) => p.id === slotB.partidoId)
  if (!origen || !destino || origen.fase !== destino.fase || origen.fase === 'grupos') {
    return { error: 'Solo puedes intercambiar cupos de la misma ronda inicial' }
  }

  const { data: fases } = await db.from('oficial_partidos')
    .select('fase').eq('evento_id', eventoId).neq('fase', 'grupos')
  const faseInicial = CONFIG.FASES_ORDEN.find(f => (fases || []).some((p: { fase: string }) => p.fase === f))
  if (!faseInicial || origen.fase !== faseInicial) {
    return { error: 'Las rondas siguientes deben respetar el árbol de ganadores' }
  }
  if (llaveFueJugada(origen) || llaveFueJugada(destino)) {
    return { error: 'No puedes mover una llave que ya fue jugada' }
  }

  type Fila = typeof origen
  const leerSlot = (fila: Fila, posicion: 'inscrito_a' | 'inscrito_b') => posicion === 'inscrito_a'
    ? { inscrito: fila.inscrito_a_id, grupoId: fila.slot_a_grupo_id, posicion: fila.slot_a_posicion }
    : { inscrito: fila.inscrito_b_id, grupoId: fila.slot_b_grupo_id, posicion: fila.slot_b_posicion }
  const cupoOrigen = leerSlot(origen, slotA.posicion)
  const cupoDestino = leerSlot(destino, slotB.posicion)
  if (!cupoOrigen.inscrito && !cupoDestino.inscrito) {
    return { error: 'No hay nada que mover entre esos dos cupos' }
  }

  const aplicar = (fila: Fila, posicion: 'inscrito_a' | 'inscrito_b', nuevo: typeof cupoOrigen): Fila => {
    const siguiente = { ...fila }
    if (posicion === 'inscrito_a') {
      siguiente.inscrito_a_id = nuevo.inscrito
      siguiente.slot_a_grupo_id = nuevo.grupoId
      siguiente.slot_a_posicion = nuevo.posicion
    } else {
      siguiente.inscrito_b_id = nuevo.inscrito
      siguiente.slot_b_grupo_id = nuevo.grupoId
      siguiente.slot_b_posicion = nuevo.posicion
    }
    siguiente.ganador_id = !siguiente.inscrito_b_id && siguiente.inscrito_a_id ? siguiente.inscrito_a_id : null
    return siguiente
  }
  const origenNuevo = aplicar(origen, slotA.posicion, cupoDestino)
  const destinoNuevo = aplicar(destino, slotB.posicion, cupoOrigen)

  for (const fila of [origenNuevo, destinoNuevo]) {
    if (!fila.inscrito_a_id && !fila.inscrito_b_id) return { error: 'Esa llave se quedaría sin ningún jugador' }
    if (fila.slot_a_grupo_id && fila.slot_b_grupo_id && fila.slot_a_grupo_id === fila.slot_b_grupo_id) {
      return { error: 'No se puede enfrentar jugadores del mismo grupo' }
    }
  }

  const validarBye = async (fila: Fila) => {
    if (!fila.ganador_id || fila.inscrito_b_id || !fila.fase || fila.orden == null) return null
    const faseSiguiente = siguienteFase(fila.fase as FaseOrden)
    if (!faseSiguiente) return null
    const { data: siguiente } = await db.from('oficial_partidos')
      .select('ganador_id').eq('evento_id', eventoId).eq('fase', faseSiguiente)
      .eq('orden', Math.floor(fila.orden / 2)).maybeSingle()
    return siguiente?.ganador_id ? 'El jugador con BYE ya disputó la siguiente ronda' : null
  }
  for (const fila of [origen, destino]) {
    const bloqueo = await validarBye(fila)
    if (bloqueo) return { error: bloqueo }
  }

  const { error: rpcErr } = await supabase.rpc('intercambiar_cupos_oficial_seguro', {
    p_evento_id: eventoId,
    p_partido_a_id: slotA.partidoId,
    p_posicion_a: slotA.posicion,
    p_partido_b_id: slotB.partidoId,
    p_posicion_b: slotB.posicion,
  })
  if (rpcErr) {
    if (rpcErr.message?.includes('intercambiar_cupos_oficial_seguro')) {
      return { error: 'Falta aplicar la migración 160_tercer_lugar_e_intercambio_cupos_oficial en Supabase (drag de cupos).' }
    }
    return { error: rpcErr.message }
  }

  const { data: post } = await db.from('oficial_partidos')
    .select('id,evento_id,fase,orden,inscrito_a_id,inscrito_b_id,ganador_id')
    .in('id', ids).eq('evento_id', eventoId)
  for (const p of post ?? []) {
    if (!p.fase || p.orden == null) continue
    const faseSig = siguienteFase(p.fase as FaseOrden)
    if (!faseSig) continue
    const ordenSig = Math.floor(p.orden / 2)
    const slotField = p.orden % 2 === 0 ? 'inscrito_a_id' : 'inscrito_b_id'
    await db.from('oficial_partidos')
      .update({ [slotField]: p.ganador_id ?? null })
      .eq('evento_id', eventoId).eq('fase', faseSig).eq('orden', ordenSig)
  }

  return {}
}

/** Borra las llaves no jugadas y reconstruye desde grupos. */
export async function reiniciarLlavesOficial(params: { eventoId: string }): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: jugadas } = await db.from('oficial_partidos')
    .select('ganador_id, inscrito_b_id').eq('evento_id', params.eventoId).neq('fase', 'grupos')
  if (!jugadas?.length) return { error: 'No hay llaves generadas' }
  if (jugadas.some(llaveFueJugada)) {
    return { error: 'Hay partidos de llave ya jugados. Corrige esos resultados antes de reiniciar.' }
  }

  await db.from('oficial_partidos').delete().eq('evento_id', params.eventoId).neq('fase', 'grupos')
  await db.from('oficial_eventos').update({
    fase: 'grupos',
    campeon_inscrito_id: null,
    subcampeon_inscrito_id: null,
    tercer_inscrito_id: null,
    actualizado_en: new Date().toISOString(),
  }).eq('id', params.eventoId)

  await sincronizarLlavesOficial({ eventoId: params.eventoId })
  return {}
}
