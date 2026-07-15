import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePerfil: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/auth/require', () => ({ requirePerfil: mocks.requirePerfil }))

import { eliminarAsistencia, registrarAsistenciaAction } from './asistencia'

describe('asistencia entre roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: { rpc: mocks.rpc },
      perfil: { club_id: 'club-1', rol: 'jugador', jugador_id: 'jugador-1' },
    })
    mocks.rpc.mockResolvedValue({ data: 'asistencia-1', error: null })
  })

  it('permite al jugador registrar únicamente su propia asistencia', async () => {
    const resultado = await registrarAsistenciaAction('club-1', 'jugador-1', '2026-07-15', '18:30')

    expect(resultado).toEqual({ ok: true, asistenciaId: 'asistencia-1' })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_asistencia_segura', {
      p_jugador_id: 'jugador-1',
      p_fecha: '2026-07-15',
      p_hora: '18:30',
    })
  })

  it('rechaza que el jugador registre a otra persona sin tocar la base', async () => {
    const resultado = await registrarAsistenciaAction('club-1', 'jugador-2', '2026-07-15', '18:30')

    expect(resultado).toEqual({ error: 'Acceso denegado' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('propaga el error transaccional y no muestra éxito', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'La asistencia ya fue registrada para ese día' } })

    const resultado = await registrarAsistenciaAction('club-1', 'jugador-1', '2026-07-15', '18:30')

    expect(resultado).toEqual({ error: 'La asistencia ya fue registrada para ese día' })
  })

  it('permite al profesor eliminar mediante la operación atómica', async () => {
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: { rpc: mocks.rpc },
      perfil: { club_id: 'club-1', rol: 'profesor', jugador_id: null },
    })
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const resultado = await eliminarAsistencia('asistencia-1')

    expect(resultado).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('eliminar_asistencia_segura', {
      p_asistencia_id: 'asistencia-1',
    })
  })

  it('impide al jugador eliminar asistencias', async () => {
    const resultado = await eliminarAsistencia('asistencia-1')

    expect(resultado).toEqual({ error: 'Solo el admin o profesor puede eliminar asistencias' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
