import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))

import { generarMensualidadesPendientes, registrarPago, revertirPago } from './mensualidades'

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
