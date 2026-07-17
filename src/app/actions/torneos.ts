'use server'

import {
  seedingSerpenteo,
  generarRoundRobin,
  generarSiguienteFase,
  siguienteFase,
  construirLlavesLayout,
  calcularNumGrupos,
  calcularNumGruposTardios,
  calcularStatsGrupo,
  derivarPodioFinal,
  type JugadorTorneo,
} from '@/lib/domain/torneos'
import { CONFIG, type FaseOrden } from '@/lib/config'
import { requireAdmin } from '@/lib/auth/require'

type AdminSupabase = NonNullable<Awaited<ReturnType<typeof requireAdmin>>['supabase']>

type ClasificadoGrupo = { grupoId: string; primeroId: string; segundoId: string }

function llaveFueJugada(partido: { ganador: string | null; jugador_b: string | null }) {
  return !!partido.ganador && !!partido.jugador_b
}

function ordenarMiembros<T extends { orden?: number | null; jugador_id?: string | null }>(miembros: T[]) {
  return [...miembros].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.jugador_id ?? '').localeCompare(String(b.jugador_id ?? '')))
}

async function calcularClasificadosDesdeBD(
  supabase: AdminSupabase,
  torneoId: string,
): Promise<{ clasificados: ClasificadoGrupo[] } | { error: string }> {
  const { data: grupos } = await supabase
    .from('torneo_grupos')
    .select('id, nombre')
    .eq('torneo_id', torneoId)
    .neq('nombre', 'MESA')
    .order('nombre')

  if (!grupos?.length) return { clasificados: [] }

  const grupoIds = grupos.map(g => g.id)
  const [{ data: miembros }, { data: partidos }] = await Promise.all([
    supabase
      .from('grupo_jugadores')
      .select('grupo_id, jugador_id, jugadores(id,nombre)')
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
    const jugadoresGrupo: JugadorTorneo[] = (miembros || [])
      .filter(m => m.grupo_id === grupo.id)
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
      return { error: `El grupo ${grupo.nombre ?? ''} quedo con triple empate. Resuelve ese desempate antes de sincronizar llaves.` }
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
  actualizarFase = true,
) {
  if (!partido.torneo_id || !partido.fase || partido.fase === 'grupos') return
  const faseSiguiente = siguienteFase(partido.fase as FaseOrden)
  if (!faseSiguiente) return

  const ordenSiguiente = Math.floor((partido.orden ?? 0) / 2)
  const slotGanador = (partido.orden ?? 0) % 2 === 0 ? 'jugador_a' : 'jugador_b'
  const { data: existentes } = await supabase
    .from('torneo_partidos')
    .select('id, jugador_a, jugador_b, ganador')
    .eq('torneo_id', partido.torneo_id)
    .eq('fase', faseSiguiente)
    .eq('orden', ordenSiguiente)
    .order('creado_en', { ascending: true })
    .limit(1)

  const existente = existentes?.[0]
  if (existente) {
    if (!existente.ganador && existente[slotGanador] !== ganadorId) {
      const updateSlot = slotGanador === 'jugador_a'
        ? { jugador_a: ganadorId }
        : { jugador_b: ganadorId }
      await supabase.from('torneo_partidos').update(updateSlot).eq('id', existente.id)
    }
  } else {
    await supabase.from('torneo_partidos').insert({
      torneo_id: partido.torneo_id,
      fase: faseSiguiente,
      orden: ordenSiguiente,
      jugador_a: slotGanador === 'jugador_a' ? ganadorId : null,
      jugador_b: slotGanador === 'jugador_b' ? ganadorId : null,
      ganador: null,
    })
  }

  if (actualizarFase) {
    await supabase.from('torneos').update({ fase: faseSiguiente }).eq('id', partido.torneo_id)
  }
}

export async function corregirResultadoGrupos(params: { partidoId: string; nuevoGanadorId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { partidoId, nuevoGanadorId } = params

  const { data: partido } = await supabase.from('torneo_partidos').select('*').eq('id', partidoId).single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (!partido.ganador) return { error: 'El partido no tiene resultado aún' }
  if (partido.fase !== 'grupos') return { error: 'Solo se pueden corregir partidos de grupos' }
  if (partido.ganador === nuevoGanadorId) return { success: true }

  const anteriorGanadorId: string = partido.ganador
  const anteriorPerdedorId: string | null = anteriorGanadorId === partido.jugador_a ? partido.jugador_b : partido.jugador_a
  const torneoIdPartido: string = partido.torneo_id ?? partidoId

  const { data: llavesExistentes } = await supabase
    .from('torneo_partidos')
    .select('id, ganador, jugador_b')
    .eq('torneo_id', torneoIdPartido)
    .neq('fase', 'grupos')

  if (llavesExistentes?.some(llaveFueJugada)) {
    return { error: 'No se puede corregir grupos porque ya hay llaves jugadas. Vuelve a grupos o corrige primero la llave afectada para no romper el arbolito.' }
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

  // Aplicar nuevo resultado (reutiliza la lógica existente)
  const marcado = await marcarGanadorPartido({ partidoId, ganadorId: nuevoGanadorId })
  if (marcado.error) return marcado

  if (llavesExistentes?.length) {
    const recalculo = await calcularClasificadosDesdeBD(supabase, torneoIdPartido)
    if ('error' in recalculo) return recalculo
    const sync = await sincronizarLlaves({ torneoId: torneoIdPartido, clasificados: recalculo.clasificados })
    if (sync.error) return sync
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

  return { success: true }
}

export async function actualizarCabezasSerie(params: {
  torneoId: string
  cabezaSerie1: string | null
  cabezaSerie2: string | null
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, cabezaSerie1, cabezaSerie2 } = params
  if (cabezaSerie1 && cabezaSerie2 && cabezaSerie1 === cabezaSerie2) {
    return { error: 'Los cabezas de serie 1° y 2° deben ser jugadores distintos' }
  }

  const { data: llaves } = await supabase.from('torneo_partidos')
    .select('ganador,jugador_b')
    .eq('torneo_id', torneoId)
    .neq('fase', 'grupos')
  if (llaves?.some(llaveFueJugada)) {
    return { error: 'No se pueden cambiar los cabezas de serie porque el bracket ya tiene partidos jugados' }
  }

  const { error } = await supabase.from('torneos')
    .update({ cabeza_serie_1: cabezaSerie1 || null, cabeza_serie_2: cabezaSerie2 || null })
    .eq('id', torneoId)
  if (error) return { error: 'No se pudo guardar' }
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

  const { data: partidosAfectados } = await supabase
    .from('torneo_partidos')
    .select('id, ganador')
    .eq('torneo_id', torneoId)
    .in('grupo_id', [grupoOrigenId, grupoDestinoId])

  if (partidosAfectados?.some(p => p.ganador)) {
    return { error: 'No se puede mover jugadores: alguno de los dos grupos ya tiene partidos jugados' }
  }

  const { data: destinoActual } = await supabase
    .from('grupo_jugadores')
    .select('id')
    .eq('grupo_id', grupoDestinoId)
  const ordenDestino = destinoActual?.length ?? 0

  const { error: moveErr } = await supabase.from('grupo_jugadores')
    .update({ grupo_id: grupoDestinoId, orden: ordenDestino })
    .eq('jugador_id', jugadorId).eq('grupo_id', grupoOrigenId)
  if (moveErr) return { error: 'No se pudo mover al jugador' }

  await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId).in('grupo_id', [grupoOrigenId, grupoDestinoId])

  const { data: miembros } = await supabase.from('grupo_jugadores').select('id, jugador_id, grupo_id, orden').in('grupo_id', [grupoOrigenId, grupoDestinoId])

  const inserts: { torneo_id: string; grupo_id: string; fase: string; jugador_a: string; jugador_b: string; orden: number }[] = []
  for (const gid of [grupoOrigenId, grupoDestinoId]) {
    const miembrosGrupo = ordenarMiembros((miembros || []).filter(m => m.grupo_id === gid))
    await Promise.all(miembrosGrupo.map((m, orden) => supabase.from('grupo_jugadores').update({ orden }).eq('id', m.id)))
    const idsGrupo = miembrosGrupo.map(m => m.jugador_id).filter((id): id is string => !!id)
    const parejas = generarRoundRobin(idsGrupo)
    for (const [a, b] of parejas) {
      inserts.push({ torneo_id: torneoId, grupo_id: gid, fase: 'grupos', jugador_a: a, jugador_b: b, orden: inserts.length })
    }
  }
  if (inserts.length) await supabase.from('torneo_partidos').insert(inserts)

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
  cabezasDeSerie: string[]
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, cabezasDeSerie } = params

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

  // Limpiar partidos viejos del torneo (evita FK orphans y duplicación de grupos)
  await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId)
  for (const gid of grupoIds) {
    await supabase.from('grupo_jugadores').delete().eq('grupo_id', gid)
    await supabase.from('torneo_grupos').delete().eq('id', gid)
  }

  const numGrupos = calcularNumGrupos(jugadores.length)
  const nuevosGrupos: { id: string; nombre: string }[] = []
  for (let i = 0; i < numGrupos; i++) {
    const { data: g } = await supabase
      .from('torneo_grupos')
      .insert({ torneo_id: torneoId, nombre: String.fromCharCode(65 + i) })
      .select('id, nombre')
      .single()
    if (g) nuevosGrupos.push({ id: g.id, nombre: g.nombre ?? '' })
  }

  const asignaciones = seedingSerpenteo(jugadores, numGrupos, new Set(cabezasDeSerie))
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

// Construye/rellena el cuadro a medida que terminan los grupos, sin re-generar:
// crea el esqueleto (tamaño fijo = 2 clasificados por grupo) la primera vez y
// después solo rellena cupos vacíos, respetando resultados jugados y arrastres.
// El cliente manda solo los grupos ya cerrados (con su 1° y 2° resueltos).
export async function sincronizarLlaves(params: {
  torneoId: string
  clasificados: { grupoId: string; primeroId: string; segundoId: string }[]
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, clasificados } = params

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

  const { data: torneo } = await supabase.from('torneos').select('cabeza_serie_1, cabeza_serie_2, fase').eq('id', torneoId).single()
  if (!torneo) return { error: 'Torneo no encontrado' }

  const { data: gruposRaw } = await supabase
    .from('torneo_grupos').select('id, nombre').eq('torneo_id', torneoId).neq('nombre', 'MESA').order('nombre')
  const grupos = gruposRaw || []
  const numGrupos = grupos.length
  if (numGrupos < 2) return { error: 'Se requieren al menos 2 grupos' }

  // Grupo (por orden alfabético) al que pertenece cada cabeza de serie protegido.
  const idxByGrupoId = new Map(grupos.map((g, i) => [g.id, i]))
  const { data: miembros } = await supabase
    .from('grupo_jugadores').select('jugador_id, grupo_id').in('grupo_id', grupos.map(g => g.id))
  const grupoIdxDe = (jid?: string | null): number | null => {
    if (!jid) return null
    const m = (miembros || []).find(x => x.jugador_id === jid)
    return m?.grupo_id ? (idxByGrupoId.get(m.grupo_id) ?? null) : null
  }
  const c1 = grupoIdxDe(torneo.cabeza_serie_1)
  const c2 = grupoIdxDe(torneo.cabeza_serie_2)

  const layout = construirLlavesLayout(numGrupos, c1, c2)

  const { data: bracketExistente } = await supabase
    .from('torneo_partidos')
    .select('id, fase, ganador, jugador_a, jugador_b')
    .eq('torneo_id', torneoId)
    .neq('fase', 'grupos')

  const hayLlavesJugadas = !!bracketExistente?.some(llaveFueJugada)
  const debeReconstruirEsqueleto = !!bracketExistente?.length && !hayLlavesJugadas && (
    bracketExistente.some(p => p.fase !== layout.faseInicial) ||
    bracketExistente.length !== layout.matches.length
  )

  if (debeReconstruirEsqueleto) {
    await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId).neq('fase', 'grupos')
  }

  const realDe = (slot: { grupoIdx: number; pos: 1 | 2 } | null): string | null => {
    if (!slot) return null
    const g = grupos[slot.grupoIdx]
    const c = clasificados.find(x => x.grupoId === g?.id)
    if (!c) return null
    return slot.pos === 1 ? c.primeroId : c.segundoId
  }

  const { data: existentes } = await supabase
    .from('torneo_partidos').select('id, orden, jugador_a, jugador_b, ganador')
    .eq('torneo_id', torneoId).eq('fase', layout.faseInicial)

  if (!existentes || existentes.length === 0) {
    // Primera vez: crear el esqueleto completo de la ronda inicial.
    const inserts = layout.matches.map(m => {
      const a = realDe(m.a)
      const esBye = m.b === null
      return {
        torneo_id: torneoId,
        fase: layout.faseInicial,
        jugador_a: a,
        jugador_b: esBye ? null : realDe(m.b),
        ganador: esBye && a ? a : null, // BYE ya conocido avanza solo
        orden: m.orden,
      }
    })
    if (inserts.length) await supabase.from('torneo_partidos').insert(inserts)
  } else {
    // Rellenar solo cupos vacíos de partidos aún no jugados (no pisa arrastres).
    const byOrden = new Map(existentes.map(r => [r.orden, r]))
    for (const m of layout.matches) {
      const row = byOrden.get(m.orden)
      if (!row || llaveFueJugada(row)) continue
      const upd: { jugador_a?: string | null; jugador_b?: string | null; ganador?: string | null } = {}
      const a = realDe(m.a)
      const b = m.b === null ? null : realDe(m.b)
      if (!hayLlavesJugadas) {
        if (row.jugador_a !== a) upd.jugador_a = a
        if (row.jugador_b !== b) upd.jugador_b = b
        const ganadorEsperado = m.b === null && a ? a : null
        if (row.ganador !== ganadorEsperado) upd.ganador = ganadorEsperado
      } else if (row.jugador_a == null) {
        if (a) {
          upd.jugador_a = a
          if (m.b === null) upd.ganador = a // BYE
        }
      }
      if (hayLlavesJugadas && !row.ganador && m.b !== null && row.jugador_b == null) {
        if (b) upd.jugador_b = b
      }
      if (Object.keys(upd).length) await supabase.from('torneo_partidos').update(upd).eq('id', row.id)
    }
  }

  // Marcar clasificados — ambos avanzan al bracket.
  const clasificadosIds = clasificados.flatMap(c => [c.primeroId, c.segundoId])
  if (grupos.length) {
    await supabase.from('grupo_jugadores').update({ clasificado: false }).in('grupo_id', grupos.map(g => g.id))
  }
  if (clasificadosIds.length) {
    await supabase.from('grupo_jugadores').update({ clasificado: true }).in('jugador_id', clasificadosIds)
  }

  // Solo se entra de lleno a playoffs cuando TODOS los grupos cerraron.
  const todosCompletos = clasificados.length === numGrupos
  if (todosCompletos && torneo.fase === 'grupos') {
    await supabase.from('torneos').update({ fase: layout.faseInicial, estado: 'en_curso' }).eq('id', torneoId)
  }

  // Los BYE ya tienen ganador automático. Al cerrar todos los grupos deben
  // ocupar su slot de la fase siguiente igual que un ganador manual.
  if (todosCompletos) {
    const { data: rondaInicial } = await supabase.from('torneo_partidos')
      .select('torneo_id,fase,orden,ganador,jugador_b')
      .eq('torneo_id', torneoId)
      .eq('fase', layout.faseInicial)
      .order('orden')
    for (const partido of rondaInicial || []) {
      if (partido.ganador && !partido.jugador_b) {
        await propagarGanadorPlayoff(supabase, partido, partido.ganador, false)
      }
    }
  }

  return { success: true, faseInicial: layout.faseInicial, todosCompletos }
}

export async function avanzarSiguienteFase(params: {
  torneoId: string
  faseActual: FaseOrden
  ganadores: { id: string; nombre: string }[]
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, faseActual, ganadores } = params

  const { data: torneoRow } = await supabase.from('torneos').select('cabeza_serie_1, cabeza_serie_2').eq('id', torneoId).single()

  const partidosNuevos = generarSiguienteFase(ganadores, faseActual, torneoRow?.cabeza_serie_1, torneoRow?.cabeza_serie_2)
  if (!partidosNuevos.length) return { error: 'No se pudo generar la siguiente fase' }

  const fase = partidosNuevos[0].fase
  const inserts = partidosNuevos.map(p => ({
    torneo_id: torneoId,
    fase: p.fase,
    jugador_a: p.jugadorA,
    jugador_b: p.jugadorB,
    ganador: p.ganador ?? null,
    orden: p.orden,
  }))
  await supabase.from('torneo_partidos').insert(inserts)
  await supabase.from('torneos').update({ fase }).eq('id', torneoId)

  return { success: true, fase }
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

  const torneoId: string = partido.torneo_id ?? partidoId
  const fasePartido = partido.fase as FaseOrden

  const faseSiguiente = siguienteFase(fasePartido)
  if (faseSiguiente) {
    const ordenSiguiente = Math.floor((partido.orden ?? 0) / 2)
    const { data: siguientePartido } = await supabase
      .from('torneo_partidos')
      .select('id, ganador')
      .eq('torneo_id', torneoId)
      .eq('fase', faseSiguiente)
      .eq('orden', ordenSiguiente)
      .maybeSingle()
    if (siguientePartido?.ganador) {
      return { error: 'No se puede cambiar este ganador porque la siguiente llave ya fue jugada. Corrige primero la siguiente fase.' }
    }
  }

  // Limpiar ganador actual y actualizar fase del torneo
  await supabase.from('torneo_partidos').update({ ganador: null }).eq('id', partidoId)
  await supabase.from('torneos').update({ fase: fasePartido }).eq('id', torneoId)

  return marcarGanadorPartido({ partidoId, ganadorId: nuevoGanadorId })
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

  let eliminados = 0
  for (const g of grupos) {
    const { count } = await supabase
      .from('grupo_jugadores')
      .select('jugador_id', { count: 'exact', head: true })
      .eq('grupo_id', g.id)
    if ((count ?? 0) === 0) {
      await supabase.from('torneo_partidos').delete().eq('grupo_id', g.id)
      await supabase.from('torneo_grupos').delete().eq('id', g.id)
      eliminados++
    }
  }

  return { success: true, eliminados }
}

export async function generarGruposTardios(params: {
  torneoId: string
  cabezasDeSerie: string[]
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, cabezasDeSerie } = params

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
  if (llavesJugadas?.some(llaveFueJugada)) {
    return { error: 'No se pueden agregar tardíos porque el bracket ya tiene partidos jugados' }
  }

  const cabezasTardias = [...new Set(cabezasDeSerie.filter(id => jugadores.some(j => j.id === id)))]
  const { data: torneoCabezas } = await supabase.from('torneos')
    .select('cabeza_serie_1,cabeza_serie_2')
    .eq('id', torneoId)
    .single()
  let nuevaCabeza1 = torneoCabezas?.cabeza_serie_1 ?? null
  let nuevaCabeza2 = torneoCabezas?.cabeza_serie_2 ?? null
  for (const id of cabezasTardias) {
    if (id === nuevaCabeza1 || id === nuevaCabeza2) continue
    if (!nuevaCabeza1) nuevaCabeza1 = id
    else if (!nuevaCabeza2) nuevaCabeza2 = id
    else return { error: 'El torneo ya tiene definidos sus dos cabezas de serie principales' }
  }
  const guardarCabezasTardias = async () => {
    if (!cabezasTardias.length) return
    await supabase.from('torneos')
      .update({ cabeza_serie_1: nuevaCabeza1, cabeza_serie_2: nuevaCabeza2 })
      .eq('id', torneoId)
  }
  const reactivarGruposSiHabiaLlaves = async () => {
    if (!llavesJugadas?.length) return
    await supabase.from('torneos').update({ fase: 'grupos', estado: 'en_curso' }).eq('id', torneoId)
  }

  const { data: gruposExistentes } = await supabase
    .from('torneo_grupos').select('id, nombre').eq('torneo_id', torneoId).neq('nombre', 'MESA').order('nombre')

  // 1 jugador: meter en grupo existente con menos integrantes
  if (jugadores.length === 1) {
    const counts = await Promise.all(
      (gruposExistentes || []).map(async g => {
        const { data: gjs } = await supabase.from('grupo_jugadores').select('jugador_id, orden').eq('grupo_id', g.id)
        const ordenados = ordenarMiembros(gjs || [])
        return { id: g.id, nombre: g.nombre ?? '', count: ordenados.length, playerIds: ordenados.map(x => x.jugador_id).filter((id): id is string => !!id) }
      }),
    )
    const disponibles = counts.filter(g => g.count < 4)
    if (disponibles.length) {
      disponibles.sort((a, b) => a.count - b.count)
      const target = disponibles[0]
      await supabase.from('grupo_jugadores').delete().eq('grupo_id', grupoMesa.id)
      await supabase.from('grupo_jugadores').insert({ grupo_id: target.id, jugador_id: jugadores[0].id, orden: target.count })
      const { data: pts } = await supabase.from('torneo_partidos').select('orden').eq('torneo_id', torneoId)
      const maxOrden = (pts || []).reduce((m, p) => Math.max(m, p.orden ?? 0), 0)
      const nuevos = target.playerIds.map((pid, i) => ({
        torneo_id: torneoId, grupo_id: target.id, fase: 'grupos' as const,
        jugador_a: jugadores[0].id, jugador_b: pid, orden: maxOrden + 1 + i,
      }))
      if (nuevos.length) await supabase.from('torneo_partidos').insert(nuevos)
      await guardarCabezasTardias()
      await reactivarGruposSiHabiaLlaves()
      return { success: true, numGrupos: 0, nombres: target.nombre }
    }
  }

  // 2+ jugadores: crear grupo nuevo
  const letrasUsadas = (gruposExistentes || []).map(g => g.nombre ?? '')
  const ultimaLetra = letrasUsadas.sort().pop() || '@'
  const letraBase = ultimaLetra.charCodeAt(0) + 1

  const numGrupos = calcularNumGruposTardios(jugadores.length)
  const nuevosGrupos: { id: string; nombre: string }[] = []
  for (let i = 0; i < numGrupos; i++) {
    const { data: g } = await supabase
      .from('torneo_grupos')
      .insert({ torneo_id: torneoId, nombre: String.fromCharCode(letraBase + i) })
      .select('id, nombre')
      .single()
    if (g) nuevosGrupos.push({ id: g.id, nombre: g.nombre ?? '' })
  }

  const asignaciones = seedingSerpenteo(jugadores, numGrupos, new Set(cabezasDeSerie))
  const ordenPorGrupo = new Map<number, number>()
  const inserts = asignaciones.map(a => {
    const orden = ordenPorGrupo.get(a.grupoIndex) ?? 0
    ordenPorGrupo.set(a.grupoIndex, orden + 1)
    return {
    grupo_id: nuevosGrupos[a.grupoIndex].id,
    jugador_id: a.jugadorId,
    orden,
  }})

  // Mover de MESA a sus nuevos grupos
  await supabase.from('grupo_jugadores').delete().eq('grupo_id', grupoMesa.id)
  await supabase.from('grupo_jugadores').insert(inserts)

  // Generar partidos round robin
  const { data: partidosExistentes } = await supabase
    .from('torneo_partidos').select('orden').eq('torneo_id', torneoId)
  let maxOrden = (partidosExistentes || []).reduce((m, p) => Math.max(m, p.orden ?? 0), 0)

  const partidos: Array<{ torneo_id: string; grupo_id: string; fase: string; jugador_a: string; jugador_b: string; orden: number }> = []
  for (const g of nuevosGrupos) {
    const jugadoresGrupo = inserts.filter(a => a.grupo_id === g.id).sort((a, b) => a.orden - b.orden).map(a => a.jugador_id)
    const parejas = generarRoundRobin(jugadoresGrupo)
    for (const [a, b] of parejas) {
      partidos.push({ torneo_id: torneoId, grupo_id: g.id, fase: 'grupos', jugador_a: a, jugador_b: b, orden: ++maxOrden })
    }
  }
  if (partidos.length) await supabase.from('torneo_partidos').insert(partidos)
  await guardarCabezasTardias()
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

export async function intercambiarJugadores(params: {
  torneoId: string
  slotA: { partidoId: string; posicion: 'jugador_a' | 'jugador_b' }
  slotB: { partidoId: string; posicion: 'jugador_a' | 'jugador_b' }
}): Promise<{ error?: string; success?: boolean }> {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, slotA, slotB } = params
  if (slotA.partidoId === slotB.partidoId && slotA.posicion === slotB.posicion) return { success: true }

  const ids = Array.from(new Set([slotA.partidoId, slotB.partidoId]))
  const { data: ps } = await supabase
    .from('torneo_partidos')
    .select('id, torneo_id, jugador_a, jugador_b, ganador')
    .in('id', ids)
    .eq('torneo_id', torneoId)

  if (!ps || ps.length !== ids.length) return { error: 'Partidos no encontrados' }
  if (ps.some((p) => p.ganador)) return { error: 'No se puede mover jugadores en partidos ya jugados' }

  const pa = ps.find((p) => p.id === slotA.partidoId)
  const pb = ps.find((p) => p.id === slotB.partidoId)
  if (!pa || !pb) return { error: 'Partidos no encontrados' }

  const jugA: string | null = slotA.posicion === 'jugador_a' ? pa.jugador_a : pa.jugador_b
  const jugB: string | null = slotB.posicion === 'jugador_a' ? pb.jugador_a : pb.jugador_b

  if (!jugA || !jugB) return { error: 'Slot sin jugador, no se puede intercambiar' }

  const updateA = slotA.posicion === 'jugador_a' ? { jugador_a: jugB } : { jugador_b: jugB }
  const updateB = slotB.posicion === 'jugador_a' ? { jugador_a: jugA } : { jugador_b: jugA }

  await Promise.all([
    supabase.from('torneo_partidos').update(updateA).eq('id', slotA.partidoId),
    supabase.from('torneo_partidos').update(updateB).eq('id', slotB.partidoId),
  ])

  return { success: true }
}

export async function enviarRecaudacionAFinanzas(params: {
  torneoId: string
  torneoNombre: string
  montoEfectivo: number
  montoTransferencia: number
}) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }

  const total = params.montoEfectivo + params.montoTransferencia
  if (total <= 0) return { error: 'No hay monto a registrar' }

  const { data: existente } = await supabase.from('movimientos').select('id')
    .eq('torneo_id', params.torneoId).eq('categoria', 'inscripcion_torneo').limit(1)
  if (existente && existente.length > 0) {
    return { error: 'Este torneo ya tiene un registro en Finanzas. Para corregirlo, edita el movimiento directamente desde Finanzas.' }
  }

  const fecha = new Date().toISOString().slice(0, 10)
  const movs: any[] = []
  if (params.montoEfectivo > 0) {
    movs.push({ club_id: perfil.club_id, torneo_id: params.torneoId, tipo: 'ingreso', categoria: 'inscripcion_torneo', descripcion: `Inscripción Torneo (efectivo) — ${params.torneoNombre}`, monto: params.montoEfectivo, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
  }
  if (params.montoTransferencia > 0) {
    movs.push({ club_id: perfil.club_id, torneo_id: params.torneoId, tipo: 'ingreso', categoria: 'inscripcion_torneo', descripcion: `Inscripción Torneo (transferencia) — ${params.torneoNombre}`, monto: params.montoTransferencia, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
  }

  const { error: movErr } = await supabase.from('movimientos').insert(movs)
  if (movErr) return { error: 'Error al registrar en Finanzas: ' + movErr.message }

  await supabase.from('torneos').update({ contabilidad_enviada: true }).eq('id', params.torneoId)
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

  const { data: torneo } = await supabase.from('torneos').select('cuota_inscripcion').eq('id', torneoId).single()

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
  montoRecaudado: number
  montoEfectivo?: number
  montoTransferencia?: number
  enviarRecaudacion: boolean
  metodo?: 'efectivo' | 'transferencia'
  gastosGestion?: { tipo: string; monto: number }[]
}) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }

  const via = params.metodo === 'transferencia' ? ' (transferencia)' : ' (efectivo)'

  await supabase.from('torneos').update({ premio_primero: params.primero, premio_segundo: params.segundo, premio_tercero: params.tercero }).eq('id', params.torneoId)

  const fecha = new Date().toISOString().slice(0, 10)
  type Mov = { club_id: string | null; torneo_id: string; tipo: string; categoria: string; descripcion: string; monto: number; fecha: string; registrado_por_nombre: string }
  const movimientos: Mov[] = []

  if (params.enviarRecaudacion && params.montoRecaudado > 0) {
    const efectivo = params.montoEfectivo ?? params.montoRecaudado
    const transferencia = params.montoTransferencia ?? 0
    if (efectivo > 0) movimientos.push({ club_id: perfil.club_id, torneo_id: params.torneoId, tipo: 'ingreso', categoria: 'inscripcion_torneo', descripcion: `Ingreso Torneo (efectivo) — ${params.torneoNombre}`, monto: efectivo, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
    if (transferencia > 0) movimientos.push({ club_id: perfil.club_id, torneo_id: params.torneoId, tipo: 'ingreso', categoria: 'inscripcion_torneo', descripcion: `Ingreso Torneo (transferencia) — ${params.torneoNombre}`, monto: transferencia, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
  }
  if (params.primero) movimientos.push({ club_id: perfil.club_id, torneo_id: params.torneoId, tipo: 'gasto', categoria: 'premio_torneo', descripcion: `Premio 1°${via} — ${params.torneoNombre}`, monto: params.primero, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
  if (params.segundo) movimientos.push({ club_id: perfil.club_id, torneo_id: params.torneoId, tipo: 'gasto', categoria: 'premio_torneo', descripcion: `Premio 2°${via} — ${params.torneoNombre}`, monto: params.segundo, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
  if (params.tercero) movimientos.push({ club_id: perfil.club_id, torneo_id: params.torneoId, tipo: 'gasto', categoria: 'premio_torneo', descripcion: `Premio 3°${via} — ${params.torneoNombre}`, monto: params.tercero, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })

  for (const g of (params.gastosGestion || [])) {
    if (g.monto > 0) movimientos.push({ club_id: perfil.club_id, torneo_id: params.torneoId, tipo: 'gasto', categoria: 'otro_gasto', descripcion: `${g.tipo} — ${params.torneoNombre}`, monto: g.monto, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
  }

  if (movimientos.length) {
    await supabase.from('movimientos').insert(movimientos)
    await supabase.from('torneos').update({ contabilidad_enviada: true }).eq('id', params.torneoId)
  }

  return { success: true }
}
