import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { cerrarInscripcionYGenerarGrupos } from './torneos'

/**
 * Bug encontrado probando eliminación + consolación con 11 inscritos en la
 * app real (2026-09-11): los sembrados que recibían BYE quedaban con la ronda
 * 2 en "Por definir" para siempre, en vez de avanzar solos.
 *
 * La causa: `generarCuadroDirecto` ya devuelve el BYE con `ganador` puesto
 * (`construirBracketDesdePosiciones` lo resuelve al armar el cuadro, porque un
 * BYE no se juega), pero el `insert` de `cerrarInscripcionYGenerarGrupos` no
 * copiaba ese campo, y nadie llamaba a `propagarGanadorPlayoff` para esos BYE
 * —a diferencia del torneo tradicional, que sí lo hace en `sincronizarLlaves`—.
 * `marcarGanadorPartido` además rechaza a propósito marcar un BYE a mano
 * ("los BYE avanzan automáticamente"), así que sin este paso no había ninguna
 * forma de que ese partido avanzara.
 *
 * Esta prueba no fija a mano quién recibe BYE: recorre lo que el motor de
 * verdad generó y comprueba la promesa completa — cada BYE de la ronda
 * inicial tiene que aparecer YA jugado, y su ganador tiene que estar puesto en
 * la ronda siguiente sin que nadie haya tocado nada.
 */

type Fila = Record<string, any>

// Mismo Supabase de mentira que torneos-tercer-lugar.test.ts, con select tras
// insert (para leer los IDs de los grupos recién creados) y select tras update
// vía maybeSingle (que usa propagarGanadorPlayoff para el caso de carrera).
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
      in: (col: string, vals: any[]) => (filtros.push(f => vals.includes(f[col])), builder),
      order: (col: string, o?: { ascending?: boolean }) => (orden = { col, asc: o?.ascending !== false }, builder),
      limit: (n: number) => (tope = n, builder),
      maybeSingle: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      then: (resolve: any) => {
        if (op === 'insert') {
          // `torneo_partidos` tiene un índice único sobre (torneo_id, fase,
          // orden) en la base real — es lo que hace que dos BYEs de la ronda
          // 1 que empujan al MISMO partido de la ronda 2 (uno a jugador_a,
          // otro a jugador_b) no creen dos filas separadas, sino que el
          // segundo choque con 23505 y `propagarGanadorPlayoff` lo recupere y
          // complete el slot que falta. Sin simular esto, un insert singular
          // en carrera crea una fila duplicada en vez de fusionarse.
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

/** 11 inscritos en una sola mesa, sin cabezas de serie declaradas. */
function escenario() {
  const n = 11
  const jugadores = Array.from({ length: n }, (_, i) => ({ id: `j${i + 1}`, nombre: `Jugador ${i + 1}` }))
  return {
    torneos: [{ id: 't1', club_id: 'club', tipo: 'externo', formato: 'eliminacion_consolacion', ruedas: 1 }],
    torneo_grupos: [{ id: 'mesa', torneo_id: 't1', nombre: 'MESA' }],
    grupo_jugadores: jugadores.map((j, i) => ({
      id: `m${i + 1}`, grupo_id: 'mesa', jugador_id: j.id, orden: i,
      club_procedencia: null, jugadores: { id: j.id, nombre: j.nombre, es_externo: false },
    })),
    torneo_cabezas_serie: [],
    torneo_partidos: [] as Fila[],
  }
}

describe('eliminación directa: el BYE avanza solo a la ronda siguiente', () => {
  let tablas: ReturnType<typeof escenario>

  beforeEach(() => {
    vi.clearAllMocks()
    tablas = escenario()
    mocks.requireAdmin.mockResolvedValue({ error: null, supabase: fakeSupabase(tablas as any), perfil: { club_id: 'club' } })
  })

  it('cierra sin error y arma el cuadro de 16 (11 inscritos → 5 BYE)', async () => {
    const res = await cerrarInscripcionYGenerarGrupos({ torneoId: 't1' })
    expect(res.error).toBeUndefined()

    const rondaInicial = tablas.torneo_partidos.filter(p => p.fase === '8vos')
    expect(rondaInicial).toHaveLength(8) // cuadro de 16 = 8 llaves en la primera ronda

    const byes = rondaInicial.filter(p => !p.jugador_b)
    expect(byes).toHaveLength(5)
  })

  it('cada BYE ya tiene ganador puesto en la ronda inicial, sin que nadie lo marque', async () => {
    await cerrarInscripcionYGenerarGrupos({ torneoId: 't1' })

    const byes = tablas.torneo_partidos.filter(p => p.fase === '8vos' && !p.jugador_b)
    for (const bye of byes) {
      expect(bye.ganador, `BYE de ${bye.jugador_a} sin ganador`).toBe(bye.jugador_a)
    }
  })

  // Ésta es la que hubiera cazado el bug real: el ganador del BYE tiene que
  // estar puesto en la ronda siguiente SIN que `marcarGanadorPartido` haya
  // corrido — porque esa función rechaza a propósito marcar un BYE a mano.
  it('el ganador de cada BYE queda puesto en cuartos, automáticamente', async () => {
    await cerrarInscripcionYGenerarGrupos({ torneoId: 't1' })

    const byes = tablas.torneo_partidos.filter(p => p.fase === '8vos' && !p.jugador_b)
    const cuartos = tablas.torneo_partidos.filter(p => p.fase === 'cuartos')

    expect(cuartos.length).toBeGreaterThan(0)

    for (const bye of byes) {
      const ordenSiguiente = Math.floor(bye.orden / 2)
      const enCuartos = cuartos.find(p => p.orden === ordenSiguiente)
      expect(enCuartos, `no se creó el partido de cuartos para el BYE de ${bye.jugador_a}`).toBeTruthy()
      const puesto = enCuartos!.jugador_a === bye.ganador || enCuartos!.jugador_b === bye.ganador
      expect(puesto, `${bye.ganador} (ganó su BYE) no aparece en cuartos`).toBe(true)
      // Y todavía no se jugó: cuartos no tiene ganador puesto en este partido.
      expect(enCuartos!.ganador).toBeFalsy()
    }
  })

  it('los partidos reales (sin BYE) de la ronda inicial NO tienen ganador', async () => {
    await cerrarInscripcionYGenerarGrupos({ torneoId: 't1' })

    const reales = tablas.torneo_partidos.filter(p => p.fase === '8vos' && p.jugador_b)
    expect(reales.length).toBeGreaterThan(0)
    for (const p of reales) expect(p.ganador).toBeFalsy()
  })
})
