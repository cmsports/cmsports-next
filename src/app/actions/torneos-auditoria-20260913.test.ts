import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }))
// torneos.ts autoriza por requireGestorTorneos (admin, o profesor donde el
// club encendió profe.gestiona_torneos). Mismo mock: acá se prueba la lógica
// del torneo, no quién entra — eso vive en require-gestor-torneos.test.ts.
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.requireAdmin, requireGestorTorneos: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => { throw new Error('sin admin en la prueba') }) }))

import {
  cerrarInscripcionYGenerarGrupos,
  corregirResultadoGrupos,
  finalizarTorneo,
  inscribirEnMesa,
  marcarGanadorPartido,
  moverJugadorEntreGrupos,
  quitarJugadorDeMesa,
  reabrirTorneo,
  sincronizarLlaves,
} from './torneos'

/**
 * Auditoría de torneos del 2026-09-13. Cada prueba fija un agujero que
 * existía ese día:
 *
 *  - Un torneo por equipos se podía "regenerar" como torneo tradicional.
 *  - Con el torneo ya finalizado se seguían aceptando resultados,
 *    correcciones e inscripciones.
 *  - La liguilla cerraba con un empate en la punta decidido por el orden de
 *    inscripción, e ignoraba el desempate manual del juez.
 *  - No existía forma de reabrir un torneo finalizado, aunque el RPC de
 *    corrección pedía hacerlo.
 *  - Si la lectura del torneo fallaba, la modalidad caía en 'grupos' y la
 *    acción seguía por ese camino (el bug de la eliminación directa).
 *  - Se podía mover a alguien de un grupo a la MESA.
 */

type Fila = Record<string, any>

function fakeSupabase(tablas: Record<string, Fila[]>, opts: { fallaTorneos?: boolean } = {}) {
  let seq = 0
  const from = (tabla: string) => {
    const filas = () => (tablas[tabla] ||= [])
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Fila | Fila[] = {}
    const aplicar = () => filas().filter(f => filtros.every(p => p(f)))
    const respuesta = (data: any) => (tabla === 'torneos' && opts.fallaTorneos ? { data: null, error: { message: 'JWT expired' } } : { data, error: null })
    const builder: any = {
      select: () => builder,
      insert: (v: Fila | Fila[]) => (op = 'insert', payload = v, builder),
      update: (v: Fila) => (op = 'update', payload = v, builder),
      delete: () => (op = 'delete', builder),
      eq: (col: string, val: any) => (filtros.push(f => f[col] === val), builder),
      neq: (col: string, val: any) => (filtros.push(f => f[col] !== val), builder),
      in: (col: string, vals: any[]) => (filtros.push(f => vals.includes(f[col])), builder),
      is: (col: string, val: any) => (filtros.push(f => (f[col] ?? null) === val), builder),
      not: (col: string, _op: string, val: any) => (filtros.push(f => (f[col] ?? null) !== val), builder),
      like: (col: string, patron: string) => (filtros.push(f => String(f[col] ?? '').startsWith(patron.replace('%', ''))), builder),
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(respuesta(aplicar()[0] ?? null)),
      single: () => Promise.resolve(respuesta(aplicar()[0] ?? null)),
      then: (resolve: any) => {
        if (tabla === 'torneos' && opts.fallaTorneos) return resolve({ data: null, error: { message: 'JWT expired' } })
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
  return { from, rpc: vi.fn(async () => ({ data: null, error: null })) }
}

const perfil = { id: 'u1', club_id: 'club', rol: 'admin', nombre: 'Admin' }
const montar = (tablas: Record<string, Fila[]>, opts?: { fallaTorneos?: boolean }) => {
  mocks.requireAdmin.mockResolvedValue({ error: null, supabase: fakeSupabase(tablas, opts), perfil })
  return tablas
}

beforeEach(() => vi.clearAllMocks())

describe('por equipos no se cierra como torneo tradicional', () => {
  it('cerrarInscripcionYGenerarGrupos rechaza un torneo por equipos y no toca la mesa', async () => {
    const t = montar({
      torneos: [{ id: 't1', club_id: 'club', tipo: 'externo', formato: 'equipos', ruedas: 1, estado: 'en_curso', fase: 'inscripcion' }],
      torneo_grupos: [{ id: 'mesa', torneo_id: 't1', nombre: 'MESA' }],
      grupo_jugadores: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, grupo_id: 'mesa', jugador_id: `j${i}`, jugadores: { id: `j${i}`, nombre: `J${i}` } })),
      torneo_partidos: [],
    })
    const res = await cerrarInscripcionYGenerarGrupos({ torneoId: 't1' })
    expect(res.error).toMatch(/por equipos/)
    expect(t.torneo_grupos).toHaveLength(1)
    expect(t.grupo_jugadores).toHaveLength(6)
    expect(t.torneo_partidos).toHaveLength(0)
  })
})

describe('un torneo finalizado no cambia', () => {
  it('no se marca un resultado', async () => {
    montar({
      torneo_partidos: [{ id: 'p1', torneo_id: 't1', fase: 'grupos', grupo_id: 'g1', jugador_a: 'a', jugador_b: 'b', ganador: null, orden: 0, torneos: { formato_grupos: 'bo5', formato_llave: 'bo5', estado: 'finalizado' } }],
    })
    const res = await marcarGanadorPartido({ partidoId: 'p1', setsA: 3, setsB: 0 })
    expect(res.error).toMatch(/finalizado/)
  })

  it('no se corrige un resultado de grupos', async () => {
    const t = montar({
      torneos: [{ id: 't1', club_id: 'club', formato: 'grupos', ruedas: 1, estado: 'finalizado', fase: 'finalizado' }],
      torneo_partidos: [{ id: 'p1', torneo_id: 't1', fase: 'grupos', grupo_id: 'g1', jugador_a: 'a', jugador_b: 'b', ganador: 'a', sets_a: 3, sets_b: 0, orden: 0 }],
    })
    const res = await corregirResultadoGrupos({ partidoId: 'p1', setsA: 0, setsB: 3 })
    expect(res.error).toMatch(/finalizado/)
    expect(t.torneo_partidos[0].ganador).toBe('a')
  })

  it('no se inscribe a nadie', async () => {
    montar({
      torneos: [{ id: 't1', club_id: 'club', tipo: 'externo', cuota_inscripcion: 0, estado: 'finalizado' }],
      torneo_partidos: [],
    })
    const res = await inscribirEnMesa({ torneoId: 't1', busqueda: 'Alguien', rut: '', metodoPago: 'pendiente' })
    expect('error' in res && res.error).toMatch(/finalizado/)
  })
})

describe('la mesa de una eliminación directa con el cuadro armado', () => {
  it('no deja sacar a nadie: el cuadro lo tiene adentro', async () => {
    const t = montar({
      torneos: [{ id: 't1', club_id: 'club', formato: 'eliminacion_consolacion', ruedas: 1, estado: 'en_curso', fase: '8vos' }],
      torneo_grupos: [{ id: 'mesa', torneo_id: 't1', nombre: 'MESA' }],
      grupo_jugadores: [{ id: 'm1', grupo_id: 'mesa', jugador_id: 'j1' }],
    })
    const res = await quitarJugadorDeMesa({ torneoId: 't1', jugadorId: 'j1' })
    expect(res.error).toMatch(/eliminación directa/)
    expect(t.grupo_jugadores).toHaveLength(1)
  })

  it('sí deja mientras sigue en inscripción', async () => {
    const t = montar({
      torneos: [{ id: 't1', club_id: 'club', formato: 'eliminacion_consolacion', ruedas: 1, estado: 'en_curso', fase: 'inscripcion' }],
      torneo_grupos: [{ id: 'mesa', torneo_id: 't1', nombre: 'MESA' }],
      grupo_jugadores: [{ id: 'm1', grupo_id: 'mesa', jugador_id: 'j1' }],
      torneo_cabezas_serie: [],
    })
    const res = await quitarJugadorDeMesa({ torneoId: 't1', jugadorId: 'j1' })
    expect(res.error).toBeUndefined()
    expect(t.grupo_jugadores).toHaveLength(0)
  })
})

describe('la liguilla no cierra con un empate sin resolver', () => {
  // Tres jugadores, cada uno ganó uno 3-0: mismos puntos, mismos sets, mismos
  // puntos de set. Ni la tabla ni el sistema pueden separarlos.
  const liguillaEmpatada = (desempate: { desempate_primero_id?: string; desempate_segundo_id?: string } = {}) => ({
    torneos: [{ id: 't1', club_id: 'club', formato: 'liguilla', ruedas: 1, estado: 'en_curso', fase: 'grupos' }],
    torneo_grupos: [{ id: 'g1', torneo_id: 't1', nombre: 'A', ...desempate }],
    grupo_jugadores: ['a', 'b', 'c'].map((j, i) => ({ id: `m${i}`, grupo_id: 'g1', jugador_id: j, orden: i, jugadores: { id: j, nombre: j.toUpperCase() } })),
    torneo_partidos: [
      { id: 'p1', torneo_id: 't1', grupo_id: 'g1', fase: 'grupos', jugador_a: 'a', jugador_b: 'b', ganador: 'a', sets_a: 3, sets_b: 0, puntos_a: 33, puntos_b: 20, orden: 0 },
      { id: 'p2', torneo_id: 't1', grupo_id: 'g1', fase: 'grupos', jugador_a: 'b', jugador_b: 'c', ganador: 'b', sets_a: 3, sets_b: 0, puntos_a: 33, puntos_b: 20, orden: 1 },
      { id: 'p3', torneo_id: 't1', grupo_id: 'g1', fase: 'grupos', jugador_a: 'c', jugador_b: 'a', ganador: 'c', sets_a: 3, sets_b: 0, puntos_a: 33, puntos_b: 20, orden: 2 },
    ],
  })

  it('sin desempate manual, pide definirlo en vez de elegir por orden de inscripción', async () => {
    const t = montar(liguillaEmpatada())
    const res = await finalizarTorneo({ torneoId: 't1' })
    expect(res.error).toMatch(/desempate/)
    expect(t.torneos[0].estado).toBe('en_curso')
  })

  it('con el desempate del juez, cierra con ese podio', async () => {
    const t = montar(liguillaEmpatada({ desempate_primero_id: 'c', desempate_segundo_id: 'a' }))
    const res = await finalizarTorneo({ torneoId: 't1' })
    expect(res.error).toBeUndefined()
    expect(t.torneos[0]).toMatchObject({ estado: 'finalizado', campeon_id: 'c', subcampeon_id: 'a', tercer_id: 'b' })
  })

  it('un torneo ya finalizado no se finaliza de nuevo', async () => {
    const t = montar(liguillaEmpatada({ desempate_primero_id: 'c', desempate_segundo_id: 'a' }))
    t.torneos[0].estado = 'finalizado'
    const res = await finalizarTorneo({ torneoId: 't1' })
    expect(res.error).toMatch(/finalizado/)
  })
})

describe('reabrirTorneo', () => {
  const finalizado = (premios: Record<string, number | null> = {}) => ({
    torneos: [{ id: 't1', club_id: 'club', formato: 'grupos', estado: 'finalizado', fase: 'finalizado', campeon_id: 'a', subcampeon_id: 'b', tercer_id: 'c', premio_primero: null, premio_segundo: null, premio_tercero: null, premio_consuelo: null, ...premios }],
    torneo_partidos: [
      { id: 's1', torneo_id: 't1', fase: 'semis', orden: 0, jugador_a: 'a', jugador_b: 'c', ganador: 'a' },
      { id: 's2', torneo_id: 't1', fase: 'semis', orden: 1, jugador_a: 'b', jugador_b: 'd', ganador: 'b' },
      { id: 'f', torneo_id: 't1', fase: 'final', orden: 0, jugador_a: 'a', jugador_b: 'b', ganador: 'a' },
    ],
  })

  it('vuelve a en_curso en la última ronda y borra el podio guardado', async () => {
    const t = montar(finalizado())
    const res = await reabrirTorneo({ torneoId: '11111111-1111-4111-8111-111111111111' })
    // El id de arriba no existe: se comprueba el rechazo limpio primero.
    expect(res.error).toMatch(/no encontrado/)
    t.torneos[0].id = '11111111-1111-4111-8111-111111111111'
    t.torneo_partidos.forEach(p => { p.torneo_id = t.torneos[0].id })
    const ok = await reabrirTorneo({ torneoId: t.torneos[0].id })
    expect(ok).toMatchObject({ success: true, fase: 'final' })
    expect(t.torneos[0]).toMatchObject({ estado: 'en_curso', fase: 'final', campeon_id: null, subcampeon_id: null, tercer_id: null })
  })

  it('no reabre si los premios ya se registraron en Finanzas', async () => {
    const t = montar(finalizado({ premio_primero: 20000 }))
    t.torneos[0].id = '11111111-1111-4111-8111-111111111111'
    const res = await reabrirTorneo({ torneoId: t.torneos[0].id })
    expect(res.error).toMatch(/premios/)
    expect(t.torneos[0].estado).toBe('finalizado')
  })

  it('una liguilla reabierta vuelve a la fase de grupos', async () => {
    const t = montar({ torneos: [{ id: '11111111-1111-4111-8111-111111111111', club_id: 'club', formato: 'liguilla', estado: 'finalizado', fase: 'finalizado', campeon_id: 'a', subcampeon_id: 'b', tercer_id: null, premio_primero: null, premio_segundo: null, premio_tercero: null, premio_consuelo: null }] })
    const res = await reabrirTorneo({ torneoId: t.torneos[0].id })
    expect(res).toMatchObject({ success: true, fase: 'grupos' })
  })
})

describe('si el torneo no se puede leer, ninguna acción sigue por "grupos"', () => {
  it('sincronizarLlaves corta con error en vez de armar una llave', async () => {
    const t = montar({
      torneos: [{ id: 't1', club_id: 'club', formato: 'liguilla', estado: 'en_curso', fase: 'grupos' }],
      torneo_grupos: [{ id: 'g1', torneo_id: 't1', nombre: 'A' }],
      torneo_partidos: [],
    }, { fallaTorneos: true })
    const res = await sincronizarLlaves({ torneoId: 't1' })
    expect('error' in res && res.error).toMatch(/No se pudo leer el torneo/)
    expect(t.torneo_partidos).toHaveLength(0)
  })
})

describe('la MESA no es un grupo entre los que mover', () => {
  it('moverJugadorEntreGrupos la rechaza como destino', async () => {
    const t = montar({
      torneos: [{ id: 't1', club_id: 'club', formato: 'grupos', ruedas: 1, estado: 'en_curso', fase: 'grupos' }],
      torneo_grupos: [{ id: 'g1', torneo_id: 't1', nombre: 'A', en_preparacion: false }, { id: 'mesa', torneo_id: 't1', nombre: 'MESA', en_preparacion: false }],
      grupo_jugadores: [{ id: 'm1', grupo_id: 'g1', jugador_id: 'j1', orden: 0 }],
      torneo_partidos: [],
    })
    const res = await moverJugadorEntreGrupos({ torneoId: 't1', jugadorId: 'j1', grupoOrigenId: 'g1', grupoDestinoId: 'mesa' })
    expect(res.error).toMatch(/mesa de inscripción/)
    expect(t.grupo_jugadores[0].grupo_id).toBe('g1')
  })
})
