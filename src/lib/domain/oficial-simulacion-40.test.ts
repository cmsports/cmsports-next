/**
 * Simulación dominio N≈40 para torneo oficial (ITTF):
 * grupos → clasificación → cuadro → programación de mesas.
 * No toca Supabase; detecta mañas de escala antes de UI/DB.
 */
import { describe, expect, it } from 'vitest'
import {
  construirLlavesLayoutNumerado,
  nombreGrupo,
  seedingSerpenteoConClubes,
  type JugadorTorneo,
} from './torneos'
import {
  calcularNumGruposOficial,
  clasificarGrupoIttf,
  ordenPartidosGrupoIttf,
  tamanosGruposOficial,
  type PartidoOficialStats,
} from './oficial-ittf'
import {
  aplicarModoSorteoLlave,
  asignarNumerosIttf,
  resumenSiembraCuadro,
} from './oficial-sorteo'
import {
  detectarConflictosPrograma,
  prioridadPartidoOficial,
  programarPartidosGreedy,
  type PartidoProgramar,
} from './programar-oficial'

const N = 40
const ASOCIACIONES = ['Buin', 'Paine', 'Demo Norte', 'Demo Sur', 'San Bernardo', 'Maipú']

function crearInscritos(n: number): JugadorTorneo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `i${String(i + 1).padStart(2, '0')}`,
    nombre: `Jugador Demo ${i + 1}`,
    club: ASOCIACIONES[i % ASOCIACIONES.length],
  }))
}

/** skill: menor id numérico = más fuerte (i01 gana siempre a i40). */
function skill(id: string): number {
  return parseInt(id.replace(/\D/g, ''), 10)
}

function ganar(a: string, b: string): string {
  return skill(a) < skill(b) ? a : b
}

describe('Simulación oficial N=40', () => {
  const inscritos = crearInscritos(N)
  const cabezas = inscritos.slice(0, 8).map(j => j.id) // 8 semillas
  // Manual JG §2.2: floor(40/3)=13 → 12×3 + 1×4 (antes ceil daba 14 y grupos de 2)
  const numGrupos = calcularNumGruposOficial(N)
  const asignaciones = seedingSerpenteoConClubes(inscritos, numGrupos, cabezas)

  it('calcula 13 grupos (12 de 3 + 1 de 4), sin grupos de 2', () => {
    expect(numGrupos).toBe(13)
    expect(nombreGrupo(12)).toBe('M')
    expect(tamanosGruposOficial(N).every(s => s === 3 || s === 4)).toBe(true)
  })

  it('asigna 40 inscritos sin duplicados y grupos balanceados 3–4', () => {
    expect(asignaciones).toHaveLength(N)
    expect(new Set(asignaciones.map(a => a.jugadorId)).size).toBe(N)
    const counts = Array(numGrupos).fill(0)
    asignaciones.forEach(a => counts[a.grupoIndex]++)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3)
    expect(Math.max(...counts)).toBeLessThanOrEqual(4)
  })

  it('cabezas caen en grupos distintos', () => {
    const gruposCabeza = cabezas.map(id => asignaciones.find(a => a.jugadorId === id)!.grupoIndex)
    expect(new Set(gruposCabeza).size).toBe(cabezas.length)
  })

  const partidosGrupo: Array<{
    id: string
    grupoIndex: number
    fase: string
    orden: number
    a: string
    b: string
  }> = []
  const clasificados: Array<{ grupoIdx: number; primeroId: string; segundoId: string }> = []

  for (let g = 0; g < numGrupos; g++) {
    const ids = asignaciones.filter(a => a.grupoIndex === g).map(a => a.jugadorId)
    const pares = ordenPartidosGrupoIttf(ids)
    pares.forEach(([a, b], orden) => {
      partidosGrupo.push({
        id: `g${g}-p${orden}`,
        grupoIndex: g,
        fase: 'grupos',
        orden,
        a,
        b,
      })
    })
    const statsPartidos: PartidoOficialStats[] = pares.map(([a, b]) => ({
      inscritoA: a,
      inscritoB: b,
      ganador: ganar(a, b),
      sets: [[11, 5], [11, 7], [11, 4]],
      tipoCierre: 'jugado',
    }))
    const ranking = clasificarGrupoIttf(ids, statsPartidos)
    expect(ranking.length).toBe(ids.length)
    clasificados.push({
      grupoIdx: g,
      primeroId: ranking[0].inscritoId,
      segundoId: ranking[1].inscritoId,
    })
  }

  it('genera partidos de grupo ITTF y 26 clasificados (1°+2°)', () => {
    expect(partidosGrupo.length).toBeGreaterThan(30)
    expect(clasificados).toHaveLength(13)
    expect(new Set(clasificados.flatMap(c => [c.primeroId, c.segundoId])).size).toBe(26)
  })

  const resumen = resumenSiembraCuadro(clasificados.length * 2)!
  const layout = construirLlavesLayoutNumerado(
    numGrupos,
    cabezas.slice(0, 4).map((id, i) => ({
      numero: i + 1,
      grupoIdx: asignaciones.find(a => a.jugadorId === id)!.grupoIndex,
      pos: 1 as const,
    })),
    Array.from({ length: numGrupos }, (_, i) => i),
  )

  it('cuadro: 26 → llave 32, 6 BYE, fase 16vos', () => {
    expect(resumen.tamanoLlave).toBe(32)
    expect(resumen.byes).toBe(6)
    expect(resumen.faseInicial).toBe('16vos')
    expect(layout.matches.length).toBeGreaterThan(0)
    expect(layout.faseInicial).toBe('16vos')
  })

  it('modos de sorteo 2ª fase no enfrentan mismo grupo en 1ª ronda jugable', () => {
    for (const modo of ['fijo', 'serpiente', 'sorteo_segundos'] as const) {
      let rngState = 42
      const rng = () => {
        rngState = (rngState * 16807) % 2147483647
        return (rngState - 1) / 2147483646
      }
      const out = aplicarModoSorteoLlave(modo, layout, numGrupos, rng)
      // layout.matches = solo ronda inicial (LlaveMatch no lleva fase)
      for (const m of out.matches) {
        if (m.a && m.b) expect(m.a.grupoIdx).not.toBe(m.b.grupoIdx)
      }
    }
  })

  it('numeración ITTF cubre todos los partidos de grupo + llave inicial', () => {
    const llaveIds = layout.matches.map((m, i) => ({
      id: `llave-${i}`,
      fase: layout.faseInicial,
      orden: m.orden,
      grupoOrden: null as number | null,
    }))
    const grupoIds = partidosGrupo.map(p => ({
      id: p.id,
      fase: 'grupos',
      orden: p.orden,
      grupoOrden: p.grupoIndex,
    }))
    const map = asignarNumerosIttf([...grupoIds, ...llaveIds])
    expect(map.size).toBe(grupoIds.length + llaveIds.length)
    const nums = [...map.values()].sort((a, b) => a - b)
    expect(nums[0]).toBe(1)
    expect(nums[nums.length - 1]).toBe(nums.length)
  })

  it('programa todos los partidos de grupo con 8 mesas sin conflictos ni omisiones', () => {
    const pendientes: PartidoProgramar[] = partidosGrupo.map(p => ({
      id: p.id,
      inscritoA: p.a,
      inscritoB: p.b,
      prioridad: prioridadPartidoOficial('grupos', p.orden + p.grupoIndex * 10),
    }))
    const inicio = new Date('2026-08-15T09:00:00-03:00')
    const asignacionesProg = programarPartidosGreedy(pendientes, {
      mesas: 8,
      bloqueMinutos: 25,
      inicio,
    })
    expect(asignacionesProg.size).toBe(pendientes.length)

    const slots = [...asignacionesProg.entries()].map(([id, slot]) => {
      const p = pendientes.find(x => x.id === id)!
      return {
        id,
        inscritoA: p.inscritoA,
        inscritoB: p.inscritoB,
        mesa: slot.mesa,
        programadoEn: slot.programadoEn,
      }
    })
    expect(detectarConflictosPrograma(slots)).toHaveLength(0)

    const maxBloque = Math.max(
      ...[...asignacionesProg.values()].map(s =>
        Math.round((s.programadoEn.getTime() - inicio.getTime()) / (25 * 60_000)),
      ),
    )
    expect(maxBloque).toBeLessThan(500)
  })

  it('con 2 mesas aún programa todos (escala mínima razonable)', () => {
    const pendientes: PartidoProgramar[] = partidosGrupo.map(p => ({
      id: p.id,
      inscritoA: p.a,
      inscritoB: p.b,
      prioridad: prioridadPartidoOficial('grupos', p.orden),
    }))
    const asignacionesProg = programarPartidosGreedy(pendientes, {
      mesas: 2,
      bloqueMinutos: 20,
      inicio: new Date('2026-08-15T09:00:00-03:00'),
    })
    expect(asignacionesProg.size).toBe(pendientes.length)
  })
})
