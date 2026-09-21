import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), createAdminClient: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { crearAdministrador } from './administradores'

const CLUB = '11111111-1111-4111-8111-111111111111'
const USUARIO = '22222222-2222-4222-8222-222222222222'

describe('crearAdministrador', () => {
  const createUser = vi.fn()
  const deleteUser = vi.fn()
  const perfilUpsert = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: {}, clubId: CLUB })
    createUser.mockResolvedValue({ data: { user: { id: USUARIO } }, error: null })
    perfilUpsert.mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { createUser, deleteUser } },
      from: vi.fn(() => ({ upsert: perfilUpsert })),
    })
  })

  it('crea la cuenta y el perfil con rol admin en el club de quien la crea', async () => {
    const r = await crearAdministrador({ nombre: 'Otra Admin', email: ' ADMIN​@EJEMPLO.CL ', password: 'secreto' })
    expect(r).toEqual({ success: true })
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'admin@ejemplo.cl', email_confirm: true }))
    expect(perfilUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ rol: 'admin', club_id: CLUB, email: 'admin@ejemplo.cl', jugador_id: null }),
      { onConflict: 'id' },
    )
  })

  // Las dos que importan: si el club o el rol pudieran venir del formulario,
  // un admin podría sembrarse una cuenta dentro de otro club, o subirse a
  // superadmin. Salen de la sesión y de una constante, y así se quedan.
  it('ignora un club_id o un rol mandados desde el formulario', async () => {
    await crearAdministrador({
      nombre: 'Colada', email: 'colada@ejemplo.cl', password: 'secreto',
      club_id: '99999999-9999-4999-8999-999999999999', rol: 'superadmin',
    } as never)
    expect(perfilUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ rol: 'admin', club_id: CLUB }),
      { onConflict: 'id' },
    )
  })

  it('no deja la cuenta suelta si falla el perfil', async () => {
    perfilUpsert.mockResolvedValue({ error: { message: 'falló' } })
    const r = await crearAdministrador({ nombre: 'Otra Admin', email: 'admin@ejemplo.cl', password: 'secreto' })
    expect(r).toEqual({ error: 'No se pudo vincular el acceso del administrador' })
    expect(deleteUser).toHaveBeenCalledWith(USUARIO)
  })

  it('quien no es admin del club no crea nada', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado', supabase: null, clubId: null })
    const r = await crearAdministrador({ nombre: 'Otra Admin', email: 'admin@ejemplo.cl', password: 'secreto' })
    expect(r).toEqual({ error: 'Acceso denegado' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('una contraseña corta no llega a crear la cuenta', async () => {
    const r = await crearAdministrador({ nombre: 'Otra Admin', email: 'admin@ejemplo.cl', password: '123' })
    expect(r).toEqual({ error: 'La contraseña debe tener al menos 6 caracteres' })
    expect(createUser).not.toHaveBeenCalled()
  })
})
