import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))

import { anularUltimoAbono, registrarPagoLiga } from './liga-pagos'

const divisionId = '11111111-1111-4111-8111-111111111111'
const jugadorId = '22222222-2222-4222-8222-222222222222'
const pagoId = '33333333-3333-4333-8333-333333333333'
const key = '44444444-4444-4444-8444-444444444444'
const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/039_finanzas_atomicas.sql'), 'utf8')

describe('pagos de liga atómicos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: { rpc: mocks.rpc } })
  })

  it('delega el abono completo a una única RPC idempotente', async () => {
    mocks.rpc.mockResolvedValue({ data: {
      pago_id: pagoId, abono_id: 'a', movimiento_id: 'm', nuevo_estado: 'parcial', nuevo_monto_pagado: 10000,
    }, error: null })

    await expect(registrarPagoLiga({
      divisionId, jugadorId, montoTotal: 30000, montoAbono: 10000,
      fecha: '2026-07-16', metodo: 'transferencia', nombreJugador: 'Ignorado', nombreLiga: 'Ignorada', idempotencyKey: key,
    })).resolves.toEqual(expect.objectContaining({ success: true, nuevoEstado: 'parcial', nuevoMontoPagado: 10000 }))

    expect(mocks.rpc).toHaveBeenCalledWith('registrar_pago_liga_atomico', {
      p_division_id: divisionId, p_jugador_id: jugadorId, p_monto_total: 30000,
      p_monto_abono: 10000, p_fecha: '2026-07-16', p_metodo: 'transferencia', p_idempotency_key: key,
    })
  })

  it('rechaza sobrepago antes de tocar la base', async () => {
    await expect(registrarPagoLiga({
      divisionId, jugadorId, montoTotal: 10000, montoAbono: 20000, fecha: '2026-07-16', idempotencyKey: key,
    })).resolves.toEqual({ error: 'El abono no puede superar el monto total' })
    expect(mocks.requireAdminClub).not.toHaveBeenCalled()
  })

  it('anula mediante una única RPC idempotente', async () => {
    mocks.rpc.mockResolvedValue({ data: { pago_id: pagoId, nuevo_estado: 'pendiente', nuevo_monto_pagado: 0 }, error: null })
    await expect(anularUltimoAbono({ pagoId, idempotencyKey: key })).resolves.toEqual({
      success: true, nuevoEstado: 'pendiente', nuevoMontoPagado: 0,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('anular_ultimo_abono_liga_atomico', { p_pago_id: pagoId, p_idempotency_key: key })
  })
})

describe('migración financiera de liga', () => {
  it('aborta la anulación antes de borrar cuando el abono no tiene movimiento', () => {
    const cuerpo = sql.match(/CREATE OR REPLACE FUNCTION public\.anular_ultimo_abono_liga_atomico[\s\S]+?AS \$\$([\s\S]+?)\$\$;/)?.[1]
    expect(cuerpo).toBeTruthy()
    expect(cuerpo).toMatch(/IF v_movimiento_id IS NULL THEN\s+RAISE EXCEPTION '[^']*conciliación manual'/)
    expect(cuerpo!.indexOf('IF v_movimiento_id IS NULL THEN')).toBeLessThan(cuerpo!.indexOf('DELETE FROM public.movimientos'))
    expect(cuerpo).not.toContain('IF v_movimiento_id IS NOT NULL THEN')
  })
})
