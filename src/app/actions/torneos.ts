'use server'

import { createClient } from '@/lib/supabase/server'
import { calculateEloChange } from '@/lib/domain/elo'
import {
  seedingSerpenteo,
  generarRoundRobin,
  generarBracketConAvance,
  generarSiguienteFase,
  calcularNumGrupos,
  type JugadorTorneo,
} from '@/lib/domain/torneos'
import { CONFIG, type FaseOrden } from '@/lib/config'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const, supabase: null, perfil: null }
  const { data: perfil } = await supabase.from('perfiles').select('id,club_id,rol,nombre').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'admin') return { error: 'Acceso denegado' as const, supabase: null, perfil: null }
  return { error: null, supabase, perfil }
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

  // Revertir ELO del resultado anterior usando historial
  const jugadoresIds = [anteriorGanadorId, anteriorPerdedorId].filter((id): id is string => !!id)
  const { data: historial } = await supabase
    .from('historial_elo')
    .select('*')
    .eq('torneo_id', torneoIdPartido)
    .in('jugador_id', jugadoresIds)
    .order('created_at', { ascending: false })

  if (historial?.length) {
    const hGanador = historial.find(h => h.jugador_id === anteriorGanadorId)
    const hPerdedor = anteriorPerdedorId ? historial.find(h => h.jugador_id === anteriorPerdedorId) : undefined
    const revertir = []
    if (hGanador) revertir.push(supabase.from('jugadores').update({ elo: hGanador.elo_antes }).eq('id', anteriorGanadorId))
    if (hPerdedor && anteriorPerdedorId) revertir.push(supabase.from('jugadores').update({ elo: hPerdedor.elo_antes }).eq('id', anteriorPerdedorId))
    if (revertir.length) await Promise.all(revertir)
    const idsHistorial = [hGanador?.id, hPerdedor?.id].filter((id): id is string => !!id)
    if (idsHistorial.length) await supabase.from('historial_elo').delete().in('id', idsHistorial)
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
  return marcarGanadorPartido({ partidoId, ganadorId: nuevoGanadorId })
}

export async function marcarGanadorPartido(params: { partidoId: string; ganadorId: string }) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { partidoId, ganadorId } = params

  const { data: partido } = await supabase.from('torneo_partidos').select('*').eq('id', partidoId).single()
  if (!partido) return { error: 'Partido no encontrado' }
  if (partido.ganador) return { error: 'El partido ya tiene ganador' }

  const perdedorId = partido.jugador_a === ganadorId ? partido.jugador_b : partido.jugador_a

  await supabase.from('torneo_partidos').update({ ganador: ganadorId }).eq('id', partidoId)

  if (perdedorId && perdedorId !== ganadorId) {
    const [{ data: g }, { data: p }] = await Promise.all([
      supabase.from('jugadores').select('elo').eq('id', ganadorId).single(),
      supabase.from('jugadores').select('elo').eq('id', perdedorId).single(),
    ])
    if (g && p) {
      const eloGanador = g.elo ?? CONFIG.ELO_INICIAL
      const eloPerdedor = p.elo ?? CONFIG.ELO_INICIAL
      const { newWinnerElo, newLoserElo } = calculateEloChange(eloGanador, eloPerdedor)

      await Promise.all([
        supabase.from('jugadores').update({ elo: newWinnerElo }).eq('id', ganadorId),
        supabase.from('jugadores').update({ elo: newLoserElo }).eq('id', perdedorId),
        supabase.from('historial_elo').insert([
          { jugador_id: ganadorId, club_id: perfil.club_id, torneo_id: partido.torneo_id, elo_antes: eloGanador, elo_despues: newWinnerElo, fecha: new Date().toISOString().slice(0, 10) },
          { jugador_id: perdedorId, club_id: perfil.club_id, torneo_id: partido.torneo_id, elo_antes: eloPerdedor, elo_despues: newLoserElo, fecha: new Date().toISOString().slice(0, 10) },
        ]),
      ])
    }
  }

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

  const { error: moveErr } = await supabase.from('grupo_jugadores')
    .update({ grupo_id: grupoDestinoId })
    .eq('jugador_id', jugadorId).eq('grupo_id', grupoOrigenId)
  if (moveErr) return { error: 'No se pudo mover al jugador' }

  await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId).in('grupo_id', [grupoOrigenId, grupoDestinoId])

  const { data: miembros } = await supabase.from('grupo_jugadores').select('jugador_id, grupo_id').in('grupo_id', [grupoOrigenId, grupoDestinoId])

  const inserts: { torneo_id: string; grupo_id: string; fase: string; jugador_a: string; jugador_b: string; orden: number }[] = []
  for (const gid of [grupoOrigenId, grupoDestinoId]) {
    const idsGrupo = (miembros || []).filter(m => m.grupo_id === gid).map(m => m.jugador_id).filter((id): id is string => !!id)
    const parejas = generarRoundRobin(idsGrupo)
    for (const [a, b] of parejas) {
      inserts.push({ torneo_id: torneoId, grupo_id: gid, fase: 'grupos', jugador_a: a, jugador_b: b, orden: inserts.length })
    }
  }
  if (inserts.length) await supabase.from('torneo_partidos').insert(inserts)

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
    .select('jugador_id, jugadores(id,nombre,elo)')
    .in('grupo_id', grupoIds.length ? grupoIds : ['00000000-0000-0000-0000-000000000000'])

  const jugadores: JugadorTorneo[] = (inscritos || [])
    .map(i => {
      const j = Array.isArray(i.jugadores) ? i.jugadores[0] : i.jugadores
      return j ? { id: j.id, nombre: j.nombre ?? '', elo: j.elo ?? CONFIG.ELO_INICIAL } : null
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
  const inserts = asignaciones.map(a => ({
    grupo_id: nuevosGrupos[a.grupoIndex].id,
    jugador_id: a.jugadorId,
  }))
  await supabase.from('grupo_jugadores').insert(inserts)

  const partidos: Array<{ torneo_id: string; grupo_id: string; fase: string; jugador_a: string; jugador_b: string; orden: number }> = []
  for (const g of nuevosGrupos) {
    const jugadoresGrupo = inserts.filter(a => a.grupo_id === g.id).map(a => a.jugador_id)
    const parejas = generarRoundRobin(jugadoresGrupo)
    for (const [a, b] of parejas) {
      partidos.push({ torneo_id: torneoId, grupo_id: g.id, fase: 'grupos', jugador_a: a, jugador_b: b, orden: partidos.length })
    }
  }
  if (partidos.length) await supabase.from('torneo_partidos').insert(partidos)

  await supabase.from('torneos').update({ fase: 'grupos', inscripcion_abierta: false }).eq('id', torneoId)

  return { success: true, numGrupos }
}

export async function generarPlayoffs(params: {
  torneoId: string
  clasificadosPrimeros: { id: string; nombre: string; elo: number }[]
  clasificadosSegundos: { id: string; nombre: string; elo: number }[]
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, clasificadosPrimeros, clasificadosSegundos } = params

  if (clasificadosPrimeros.length + clasificadosSegundos.length < 2) {
    return { error: 'No hay suficientes clasificados' }
  }

  for (const j of clasificadosPrimeros) {
    await supabase.from('grupo_jugadores').update({ clasificado: true }).eq('jugador_id', j.id)
  }

  const { data: torneoRow } = await supabase.from('torneos').select('cabeza_serie_1, cabeza_serie_2').eq('id', torneoId).single()

  const partidosBracket = generarBracketConAvance(clasificadosPrimeros, clasificadosSegundos, torneoRow?.cabeza_serie_1, torneoRow?.cabeza_serie_2)
  if (!partidosBracket.length) return { error: 'No se pudo generar el bracket' }

  const faseInicial = partidosBracket[0].fase as FaseOrden

  const partidosInsert = partidosBracket.map(p => ({
    torneo_id: torneoId,
    fase: p.fase,
    jugador_a: p.jugadorA,
    jugador_b: p.jugadorB,
    ganador: p.ganador ?? null,
    orden: p.orden,
  }))
  await supabase.from('torneo_partidos').insert(partidosInsert)

  await supabase.from('torneos').update({ fase: faseInicial, estado: 'en_curso' }).eq('id', torneoId)

  return { success: true, fase: faseInicial, byes: partidosBracket.filter(p => !p.jugadorB).length }
}

export async function avanzarSiguienteFase(params: {
  torneoId: string
  faseActual: FaseOrden
  ganadores: { id: string; nombre: string; elo: number }[]
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

  // Borrar partidos de fases posteriores
  const idxFase = CONFIG.FASES_ORDEN.indexOf(fasePartido)
  const fasesPosterrores = CONFIG.FASES_ORDEN.slice(idxFase + 1)
  if (fasesPosterrores.length) {
    await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId).in('fase', fasesPosterrores)
  }

  const anteriorGanadorId: string = partido.ganador
  const anteriorPerdedorId: string | null = anteriorGanadorId === partido.jugador_a ? partido.jugador_b : partido.jugador_a

  // Revertir ELO usando historial
  const jugadoresIds = [anteriorGanadorId, anteriorPerdedorId].filter((id): id is string => !!id)
  const { data: historial } = await supabase
    .from('historial_elo')
    .select('*')
    .eq('torneo_id', torneoId)
    .in('jugador_id', jugadoresIds)
    .order('created_at', { ascending: false })

  if (historial?.length) {
    const hGanador = historial.find(h => h.jugador_id === anteriorGanadorId)
    const hPerdedor = anteriorPerdedorId ? historial.find(h => h.jugador_id === anteriorPerdedorId) : undefined
    const revertir = []
    if (hGanador) revertir.push(supabase.from('jugadores').update({ elo: hGanador.elo_antes }).eq('id', anteriorGanadorId))
    if (hPerdedor && anteriorPerdedorId) revertir.push(supabase.from('jugadores').update({ elo: hPerdedor.elo_antes }).eq('id', anteriorPerdedorId))
    if (revertir.length) await Promise.all(revertir)
    const idsHistorial = [hGanador?.id, hPerdedor?.id].filter((id): id is string => !!id)
    if (idsHistorial.length) await supabase.from('historial_elo').delete().in('id', idsHistorial)
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
  if (torneo.fase === 'grupos' || torneo.fase === 'inscripcion') {
    return { error: 'El torneo ya está en fase de grupos' }
  }

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

  await supabase.from('torneos').update({ estado: 'finalizado', fase: 'finalizado' }).eq('id', params.torneoId)
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

export async function inscribirJugadorTardio(params: {
  torneoId: string
  jugadorId: string
  jugadorElo: number
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, jugadorId, jugadorElo } = params

  const { data: gruposReales } = await supabase
    .from('torneo_grupos')
    .select('id, nombre')
    .eq('torneo_id', torneoId)
    .neq('nombre', 'MESA')

  if (!gruposReales?.length) return { error: 'No hay grupos generados todavía' }

  const groupsInfo = await Promise.all(
    gruposReales.map(async g => {
      const { data: gjs } = await supabase
        .from('grupo_jugadores')
        .select('jugador_id, jugadores(elo)')
        .eq('grupo_id', g.id)
      const lista = gjs || []
      const elos = lista.map(gj => {
        const j = Array.isArray(gj.jugadores) ? gj.jugadores[0] : gj.jugadores
        return j?.elo ?? CONFIG.ELO_INICIAL
      })
      const avgElo = elos.length ? elos.reduce((a, b) => a + b, 0) / elos.length : CONFIG.ELO_INICIAL
      const playerIds = lista.map(gj => gj.jugador_id).filter((id): id is string => !!id)
      return { id: g.id, nombre: g.nombre ?? '', count: lista.length, avgElo, playerIds }
    }),
  )

  if (groupsInfo.some(g => g.playerIds.includes(jugadorId))) {
    return { error: 'El jugador ya está inscrito en este torneo' }
  }

  const disponibles = groupsInfo.filter(g => g.count < 4)
  if (!disponibles.length) return { error: 'Todos los grupos están llenos (máx 4 jugadores)' }

  disponibles.sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count
    return Math.abs(a.avgElo - jugadorElo) - Math.abs(b.avgElo - jugadorElo)
  })
  const target = disponibles[0]

  await supabase.from('grupo_jugadores').insert({ grupo_id: target.id, jugador_id: jugadorId })

  const { data: partidosExistentes } = await supabase
    .from('torneo_partidos')
    .select('orden')
    .eq('torneo_id', torneoId)
  const maxOrden = (partidosExistentes || []).reduce((m, p) => Math.max(m, p.orden ?? 0), 0)

  const nuevosPartidos = target.playerIds.map((pid, i) => ({
    torneo_id: torneoId,
    grupo_id: target.id,
    fase: 'grupos',
    jugador_a: jugadorId,
    jugador_b: pid,
    orden: maxOrden + 1 + i,
  }))
  if (nuevosPartidos.length) await supabase.from('torneo_partidos').insert(nuevosPartidos)

  return { success: true, grupoNombre: target.nombre }
}

export async function actualizarEstadoPago(params: {
  torneoId: string
  jugadorId: string
  estado: 'pagado' | 'pendiente'
  metodoPago?: string
}) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, jugadorId, estado, metodoPago } = params
  const fechaPago = estado === 'pagado' ? new Date().toISOString().slice(0, 10) : null

  const { data: existing } = await supabase
    .from('torneo_pagos')
    .select('id')
    .eq('torneo_id', torneoId)
    .eq('jugador_id', jugadorId)
    .maybeSingle()

  if (existing) {
    const update: { estado: string; fecha_pago: string | null; metodo_pago?: string } = {
      estado,
      fecha_pago: fechaPago,
    }
    if (metodoPago) update.metodo_pago = metodoPago
    await supabase.from('torneo_pagos').update(update).eq('id', existing.id)
  } else {
    await supabase.from('torneo_pagos').insert({
      torneo_id: torneoId,
      jugador_id: jugadorId,
      estado,
      metodo_pago: metodoPago || 'efectivo',
      fecha_pago: fechaPago,
    })
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
  if (ps.some((p: any) => p.ganador)) return { error: 'No se puede mover jugadores en partidos ya jugados' }

  const pa = ps.find((p: any) => p.id === slotA.partidoId)
  const pb = ps.find((p: any) => p.id === slotB.partidoId)
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
  monto: number
}) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }

  await supabase.from('movimientos').insert({
    club_id: perfil.club_id,
    tipo: 'ingreso',
    categoria: 'inscripcion_torneo',
    descripcion: `Ingreso Torneo — ${params.torneoNombre}`,
    monto: params.monto,
    fecha: new Date().toISOString().slice(0, 10),
    registrado_por_nombre: perfil.nombre || 'Admin',
  })
  await supabase.from('torneos').update({ contabilidad_enviada: true }).eq('id', params.torneoId)

  return { success: true }
}

export async function inscribirEnMesa(params: {
  torneoId: string
  busqueda: string
  rut: string
  metodoPago: string
}) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId, busqueda, rut, metodoPago } = params
  const nombreBuscado = busqueda.trim()
  if (!nombreBuscado) return { error: 'Nombre vacío' }
  if (!perfil.club_id) return { error: 'Perfil sin club asignado' }

  const { data: torneo } = await supabase.from('torneos').select('cuota_inscripcion').eq('id', torneoId).single()

  const { data: jugsExistentes } = await supabase
    .from('jugadores').select('id,nombre,elo')
    .ilike('nombre', `%${nombreBuscado}%`)
    .eq('club_id', perfil.club_id)

  let jugadorId: string
  let jugadorElo = 1200
  let jugadorNombre = nombreBuscado

  if (jugsExistentes?.length) {
    const jug = jugsExistentes[0]
    jugadorId = jug.id
    jugadorElo = jug.elo ?? 1200
    jugadorNombre = jug.nombre ?? jugadorNombre
  } else {
    const { data: nuevo } = await supabase.from('jugadores').insert({
      club_id: perfil.club_id, nombre: nombreBuscado,
      rut: rut || null, categoria: 'principiante', sesiones_limite: 0, elo: 1200,
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
    await supabase.from('torneo_pagos').insert({ torneo_id: torneoId, jugador_id: jugadorId, estado: 'pendiente', metodo_pago: metodoPago })
  }

  return { success: true, jugadorId, jugadorNombre, jugadorElo }
}

export async function eliminarTorneo(params: { torneoId: string }) {
  const { error: authErr, supabase } = await requireAdmin()
  if (authErr) return { error: authErr }

  const { torneoId } = params

  const { data: grupos } = await supabase
    .from('torneo_grupos').select('id').eq('torneo_id', torneoId)
  const grupoIds = (grupos || []).map(g => g.id)

  await supabase.from('historial_elo').delete().eq('torneo_id', torneoId)
  if (grupoIds.length) await supabase.from('grupo_jugadores').delete().in('grupo_id', grupoIds)
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
  enviarRecaudacion: boolean
}) {
  const { error: authErr, supabase, perfil } = await requireAdmin()
  if (authErr) return { error: authErr }

  await supabase.from('torneos').update({ premio_primero: params.primero, premio_segundo: params.segundo, premio_tercero: params.tercero, contabilidad_enviada: true }).eq('id', params.torneoId)

  const fecha = new Date().toISOString().slice(0, 10)
  type Mov = { club_id: string | null; tipo: string; categoria: string; descripcion: string; monto: number; fecha: string; registrado_por_nombre: string }
  const movimientos: Mov[] = []

  if (params.enviarRecaudacion && params.montoRecaudado > 0) {
    movimientos.push({ club_id: perfil.club_id, tipo: 'ingreso', categoria: 'inscripcion_torneo', descripcion: `Ingreso Torneo — ${params.torneoNombre}`, monto: params.montoRecaudado, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
  }
  if (params.primero) movimientos.push({ club_id: perfil.club_id, tipo: 'gasto', categoria: 'premio_torneo', descripcion: `Premio 1° — ${params.torneoNombre}`, monto: params.primero, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
  if (params.segundo) movimientos.push({ club_id: perfil.club_id, tipo: 'gasto', categoria: 'premio_torneo', descripcion: `Premio 2° — ${params.torneoNombre}`, monto: params.segundo, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })
  if (params.tercero) movimientos.push({ club_id: perfil.club_id, tipo: 'gasto', categoria: 'premio_torneo', descripcion: `Premio 3° — ${params.torneoNombre}`, monto: params.tercero, fecha, registrado_por_nombre: perfil.nombre || 'Admin' })

  if (movimientos.length) await supabase.from('movimientos').insert(movimientos)

  return { success: true }
}
