import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))

import { registrarMovimiento } from './finanzas'

const key = '11111111-1111-4111-8111-111111111111'

describe('movimientos financieros atómicos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: { rpc: mocks.rpc } })
  })

  it('delega el movimiento validado a la RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { movimiento_id: 'mov-id' }, error: null })
    await expect(registrarMovimiento({
      tipo: 'gasto', categoria: 'mantenimiento', descripcion: '  Reparación mesa  ',
      monto: 45000, fecha: '2026-07-16', idempotencyKey: key,
    })).resolves.toEqual({ success: true, movimientoId: 'mov-id' })
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_movimiento_financiero_atomico', {
      p_tipo: 'gasto', p_categoria: 'mantenimiento', p_descripcion: 'Reparación mesa',
      p_monto: 45000, p_fecha: '2026-07-16', p_profesor_id: null,
      p_mes_correspondiente: null, p_anio_correspondiente: null, p_idempotency_key: key,
    })
  })

  it('rechaza categoría incompatible antes de autenticar', async () => {
    await expect(registrarMovimiento({
      tipo: 'ingreso', categoria: 'sueldo_staff', descripcion: 'Inválido', monto: 1000, fecha: '2026-07-16', idempotencyKey: key,
    })).resolves.toEqual({ error: 'Categoría incompatible con el tipo de movimiento' })
    expect(mocks.requireAdminClub).not.toHaveBeenCalled()
  })
})
