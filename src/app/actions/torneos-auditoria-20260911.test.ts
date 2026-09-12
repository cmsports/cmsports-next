import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import {
  quitarJugadorDeGrupo,
  reordenarJugadorEnGrupo,
  moverJugadorEntreGrupos,
  crearGrupoManual,
  volverAGrupos,
  finalizarTorneo,
  sincronizarLlaves,
  guardarPremios,
} from './torneos'
import { partidosDeLiguilla } from '@/lib/domain/torneoLiguilla'

/**
 * Los hallazgos de la auditoría del 2026-09-11 al módulo de torneos, uno por
 * bloque. Cada prueba de acá fallaba contra el código anterior.
 */

type Fila = Record<string, any>

// Supabase de mentira con el índice único (torneo_id, fase, orden) simulado,
// igual que en torneos-bye-avanza.test.ts: sin él, dos BYE que empujan al
// mismo partido siguiente crearían dos filas en vez de fusionarse.
function fakeSupabase(tablas: Record<string, Fila[]>) {
  let seq = 0
  const from = (tabla: string) => {
    const filas = () => (tablas[tabla] ||= [])
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Fila | Fila[] = {}
    let orden: { col: string; asc: boolean } | null = null
    let tope: number | null = null
    const aplicar = () => {
      let r = filas().filter(f => filtros.every(p => p(f)))
      if (orden) {
        const { col, asc } = orden
        r = [...r].sort((a, b) => ((a[col] ?? 0) > (b[col] ?? 0) ? 1 : -1) * (asc ? 1 : -1))
      }
      return tope == null ? r : r.slice(0, tope)
    }
    const builder: any = {
      select: () => builder,
      insert: (v: Fila | Fila[]) => (op = 'insert', payload = v, builder),
      update: (v: Fila) => (op = 'update', payload = v, builder),
      delete: () => (op = 'delete', builder),
      eq: (col: string, val: any) => (filtros.push(f => f[col] === val), builder),
      neq: (col: string, val: any) => (filtros.push(f => f[col] !== val), builder),
      is: (col: string, val: any) => (filtros.push(f => (f[col] ?? null) === val), builder),
      in: (col: string, vals: any[]) => (filtros.push(f => vals.includes(f[col])), builder),
      like: (col: string, patron: string) => (filtros.push(f => new RegExp(`^${patron.replace(/%/g, '.*')}$`).test(String(f[col] ?? ''))), builder),
      not: (col: string, _op: string, val: any) => (filtros.push(f => (f[col] ?? null) !== val), builder),
      order: (col: string, o?: { ascending?: boolean }) => (orden = { col, asc: o?.ascending !== false }, builder),
      limit: (n: number) => (tope = n, builder),
      maybeSingle: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      then: (resolve: any) => {
        if (op === 'insert') {
          if (tabla === 'torneo_partidos' && !Array.isArray(payload)) {
            const nueva = payload as Fila
            const choque = filas().find(
              f => f.torneo_id === nueva.torneo_id && f.fase === nueva.fase && f.orden === nueva.orden,
            )
            if (choque) return resolve({ data: null, error: { code: '23505' } })
          }
          const nuevas = (Array.isArray(payload) ? payload : [payload]).map(v => ({ id: `gen-${seq++}`, creado_en: seq, ...v }))
          filas().push(...nuevas)
          return resolve({ data: nuevas, error: null })
        }
        if (op === 'update') {
          const tocadas = aplicar()
          tocadas.forEach(f => Object.assign(f, payload))
          return resolve({ data: tocadas, error: null })
        }
        if (op === 'delete') {
          const fuera = new Set(aplicar())
          tablas[tabla] = filas().filter(f => !fuera.has(f))
          return resolve({ data: null, error: null })
        }
        return resolve({ data: aplicar(), error: null })
      },
    }
    return builder
  }
  return { from }
}

const montar = (tablas: Record<string, Fila[]>) => {
  mocks.requireAdmin.mockResolvedValue({ error: null, supabase: fakeSupabase(tablas), perfil: { club_id: 'club' } })
  return tablas
}

// ── Eliminación directa: 6 inscritos en el grupo único, cuadro de 8 armado ──
function eliminacionArmada() {
  const ids = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6']
  return {
    torneos: [{ id: 't1', club_id: 'club', tipo: 'externo', formato: 'eliminacion_consolacion', fase: 'cuartos', estado: 'en_curso', ruedas: 1 }],
    torneo_grupos: [{ id: 'gA', torneo_id: 't1', nombre: 'A', orden: 0, en_preparacion: false }],
    grupo_jugadores: ids.map((id, i) => ({
      id: `m${i}`, grupo_id: 'gA', jugador_id: id, orden: i, club_procedencia: null,
      jugadores: { id, nombre: id, es_externo: false },
    })),
    torneo_partidos: [
      { id: 'q0', torneo_id: 't1', grupo_id: null, fase: 'cuartos', orden: 0, jugador_a: 'j1', jugador_b: null, ganador: 'j1' },
      { id: 'q1', torneo_id: 't1', grupo_id: null, fase: 'cuartos', orden: 1, jugador_a: 'j4', jugador_b: 'j5', ganador: null },
      { id: 'q2', torneo_id: 't1', grupo_id: null, fase: 'cuartos', orden: 2, jugador_a: 'j3', jugador_b: 'j6', ganador: null },
      { id: 'q3', torneo_id: 't1', grupo_id: null, fase: 'cuartos', orden: 3, jugador_a: 'j2', jugador_b: null, ganador: 'j2' },
      { id: 's0', torneo_id: 't1', grupo_id: null, fase: 'semis', orden: 0, jugador_a: 'j1', jugador_b: null, ganador: null },
      { id: 's1', torneo_id: 't1', grupo_id: null, fase: 'semis', orden: 1, jugador_a: null, jugador_b: 'j2', ganador: null },
    ] as Fila[],
    torneo_cabezas_serie: [] as Fila[],
    jugadores: ids.map(id => ({ id, nombre: id, es_externo: false })),
  }
}

describe('eliminación directa: el grupo único es solo la lista de inscritos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('quitar a un inscrito se rechaza y no inventa partidos de grupo', async () => {
    const t = montar(eliminacionArmada())
    const res = await quitarJugadorDeGrupo({ torneoId: 't1', grupoId: 'gA', jugadorId: 'j6' })
    expect(res.error).toMatch(/eliminación directa/i)
    expect(res.error).toMatch(/marca a su rival/i)
    expect(t.torneo_partidos.filter(p => p.fase === 'grupos')).toHaveLength(0)
    expect(t.grupo_jugadores.some(m => m.jugador_id === 'j6')).toBe(true)
  })

  it('reordenar la lista se rechaza y no inventa partidos de grupo', async () => {
    const t = montar(eliminacionArmada())
    const res = await reordenarJugadorEnGrupo({ torneoId: 't1', grupoId: 'gA', jugadorId: 'j2', direccion: 'arriba' })
    expect(res.error).toMatch(/eliminación directa/i)
    expect(t.torneo_partidos.filter(p => p.fase === 'grupos')).toHaveLength(0)
  })

  it('mover entre grupos se rechaza', async () => {
    montar(eliminacionArmada())
    const res = await moverJugadorEntreGrupos({ torneoId: 't1', jugadorId: 'j1', grupoOrigenId: 'gA', grupoDestinoId: 'gB' })
    expect(res.error).toMatch(/eliminación directa/i)
  })

  it('"reiniciar bracket" rearma el cuadro en vez de dejar el torneo en fase grupos', async () => {
    const t = montar(eliminacionArmada())
    // Un consuelo a medias también se va con el rearmado.
    t.torneo_partidos.push({ id: 'c0', torneo_id: 't1', grupo_id: null, fase: 'cons_final', orden: 0, jugador_a: 'j5', jugador_b: 'j6', ganador: null })

    const res = await volverAGrupos({ torneoId: 't1' })
    expect(res.error).toBeUndefined()
    expect((res as any).cuadroRearmado).toBe(true)

    const torneo = t.torneos[0]
    expect(torneo.fase).toBe('cuartos')          // la ronda inicial del cuadro, no 'grupos'
    expect(torneo.inscripcion_abierta).toBe(false)
    const cuadro = t.torneo_partidos.filter(p => p.fase === 'cuartos')
    expect(cuadro).toHaveLength(4)
    expect(cuadro.every(p => !p.jugador_b || !p.ganador)).toBe(true) // sin resultados
    expect(t.torneo_partidos.some(p => p.fase === 'grupos')).toBe(false)
    expect(t.torneo_partidos.some(p => String(p.fase).startsWith('cons_'))).toBe(false)
    // Los seis siguen inscritos.
    expect(new Set(t.grupo_jugadores.map(m => m.jugador_id)).size).toBe(6)
  })
})

// ── Liguilla a dos ruedas: 5 inscritos ──────────────────────────────────────
function liguillaDosRuedas() {
  const ids = ['a', 'b', 'c', 'd', 'e']
  return {
    torneos: [{ id: 't1', club_id: 'club', tipo: 'externo', formato: 'liguilla', fase: 'grupos', estado: 'en_curso', ruedas: 2 }],
    torneo_grupos: [{ id: 'gA', torneo_id: 't1', nombre: 'A', orden: 0, en_preparacion: false }],
    grupo_jugadores: ids.map((id, i) => ({ id: `m${i}`, grupo_id: 'gA', jugador_id: id, orden: i })),
    // Los partidos exactos no importan: se van a regenerar. Solo que no haya
    // ninguno jugado.
    torneo_partidos: Array.from({ length: partidosDeLiguilla(5, 2) }, (_, i) => ({
      id: `p${i}`, torneo_id: 't1', grupo_id: 'gA', fase: 'grupos', orden: i, jugador_a: 'a', jugador_b: 'b', ganador: null,
    })) as Fila[],
    torneo_cabezas_serie: [] as Fila[],
  }
}

describe('liguilla: rehacer el grupo conserva las ruedas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('quitar a un inscrito regenera la liguilla completa a dos ruedas, no un round robin', async () => {
    const t = montar(liguillaDosRuedas())
    const res = await quitarJugadorDeGrupo({ torneoId: 't1', grupoId: 'gA', jugadorId: 'e' })
    expect(res.error).toBeUndefined()
    const partidos = t.torneo_partidos.filter(p => p.fase === 'grupos')
    // 4 jugadores a dos ruedas: 12 partidos. El round robin daba 6.
    expect(partidos).toHaveLength(partidosDeLiguilla(4, 2))
    expect(partidos.some(p => p.jugador_a === 'e' || p.jugador_b === 'e')).toBe(false)
    // Cada pareja se enfrenta exactamente dos veces.
    const veces = new Map<string, number>()
    for (const p of partidos) {
      const k = [p.jugador_a, p.jugador_b].sort().join('-')
      veces.set(k, (veces.get(k) ?? 0) + 1)
    }
    expect([...veces.values()].every(v => v === 2)).toBe(true)
  })

  it('no se puede crear un grupo aparte en una liguilla', async () => {
    montar(liguillaDosRuedas())
    const res = await crearGrupoManual({ torneoId: 't1' })
    expect(res.error).toMatch(/liguilla/i)
  })
})

// ── Finalizar con el consuelo a medias ──────────────────────────────────────
describe('finalizarTorneo con cuadro de consuelo', () => {
  beforeEach(() => vi.clearAllMocks())

  const terminado = () => ({
    torneos: [{ id: 't1', club_id: 'club', tipo: 'externo', formato: 'eliminacion_consolacion', fase: 'final', estado: 'en_curso' }],
    torneo_grupos: [] as Fila[],
    torneo_partidos: [
      { id: 'f', torneo_id: 't1', fase: 'final', orden: 0, jugador_a: 'x', jugador_b: 'y', ganador: 'x' },
      { id: 'c0', torneo_id: 't1', fase: 'cons_semis', orden: 0, jugador_a: 'p', jugador_b: null, ganador: 'p' }, // BYE: no cuenta
      { id: 'c1', torneo_id: 't1', fase: 'cons_semis', orden: 1, jugador_a: 'q', jugador_b: 'r', ganador: 'q' },
      { id: 'cf', torneo_id: 't1', fase: 'cons_final', orden: 0, jugador_a: 'p', jugador_b: 'q', ganador: null },
    ] as Fila[],
  })

  it('se niega mientras falte un partido del consuelo', async () => {
    montar(terminado())
    const res = await finalizarTorneo({ torneoId: 't1' })
    expect(res.error).toMatch(/consuelo/i)
    expect(res.error).toMatch(/1 partido/)
  })

  it('con el consuelo jugado finaliza, guarda a su campeón, y la fecha de fin es la de Chile (sin hora)', async () => {
    const t = montar(terminado())
    t.torneo_partidos.find(p => p.id === 'cf')!.ganador = 'p'
    const res = await finalizarTorneo({ torneoId: 't1' })
    expect(res.error).toBeUndefined()
    expect(t.torneos[0].estado).toBe('finalizado')
    expect(t.torneos[0].campeon_id).toBe('x')
    // El campeón del consuelo queda en el torneo (migración 271).
    expect(t.torneos[0].campeon_consuelo_id).toBe('p')
    // Antes: new Date().toISOString(), que después de las 21:00 caía en mañana.
    expect(t.torneos[0].fecha_fin).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('un torneo sin consuelo finaliza sin tocar campeon_consuelo_id', async () => {
    const t = montar(terminado())
    t.torneo_partidos = t.torneo_partidos.filter(p => !String(p.fase).startsWith('cons_'))
    const res = await finalizarTorneo({ torneoId: 't1' })
    expect(res.error).toBeUndefined()
    expect(t.torneos[0].campeon_consuelo_id).toBeUndefined()
  })
})

describe('guardarPremios con premio del consuelo', () => {
  it('manda p_consuelo al RPC, y NULL cuando no se declara', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { movimientos_creados: 1 }, error: null })
    mocks.requireAdmin.mockResolvedValue({ error: null, supabase: { rpc }, perfil: { club_id: 'club' } })

    await guardarPremios({ torneoId: 't1', torneoNombre: 'T', primero: 100, segundo: 50, tercero: null, consuelo: 30 })
    expect(rpc).toHaveBeenCalledWith('guardar_premios_torneo_atomico', expect.objectContaining({ p_consuelo: 30, p_primero: 100 }))

    await guardarPremios({ torneoId: 't1', torneoNombre: 'T', primero: 100, segundo: 50, tercero: null })
    expect(rpc).toHaveBeenLastCalledWith('guardar_premios_torneo_atomico', expect.objectContaining({ p_consuelo: null }))
  })
})

// ── El bracket tradicional: el BYE avanza solo desde sincronizarLlaves ──────
// La prueba que faltaba. La simulación grande (torneos-simulacion.test.ts)
// usa 48 jugadores → 32 clasificados exactos, o sea CERO BYE: no probaba esto.
function tradicionalTresGrupos() {
  // 3 grupos de 3, todos jugados: 1° gana 2, 2° gana 1, 3° gana 0.
  const grupos = [['j1', 'j2', 'j3'], ['j4', 'j5', 'j6'], ['j7', 'j8', 'j9']]
  const torneo_grupos = grupos.map((_, i) => ({ id: `g${i}`, torneo_id: 't1', nombre: 'ABC'[i], orden: i, en_preparacion: false }))
  const grupo_jugadores: Fila[] = []
  const torneo_partidos: Fila[] = []
  grupos.forEach((ids, gi) => {
    ids.forEach((id, i) => grupo_jugadores.push({ id: `m${gi}${i}`, grupo_id: `g${gi}`, jugador_id: id, orden: i, jugadores: { id, nombre: id } }))
    const [p1, p2, p3] = ids
    const m = (a: string, b: string, g: string) => ({
      torneo_id: 't1', grupo_id: `g${gi}`, fase: 'grupos', orden: torneo_partidos.length,
      jugador_a: a, jugador_b: b, ganador: g, sets_a: g === a ? 3 : 1, sets_b: g === b ? 3 : 1, puntos_a: 33, puntos_b: 30,
    })
    torneo_partidos.push({ id: `${gi}-a`, ...m(p1, p2, p1) }, { id: `${gi}-b`, ...m(p1, p3, p1) }, { id: `${gi}-c`, ...m(p2, p3, p2) })
  })
  return {
    torneos: [{ id: 't1', club_id: 'club', tipo: 'externo', formato: 'grupos', fase: 'grupos', estado: 'en_curso' }],
    torneo_grupos,
    grupo_jugadores,
    torneo_partidos,
    torneo_cabezas_serie: [] as Fila[],
  }
}

describe('sincronizarLlaves: los BYE del cuadro tradicional avanzan solos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('6 clasificados → cuadro de 8 con 2 BYE, y sus ganadores ya están en semis', async () => {
    const t = montar(tradicionalTresGrupos())
    const res = await sincronizarLlaves({ torneoId: 't1' })
    expect((res as any).error).toBeUndefined()
    expect((res as any).bracketCreado).toBe(true)

    const cuartos = t.torneo_partidos.filter(p => p.fase === 'cuartos')
    expect(cuartos).toHaveLength(4)
    const byes = cuartos.filter(p => !p.jugador_b)
    expect(byes).toHaveLength(2)
    for (const bye of byes) expect(bye.ganador).toBe(bye.jugador_a)

    const semis = t.torneo_partidos.filter(p => p.fase === 'semis')
    expect(semis.length).toBeGreaterThan(0)
    for (const bye of byes) {
      const sig = semis.find(p => p.orden === Math.floor(bye.orden / 2))
      expect(sig, `sin semifinal para el BYE de ${bye.jugador_a}`).toBeTruthy()
      expect([sig!.jugador_a, sig!.jugador_b]).toContain(bye.ganador)
    }
    // Y las llaves reales de cuartos siguen sin jugarse.
    for (const p of cuartos.filter(p => p.jugador_b)) expect(p.ganador).toBeFalsy()
    // El torneo pasó a la ronda inicial del cuadro.
    expect(t.torneos[0].fase).toBe('cuartos')
  })
})
