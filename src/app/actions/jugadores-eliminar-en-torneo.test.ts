import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), createAdminClient: vi.fn(), retirar: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub, requirePerfil: vi.fn(), requireStaffClub: vi.fn(), requireGestorTorneos: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/app/actions/horario', () => ({ asignarBloquesJugador: vi.fn() }))
vi.mock('@/app/actions/torneos', () => ({ retirarJugadorDeTorneo: mocks.retirar }))

import { eliminarJugador } from './jugadores'

/**
 * Eliminar a un jugador que está en los grupos de un torneo vivo dejaba sus
 * partidos contra nadie ("vs —") y al grupo con uno menos, sin rearmar nada:
 * sub19 (2026-08-16), TCB (2026-09-06) y TC A / TC B (2026-10-25).
 *
 * Entre el 26 y el 29 de octubre el borrado se negaba. Ahora un jugador que se
 * arrepiente tiene que poder irse: primero se lo retira del torneo (sale y el
 * grupo se rehace, o queda retirado con W.O.) y recién después se borra. Si ya
 * había jugado, la ficha espera al final del torneo.
 */

const JUGADOR = '11111111-1111-4111-8111-111111111111'
const CLUB = '33333333-3333-4333-8333-333333333333'
const TORNEO = '44444444-4444-4444-8444-444444444444'

// Un constructor de consultas mínimo: encadenable y esperable.
function consulta(data: unknown, error: { message: string } | null = null) {
  const b: Record<string, unknown> = {
    select: () => b, eq: () => b, in: () => b, update: vi.fn(() => b),
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
    return supabase
  }

  const enTorneoVivo = (jugadores = consulta([{ id: JUGADOR }])) => ({
    jugadores,
    grupo_jugadores: consulta([{ grupo_id: 'g1' }]),
    torneo_grupos: consulta([{ id: 'g1', nombre: 'B', torneo_id: TORNEO }]),
    torneos: consulta([{ id: TORNEO, nombre: 'TC A', estado: 'en_curso' }]),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    rpc.mockResolvedValue({ error: null })
  })

  it('no había jugado: lo retira del torneo (sale y se rehace el grupo) y lo borra en el acto', async () => {
    mocks.retirar.mockResolvedValue({ success: true, modo: 'quitado', avisos: [] })
    montar(enTorneoVivo())
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect(mocks.retirar).toHaveBeenCalledWith({ torneoId: TORNEO, jugadorId: JUGADOR })
    expect(rpc).toHaveBeenCalledWith('eliminar_jugador_atomico', { p_jugador_id: JUGADOR })
    expect(r).toEqual({ success: true })
  })

  it('ya había jugado: queda retirado, NO se borra todavía y se programa para el final del torneo', async () => {
    mocks.retirar.mockResolvedValue({ success: true, modo: 'retirado', avisos: [] })
    const jugadores = consulta([{ id: JUGADOR }])
    montar(enTorneoVivo(jugadores))
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect(rpc).not.toHaveBeenCalled()
    expect(jugadores.update).toHaveBeenCalledWith({ borrar_al_finalizar_torneo: true })
    expect(r).toMatchObject({ success: true, diferido: true })
    expect('mensaje' in r && r.mensaje).toContain('"TC A"')
  })

  it('si no se puede retirar del torneo, no borra nada y explica por qué', async () => {
    mocks.retirar.mockResolvedValue({ error: 'Su grupo quedaría con un solo jugador.' })
    montar(enTorneoVivo())
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect(rpc).not.toHaveBeenCalled()
    expect('error' in r && r.error).toContain('"TC A"')
    expect('error' in r && r.error).toContain('No se eliminó al jugador')
  })

  it('si quedó retirado pero no se pudo programar el borrado, lo dice (no responde "listo")', async () => {
    mocks.retirar.mockResolvedValue({ success: true, modo: 'retirado', avisos: [] })
    // La ficha existe al leerla, pero el update no confirma ninguna fila (por
    // ejemplo, RLS): su `select` vuelve vacío.
    const fichaSinConfirmar = Object.assign(consulta([]), {
      maybeSingle: async () => ({ data: { id: JUGADOR }, error: null }),
    })
    montar(enTorneoVivo(fichaSinConfirmar))
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect(rpc).not.toHaveBeenCalled()
    expect('error' in r && r.error).toContain('no se pudo dejar programado')
  })

  it('la MESA (bolsa de inscripción) no lo retira de nada: no tiene partidos', async () => {
    montar({
      jugadores: consulta({ id: JUGADOR }),
      grupo_jugadores: consulta([{ grupo_id: 'mesa' }]),
      torneo_grupos: consulta([{ id: 'mesa', nombre: 'MESA', torneo_id: TORNEO }]),
      torneos: consulta([{ id: TORNEO, nombre: 'TC A', estado: 'en_curso' }]),
    })
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect(mocks.retirar).not.toHaveBeenCalled()
    expect(r).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('eliminar_jugador_atomico', { p_jugador_id: JUGADOR })
  })

  it('un torneo finalizado, archivado o cancelado no pasa por el retiro', async () => {
    for (const estado of ['finalizado', 'archivado', 'cancelado']) {
      rpc.mockClear(); mocks.retirar.mockClear()
      montar({
        jugadores: consulta({ id: JUGADOR }),
        grupo_jugadores: consulta([{ grupo_id: 'g1' }]),
        torneo_grupos: consulta([{ id: 'g1', nombre: 'A', torneo_id: TORNEO }]),
        torneos: consulta([{ id: TORNEO, nombre: 'Viejo', estado }]),
      })
      expect(await eliminarJugador({ jugadorId: JUGADOR })).toEqual({ success: true })
      expect(mocks.retirar).not.toHaveBeenCalled()
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
    expect('error' in r && r.error).toContain('No se pudo revisar')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('si la base frena el borrado (migración 306), el error llega a la pantalla', async () => {
    mocks.retirar.mockResolvedValue({ success: true, modo: 'quitado', avisos: [] })
    rpc.mockResolvedValue({ error: { message: 'El jugador sigue en un grupo del torneo en curso "TC A".' } })
    montar(enTorneoVivo())
    const r = await eliminarJugador({ jugadorId: JUGADOR })
    expect('error' in r && r.error).toContain('torneo en curso')
  })
})
