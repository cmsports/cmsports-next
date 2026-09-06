import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { marcarGanadorPartido } from './torneos'

type Fila = Record<string, any>

function fakeSupabase(tablas: Record<string, Fila[]>) {
  let seq = 0
  const from = (tabla: string) => {
    const filas = () => (tablas[tabla] ||= [])
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Fila | Fila[] = {}
    const aplicar = () => filas().filter(f => filtros.every(p => p(f)))
    const builder: any = {
      select: () => builder,
      insert: (v: Fila | Fila[]) => (op = 'insert', payload = v, builder),
      update: (v: Fila) => (op = 'update', payload = v, builder),
      eq: (c: string, v: any) => (filtros.push(f => f[c] === v), builder),
      neq: (c: string, v: any) => (filtros.push(f => f[c] !== v), builder),
      is: (c: string, v: any) => (filtros.push(f => (f[c] ?? null) === v), builder),
      in: (c: string, vs: any[]) => (filtros.push(f => vs.includes(f[c])), builder),
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      then: (resolve: any) => {
        if (op === 'insert') {
          const nuevas = (Array.isArray(payload) ? payload : [payload]).map(v => ({ id: `gen-${seq++}`, ...v }))
          filas().push(...nuevas)
          return resolve({ data: nuevas, error: null })
        }
        if (op === 'update') {
          const tocadas = aplicar()
          tocadas.forEach(f => Object.assign(f, payload))
          return resolve({ data: tocadas, error: null })
        }
        return resolve({ data: aplicar(), error: null })
      },
    }
    return builder
  }
  return { from }
}

/** Un torneo con grupos al mejor de 3 y llave al mejor de 5: el caso real. */
function escenario(): Record<string, Fila[]> {
  return {
    torneos: [{
      id: 't1', club_id: 'club', tipo: 'interno', fase: 'grupos', estado: 'en_curso',
      formato_grupos: 'bo3', formato_llave: 'bo5',
    }],
    torneo_grupos: [{ id: 'g1', torneo_id: 't1', en_preparacion: false }],
    grupo_jugadores: [
      { id: 'm1', grupo_id: 'g1', jugador_id: 'ana', partidos_ganados: 0, partidos_jugados: 0 },
      { id: 'm2', grupo_id: 'g1', jugador_id: 'beto', partidos_ganados: 0, partidos_jugados: 0 },
    ],
    torneo_partidos: [
      { id: 'pg', torneo_id: 't1', grupo_id: 'g1', fase: 'grupos', orden: 0, jugador_a: 'ana', jugador_b: 'beto', ganador: null },
      { id: 'pll', torneo_id: 't1', grupo_id: null, fase: 'semis', orden: 0, jugador_a: 'ana', jugador_b: 'beto', ganador: null },
    ],
  }
}

const montar = (t: Record<string, Fila[]>) => {
  mocks.requireAdmin.mockResolvedValue({ error: null, supabase: fakeSupabase(t), perfil: { club_id: 'club' } })
  mocks.createAdminClient.mockReturnValue(fakeSupabase(t))
  return t
}
const partido = (t: Record<string, Fila[]>, id: string) => t.torneo_partidos.find(p => p.id === id)!
/** El resultado es una unión: acá solo interesa el mensaje cuando lo hay. */
const errorDe = (r: unknown) => (r as { error?: string }).error

describe('el marcador se valida con el formato de SU fase', () => {
  beforeEach(() => vi.clearAllMocks())

  it('en los grupos al mejor de 3 acepta un 2-1', async () => {
    const t = montar(escenario())
    const res = await marcarGanadorPartido({ partidoId: 'pg', parciales: [[11, 9], [8, 11], [11, 6]] })
    expect(res).toMatchObject({ success: true })
    expect(partido(t, 'pg')).toMatchObject({ sets_a: 2, sets_b: 1, ganador: 'ana' })
  })

  it('y rechaza un 3-1, que en mejor de 3 no existe', async () => {
    montar(escenario())
    const res = await marcarGanadorPartido({ partidoId: 'pg', setsA: 3, setsB: 1 })
    expect(errorDe(res)).toContain('Mejor de 3')
    expect(errorDe(res)).toContain('2-1')
  })

  it('no acepta un cuarto set en un partido de grupo al mejor de 3', async () => {
    montar(escenario())
    const res = await marcarGanadorPartido({ partidoId: 'pg', parciales: [[11, 9], [8, 11], [11, 6], [11, 4]] })
    expect(errorDe(res)).toContain('2 sets')
  })

  it('en la MISMA llave del mismo torneo, en cambio, exige 3 sets', async () => {
    const t = montar(escenario())
    const corto = await marcarGanadorPartido({ partidoId: 'pll', setsA: 2, setsB: 1 })
    expect(errorDe(corto)).toContain('Mejor de 5')
    const res = await marcarGanadorPartido({ partidoId: 'pll', setsA: 3, setsB: 1 })
    expect(res).toMatchObject({ success: true })
    expect(partido(t, 'pll')).toMatchObject({ sets_a: 3, ganador: 'ana' })
  })

  it('un torneo sin formato declarado se sigue jugando al mejor de 5', async () => {
    const t = escenario()
    // Un torneo creado antes de la migración 262: sin las columnas de formato.
    const sinFormato = { ...t.torneos[0] }
    delete sinFormato.formato_grupos
    delete sinFormato.formato_llave
    t.torneos[0] = sinFormato
    montar(t)
    expect(await marcarGanadorPartido({ partidoId: 'pg', setsA: 2, setsB: 0 })).toHaveProperty('error')
    expect(await marcarGanadorPartido({ partidoId: 'pg', setsA: 3, setsB: 0 })).toMatchObject({ success: true })
  })
})
