import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireGestor: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdmin: mocks.requireGestor, requireGestorTorneos: mocks.requireGestor }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => { throw new Error('sin admin en la prueba') }) }))

import {
  cerrarInscripcionYGenerarGrupos,
  limpiarGruposHuerfanos,
  moverJugadorEntreGrupos,
  quitarJugadorDeGrupo,
  verificarTorneo,
} from './torneos'
import { generarRoundRobin } from '@/lib/domain/torneos'
import { inconsistenciasDeGrupos } from '@/lib/domain/torneoConsistencia'

/**
 * Qué se comprueba acá y por qué.
 *
 * El 2026-10-25 un movimiento de jugadores dejó TC A y TC B con partidos contra
 * quien ya no estaba en el grupo, y la acción respondió éxito. Las pruebas de
 * antes miraban el mensaje que devolvía la acción; estas miran el ESTADO FINAL
 * de las tablas con `inconsistenciasDeGrupos`, que es lo que de verdad importa.
 *
 * Y cada acción que lee antes de decidir se prueba con esa lectura fallando:
 * si falla, la acción tiene que cortar sin tocar nada, no seguir con una guarda
 * que quedó en null.
 */

type Fila = Record<string, any>
type Opciones = {
  /** Esa tabla responde los SELECT con la foto de la primera lectura (producción, 2026-10-25). */
  lecturaVieja?: string
  /** Los SELECT de esas tablas devuelven error. */
  lecturaFalla?: string[]
  /** Los DELETE de esas tablas devuelven error. */
  borradoFalla?: string[]
  /** Los UPDATE de esas tablas no tocan ninguna fila y no dan error (lo que hace un RLS que filtra). */
  updateSinFilas?: string[]
}

function fakeSupabase(tablas: Record<string, Fila[]>, opts: Opciones = {}) {
  let seq = 0
  let foto: Fila[] | null = null
  const from = (tabla: string) => {
    const filas = () => (tablas[tabla] ||= [])
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Fila | Fila[] = {}
    const aplicar = () => filas().filter(f => filtros.every(p => p(f)))
    const leer = () => {
      if (tabla !== opts.lecturaVieja) return aplicar()
      foto ??= structuredClone(filas())
      return foto.filter(f => filtros.every(p => p(f)))
    }
    const lecturaRota = () => op === 'select' && !!opts.lecturaFalla?.includes(tabla)
    const respuesta = (data: any) => (lecturaRota() ? { data: null, error: { message: 'timeout de lectura' } } : { data, error: null })
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
        if (lecturaRota()) return resolve({ data: null, error: { message: 'timeout de lectura' } })
        if (op === 'delete' && opts.borradoFalla?.includes(tabla)) return resolve({ data: null, error: { message: 'no se pudo borrar' } })
        if (op === 'insert') {
          const nuevas = (Array.isArray(payload) ? payload : [payload]).map(v => ({ id: `gen-${seq++}`, ...v }))
          filas().push(...nuevas)
          return resolve({ data: nuevas, error: null })
        }
        if (op === 'update') {
          if (opts.updateSinFilas?.includes(tabla)) return resolve({ data: [], error: null })
          const tocadas = aplicar()
          tocadas.forEach(f => Object.assign(f, payload))
          return resolve({ data: tocadas, error: null })
        }
        if (op === 'delete') {
          const fuera = new Set(aplicar())
          tablas[tabla] = filas().filter(f => !fuera.has(f))
          return resolve({ data: null, error: null })
        }
        return resolve({ data: leer(), error: null })
      },
    }
    return builder
  }
  return { from, rpc: vi.fn(async () => ({ data: null, error: null })) }
}

const perfil = { id: 'u1', club_id: 'club', rol: 'admin', nombre: 'Admin' }
const montar = (tablas: Record<string, Fila[]>, opts?: Opciones) => {
  mocks.requireGestor.mockResolvedValue({ error: null, supabase: fakeSupabase(tablas, opts), perfil })
  return tablas
}

beforeEach(() => vi.clearAllMocks())

/** Un torneo de grupos en juego: A con 4 jugadores y B con 3, todos sus partidos armados. */
function torneoEnJuego(extra: Partial<Record<string, Fila[]>> = {}) {
  const idsA = ['a0', 'a1', 'a2', 'a3']
  const idsB = ['b0', 'b1', 'b2']
  const partidos = (g: string, ids: string[]) => generarRoundRobin(ids).map(([a, b], orden) => ({ id: `${g}-p${orden}`, torneo_id: 't1', grupo_id: g, fase: 'grupos', jugador_a: a, jugador_b: b, orden, ganador: null }))
  return {
    torneos: [{ id: 't1', club_id: 'club', formato: 'grupos', ruedas: 1, estado: 'en_curso', fase: 'grupos' }],
    torneo_grupos: [{ id: 'gA', torneo_id: 't1', nombre: 'A', en_preparacion: false }, { id: 'gB', torneo_id: 't1', nombre: 'B', en_preparacion: false }],
    grupo_jugadores: [
      ...idsA.map((j, orden) => ({ id: `m-${j}`, grupo_id: 'gA', jugador_id: j, orden })),
      ...idsB.map((j, orden) => ({ id: `m-${j}`, grupo_id: 'gB', jugador_id: j, orden })),
    ],
    torneo_partidos: [...partidos('gA', idsA), ...partidos('gB', idsB)],
    ...extra,
  } as Record<string, Fila[]>
}

/** Lo que de verdad importa: el estado final de las tablas, no el mensaje de la acción. */
const inconsistenciasDe = (t: Record<string, Fila[]>) => inconsistenciasDeGrupos({
  grupos: t.torneo_grupos as any,
  miembros: t.grupo_jugadores as any,
  partidos: t.torneo_partidos.filter(p => p.fase === 'grupos') as any,
})

describe('verificarTorneo', () => {
  it('un torneo sano sale limpio y dice cuánto miró', async () => {
    montar(torneoEnJuego())
    const res = await verificarTorneo({ torneoId: 't1' })
    expect(res).toMatchObject({ inconsistencias: [], grupos: 2, partidos: 9 })
  })

  it('detecta el estado en que quedaron TC A y TC B el 2026-10-25', async () => {
    const t = torneoEnJuego()
    // a3 figura en B, pero los partidos se regeneraron con la foto de antes: A siguió con a3 y B no lo tiene.
    t.grupo_jugadores.find(m => m.jugador_id === 'a3')!.grupo_id = 'gB'
    montar(t)
    const res = await verificarTorneo({ torneoId: 't1' }) as any
    const codigos = res.inconsistencias.map((i: any) => i.codigo)
    expect(codigos).toContain('partido_con_jugador_ajeno')
    expect(codigos).toContain('pareja_sin_partido')
  })

  it('no mira el torneo de otro club', async () => {
    const t = torneoEnJuego()
    t.torneos[0].club_id = 'otro-club'
    montar(t)
    expect((await verificarTorneo({ torneoId: 't1' })).error).toBe('Acceso denegado')
  })

  it('un torneo por equipos no usa grupos: no hay nada que verificar', async () => {
    const t = torneoEnJuego()
    t.torneos[0].formato = 'equipos'
    montar(t)
    expect(await verificarTorneo({ torneoId: 't1' })).toMatchObject({ inconsistencias: [], grupos: 0, partidos: 0 })
  })

  it('si no puede leer los partidos lo dice, en vez de dar el torneo por sano', async () => {
    montar(torneoEnJuego(), { lecturaFalla: ['torneo_partidos'] })
    const res = await verificarTorneo({ torneoId: 't1' }) as any
    expect(res.error).toMatch(/partidos/)
    expect(res.inconsistencias).toBeUndefined()
  })
})

describe('moverJugadorEntreGrupos deja el torneo consistente', () => {
  const mover = () => moverJugadorEntreGrupos({ torneoId: 't1', jugadorId: 'a3', grupoOrigenId: 'gA', grupoDestinoId: 'gB' })

  it('aunque la relectura de grupo_jugadores venga vieja, como en producción el 2026-10-25', async () => {
    const t = montar(torneoEnJuego(), { lecturaVieja: 'grupo_jugadores' })
    expect(inconsistenciasDe(t)).toEqual([])
    const res = await mover()
    expect(res.error).toBeUndefined()
    expect(inconsistenciasDe(t)).toEqual([])
    expect(t.torneo_partidos.filter(p => p.grupo_id === 'gA')).toHaveLength(3) // 3 jugadores: 3 partidos
    expect(t.torneo_partidos.filter(p => p.grupo_id === 'gB')).toHaveLength(6) // 4 jugadores: 6 partidos
  })

  it('si el movimiento no toca ninguna fila (un RLS que filtra), avisa y no regenera nada', async () => {
    const t = montar(torneoEnJuego(), { updateSinFilas: ['grupo_jugadores'] })
    const antes = structuredClone(t.torneo_partidos)
    const res = await mover()
    expect(res.error).toMatch(/No se pudo mover/)
    expect(t.torneo_partidos).toEqual(antes)
    expect(inconsistenciasDe(t)).toEqual([])
  })

  it('si no puede leer los partidos de los grupos, no mueve a nadie ni borra resultados', async () => {
    const t = montar(torneoEnJuego(), { lecturaFalla: ['torneo_partidos'] })
    t.torneo_partidos[0].ganador = 'a0' // un resultado ya jugado
    const antes = structuredClone(t.grupo_jugadores)
    const res = await mover()
    expect(res.error).toBeDefined()
    expect(t.grupo_jugadores).toEqual(antes)
    expect(t.torneo_partidos.some(p => p.ganador === 'a0')).toBe(true)
  })

  it('con un resultado ya jugado en alguno de los dos grupos, se niega', async () => {
    const t = montar(torneoEnJuego())
    t.torneo_partidos.find(p => p.grupo_id === 'gB')!.ganador = 'b0'
    const res = await mover()
    expect(res.error).toMatch(/partidos jugados/)
    expect(t.grupo_jugadores.find(m => m.jugador_id === 'a3')!.grupo_id).toBe('gA')
  })
})

describe('quitarJugadorDeGrupo', () => {
  it('si no puede leer los partidos, no quita a nadie', async () => {
    const t = montar(torneoEnJuego(), { lecturaFalla: ['torneo_partidos'] })
    const res = await quitarJugadorDeGrupo({ torneoId: 't1', grupoId: 'gA', jugadorId: 'a3' })
    expect(res.error).toBeDefined()
    expect(t.grupo_jugadores.some(m => m.jugador_id === 'a3' && m.grupo_id === 'gA')).toBe(true)
    expect(inconsistenciasDe(t)).toEqual([])
  })

  it('al quitarlo, el grupo queda consistente', async () => {
    const t = montar(torneoEnJuego())
    const res = await quitarJugadorDeGrupo({ torneoId: 't1', grupoId: 'gA', jugadorId: 'a3' })
    expect(res.error).toBeUndefined()
    expect(inconsistenciasDe(t)).toEqual([])
  })
})

describe('limpiarGruposHuerfanos', () => {
  const conVacios = () => {
    const t = torneoEnJuego()
    t.torneo_grupos.push(
      { id: 'gV', torneo_id: 't1', nombre: 'V', en_preparacion: false }, // vacío, sin partidos: huérfano de verdad
      { id: 'gR', torneo_id: 't1', nombre: 'R', en_preparacion: false }, // vacío pero con un resultado jugado
    )
    t.torneo_partidos.push({ id: 'gR-p0', torneo_id: 't1', grupo_id: 'gR', fase: 'grupos', jugador_a: 'x', jugador_b: 'y', orden: 0, ganador: 'x' })
    return t
  }

  it('si no puede leer los integrantes, NO borra ningún grupo (antes los borraba todos)', async () => {
    const t = montar(conVacios(), { lecturaFalla: ['grupo_jugadores'] })
    const res = await limpiarGruposHuerfanos({ torneoId: 't1' })
    expect(res.error).toMatch(/No se borró nada/)
    expect(t.torneo_grupos).toHaveLength(4)
    expect(t.torneo_partidos).toHaveLength(10)
  })

  it('borra el grupo vacío sin resultados y respeta el vacío que tiene un resultado jugado', async () => {
    const t = montar(conVacios())
    const res = await limpiarGruposHuerfanos({ torneoId: 't1' }) as any
    expect(res).toMatchObject({ success: true, eliminados: 1, omitidos: 1 })
    expect(t.torneo_grupos.map(g => g.id).sort()).toEqual(['gA', 'gB', 'gR'])
    expect(t.torneo_partidos.some(p => p.grupo_id === 'gR' && p.ganador === 'x')).toBe(true)
  })

  it('si el borrado falla, lo dice en vez de responder éxito', async () => {
    montar(conVacios(), { borradoFalla: ['torneo_grupos'] })
    const res = await limpiarGruposHuerfanos({ torneoId: 't1' })
    expect(res.error).toMatch(/No se pudieron borrar los grupos/)
  })
})

describe('cerrarInscripcionYGenerarGrupos no destruye un torneo ya jugado', () => {
  it('rechaza armar de nuevo si hay un resultado cargado y no toca los partidos', async () => {
    const t = montar(torneoEnJuego({ torneos: [{ id: 't1', club_id: 'club', tipo: 'externo', formato: 'grupos', ruedas: 1, estado: 'en_curso', fase: 'grupos' }] }))
    t.torneo_partidos[0].ganador = 'a0'
    const res = await cerrarInscripcionYGenerarGrupos({ torneoId: 't1' })
    expect(res.error).toMatch(/Ya hay partidos con resultado/)
    expect(t.torneo_partidos).toHaveLength(9)
    expect(t.torneo_partidos[0].ganador).toBe('a0')
  })
})
