// Simula 3 torneos completos (20, 25 y 30 jugadores) de punta a punta —
// grupos, cierre escalonado, armado de bracket en paralelo, cabezas de
// serie elegidas por skill real, inscripción tardía (en el de 30) y avance
// del árbol hasta el campeón — para verificar el cambio de "bracket
// paralelo" sin depender de clicks manuales en la UI.
//
// Reimplementa aquí el ORQUESTADOR de sincronizarLlaves/propagarGanadorPlayoff
// (src/app/actions/torneos.ts) porque esas son Server Actions y necesitan una
// sesión HTTP real (ver comentario de scripts/seed-torneos-prueba.mjs). La
// parte que sí importa fielmente desde el código real es el ALGORITMO de
// sembrado/layout (construirLlavesLayoutNumerado, seedingSerpenteo, etc. en
// src/lib/domain/torneos.ts) para no probar una reimplementación distinta.
//
// Diseño de verificación: cada jugador tiene un "skill" global único (menor
// número = más fuerte) y todo resultado respeta ese orden estricto (sin
// empates posibles dentro de un grupo). Las cabezas de serie 1 y 2 son los
// dos jugadores globalmente más fuertes, así que SIEMPRE ganan todos sus
// partidos — si el sembrado separa bien #1 y #2, la final es
// obligatoriamente cabeza1 vs cabeza2. Si se cruzan antes, hay un bug real.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import {
  calcularNumGrupos, calcularNumGruposTardios, nombreGrupo, seedingSerpenteo,
  generarRoundRobin, calcularStatsGrupo, siguienteFase, construirLlavesLayoutNumerado,
} from '../src/lib/domain/torneos.ts'
import { CONFIG } from '../src/lib/config.ts'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((linea) => linea.includes('='))
    .map((linea) => {
      const indice = linea.indexOf('=')
      return [linea.slice(0, indice).trim(), linea.slice(indice + 1).trim()]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CLUB_NOMBRE = 'Club de Prueba'

const NOMBRES = ['Mateo', 'Sofía', 'Benjamín', 'Isidora', 'Vicente', 'Emilia', 'Agustín', 'Martina', 'Joaquín', 'Antonia', 'Diego', 'Josefa', 'Tomás', 'Florencia', 'Cristóbal', 'Valentina', 'Felipe', 'Catalina', 'Ignacio', 'Amanda', 'Lucas', 'Trinidad', 'Gaspar', 'Constanza', 'Bastián', 'Renata', 'Maximiliano', 'Fernanda', 'Bruno', 'Javiera', 'Simón', 'Rocío', 'Álvaro', 'Millaray', 'Nicolás']
const APELLIDOS = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela', 'Reyes', 'Vergara', 'Castro', 'Bravo']

let nombreSeq = 0
function nombreUnico() {
  const n = NOMBRES[nombreSeq % NOMBRES.length]
  const a = APELLIDOS[Math.floor(nombreSeq / NOMBRES.length) % APELLIDOS.length]
  nombreSeq++
  return `${n} ${a}`
}

// ─── Puertos de la lógica de servidor (ver src/app/actions/torneos.ts) ──────

async function leerCabezasSerie(torneoId) {
  const { data } = await supabase.from('torneo_cabezas_serie').select('jugador_id,numero').eq('torneo_id', torneoId).order('numero')
  return (data || []).map(c => ({ jugadorId: c.jugador_id, numero: c.numero }))
}

async function calcularClasificadosDesdeBD(torneoId) {
  const { data: grupos } = await supabase.from('torneo_grupos').select('id,nombre').eq('torneo_id', torneoId).neq('nombre', 'MESA')
  if (!grupos?.length) return []
  const grupoIds = grupos.map(g => g.id)
  const [{ data: miembros }, { data: partidos }] = await Promise.all([
    supabase.from('grupo_jugadores').select('grupo_id,jugador_id,orden').in('grupo_id', grupoIds),
    supabase.from('torneo_partidos').select('grupo_id,jugador_a,jugador_b,ganador').eq('torneo_id', torneoId).eq('fase', 'grupos').in('grupo_id', grupoIds),
  ])
  const clasificados = []
  for (const grupo of grupos) {
    const jugadoresGrupo = (miembros || []).filter(m => m.grupo_id === grupo.id)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map(m => ({ id: m.jugador_id, nombre: '' }))
    const partidosGrupo = (partidos || []).filter(p => p.grupo_id === grupo.id)
    if (jugadoresGrupo.length < 2 || partidosGrupo.length === 0 || partidosGrupo.some(p => !p.jugador_a || !p.jugador_b || !p.ganador)) continue
    const { stats, hayTripleEmpate } = calcularStatsGrupo(jugadoresGrupo, partidosGrupo.map(p => ({ jugadorA: p.jugador_a, jugadorB: p.jugador_b, ganador: p.ganador })))
    if (hayTripleEmpate) throw new Error(`Triple empate inesperado en grupo ${grupo.nombre} (no debería pasar con skill estricto)`)
    clasificados.push({ grupoId: grupo.id, primeroId: stats[0].jugadorId, segundoId: stats[1].jugadorId })
  }
  return clasificados
}

function llaveFueJugada(p) { return !!p.ganador && !!p.jugador_b }

async function propagarGanadorPlayoff(partido, ganadorId) {
  if (!partido.torneo_id || !partido.fase || partido.fase === 'grupos') return
  const faseSiguiente = siguienteFase(partido.fase)
  if (!faseSiguiente) return
  const ordenSiguiente = Math.floor((partido.orden ?? 0) / 2)
  const slotGanador = (partido.orden ?? 0) % 2 === 0 ? 'jugador_a' : 'jugador_b'
  const { data: existentes } = await supabase.from('torneo_partidos')
    .select('id,jugador_a,jugador_b,ganador').eq('torneo_id', partido.torneo_id)
    .eq('fase', faseSiguiente).eq('orden', ordenSiguiente).order('creado_en', { ascending: true }).limit(1)
  const existente = existentes?.[0]
  if (existente) {
    if (!existente.ganador && existente[slotGanador] !== ganadorId) {
      await supabase.from('torneo_partidos').update({ [slotGanador]: ganadorId }).eq('id', existente.id)
    }
  } else {
    await supabase.from('torneo_partidos').insert({
      torneo_id: partido.torneo_id, fase: faseSiguiente, orden: ordenSiguiente,
      jugador_a: slotGanador === 'jugador_a' ? ganadorId : null,
      jugador_b: slotGanador === 'jugador_b' ? ganadorId : null,
      ganador: null,
    })
  }
}

async function avanzarFaseSiEstaCompleta(partido) {
  if (!partido.torneo_id || !partido.fase || partido.fase === 'grupos') return
  const faseSiguiente = siguienteFase(partido.fase)
  if (!faseSiguiente) return
  const { data: ronda } = await supabase.from('torneo_partidos').select('ganador').eq('torneo_id', partido.torneo_id).eq('fase', partido.fase)
  if (!ronda?.length || ronda.some(p => !p.ganador)) return
  await supabase.from('torneos').update({ fase: faseSiguiente }).eq('id', partido.torneo_id).eq('fase', partido.fase)
}

async function sincronizarLlaves(torneoId) {
  const clasificados = await calcularClasificadosDesdeBD(torneoId)
  const { data: torneo } = await supabase.from('torneos').select('fase').eq('id', torneoId).single()
  const cabezas = await leerCabezasSerie(torneoId)
  const { data: gruposRaw } = await supabase.from('torneo_grupos').select('id,nombre,orden,en_preparacion')
    .eq('torneo_id', torneoId).neq('nombre', 'MESA').order('orden', { nullsFirst: false }).order('nombre')
  const grupos = gruposRaw || []
  const numGrupos = grupos.length
  if (numGrupos < 2) return { error: 'Se requieren al menos 2 grupos' }
  const todosCompletos = clasificados.length === numGrupos
  const idxByGrupoId = new Map(grupos.map((g, i) => [g.id, i]))
  const { data: miembros } = await supabase.from('grupo_jugadores').select('jugador_id,grupo_id').in('grupo_id', grupos.map(g => g.id))
  const grupoIdDeCabeza = new Map(cabezas.map(c => [c.jugadorId, (miembros || []).find(m => m.jugador_id === c.jugadorId)?.grupo_id]))

  const slotDe = (jid) => {
    if (!jid) return null
    const clasificado = clasificados.find(c => c.primeroId === jid || c.segundoId === jid)
    if (clasificado) {
      const grupoIdx = idxByGrupoId.get(clasificado.grupoId)
      return grupoIdx == null ? null : { grupoIdx, pos: clasificado.primeroId === jid ? 1 : 2 }
    }
    const grupoId = grupoIdDeCabeza.get(jid)
    const grupoIdx = grupoId ? idxByGrupoId.get(grupoId) : null
    return grupoIdx == null ? null : { grupoIdx, pos: 1 }
  }
  const cabezasSlots = cabezas.map(c => {
    const s = slotDe(c.jugadorId)
    return s ? { ...s, numero: c.numero } : null
  }).filter(Boolean)

  const { data: bracketExistente } = await supabase.from('torneo_partidos')
    .select('id,fase,orden,ganador,jugador_a,jugador_b,slot_a_grupo_id,slot_a_posicion,slot_b_grupo_id,slot_b_posicion')
    .eq('torneo_id', torneoId).neq('fase', 'grupos')
  const gruposListosIdx = clasificados.map(c => idxByGrupoId.get(c.grupoId)).filter(i => i != null)
  const layout = construirLlavesLayoutNumerado(numGrupos, cabezasSlots, gruposListosIdx)
  if (!layout.matches.length) return { error: 'No se pudo construir un bracket válido' }

  const hayLlavesJugadas = !!bracketExistente?.some(llaveFueJugada)
  const inicialesExistentes = (bracketExistente || []).filter(p => p.fase === layout.faseInicial)
  const metadataCompleta = inicialesExistentes.length === layout.matches.length && inicialesExistentes.every(p =>
    !!p.slot_a_grupo_id && (p.slot_a_posicion === 1 || p.slot_a_posicion === 2) &&
    ((!p.slot_b_grupo_id && p.slot_b_posicion == null) || (!!p.slot_b_grupo_id && (p.slot_b_posicion === 1 || p.slot_b_posicion === 2))),
  )
  const porOrdenInicial = new Map(inicialesExistentes.map(p => [p.orden, p]))
  const coincideConLayout = metadataCompleta && layout.matches.every(m => {
    const row = porOrdenInicial.get(m.orden)
    if (!row) return false
    const grupoA = m.a ? grupos[m.a.grupoIdx]?.id ?? null : null
    const grupoB = m.b ? grupos[m.b.grupoIdx]?.id ?? null : null
    return row.slot_a_grupo_id === grupoA && row.slot_a_posicion === (m.a?.pos ?? null) &&
      row.slot_b_grupo_id === grupoB && row.slot_b_posicion === (m.b?.pos ?? null)
  })
  if (bracketExistente?.length && !metadataCompleta && hayLlavesJugadas) return { error: 'Bracket incompleto no reconstruible' }
  const debeReconstruir = !!bracketExistente?.length && !hayLlavesJugadas && (!metadataCompleta || !coincideConLayout)
  if (debeReconstruir) {
    await supabase.from('torneo_partidos').delete().eq('torneo_id', torneoId).neq('fase', 'grupos')
  }

  const realDe = (grupoId, pos) => {
    if (!grupoId || (pos !== 1 && pos !== 2)) return null
    const c = clasificados.find(x => x.grupoId === grupoId)
    if (!c) return null
    return pos === 1 ? c.primeroId : c.segundoId
  }

  const { data: existentes } = await supabase.from('torneo_partidos')
    .select('id,orden,jugador_a,jugador_b,ganador,slot_a_grupo_id,slot_a_posicion,slot_b_grupo_id,slot_b_posicion')
    .eq('torneo_id', torneoId).eq('fase', layout.faseInicial)

  if (!existentes || existentes.length === 0) {
    const inserts = layout.matches.map(m => {
      const grupoA = m.a ? grupos[m.a.grupoIdx]?.id ?? null : null
      const grupoB = m.b ? grupos[m.b.grupoIdx]?.id ?? null : null
      const a = realDe(grupoA, m.a?.pos)
      const esBye = m.b === null
      return {
        torneo_id: torneoId, fase: layout.faseInicial, jugador_a: a,
        jugador_b: esBye ? null : realDe(grupoB, m.b?.pos),
        ganador: esBye && a ? a : null, orden: m.orden,
        slot_a_grupo_id: grupoA, slot_a_posicion: m.a?.pos ?? null,
        slot_b_grupo_id: grupoB, slot_b_posicion: m.b?.pos ?? null,
      }
    })
    if (inserts.length) await supabase.from('torneo_partidos').insert(inserts)
  } else {
    const byOrden = new Map(existentes.map(r => [r.orden, r]))
    for (const m of layout.matches) {
      const row = byOrden.get(m.orden)
      if (!row || llaveFueJugada(row)) continue
      const fallbackA = m.a ? grupos[m.a.grupoIdx]?.id ?? null : null
      const fallbackB = m.b ? grupos[m.b.grupoIdx]?.id ?? null : null
      const grupoA = row.slot_a_grupo_id ?? fallbackA
      const posA = row.slot_a_posicion ?? m.a?.pos
      const grupoB = row.slot_b_grupo_id ?? fallbackB
      const posB = row.slot_b_posicion ?? m.b?.pos
      const a = realDe(grupoA, posA)
      const esBye = !grupoB || !posB
      const b = esBye ? null : realDe(grupoB, posB)
      const upd = {}
      if (row.jugador_a !== a) upd.jugador_a = a
      if (row.jugador_b !== b) upd.jugador_b = b
      const ganadorEsperado = esBye && a ? a : null
      if (row.ganador !== ganadorEsperado) upd.ganador = ganadorEsperado
      if (Object.keys(upd).length) await supabase.from('torneo_partidos').update(upd).eq('id', row.id)
    }
  }

  const clasificadosIds = clasificados.flatMap(c => [c.primeroId, c.segundoId])
  if (grupos.length) await supabase.from('grupo_jugadores').update({ clasificado: false }).in('grupo_id', grupos.map(g => g.id))
  if (clasificadosIds.length) await supabase.from('grupo_jugadores').update({ clasificado: true }).in('grupo_id', grupos.map(g => g.id)).in('jugador_id', clasificadosIds)

  const { data: rondaInicial } = await supabase.from('torneo_partidos')
    .select('torneo_id,fase,orden,ganador,jugador_b').eq('torneo_id', torneoId).eq('fase', layout.faseInicial).order('orden')
  const byesConGanador = (rondaInicial || []).filter(p => p.ganador && !p.jugador_b)
  for (const p of byesConGanador) await propagarGanadorPlayoff(p, p.ganador)

  if (todosCompletos && torneo.fase === 'grupos') {
    const { data: rondasPlayoff } = await supabase.from('torneo_partidos').select('fase,ganador').eq('torneo_id', torneoId).neq('fase', 'grupos')
    const desde = CONFIG.FASES_ORDEN.indexOf(layout.faseInicial)
    let faseObjetivo = layout.faseInicial
    for (const fase of CONFIG.FASES_ORDEN.slice(Math.max(0, desde))) {
      const ronda = (rondasPlayoff || []).filter(p => p.fase === fase)
      if (!ronda.length) break
      faseObjetivo = fase
      if (ronda.some(p => !p.ganador)) break
    }
    await supabase.from('torneos').update({ fase: faseObjetivo, estado: 'en_curso' }).eq('id', torneoId)
  }
  return { success: true, faseInicial: layout.faseInicial, todosCompletos }
}

async function marcarGanador(partido, ganadorId) {
  await supabase.from('torneo_partidos').update({ ganador: ganadorId }).eq('id', partido.id)
  if (partido.fase !== 'grupos') {
    await propagarGanadorPlayoff(partido, ganadorId)
    await avanzarFaseSiEstaCompleta(partido)
  }
}

// Marca el ganador (más fuerte según skill) de todo partido de bracket que ya
// tenga sus dos jugadores resueltos y aún no tenga ganador. Repite hasta que
// no queden más listos (una victoria puede habilitar la siguiente ronda).
async function jugarBracketListo(torneoId, skillDe) {
  let jugados = 0
  for (;;) {
    const { data: partidos } = await supabase.from('torneo_partidos')
      .select('id,torneo_id,fase,orden,jugador_a,jugador_b,ganador')
      .eq('torneo_id', torneoId).neq('fase', 'grupos').is('ganador', null)
      .not('jugador_a', 'is', null).not('jugador_b', 'is', null)
    if (!partidos?.length) break
    for (const p of partidos) {
      const ganador = skillDe.get(p.jugador_a) < skillDe.get(p.jugador_b) ? p.jugador_a : p.jugador_b
      await marcarGanador(p, ganador)
      jugados++
    }
  }
  return jugados
}

// ─── Armado de un torneo completo ────────────────────────────────────────

async function crearJugadores(clubId, cantidad) {
  const { data, error } = await supabase.from('jugadores').insert(
    Array.from({ length: cantidad }, () => ({
      club_id: clubId, nombre: nombreUnico(), categoria: 'principiante',
      sesiones_usadas: 0, sesiones_limite: 0, estado: 'activo', es_externo: true,
    })),
  ).select('id,nombre')
  if (error) throw error
  return data
}

async function crearGrupoConPartidos(torneoId, nombre, orden, jugadorIds) {
  const { data: grupo, error } = await supabase.from('torneo_grupos')
    .insert({ torneo_id: torneoId, nombre, orden }).select('id').single()
  if (error) throw error
  const miembros = jugadorIds.map((id, i) => ({ grupo_id: grupo.id, jugador_id: id, orden: i }))
  await supabase.from('grupo_jugadores').insert(miembros)
  const partidos = generarRoundRobin(jugadorIds).map(([a, b], i) => ({
    torneo_id: torneoId, grupo_id: grupo.id, fase: 'grupos', jugador_a: a, jugador_b: b, orden: i,
  }))
  if (partidos.length) await supabase.from('torneo_partidos').insert(partidos)
  return grupo.id
}

async function jugarGrupoCompleto(grupoId, skillDe) {
  const { data: partidos } = await supabase.from('torneo_partidos').select('id,jugador_a,jugador_b,ganador').eq('grupo_id', grupoId).eq('fase', 'grupos')
  for (const p of partidos) {
    if (p.ganador) continue
    const ganador = skillDe.get(p.jugador_a) < skillDe.get(p.jugador_b) ? p.jugador_a : p.jugador_b
    await supabase.from('torneo_partidos').update({ ganador }).eq('id', p.id)
  }
}

async function simularTorneo({ nombre, numJugadores, lateEnGrupoIndex }) {
  console.log(`\n=== ${nombre} (${numJugadores} jugadores) ===`)
  const { data: clubes } = await supabase.from('clubes').select('id').eq('nombre', CLUB_NOMBRE)
  const clubId = clubes[0].id

  const { data: torneo, error: torneoError } = await supabase.from('torneos').insert({
    club_id: clubId, nombre, formato: 'grupos', estado: 'en_curso', fase: 'grupos',
    fecha_inicio: new Date().toISOString().slice(0, 10), cuota_inscripcion: 0, precio_entrada: 0,
    inscripcion_abierta: false,
  }).select('id').single()
  if (torneoError) throw torneoError
  const torneoId = torneo.id

  const jugadores = await crearJugadores(clubId, numJugadores)
  // skill = índice de creación (0 = el más fuerte del torneo). Resultado
  // siempre determinado por skill, sin empates posibles.
  const skillDe = new Map(jugadores.map((j, i) => [j.id, i]))

  const NUM_CABEZAS = 4
  const cabezas = jugadores.slice(0, NUM_CABEZAS)
  console.log(`Cabezas de serie elegidas (las ${NUM_CABEZAS} más fuertes): ${cabezas.map((c, i) => `#${i + 1} ${c.nombre}`).join(', ')}`)
  await supabase.from('torneo_cabezas_serie').insert(cabezas.map((c, i) => ({ torneo_id: torneoId, jugador_id: c.id, numero: i + 1 })))

  const numGrupos = calcularNumGrupos(numJugadores, CONFIG.TORNEO_JUGADORES_POR_GRUPO)
  const asignaciones = seedingSerpenteo(jugadores, numGrupos, cabezas.map(c => c.id))
  const porGrupo = new Map()
  for (const a of asignaciones) {
    if (!porGrupo.has(a.grupoIndex)) porGrupo.set(a.grupoIndex, [])
    porGrupo.get(a.grupoIndex).push(a.jugadorId)
  }
  const grupoIds = []
  for (let i = 0; i < numGrupos; i++) {
    grupoIds.push(await crearGrupoConPartidos(torneoId, nombreGrupo(i), i, porGrupo.get(i) || []))
  }
  console.log(`${numGrupos} grupos armados (serpentina, cabezas separadas).`)

  // ── Cierre escalonado + armado en paralelo ──────────────────────────────
  // Cierra los grupos de a uno (en vez de todos de golpe) y sincroniza tras
  // cada cierre — así se prueba justo lo que se pidió: que el bracket se
  // arme y se pueda ir jugando sin esperar a que terminen todos los grupos.
  let gruposCerrados = 0
  for (let i = 0; i < grupoIds.length; i++) {
    // El torneo de 30 mete jugadores tardíos a mitad de camino, antes de que
    // se juegue ninguna llave de verdad — para probar que la inscripción
    // tardía sigue abierta con el esqueleto ya armado.
    if (lateEnGrupoIndex != null && i === lateEnGrupoIndex) {
      const nuevos = await crearJugadores(clubId, 3)
      nuevos.forEach((j, k) => skillDe.set(j.id, 1000 + k)) // los más débiles del torneo
      const numGruposTardios = calcularNumGruposTardios(nuevos.length)
      console.log(`  ↳ Llegan ${nuevos.length} jugadores tardíos (${nuevos.map(j => j.nombre).join(', ')}) → ${numGruposTardios} grupo(s) nuevo(s)`)
      const asignTardios = seedingSerpenteo(nuevos, numGruposTardios, [])
      const porGrupoTardio = new Map()
      for (const a of asignTardios) {
        if (!porGrupoTardio.has(a.grupoIndex)) porGrupoTardio.set(a.grupoIndex, [])
        porGrupoTardio.get(a.grupoIndex).push(a.jugadorId)
      }
      for (let gi = 0; gi < numGruposTardios; gi++) {
        const nuevoGrupoId = await crearGrupoConPartidos(torneoId, nombreGrupo(grupoIds.length), grupoIds.length, porGrupoTardio.get(gi) || [])
        grupoIds.push(nuevoGrupoId)
      }
      const syncTrasTardios = await sincronizarLlaves(torneoId)
      console.log(`  ↳ sincronizarLlaves tras agregar tardíos: ${JSON.stringify(syncTrasTardios)}`)
    }

    await jugarGrupoCompleto(grupoIds[i], skillDe)
    gruposCerrados++
    const res = await sincronizarLlaves(torneoId)
    const jugadosAhora = await jugarBracketListo(torneoId, skillDe)
    console.log(`  Grupo ${i + 1}/${grupoIds.length} cerrado → sync:${res.error ? 'ERROR ' + res.error : 'ok'} (faseInicial=${res.faseInicial ?? '-'}) → ${jugadosAhora} partido(s) de bracket jugados en paralelo`)
  }

  // Por si quedó algo pendiente (BYEs/última propagación) tras el último cierre.
  await sincronizarLlaves(torneoId)
  const jugadosFinal = await jugarBracketListo(torneoId, skillDe)
  if (jugadosFinal) console.log(`  Partidos de bracket adicionales tras el último cierre: ${jugadosFinal}`)

  const { data: finalRow } = await supabase.from('torneo_partidos').select('ganador,jugador_a,jugador_b').eq('torneo_id', torneoId).eq('fase', 'final').maybeSingle()
  const nombrePorId = new Map(jugadores.map(j => [j.id, j.nombre]))
  // los del grupo tardío no están en `jugadores`; recárgalos si hace falta
  if (finalRow) {
    for (const id of [finalRow.jugador_a, finalRow.jugador_b, finalRow.ganador]) {
      if (id && !nombrePorId.has(id)) {
        const { data: j } = await supabase.from('jugadores').select('nombre').eq('id', id).single()
        if (j) nombrePorId.set(id, j.nombre)
      }
    }
  }
  const campeonId = finalRow?.ganador
  const esperado = cabezas[0].id // el globalmente más fuerte nunca pierde
  const rivalFinalId = finalRow ? (finalRow.jugador_a === campeonId ? finalRow.jugador_b : finalRow.jugador_a) : null
  const finalEsperada = rivalFinalId === cabezas[1].id

  console.log(`Campeón: ${nombrePorId.get(campeonId) ?? '???'} ${campeonId === esperado ? '✓ (era el favorito absoluto)' : '✗ INESPERADO — revisar'}`)
  console.log(`Rival en la final: ${nombrePorId.get(rivalFinalId) ?? '???'} ${finalEsperada ? '✓ (cabeza #2, como debía ser)' : '⚠️ no fue la cabeza #2 — revisar separación de sembrados'}`)

  return { torneoId, nombre, ok: campeonId === esperado && finalEsperada }
}

async function main() {
  const resultados = []
  resultados.push(await simularTorneo({ nombre: 'Simulación 20 jugadores', numJugadores: 20 }))
  resultados.push(await simularTorneo({ nombre: 'Simulación 25 jugadores', numJugadores: 25 }))
  resultados.push(await simularTorneo({ nombre: 'Simulación 30 jugadores (con tardíos)', numJugadores: 30, lateEnGrupoIndex: 4 }))

  console.log('\n=== RESUMEN ===')
  for (const r of resultados) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.nombre} — torneo_id=${r.torneoId}`)
  }
  if (resultados.every(r => r.ok)) console.log('\nTodo consistente: seeding, avance en paralelo e inscripción tardía funcionaron en los 3 casos.')
  else console.log('\nHay al menos un caso inesperado — revisar arriba.')
}

main().catch(e => { console.error(e); process.exit(1) })
