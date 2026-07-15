import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePerfil: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/require', () => ({ requirePerfil: mocks.requirePerfil }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { confirmarFeedbackAction, guardarFeedbackAction } from './feedback'

function consultaUna(data: unknown, error: { message: string } | null = null) {
  const cadena: any = {}
  cadena.select = vi.fn(() => cadena)
  cadena.eq = vi.fn(() => cadena)
  cadena.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return cadena
}

function mutacion(error: { message: string } | null = null) {
  const cadena: any = { error }
  cadena.eq = vi.fn(() => cadena)
  return cadena
}

describe('acciones de feedback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('impide que un jugador cree feedback', async () => {
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: { from: vi.fn() },
      perfil: { rol: 'jugador', club_id: 'club-1', jugador_id: 'jugador-1' },
    })

    await expect(guardarFeedbackAction({
      jugadorId: 'jugador-1',
      periodo: 'Q3-2026',
      feedback: 'Buen progreso',
    })).resolves.toEqual({ error: 'Acceso denegado' })
  })

  it('permite al profesor crear feedback solo para un jugador de su club', async () => {
    const jugador = consultaUna({ id: 'jugador-1' })
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((tabla: string) => {
      if (tabla === 'jugadores') return jugador
      if (tabla === 'evaluaciones_trimestrales') return { insert }
      throw new Error(`Tabla inesperada: ${tabla}`)
    })
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: { from },
      perfil: { rol: 'profesor', club_id: 'club-1', jugador_id: null },
    })

    const resultado = await guardarFeedbackAction({
      jugadorId: 'jugador-1',
      periodo: 'Q3-2026',
      feedback: '  Buen progreso  ',
      meta: '  Mejorar saque  ',
    })

    expect(resultado).toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      club_id: 'club-1',
      jugador_id: 'jugador-1',
      feedback_profesor: 'Buen progreso',
      meta_proximo_periodo: 'Mejorar saque',
      firmado_alumno: false,
    }))
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/perfil')
  })

  it('reinicia la confirmación cuando admin o profesor edita el informe', async () => {
    const jugador = consultaUna({ id: 'jugador-1' })
    const evaluacion = consultaUna({ id: 'evaluacion-1' })
    const actualizacion = mutacion()
    const update = vi.fn(() => actualizacion)
    let consultasEvaluacion = 0
    const from = vi.fn((tabla: string) => {
      if (tabla === 'jugadores') return jugador
      if (tabla === 'evaluaciones_trimestrales') {
        consultasEvaluacion += 1
        return consultasEvaluacion === 1 ? evaluacion : { update }
      }
      throw new Error(`Tabla inesperada: ${tabla}`)
    })
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: { from },
      perfil: { rol: 'admin', club_id: 'club-1', jugador_id: null },
    })

    await expect(guardarFeedbackAction({
      jugadorId: 'jugador-1',
      evaluacionId: 'evaluacion-1',
      periodo: 'Q3-2026',
      feedback: 'Informe actualizado',
    })).resolves.toEqual({ success: true })

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ firmado_alumno: false }))
  })

  it('confirma mediante el RPC restringido al jugador autenticado', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: { rpc },
      perfil: { rol: 'jugador', club_id: 'club-1', jugador_id: 'jugador-1' },
    })

    await expect(confirmarFeedbackAction({ evaluacionId: 'evaluacion-1' }))
      .resolves.toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('confirmar_feedback_jugador', {
      p_evaluacion_id: 'evaluacion-1',
    })
  })

  it('impide que profesor o admin confirmen por el jugador', async () => {
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: { rpc: vi.fn() },
      perfil: { rol: 'profesor', club_id: 'club-1', jugador_id: null },
    })

    await expect(confirmarFeedbackAction({ evaluacionId: 'evaluacion-1' }))
      .resolves.toEqual({ error: 'Solo el jugador puede confirmar su feedback' })
  })
})
