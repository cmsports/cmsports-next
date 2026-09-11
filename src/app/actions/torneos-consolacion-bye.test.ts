import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { armarCuadroConsolacion } from './torneos'

/**
 * Mismo olvido que el de `cerrarInscripcionYGenerarGrupos`, pero en el OTRO
 * insert: `generarCuadroConsolacion` también reusa `construirBracketPorRanking`
 * y también trae el ganador puesto en sus propios BYE, y el insert de
 * `armarCuadroConsolacion` también se olvidaba de copiarlo.
 *
 * Se descubrió en el mismo torneo real de la primera vez (2026-09-11, 11+
 * inscritos, cuadro de 16vos): el cuadro de consuelo se armó bien —con la
 * gente correcta— pero de sus 8 llaves iniciales, 6 eran BYE y las 6 quedaron
 * "sin jugar" para siempre. Los 10 elegibles de este escenario son los
 * mismos, en el mismo orden, que salieron de leer la base real.
 */

type Fila = Record<string, any>

function fakeSupabase(tablas: Record<string, Fila[]>) {
  const from = (tabla: string) => {
    const filas = () => (tablas[tabla] ||= [])
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'insert' | 'update' = 'select'
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
      eq: (col: string, val: any) => (filtros.push(f => f[col] === val), builder),
      in: (col: string, vals: any[]) => (filtros.push(f => vals.includes(f[col])), builder),
      order: (col: string, o?: { ascending?: boolean }) => (orden = { col, asc: o?.ascending !== false }, builder),
      limit: (n: number) => (tope = n, builder),
      maybeSingle: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      then: (resolve: any) => {
        if (op === 'update') {
          const tocadas = aplicar()
          tocadas.forEach(f => Object.assign(f, payload))
          return resolve({ data: tocadas, error: null })
        }
        if (op === 'insert') {
          // La misma restricción única (torneo_id, fase, orden) que hizo
          // falta simular para los BYE del cuadro principal.
          const items = Array.isArray(payload) ? payload : [payload]
          if (tabla === 'torneo_partidos' && !Array.isArray(payload)) {
            const nueva = payload as Fila
            const choque = filas().find(
              f => f.torneo_id === nueva.torneo_id && f.fase === nueva.fase && f.orden === nueva.orden,
            )
            if (choque) return resolve({ data: null, error: { code: '23505' } })
          }
          const nuevas = items.map((v, i) => ({ id: `gen-${filas().length + i}`, creado_en: filas().length + i, ...v }))
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
 * El cuadro principal, ya terminado, del torneo real: 16vos → 8vos → cuartos
 * → semis → final. De acá salen los 10 elegibles para el consuelo —9 que
 * perdieron en 16vos con un solo partido, y uno (f19b02ab) que tuvo BYE en
 * 16vos y perdió su primer partido real en 8vos—.
 */
function escenario() {
  const torneoId = 't1'
  const p = (fase: string, orden: number, a: string, b: string | null, ganador: string) =>
    ({ torneo_id: torneoId, fase, orden, jugador_a: a, jugador_b: b, ganador })

  return {
    torneos: [{ id: torneoId, formato: 'eliminacion_consolacion' }],
    jugadores: [
      '1ec2fb6c', '190bccab', 'bbeef605', '915dda92', '50628466',
      '3122039b', '5707a9fc', '14fc98af', 'ecc67ed0', 'f19b02ab',
      // los que siguen vivos, solo para que el bracket principal cierre bien
      '20a3fd52', 'e240d3ed', 'b0f54951', '06ee9df1', 'bb149c7c', '523564be',
      '2c67fe96', '7d0aad1a', 'd42e032d', '41c56acf', '32959e35', '296d12b3',
      '286159d6', '738f9117', 'e8f6ad58',
    ].map(id => ({ id, nombre: id })),
    torneo_partidos: [
      // 16vos: los 9 reales pierden con 1 solo partido; el resto son BYE.
      p('16vos', 0, '20a3fd52', null, '20a3fd52'),
      p('16vos', 1, 'e240d3ed', '1ec2fb6c', 'e240d3ed'),
      p('16vos', 2, '190bccab', 'b0f54951', 'b0f54951'),
      p('16vos', 3, '06ee9df1', 'bbeef605', '06ee9df1'),
      p('16vos', 4, 'bb149c7c', null, 'bb149c7c'),
      p('16vos', 5, '915dda92', '523564be', '523564be'),
      p('16vos', 6, '2c67fe96', null, '2c67fe96'),
      p('16vos', 7, '7d0aad1a', '50628466', '7d0aad1a'),
      p('16vos', 8, 'f19b02ab', null, 'f19b02ab'),
      p('16vos', 9, 'd42e032d', '3122039b', 'd42e032d'),
      p('16vos', 10, '41c56acf', null, '41c56acf'),
      p('16vos', 11, '5707a9fc', '32959e35', '32959e35'),
      p('16vos', 12, '296d12b3', null, '296d12b3'),
      p('16vos', 13, '286159d6', '14fc98af', '286159d6'),
      p('16vos', 14, '738f9117', null, '738f9117'),
      p('16vos', 15, 'e8f6ad58', 'ecc67ed0', 'e8f6ad58'),
      // 8vos: f19b02ab (venía de BYE) pierde su primer partido real.
      p('8vos', 0, '20a3fd52', 'e240d3ed', '20a3fd52'),
      p('8vos', 1, 'b0f54951', '06ee9df1', 'b0f54951'),
      p('8vos', 2, 'bb149c7c', '523564be', 'bb149c7c'),
      p('8vos', 3, '2c67fe96', '7d0aad1a', '2c67fe96'),
      p('8vos', 4, 'f19b02ab', 'd42e032d', 'd42e032d'),
      p('8vos', 5, '41c56acf', '32959e35', '41c56acf'),
      p('8vos', 6, '296d12b3', '286159d6', '296d12b3'),
      p('8vos', 7, '738f9117', 'e8f6ad58', '738f9117'),
      // cuartos, semis, final: el resto del torneo, ya resuelto.
      p('cuartos', 0, '20a3fd52', 'b0f54951', '20a3fd52'),
      p('cuartos', 1, 'bb149c7c', '2c67fe96', '2c67fe96'),
      p('cuartos', 2, 'd42e032d', '41c56acf', 'd42e032d'),
      p('cuartos', 3, '296d12b3', '738f9117', '738f9117'),
      p('semis', 0, '20a3fd52', '2c67fe96', '2c67fe96'),
      p('semis', 1, 'd42e032d', '738f9117', 'd42e032d'),
      p('final', 0, '2c67fe96', 'd42e032d', 'd42e032d'),
    ] as Fila[],
  }
}

describe('armarCuadroConsolacion: los BYE del propio consuelo avanzan solos', () => {
  let tablas: ReturnType<typeof escenario>

  beforeEach(() => {
    vi.clearAllMocks()
    tablas = escenario()
    mocks.requireAdmin.mockResolvedValue({ error: null, supabase: fakeSupabase(tablas as any) })
  })

  it('arma el consuelo con los 10 elegibles reales', async () => {
    const res = await armarCuadroConsolacion({ torneoId: 't1' })
    expect(res.error).toBeUndefined()
    expect((res as any).creados).toBeGreaterThan(0)

    const rondaInicial = tablas.torneo_partidos.filter(p => p.fase === 'cons_8vos')
    expect(rondaInicial).toHaveLength(8)

    const entrantes = new Set(rondaInicial.flatMap(p => [p.jugador_a, p.jugador_b]).filter(Boolean))
    for (const id of ['1ec2fb6c', '190bccab', 'bbeef605', '915dda92', '50628466',
                       '3122039b', '5707a9fc', '14fc98af', 'ecc67ed0', 'f19b02ab']) {
      expect(entrantes.has(id), `${id} debería estar en el consuelo`).toBe(true)
    }
  })

  it('cada BYE del consuelo ya tiene ganador, sin que nadie lo marque', async () => {
    await armarCuadroConsolacion({ torneoId: 't1' })

    const byes = tablas.torneo_partidos.filter(p => p.fase === 'cons_8vos' && !p.jugador_b)
    expect(byes.length).toBeGreaterThan(0)
    for (const bye of byes) expect(bye.ganador, `BYE de ${bye.jugador_a} sin ganador`).toBe(bye.jugador_a)
  })

  // La que hubiera cazado el bug real: el ganador de cada BYE del consuelo
  // tiene que estar puesto en cons_cuartos, automáticamente.
  it('el ganador de cada BYE del consuelo avanza a cons_cuartos', async () => {
    await armarCuadroConsolacion({ torneoId: 't1' })

    const byes = tablas.torneo_partidos.filter(p => p.fase === 'cons_8vos' && !p.jugador_b)
    const siguienteRonda = tablas.torneo_partidos.filter(p => p.fase === 'cons_cuartos')
    expect(siguienteRonda.length).toBeGreaterThan(0)

    for (const bye of byes) {
      const ordenSiguiente = Math.floor(bye.orden / 2)
      const enSiguiente = siguienteRonda.find(p => p.orden === ordenSiguiente)
      expect(enSiguiente, `no se creó cons_cuartos para el BYE de ${bye.jugador_a}`).toBeTruthy()
      const puesto = enSiguiente!.jugador_a === bye.ganador || enSiguiente!.jugador_b === bye.ganador
      expect(puesto, `${bye.ganador} no aparece en cons_cuartos`).toBe(true)
    }
  })
})
