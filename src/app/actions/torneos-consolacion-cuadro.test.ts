import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { armarCuadroConsolacion } from './torneos'

/**
 * Bug encontrado probando eliminación + consolación en producción, con el
 * torneo YA terminado (2026-09-11): el cuadro de consuelo nunca se armaba,
 * ni con el torneo completo.
 *
 * La causa: `faseInicial` se calculaba ordenando TODOS los partidos —de
 * cualquier fase— por su `orden` crudo, y `orden` se reinicia en 0 dentro de
 * cada ronda (semis tiene 0,1…, final tiene 0 otra vez). Sin un `.order()` en
 * la consulta, dos filas con `orden=0` de fases distintas pueden llegar en
 * cualquier posición del array, así que la fila que "gana" el sort es una
 * lotería. Con el torneo terminado —todas las fases presentes a la vez— eso
 * podía elegir 'final' como si fuera la ronda inicial, y entonces
 * `consolacionLista` esperaba para siempre algo que ya había pasado.
 *
 * Esta prueba pone la fila de 'final' PRIMERA en la tabla —a propósito, en el
 * peor orden posible— para probar que el cálculo ya no depende del orden en
 * que la base devuelve las filas.
 */

type Fila = Record<string, any>

function fakeSupabase(tablas: Record<string, Fila[]>) {
  const from = (tabla: string) => {
    const filas = () => (tablas[tabla] ||= [])
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'insert' = 'select'
    let payload: Fila | Fila[] = {}
    const aplicar = () => filas().filter(f => filtros.every(p => p(f)))
    const builder: any = {
      select: () => builder,
      insert: (v: Fila | Fila[]) => (op = 'insert', payload = v, builder),
      eq: (col: string, val: any) => (filtros.push(f => f[col] === val), builder),
      in: (col: string, vals: any[]) => (filtros.push(f => vals.includes(f[col])), builder),
      single: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      then: (resolve: any) => {
        if (op === 'insert') {
          const nuevas = (Array.isArray(payload) ? payload : [payload]).map((v, i) => ({ id: `gen-${i}`, ...v }))
          filas().push(...nuevas)
          return resolve({ data: nuevas, error: null })
        }
        return resolve({ data: aplicar(), error: null })
      },
    }
    return builder
  }
  return { from }
}

/**
 * Cuadro de 4 (semis → final) ya terminado.
 *
 * A y C ganan sus semis (1 partido cada uno) y se enfrentan en la final,
 * donde gana C. B y D perdieron su semifinal con un solo partido jugado: son
 * los dos elegibles para el cuadro de consuelo. A queda con 2 partidos (ganó
 * semis, perdió la final) y NO es elegible.
 *
 * La fila de 'final' se pone PRIMERA en el array a propósito, en el peor
 * orden posible para el bug que esto prueba.
 */
function escenario() {
  return {
    torneos: [{ id: 't1', formato: 'eliminacion_consolacion' }],
    torneo_partidos: [
      { id: 'f1', torneo_id: 't1', fase: 'final', orden: 0, jugador_a: 'A', jugador_b: 'C', ganador: 'C' },
      { id: 's1', torneo_id: 't1', fase: 'semis', orden: 0, jugador_a: 'A', jugador_b: 'B', ganador: 'A' },
      { id: 's2', torneo_id: 't1', fase: 'semis', orden: 1, jugador_a: 'C', jugador_b: 'D', ganador: 'C' },
    ] as Fila[],
    jugadores: [
      { id: 'A', nombre: 'Ana' }, { id: 'B', nombre: 'Beto' },
      { id: 'C', nombre: 'Cata' }, { id: 'D', nombre: 'Dani' },
    ] as Fila[],
  }
}

describe('armarCuadroConsolacion — el torneo ya terminado no lo bloquea', () => {
  let tablas: ReturnType<typeof escenario>

  beforeEach(() => {
    vi.clearAllMocks()
    tablas = escenario()
    mocks.requireAdmin.mockResolvedValue({ error: null, supabase: fakeSupabase(tablas as any) })
  })

  it('arma el cuadro de consuelo con los dos perdedores de semis, aunque la final ya se jugó', async () => {
    const res = await armarCuadroConsolacion({ torneoId: 't1' })

    expect(res.error).toBeUndefined()
    expect((res as any).esperando).toBeUndefined()
    expect((res as any).sinElegibles).toBeUndefined()

    const consuelo = tablas.torneo_partidos.filter(p => String(p.fase).startsWith('cons_'))
    expect(consuelo.length).toBeGreaterThan(0)

    const jugadoresDelConsuelo = new Set(consuelo.flatMap(p => [p.jugador_a, p.jugador_b]).filter(Boolean))
    expect(jugadoresDelConsuelo.has('B'), 'Beto perdió su única semifinal y no entró al consuelo').toBe(true)
    expect(jugadoresDelConsuelo.has('D'), 'Dani perdió su única semifinal y no entró al consuelo').toBe(true)
    expect(jugadoresDelConsuelo.has('A'), 'Ana jugó 2 partidos y no debería estar en el consuelo').toBe(false)
    expect(jugadoresDelConsuelo.has('C'), 'Cata es la campeona y no debería estar en el consuelo').toBe(false)
  })

  it('es idempotente: correrlo dos veces no duplica el cuadro', async () => {
    await armarCuadroConsolacion({ torneoId: 't1' })
    const primeraVez = tablas.torneo_partidos.filter(p => String(p.fase).startsWith('cons_')).length

    const segunda = await armarCuadroConsolacion({ torneoId: 't1' })
    expect((segunda as any).yaExistia).toBe(true)

    const segundaVez = tablas.torneo_partidos.filter(p => String(p.fase).startsWith('cons_')).length
    expect(segundaVez).toBe(primeraVez)
  })
})
