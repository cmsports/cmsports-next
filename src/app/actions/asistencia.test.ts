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

import {
  asignarBloqueClaseExtraordinaria, asignarMontoClaseExtraordinaria, corregirAsistencia,
  eliminarAsistencia, eliminarClaseExtraordinaria, registrarAsistenciaAction,
  registrarClaseExtraordinaria,
} from './asistencia'

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

describe('corregirAsistencia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePerfil.mockResolvedValue({
      error: null,
      supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'admin', jugador_id: null },
    })
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('manda la corrección a la función de la base', async () => {
    const r = await corregirAsistencia({ jugadorId: 'j1', fecha: '2026-08-04', estado: 'ausente', motivo: 'avisó' })

    expect(r).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_asistencia_manual', {
      p_jugador_id: 'j1', p_fecha: '2026-08-04', p_estado: 'ausente', p_motivo: 'avisó',
    })
  })

  it('borrar el registro es un estado más, no otra función', async () => {
    await corregirAsistencia({ jugadorId: 'j1', fecha: '2026-08-04', estado: 'sin_registro' })
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_asistencia_manual',
      expect.objectContaining({ p_estado: 'sin_registro' }))
  })

  it('un motivo en blanco viaja como nulo, no como cadena vacía', async () => {
    await corregirAsistencia({ jugadorId: 'j1', fecha: '2026-08-04', estado: 'presente', motivo: '   ' })
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_asistencia_manual',
      expect.objectContaining({ p_motivo: null }))
  })

  it('el jugador no puede corregir su propia asistencia', async () => {
    mocks.requirePerfil.mockResolvedValue({
      error: null, supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'jugador', jugador_id: 'j1' },
    })

    const r = await corregirAsistencia({ jugadorId: 'j1', fecha: '2026-08-04', estado: 'presente' })

    expect(r).toEqual({ error: 'Solo el admin o el profesor pueden corregir la asistencia' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('el error de la base llega a la pantalla en vez de tragarse', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'El jugador no es de este club' } })
    const r = await corregirAsistencia({ jugadorId: 'ajeno', fecha: '2026-08-04', estado: 'presente' })
    expect(r).toEqual({ error: 'El jugador no es de este club' })
  })
})

// Vino a un grupo que no es el suyo. Registrar eso es de asistencia; cobrarlo
// es de finanzas y vive en clasesExtra.ts.
describe('clase extraordinaria', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePerfil.mockResolvedValue({
      error: null, supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'profesor', jugador_id: null },
    })
    mocks.rpc.mockResolvedValue({ data: 'extra-1', error: null })
  })

  const base = { jugadorId: 'j1', fecha: '2026-08-03', bloqueId: 'b-lun' }

  it('registra con el bloque y la hora', async () => {
    const r = await registrarClaseExtraordinaria({ ...base, hora: '17:05' })

    expect(r).toEqual({ ok: true, id: 'extra-1' })
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_clase_extraordinaria', {
      p_jugador_id: 'j1', p_fecha: '2026-08-03', p_bloque_id: 'b-lun',
      p_hora: '17:05', p_monto: null, p_motivo: null,
    })
  })

  // Sin monto se registra igual: primero se anota que vino, después se decide
  // cuánto. Es la misma regla que las cuotas — nunca un monto inventado.
  it('sin monto se registra lo mismo', async () => {
    await registrarClaseExtraordinaria(base)

    expect(mocks.rpc).toHaveBeenCalledWith('registrar_clase_extraordinaria',
      expect.objectContaining({ p_monto: null, p_hora: null }))
  })

  it('un motivo en blanco viaja como nulo', async () => {
    await registrarClaseExtraordinaria({ ...base, motivo: '  ' })

    expect(mocks.rpc).toHaveBeenCalledWith('registrar_clase_extraordinaria',
      expect.objectContaining({ p_motivo: null }))
  })

  it('el jugador no se la registra solo', async () => {
    mocks.requirePerfil.mockResolvedValue({
      error: null, supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'jugador', jugador_id: 'j1' },
    })

    const r = await registrarClaseExtraordinaria(base)

    expect(r.error).toContain('Solo el admin o el profesor')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  // La base rechaza registrar como extra a alguien que sí pertenece al grupo:
  // eso es su asistencia normal. El mensaje tiene que llegar a la pantalla.
  it('el rechazo por pertenecer al grupo llega tal cual', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Ese jugador sí pertenece a ese grupo: su asistencia es la normal, no una extra' },
    })

    const r = await registrarClaseExtraordinaria(base)

    expect(r.error).toContain('su asistencia es la normal')
  })

  it('asignar el monto manda el id y el monto', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const r = await asignarMontoClaseExtraordinaria({ id: 'extra-1', monto: 8000 })

    expect(r).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('asignar_monto_clase_extraordinaria',
      { p_id: 'extra-1', p_monto: 8000 })
  })

  // Vaciar el campo la devuelve a "por asignar". Un null tiene que llegar como
  // null y no convertirse en cero por el camino.
  it('vaciar el monto manda null, no cero', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    await asignarMontoClaseExtraordinaria({ id: 'extra-1', monto: null })

    expect(mocks.rpc).toHaveBeenCalledWith('asignar_monto_clase_extraordinaria',
      { p_id: 'extra-1', p_monto: null })
  })

  it('no se cambia el monto de una ya pagada', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Esa clase ya está pagada: hay que revertir el pago antes de cambiar el monto' },
    })

    const r = await asignarMontoClaseExtraordinaria({ id: 'extra-1', monto: 9000 })

    expect(r.error).toContain('ya está pagada')
  })

  it('borrar manda el id', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const r = await eliminarClaseExtraordinaria({ id: 'extra-1' })

    expect(r).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('eliminar_clase_extraordinaria', { p_id: 'extra-1' })
  })

  it('el jugador no borra una clase extra', async () => {
    mocks.requirePerfil.mockResolvedValue({
      error: null, supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'jugador', jugador_id: 'j1' },
    })

    const r = await eliminarClaseExtraordinaria({ id: 'extra-1' })

    expect(r.error).toContain('Solo el admin o el profesor')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  // El caso que se rompía en producción: marcar a alguien que hoy no entrena.
  // La pantalla lo bloqueaba con un mensaje porque la base exigía un bloque.
  it('sin bloque se registra igual: es el caso del que hoy no entrena', async () => {
    await registrarClaseExtraordinaria({ jugadorId: 'j1', fecha: '2026-08-03' })

    expect(mocks.rpc).toHaveBeenCalledWith('registrar_clase_extraordinaria',
      expect.objectContaining({ p_bloque_id: null }))
  })

  it('con un horario elegido manda ese bloque', async () => {
    await registrarClaseExtraordinaria({ jugadorId: 'j1', fecha: '2026-08-03', bloqueId: 'b-lun' })

    expect(mocks.rpc).toHaveBeenCalledWith('registrar_clase_extraordinaria',
      expect.objectContaining({ p_bloque_id: 'b-lun' }))
  })

  it('poner el grupo después manda id y bloque', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const r = await asignarBloqueClaseExtraordinaria({ id: 'extra-1', bloqueId: 'b-lun' })

    expect(r).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('asignar_bloque_clase_extraordinaria',
      { p_id: 'extra-1', p_bloque_id: 'b-lun' })
  })

  it('el jugador no cambia el grupo de una clase extra', async () => {
    mocks.requirePerfil.mockResolvedValue({
      error: null, supabase: supabaseFalso,
      perfil: { club_id: 'club-1', rol: 'jugador', jugador_id: 'j1' },
    })

    const r = await asignarBloqueClaseExtraordinaria({ id: 'extra-1', bloqueId: 'b-lun' })

    expect(r.error).toContain('Solo el admin o el profesor')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
