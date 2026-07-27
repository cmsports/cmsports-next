import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePerfil: vi.fn(),
  rpc: vi.fn(),
  bloquesDelJugador: vi.fn(),
  fechaChile: vi.fn(),
  horaChile: vi.fn(),
}))

vi.mock('@/lib/auth/require', () => ({ requirePerfil: mocks.requirePerfil }))
// La fecha y la hora se fijan a mano: si dependieran del reloj, el test pasaría
// o fallaría según la hora a la que corra.
vi.mock('@/lib/domain/fechaChile', () => ({
  fechaChile: mocks.fechaChile,
  horaChile: mocks.horaChile,
}))

import { eliminarAsistencia, registrarAsistenciaAction } from './asistencia'

// 2026-07-28 es martes. Menores Avanzado va los martes de 17:00 a 19:00.
const MARTES = '2026-07-28'
const BLOQUE_MARTES = {
  nombre: 'Menores Avanzado', dia_semana: 'mar',
  hora_inicio: '17:00:00', hora_fin: '19:00:00', activo: true,
}

// La consulta real es from().select().eq(jugador).is(vigente_hasta, null):
// solo cuentan las inscripciones abiertas.
const supabaseFalso = {
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ is: () => mocks.bloquesDelJugador() }) }) }),
}

describe('asistencia entre roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'jugador', jugador_id: 'jugador-1' },
    })
    mocks.rpc.mockResolvedValue({ data: 'asistencia-1', error: null })
    mocks.bloquesDelJugador.mockResolvedValue({
      data: [{ bloques_horario: BLOQUE_MARTES }], error: null,
    })
    mocks.fechaChile.mockReturnValue(MARTES)
    mocks.horaChile.mockReturnValue('18:00')   // en pleno entrenamiento
  })

  it('permite al jugador registrar únicamente su propia asistencia', async () => {
    const resultado = await registrarAsistenciaAction('club-1', 'jugador-1', MARTES, '18:00')

    expect(resultado).toEqual({ ok: true, asistenciaId: 'asistencia-1' })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_asistencia_segura', {
      p_jugador_id: 'jugador-1',
    })
  })

  it('rechaza que el jugador registre a otra persona sin tocar la base', async () => {
    const resultado = await registrarAsistenciaAction('club-1', 'jugador-2', MARTES, '18:00')

    expect(resultado).toEqual({ error: 'Acceso denegado' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('propaga el error transaccional y no muestra éxito', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'La asistencia ya fue registrada para ese día' } })

    const resultado = await registrarAsistenciaAction('club-1', 'jugador-1', MARTES, '18:00')

    expect(resultado).toEqual({ error: 'La asistencia ya fue registrada para ese día' })
  })

  it('permite al profesor eliminar mediante la operación atómica', async () => {
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: supabaseFalso,
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

describe('ventana horaria del autorregistro', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'jugador', jugador_id: 'jugador-1' },
    })
    mocks.rpc.mockResolvedValue({ data: 'asistencia-1', error: null })
    mocks.bloquesDelJugador.mockResolvedValue({
      data: [{ bloques_horario: BLOQUE_MARTES }], error: null,
    })
    mocks.fechaChile.mockReturnValue(MARTES)
  })

  it('deja marcar media hora antes de empezar', async () => {
    mocks.horaChile.mockReturnValue('16:30')
    await expect(registrarAsistenciaAction('club-1', 'jugador-1', MARTES, '16:30'))
      .resolves.toEqual({ ok: true, asistenciaId: 'asistencia-1' })
  })

  it('deja marcar media hora después de terminar', async () => {
    mocks.horaChile.mockReturnValue('19:30')
    await expect(registrarAsistenciaAction('club-1', 'jugador-1', MARTES, '19:30'))
      .resolves.toEqual({ ok: true, asistenciaId: 'asistencia-1' })
  })

  it('no deja marcar antes de que abra, y dice desde cuándo', async () => {
    mocks.horaChile.mockReturnValue('14:00')

    const resultado = await registrarAsistenciaAction('club-1', 'jugador-1', MARTES, '14:00')

    expect(resultado.error).toContain('16:30')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('no deja marcar una vez cerrada la ventana', async () => {
    mocks.horaChile.mockReturnValue('22:00')

    const resultado = await registrarAsistenciaAction('club-1', 'jugador-1', MARTES, '22:00')

    expect(resultado.error).toContain('cerró')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rechaza si hoy no le toca entrenar', async () => {
    mocks.horaChile.mockReturnValue('18:00')
    mocks.bloquesDelJugador.mockResolvedValue({
      data: [{ bloques_horario: { ...BLOQUE_MARTES, dia_semana: 'jue' } }], error: null,
    })

    const resultado = await registrarAsistenciaAction('club-1', 'jugador-1', MARTES, '18:00')

    expect(resultado.error).toContain('no tenés entrenamiento')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('ignora los bloques desactivados', async () => {
    mocks.horaChile.mockReturnValue('18:00')
    mocks.bloquesDelJugador.mockResolvedValue({
      data: [{ bloques_horario: { ...BLOQUE_MARTES, activo: false } }], error: null,
    })

    const resultado = await registrarAsistenciaAction('club-1', 'jugador-1', MARTES, '18:00')

    expect(resultado.error).toContain('no tenés entrenamiento')
  })

  it('al staff no se le aplica la ventana', async () => {
    mocks.horaChile.mockReturnValue('03:00')
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'profesor', jugador_id: null },
    })

    const resultado = await registrarAsistenciaAction('club-1', 'jugador-9', MARTES, '18:00')

    expect(resultado).toEqual({ ok: true, asistenciaId: 'asistencia-1' })
    expect(mocks.bloquesDelJugador).not.toHaveBeenCalled()
  })
})
