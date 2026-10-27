import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub, requirePerfil: vi.fn(), requireStaffClub: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/app/actions/horario', () => ({ asignarBloquesJugador: vi.fn() }))

import { eliminarJugador } from './jugadores'

/**
 * Eliminar a un jugador que está en los grupos de un torneo vivo dejaba sus
 * partidos contra nadie ("vs —") y al grupo con uno menos, sin rearmar nada:
 * TCB (2026-09-06) y TC A / TC B (2026-10-25). El borrado tiene que negarse y
 * mandar a quitarlo desde el torneo, que sí regenera los partidos.
 */

const JUGADOR = '11111111-1111-4111-8111-111111111111'
const CLUB = '33333333-3333-4333-8333-333333333333'

// Un constructor de consultas mínimo: encadenable y esperable.
function consulta(data: unknown, error: { message: string } | null = null) {
  const b: Record<string, unknown> = {
    select: () => b, eq: () => b, in: () => b,
    maybeSingle: async () => ({ data: Array.isArray(data) ? (data[0] ?? null) : data, error }),
    then: (resolver: (v: { data: unknown; error: unknown }) => unknown) => resolver({ data, error }),
  }
  return b
}

describe('eliminarJugador y los torneos vivos', () => {
  const rpc = vi.fn()

  function montar(tablas: Record<string, ReturnType<typeof consulta>>) {
    const supabase = {
      from: vi.fn((t: string) => tablas[t] ?? consulta([])),
      rpc,
    }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: CLUB })
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => consulta([])),
      storage: { from: () => ({ remove: vi.fn().mockResolvedValue({}) }) },
      auth: { admin: { deleteUser: vi.fn().mockResolvedValue({}) } },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    rpc.mockResolvedValue({ error: null })
  })

  it('se niega si está en un grupo de un torneo en curso, y no llama al borrado', async () => {
    montar({
      jugadores: consulta({ id: JUGADOR }),
      grupo_jugadores: consulta([{ grupo_id: 'g1' }]),
      torneo_grupos: consulta([{ id: 'g1', nombre: 'B', torneo_id: 't1' }]),
      torneos: consulta([{ id: 't1', nombre: 'TC A', estado: 'en_curso' }]),
    })
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect(r.error).toContain('"TC A" (grupo B)')
    expect(r.error).toContain('Sácalo primero del grupo')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('también en un torneo todavía en inscripción con grupos armados', async () => {
    montar({
      jugadores: consulta({ id: JUGADOR }),
      grupo_jugadores: consulta([{ grupo_id: 'g1' }]),
      torneo_grupos: consulta([{ id: 'g1', nombre: 'A', torneo_id: 't1' }]),
      torneos: consulta([{ id: 't1', nombre: 'TC B', estado: 'inscripcion' }]),
    })
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect(r.error).toContain('"TC B"')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('la MESA (bolsa de inscripción) no lo frena: no tiene partidos', async () => {
    montar({
      jugadores: consulta({ id: JUGADOR }),
      grupo_jugadores: consulta([{ grupo_id: 'mesa' }]),
      torneo_grupos: consulta([{ id: 'mesa', nombre: 'MESA', torneo_id: 't1' }]),
      torneos: consulta([{ id: 't1', nombre: 'TC A', estado: 'en_curso' }]),
    })
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect(r).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('eliminar_jugador_atomico', { p_jugador_id: JUGADOR })
  })

  it('un torneo finalizado, archivado o cancelado tampoco lo frena', async () => {
    for (const estado of ['finalizado', 'archivado', 'cancelado']) {
      rpc.mockClear()
      montar({
        jugadores: consulta({ id: JUGADOR }),
        grupo_jugadores: consulta([{ grupo_id: 'g1' }]),
        torneo_grupos: consulta([{ id: 'g1', nombre: 'A', torneo_id: 't1' }]),
        torneos: consulta([{ id: 't1', nombre: 'Viejo', estado }]),
      })
      expect(await eliminarJugador({ jugadorId: JUGADOR })).toEqual({ success: true })
      expect(rpc).toHaveBeenCalledTimes(1)
    }
  })

  it('un jugador que no está en ningún torneo se elimina como siempre', async () => {
    montar({ jugadores: consulta({ id: JUGADOR }), grupo_jugadores: consulta([]) })
    expect(await eliminarJugador({ jugadorId: JUGADOR })).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('si no puede revisar los torneos, NO borra (el silencio sería el peor resultado)', async () => {
    montar({
      jugadores: consulta({ id: JUGADOR }),
      grupo_jugadores: consulta(null, { message: 'caído' }),
    })
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect(r.error).toContain('No se pudo revisar')
    expect(rpc).not.toHaveBeenCalled()
  })
})
