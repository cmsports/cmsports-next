import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { crearJugador } from './jugadores'

describe('crearJugador', () => {
  const jugador = { id: '11111111-1111-4111-8111-111111111111' }
  const usuario = { id: '22222222-2222-4222-8222-222222222222' }
  const clubId = '33333333-3333-4333-8333-333333333333'
  const deleteEq = vi.fn().mockResolvedValue({ error: null })
  const insert = vi.fn()
  const createUser = vi.fn()
  const deleteUser = vi.fn()
  const upsert = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    insert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: jugador, error: null }) }) })
    const supabase = { from: vi.fn(() => ({ insert, delete: vi.fn().mockReturnValue({ eq: deleteEq }) })) }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId })
    createUser.mockResolvedValue({ data: { user: usuario }, error: null })
    upsert.mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { createUser, deleteUser } },
      from: vi.fn(() => ({ upsert })),
    })
  })

  const input = {
    nombre: 'Jugador Uno', rut: '', email: ' JUGADOR@EJEMPLO.CL ', telefono: '',
    categoria: 'principiante', tipo_plan: 'mensual', entrenamientos_por_semana: 3, mensualidad: 30000, sesiones_limite: 12,
  }

  it('crea la cuenta con la contraseña generada y devuelve al llamador para poder mostrársela al admin', async () => {
    const r = await crearJugador(input)

    expect(r).toEqual({ success: true, password: 'jugadoruno123' })
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'jugador@ejemplo.cl',
      password: 'jugadoruno123',
      email_confirm: true,
    }))
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: usuario.id, rol: 'jugador', jugador_id: jugador.id }))
  })

  // Sin correo real puede loguearse con el celular: es lo que pasa en Buin con
  // los familiares que comparten celular; el fallback al rut sale también acá.
  it('sin email pero con celular de 9 dígitos arma la cuenta igual', async () => {
    const r = await crearJugador({ ...input, email: '', telefono: '978408170' })

    expect(r).toEqual({ success: true, password: 'jugadoruno123' })
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: '978408170@cel.cmsports.cl' }))
  })

  it('sin email ni celular ni rut no crea nada y avisa', async () => {
    const r = await crearJugador({ ...input, email: '', telefono: '' })

    expect(r).toEqual({ error: 'Falta email, celular (9 dígitos) o RUT para poder darle acceso' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('espeja la contraseña en credencial_visible', async () => {
    await crearJugador(input)

    // Se llama una vez para el perfil y otra para el espejo. La segunda es la
    // que guarda la clave en texto para que el admin la pueda ver después.
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: usuario.id, club_id: clubId,
      password_plano: 'jugadoruno123', usuario_login: 'jugador@ejemplo.cl', tipo_login: 'email',
    }))
  })

  it('elimina el registro de jugador si falla la cuenta de acceso', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'User already registered' } })
    await expect(crearJugador(input)).resolves.toEqual({ error: 'Ese usuario ya tiene una cuenta' })
    expect(deleteEq).toHaveBeenCalledWith('id', jugador.id)
  })

  it('elimina cuenta y jugador si falla el perfil', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'falló perfil' } })
    await expect(crearJugador(input)).resolves.toEqual({ error: 'No se pudo vincular la cuenta del jugador' })
    expect(deleteUser).toHaveBeenCalledWith(usuario.id)
    expect(deleteEq).toHaveBeenCalledWith('id', jugador.id)
  })
})
