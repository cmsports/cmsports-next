import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))

import {
  asignarJugadoresDivision,
  crearLiga,
  generarFixtureDivisionAction,
  registrarWalkover,
} from './liga'

describe('acciones críticas de liga', () => {
  beforeEach(() => vi.clearAllMocks())

  it('corta todas las operaciones representativas sin autorización', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado', supabase: null, clubId: null })

    await expect(asignarJugadoresDivision({ divisionId: 'div-1', jugadorIds: ['a', 'b'] }))
      .resolves.toEqual({ error: 'Acceso denegado' })
    await expect(generarFixtureDivisionAction({ divisionId: 'div-1' }))
      .resolves.toEqual({ error: 'Acceso denegado' })
    await expect(crearLiga({ nombre: 'Liga', totalFechas: 5, montoInscripcionDefault: 1000 }))
      .resolves.toEqual({ error: 'Acceso denegado' })
    await expect(registrarWalkover({ partidoId: 'partido-1', ganadorId: 'jugador-a' }))
      .resolves.toEqual({ error: 'Acceso denegado' })
  })

  it('rechaza un ganador ajeno al partido', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'partido-1', jugador_a_id: 'a', jugador_b_id: 'b', estado: 'programado' },
    })
    const selectChain = { eq: vi.fn().mockReturnThis(), single }
    const update = vi.fn()
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => selectChain), update })) }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: 'club-1' })

    const resultado = await registrarWalkover({ partidoId: 'partido-1', ganadorId: 'externo' })

    expect(resultado).toEqual({ error: 'El ganador del walkover debe ser uno de los dos jugadores del partido' })
    expect(update).not.toHaveBeenCalled()
  })

  it('evita confirmar dos veces el mismo walkover', async () => {
    const selectSingle = vi.fn().mockResolvedValue({
      data: { id: 'partido-1', jugador_a_id: 'a', jugador_b_id: 'b', estado: 'programado' },
    })
    const selectChain = { eq: vi.fn().mockReturnThis(), single: selectSingle }
    const updateSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const updateChain = {
      eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), select: updateSelect,
    }
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => selectChain),
        update: vi.fn(() => updateChain),
      })),
    }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: 'club-1' })

    const resultado = await registrarWalkover({ partidoId: 'partido-1', ganadorId: 'a' })

    expect(resultado).toEqual({ error: 'Este partido ya fue resuelto' })
    expect(updateChain.not).toHaveBeenCalledWith('estado', 'in', '("finalizado","walkover")')
  })
})
