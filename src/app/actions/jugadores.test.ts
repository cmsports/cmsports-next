import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { crearJugador } from './jugadores'

describe('crearJugador', () => {
  const jugador = { id: '11111111-1111-4111-8111-111111111111' }
  const usuario = { id: '22222222-2222-4222-8222-222222222222' }
  const deleteEq = vi.fn().mockResolvedValue({ error: null })
  const insert = vi.fn()
  const createUser = vi.fn()
  const deleteUser = vi.fn()
  const upsert = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    insert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: jugador, error: null }) }) })
    const supabase = { from: vi.fn(() => ({ insert, delete: vi.fn().mockReturnValue({ eq: deleteEq }) })) }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: '33333333-3333-4333-8333-333333333333' })
    createUser.mockResolvedValue({ data: { user: usuario }, error: null })
    upsert.mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { createUser, deleteUser } },
      from: vi.fn(() => ({ upsert })),
    })
  })

  const input = {
    nombre: 'Jugador Uno', rut: '', email: ' JUGADOR@EJEMPLO.CL ', password: 'secreto', telefono: '',
    categoria: 'principiante', tipo_plan: 'mensual', entrenamientos_por_semana: 3, mensualidad: 30000, sesiones_limite: 12,
  }

  it('crea usuario autenticable y perfil de rol jugador', async () => {
    await expect(crearJugador(input)).resolves.toEqual({ success: true })
    expect(createUser).toHaveBeenCalledWith({ email: 'jugador@ejemplo.cl', password: 'secreto', email_confirm: true })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: usuario.id, rol: 'jugador', jugador_id: jugador.id }))
  })

  it('elimina el registro de jugador si falla la cuenta de acceso', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'User already registered' } })
    await expect(crearJugador(input)).resolves.toEqual({ error: 'Ese email ya tiene una cuenta' })
    expect(deleteEq).toHaveBeenCalledWith('id', jugador.id)
  })

  it('elimina cuenta y jugador si falla el perfil', async () => {
    upsert.mockResolvedValue({ error: { message: 'falló perfil' } })
    await expect(crearJugador(input)).resolves.toEqual({ error: 'No se pudo vincular la cuenta del jugador' })
    expect(deleteUser).toHaveBeenCalledWith(usuario.id)
    expect(deleteEq).toHaveBeenCalledWith('id', jugador.id)
  })
})
