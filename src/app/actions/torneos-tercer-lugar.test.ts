import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { marcarGanadorPartido, finalizarTorneo, abrirTercerLugar } from './torneos'

type Fila = Record<string, any>

// Mismo Supabase de mentira que torneos-quitar-jugador.test.ts, con lo que la
// mini llave del 3er lugar necesita además: order, limit, is y el select que
// va DESPUÉS de un update (el guard atómico de marcarGanadorPartido).
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
      select: () => (op === 'select' ? (op = 'select', builder) : builder),
      insert: (v: Fila | Fila[]) => (op = 'insert', payload = v, builder),
      update: (v: Fila) => (op = 'update', payload = v, builder),
      delete: () => (op = 'delete', builder),
      eq: (col: string, val: any) => (filtros.push(f => f[col] === val), builder),
      neq: (col: string, val: any) => (filtros.push(f => f[col] !== val), builder),
      is: (col: string, val: any) => (filtros.push(f => (f[col] ?? null) === val), builder),
      in: (col: string, vals: any[]) => (filtros.push(f => vals.includes(f[col])), builder),
      order: (col: string, o?: { ascending?: boolean }) => (orden = { col, asc: o?.ascending !== false }, builder),
      limit: (n: number) => (tope = n, builder),
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

/** Cuadro de 4: dos semis, la primera ya jugada. */
function escenario(over: { tipo?: string; semi2?: Fila; extra?: Fila[] } = {}) {
  return {
    torneos: [{ id: 't1', club_id: 'club', tipo: over.tipo ?? 'interno', fase: 'semis', estado: 'en_curso' }],
    torneo_grupos: [],
    torneo_partidos: [
      { id: 's0', torneo_id: 't1', grupo_id: null, fase: 'semis', orden: 0, jugador_a: 'ana', jugador_b: 'cata', ganador: 'ana' },
      over.semi2 ?? { id: 's1', torneo_id: 't1', grupo_id: null, fase: 'semis', orden: 1, jugador_a: 'beto', jugador_b: 'dani', ganador: null },
      ...(over.extra ?? []),
    ],
  }
}

const montar = (t: Record<string, Fila[]>) => {
  mocks.requireAdmin.mockResolvedValue({ error: null, supabase: fakeSupabase(t), perfil: { club_id: 'club' } })
  mocks.createAdminClient.mockReturnValue(fakeSupabase(t))
  return t
}
const tercerLugar = (t: Record<string, Fila[]>) =>
  t.torneo_partidos.filter(p => p.fase === 'tercer_lugar')

describe('la mini llave del 3er lugar se abre sola', () => {
  beforeEach(() => vi.clearAllMocks())

  it('al cerrar la SEGUNDA semi, con los dos perdedores', async () => {
    const t = montar(escenario())
    const res = await marcarGanadorPartido({ partidoId: 's1', ganadorId: 'beto' })
    expect(res).toEqual({ success: true })
    const mini = tercerLugar(t)
    expect(mini).toHaveLength(1)
    expect(mini[0]).toMatchObject({ fase: 'tercer_lugar', orden: 0, ganador: null })
    // Los que perdieron: cata (le ganó ana) y dani (le ganó beto).
    expect([mini[0].jugador_a, mini[0].jugador_b].sort()).toEqual(['cata', 'dani'])
  })

  it('y la final se sigue completando igual', async () => {
    // Como quedó el cuadro tras la primera semi: ana ya está puesta en la
    // final, esperando rival.
    const t = montar(escenario({
      extra: [{ id: 'f', torneo_id: 't1', grupo_id: null, fase: 'final', orden: 0, jugador_a: 'ana', jugador_b: null, ganador: null }],
    }))
    await marcarGanadorPartido({ partidoId: 's1', ganadorId: 'beto' })
    const final = t.torneo_partidos.filter(p => p.fase === 'final')
    expect(final).toHaveLength(1)
    expect([final[0].jugador_a, final[0].jugador_b]).toEqual(['ana', 'beto'])
    // Y la mini llave se abrió en la misma pasada.
    expect(tercerLugar(t)).toHaveLength(1)
  })

  it('NO se abre mientras falte jugar una semi', async () => {
    const t = montar(escenario({
      semi2: { id: 's1', torneo_id: 't1', grupo_id: null, fase: 'semis', orden: 1, jugador_a: 'beto', jugador_b: 'dani', ganador: null },
      extra: [{ id: 's2', torneo_id: 't1', grupo_id: null, fase: 'semis', orden: 2, jugador_a: 'emi', jugador_b: 'fran', ganador: null }],
    }))
    await marcarGanadorPartido({ partidoId: 's1', ganadorId: 'beto' })
    expect(tercerLugar(t)).toHaveLength(0)
  })

  it('NO se abre en un torneo externo: la regla es de los internos', async () => {
    const t = montar(escenario({ tipo: 'externo' }))
    await marcarGanadorPartido({ partidoId: 's1', ganadorId: 'beto' })
    expect(tercerLugar(t)).toHaveLength(0)
  })

  it('NO se abre si una semi se resolvió por BYE: no dejó perdedor', async () => {
    const t = montar({
      torneos: [{ id: 't1', club_id: 'club', tipo: 'interno', fase: 'semis', estado: 'en_curso' }],
      torneo_grupos: [],
      torneo_partidos: [
        { id: 's0', torneo_id: 't1', grupo_id: null, fase: 'semis', orden: 0, jugador_a: 'ana', jugador_b: null, ganador: 'ana' },
        { id: 's1', torneo_id: 't1', grupo_id: null, fase: 'semis', orden: 1, jugador_a: 'beto', jugador_b: 'dani', ganador: null },
      ],
    })
    await marcarGanadorPartido({ partidoId: 's1', ganadorId: 'beto' })
    expect(tercerLugar(t)).toHaveLength(0)
  })

  it('no pisa un 3er lugar que YA se jugó', async () => {
    const t = montar(escenario({
      extra: [{ id: 'x', torneo_id: 't1', grupo_id: null, fase: 'tercer_lugar', orden: 0, jugador_a: 'cata', jugador_b: 'dani', ganador: 'dani' }],
    }))
    await marcarGanadorPartido({ partidoId: 's1', ganadorId: 'beto' })
    const mini = tercerLugar(t)
    expect(mini).toHaveLength(1)
    expect(mini[0].ganador).toBe('dani')
  })

  it('marcar el 3er lugar no crea ninguna fase siguiente', async () => {
    const t = montar({
      torneos: [{ id: 't1', club_id: 'club', tipo: 'interno', fase: 'final', estado: 'en_curso' }],
      torneo_grupos: [],
      torneo_partidos: [
        { id: 'x', torneo_id: 't1', grupo_id: null, fase: 'tercer_lugar', orden: 0, jugador_a: 'cata', jugador_b: 'dani', ganador: null },
      ],
    })
    const res = await marcarGanadorPartido({ partidoId: 'x', ganadorId: 'dani' })
    expect(res).toEqual({ success: true })
    expect(t.torneo_partidos).toHaveLength(1)
    expect(t.torneos[0].fase).toBe('final')
  })
})

describe('finalizarTorneo con 3er lugar', () => {
  beforeEach(() => vi.clearAllMocks())

  const conFinal = (tercero: Fila | null) => ({
    torneos: [{ id: 't1', club_id: 'club', tipo: 'interno', fase: 'final', estado: 'en_curso' }],
    torneo_grupos: [],
    torneo_partidos: [
      { id: 'f', torneo_id: 't1', grupo_id: null, fase: 'final', orden: 0, jugador_a: 'ana', jugador_b: 'beto', ganador: 'ana' },
      ...(tercero ? [tercero] : []),
    ],
  })

  it('no deja cerrar el torneo con la mini llave sin jugar', async () => {
    const t = montar(conFinal({ id: 'x', torneo_id: 't1', grupo_id: null, fase: 'tercer_lugar', orden: 0, jugador_a: 'cata', jugador_b: 'dani', ganador: null }))
    const res = await finalizarTorneo({ torneoId: 't1' })
    expect(res.error).toContain('3er lugar')
    expect(t.torneos[0].estado).toBe('en_curso')
  })

  it('guarda el podio completo cuando sí se jugó', async () => {
    const t = montar(conFinal({ id: 'x', torneo_id: 't1', grupo_id: null, fase: 'tercer_lugar', orden: 0, jugador_a: 'cata', jugador_b: 'dani', ganador: 'dani' }))
    const res = await finalizarTorneo({ torneoId: 't1' })
    expect(res.error).toBeUndefined()
    expect(t.torneos[0]).toMatchObject({
      estado: 'finalizado', campeon_id: 'ana', subcampeon_id: 'beto', tercer_id: 'dani',
    })
  })

  it('un torneo sin mini llave se cierra como siempre', async () => {
    const t = montar(conFinal(null))
    const res = await finalizarTorneo({ torneoId: 't1' })
    expect(res.error).toBeUndefined()
    expect(t.torneos[0]).toMatchObject({ estado: 'finalizado', campeon_id: 'ana', subcampeon_id: 'beto' })
    expect(t.torneos[0].tercer_id).toBeUndefined()
  })
})

describe('abrirTercerLugar (para torneos que ya tenían las semis cerradas)', () => {
  beforeEach(() => vi.clearAllMocks())

  // El caso TC"A": semis y final ya marcadas antes de que existiera la regla,
  // así que el automatismo (que corre al cerrar una semi) no tiene qué disparar.
  const ID = '11111111-1111-4111-8111-111111111111'
  const yaJugado = () => ({
    torneos: [{ id: ID, club_id: 'club', tipo: 'interno', fase: 'final', estado: 'en_curso' }],
    torneo_grupos: [],
    torneo_partidos: [
      { id: 's0', torneo_id: ID, grupo_id: null, fase: 'semis', orden: 0, jugador_a: 'ana', jugador_b: 'cata', ganador: 'ana' },
      { id: 's1', torneo_id: ID, grupo_id: null, fase: 'semis', orden: 1, jugador_a: 'beto', jugador_b: 'dani', ganador: 'beto' },
      { id: 'f', torneo_id: ID, grupo_id: null, fase: 'final', orden: 0, jugador_a: 'ana', jugador_b: 'beto', ganador: 'ana' },
    ],
  })

  it('crea la mini llave con los dos perdedores', async () => {
    const t = montar(yaJugado())
    expect(await abrirTercerLugar({ torneoId: ID })).toEqual({ success: true })
    const mini = tercerLugar(t)
    expect(mini).toHaveLength(1)
    expect([mini[0].jugador_a, mini[0].jugador_b].sort()).toEqual(['cata', 'dani'])
    expect(mini[0].ganador).toBeNull()
  })

  it('no crea nada si el torneo es externo', async () => {
    const t = montar(yaJugado())
    t.torneos[0].tipo = 'externo'
    const res = await abrirTercerLugar({ torneoId: ID })
    expect(res.error).toContain('semifinales')
    expect(tercerLugar(t)).toHaveLength(0)
  })

  it('rechaza un id que no es uuid', async () => {
    montar(yaJugado())
    expect(await abrirTercerLugar({ torneoId: 'no-es-uuid' })).toEqual({ error: 'Torneo inválido' })
  })

  it('avisa cuando no hay dos perdedores que enfrentar', async () => {
    montar({
      torneos: [{ id: '11111111-1111-4111-8111-111111111111', club_id: 'club', tipo: 'interno', fase: 'semis', estado: 'en_curso' }],
      torneo_grupos: [],
      torneo_partidos: [
        { id: 's0', torneo_id: '11111111-1111-4111-8111-111111111111', grupo_id: null, fase: 'semis', orden: 0, jugador_a: 'ana', jugador_b: 'cata', ganador: 'ana' },
      ],
    })
    const res = await abrirTercerLugar({ torneoId: '11111111-1111-4111-8111-111111111111' })
    expect(res.error).toContain('semifinales')
  })
})

describe('resembrar la mini llave que quedó sin cupos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rellena la fila vacía que deja el RPC al corregir una semi', async () => {
    // El RPC de corrección vacía los dos cupos para que el servidor los vuelva
    // a llenar. Si esa segunda parte falló, la fila queda así.
    const ID = '11111111-1111-4111-8111-111111111111'
    const t = montar({
      torneos: [{ id: ID, club_id: 'club', tipo: 'interno', fase: 'final', estado: 'en_curso' }],
      torneo_grupos: [],
      torneo_partidos: [
        { id: 's0', torneo_id: ID, grupo_id: null, fase: 'semis', orden: 0, jugador_a: 'ana', jugador_b: 'cata', ganador: 'cata' },
        { id: 's1', torneo_id: ID, grupo_id: null, fase: 'semis', orden: 1, jugador_a: 'beto', jugador_b: 'dani', ganador: 'beto' },
        { id: 'x', torneo_id: ID, grupo_id: null, fase: 'tercer_lugar', orden: 0, jugador_a: null, jugador_b: null, ganador: null },
      ],
    })
    expect(await abrirTercerLugar({ torneoId: ID })).toEqual({ success: true })
    const mini = tercerLugar(t)
    expect(mini).toHaveLength(1)
    expect([mini[0].jugador_a, mini[0].jugador_b].sort()).toEqual(['ana', 'dani'])
  })
})
