import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), createAdminClient: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { crearProfesor } from './profesores'

describe('crearProfesor', () => {
  const createUser = vi.fn()
  const deleteUser = vi.fn()
  const profesorInsert = vi.fn()
  const perfilUpsert = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: {}, clubId: '11111111-1111-4111-8111-111111111111' })
    createUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } }, error: null })
    profesorInsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: '33333333-3333-4333-8333-333333333333' }, error: null }) }) })
    perfilUpsert.mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { createUser, deleteUser } },
      from: vi.fn((tabla: string) => tabla === 'profesores'
        ? { insert: profesorInsert, delete: vi.fn().mockReturnValue({ eq: vi.fn() }) }
        : { upsert: perfilUpsert }),
    })
  })

  it('crea Auth, registro de profesor y perfil con rol profesor', async () => {
    const resultado = await crearProfesor({ nombre: 'Profe Uno', email: ' PROFE@EJEMPLO.CL ', especialidad: 'Técnica', password: 'secreto' })
    expect(resultado).toEqual({ success: true })
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'profe@ejemplo.cl', password: 'secreto', email_confirm: true }))
    expect(profesorInsert).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Profe Uno', email: 'profe@ejemplo.cl', activo: true }))
    expect(perfilUpsert).toHaveBeenCalledWith(expect.objectContaining({ rol: 'profesor', email: 'profe@ejemplo.cl' }), { onConflict: 'id' })
  })

  it('revierte la cuenta si falla crear el profesor', async () => {
    profesorInsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { message: 'falló' } }) }) })
    const resultado = await crearProfesor({ nombre: 'Profe Uno', email: 'profe@ejemplo.cl', especialidad: '', password: 'secreto' })
    expect(resultado).toEqual({ error: 'No se pudo crear el profesor' })
    expect(deleteUser).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
  })
})
