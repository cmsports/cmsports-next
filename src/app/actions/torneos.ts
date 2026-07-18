'use server'

import {
  seedingSerpenteo,
  generarRoundRobin,
  siguienteFase,
  construirLlavesLayoutNumerado,
  calcularNumGrupos,
  calcularNumGruposTardios,
  calcularStatsGrupo,
  derivarPodioFinal,
  nombreGrupo,
  type JugadorTorneo,
} from '@/lib/domain/torneos'
import { CONFIG, type FaseOrden } from '@/lib/config'
import { requireAdmin } from '@/lib/auth/require'

type AdminSupabase = NonNullable<Awaited<ReturnType<typeof requireAdmin>>['supabase']>

type ClasificadoGrupo = { grupoId: string; primeroId: string; segundoId: string }
type CabezaNumerada = { jugadorId: string; numero: number }

function llaveFueJugada(partido: { ganador: string | null; jugador_b: string | null }) {
  return !!partido.ganador && !!partido.jugador_b
}

function ordenarMiembros<T extends { orden?: number | null; jugador_id?: string | null }>(miembros: T[]) {
  return [...miembros].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.jugador_id ?? '').localeCompare(String(b.jugador_id ?? '')))
}

async function leerCabezasSerie(supabase: AdminSupabase, torneoId: string): Promise<{ cabezas: CabezaNumerada[]; error?: string }> {
  const { data, error } = await supabase.from('torneo_cabezas_serie')
    .select('jugador_id,numero').eq('torneo_id', torneoId).order('numero')
  if (error) return { cabezas: [], error: 'No se pudo leer la lista de cabezas de serie' }
  return { cabezas: (data || []).map(c => ({ jugadorId: c.jugador_id, numero: c.numero })) }
}

export async function crearTorneo(params: {
  nombre: string
  fecha: string
  cuota: number
}) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }
  if (!perfil.club_id) return { error: 'Perfil sin club asignado' }

  const nombre = params.nombre.trim()
  const cuota = Number(params.cuota)
  if (!nombre) return { error: 'Ingresa el nombre del torneo' }
  const fechaObjeto = new Date(`${params.fecha}T00:00:00Z`)
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(params.fecha) &&
    !Number.isNaN(fechaObjeto.getTime()) && fechaObjeto.toISOString().slice(0, 10) === params.fecha
  if (!fechaValida) return { error: 'Ingresa una fecha válida' }
  if (!Number.isSafeInteger(cuota) || cuota < 0) return { error: 'La cuota debe ser un monto igual o mayor a $0' }

  const { data, error } = await supabase.from('torneos').insert({
    club_id: perfil.club_id,
    nombre,
    formato: 'grupos',
    estado: 'en_curso',
    fase: 'inscripcion',
    fecha_inicio: params.fecha,
    cuota_inscripcion: cuota,
    precio_entrada: cuota,
    inscripcion_abierta: true,
  }).select('id').single()

  if (error || !data) return { error: error?.message || 'No se pudo crear el torneo' }
  return { success: true, torneoId: data.id }
}

async function calcularClasificadosDesdeBD(
  supabase: AdminSupabase,
  torneoId: string,
): Promise<{ clasificados: ClasificadoGrupo[] } | { error: string }> {
  const { data: grupos } = await supabase
    .from('torneo_grupos')
    .select('id, nombre, desempate_primero_id, desempate_segundo_id')
    .eq('torneo_id', torneoId)
    .neq('nombre', 'MESA')
    .order('orden', { nullsFirst: false })
    .order('nombre')

  if (!grupos?.length) return { clasificados: [] }

  const grupoIds = grupos.map(g => g.id)
  const [{ data: miembros }, { data: partidos }] = await Promise.all([
    supabase
      .from('grupo_jugadores')
      .select('grupo_id, jugador_id, orden, jugadores(id,nombre)')
      .in('grupo_id', grupoIds),
    supabase
      .from('torneo_partidos')
      .select('grupo_id, jugador_a, jugador_b, ganador')
      .eq('torneo_id', torneoId)
      .eq('fase', 'grupos')
      .in('grupo_id', grupoIds),
  ])

  const clasificados: ClasificadoGrupo[] = []
  for (const grupo of grupos) {
    const jugadoresGrupo: JugadorTorneo[] = ordenarMiembros((miembros || []).filter(m => m.grupo_id === grupo.id))
      .map(m => {
        const j = Array.isArray(m.jugadores) ? m.jugadores[0] : m.jugadores
        return j ? { id: j.id, nombre: j.nombre ?? '' } : null
      })
      .filter((j): j is JugadorTorneo => !!j)

    const partidosGrupo = (partidos || []).filter(p => p.grupo_id === grupo.id)
    if (
      jugadoresGrupo.length < 2 ||
      partidosGrupo.length === 0 ||
      partidosGrupo.some(p => !p.jugador_a || !p.jugador_b || !p.ganador)
    ) continue

    const { stats, hayTripleEmpate } = calcularStatsGrupo(
      jugadoresGrupo,
      partidosGrupo.map(p => ({
        jugadorA: p.jugador_a!,
        jugadorB: p.jugador_b!,
        ganador: p.ganador,
      })),
    )
    if (hayTripleEmpate) {
      const idsGrupo = new Set(jugadoresGrupo.map(j => j.id))
      const puntosCorte = stats[1]?.pts
      const empatadosCorte = new Set(stats.filter(s => s.pts === puntosCorte).map(s => s.jugadorId))
      const encimaCorte = stats.filter(s => puntosCorte != null && s.pts > puntosCorte)
      const ordenManualValido = encimaCorte.length === 1
        ? grupo.desempate_primero_id === encimaCorte[0].jugadorId && !!grupo.desempate_segundo_id && empatadosCorte.has(grupo.desempate_segundo_id)
        : !!grupo.desempate_primero_id && !!grupo.desempate_segundo_id && empatadosCorte.has(grupo.desempate_primero_id) && empatadosCorte.has(grupo.desempate_segundo_id)
      if (
        !grupo.desempate_primero_id ||
        !grupo.desempate_segundo_id ||
        grupo.desempate_primero_id === grupo.desempate_segundo_id ||
        !idsGrupo.has(grupo.desempate_primero_id) ||
        !idsGrupo.has(grupo.desempate_segundo_id) ||
        !ordenManualValido
      ) {
        // El grupo aún no está listo. No bloquea que otras ramas completas
        // empiecen su playoff; simplemente conserva sus cupos pendientes.
        continue
      }
      clasificados.push({
        grupoId: grupo.id,
        primeroId: grupo.desempate_primero_id,
        segundoId: grupo.desempate_segundo_id,
      })
      continue
    }
    if (stats[0]?.jugadorId && stats[1]?.jugadorId) {
      clasificados.push({ grupoId: grupo.id, primeroId: stats[0].jugadorId, segundoId: stats[1].jugadorId })
    }
  }

  return { clasificados }
}

async function propagarGanadorPlayoff(
  supabase: AdminSupabase,
  partido: { torneo_id: string | null; fase: string | null; orden: number | null },
  ganadorId: string,
) {
  if (!partido.torneo_id || !partido.fase || partido.fase === 'grupos') return
  const faseSiguiente = siguienteFase(partido.fase as FaseOrden)
  if (!faseSiguiente) return

  const ordenSiguiente = Math.floor((partido.orden ?? 0) / 2)
  const slotGanador = (partido.orden ?? 0) % 2 === 0 ? 'jugador_a' : 'jugador_b'
  const { data: existentes, error: buscarError } = await supabase
    .from('torneo_partidos')
    .select('id, jugador_a, jugador_b, ganador')
    .eq('torneo_id', partido.torneo_id)
    .eq('fase', faseSiguiente)
    .eq('orden', ordenSiguiente)
    .order('creado_en', { ascending: true })
    .limit(1)
  if (buscarError) return 'No se pudo consultar la llave siguiente'

  const existente = existentes?.[0]
  if (existente) {
    if (!existente.ganador && existente[slotGanador] !== ganadorId) {
      const updateSlot = slotGanador === 'jugador_a'
        ? { jugador_a: ganadorId }
        : { jugador_b: ganadorId }
      const { error } = await supabase.from('torneo_partidos').update(updateSlot).eq('id', existente.id)
      if (error) return 'No se pudo completar la llave siguiente'
    }
  } else {
    const { error: insertError } = await supabase.from('torneo_partidos').insert({
      torneo_id: partido.torneo_id,
      fase: faseSiguiente,
      orden: ordenSiguiente,
      jugador_a: slotGanador === 'jugador_a' ? ganadorId : null,
      jugador_b: slotGanador === 'jugador_b' ? ganadorId : null,
      ganador: null,
    })
    // Dos llaves pueden terminar casi al mismo tiempo e intentar crear el mismo
    // partido siguiente. El índice único deja una sola fila; el segundo proceso
    // recupera esa fila y completa su slot.
    if (insertError?.code === '23505') {
      const { data: concurrente, error: concurrenteError } = await supabase
        .from('torneo_partidos')
        .select('id, ganador')
        .eq('torneo_id', partido.torneo_id)
        .eq('fase', faseSiguiente)
        .eq('orden', ordenSiguiente)
        .maybeSingle()
      if (concurrenteError || !concurrente) return 'No se pudo recuperar la llave siguiente'
      if (concurrente && !concurrente.ganador) {
        const updateSlot = slotGanador === 'jugador_a'
          ? { jugador_a: ganadorId }
          : { jugador_b: ganadorId }
        const { error } = await supabase.from('torneo_partidos').update(updateSlot).eq('id', concurrente.id)
        if (error) return 'No se pudo completar la llave siguiente'
      }
    } else if (insertError) {
      return 'No se pudo crear la llave siguiente'
    }
  }
  return null
}

async function avanzarFaseSiEstaCompleta(
  supabase: AdminSupabase,
  partido: { torneo_id: string | null; fase: string | null },
) {
  if (!partido.torneo_id || !partido.fase || partido.fase === 'grupos') return null
  const faseSiguiente = siguienteFase(partido.fase as FaseOrden)
  if (!faseSiguiente) return null

  const { data: ronda } = await supabase
    .from('torneo_partidos')
    .select('ganador')
    .eq('torneo_id', partido.torneo_id)
    .eq('fase', partido.fase)
  if (!ronda?.length || ronda.some(p => !p.ganador)) return

  await supabase
    .from('torneos')
    .update({ fase: faseSiguiente })
    .eq('id', partido.torneo_id)
    .eq('fase', partido.fase)
}

export async function corregirResultadoGrupos(params: { partidoId: string; nuevoGanadorId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { partidoId, nuevoGanadorId } = params

  const { data: partido } = await supabase.from('torneo_partidos').select('*').eq('id', partidoId).single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (!partido.ganador) return { error: 'El partido no tiene resultado aún' }
  if (partido.fase !== 'grupos') return { error: 'Solo se pueden corregir partidos de grupos' }
  if (nuevoGanadorId !== partido.jugador_a && nuevoGanadorId !== partido.jugador_b) return { error: 'El ganador debe pertenecer al partido' }
  if (partido.ganador === nuevoGanadorId) return { success: true }

  const anteriorGanadorId: string = partido.ganador
  const anteriorPerdedorId: string | null = anteriorGanadorId === partido.jugador_a ? partido.jugador_b : partido.jugador_a
  const torneoIdPartido: string = partido.torneo_id ?? partidoId

  const { data: llavesExistentes } = await supabase
    .from('torneo_partidos')
    .select('id,fase,orden,ganador,jugador_b,slot_a_grupo_id,slot_b_grupo_id')
    .eq('torneo_id', torneoIdPartido)
    .neq('fase', 'grupos')

  if (llavesExistentes?.length && partido.grupo_id) {
    const afectadas = llavesExistentes.filter(p =>
      p.slot_a_grupo_id === partido.grupo_id || p.slot_b_grupo_id === partido.grupo_id,
    )
    const esLegacy = !llavesExistentes.some(p => p.slot_a_grupo_id || p.slot_b_grupo_id)
    if ((esLegacy && llavesExistentes.some(llaveFueJugada)) || afectadas.some(llaveFueJugada)) {
      return { error: 'La rama de este grupo ya fue jugada. Retrocede primero sus resultados de playoff.' }
    }
    for (const llave of afectadas.filter(p => p.ganador && !p.jugador_b)) {
      const faseSiguiente = siguienteFase(llave.fase as FaseOrden)
      if (!faseSiguiente || llave.orden == null) continue
      const { data: siguiente } = await supabase.from('torneo_partidos')
        .select('ganador').eq('torneo_id', torneoIdPartido).eq('fase', faseSiguiente)
        .eq('orden', Math.floor(llave.orden / 2)).maybeSingle()
      if (siguiente?.ganador) return { error: 'La rama con BYE ya fue jugada. Retrocede esa rama primero.' }
    }
  }

  // Revertir stats en grupo_jugadores
  if (partido.grupo_id) {
    const { data: gjG } = await supabase.from('grupo_jugadores').select('*').eq('grupo_id', partido.grupo_id).eq('jugador_id', anteriorGanadorId).maybeSingle()
    if (gjG) await supabase.from('grupo_jugadores').update({ partidos_ganados: Math.max(0, (gjG.partidos_ganados || 0) - 1), partidos_jugados: Math.max(0, (gjG.partidos_jugados || 0) - 1) }).eq('id', gjG.id)
    if (anteriorPerdedorId) {
      const { data: gjP } = await supabase.from('grupo_jugadores').select('*').eq('grupo_id', partido.grupo_id).eq('jugador_id', anteriorPerdedorId).maybeSingle()
      if (gjP) await supabase.from('grupo_jugadores').update({ partidos_jugados: Math.max(0, (gjP.partidos_jugados || 0) - 1) }).eq('id', gjP.id)
    }
  }

  // Limpiar ganador actual antes de reusar marcarGanadorPartido
  await supabase.from('torneo_partidos').update({ ganador: null }).eq('id', partidoId)
  if (partido.grupo_id) {
    await supabase.from('torneo_grupos').update({
      desempate_primero_id: null,
      desempate_segundo_id: null,
    }).eq('id', partido.grupo_id)
  }

  // Aplicar nuevo resultado (reutiliza la lógica existente)
  const marcado = await marcarGanadorPartido({ partidoId, ganadorId: nuevoGanadorId })
  if (marcado.error) return marcado

  if (llavesExistentes?.length) {
    const sync = await sincronizarLlaves({ torneoId: torneoIdPartido })
    if ('error' in sync && sync.error) return sync
  }

  return marcado
}

export async function marcarGanadorPartido(params: { partidoId: string; ganadorId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { partidoId, ganadorId } = params

  const { data: partido } = await supabase.from('torneo_partidos').select('*').eq('id', partidoId).single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (partido.ganador) return { error: 'El partido ya tiene ganador' }
  if (!partido.jugador_a || !partido.jugador_b) return { error: 'Los BYE avanzan automáticamente y no se marcan manualmente' }
  if (ganadorId !== partido.jugador_a && ganadorId !== partido.jugador_b) return { error: 'El ganador debe ser uno de los jugadores del partido' }

  if (partido.fase !== 'grupos') {
    const { data: actualizado } = await supabase
      .from('torneo_partidos')
      .update({ ganador: ganadorId })
      .eq('id', partidoId)
      .is('ganador', null)
      .select('id')
    if (!actualizado?.length) return { error: 'El partido ya tiene ganador' }
    await propagarGanadorPlayoff(supabase, partido, ganadorId)
    await avanzarFaseSiEstaCompleta(supabase, partido)
    return { success: true }
  }

  if (partido.grupo_id) {
    const { data: grupo } = await supabase.from('torneo_grupos')
      .select('en_preparacion').eq('id', partido.grupo_id).single()
    if (grupo?.en_preparacion) return { error: 'Finaliza el grupo manual antes de registrar resultados' }
  }

  const perdedorId = partido.jugador_a === ganadorId ? partido.jugador_b : partido.jugador_a

  // Guard atómico: solo escribe si el partido sigue sin ganador.
  const { data: actualizado } = await supabase
    .from('torneo_partidos')
    .update({ ganador: ganadorId })
    .eq('id', partidoId)
    .is('ganador', null)
    .select('id')
  if (!actualizado?.length) return { error: 'El partido ya tiene ganador' }

  if (partido.grupo_id) {
    const { data: gjG } = await supabase.from('grupo_jugadores').select('*').eq('grupo_id', partido.grupo_id).eq('jugador_id', ganadorId).maybeSingle()
    if (gjG) {
      await supabase.from('grupo_jugadores').update({
        partidos_ganados: (gjG.partidos_ganados || 0) + 1,
        partidos_jugados: (gjG.partidos_jugados || 0) + 1,
      }).eq('id', gjG.id)
    }
    if (perdedorId) {
      const { data: gjP } = await supabase.from('grupo_jugadores').select('*').eq('grupo_id', partido.grupo_id).eq('jugador_id', perdedorId).maybeSingle()
      if (gjP) {
        await supabase.from('grupo_jugadores').update({
          partidos_jugados: (gjP.partidos_jugados || 0) + 1,
        }).eq('id', gjP.id)
      }
    }
  }

  await propagarGanadorPlayoff(supabase, partido, ganadorId)
  await avanzarFaseSiEstaCompleta(supabase, partido)

  return { success: true }
}

export async function configurarCabezasSerie(params: {
  torneoId: string
  jugadorIds: string[]
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const jugadorIds = params.jugadorIds.filter(Boolean)
  if (new Set(jugadorIds).size !== jugadorIds.length) return { error: 'Un jugador no puede ocupar dos posiciones de cabeza' }
  const { error } = await supabase.rpc('configurar_cabezas_serie', {
    p_torneo_id: params.torneoId,
    p_jugador_ids: jugadorIds,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function guardarDesempateGrupo(params: {
  torneoId: string
  grupoId: string
  primeroId: string | null
  segundoId: string | null
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, grupoId, primeroId, segundoId } = params
  if ((primeroId && !segundoId) || (!primeroId && segundoId)) return { error: 'Debes definir 1° y 2° juntos' }
  if (primeroId && primeroId === segundoId) return { error: 'El 1° y 2° deben ser jugadores distintos' }

  const { data: grupo } = await supabase.from('torneo_grupos')
    .select('id').eq('id', grupoId).eq('torneo_id', torneoId).single()
  if (!grupo) return { error: 'Grupo no encontrado' }

  const { count: llavesCreadas } = await supabase.from('torneo_partidos')
    .select('id', { count: 'exact', head: true }).eq('torneo_id', torneoId).neq('fase', 'grupos')
  if ((llavesCreadas ?? 0) > 0) return { error: 'Vuelve a grupos antes de cambiar un desempate' }

  if (primeroId && segundoId) {
    const [{ data: miembros }, { data: partidosGrupo }] = await Promise.all([
      supabase.from('grupo_jugadores').select('jugador_id,orden,jugadores(id,nombre)').eq('grupo_id', grupoId),
      supabase.from('torneo_partidos').select('jugador_a,jugador_b,ganador').eq('torneo_id', torneoId).eq('grupo_id', grupoId).eq('fase', 'grupos'),
    ])
    if (!partidosGrupo?.length || partidosGrupo.some(p => !p.jugador_a || !p.jugador_b || !p.ganador)) {
      return { error: 'Completa todos los partidos del grupo antes de resolver el empate' }
    }
    const jugadoresGrupo: JugadorTorneo[] = ordenarMiembros(miembros || []).map(m => {
      const jugador = Array.isArray(m.jugadores) ? m.jugadores[0] : m.jugadores
      return jugador ? { id: jugador.id, nombre: jugador.nombre ?? '' } : null
    }).filter((j): j is JugadorTorneo => !!j)
    const { stats, hayTripleEmpate } = calcularStatsGrupo(jugadoresGrupo, partidosGrupo.map(p => ({
      jugadorA: p.jugador_a!, jugadorB: p.jugador_b!, ganador: p.ganador,
    })))
    if (!hayTripleEmpate) return { error: 'Este grupo no requiere desempate manual' }

    const puntosCorte = stats[1]?.pts
    const empatadosCorte = new Set(stats.filter(s => s.pts === puntosCorte).map(s => s.jugadorId))
    const encimaCorte = stats.filter(s => puntosCorte != null && s.pts > puntosCorte)
    const valido = encimaCorte.length === 1
      ? primeroId === encimaCorte[0].jugadorId && empatadosCorte.has(segundoId)
      : empatadosCorte.has(primeroId) && empatadosCorte.has(segundoId)
    if (!valido) return { error: 'El orden elegido no corresponde a los jugadores empatados por la clasificación' }
  }

  const { error } = await supabase.from('torneo_grupos').update({
    desempate_primero_id: primeroId,
    desempate_segundo_id: segundoId,
  }).eq('id', grupoId)
  if (error) return { error: 'No se pudo guardar el desempate' }
  return { success: true }
}

export async function crearGrupoManual(params: { torneoId: string }) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }
  const { data: torneo } = await supabase.from('torneos')
    .select('id,fase,club_id').eq('id', params.torneoId).single()
  if (!torneo || torneo.club_id !== perfil.club_id) return { error: 'Torneo no encontrado' }
  if (torneo.fase !== 'grupos') return { error: 'Solo puedes crear grupos manuales durante la fase de grupos' }

  const { count: bracket } = await supabase.from('torneo_partidos')
    .select('id', { count: 'exact', head: true }).eq('torneo_id', params.torneoId).neq('fase', 'grupos')
  if ((bracket ?? 0) > 0) return { error: 'No se pueden crear grupos después de generar el bracket' }

  const { data: grupos } = await supabase.from('torneo_grupos')
    .select('id,nombre,orden,en_preparacion').eq('torneo_id', params.torneoId).neq('nombre', 'MESA')
  if ((grupos || []).some(g => g.en_preparacion)) return { error: 'Ya existe un grupo manual en preparación' }
  if ((grupos?.length ?? 0) >= CONFIG.TORNEO_MAX_GRUPOS) return { error: `El máximo es ${CONFIG.TORNEO_MAX_GRUPOS} grupos` }

  const orden = (grupos || []).reduce((max, g) => Math.max(max, g.orden ?? -1), -1) + 1
  const { data, error } = await supabase.from('torneo_grupos').insert({
    torneo_id: params.torneoId,
    nombre: nombreGrupo(orden),
    orden,
    en_preparacion: true,
  }).select('id,nombre').single()
  if (error || !data) return { error: 'No se pudo crear el grupo manual' }
  return { success: true, grupoId: data.id, nombre: data.nombre }
}

export async function finalizarGrupoManual(params: { torneoId: string; grupoId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }
  const { data: grupo } = await supabase.from('torneo_grupos')
    .select('id,en_preparacion').eq('id', params.grupoId).eq('torneo_id', params.torneoId).single()
  if (!grupo?.en_preparacion) return { error: 'El grupo no está en preparación' }
  const { data: miembros } = await supabase.from('grupo_jugadores')
    .select('jugador_id,orden').eq('grupo_id', params.grupoId)
  const ids = ordenarMiembros(miembros || []).map(m => m.jugador_id).filter((id): id is string => !!id)
  if (ids.length < 3 || ids.length > 4) return { error: 'El grupo manual debe tener 3 o 4 jugadores antes de finalizarlo' }
  const { error: limpiarError } = await supabase.from('torneo_partidos')
    .delete().eq('torneo_id', params.torneoId).eq('grupo_id', params.grupoId)
  if (limpiarError) return { error: 'No se pudieron preparar los partidos del grupo manual' }
  const { data: existentes } = await supabase.from('torneo_partidos').select('orden').eq('torneo_id', params.torneoId)
  let orden = (existentes || []).reduce((max, p) => Math.max(max, p.orden ?? -1), -1) + 1
  const partidos = generarRoundRobin(ids).map(([jugador_a, jugador_b]) => ({
    torneo_id: params.torneoId,
    grupo_id: params.grupoId,
    fase: 'grupos',
    jugador_a,
    jugador_b,
    orden: orden++,
  }))
  if (partidos.length) {
    const { error: partidosError } = await supabase.from('torneo_partidos').insert(partidos)
    if (partidosError) return { error: 'No se pudieron crear los partidos del grupo manual' }
  }
  const { error } = await supabase.from('torneo_grupos').update({ en_preparacion: false }).eq('id', params.grupoId)
  if (error) {
    await supabase.from('torneo_partidos').delete().eq('torneo_id', params.torneoId).eq('grupo_id', params.grupoId)
    return { error: 'No se pudo finalizar el grupo manual; puedes volver a intentarlo' }
  }
  return { success: true }
}

export async function eliminarGrupoManualVacio(params: { torneoId: string; grupoId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }
  const { data: grupo } = await supabase.from('torneo_grupos')
    .select('id,en_preparacion').eq('id', params.grupoId).eq('torneo_id', params.torneoId).single()
  if (!grupo?.en_preparacion) return { error: 'Solo se puede cancelar un grupo manual en preparación' }
  const { count } = await supabase.from('grupo_jugadores')
    .select('id', { count: 'exact', head: true }).eq('grupo_id', params.grupoId)
  if ((count ?? 0) > 0) return { error: 'Devuelve primero sus jugadores a otros grupos' }
  const { error } = await supabase.from('torneo_grupos').delete().eq('id', params.grupoId)
  if (error) return { error: 'No se pudo eliminar el grupo manual' }
  return { success: true }
}

export async function moverJugadorEntreGrupos(params: {
  torneoId: string
  jugadorId: string
  grupoOrigenId: string
  grupoDestinoId: string
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, jugadorId, grupoOrigenId, grupoDestinoId } = params
  if (grupoOrigenId === grupoDestinoId) return { success: true }

  const { data: gruposMovimiento } = await supabase.from('torneo_grupos')
    .select('id,en_preparacion').eq('torneo_id', torneoId).in('id', [grupoOrigenId, grupoDestinoId])
  if (!gruposMovimiento || gruposMovimiento.length !== 2) return { error: 'Los grupos no pertenecen a este torneo' }
  const origenGrupo = gruposMovimiento.find(g => g.id === grupoOrigenId)
  const { data: miembroOrigen } = await supabase.from('grupo_jugadores')
    .select('id').eq('grupo_id', grupoOrigenId).eq('jugador_id', jugadorId).maybeSingle()
  if (!miembroOrigen) return { error: 'El jugador no pertenece al grupo de origen' }

  const { data: bracket } = await supabase.from('torneo_partidos')
    .select('id').eq('torneo_id', torneoId).neq('fase', 'grupos').limit(1)
  if (bracket?.length) return { error: 'No se pueden cambiar grupos después de crear el bracket' }

  const { data: partidosAfectados } = await supabase
    .from('torneo_partidos')
    .select('id, ganador')
    .eq('torneo_id', torneoId)
    .in('grupo_id', [grupoOrigenId, grupoDestinoId])

  if (partidosAfectados?.some(p => p.ganador)) {
    return { error: 'No se puede mover jugadores: alguno de los dos grupos ya tiene partidos jugados' }
  }

  const { data: miembrosAntes, error: miembrosAntesError } = await supabase
    .from('grupo_jugadores')
    .select('id,jugador_id,grupo_id,orden')
    .in('grupo_id', [grupoOrigenId, grupoDestinoId])
  if (miembrosAntesError) return { error: 'No se pudieron leer los integrantes de los grupos' }
  const destinoActual = (miembrosAntes || []).filter(m => m.grupo_id === grupoDestinoId)
  if ((destinoActual?.length ?? 0) >= 4) return { error: 'El grupo destino ya tiene 4 jugadores' }
  const origenCantidad = (miembrosAntes || []).filter(m => m.grupo_id === grupoOrigenId).length
  if (!origenGrupo?.en_preparacion && origenCantidad <= 3) {
    return { error: 'El grupo de origen debe conservar al menos 3 jugadores' }
  }
  const lecturaCabezas = await leerCabezasSerie(supabase, torneoId)
  if (lecturaCabezas.error) return { error: lecturaCabezas.error }
  const cabezas = lecturaCabezas.cabezas
  const cabezasIds = new Set(cabezas.map(c => c.jugadorId))
  if (cabezasIds.has(jugadorId) && (destinoActual || []).some(j => j.jugador_id && cabezasIds.has(j.jugador_id))) {
    return { error: 'No pueden quedar dos cabezas de serie en el mismo grupo' }
  }
  const ordenDestino = destinoActual?.length ?? 0

  const restaurarMovimiento = async () => {
    await Promise.all((miembrosAntes || []).map(m => supabase.from('grupo_jugadores')
      .update({ grupo_id: m.grupo_id, orden: m.orden }).eq('id', m.id)))
    await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId).in('grupo_id', [grupoOrigenId, grupoDestinoId])
    const restaurados: { torneo_id: string; grupo_id: string; fase: string; jugador_a: string; jugador_b: string; orden: number }[] = []
    for (const gid of [grupoOrigenId, grupoDestinoId]) {
      if (gruposMovimiento.find(g => g.id === gid)?.en_preparacion) continue
      const ids = ordenarMiembros((miembrosAntes || []).filter(m => m.grupo_id === gid))
        .map(m => m.jugador_id).filter((id): id is string => !!id)
      for (const [a, b] of generarRoundRobin(ids)) {
        restaurados.push({ torneo_id: torneoId, grupo_id: gid, fase: 'grupos', jugador_a: a, jugador_b: b, orden: restaurados.length })
      }
    }
    if (restaurados.length) await supabase.from('torneo_partidos').insert(restaurados)
  }

  const { error: moveErr } = await supabase.from('grupo_jugadores')
    .update({ grupo_id: grupoDestinoId, orden: ordenDestino })
    .eq('jugador_id', jugadorId).eq('grupo_id', grupoOrigenId)
  if (moveErr) return { error: 'No se pudo mover al jugador' }

  const { error: borrarPartidosError } = await supabase.from('torneo_partidos')
    .delete().eq('torneo_id', torneoId).in('grupo_id', [grupoOrigenId, grupoDestinoId])
  if (borrarPartidosError) {
    await restaurarMovimiento()
    return { error: 'No se pudieron actualizar los partidos de los grupos' }
  }

  const { data: miembros, error: miembrosError } = await supabase.from('grupo_jugadores')
    .select('id, jugador_id, grupo_id, orden').in('grupo_id', [grupoOrigenId, grupoDestinoId])
  if (miembrosError) {
    await restaurarMovimiento()
    return { error: 'No se pudieron regenerar los grupos' }
  }

  const inserts: { torneo_id: string; grupo_id: string; fase: string; jugador_a: string; jugador_b: string; orden: number }[] = []
  for (const gid of [grupoOrigenId, grupoDestinoId]) {
    const miembrosGrupo = ordenarMiembros((miembros || []).filter(m => m.grupo_id === gid))
    const reordenados = await Promise.all(miembrosGrupo.map((m, orden) => supabase.from('grupo_jugadores').update({ orden }).eq('id', m.id)))
    if (reordenados.some(r => r.error)) {
      await restaurarMovimiento()
      return { error: 'No se pudo ordenar nuevamente el grupo' }
    }
    const idsGrupo = miembrosGrupo.map(m => m.jugador_id).filter((id): id is string => !!id)
    const grupoMovimiento = gruposMovimiento.find(g => g.id === gid)
    const parejas = grupoMovimiento?.en_preparacion ? [] : generarRoundRobin(idsGrupo)
    for (const [a, b] of parejas) {
      inserts.push({ torneo_id: torneoId, grupo_id: gid, fase: 'grupos', jugador_a: a, jugador_b: b, orden: inserts.length })
    }
  }
  if (inserts.length) {
    const { error: insertarPartidosError } = await supabase.from('torneo_partidos').insert(inserts)
    if (insertarPartidosError) {
      await restaurarMovimiento()
      return { error: 'No se pudieron regenerar los partidos; el movimiento fue revertido' }
    }
  }

  const origenQuedoVacio = !(miembros || []).some(m => m.grupo_id === grupoOrigenId)
  if (origenQuedoVacio) {
    const { data: grupoOrigen } = await supabase
      .from('torneo_grupos')
      .select('nombre')
      .eq('id', grupoOrigenId)
      .maybeSingle()
    if (grupoOrigen?.nombre !== 'MESA') {
      await supabase.from('torneo_partidos').delete().eq('grupo_id', grupoOrigenId)
      await supabase.from('torneo_grupos').delete().eq('id', grupoOrigenId)
    }
  }

  return { success: true }
}

export async function reordenarJugadorEnGrupo(params: {
  torneoId: string
  grupoId: string
  jugadorId: string
  direccion: 'arriba' | 'abajo'
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, grupoId, jugadorId, direccion } = params

  const { data: bracket } = await supabase.from('torneo_partidos')
    .select('id').eq('torneo_id', torneoId).neq('fase', 'grupos').limit(1)
  if (bracket?.length) return { error: 'No se puede reordenar grupos después de crear el bracket' }

  const { data: partidosGrupo } = await supabase
    .from('torneo_partidos')
    .select('id, ganador')
    .eq('torneo_id', torneoId)
    .eq('grupo_id', grupoId)

  if (partidosGrupo?.some(p => !!p.ganador)) {
    return { error: 'No se puede reordenar este grupo porque ya tiene partidos jugados.' }
  }

  const { data: miembros, error: miembrosErr } = await supabase
    .from('grupo_jugadores')
    .select('id, jugador_id, orden')
    .eq('grupo_id', grupoId)
  if (miembrosErr) {
    return { error: 'No se pudo leer el orden del grupo. Falta aplicar la migracion de base de datos para ordenar jugadores.' }
  }

  const ordenados = ordenarMiembros(miembros || [])
  const idx = ordenados.findIndex(m => m.jugador_id === jugadorId)
  const swapIdx = direccion === 'arriba' ? idx - 1 : idx + 1
  if (idx < 0 || swapIdx < 0 || swapIdx >= ordenados.length) return { success: true }

  const actual = ordenados[idx]
  ordenados[idx] = ordenados[swapIdx]
  ordenados[swapIdx] = actual

  const updates = await Promise.all(ordenados.map((m, orden) => supabase.from('grupo_jugadores').update({ orden }).eq('id', m.id)))
  if (updates.some(r => r.error)) return { error: 'No se pudo guardar el nuevo orden del grupo.' }

  const { error: deleteErr } = await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId).eq('grupo_id', grupoId)
  if (deleteErr) return { error: 'No se pudieron regenerar los partidos del grupo.' }
  const idsGrupo = ordenados.map(m => m.jugador_id).filter((id): id is string => !!id)
  const partidos = generarRoundRobin(idsGrupo).map(([a, b], orden) => ({
    torneo_id: torneoId,
    grupo_id: grupoId,
    fase: 'grupos',
    jugador_a: a,
    jugador_b: b,
    orden,
  }))
  if (partidos.length) {
    const { error: insertErr } = await supabase.from('torneo_partidos').insert(partidos)
    if (insertErr) return { error: 'No se pudieron crear los nuevos partidos del grupo.' }
  }

  return { success: true }
}

export async function cerrarInscripcionYGenerarGrupos(params: {
  torneoId: string
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId } = params

  const { data: gruposPrev } = await supabase.from('torneo_grupos').select('id').eq('torneo_id', torneoId)
  const grupoIds = (gruposPrev || []).map(g => g.id)

  const { data: inscritos } = await supabase
    .from('grupo_jugadores')
    .select('jugador_id, jugadores(id,nombre)')
    .in('grupo_id', grupoIds.length ? grupoIds : ['00000000-0000-0000-0000-000000000000'])

  const jugadores: JugadorTorneo[] = (inscritos || [])
    .map(i => {
      const j = Array.isArray(i.jugadores) ? i.jugadores[0] : i.jugadores
      return j ? { id: j.id, nombre: j.nombre ?? '' } : null
    })
    .filter((x): x is JugadorTorneo => x !== null)

  if (jugadores.length < CONFIG.TORNEO_MIN_JUGADORES) {
    return { error: `Se requieren al menos ${CONFIG.TORNEO_MIN_JUGADORES} jugadores` }
  }
  const numGrupos = calcularNumGrupos(jugadores.length)
  if (numGrupos > CONFIG.TORNEO_MAX_GRUPOS) {
    return { error: `El máximo soportado es ${CONFIG.TORNEO_MAX_GRUPOS} grupos (${CONFIG.TORNEO_MAX_CLASIFICADOS} clasificados)` }
  }
  const lecturaCabezas = await leerCabezasSerie(supabase, torneoId)
  if (lecturaCabezas.error) return { error: lecturaCabezas.error }
  const cabezas = lecturaCabezas.cabezas
  if (cabezas.length > numGrupos) {
    return { error: `Hay ${cabezas.length} cabezas para ${numGrupos} grupos. Debe existir como máximo una cabeza por grupo.` }
  }

  // Limpiar partidos viejos del torneo (evita FK orphans y duplicación de grupos)
  await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId)
  if (grupoIds.length) {
    await supabase.from('grupo_jugadores').delete().in('grupo_id', grupoIds)
    await supabase.from('torneo_grupos').delete().in('id', grupoIds)
  }

  const { data: nuevosGrupos } = await supabase
    .from('torneo_grupos')
    .insert(Array.from({ length: numGrupos }, (_, i) => ({ torneo_id: torneoId, nombre: nombreGrupo(i), orden: i })))
    .select('id, nombre')
  if (!nuevosGrupos?.length) return { error: 'No se pudieron crear los grupos' }

  const asignaciones = seedingSerpenteo(jugadores, numGrupos, cabezas.map(c => c.jugadorId))
  const ordenPorGrupo = new Map<number, number>()
  const inserts = asignaciones.map(a => {
    const orden = ordenPorGrupo.get(a.grupoIndex) ?? 0
    ordenPorGrupo.set(a.grupoIndex, orden + 1)
    return {
    grupo_id: nuevosGrupos[a.grupoIndex].id,
    jugador_id: a.jugadorId,
    orden,
  }})
  await supabase.from('grupo_jugadores').insert(inserts)

  const partidos: Array<{ torneo_id: string; grupo_id: string; fase: string; jugador_a: string; jugador_b: string; orden: number }> = []
  for (const g of nuevosGrupos) {
    const jugadoresGrupo = inserts.filter(a => a.grupo_id === g.id).sort((a, b) => a.orden - b.orden).map(a => a.jugador_id)
    const parejas = generarRoundRobin(jugadoresGrupo)
    for (const [a, b] of parejas) {
      partidos.push({ torneo_id: torneoId, grupo_id: g.id, fase: 'grupos', jugador_a: a, jugador_b: b, orden: partidos.length })
    }
  }
  if (partidos.length) await supabase.from('torneo_partidos').insert(partidos)

  await supabase.from('torneos').update({ fase: 'grupos', inscripcion_abierta: false }).eq('id', torneoId)

  return { success: true, numGrupos }
}

// Construye el cuadro desde la mitad de los grupos cerrados. La clasificación
// se recalcula en el servidor y los cupos restantes se agregan al árbol fijo.
export async function sincronizarLlaves(params: {
  torneoId: string
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId } = params

  const calculo = await calcularClasificadosDesdeBD(supabase, torneoId)
  if ('error' in calculo) return calculo
  const clasificados = calculo.clasificados

  if (clasificados.some(c => c.primeroId === c.segundoId)) {
    return { error: 'Hay un grupo con el mismo jugador como 1° y 2°. Revisa la tabla del grupo antes de armar llaves.' }
  }
  const clasificadosIdsUnicos = new Set<string>()
  for (const c of clasificados) {
    for (const id of [c.primeroId, c.segundoId]) {
      if (clasificadosIdsUnicos.has(id)) return { error: 'Hay un jugador clasificado en más de un cupo. Revisa los grupos antes de armar llaves.' }
      clasificadosIdsUnicos.add(id)
    }
  }

  const { data: torneo } = await supabase.from('torneos').select('fase').eq('id', torneoId).single()
  if (!torneo) return { error: 'Torneo no encontrado' }
  const lecturaCabezas = await leerCabezasSerie(supabase, torneoId)
  if (lecturaCabezas.error) return { error: lecturaCabezas.error }
  const cabezas = lecturaCabezas.cabezas

  const { data: gruposRaw } = await supabase
    .from('torneo_grupos').select('id, nombre, orden, en_preparacion').eq('torneo_id', torneoId).neq('nombre', 'MESA').order('orden', { nullsFirst: false }).order('nombre')
  const grupos = gruposRaw || []
  const numGrupos = grupos.length
  if (numGrupos < 2) return { error: 'Se requieren al menos 2 grupos' }
  if (numGrupos > CONFIG.TORNEO_MAX_GRUPOS) {
    return { error: `El bracket admite hasta ${CONFIG.TORNEO_MAX_GRUPOS} grupos` }
  }
  if (grupos.some(g => g.en_preparacion)) {
    return { error: 'Finaliza o elimina el grupo manual en preparación antes de crear el bracket' }
  }

  const todosCompletos = clasificados.length === numGrupos
  const idxByGrupoId = new Map(grupos.map((g, i) => [g.id, i]))
  const { data: miembros, error: miembrosError } = await supabase
    .from('grupo_jugadores')
    .select('jugador_id,grupo_id')
    .in('grupo_id', grupos.map(g => g.id))
  if (miembrosError) return { error: 'No se pudo validar la distribución de cabezas de serie' }

  if (cabezas.length > numGrupos) {
    return { error: `Hay ${cabezas.length} cabezas para ${numGrupos} grupos. Debe existir como máximo una cabeza por grupo.` }
  }
  const numerosCabeza = cabezas.map(c => c.numero)
  if (new Set(numerosCabeza).size !== numerosCabeza.length || numerosCabeza.some((n, i) => n !== i + 1)) {
    return { error: 'La numeración de cabezas de serie debe ser correlativa desde el número 1' }
  }
  const gruposDeCabezas = cabezas.map(c => (miembros || []).find(m => m.jugador_id === c.jugadorId)?.grupo_id)
  if (gruposDeCabezas.some(g => !g)) {
    return { success: true, todosCompletos: false, bracketCreado: false, esperandoCabezas: true }
  }
  if (new Set(gruposDeCabezas).size !== gruposDeCabezas.length) {
    return { error: 'No pueden quedar dos cabezas de serie en el mismo grupo' }
  }
  const gruposCerrados = new Set(clasificados.map(c => c.grupoId))

  const slotDe = (jid?: string | null): { grupoIdx: number; pos: 1 | 2 } | null => {
    if (!jid) return null
    const clasificado = clasificados.find(c => c.primeroId === jid || c.segundoId === jid)
    const grupoIdx = clasificado ? idxByGrupoId.get(clasificado.grupoId) : null
    if (grupoIdx == null || !clasificado) return null
    return { grupoIdx, pos: clasificado.primeroId === jid ? 1 : 2 }
  }
  const cabezasSlots = cabezas.map(c => {
    const slot = slotDe(c.jugadorId)
    return slot ? { ...slot, numero: c.numero } : null
  }).filter((c): c is { grupoIdx: number; pos: 1 | 2; numero: number } => !!c)

  const { data: bracketExistente } = await supabase
    .from('torneo_partidos')
    .select('id, fase, orden, ganador, jugador_a, jugador_b, slot_a_grupo_id, slot_a_posicion, slot_b_grupo_id, slot_b_posicion')
    .eq('torneo_id', torneoId)
    .neq('fase', 'grupos')

  if (!bracketExistente?.length) {
    const minimoCerrados = Math.ceil(numGrupos / 2)
    if (clasificados.length < minimoCerrados) {
      return { success: true, todosCompletos: false, bracketCreado: false, minimoCerrados }
    }

    // Antes de congelar el árbol deben conocerse las posiciones reales de los
    // cabezas. Si no clasificaron, basta con que su grupo ya esté cerrado.
    for (const cabeza of cabezas) {
      const grupoCabeza = (miembros || []).find(m => m.jugador_id === cabeza.jugadorId)?.grupo_id
      if (grupoCabeza && !gruposCerrados.has(grupoCabeza)) {
        return { success: true, todosCompletos: false, bracketCreado: false, esperandoCabezas: true }
      }
    }
  }

  const gruposListosIdx = clasificados
    .map(c => idxByGrupoId.get(c.grupoId))
    .filter((i): i is number => i != null)
  const layout = construirLlavesLayoutNumerado(numGrupos, cabezasSlots, gruposListosIdx)
  if (!layout.matches.length) return { error: 'No se pudo construir un bracket válido' }

  const hayLlavesJugadas = !!bracketExistente?.some(llaveFueJugada)
  const inicialesExistentes = (bracketExistente || []).filter(p => p.fase === layout.faseInicial)
  const metadataCompleta = inicialesExistentes.length === layout.matches.length && inicialesExistentes.every(p =>
    !!p.slot_a_grupo_id && (p.slot_a_posicion === 1 || p.slot_a_posicion === 2) &&
    ((!p.slot_b_grupo_id && p.slot_b_posicion == null) ||
      (!!p.slot_b_grupo_id && (p.slot_b_posicion === 1 || p.slot_b_posicion === 2))),
  )
  const algunaMetadata = inicialesExistentes.some(p =>
    !!p.slot_a_grupo_id || p.slot_a_posicion != null || !!p.slot_b_grupo_id || p.slot_b_posicion != null,
  )
  if (bracketExistente?.length && !metadataCompleta && (hayLlavesJugadas || algunaMetadata)) {
    return { error: 'El bracket anterior tiene información incompleta y no puede reconstruirse sin riesgo' }
  }
  const debeReconstruirEsqueleto = !!bracketExistente?.length && !metadataCompleta && !hayLlavesJugadas

  if (debeReconstruirEsqueleto) {
    const { error } = await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId).neq('fase', 'grupos')
    if (error) return { error: 'No se pudo reconstruir el bracket anterior' }
  }

  const realDe = (grupoId: string | null | undefined, pos: number | null | undefined): string | null => {
    if (!grupoId || (pos !== 1 && pos !== 2)) return null
    const c = clasificados.find(x => x.grupoId === grupoId)
    if (!c) return null
    return pos === 1 ? c.primeroId : c.segundoId
  }

  const { data: existentes, error: buscarError } = await supabase
    .from('torneo_partidos').select('id, orden, jugador_a, jugador_b, ganador,slot_a_grupo_id,slot_a_posicion,slot_b_grupo_id,slot_b_posicion')
    .eq('torneo_id', torneoId).eq('fase', layout.faseInicial)
  if (buscarError) return { error: 'No se pudo consultar el bracket actual' }

  if (!existentes || existentes.length === 0) {
    // Primera vez: crear el esqueleto completo de la ronda inicial.
    const inserts = layout.matches.map(m => {
      const grupoA = m.a ? grupos[m.a.grupoIdx]?.id ?? null : null
      const grupoB = m.b ? grupos[m.b.grupoIdx]?.id ?? null : null
      const a = realDe(grupoA, m.a?.pos)
      const esBye = m.b === null
      return {
        torneo_id: torneoId,
        fase: layout.faseInicial,
        jugador_a: a,
        jugador_b: esBye ? null : realDe(grupoB, m.b?.pos),
        ganador: esBye && a ? a : null, // BYE ya conocido avanza solo
        orden: m.orden,
        slot_a_grupo_id: grupoA,
        slot_a_posicion: m.a?.pos ?? null,
        slot_b_grupo_id: grupoB,
        slot_b_posicion: m.b?.pos ?? null,
      }
    })
    if (inserts.length) {
      const { error } = await supabase.from('torneo_partidos').insert(inserts)
      if (error) return { error: 'No se pudo crear el bracket inicial' }
    }
  } else {
    // Rellenar solo cupos vacíos de partidos aún no jugados (no pisa arrastres).
    const byOrden = new Map(existentes.map(r => [r.orden, r]))
    const pendientes: PromiseLike<{ error: unknown }>[] = []
    for (const m of layout.matches) {
      const row = byOrden.get(m.orden)
      if (!row || llaveFueJugada(row)) continue
      const upd: { jugador_a?: string | null; jugador_b?: string | null; ganador?: string | null } = {}
      const fallbackA = m.a ? grupos[m.a.grupoIdx]?.id ?? null : null
      const fallbackB = m.b ? grupos[m.b.grupoIdx]?.id ?? null : null
      const grupoA = row.slot_a_grupo_id ?? fallbackA
      const posA = row.slot_a_posicion ?? m.a?.pos
      const grupoB = row.slot_b_grupo_id ?? fallbackB
      const posB = row.slot_b_posicion ?? m.b?.pos
      const a = realDe(grupoA, posA)
      const esBye = !grupoB || !posB
      const b = esBye ? null : realDe(grupoB, posB)

      if (row.jugador_a !== a) upd.jugador_a = a
      if (row.jugador_b !== b) upd.jugador_b = b
      const ganadorEsperado = esBye && a ? a : null
      if (row.ganador !== ganadorEsperado) upd.ganador = ganadorEsperado
      if (Object.keys(upd).length) {
        pendientes.push(supabase.from('torneo_partidos').update(upd).eq('id', row.id))
      }
    }
    if (pendientes.length) {
      const resultados = await Promise.all(pendientes)
      if (resultados.some(r => r.error)) return { error: 'No se pudo completar un cupo del bracket' }
    }
  }

  // Marcar clasificados — ambos avanzan al bracket.
  const clasificadosIds = clasificados.flatMap(c => [c.primeroId, c.segundoId])
  if (grupos.length) {
    const { error } = await supabase.from('grupo_jugadores').update({ clasificado: false }).in('grupo_id', grupos.map(g => g.id))
    if (error) return { error: 'No se pudo actualizar la clasificación del torneo' }
  }
  if (clasificadosIds.length) {
    const { error } = await supabase.from('grupo_jugadores').update({ clasificado: true })
      .in('grupo_id', grupos.map(g => g.id))
      .in('jugador_id', clasificadosIds)
    if (error) return { error: 'No se pudo guardar los jugadores clasificados' }
  }

  // Los BYE ya conocidos avanzan automáticamente a la fase siguiente igual
  // que un ganador manual, incluso mientras siguen abiertos otros grupos.
  const { data: rondaInicial } = await supabase.from('torneo_partidos')
    .select('torneo_id,fase,orden,ganador,jugador_b')
    .eq('torneo_id', torneoId)
    .eq('fase', layout.faseInicial)
    .order('orden')
  const byesConGanador = (rondaInicial || []).filter(p => p.ganador && !p.jugador_b)
  if (byesConGanador.length) {
    const erroresBye = await Promise.all(byesConGanador.map(p => propagarGanadorPlayoff(supabase, p, p.ganador!)))
    const primerError = erroresBye.find(e => e != null)
    if (primerError) return { error: primerError }
  }

  if (todosCompletos && torneo.fase === 'grupos') {
    const { data: rondasPlayoff } = await supabase.from('torneo_partidos')
      .select('fase,ganador')
      .eq('torneo_id', torneoId)
      .neq('fase', 'grupos')
    const desde = CONFIG.FASES_ORDEN.indexOf(layout.faseInicial)
    let faseObjetivo: FaseOrden = layout.faseInicial
    for (const fase of CONFIG.FASES_ORDEN.slice(Math.max(0, desde))) {
      const ronda = (rondasPlayoff || []).filter(p => p.fase === fase)
      if (!ronda.length) break
      faseObjetivo = fase
      if (ronda.some(p => !p.ganador)) break
    }
    await supabase.from('torneos').update({ fase: faseObjetivo, estado: 'en_curso' }).eq('id', torneoId)
  }

  return { success: true, faseInicial: layout.faseInicial, todosCompletos, bracketCreado: true }
}

export async function corregirResultadoPlayoff(params: { partidoId: string; nuevoGanadorId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { partidoId, nuevoGanadorId } = params

  const { data: partido } = await supabase.from('torneo_partidos').select('*').eq('id', partidoId).single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (!partido.ganador) return { error: 'El partido no tiene resultado aún' }
  if (partido.fase === 'grupos') return { error: 'Usa corregirResultadoGrupos para partidos de grupos' }
  if (partido.ganador === nuevoGanadorId) return { success: true }

  const { error } = await supabase.rpc('corregir_resultado_playoff_seguro', {
    p_partido_id: partidoId,
    p_nuevo_ganador_id: nuevoGanadorId,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function volverAGrupos(params: { torneoId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId } = params

  const { data: torneo } = await supabase.from('torneos').select('fase').eq('id', torneoId).single()
  if (!torneo) return { error: 'Torneo no encontrado' }
  if (torneo.fase === 'inscripcion') return { error: 'El torneo aún está en inscripción' }

  // Vale también durante la fase de grupos: borra el cuadro parcialmente armado
  // para que se reconstruya limpio desde los resultados actuales.
  const { data: bracketRows } = await supabase
    .from('torneo_partidos').select('id').eq('torneo_id', torneoId).neq('fase', 'grupos').limit(1)
  if (!bracketRows?.length) return { error: 'No hay llaves generadas' }

  await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId).neq('fase', 'grupos')

  const { data: grupos } = await supabase.from('torneo_grupos').select('id').eq('torneo_id', torneoId)
  if (grupos?.length) {
    const grupoIds = grupos.map(g => g.id)
    await supabase.from('grupo_jugadores').update({ clasificado: false }).in('grupo_id', grupoIds)
  }

  await supabase.from('torneos').update({ fase: 'grupos' }).eq('id', torneoId)

  return { success: true }
}

export async function finalizarTorneo(params: { torneoId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { data: final, error: finalError } = await supabase
    .from('torneo_partidos')
    .select('jugador_a,jugador_b,ganador')
    .eq('torneo_id', params.torneoId)
    .eq('fase', 'final')
    .maybeSingle()
  const podio = final ? derivarPodioFinal(final) : null
  if (finalError || !podio) {
    return { error: 'La final debe estar completa antes de finalizar el torneo.' }
  }

  const { error } = await supabase.from('torneos').update({
    estado: 'finalizado',
    fase: 'finalizado',
    fecha_fin: new Date().toISOString(),
    campeon_id: podio.campeonId,
    subcampeon_id: podio.subcampeonId,
  }).eq('id', params.torneoId)
  if (error) return { error: `No se pudo finalizar el torneo: ${error.message}` }
  return { success: true }
}

export async function limpiarGruposHuerfanos(params: { torneoId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId } = params

  const { data: grupos } = await supabase
    .from('torneo_grupos')
    .select('id, nombre')
    .eq('torneo_id', torneoId)
    .neq('nombre', 'MESA')

  if (!grupos?.length) return { success: true, eliminados: 0 }

  const grupoIdsAll = grupos.map(g => g.id)
  const { data: miembros } = await supabase
    .from('grupo_jugadores')
    .select('grupo_id')
    .in('grupo_id', grupoIdsAll)

  const conMiembros = new Set((miembros || []).map(m => m.grupo_id))
  const vacios = grupoIdsAll.filter(id => !conMiembros.has(id))
  if (vacios.length) {
    await Promise.all([
      supabase.from('torneo_partidos').delete().in('grupo_id', vacios),
      supabase.from('torneo_grupos').delete().in('id', vacios),
    ])
  }

  return { success: true, eliminados: vacios.length }
}

export async function generarGruposTardios(params: {
  torneoId: string
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId } = params

  const { data: grupoMesa } = await supabase
    .from('torneo_grupos').select('id').eq('torneo_id', torneoId).eq('nombre', 'MESA').maybeSingle()
  if (!grupoMesa) return { error: 'No hay jugadores en mesa' }

  const { data: mesaJugadores } = await supabase
    .from('grupo_jugadores').select('jugador_id, jugadores(id,nombre)').eq('grupo_id', grupoMesa.id)
  const jugadores: JugadorTorneo[] = (mesaJugadores || [])
    .map(i => {
      const j = Array.isArray(i.jugadores) ? i.jugadores[0] : i.jugadores
      return j ? { id: j.id, nombre: j.nombre ?? '' } : null
    })
    .filter((x): x is JugadorTorneo => x !== null)

  if (!jugadores.length) return { error: 'No hay jugadores tardíos en mesa' }

  const { data: llavesJugadas } = await supabase.from('torneo_partidos')
    .select('ganador,jugador_b')
    .eq('torneo_id', torneoId)
    .neq('fase', 'grupos')
  if (llavesJugadas?.length) {
    return { error: 'No se pueden agregar tardíos después de crear el bracket' }
  }

  const lecturaCabezas = await leerCabezasSerie(supabase, torneoId)
  if (lecturaCabezas.error) return { error: lecturaCabezas.error }
  const cabezas = lecturaCabezas.cabezas
  const cabezasTardias = cabezas.filter(c => jugadores.some(j => j.id === c.jugadorId)).map(c => c.jugadorId)
  const reactivarGruposSiHabiaLlaves = async () => {
    if (!llavesJugadas?.length) return
    await supabase.from('torneos').update({ fase: 'grupos', estado: 'en_curso' }).eq('id', torneoId)
  }

  const { data: gruposExistentes } = await supabase
    .from('torneo_grupos').select('id, nombre, orden, en_preparacion').eq('torneo_id', torneoId).neq('nombre', 'MESA').order('orden', { nullsFirst: false }).order('nombre')

  // Recupera un traslado tardío que alcanzó a crear el grupo pero se
  // interrumpió antes de retirar las filas duplicadas de MESA.
  const grupoPreparacionExistente = (gruposExistentes || []).find(g => g.en_preparacion)
  if (grupoPreparacionExistente) {
    const { data: miembrosPreparacion } = await supabase.from('grupo_jugadores')
      .select('jugador_id').eq('grupo_id', grupoPreparacionExistente.id)
    const idsMesa = new Set(jugadores.map(j => j.id))
    const duplicados = (miembrosPreparacion || []).map(m => m.jugador_id)
      .filter((id): id is string => !!id && idsMesa.has(id))
    if (duplicados.length > 0 && duplicados.length === (miembrosPreparacion || []).length) {
      const { error: limpiarMesaError } = await supabase.from('grupo_jugadores')
        .delete().eq('grupo_id', grupoMesa.id).in('jugador_id', duplicados)
      if (limpiarMesaError) return { error: 'No se pudo recuperar el traslado pendiente desde MESA' }
      return { success: true, numGrupos: 0, nombres: `${grupoPreparacionExistente.nombre} (en preparación)` }
    }
  }

  // 1 jugador: meter en grupo existente con menos integrantes
  if (jugadores.length === 1) {
    const counts = await Promise.all(
      (gruposExistentes || []).map(async g => {
        const { data: gjs } = await supabase.from('grupo_jugadores').select('jugador_id, orden').eq('grupo_id', g.id)
        const ordenados = ordenarMiembros(gjs || [])
        return { id: g.id, nombre: g.nombre ?? '', enPreparacion: g.en_preparacion, count: ordenados.length, playerIds: ordenados.map(x => x.jugador_id).filter((id): id is string => !!id) }
      }),
    )
    const cabezasIds = new Set(cabezas.map(c => c.jugadorId))
    const jugadorEsCabeza = cabezasIds.has(jugadores[0].id)
    const preparacion = counts.find(g => g.enPreparacion && g.count < 4)
    if (jugadorEsCabeza && preparacion?.playerIds.some(id => cabezasIds.has(id))) {
      return { error: 'El grupo en preparación ya contiene otra cabeza de serie. Ajusta las cabezas antes de incorporar al jugador.' }
    }
    const disponibles = counts.filter(g =>
      g.count < 4 && (!jugadorEsCabeza || !g.playerIds.some(id => cabezasIds.has(id))),
    )
    if (disponibles.length) {
      disponibles.sort((a, b) => Number(b.enPreparacion) - Number(a.enPreparacion) || a.count - b.count)
      const target = disponibles[0]
      const { data: movido, error: moverError } = await supabase.from('grupo_jugadores')
        .update({ grupo_id: target.id, orden: target.count })
        .eq('grupo_id', grupoMesa.id).eq('jugador_id', jugadores[0].id).select('id')
      if (moverError || !movido?.length) return { error: 'No se pudo mover al jugador desde MESA' }
      if (target.enPreparacion) {
        return { success: true, numGrupos: 0, nombres: `${target.nombre} (en preparación)` }
      }
      const { data: pts } = await supabase.from('torneo_partidos').select('orden').eq('torneo_id', torneoId)
      const maxOrden = (pts || []).reduce((m, p) => Math.max(m, p.orden ?? 0), 0)
      const nuevos = target.playerIds.map((pid, i) => ({
        torneo_id: torneoId, grupo_id: target.id, fase: 'grupos' as const,
        jugador_a: jugadores[0].id, jugador_b: pid, orden: maxOrden + 1 + i,
      }))
      if (nuevos.length) {
        const { error: partidosError } = await supabase.from('torneo_partidos').insert(nuevos)
        if (partidosError) {
          await supabase.from('grupo_jugadores').update({ grupo_id: grupoMesa.id, orden: 0 })
            .eq('grupo_id', target.id).eq('jugador_id', jugadores[0].id)
          return { error: 'No se pudieron crear los partidos del jugador; permanece en MESA' }
        }
      }
      await reactivarGruposSiHabiaLlaves()
      return { success: true, numGrupos: 0, nombres: target.nombre }
    }
  }

  // 2+ jugadores: crear grupo nuevo
  const siguienteOrden = (gruposExistentes || []).reduce((max, g) => Math.max(max, g.orden ?? -1), -1) + 1

  if (jugadores.length === 1) {
    return { error: 'No hay espacio disponible. Deja al jugador en MESA y crea un grupo manual cuando lleguen más jugadores.' }
  }

  const numGrupos = calcularNumGruposTardios(jugadores.length)
  if (cabezasTardias.length > numGrupos) {
    return { error: `Hay ${cabezasTardias.length} cabezas tardías para ${numGrupos} grupos nuevos. Crea más grupos o ajusta las cabezas de serie.` }
  }
  if ((gruposExistentes?.length ?? 0) + numGrupos > CONFIG.TORNEO_MAX_GRUPOS) {
    return { error: `No se pueden superar ${CONFIG.TORNEO_MAX_GRUPOS} grupos en un torneo` }
  }
  const asignaciones = seedingSerpenteo(jugadores, numGrupos, cabezasTardias)
  const grupoIncompletoIdx = Array.from({ length: numGrupos }, (_, i) => i)
    .find(i => asignaciones.filter(a => a.grupoIndex === i).length < 3)
  if (grupoIncompletoIdx != null && (gruposExistentes || []).some(g => g.en_preparacion)) {
    return { error: 'Ya existe un grupo en preparación. Complétalo antes de crear otro grupo incompleto.' }
  }

  const { data: nuevosGruposData, error: grupoError } = await supabase
    .from('torneo_grupos')
    .insert(Array.from({ length: numGrupos }, (_, i) => ({
      torneo_id: torneoId,
      nombre: nombreGrupo(siguienteOrden + i),
      orden: siguienteOrden + i,
      en_preparacion: i === grupoIncompletoIdx,
    })))
    .select('id, nombre')
  if (grupoError || !nuevosGruposData?.length) {
    return { error: 'No se pudieron crear todos los grupos tardíos' }
  }
  const nuevosGrupos = nuevosGruposData.map((g, i) => ({
    id: g.id,
    nombre: g.nombre ?? '',
    enPreparacion: i === grupoIncompletoIdx,
  }))

  const ordenPorGrupo = new Map<number, number>()
  const inserts = asignaciones.map(a => {
    const orden = ordenPorGrupo.get(a.grupoIndex) ?? 0
    ordenPorGrupo.set(a.grupoIndex, orden + 1)
    return {
    grupo_id: nuevosGrupos[a.grupoIndex].id,
    jugador_id: a.jugadorId,
    orden,
  }})

  // Preparar grupos y partidos antes de retirar a los jugadores de MESA.
  const limpiarNuevosGrupos = async () => {
    await supabase.from('torneo_grupos').delete().in('id', nuevosGrupos.map(g => g.id))
  }
  const { error: miembrosError } = await supabase.from('grupo_jugadores').insert(inserts)
  if (miembrosError) {
    await limpiarNuevosGrupos()
    return { error: 'No se pudieron asignar los jugadores a los grupos tardíos' }
  }

  // Generar partidos round robin
  const { data: partidosExistentes } = await supabase
    .from('torneo_partidos').select('orden').eq('torneo_id', torneoId)
  let maxOrden = (partidosExistentes || []).reduce((m, p) => Math.max(m, p.orden ?? 0), 0)

  const partidos: Array<{ torneo_id: string; grupo_id: string; fase: string; jugador_a: string; jugador_b: string; orden: number }> = []
  for (const g of nuevosGrupos) {
    if (g.enPreparacion) continue
    const jugadoresGrupo = inserts.filter(a => a.grupo_id === g.id).sort((a, b) => a.orden - b.orden).map(a => a.jugador_id)
    const parejas = generarRoundRobin(jugadoresGrupo)
    for (const [a, b] of parejas) {
      partidos.push({ torneo_id: torneoId, grupo_id: g.id, fase: 'grupos', jugador_a: a, jugador_b: b, orden: ++maxOrden })
    }
  }
  if (partidos.length) {
    const { error: partidosError } = await supabase.from('torneo_partidos').insert(partidos)
    if (partidosError) {
      await limpiarNuevosGrupos()
      return { error: 'No se pudieron crear los partidos de los grupos tardíos' }
    }
  }
  const { error: mesaError } = await supabase.from('grupo_jugadores')
    .delete().eq('grupo_id', grupoMesa.id).in('jugador_id', jugadores.map(j => j.id))
  if (mesaError) {
    await limpiarNuevosGrupos()
    return { error: 'No se pudo completar el traslado desde MESA' }
  }
  await reactivarGruposSiHabiaLlaves()

  const nombres = nuevosGrupos.map(g => g.nombre).join(', ')
  return { success: true, numGrupos, nombres }
}

export async function actualizarEstadoPago(params: {
  torneoId: string
  jugadorId: string
  estado: 'pagado' | 'pendiente'
  metodoPago?: 'efectivo' | 'transferencia'
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, jugadorId, estado, metodoPago } = params
  const fechaPago = estado === 'pagado' ? new Date().toISOString().slice(0, 10) : null
  const metodoFinal = estado === 'pagado' ? (metodoPago || 'efectivo') : null

  // ponytail: delete duplicates then upsert — prevents race condition on rapid clicks
  const { data: existingRows } = await supabase
    .from('torneo_pagos')
    .select('id')
    .eq('torneo_id', torneoId)
    .eq('jugador_id', jugadorId)
    .order('id', { ascending: true })

  if (existingRows && existingRows.length > 1) {
    const idsToDelete = existingRows.slice(1).map(r => r.id)
    await supabase.from('torneo_pagos').delete().in('id', idsToDelete)
  }

  if (existingRows && existingRows.length > 0) {
    const { error } = await supabase.from('torneo_pagos').update({
      estado,
      fecha_pago: fechaPago,
      metodo_pago: metodoFinal,
    }).eq('id', existingRows[0].id)
    if (error) return { error: 'No se pudo actualizar el pago' }
  } else {
    const { error } = await supabase.from('torneo_pagos').insert({
      torneo_id: torneoId,
      jugador_id: jugadorId,
      estado,
      metodo_pago: metodoFinal,
      fecha_pago: fechaPago,
    })
    if (error) return { error: 'No se pudo registrar el pago' }
  }

  return { success: true }
}

/**
 * Sube a Finanzas los pagos de torneo ya marcados como "pagado" que aún no
 * se han subido. Se puede llamar varias veces: cada vez sube solo lo nuevo
 * (los jugadores que pagan después se marcan pagado aparte y se suben en
 * una siguiente llamada). Si no se pasa `jugadorIds`, sube todos los
 * pagados pendientes de subir del torneo.
 */
export async function subirPagosPendientesAFinanzas(params: {
  torneoId: string
  jugadorIds?: string[]
  idempotencyKey?: string
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  let jugadorIds: string[] | null = null
  if (params.jugadorIds) {
    jugadorIds = Array.from(new Set(params.jugadorIds)).filter(Boolean)
    if (!jugadorIds.length) return { error: 'Selecciona al menos un pago.' }
  }

  const { data, error } = await supabase.rpc('subir_pagos_torneo_a_finanzas_atomico', {
    p_torneo_id: params.torneoId,
    p_jugador_ids: jugadorIds,
    p_idempotency_key: params.idempotencyKey ?? crypto.randomUUID(),
  })
  if (error || !data) return { error: error?.message ?? 'No se pudo subir a Finanzas' }

  const resultado = data as unknown as { cantidad: number; monto: number }
  return { success: true, cantidad: resultado.cantidad, monto: resultado.monto }
}

export async function intercambiarJugadores(params: {
  torneoId: string
  slotA: { partidoId: string; posicion: 'jugador_a' | 'jugador_b' }
  slotB: { partidoId: string; posicion: 'jugador_a' | 'jugador_b' }
}): Promise<{ error?: string; success?: boolean }> {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, slotA, slotB } = params
  if (slotA.partidoId === slotB.partidoId && slotA.posicion === slotB.posicion) return { success: true }

  const ids = [...new Set([slotA.partidoId, slotB.partidoId])]
  const { data: filas } = await supabase.from('torneo_partidos')
    .select('id,torneo_id,fase,orden,jugador_a,jugador_b,ganador,slot_a_grupo_id,slot_a_posicion,slot_b_grupo_id,slot_b_posicion')
    .in('id', ids).eq('torneo_id', torneoId)
  if (!filas || filas.length !== ids.length) return { error: 'No se encontraron ambos cupos' }

  const origen = filas.find(p => p.id === slotA.partidoId)
  const destino = filas.find(p => p.id === slotB.partidoId)
  if (!origen || !destino || origen.fase !== destino.fase || origen.fase === 'grupos') {
    return { error: 'Solo puedes intercambiar cupos de la misma ronda inicial' }
  }

  const lecturaCabezas = await leerCabezasSerie(supabase, torneoId)
  if (lecturaCabezas.error) return { error: lecturaCabezas.error }
  const cabezas = new Set(lecturaCabezas.cabezas.map(c => c.jugadorId))

  const { data: fases } = await supabase.from('torneo_partidos')
    .select('fase').eq('torneo_id', torneoId).neq('fase', 'grupos')
  const faseInicial = CONFIG.FASES_ORDEN.find(f => (fases || []).some(p => p.fase === f))
  if (!faseInicial || origen.fase !== faseInicial) return { error: 'Las rondas siguientes deben respetar el árbol de ganadores' }
  if (llaveFueJugada(origen) || llaveFueJugada(destino)) return { error: 'No puedes mover una llave que ya fue jugada' }

  const totalIniciales = (fases || []).filter(p => p.fase === faseInicial).length
  const mitad = Math.ceil(totalIniciales / 2)
  if (origen.orden == null || destino.orden == null) return { error: 'El bracket no tiene un orden válido' }
  if ((origen.orden < mitad) !== (destino.orden < mitad)) {
    return { error: 'Solo puedes intercambiar jugadores dentro de la misma mitad del cuadro' }
  }

  type Fila = typeof origen
  const leerSlot = (fila: Fila, posicion: 'jugador_a' | 'jugador_b') => posicion === 'jugador_a'
    ? { jugador: fila.jugador_a, grupoId: fila.slot_a_grupo_id, posicion: fila.slot_a_posicion }
    : { jugador: fila.jugador_b, grupoId: fila.slot_b_grupo_id, posicion: fila.slot_b_posicion }
  const cupoOrigen = leerSlot(origen, slotA.posicion)
  const cupoDestino = leerSlot(destino, slotB.posicion)
  if (!cupoOrigen.jugador || !cupoDestino.jugador || !cupoOrigen.grupoId || !cupoDestino.grupoId) {
    return { error: 'Solo se pueden mover jugadores ya definidos' }
  }
  if (cabezas.has(cupoOrigen.jugador) || cabezas.has(cupoDestino.jugador)) {
    return { error: 'La posición espejo de los cabezas de serie está protegida' }
  }
  if (cupoOrigen.posicion !== cupoDestino.posicion) {
    return { error: 'Intercambia primero con primero o segundo con segundo' }
  }

  const aplicar = (fila: Fila, posicion: 'jugador_a' | 'jugador_b', nuevo: typeof cupoOrigen): Fila => {
    const siguiente = { ...fila }
    if (posicion === 'jugador_a') {
      siguiente.jugador_a = nuevo.jugador
      siguiente.slot_a_grupo_id = nuevo.grupoId
      siguiente.slot_a_posicion = nuevo.posicion
    } else {
      siguiente.jugador_b = nuevo.jugador
      siguiente.slot_b_grupo_id = nuevo.grupoId
      siguiente.slot_b_posicion = nuevo.posicion
    }
    siguiente.ganador = !siguiente.slot_b_grupo_id && siguiente.jugador_a ? siguiente.jugador_a : null
    return siguiente
  }
  const origenNuevo = aplicar(origen, slotA.posicion, cupoDestino)
  const destinoNuevo = aplicar(destino, slotB.posicion, cupoOrigen)

  for (const fila of [origenNuevo, destinoNuevo]) {
    if (fila.slot_a_grupo_id && fila.slot_b_grupo_id) {
      if (fila.slot_a_grupo_id === fila.slot_b_grupo_id) return { error: 'No se puede enfrentar jugadores del mismo grupo' }
      if (fila.slot_a_posicion === fila.slot_b_posicion) return { error: 'Cada llave debe enfrentar un primero contra un segundo' }
    }
  }

  const validarBye = async (fila: Fila) => {
    if (!fila.ganador || fila.jugador_b || !fila.fase || fila.orden == null) return null
    const faseSiguiente = siguienteFase(fila.fase as FaseOrden)
    if (!faseSiguiente) return null
    const { data: siguiente } = await supabase.from('torneo_partidos')
      .select('ganador').eq('torneo_id', torneoId).eq('fase', faseSiguiente)
      .eq('orden', Math.floor(fila.orden / 2)).maybeSingle()
    return siguiente?.ganador ? 'El jugador con BYE ya disputó la siguiente ronda' : null
  }
  for (const fila of [origen, destino]) {
    const bloqueo = await validarBye(fila)
    if (bloqueo) return { error: bloqueo }
  }

  const { error } = await supabase.rpc('intercambiar_cupos_bracket_seguro', {
    p_torneo_id: torneoId,
    p_partido_a_id: slotA.partidoId,
    p_posicion_a: slotA.posicion,
    p_partido_b_id: slotB.partidoId,
    p_posicion_b: slotB.posicion,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function inscribirEnMesa(params: {
  torneoId: string
  busqueda: string
  rut: string
  metodoPago: 'efectivo' | 'transferencia' | 'pendiente'
}) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, busqueda, rut, metodoPago } = params
  const nombreBuscado = busqueda.trim()
  if (!nombreBuscado) return { error: 'Nombre vacío' }
  if (!perfil.club_id) return { error: 'Perfil sin club asignado' }

  const { data: torneo } = await supabase.from('torneos').select('cuota_inscripcion,club_id').eq('id', torneoId).single()
  if (!torneo || torneo.club_id !== perfil.club_id) return { error: 'Torneo no encontrado' }
  const { count: bracket } = await supabase.from('torneo_partidos')
    .select('id', { count: 'exact', head: true }).eq('torneo_id', torneoId).neq('fase', 'grupos')
  if ((bracket ?? 0) > 0) return { error: 'No se pueden inscribir jugadores después de crear el bracket' }

  const { data: jugsExistentes } = await supabase
    .from('jugadores').select('id,nombre')
    .ilike('nombre', `%${nombreBuscado}%`)
    .eq('club_id', perfil.club_id)

  let jugadorId: string
  let jugadorNombre = nombreBuscado

  if (jugsExistentes?.length) {
    const jug = jugsExistentes[0]
    jugadorId = jug.id
    jugadorNombre = jug.nombre ?? jugadorNombre
  } else {
    const { data: nuevo } = await supabase.from('jugadores').insert({
      club_id: perfil.club_id, nombre: nombreBuscado,
      rut: rut || null, categoria: 'principiante', sesiones_limite: 0,
      es_externo: true,
    }).select().single()
    if (!nuevo) return { error: 'No se pudo crear el jugador' }
    jugadorId = nuevo.id
  }

  const { data: yaInscrito } = await supabase
    .from('grupo_jugadores').select('jugador_id, torneo_grupos!inner(torneo_id)')
    .eq('jugador_id', jugadorId).eq('torneo_grupos.torneo_id', torneoId).maybeSingle()
  if (yaInscrito) return { error: 'Este jugador ya está inscrito en este torneo' }

  let { data: grupoMesa } = await supabase.from('torneo_grupos').select('*').eq('torneo_id', torneoId).eq('nombre', 'MESA').maybeSingle()
  if (!grupoMesa) {
    const { data: ng } = await supabase.from('torneo_grupos').insert({ torneo_id: torneoId, nombre: 'MESA' }).select().single()
    grupoMesa = ng
  }
  if (!grupoMesa) return { error: 'No se pudo crear el grupo MESA' }

  await supabase.from('grupo_jugadores').insert({ grupo_id: grupoMesa.id, jugador_id: jugadorId })

  if ((torneo?.cuota_inscripcion ?? 0) > 0) {
    const estaPagado = metodoPago !== 'pendiente'
    const { error: pagoError } = await supabase.from('torneo_pagos').insert({
      torneo_id: torneoId,
      jugador_id: jugadorId,
      estado: estaPagado ? 'pagado' : 'pendiente',
      metodo_pago: estaPagado ? metodoPago : null,
      fecha_pago: estaPagado ? new Date().toISOString().slice(0, 10) : null,
    })
    if (pagoError) {
      await supabase.from('grupo_jugadores').delete().eq('grupo_id', grupoMesa.id).eq('jugador_id', jugadorId)
      return { error: 'No se pudo registrar el pago; la inscripción fue cancelada' }
    }
  }

  return { success: true, jugadorId, jugadorNombre }
}

export async function archivarTorneo(params: { torneoId: string }) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr || !supabase) return { error: authErr }

  const { torneoId } = params

  const { error } = await supabase
    .from('torneos')
    .update({ estado: 'archivado' })
    .eq('id', torneoId)
    .eq('club_id', perfil!.club_id!)
  if (error) return { error: `No se pudo archivar: ${error.message}` }

  return { success: true }
}

export const eliminarTorneo = archivarTorneo

export async function quitarJugadorDeMesa(params: { torneoId: string; jugadorId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr || !supabase) return { error: authErr }

  const { torneoId, jugadorId } = params

  const { data: grupos } = await supabase
    .from('torneo_grupos')
    .select('id')
    .eq('torneo_id', torneoId)

  if (!grupos?.length) return { success: true }

  const { error } = await supabase
    .from('grupo_jugadores')
    .delete()
    .eq('jugador_id', jugadorId)
    .in('grupo_id', grupos.map(g => g.id))

  if (error) return { error: `No se pudo quitar al jugador: ${error.message}` }
  return { success: true }
}

export async function eliminarTorneoDefinitivo(params: { torneoId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId } = params

  const { data: torneo } = await supabase
    .from('torneos')
    .select('estado, nombre, club_id')
    .eq('id', torneoId)
    .single()
  if (!torneo) return { error: 'Torneo no encontrado' }
  if (torneo.estado !== 'archivado') {
    return { error: 'Solo se puede borrar definitivamente un torneo archivado.' }
  }

  const { data: grupos } = await supabase
    .from('torneo_grupos').select('id').eq('torneo_id', torneoId)
  const grupoIds = (grupos || []).map(g => g.id)

  await supabase.from('movimientos').delete().eq('torneo_id', torneoId)
  if (torneo.nombre && torneo.club_id) {
    await supabase
      .from('movimientos')
      .delete()
      .eq('club_id', torneo.club_id)
      .ilike('descripcion', `%${torneo.nombre}%`)
  }
  if (grupoIds.length) await supabase.from('grupo_jugadores').delete().in('grupo_id', grupoIds)
  await supabase.from('torneo_jugadores').delete().eq('torneo_id', torneoId)
  await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId)
  await supabase.from('torneo_pagos').delete().eq('torneo_id', torneoId)
  await supabase.from('torneo_grupos').delete().eq('torneo_id', torneoId)
  await supabase.from('torneos').delete().eq('id', torneoId)

  return { success: true }
}

export async function guardarPremios(params: {
  torneoId: string
  torneoNombre: string
  primero: number | null
  segundo: number | null
  tercero: number | null
  metodo?: 'efectivo' | 'transferencia'
  gastosGestion?: { tipo: string; monto: number }[]
  idempotencyKey?: string
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { data, error } = await supabase.rpc('guardar_premios_torneo_atomico', {
    p_torneo_id: params.torneoId,
    p_torneo_nombre: params.torneoNombre,
    p_primero: params.primero,
    p_segundo: params.segundo,
    p_tercero: params.tercero,
    p_metodo: params.metodo ?? 'efectivo',
    p_gastos: params.gastosGestion ?? [],
    p_idempotency_key: params.idempotencyKey ?? crypto.randomUUID(),
  })
  if (error || !data) return { error: error?.message ?? 'No se pudieron guardar los premios' }

  return { success: true }
}
