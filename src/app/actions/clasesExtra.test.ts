import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type FakeSupabase, type RespuestasRpc } from '@/lib/test/fakeSupabase'

const mocks = vi.hoisted(() => ({ crear: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.crear }))

import {
  enviarClasesExtraACobro, pagarClasesExtra, revertirPagoClasesExtra,
} from './clasesExtra'

let fake: FakeSupabase

type Usuario = { id?: string; club_id: string | null; rol: string | null } | null

function conBase(
  usuario: Usuario = { id: 'u1', club_id: 'club-1', rol: 'admin' },
  rpcs: RespuestasRpc = {},
) {
  fake = fakeSupabase({}, usuario, rpcs)
  mocks.crear.mockResolvedValue(fake.cliente)
  return fake
}

beforeEach(() => { vi.clearAllMocks(); conBase() })

describe('enviarClasesExtraACobro', () => {
  it('manda los ids tal cual', async () => {
    conBase(undefined, { enviar_clases_extra_a_cobro: 2 })

    const res = await enviarClasesExtraACobro({ ids: ['a', 'b'] })

    expect(res).toEqual({ ok: true, enviadas: 2 })
    expect(fake.argsDe('enviar_clases_extra_a_cobro')[0]).toEqual({ p_ids: ['a', 'b'] })
  })

  it('el profesor también puede: marcar y enviar es su trabajo', async () => {
    conBase({ id: 'u2', club_id: 'club-1', rol: 'profesor' }, { enviar_clases_extra_a_cobro: 1 })

    const res = await enviarClasesExtraACobro({ ids: ['a'] })

    expect(res).toMatchObject({ ok: true })
  })

  it('el jugador no', async () => {
    conBase({ id: 'u3', club_id: 'club-1', rol: 'jugador' })

    const res = await enviarClasesExtraACobro({ ids: ['a'] })

    expect(res.error).toContain('Solo el admin o el profesor')
    expect(fake.rpcs).toHaveLength(0)
  })

  it('sin nada seleccionado no llama a la base', async () => {
    const res = await enviarClasesExtraACobro({ ids: [] })

    expect(res.error).toBeTruthy()
    expect(fake.rpcs).toHaveLength(0)
  })

  it('el rechazo de la base llega a la pantalla', async () => {
    conBase(undefined, {
      enviar_clases_extra_a_cobro: { error: { message: 'Hay clases sin monto asignado: primero hay que ponerles precio' } },
    })

    const res = await enviarClasesExtraACobro({ ids: ['a'] })

    expect(res.error).toContain('sin monto')
  })
})

describe('pagarClasesExtra', () => {
  const pago = { ids: ['a', 'b'], metodo: 'efectivo' as const, idempotencyKey: 'clave-1' }

  it('manda ids, método y clave', async () => {
    conBase(undefined, {
      registrar_pago_clases_extra_atomico: { movimiento_id: 'mov-1', monto: 16000, clases: 2 },
    })

    const res = await pagarClasesExtra(pago)

    expect(res).toEqual({ ok: true, movimientoId: 'mov-1', monto: 16000, clases: 2 })
    expect(fake.argsDe('registrar_pago_clases_extra_atomico')[0]).toEqual({
      p_ids: ['a', 'b'], p_metodo: 'efectivo', p_idempotency_key: 'clave-1',
    })
  })

  // Mover plata pasa por _finanzas_admin_contexto(), que exige admin. El
  // profesor de este club lo es; el rol 'profesor' a secas, no.
  it('el profesor no cobra', async () => {
    conBase({ id: 'u2', club_id: 'club-1', rol: 'profesor' })

    const res = await pagarClasesExtra(pago)

    expect(res.error).toBe('Acceso denegado')
    expect(fake.rpcs).toHaveLength(0)
  })

  it('sin sesión no cobra', async () => {
    conBase(null)

    const res = await pagarClasesExtra(pago)

    expect(res.error).toBeTruthy()
    expect(fake.rpcs).toHaveLength(0)
  })

  it('sin clases seleccionadas no llama a la base', async () => {
    const res = await pagarClasesExtra({ ...pago, ids: [] })

    expect(res.error).toBeTruthy()
    expect(fake.rpcs).toHaveLength(0)
  })

  // La clave de idempotencia es lo único que evita dos ingresos por la misma
  // clase cuando el botón se aprieta dos veces. Tiene que viajar sin tocarse.
  it('la clave viaja sin cambiar en el reintento', async () => {
    conBase(undefined, {
      registrar_pago_clases_extra_atomico: { movimiento_id: 'mov-1', monto: 8000, clases: 1 },
    })

    await pagarClasesExtra(pago)
    await pagarClasesExtra(pago)

    const claves = fake.argsDe('registrar_pago_clases_extra_atomico').map(a => a.p_idempotency_key)
    expect(claves).toEqual(['clave-1', 'clave-1'])
  })

  it('un rechazo de la base no se traga', async () => {
    conBase(undefined, {
      registrar_pago_clases_extra_atomico: { error: { message: 'Alguna de esas clases ya está pagada' } },
    })

    const res = await pagarClasesExtra(pago)

    expect(res.error).toContain('ya está pagada')
  })

  // Sin este guardia, un resultado vacío se leería como éxito y la pantalla
  // diría "cobrado" sin que exista el movimiento.
  it('una respuesta vacía es un error, no un éxito', async () => {
    conBase(undefined, { registrar_pago_clases_extra_atomico: null })

    const res = await pagarClasesExtra(pago)

    expect(res.error).toBeTruthy()
    expect(res).not.toHaveProperty('ok')
  })
})

describe('revertirPagoClasesExtra', () => {
  it('manda el movimiento y su clave', async () => {
    const res = await revertirPagoClasesExtra({ movimientoId: 'mov-1', idempotencyKey: 'clave-2' })

    expect(res).toEqual({ ok: true })
    expect(fake.argsDe('revertir_pago_clases_extra_atomico')[0]).toEqual({
      p_movimiento_id: 'mov-1', p_idempotency_key: 'clave-2',
    })
  })

  it('el profesor no deshace un cobro', async () => {
    conBase({ id: 'u2', club_id: 'club-1', rol: 'profesor' })

    const res = await revertirPagoClasesExtra({ movimientoId: 'mov-1', idempotencyKey: 'c' })

    expect(res.error).toBe('Acceso denegado')
    expect(fake.rpcs).toHaveLength(0)
  })

  it('revertir algo que no es un cobro de clases extra rebota', async () => {
    conBase(undefined, {
      revertir_pago_clases_extra_atomico: { error: { message: 'Ese movimiento no es un cobro de clases extra' } },
    })

    const res = await revertirPagoClasesExtra({ movimientoId: 'mov-1', idempotencyKey: 'c' })

    expect(res.error).toContain('no es un cobro')
  })
})
