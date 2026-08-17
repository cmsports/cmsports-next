'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/require'
import { fechaChile } from '@/lib/domain/fechaChile'
import { CONFIG, type FaseOrden } from '@/lib/config'
import {
  construirLlavesLayoutNumerado,
  determinarFaseInicial,
  nombreGrupo,
  seedingSerpenteoConClubes,
  siguienteFase,
  type JugadorTorneo,
} from '@/lib/domain/torneos'
import {
  calcularNumGruposOficial,
  clasificarGrupoIttf,
  gamesParaGanarFormato,
  ganadorDesdeSets,
  OFICIAL_MAX_GRUPOS,
  ordenPartidosGrupoIttf,
  parsearSetsTexto,
  resolverCierrePartido,
  type AlcanceSancionOficial,
  type PartidoOficialStats,
  type SetMarcador,
  type TipoCierreOficial,
} from '@/lib/domain/oficial-ittf'
import {
  conflictosAlAsignar,
  detectarConflictosProgramaMulti,
  programarCampeonatoPorDias,
} from '@/lib/domain/programar-oficial'
import {
  aplicarModoSorteoLlave,
  asignarNumerosIttf,
  colocarCuadroConPreLlave,
  esModoSorteoLlave,
  esTamanoCuadro,
  planificarPreLlave,
  type ModoSorteoLlave,
  type PlanPreLlave,
  type TamanoCuadro,
} from '@/lib/domain/oficial-sorteo'
import { traducirErrorMarcadorTecnico } from '@/lib/torneo-oficial/marcador-tecnico'

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

/** Asigna numero_ittf 1..N al evento (§4.5). Ignora si falta la columna (migración 181). */
async function renumerarPartidosEventoDb(db: AdminDb, eventoId: string): Promise<void> {
  const { data: grupos } = await db.from('oficial_grupos').select('id, orden').eq('evento_id', eventoId)
  const ordenGrupo = new Map((grupos || []).map((g: { id: string; orden: number }) => [g.id, g.orden]))
  const { data: partidos, error } = await db.from('oficial_partidos')
    .select('id, fase, orden, grupo_id')
    .eq('evento_id', eventoId)
  if (error || !partidos?.length) return

  const numeros = asignarNumerosIttf(partidos.map((p: { id: string; fase: string; orden: number; grupo_id: string | null }) => ({
    id: p.id,
    fase: p.fase,
    orden: p.orden,
    grupoOrden: p.grupo_id ? (ordenGrupo.get(p.grupo_id) ?? 0) : null,
  })))

  for (const [partidoId, numero] of numeros) {
    const { error: updErr } = await db.from('oficial_partidos')
      .update({ numero_ittf: numero })
      .eq('id', partidoId)
    if (updErr && String(updErr.message || '').includes('numero_ittf')) return
  }
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
  fechaJuego?: string
  tamanoCuadro?: TamanoCuadro | null
}): Promise<Resultado<{ id: string }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: camp } = await db.from('oficial_campeonatos').select('id, fecha_inicio')
    .eq('id', params.campeonatoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!camp) return { error: 'Campeonato no encontrado' }

  const nombre = params.nombre.trim()
  const categoria = params.categoria.trim()
  if (!nombre || !categoria) return { error: 'Nombre y categoría son obligatorios' }
  const fechaJuego = params.fechaJuego && /^\d{4}-\d{2}-\d{2}$/.test(params.fechaJuego)
    ? params.fechaJuego
    : camp.fecha_inicio
  const tamano = params.tamanoCuadro && esTamanoCuadro(params.tamanoCuadro) ? params.tamanoCuadro : null

  const { data, error: err } = await db.from('oficial_eventos').insert({
    club_id: perfil.club_id,
    campeonato_id: params.campeonatoId,
    nombre,
    categoria,
    genero: params.genero,
    formato_partido: params.formatoPartido || 'bo5',
    fase: 'inscripcion',
    estado: 'en_curso',
    fecha_juego: fechaJuego,
    tamano_cuadro: tamano,
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

export async function inscribirLoteOficial(params: {
  eventoId: string
  filas: Array<{
    nombre: string
    asociacion?: string
    codigoFederativo?: string
    ranking?: number
  }>
  sugerirCabezas?: boolean
}): Promise<Resultado<{ inscritos: number; omitidos: number; errores: string[] }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: evento } = await db.from('oficial_eventos').select('id, fase')
    .eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }
  if (evento.fase !== 'inscripcion') return { error: 'La inscripción ya está cerrada' }

  const filas = params.filas.slice(0, 400)
  if (!filas.length) return { error: 'No hay filas para importar' }

  const { count } = await db.from('oficial_inscritos').select('id', { count: 'exact', head: true })
    .eq('evento_id', params.eventoId)
  let orden = (count ?? 0) + 1
  let inscritos = 0
  let omitidos = 0
  const errores: string[] = []
  const idsConRanking: Array<{ id: string; ranking: number }> = []

  for (const f of filas) {
    const nombre = f.nombre.trim()
    if (!nombre) { omitidos++; continue }
    const { data, error: err } = await db.from('oficial_inscritos').insert({
      club_id: perfil.club_id,
      evento_id: params.eventoId,
      nombre,
      asociacion: f.asociacion?.trim() || null,
      codigo_federativo: f.codigoFederativo?.trim() || null,
      ranking: f.ranking ?? null,
      orden_inscripcion: orden,
    }).select('id, ranking').single()
    if (err || !data) {
      if (err?.code === '23505') {
        omitidos++
        continue
      }
      errores.push(`${nombre}: ${err?.message || 'error'}`)
      omitidos++
      continue
    }
    orden++
    inscritos++
    if (typeof data.ranking === 'number' && data.ranking > 0) {
      idsConRanking.push({ id: data.id, ranking: data.ranking })
    }
  }

  if (params.sugerirCabezas && idsConRanking.length) {
    const total = (count ?? 0) + inscritos
    const nCabezas = Math.min(calcularNumGruposOficial(total), idsConRanking.length, 16)
    idsConRanking.sort((a, b) => a.ranking - b.ranking)
    for (let i = 0; i < nCabezas; i++) {
      await db.from('oficial_inscritos').update({ cabeza_numero: i + 1 })
        .eq('id', idsConRanking[i].id)
    }
  }

  return { inscritos, omitidos, errores }
}

export async function actualizarEventoOficial(params: {
  eventoId: string
  fechaJuego?: string
  tamanoCuadro?: TamanoCuadro | null
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)
  const { data: evento } = await db.from('oficial_eventos').select('id')
    .eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }
  const upd: Record<string, unknown> = { actualizado_en: new Date().toISOString() }
  if (params.fechaJuego) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.fechaJuego)) return { error: 'Fecha de juego inválida' }
    upd.fecha_juego = params.fechaJuego
  }
  if (params.tamanoCuadro === null) upd.tamano_cuadro = null
  else if (params.tamanoCuadro != null) {
    if (!esTamanoCuadro(params.tamanoCuadro)) return { error: 'Cuadro inválido' }
    upd.tamano_cuadro = params.tamanoCuadro
  }
  const { error: err } = await db.from('oficial_eventos').update(upd).eq('id', params.eventoId)
  if (err) {
    if (String(err.message || '').includes('fecha_juego') || String(err.message || '').includes('tamano_cuadro')) {
      return { error: 'Falta aplicar la migración 195_oficial_zonal_programa_y_publico en Supabase.' }
    }
    return { error: err.message || 'No se pudo actualizar el evento' }
  }
  return {}
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

  // Manual JG §2.2: ~3 por grupo; 3–4; evitar grupos de 2 (no usar Math.ceil(N/3)).
  const numGrupos = calcularNumGruposOficial(inscritos.length)
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

  const miembros: Array<Record<string, unknown>> = []
  for (const g of grupos) {
    const ids = asignaciones.filter(a => a.grupoIndex === g.orden).map(a => a.jugadorId)
    ids.forEach((inscritoId, ordenEnGrupo) => {
      miembros.push({
        club_id: perfil.club_id!,
        grupo_id: g.id,
        inscrito_id: inscritoId,
        orden: ordenEnGrupo,
      })
    })
  }

  const { error: mErr } = await db.from('oficial_grupo_inscritos').insert(miembros)
  if (mErr) return { error: mErr.message || 'No se pudieron asignar inscritos' }

  const partidos: Array<Record<string, unknown>> = []
  for (const g of grupos) {
    const ids = asignaciones.filter(a => a.grupoIndex === g.orden).map(a => a.jugadorId)
    ordenPartidosGrupoIttf(ids).forEach(([a, b], i) => {
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

  await renumerarPartidosEventoDb(db, params.eventoId)

  return { numGrupos }
}

type ParamsResultadoOficial = {
  partidoId: string
  setsTexto?: string
  sets?: SetMarcador[]
  ganadorId?: string
  /** @deprecated preferir tipoCierre */
  esWalkover?: boolean
  tipoCierre?: TipoCierreOficial
  motivoCierre?: string
  alcanceSancion?: AlcanceSancionOficial
}

/** Staff que puede cerrar desde tablet (admin / profesor / superadmin con club). */
async function requireStaffMarcadorOficial() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, perfil: null }
  const { data: perfil } = await supabase.from('perfiles').select('id,club_id,rol,nombre').eq('id', user.id).single()
  if (!perfil?.club_id || !['admin', 'profesor', 'superadmin'].includes(perfil.rol ?? '')) {
    return { error: 'Acceso denegado' as const, supabase: null, perfil: null }
  }
  return { error: null, supabase, perfil }
}

async function aplicarResultadoOficialDb(db: AdminDb, clubId: string, params: ParamsResultadoOficial): Promise<Resultado> {
  const { data: partido } = await db.from('oficial_partidos')
    .select('id, evento_id, fase, orden, grupo_id, inscrito_a_id, inscrito_b_id, ganador_id, sets')
    .eq('id', params.partidoId).eq('club_id', clubId).maybeSingle()
  if (!partido) return { error: 'Partido no encontrado' }
  if (!partido.inscrito_a_id) return { error: 'Faltan jugadores' }
  if (!partido.inscrito_b_id) return { error: 'Los BYE avanzan solos; no se registran manualmente' }
  if (partido.ganador_id) return { error: 'El partido ya tiene resultado' }

  const { data: evento } = await db.from('oficial_eventos').select('formato_partido, fase, campeonato_id')
    .eq('id', partido.evento_id).maybeSingle()
  const meta = gamesParaGanarFormato(evento?.formato_partido || 'bo5')

  let sets: SetMarcador[] = params.sets ?? (Array.isArray(partido.sets) ? partido.sets as SetMarcador[] : [])
  if (params.setsTexto?.trim()) {
    const parsed = parsearSetsTexto(params.setsTexto)
    if ('error' in parsed) return { error: parsed.error }
    sets = parsed
  }

  const tipoCierre: TipoCierreOficial = params.tipoCierre
    ?? (params.esWalkover ? 'walkover' : 'jugado')

  const resuelto = resolverCierrePartido({
    inscritoA: partido.inscrito_a_id,
    inscritoB: partido.inscrito_b_id,
    tipoCierre,
    ganadorId: params.ganadorId,
    sets,
    gamesParaGanar: meta,
  })
  if ('error' in resuelto) return { error: resuelto.error }

  const alcance = params.alcanceSancion ?? 'partido'
  const motivo = params.motivoCierre?.trim() || null
  if ((resuelto.tipoCierre === 'walkover' || resuelto.tipoCierre === 'retiro') && !motivo) {
    return { error: 'Indica el motivo del W.O. / retiro' }
  }

  const { error: err } = await db.from('oficial_partidos').update({
    ganador_id: resuelto.ganadorId,
    sets: resuelto.sets,
    es_walkover: resuelto.esIncompleto,
    tipo_cierre: resuelto.tipoCierre,
    motivo_cierre: motivo,
    alcance_sancion: resuelto.esIncompleto ? alcance : null,
    actualizado_en: new Date().toISOString(),
  }).eq('id', params.partidoId).is('ganador_id', null)

  if (err) {
    if (String(err.message || '').includes('tipo_cierre') || String(err.message || '').includes('motivo_cierre')) {
      return { error: 'Falta aplicar la migración 180_oficial_cierre_sanciones_programa en Supabase.' }
    }
    return { error: err.message || 'No se pudo guardar el resultado' }
  }

  const perdedorId = resuelto.ganadorId === partido.inscrito_a_id
    ? partido.inscrito_b_id
    : partido.inscrito_a_id

  if (resuelto.esIncompleto && perdedorId && (alcance === 'evento' || alcance === 'campeonato')) {
    const errAlcance = await aplicarWalkoverAlcance({
      db,
      clubId,
      partidoOrigenId: params.partidoId,
      eventoId: partido.evento_id,
      campeonatoId: evento?.campeonato_id ?? null,
      perdedorId,
      alcance,
      motivo: motivo || 'Alcance de sanción',
      gamesParaGanar: meta,
    })
    if (errAlcance) return { error: errAlcance }
  }

  if (partido.fase !== 'grupos') {
    const errProp = await propagarGanadorPlayoffOficial(db, partido, resuelto.ganadorId, clubId)
    if (errProp) return { error: errProp }
    if (partido.fase === 'avance') {
      return {}
    }
    if (partido.fase === 'semis') {
      const errTercer = await sincronizarTercerLugarOficial(db, partido.evento_id, clubId)
      if (errTercer) return { error: errTercer }
    }
    await avanzarFaseEventoOficial(db, partido.evento_id, partido.fase)
    if (partido.fase === 'tercer_lugar') {
      await db.from('oficial_eventos').update({
        tercer_inscrito_id: resuelto.ganadorId,
        actualizado_en: new Date().toISOString(),
      }).eq('id', partido.evento_id)
    }
    if (partido.fase === 'final') {
      const subId = resuelto.ganadorId === partido.inscrito_a_id ? partido.inscrito_b_id : partido.inscrito_a_id
      const { data: ev } = await db.from('oficial_eventos').select('campeonato_id').eq('id', partido.evento_id).maybeSingle()
      await db.from('oficial_eventos').update({
        fase: 'finalizado',
        estado: 'finalizado',
        campeon_inscrito_id: resuelto.ganadorId,
        subcampeon_inscrito_id: subId,
        actualizado_en: new Date().toISOString(),
      }).eq('id', partido.evento_id)
      if (ev?.campeonato_id) await actualizarEstadoCampeonatoOficial(db, ev.campeonato_id, clubId)
    }
  } else if (evento?.fase === 'grupos') {
    await sincronizarLlavesOficial({ eventoId: partido.evento_id })
  }

  return {}
}

export async function registrarResultadoOficial(params: ParamsResultadoOficial): Promise<Resultado> {
  try {
    const { error, supabase, perfil } = await requireAdmin()
    if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
    return await aplicarResultadoOficialDb(dbOficial(supabase), perfil.club_id, params)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo guardar el resultado' }
  }
}

/** Aplica W.O. a partidos pendientes del sancionado en evento o campeonato. */
async function aplicarWalkoverAlcance(params: {
  db: AdminDb
  clubId: string
  partidoOrigenId: string
  eventoId: string
  campeonatoId: string | null
  perdedorId: string
  alcance: AlcanceSancionOficial
  motivo: string
  gamesParaGanar: number
}): Promise<string | null> {
  let eventoIds = [params.eventoId]
  if (params.alcance === 'campeonato' && params.campeonatoId) {
    const { data: evs } = await params.db.from('oficial_eventos')
      .select('id').eq('campeonato_id', params.campeonatoId).eq('club_id', params.clubId)
    eventoIds = (evs || []).map((e: { id: string }) => e.id)
  }

  const { data: pendientes } = await params.db.from('oficial_partidos')
    .select('id, inscrito_a_id, inscrito_b_id, evento_id, fase, orden, grupo_id')
    .eq('club_id', params.clubId)
    .in('evento_id', eventoIds)
    .is('ganador_id', null)
    .neq('id', params.partidoOrigenId)
    .or(`inscrito_a_id.eq.${params.perdedorId},inscrito_b_id.eq.${params.perdedorId}`)

  for (const p of pendientes || []) {
    if (!p.inscrito_a_id || !p.inscrito_b_id) continue
    const ganadorId = p.inscrito_a_id === params.perdedorId ? p.inscrito_b_id : p.inscrito_a_id
    const resuelto = resolverCierrePartido({
      inscritoA: p.inscrito_a_id,
      inscritoB: p.inscrito_b_id,
      tipoCierre: 'walkover',
      ganadorId,
      sets: [],
      gamesParaGanar: params.gamesParaGanar,
    })
    if ('error' in resuelto) continue

    await params.db.from('oficial_partidos').update({
      ganador_id: resuelto.ganadorId,
      sets: resuelto.sets,
      es_walkover: true,
      tipo_cierre: 'walkover',
      motivo_cierre: params.motivo,
      alcance_sancion: params.alcance,
      actualizado_en: new Date().toISOString(),
    }).eq('id', p.id).is('ganador_id', null)

    if (p.fase !== 'grupos') {
      await propagarGanadorPlayoffOficial(params.db, p, resuelto.ganadorId, params.clubId)
    }
  }
  return null
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
  tipoCierre?: TipoCierreOficial
  motivoCierre?: string
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireStaffMarcadorOficial()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: oficial } = await db.from('oficial_partidos')
    .select('id, inscrito_a_id, inscrito_b_id, ganador_id, evento_id')
    .eq('club_id', perfil.club_id)
    .eq('marcador_id', params.marcadorId)
    .maybeSingle()

  if (!oficial) return {}
  if (oficial.ganador_id) return {}

  const ganadorId = params.ganadorLado === 'a' ? oficial.inscrito_a_id : oficial.inscrito_b_id
  if (!ganadorId) return { error: 'Faltan inscritos en el partido oficial' }

  const tipoCierre = params.tipoCierre
    ?? (params.sets.length > 0 && params.motivoCierre ? 'retiro' : 'jugado')

  const res = await aplicarResultadoOficialDb(db, perfil.club_id, {
    partidoId: oficial.id,
    sets: params.sets,
    ganadorId,
    tipoCierre,
    motivoCierre: params.motivoCierre
      ?? (tipoCierre === 'jugado' ? undefined : 'Cierre desde marcador técnico'),
    alcanceSancion: 'partido',
  })

  // Sync tarjetas del marcador → bitácora oficial (best-effort).
  await sincronizarSancionesDesdeMarcador({
    db,
    clubId: perfil.club_id!,
    partidoOficialId: oficial.id,
    eventoId: oficial.evento_id,
    marcadorId: params.marcadorId,
    inscritoA: oficial.inscrito_a_id,
    inscritoB: oficial.inscrito_b_id,
    creadoPor: perfil.id,
  })

  return res
}

async function sincronizarSancionesDesdeMarcador(params: {
  db: AdminDb
  clubId: string
  partidoOficialId: string
  eventoId: string
  marcadorId: string
  inscritoA: string | null
  inscritoB: string | null
  creadoPor?: string | null
}): Promise<void> {
  const { data: tecnico } = await params.db.from('tecnico_partidos')
    .select('tarjetas_a, tarjetas_b')
    .eq('id', params.marcadorId)
    .maybeSingle()
  if (!tecnico) return

  type Tarjetas = { blanca?: boolean; amarilla?: number; roja?: number }
  const lados: Array<{ lado: 'a' | 'b'; inscrito: string | null; t: Tarjetas }> = [
    { lado: 'a', inscrito: params.inscritoA, t: (tecnico.tarjetas_a || {}) as Tarjetas },
    { lado: 'b', inscrito: params.inscritoB, t: (tecnico.tarjetas_b || {}) as Tarjetas },
  ]

  const filas: Array<Record<string, unknown>> = []
  for (const { inscrito, t } of lados) {
    if (!inscrito) continue
    if (t.blanca) {
      filas.push({
        club_id: params.clubId,
        evento_id: params.eventoId,
        partido_id: params.partidoOficialId,
        inscrito_id: inscrito,
        tipo: 'blanca',
        detalle: 'Tarjeta blanca (marcador)',
        origen: 'marcador',
        creado_por: params.creadoPor ?? null,
      })
    }
    const amarillas = Number(t.amarilla || 0)
    for (let i = 0; i < amarillas; i++) {
      filas.push({
        club_id: params.clubId,
        evento_id: params.eventoId,
        partido_id: params.partidoOficialId,
        inscrito_id: inscrito,
        tipo: 'amarilla',
        detalle: `Tarjeta amarilla #${i + 1} (marcador)`,
        origen: 'marcador',
        creado_por: params.creadoPor ?? null,
      })
    }
    const rojas = Number(t.roja || 0)
    for (let i = 0; i < rojas; i++) {
      filas.push({
        club_id: params.clubId,
        evento_id: params.eventoId,
        partido_id: params.partidoOficialId,
        inscrito_id: inscrito,
        tipo: 'roja',
        detalle: `Tarjeta roja #${i + 1} (marcador)`,
        origen: 'marcador',
        creado_por: params.creadoPor ?? null,
      })
    }
  }
  if (!filas.length) return

  // Evitar duplicar si ya se sincronizó.
  await params.db.from('oficial_sanciones')
    .delete()
    .eq('partido_id', params.partidoOficialId)
    .eq('origen', 'marcador')
  await params.db.from('oficial_sanciones').insert(filas)
}

/** Crea o reutiliza el marcador tablet técnico vinculado a un partido oficial. */
export async function abrirMarcadorOficial(params: {
  partidoId: string
}): Promise<Resultado<{ marcadorId: string; eventoId: string }>> {
  try {
    const { error, supabase, perfil } = await requireAdmin()
    if (error || !supabase || !perfil?.club_id) {
      return { error: traducirErrorMarcadorTecnico(error || 'Acceso denegado') }
    }
    const db = dbOficial(supabase)

    const sel = await db.from('oficial_partidos')
      .select('id, evento_id, fase, marcador_id, inscrito_a_id, inscrito_b_id, ganador_id')
      .eq('id', params.partidoId)
      .eq('club_id', perfil.club_id)
      .maybeSingle()

    if (sel.error) return { error: traducirErrorMarcadorTecnico(sel.error.message) }
    const partido = sel.data
    if (!partido) return { error: 'Partido no encontrado' }
    if (!partido.inscrito_a_id || !partido.inscrito_b_id) {
      return { error: 'El partido necesita ambos jugadores para abrir el marcador' }
    }

    if (partido.marcador_id) {
      const { data: existente } = await db.from('tecnico_partidos')
        .select('id')
        .eq('id', partido.marcador_id)
        .eq('club_id', perfil.club_id)
        .maybeSingle()
      if (existente?.id) {
        return { marcadorId: existente.id as string, eventoId: partido.evento_id as string }
      }
    }

    const { data: evento } = await db.from('oficial_eventos')
      .select('id, nombre, formato_partido')
      .eq('id', partido.evento_id)
      .eq('club_id', perfil.club_id)
      .maybeSingle()
    if (!evento) return { error: 'Evento no encontrado' }

    const { data: inscritos } = await db.from('oficial_inscritos')
      .select('id, nombre, asociacion')
      .in('id', [partido.inscrito_a_id, partido.inscrito_b_id])

    const porId = new Map<string, { nombre: string; asociacion: string | null }>(
      (inscritos || []).map((i: { id: string; nombre: string; asociacion: string | null }) => [
        i.id,
        { nombre: i.nombre, asociacion: i.asociacion },
      ]),
    )

    function etiqueta(inscritoId: string): string {
      const row = porId.get(inscritoId)
      if (!row) return 'Jugador'
      return row.asociacion ? `${row.nombre} (${row.asociacion})` : row.nombre
    }

    const formatoRaw = String(evento.formato_partido || 'bo5')
    const formato = formatoRaw === 'bo3' || formatoRaw === 'bo5' || formatoRaw === 'bo7'
      ? formatoRaw
      : 'bo5'

    const faseLabel = (CONFIG.FASE_LABELS as Record<string, string>)[partido.fase] || partido.fase

    const payload: Record<string, unknown> = {
      club_id: perfil.club_id,
      titulo: evento.nombre || 'Torneo oficial',
      ronda: faseLabel || null,
      formato,
      nombre_a: etiqueta(partido.inscrito_a_id),
      nombre_b: etiqueta(partido.inscrito_b_id),
      estado: 'preparacion',
      creado_por: perfil.id ?? null,
    }

    let ins = await db.from('tecnico_partidos').insert(payload).select('id').single()
    if (ins.error && /creado_por|foreign key/i.test(ins.error.message || '')) {
      const sinCreador = { ...payload }
      delete sinCreador.creado_por
      ins = await db.from('tecnico_partidos').insert(sinCreador).select('id').single()
    }

    if (ins.error || !ins.data?.id) {
      return { error: traducirErrorMarcadorTecnico(ins.error?.message || 'No se pudo crear el marcador técnico') }
    }
    const tecnico = ins.data

    let upd = db.from('oficial_partidos')
      .update({
        marcador_id: tecnico.id,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', partido.id)
      .eq('club_id', perfil.club_id)
    if (partido.marcador_id) {
      upd = upd.eq('marcador_id', partido.marcador_id)
    } else {
      upd = upd.is('marcador_id', null)
    }
    const { data: vinculado, error: updErr } = await upd.select('marcador_id').maybeSingle()

    if (updErr) {
      await db.from('tecnico_partidos').delete().eq('id', tecnico.id).eq('club_id', perfil.club_id)
      return { error: traducirErrorMarcadorTecnico(updErr.message || 'No se pudo vincular el marcador') }
    }

    // Carrera: otro proceso ya vinculó; reutilizar el existente y descartar el huérfano.
    if (!vinculado?.marcador_id) {
      const { data: actual } = await db.from('oficial_partidos')
        .select('marcador_id')
        .eq('id', partido.id)
        .eq('club_id', perfil.club_id)
        .maybeSingle()
      await db.from('tecnico_partidos').delete().eq('id', tecnico.id).eq('club_id', perfil.club_id)
      if (actual?.marcador_id) {
        const { data: vivo } = await db.from('tecnico_partidos')
          .select('id').eq('id', actual.marcador_id).eq('club_id', perfil.club_id).maybeSingle()
        if (vivo?.id) {
          return { marcadorId: vivo.id as string, eventoId: partido.evento_id as string }
        }
      }
      return { error: 'No se pudo vincular el marcador' }
    }

    return { marcadorId: vinculado.marcador_id as string, eventoId: partido.evento_id as string }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo abrir el marcador técnico'
    return { error: traducirErrorMarcadorTecnico(msg) }
  }
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

async function llenarCupoAvanceOficial(
  db: AdminDb,
  eventoId: string,
  avanceOrden: number,
  ganadorId: string,
): Promise<string | null> {
  const { data: slot, error } = await db.from('oficial_partidos')
    .select('id, inscrito_a_id, inscrito_b_id')
    .eq('evento_id', eventoId)
    .eq('avance_origen_orden', avanceOrden)
    .maybeSingle()
  if (error) {
    if (String(error.message || '').includes('avance_origen_orden')) return null
    return 'No se pudo ubicar el cupo de pre-llave'
  }
  if (!slot) return null
  const campo = !slot.inscrito_a_id ? 'inscrito_a_id' : !slot.inscrito_b_id ? 'inscrito_b_id' : null
  if (!campo) return null
  const { error: upd } = await db.from('oficial_partidos').update({
    [campo]: ganadorId,
    actualizado_en: new Date().toISOString(),
  }).eq('id', slot.id)
  if (upd) return 'No se pudo cargar el ganador de avance al cuadro'
  return null
}

async function propagarGanadorPlayoffOficial(
  db: AdminDb,
  partido: { evento_id: string; fase: string; orden: number },
  ganadorId: string,
  clubId: string,
): Promise<string | null> {
  if (!partido.evento_id || partido.fase === 'grupos') return null
  if (partido.fase === 'avance') {
    return llenarCupoAvanceOficial(db, partido.evento_id, partido.orden, ganadorId)
  }
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

async function sincronizarPreLlaveOficial(params: {
  db: AdminDb
  clubId: string
  eventoId: string
  eventoFase: string
  grupos: Array<{ id: string; orden: number }>
  clasificados: ClasificadoGrupo[]
  plan: PlanPreLlave
}): Promise<Resultado<{ faseInicial?: string; bracketCreado?: boolean }>> {
  const { db, clubId, eventoId, grupos, clasificados, plan } = params
  const porGrupo = new Map(clasificados.map(c => [c.grupoId, c]))
  const ordenados = grupos.map(g => porGrupo.get(g.id)).filter((c): c is ClasificadoGrupo => !!c)
  if (ordenados.length !== plan.numGrupos) {
    return { error: 'Faltan clasificados para armar la pre-llave' }
  }

  const { data: bracketExistente } = await db.from('oficial_partidos')
    .select('id, fase, ganador_id, inscrito_a_id, inscrito_b_id')
    .eq('evento_id', eventoId).neq('fase', 'grupos')
  const hayLlavesJugadas = !!bracketExistente?.some(llaveFueJugada)

  if (bracketExistente?.length && !hayLlavesJugadas) {
    await db.from('oficial_partidos').delete().eq('evento_id', eventoId).neq('fase', 'grupos')
  }

  const { data: avanceExistente } = await db.from('oficial_partidos')
    .select('id, orden, inscrito_a_id, inscrito_b_id, ganador_id')
    .eq('evento_id', eventoId).eq('fase', 'avance')

  if (!avanceExistente?.length) {
    const insertsAvance: Array<Record<string, unknown>> = []
    for (let i = 0; i < plan.partidosAvance; i++) {
      const a = ordenados[plan.segundosDirectos + i * 2]
      const b = ordenados[plan.segundosDirectos + i * 2 + 1]
      if (!a || !b) return { error: 'No se pudieron armar los cruces de avance' }
      insertsAvance.push({
        club_id: clubId,
        evento_id: eventoId,
        fase: 'avance',
        orden: i,
        inscrito_a_id: a.segundoId,
        inscrito_b_id: b.segundoId,
        ganador_id: null,
      })
    }
    if (insertsAvance.length) {
      const { error: insAv } = await db.from('oficial_partidos').insert(insertsAvance)
      if (insAv) return { error: insAv.message || 'No se pudo crear la pre-llave' }
    }
  }

  const faseInicial = determinarFaseInicial(plan.tamanoCuadro)
  const cruces = colocarCuadroConPreLlave(plan)
  const inscritoDe = (lado: { grupoIdx: number | null; pos: 1 | 2; avanceOrden: number | null }): string | null => {
    if (lado.avanceOrden != null) return null
    if (lado.grupoIdx == null) return null
    const c = ordenados[lado.grupoIdx]
    if (!c) return null
    return lado.pos === 1 ? c.primeroId : c.segundoId
  }

  const { data: cuadroExistente } = await db.from('oficial_partidos')
    .select('id, orden, inscrito_a_id, inscrito_b_id, ganador_id, avance_origen_orden')
    .eq('evento_id', eventoId).eq('fase', faseInicial)

  if (!cuadroExistente?.length) {
    const inserts = cruces.map(m => {
      const esperaAvance = m.a.avanceOrden != null || m.b.avanceOrden != null
      const a = inscritoDe(m.a)
      const b = inscritoDe(m.b)
      const grupoA = m.a.grupoIdx != null ? grupos[m.a.grupoIdx]?.id ?? null : null
      const grupoB = m.b.grupoIdx != null ? grupos[m.b.grupoIdx]?.id ?? null : null
      return {
        club_id: clubId,
        evento_id: eventoId,
        fase: faseInicial,
        orden: m.orden,
        inscrito_a_id: a,
        inscrito_b_id: b,
        ganador_id: !esperaAvance && a && !b ? a : null,
        slot_a_grupo_id: grupoA,
        slot_a_posicion: m.a.pos,
        slot_b_grupo_id: grupoB,
        slot_b_posicion: m.b.pos,
        avance_origen_orden: m.a.avanceOrden ?? m.b.avanceOrden ?? null,
      }
    })
    const { error: insErr } = await db.from('oficial_partidos').insert(inserts)
    if (insErr) {
      if (String(insErr.message || '').includes('avance_origen_orden')) {
        return { error: 'Falta aplicar la migración 195_oficial_zonal_programa_y_publico en Supabase.' }
      }
      return { error: insErr.message || 'No se pudo crear el cuadro con pre-llave' }
    }
  }

  const { data: avances } = await db.from('oficial_partidos')
    .select('orden, ganador_id')
    .eq('evento_id', eventoId).eq('fase', 'avance')
  for (const av of avances || []) {
    if (av.ganador_id) {
      const errFill = await llenarCupoAvanceOficial(db, eventoId, av.orden, av.ganador_id)
      if (errFill) return { error: errFill }
    }
  }

  const { data: rondaInicial } = await db.from('oficial_partidos')
    .select('evento_id, fase, orden, ganador_id, inscrito_b_id')
    .eq('evento_id', eventoId).eq('fase', faseInicial).order('orden')
  for (const p of rondaInicial || []) {
    if (p.ganador_id && !p.inscrito_b_id) {
      const errProp = await propagarGanadorPlayoffOficial(db, p, p.ganador_id, clubId)
      if (errProp) return { error: errProp }
    }
  }

  if (params.eventoFase === 'grupos') {
    await db.from('oficial_eventos').update({ fase: 'llaves', actualizado_en: new Date().toISOString() })
      .eq('id', eventoId)
  }

  await renumerarPartidosEventoDb(db, eventoId)
  return { faseInicial, bracketCreado: true }
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

  const { data: eventoRaw, error: evSelErr } = await db.from('oficial_eventos')
    .select('fase, clasifican_por_grupo, modo_sorteo_llave, tamano_cuadro')
    .eq('id', params.eventoId).maybeSingle()
  let evento = eventoRaw as {
    fase: string; clasifican_por_grupo: number; modo_sorteo_llave?: string; tamano_cuadro?: number | null
  } | null
  if (evSelErr && String(evSelErr.message || '').includes('tamano_cuadro')) {
    const { data: ev2, error: err2 } = await db.from('oficial_eventos')
      .select('fase, clasifican_por_grupo, modo_sorteo_llave')
      .eq('id', params.eventoId).maybeSingle()
    if (err2 && String(err2.message || '').includes('modo_sorteo_llave')) {
      const { data: ev3 } = await db.from('oficial_eventos')
        .select('fase, clasifican_por_grupo')
        .eq('id', params.eventoId).maybeSingle()
      evento = ev3 ? { ...ev3, modo_sorteo_llave: 'fijo', tamano_cuadro: null } : null
    } else {
      evento = ev2 ? { ...ev2, tamano_cuadro: null } : null
    }
  } else if (evSelErr && String(evSelErr.message || '').includes('modo_sorteo_llave')) {
    const { data: ev2 } = await db.from('oficial_eventos')
      .select('fase, clasifican_por_grupo')
      .eq('id', params.eventoId).maybeSingle()
    evento = ev2 ? { ...ev2, modo_sorteo_llave: 'fijo', tamano_cuadro: null } : null
  }
  if (!evento) return { error: 'Evento no encontrado' }

  const { data: grupos } = await db.from('oficial_grupos').select('id, orden').eq('evento_id', params.eventoId).order('orden')
  const numGrupos = grupos?.length ?? 0
  if (numGrupos < 2) return { error: 'Se requieren al menos 2 grupos' }
  if (numGrupos > OFICIAL_MAX_GRUPOS) {
    return { error: `El bracket admite hasta ${OFICIAL_MAX_GRUPOS} grupos` }
  }

  const tamano = esTamanoCuadro(evento.tamano_cuadro) ? evento.tamano_cuadro : null
  const planPre = tamano ? planificarPreLlave(numGrupos, tamano) : null
  if (planPre && 'error' in planPre) return { error: planPre.error }
  if (planPre) {
    if (clasificados.length !== numGrupos) {
      return { bracketCreado: false }
    }
    return sincronizarPreLlaveOficial({
      db,
      clubId: perfil.club_id!,
      eventoId: params.eventoId,
      eventoFase: evento.fase,
      grupos: grupos || [],
      clasificados,
      plan: planPre,
    })
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
  const layoutBase = construirLlavesLayoutNumerado(numGrupos, cabezasSlots, gruposListosIdx)
  if (!layoutBase.matches.length) return { error: 'No se pudo construir un bracket válido' }
  const modoSorteo: ModoSorteoLlave = esModoSorteoLlave(evento.modo_sorteo_llave)
    ? evento.modo_sorteo_llave
    : 'fijo'
  const layout = aplicarModoSorteoLlave(modoSorteo, layoutBase, numGrupos)

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

  await renumerarPartidosEventoDb(db, params.eventoId)

  return { faseInicial: layout.faseInicial, bracketCreado: true }
}

export async function actualizarConfigProgramacionOficial(params: {
  campeonatoId: string
  mesasCount: number
  bloqueMinutos: number
  horaInicio: string
  bloqueGrupoMinutos?: number
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  if (params.mesasCount < 1 || params.mesasCount > 64) return { error: 'Mesas inválidas (1–64)' }
  if (params.bloqueMinutos < 10 || params.bloqueMinutos > 120) return { error: 'Bloque de llaves inválido (10–120 min)' }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(params.horaInicio)) return { error: 'Hora de inicio inválida' }
  if (params.bloqueGrupoMinutos != null && (params.bloqueGrupoMinutos < 20 || params.bloqueGrupoMinutos > 180)) {
    return { error: 'Bloque de grupo inválido (20–180 min)' }
  }

  const upd: Record<string, unknown> = {
    mesas_count: params.mesasCount,
    bloque_minutos: params.bloqueMinutos,
    hora_inicio: params.horaInicio.length === 5 ? `${params.horaInicio}:00` : params.horaInicio,
    actualizado_en: new Date().toISOString(),
  }
  if (params.bloqueGrupoMinutos != null) upd.bloque_grupo_minutos = params.bloqueGrupoMinutos

  const { error: err } = await db.from('oficial_campeonatos').update(upd)
    .eq('id', params.campeonatoId).eq('club_id', perfil.club_id)

  if (err) {
    const msg = err.message || ''
    if (msg.includes('bloque_grupo_minutos')) {
      return { error: 'Falta aplicar la migración 195_oficial_zonal_programa_y_publico en Supabase.' }
    }
    if (msg.includes('mesas_count') || msg.includes('hora_inicio') || msg.includes('bloque_minutos')) {
      return { error: 'Falta aplicar la migración 158_torneo_oficial_llaves_programacion en Supabase (config de mesas).' }
    }
    return { error: msg || 'No se pudo guardar la configuración' }
  }
  return {}
}

const TIPOS_BLOQUE_ESPECIAL = ['apertura', 'receso', 'premiacion', 'otro'] as const
type TipoBloqueEspecial = (typeof TIPOS_BLOQUE_ESPECIAL)[number]

function esTipoBloqueEspecial(v: unknown): v is TipoBloqueEspecial {
  return TIPOS_BLOQUE_ESPECIAL.includes(v as TipoBloqueEspecial)
}

export async function reemplazarBloquesEspecialesOficial(params: {
  campeonatoId: string
  bloques: Array<{
    fecha: string
    hora: string
    duracionMin?: number
    tipo?: string
    etiqueta: string
  }>
}): Promise<Resultado<{ total: number }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: camp } = await db.from('oficial_campeonatos').select('id')
    .eq('id', params.campeonatoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!camp) return { error: 'Campeonato no encontrado' }

  const filas: Array<Record<string, unknown>> = []
  for (const b of params.bloques) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) return { error: 'Fecha de bloque inválida' }
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(b.hora)) return { error: 'Hora de bloque inválida' }
    const etiqueta = b.etiqueta.trim()
    if (!etiqueta) return { error: 'La etiqueta del bloque es obligatoria' }
    const tipo = b.tipo && esTipoBloqueEspecial(b.tipo) ? b.tipo : 'receso'
    const duracion = b.duracionMin ?? 40
    if (duracion < 5 || duracion > 180) return { error: 'Duración de bloque inválida (5–180 min)' }
    filas.push({
      club_id: perfil.club_id,
      campeonato_id: params.campeonatoId,
      fecha: b.fecha,
      hora: b.hora.length === 5 ? `${b.hora}:00` : b.hora,
      duracion_min: duracion,
      tipo,
      etiqueta,
    })
  }

  await db.from('oficial_bloques_especiales').delete()
    .eq('campeonato_id', params.campeonatoId).eq('club_id', perfil.club_id)
  if (filas.length) {
    const { error: ins } = await db.from('oficial_bloques_especiales').insert(filas)
    if (ins) {
      if (String(ins.message || '').includes('oficial_bloques_especiales')) {
        return { error: 'Falta aplicar la migración 195_oficial_zonal_programa_y_publico en Supabase.' }
      }
      return { error: ins.message || 'No se pudieron guardar los bloques' }
    }
  }
  return { total: filas.length }
}

export async function programarCampeonatoOficial(params: {
  campeonatoId: string
  fecha?: string
  eventoId?: string
}): Promise<Resultado<{ programados: number; omitidos: number }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: campRaw, error: campErr } = await db.from('oficial_campeonatos')
    .select('id, fecha_inicio, mesas_count, bloque_minutos, bloque_grupo_minutos, hora_inicio')
    .eq('id', params.campeonatoId).eq('club_id', perfil.club_id).maybeSingle()
  let camp = campRaw as {
    id: string; fecha_inicio: string; mesas_count: number; bloque_minutos: number
    bloque_grupo_minutos?: number; hora_inicio: string
  } | null
  if (campErr && String(campErr.message || '').includes('bloque_grupo_minutos')) {
    const { data: c2 } = await db.from('oficial_campeonatos')
      .select('id, fecha_inicio, mesas_count, bloque_minutos, hora_inicio')
      .eq('id', params.campeonatoId).eq('club_id', perfil.club_id).maybeSingle()
    camp = c2 ? { ...c2, bloque_grupo_minutos: 70 } : null
  }
  if (!camp) return { error: 'Campeonato no encontrado' }

  const { data: eventosRaw, error: evErr } = await db.from('oficial_eventos')
    .select('id, fecha_juego').eq('campeonato_id', params.campeonatoId)
  let eventos = (eventosRaw || []) as Array<{ id: string; fecha_juego?: string | null }>
  if (evErr && String(evErr.message || '').includes('fecha_juego')) {
    const { data: ev2 } = await db.from('oficial_eventos').select('id').eq('campeonato_id', params.campeonatoId)
    eventos = (ev2 || []).map((e: { id: string }) => ({ id: e.id, fecha_juego: camp!.fecha_inicio }))
  }
  const eventoIds = eventos.map(e => e.id).filter(id => !params.eventoId || id === params.eventoId)
  if (!eventoIds.length) return { error: 'No hay eventos en el campeonato' }
  const fechaPorEvento = new Map(eventos.map(e => [e.id, e.fecha_juego || camp.fecha_inicio]))

  const qEsp = await db.from('oficial_bloques_especiales')
    .select('fecha, hora, duracion_min').eq('campeonato_id', params.campeonatoId)
  const especiales = qEsp.error
    ? []
    : (qEsp.data || []).map((b: { fecha: string; hora: string; duracion_min: number }) => ({
      fecha: b.fecha,
      hora: String(b.hora),
      duracionMin: b.duracion_min,
    }))

  const { data: inscritos } = await db.from('oficial_inscritos')
    .select('id, nombre, jugador_id').in('evento_id', eventoIds)
  const clavePorInscrito = new Map((inscritos || []).map((i: { id: string; nombre: string; jugador_id: string | null }) => [
    i.id,
    i.jugador_id ? `jid:${i.jugador_id}` : `nom:${i.nombre.trim().toLowerCase()}`,
  ]))

  const { data: yaRows } = await db.from('oficial_partidos')
    .select('mesa, programado_en')
    .in('evento_id', eventos.map(e => e.id))
    .not('programado_en', 'is', null)
    .not('mesa', 'is', null)
  const yaProgramados = (yaRows || [])
    .filter((p: { mesa: number | null; programado_en: string | null }) => p.mesa && p.programado_en)
    .map((p: { mesa: number; programado_en: string }) => ({
      mesa: p.mesa,
      programadoEn: new Date(p.programado_en),
    }))

  const { data: partidos } = await db.from('oficial_partidos')
    .select('id, evento_id, fase, orden, grupo_id, inscrito_a_id, inscrito_b_id, programado_en')
    .in('evento_id', eventoIds)
    .is('programado_en', null)
    .not('inscrito_a_id', 'is', null)

  const pendientes = (partidos || []).filter((p: { inscrito_b_id: string | null; evento_id: string }) => {
    if (!p.inscrito_b_id) return false
    const fecha = fechaPorEvento.get(p.evento_id) || camp.fecha_inicio
    if (params.fecha && fecha !== params.fecha) return false
    return true
  })
  if (!pendientes.length) return { programados: 0, omitidos: 0 }

  const { asignaciones, omitidos } = programarCampeonatoPorDias(
    pendientes.map((p: {
      id: string; evento_id: string; fase: string; orden: number; grupo_id: string | null
      inscrito_a_id: string; inscrito_b_id: string
    }) => ({
      id: p.id,
      fechaJuego: fechaPorEvento.get(p.evento_id) || camp.fecha_inicio,
      fase: p.fase,
      orden: p.orden,
      grupoId: p.grupo_id,
      inscritoA: p.inscrito_a_id,
      inscritoB: p.inscrito_b_id,
      clavesJugadores: [clavePorInscrito.get(p.inscrito_a_id), clavePorInscrito.get(p.inscrito_b_id)].filter(Boolean) as string[],
    })),
    {
      mesas: camp.mesas_count ?? 8,
      bloqueGrupoMinutos: camp.bloque_grupo_minutos ?? 70,
      bloqueLlaveMinutos: camp.bloque_minutos ?? 25,
      horaInicio: String(camp.hora_inicio || '09:00:00'),
      especiales,
      yaProgramados,
    },
  )

  for (const [partidoId, slot] of asignaciones) {
    await db.from('oficial_partidos').update({
      mesa: slot.mesa,
      programado_en: slot.programadoEn.toISOString(),
      actualizado_en: new Date().toISOString(),
    }).eq('id', partidoId)
  }

  return { programados: asignaciones.size, omitidos: omitidos.length }
}

export async function programarEventoOficial(params: { eventoId: string; fecha?: string }): Promise<Resultado<{ programados: number; omitidos: number }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: eventoRaw, error: evErr } = await db.from('oficial_eventos')
    .select('id, campeonato_id, fecha_juego').eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  let evento = eventoRaw as { id: string; campeonato_id: string; fecha_juego?: string | null } | null
  if (evErr && String(evErr.message || '').includes('fecha_juego')) {
    const { data: ev2 } = await db.from('oficial_eventos')
      .select('id, campeonato_id').eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
    evento = ev2 ? { ...ev2, fecha_juego: null } : null
  }
  if (!evento) return { error: 'Evento no encontrado' }

  return programarCampeonatoOficial({
    campeonatoId: evento.campeonato_id,
    fecha: params.fecha || evento.fecha_juego || undefined,
    eventoId: evento.id,
  })
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
      tipo_cierre: 'jugado',
      motivo_cierre: null,
      alcance_sancion: null,
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

/** Edita mesa/hora de un partido y reporta conflictos de mesa/jugador. */
export async function actualizarProgramaPartidoOficial(params: {
  partidoId: string
  mesa: number | null
  programadoEn: string | null
  /** Si true, guarda aunque haya conflicto (solo advierte). */
  forzar?: boolean
}): Promise<Resultado<{ conflictos: Array<{ tipo: string; motivo: string; otroId: string }> }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: partido } = await db.from('oficial_partidos')
    .select('id, evento_id, inscrito_a_id, inscrito_b_id, mesa, programado_en')
    .eq('id', params.partidoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!partido) return { error: 'Partido no encontrado' }

  if (params.mesa != null && params.mesa < 1) return { error: 'Mesa inválida' }

  const { data: campRow } = await db.from('oficial_eventos')
    .select('campeonato_id').eq('id', partido.evento_id).maybeSingle()
  const { data: camp } = campRow?.campeonato_id
    ? await db.from('oficial_campeonatos')
      .select('mesas_count').eq('id', campRow.campeonato_id).maybeSingle()
    : { data: null }
  if (params.mesa != null && camp?.mesas_count && params.mesa > camp.mesas_count) {
    return { error: `La mesa debe estar entre 1 y ${camp.mesas_count}` }
  }

  // Conflictos contra todos los partidos del campeonato (multi-evento mismo día).
  let query = db.from('oficial_partidos')
    .select('id, inscrito_a_id, inscrito_b_id, mesa, programado_en, evento_id')
    .eq('club_id', perfil.club_id)
  if (campRow?.campeonato_id) {
    const { data: evs } = await db.from('oficial_eventos')
      .select('id').eq('campeonato_id', campRow.campeonato_id)
    const ids = (evs || []).map((e: { id: string }) => e.id)
    query = query.in('evento_id', ids)
  } else {
    query = query.eq('evento_id', partido.evento_id)
  }
  const { data: todos } = await query

  const slots = (todos || []).map((p: {
    id: string; inscrito_a_id: string | null; inscrito_b_id: string | null
    mesa: number | null; programado_en: string | null
  }) => ({
    id: p.id,
    inscritoA: p.inscrito_a_id,
    inscritoB: p.inscrito_b_id,
    mesa: p.mesa,
    programadoEn: p.programado_en,
  }))

  let conflictos: Array<{ tipo: string; motivo: string; otroId: string }> = []
  if (params.mesa != null && params.programadoEn) {
    conflictos = conflictosAlAsignar(
      slots,
      params.partidoId,
      params.mesa,
      new Date(params.programadoEn),
    ).map(c => ({ tipo: c.tipo, motivo: c.motivo, otroId: c.otroId }))
    if (conflictos.length && !params.forzar) {
      return { error: conflictos[0].motivo, conflictos }
    }
  }

  const { error: updErr } = await db.from('oficial_partidos').update({
    mesa: params.mesa,
    programado_en: params.programadoEn,
    actualizado_en: new Date().toISOString(),
  }).eq('id', params.partidoId)

  if (updErr) return { error: updErr.message || 'No se pudo actualizar el programa' }
  return { conflictos }
}

/** Lista conflictos actuales del programa de un evento (o campeonato). */
export async function listarConflictosProgramaOficial(params: {
  eventoId?: string
  campeonatoId?: string
}): Promise<Resultado<{
  conflictos: ReturnType<typeof detectarConflictosProgramaMulti>
}>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  let eventoIds: string[] = []
  const eventoNombre = new Map<string, string>()
  if (params.campeonatoId) {
    const { data: evs } = await db.from('oficial_eventos')
      .select('id, nombre').eq('campeonato_id', params.campeonatoId).eq('club_id', perfil.club_id)
    eventoIds = (evs || []).map((e: { id: string }) => e.id)
    for (const e of evs || []) eventoNombre.set(e.id, e.nombre)
  } else if (params.eventoId) {
    eventoIds = [params.eventoId]
    const { data: ev } = await db.from('oficial_eventos').select('id, nombre').eq('id', params.eventoId).maybeSingle()
    if (ev) eventoNombre.set(ev.id, ev.nombre)
  } else {
    return { error: 'Indica evento o campeonato' }
  }

  if (!eventoIds.length) return { conflictos: [] }

  const { data: inscritos } = await db.from('oficial_inscritos')
    .select('id, nombre, jugador_id, evento_id')
    .in('evento_id', eventoIds)

  const clavePorInscrito = new Map<string, string>()
  const nombrePorInscrito = new Map<string, string>()
  for (const i of inscritos || []) {
    const clave = i.jugador_id
      ? `jid:${i.jugador_id}`
      : `nom:${String(i.nombre || '').trim().toLowerCase()}`
    clavePorInscrito.set(i.id, clave)
    nombrePorInscrito.set(i.id, i.nombre)
  }

  const { data: todos } = await db.from('oficial_partidos')
    .select('id, evento_id, grupo_id, inscrito_a_id, inscrito_b_id, mesa, programado_en, numero_ittf')
    .eq('club_id', perfil.club_id)
    .in('evento_id', eventoIds)
    .not('programado_en', 'is', null)

  const conflictos = detectarConflictosProgramaMulti((todos || []).map((p: {
    id: string; evento_id: string; grupo_id: string | null
    inscrito_a_id: string | null; inscrito_b_id: string | null
    mesa: number | null; programado_en: string | null; numero_ittf?: number | null
  }) => {
    const na = p.inscrito_a_id ? (nombrePorInscrito.get(p.inscrito_a_id) || '?') : '?'
    const nb = p.inscrito_b_id ? (nombrePorInscrito.get(p.inscrito_b_id) || '?') : 'BYE'
    const num = p.numero_ittf ? `#${p.numero_ittf} ` : ''
    return {
      id: p.id,
      eventoId: p.evento_id,
      grupoId: p.grupo_id,
      inscritoA: p.inscrito_a_id,
      inscritoB: p.inscrito_b_id,
      mesa: p.mesa,
      programadoEn: p.programado_en,
      claveJugadorA: p.inscrito_a_id ? (clavePorInscrito.get(p.inscrito_a_id) ?? null) : null,
      claveJugadorB: p.inscrito_b_id ? (clavePorInscrito.get(p.inscrito_b_id) ?? null) : null,
      eventoNombre: eventoNombre.get(p.evento_id),
      labelPartido: `${num}${na} vs ${nb}${eventoNombre.has(p.evento_id) ? ` (${eventoNombre.get(p.evento_id)})` : ''}`,
    }
  }))

  return { conflictos }
}

export async function registrarSancionOficial(params: {
  eventoId: string
  partidoId?: string
  inscritoId: string
  tipo: 'blanca' | 'amarilla' | 'roja' | 'descalificacion' | 'otro'
  detalle?: string
}): Promise<Resultado<{ id: string }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: evento } = await db.from('oficial_eventos')
    .select('id').eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }

  const { data, error: insErr } = await db.from('oficial_sanciones').insert({
    club_id: perfil.club_id,
    evento_id: params.eventoId,
    partido_id: params.partidoId ?? null,
    inscrito_id: params.inscritoId,
    tipo: params.tipo,
    detalle: params.detalle?.trim() || null,
    origen: 'manual',
    creado_por: perfil.id,
  }).select('id').single()

  if (insErr) {
    if (String(insErr.message || '').includes('oficial_sanciones')) {
      return { error: 'Falta aplicar la migración 180_oficial_cierre_sanciones_programa en Supabase.' }
    }
    return { error: insErr.message || 'No se pudo registrar la sanción' }
  }
  return { id: data.id }
}

/** Configura el modo de sorteo de 2ª fase (§3.7). Requiere re-sincronizar llaves. */
export async function actualizarModoSorteoLlaveOficial(params: {
  eventoId: string
  modo: ModoSorteoLlave
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  if (!esModoSorteoLlave(params.modo)) return { error: 'Modo de sorteo inválido' }
  const db = dbOficial(supabase)

  const { data: evento } = await db.from('oficial_eventos')
    .select('id, fase').eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }

  const { data: jugados } = await db.from('oficial_partidos')
    .select('id, ganador_id, inscrito_b_id')
    .eq('evento_id', params.eventoId)
    .neq('fase', 'grupos')
  if ((jugados || []).some(llaveFueJugada)) {
    return { error: 'Hay llaves jugadas. Reinicia las llaves antes de cambiar el sorteo.' }
  }

  const { error: updErr } = await db.from('oficial_eventos').update({
    modo_sorteo_llave: params.modo,
    actualizado_en: new Date().toISOString(),
  }).eq('id', params.eventoId)

  if (updErr) {
    if (String(updErr.message || '').includes('modo_sorteo_llave')) {
      return { error: 'Falta aplicar la migración 181_oficial_sorteo_numero_arbitro en Supabase.' }
    }
    return { error: updErr.message || 'No se pudo guardar el modo de sorteo' }
  }
  return {}
}

/** Reasigna numeración ITTF del evento (§4.5). */
export async function renumerarPartidosOficial(params: { eventoId: string }): Promise<Resultado<{ total: number }>> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const { data: evento } = await db.from('oficial_eventos')
    .select('id').eq('id', params.eventoId).eq('club_id', perfil.club_id).maybeSingle()
  if (!evento) return { error: 'Evento no encontrado' }

  const { count } = await db.from('oficial_partidos')
    .select('id', { count: 'exact', head: true }).eq('evento_id', params.eventoId)
  await renumerarPartidosEventoDb(db, params.eventoId)
  return { total: count ?? 0 }
}

/** Asigna árbitro (texto) a un partido/mesa. */
export async function actualizarArbitroPartidoOficial(params: {
  partidoId: string
  arbitroNombre: string | null
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)

  const nombre = params.arbitroNombre?.trim() || null
  if (nombre && nombre.length > 80) return { error: 'Nombre de árbitro demasiado largo' }

  const { error: updErr } = await db.from('oficial_partidos').update({
    arbitro_nombre: nombre,
    actualizado_en: new Date().toISOString(),
  }).eq('id', params.partidoId).eq('club_id', perfil.club_id)

  if (updErr) {
    if (String(updErr.message || '').includes('arbitro_nombre')) {
      return { error: 'Falta aplicar la migración 181_oficial_sorteo_numero_arbitro en Supabase.' }
    }
    return { error: updErr.message || 'No se pudo guardar el árbitro' }
  }
  return {}
}

/** Soft-archive: mismo patrón que torneos de club (`estado = 'archivado'`). */
export async function archivarCampeonatoOficial(params: {
  campeonatoId: string
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)
  const clubId = perfil.club_id

  const { data: camp } = await db.from('oficial_campeonatos')
    .select('id, estado').eq('id', params.campeonatoId).eq('club_id', clubId).maybeSingle()
  if (!camp) return { error: 'Campeonato no encontrado' }
  if (camp.estado === 'archivado') return {}

  const ahora = new Date().toISOString()
  const { error: updErr } = await db.from('oficial_campeonatos').update({
    estado: 'archivado',
    actualizado_en: ahora,
  }).eq('id', params.campeonatoId).eq('club_id', clubId)
  if (updErr) return { error: `No se pudo archivar: ${updErr.message}` }

  await db.from('oficial_eventos').update({
    estado: 'archivado',
    actualizado_en: ahora,
  }).eq('campeonato_id', params.campeonatoId).eq('club_id', clubId)

  return {}
}

/** Restaura un campeonato archivado a `en_curso` (espejo de torneos internos). */
export async function desarchivarCampeonatoOficial(params: {
  campeonatoId: string
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)
  const clubId = perfil.club_id

  const { data: camp } = await db.from('oficial_campeonatos')
    .select('id, estado').eq('id', params.campeonatoId).eq('club_id', clubId).maybeSingle()
  if (!camp) return { error: 'Campeonato no encontrado' }
  if (camp.estado !== 'archivado') return { error: 'El campeonato no está archivado' }

  const ahora = new Date().toISOString()
  const { error: updErr } = await db.from('oficial_campeonatos').update({
    estado: 'en_curso',
    actualizado_en: ahora,
  }).eq('id', params.campeonatoId).eq('club_id', clubId)
  if (updErr) return { error: `No se pudo desarchivar: ${updErr.message}` }

  await db.from('oficial_eventos').update({
    estado: 'en_curso',
    actualizado_en: ahora,
  }).eq('campeonato_id', params.campeonatoId).eq('club_id', clubId).eq('estado', 'archivado')

  return {}
}

/**
 * Hard-delete del campeonato oficial y todo lo colgante (eventos, inscritos,
 * grupos, partidos, sanciones) vía ON DELETE CASCADE. Sin movimientos
 * financieros asociados.
 */
export async function eliminarCampeonatoOficialDefinitivo(params: {
  campeonatoId: string
}): Promise<Resultado> {
  const { error, supabase, perfil } = await requireAdmin()
  if (error || !supabase || !perfil?.club_id) return { error: error || 'Acceso denegado' }
  const db = dbOficial(supabase)
  const clubId = perfil.club_id

  const { data: camp } = await db.from('oficial_campeonatos')
    .select('id, nombre').eq('id', params.campeonatoId).eq('club_id', clubId).maybeSingle()
  if (!camp) return { error: 'Campeonato no encontrado' }

  // Limpia vínculos a marcador técnico antes del cascade (FK SET NULL en 179,
  // pero los tecnico_partidos quedan huérfanos; no los borramos).
  const { data: eventos } = await db.from('oficial_eventos')
    .select('id').eq('campeonato_id', params.campeonatoId).eq('club_id', clubId)
  const eventoIds = (eventos || []).map((e: { id: string }) => e.id)
  if (eventoIds.length) {
    await db.from('oficial_partidos')
      .update({ marcador_id: null, actualizado_en: new Date().toISOString() })
      .in('evento_id', eventoIds)
    // Evita fricción si quedan FKs campeon/subcampeon → inscritos al borrar.
    await db.from('oficial_eventos').update({
      campeon_inscrito_id: null,
      subcampeon_inscrito_id: null,
      tercer_inscrito_id: null,
    }).in('id', eventoIds)
  }

  const { error: delErr } = await db.from('oficial_campeonatos')
    .delete().eq('id', params.campeonatoId).eq('club_id', clubId)
  if (delErr) return { error: `No se pudo eliminar: ${delErr.message}` }

  return {}
}
