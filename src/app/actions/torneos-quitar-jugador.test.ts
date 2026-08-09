import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { quitarJugadorDeGrupo } from './torneos'

type Fila = Record<string, any>

// Supabase de mentira: tablas en memoria y un builder encadenable que sólo
// entiende eq/neq/select/insert/update/delete, que es todo lo que usa la acción.
function fakeSupabase(tablas: Record<string, Fila[]>) {
  let seq = 0
  const from = (tabla: string) => {
    const filas = () => (tablas[tabla] ||= [])
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Fila | Fila[] = {}
    const aplicar = () => filas().filter(f => filtros.every(p => p(f)))
    const builder: any = {
      select: () => (op = 'select', builder),
      insert: (v: Fila | Fila[]) => (op = 'insert', payload = v, builder),
      update: (v: Fila) => (op = 'update', payload = v, builder),
      delete: () => (op = 'delete', builder),
      eq: (col: string, val: any) => (filtros.push(f => f[col] === val), builder),
      neq: (col: string, val: any) => (filtros.push(f => f[col] !== val), builder),
      maybeSingle: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      then: (resolve: any) => {
        if (op === 'insert') {
          const nuevas = (Array.isArray(payload) ? payload : [payload]).map(v => ({ id: `gen-${seq++}`, ...v }))
          filas().push(...nuevas)
          return resolve({ data: nuevas, error: null })
        }
        if (op === 'update') {
          aplicar().forEach(f => Object.assign(f, payload))
          return resolve({ data: null, error: null })
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

function escenario(overrides: { partidos?: Fila[]; miembros?: Fila[]; enPreparacion?: boolean } = {}) {
  return {
    torneo_grupos: [{ id: 'g1', torneo_id: 't1', nombre: 'A', en_preparacion: overrides.enPreparacion ?? false }],
    torneo_partidos: overrides.partidos ?? [
      { id: 'p1', torneo_id: 't1', grupo_id: 'g1', fase: 'grupos', ganador: null, jugador_a: 'j1', jugador_b: 'j2', orden: 0 },
      { id: 'p2', torneo_id: 't1', grupo_id: 'g1', fase: 'grupos', ganador: null, jugador_a: 'j1', jugador_b: 'j3', orden: 1 },
      { id: 'p3', torneo_id: 't1', grupo_id: 'g1', fase: 'grupos', ganador: null, jugador_a: 'j2', jugador_b: 'j3', orden: 2 },
    ],
    grupo_jugadores: overrides.miembros ?? [
      { id: 'm1', grupo_id: 'g1', jugador_id: 'j1', orden: 0 },
      { id: 'm2', grupo_id: 'g1', jugador_id: 'j2', orden: 1 },
      { id: 'm3', grupo_id: 'g1', jugador_id: 'j3', orden: 2 },
    ],
    torneo_cabezas_serie: [{ id: 'c1', torneo_id: 't1', jugador_id: 'j3', numero: 1 }],
  }
}

const params = { torneoId: 't1', grupoId: 'g1', jugadorId: 'j3' }

describe('quitarJugadorDeGrupo', () => {
  let tablas: ReturnType<typeof escenario>

  const montar = (t: ReturnType<typeof escenario>) => {
    tablas = t
    mocks.requireAdmin.mockResolvedValue({ error: null, supabase: fakeSupabase(t as any), perfil: { club_id: 'club' } })
  }

  beforeEach(() => vi.clearAllMocks())

  it('saca al jugador, lo borra de cabezas de serie y rehace el round robin sin él', async () => {
    montar(escenario())
    const res = await quitarJugadorDeGrupo(params)

    expect(res).toEqual({ success: true })
    expect(tablas.grupo_jugadores.map(m => m.jugador_id)).toEqual(['j1', 'j2'])
    expect(tablas.grupo_jugadores.map(m => m.orden)).toEqual([0, 1])
    expect(tablas.torneo_cabezas_serie).toHaveLength(0)
    const parejas = tablas.torneo_partidos.map(p => [p.jugador_a, p.jugador_b])
    expect(parejas).toEqual([['j1', 'j2']])
  })

  it('rechaza si el grupo ya tiene un partido jugado', async () => {
    const t = escenario()
    t.torneo_partidos[0].ganador = 'j1'
    montar(t)

    const res = await quitarJugadorDeGrupo(params)
    expect(res.error).toMatch(/partidos jugados/)
    expect(tablas.grupo_jugadores).toHaveLength(3)
  })

  it('rechaza si el bracket ya tiene una llave jugada', async () => {
    const t = escenario()
    t.torneo_partidos.push({ id: 'b1', torneo_id: 't1', grupo_id: null, fase: 'semis', ganador: 'j1', jugador_a: 'j1', jugador_b: 'j2', orden: 9 })
    montar(t)

    const res = await quitarJugadorDeGrupo(params)
    expect(res.error).toMatch(/bracket/)
    expect(tablas.grupo_jugadores).toHaveLength(3)
  })

  it('rechaza dejar un grupo cerrado con un solo jugador', async () => {
    montar(escenario({
      miembros: [
        { id: 'm1', grupo_id: 'g1', jugador_id: 'j1', orden: 0 },
        { id: 'm3', grupo_id: 'g1', jugador_id: 'j3', orden: 1 },
      ],
      partidos: [{ id: 'p1', torneo_id: 't1', grupo_id: 'g1', fase: 'grupos', ganador: null, jugador_a: 'j1', jugador_b: 'j3', orden: 0 }],
    }))

    const res = await quitarJugadorDeGrupo(params)
    expect(res.error).toMatch(/un solo jugador/)
    expect(tablas.grupo_jugadores).toHaveLength(2)
  })

  it('elimina el grupo cuando el último jugador de un grupo en preparación se va', async () => {
    montar(escenario({
      enPreparacion: true,
      partidos: [],
      miembros: [{ id: 'm3', grupo_id: 'g1', jugador_id: 'j3', orden: 0 }],
    }))

    const res = await quitarJugadorDeGrupo(params)
    expect(res).toEqual({ success: true, grupoEliminado: true })
    expect(tablas.torneo_grupos).toHaveLength(0)
  })

  it('no toca al jugador si no pertenece al grupo', async () => {
    montar(escenario())
    const res = await quitarJugadorDeGrupo({ ...params, jugadorId: 'jX' })
    expect(res.error).toMatch(/no pertenece/)
    expect(tablas.grupo_jugadores).toHaveLength(3)
  })
})
