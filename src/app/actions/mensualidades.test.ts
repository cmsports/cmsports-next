import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), requirePerfil: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub, requirePerfil: mocks.requirePerfil }))

import { corregirMensualidad, generarMensualidadesPendientes, registrarPago, revertirPago } from './mensualidades'

const jugadorId = '11111111-1111-4111-8111-111111111111'
const mensualidadId = '22222222-2222-4222-8222-222222222222'
const key = '33333333-3333-4333-8333-333333333333'

describe('mensualidades atómicas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: { rpc: mocks.rpc } })
  })

  it('registra mensualidad y movimiento en una RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { mensualidad_id: mensualidadId, movimiento_id: 'mov-id', estado: 'pagado' }, error: null })
    await expect(registrarPago({
      jugadorId, jugadorNombre: 'No confiable', mensualidadId, mes: 7, anio: 2026,
      monto: 25000, metodo: 'efectivo', registradoPor: 'No confiable', idempotencyKey: key,
    })).resolves.toEqual({ success: true, mensualidadId, movimientoId: 'mov-id' })
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_pago_mensualidad_atomico', {
      p_mensualidad_id: mensualidadId, p_jugador_id: jugadorId, p_mes: 7, p_anio: 2026,
      p_monto: 25000, p_metodo: 'efectivo', p_idempotency_key: key,
    })
  })

  it('rechaza métodos y períodos inválidos localmente', async () => {
    await expect(registrarPago({
      jugadorId, mensualidadId, mes: 13, anio: 2026, monto: 25000, metodo: 'cheque', idempotencyKey: key,
    })).resolves.toEqual({ error: 'Mes inválido' })
    expect(mocks.requireAdminClub).not.toHaveBeenCalled()
  })

  it('genera sin duplicar ids enviados', async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null })
    await expect(generarMensualidadesPendientes({ jugadorIds: [jugadorId, jugadorId], mes: 7, anio: 2026 }))
      .resolves.toEqual({ success: true, creadas: 1 })
    expect(mocks.rpc).toHaveBeenCalledWith('generar_mensualidades_jugadores_seguro', { p_jugador_ids: [jugadorId], p_mes: 7, p_anio: 2026 })
  })

  it('revierte por id exacto sin filtros manipulables del cliente', async () => {
    mocks.rpc.mockResolvedValue({ data: { mensualidad_id: mensualidadId, estado: 'pendiente' }, error: null })
    await expect(revertirPago({ mensualidadId, jugadorId, mes: 7, anio: 2026, idempotencyKey: key })).resolves.toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith('revertir_pago_mensualidad_atomico', {
      p_mensualidad_id: mensualidadId, p_idempotency_key: key,
    })
  })
})

describe('corregirMensualidad', () => {
  const comoAdmin = () => mocks.requirePerfil.mockResolvedValue({
    error: null,
    supabase: { rpc: mocks.rpc },
    perfil: { club_id: 'club-1', rol: 'admin' },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    comoAdmin()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('manda la corrección con todos sus datos', async () => {
    const r = await corregirMensualidad({
      jugadorId, mes: 3, anio: 2026, estado: 'pagado',
      monto: 30000, fechaPago: '2026-03-15', motivo: 'pagó en efectivo',
    })

    expect(r).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('corregir_mensualidad', {
      p_jugador_id: jugadorId, p_mes: 3, p_anio: 2026, p_estado: 'pagado',
      p_monto: 30000, p_fecha_pago: '2026-03-15', p_metodo: null,
      p_motivo: 'pagó en efectivo',
    })
  })

  it('lo que no se indica viaja como nulo, para que la base conserve lo que había', async () => {
    await corregirMensualidad({ jugadorId, mes: 3, anio: 2026, estado: 'pendiente' })

    expect(mocks.rpc).toHaveBeenCalledWith('corregir_mensualidad',
      expect.objectContaining({ p_monto: null, p_fecha_pago: null, p_motivo: null }))
  })

  it('el profesor no puede tocar la plata', async () => {
    mocks.requirePerfil.mockResolvedValue({
      error: null, supabase: { rpc: mocks.rpc }, perfil: { club_id: 'club-1', rol: 'profesor' },
    })

    const r = await corregirMensualidad({ jugadorId, mes: 3, anio: 2026, estado: 'pagado', monto: 30000 })

    expect(r).toEqual({ error: 'Solo el administrador puede corregir mensualidades' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('sin sesión no se llama a la base', async () => {
    mocks.requirePerfil.mockResolvedValue({ error: 'No autenticado', supabase: null, perfil: null })

    expect(await corregirMensualidad({ jugadorId, mes: 3, anio: 2026, estado: 'pagado' }))
      .toEqual({ error: 'No autenticado' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('el error de la base llega a la pantalla', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Mes inválido: 13' } })

    expect(await corregirMensualidad({ jugadorId, mes: 13, anio: 2026, estado: 'pagado' }))
      .toEqual({ error: 'Mes inválido: 13' })
  })
})
