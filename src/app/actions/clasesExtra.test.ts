import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type FakeSupabase, type RespuestasRpc } from '@/lib/test/fakeSupabase'

const mocks = vi.hoisted(() => ({ crear: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.crear }))

import {
  enviarClasesExtraACobro, pagarClasesExtra, revertirPagoClasesExtra,
} from './clasesExtra'

// Uuid de verdad y no 'a' o 'clave-1': la base solo recibe uuid, y con ids
// inventados las pruebas pasaban por caminos que en producción no existen.
const ID_A    = '11111111-1111-4111-8111-111111111111'
const ID_B    = '22222222-2222-4222-8222-222222222222'
const MOV_1   = '33333333-3333-4333-8333-333333333333'
const CLAVE_1 = '44444444-4444-4444-8444-444444444444'
const CLAVE_2 = '55555555-5555-4555-8555-555555555555'

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

    const res = await enviarClasesExtraACobro({ ids: [ID_A, ID_B] })

    expect(res).toEqual({ ok: true, enviadas: 2 })
    expect(fake.argsDe('enviar_clases_extra_a_cobro')[0]).toEqual({ p_ids: [ID_A, ID_B] })
  })

  // Mandar a cobro es decidir plata. El profesor marca la clase y ahí termina
  // lo suyo: el precio y el cobro los pone un administrador.
  it('el profesor no manda a cobro', async () => {
    conBase({ id: 'u2', club_id: 'club-1', rol: 'profesor' })

    const res = await enviarClasesExtraACobro({ ids: [ID_A] })

    expect(res.error).toContain('administrador')
    expect(fake.rpcs).toHaveLength(0)
  })

  it('el jugador tampoco', async () => {
    conBase({ id: 'u3', club_id: 'club-1', rol: 'jugador' })

    const res = await enviarClasesExtraACobro({ ids: [ID_A] })

    expect(res.error).toContain('administrador')
    expect(fake.rpcs).toHaveLength(0)
  })

  it('sin nada seleccionado no llama a la base', async () => {
    const res = await enviarClasesExtraACobro({ ids: [] })

    expect(res.error).toBeTruthy()
    expect(fake.rpcs).toHaveLength(0)
  })

  // Un id vacío llegaba a la base y volvía como «invalid input syntax for type
  // uuid: ""», el error crudo de Postgres en la cara del admin.
  it('un id vacío rebota acá, no en la base', async () => {
    const res = await enviarClasesExtraACobro({ ids: [ID_A, ''] })

    expect(res.error).toBeTruthy()
    expect(fake.rpcs).toHaveLength(0)
  })

  it('el rechazo de la base llega a la pantalla', async () => {
    conBase(undefined, {
      enviar_clases_extra_a_cobro: { error: { message: 'Hay clases sin monto asignado: primero hay que ponerles precio' } },
    })

    const res = await enviarClasesExtraACobro({ ids: [ID_A] })

    expect(res.error).toContain('sin monto')
  })
})

describe('pagarClasesExtra', () => {
  const pago = { ids: [ID_A, ID_B], metodo: 'efectivo' as const, idempotencyKey: CLAVE_1 }

  it('manda ids, método y clave', async () => {
    conBase(undefined, {
      registrar_pago_clases_extra_atomico: { movimiento_id: MOV_1, monto: 16000, clases: 2 },
    })

    const res = await pagarClasesExtra(pago)

    expect(res).toEqual({ ok: true, movimientoId: MOV_1, monto: 16000, clases: 2 })
    expect(fake.argsDe('registrar_pago_clases_extra_atomico')[0]).toEqual({
      p_ids: [ID_A, ID_B], p_metodo: 'efectivo', p_idempotency_key: CLAVE_1,
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
      registrar_pago_clases_extra_atomico: { movimiento_id: MOV_1, monto: 8000, clases: 1 },
    })

    await pagarClasesExtra(pago)
    await pagarClasesExtra(pago)

    const claves = fake.argsDe('registrar_pago_clases_extra_atomico').map(a => a.p_idempotency_key)
    expect(claves).toEqual([CLAVE_1, CLAVE_1])
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
  // Sin clave no hay nada que frene el doble clic, que es justo lo que estas
  // dos funciones existen para evitar. Mejor no mover plata que moverla dos
  // veces, así que la clave es obligatoria y no opcional.
  it('sin clave no se cobra', async () => {
    const res = await pagarClasesExtra({ ids: [ID_A], metodo: 'efectivo', idempotencyKey: '' })

    expect(res.error).toBeTruthy()
    expect(fake.rpcs).toHaveLength(0)
  })

  it('sin movimiento no se deshace nada', async () => {
    const res = await revertirPagoClasesExtra({ movimientoId: '', idempotencyKey: CLAVE_2 })

    expect(res.error).toBeTruthy()
    expect(fake.rpcs).toHaveLength(0)
  })

  it('manda el movimiento y su clave', async () => {
    const res = await revertirPagoClasesExtra({ movimientoId: MOV_1, idempotencyKey: CLAVE_2 })

    expect(res).toEqual({ ok: true })
    expect(fake.argsDe('revertir_pago_clases_extra_atomico')[0]).toEqual({
      p_movimiento_id: MOV_1, p_idempotency_key: CLAVE_2,
    })
  })

  it('el profesor no deshace un cobro', async () => {
    conBase({ id: 'u2', club_id: 'club-1', rol: 'profesor' })

    const res = await revertirPagoClasesExtra({ movimientoId: MOV_1, idempotencyKey: CLAVE_2 })

    expect(res.error).toBe('Acceso denegado')
    expect(fake.rpcs).toHaveLength(0)
  })

  it('revertir algo que no es un cobro de clases extra rebota', async () => {
    conBase(undefined, {
      revertir_pago_clases_extra_atomico: { error: { message: 'Ese movimiento no es un cobro de clases extra' } },
    })

    const res = await revertirPagoClasesExtra({ movimientoId: MOV_1, idempotencyKey: CLAVE_2 })

    expect(res.error).toContain('no es un cobro')
  })
})
