import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireSuperadmin: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/auth/require', () => ({ requireSuperadmin: mocks.requireSuperadmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { crearClub, eliminarClub } from './superadmin'

describe('crearClub desde Superadmin', () => {
  const club = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Club Integración' }
  const user = { id: '22222222-2222-4222-8222-222222222222' }
  const clubInsert = vi.fn()
  const createUser = vi.fn()
  const perfilUpsert = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    clubInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: club, error: null }),
      }),
    })
    const supabase = {
      from: vi.fn((tabla: string) => {
        if (tabla !== 'clubes') throw new Error(`Tabla inesperada: ${tabla}`)
        return { insert: clubInsert }
      }),
    }
    mocks.requireSuperadmin.mockResolvedValue({ error: null, supabase })

    createUser.mockResolvedValue({ data: { user }, error: null })
    perfilUpsert.mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { createUser, deleteUser: vi.fn() } },
      from: vi.fn((tabla: string) => {
        if (tabla === 'perfiles') return { upsert: perfilUpsert }
        if (tabla === 'clubes') return { delete: vi.fn().mockReturnValue({ eq: vi.fn() }) }
        throw new Error(`Tabla inesperada: ${tabla}`)
      }),
    })
  })

  it('crea club, cuenta admin y perfil vinculado', async () => {
    const resultado = await crearClub({
      nombre: 'Club Integración',
      ciudad: 'Santiago',
      deporte: 'tenis de mesa',
      planMensual: 25000,
      modulos: ['torneos', 'mensualidades'],
      adminNombre: 'Admin Integración',
      adminEmail: 'ADMIN@EJEMPLO.CL',
      passwordProvisoria: 'ClaveSegura123!',
    })

    expect(resultado).toEqual({ success: true })
    expect(clubInsert).toHaveBeenCalledWith(expect.objectContaining({
      nombre: 'Club Integración',
      modulos_habilitados: ['torneos', 'mensualidades', 'finanzas'],
    }))
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'admin@ejemplo.cl',
      password: 'ClaveSegura123!',
      email_confirm: true,
    }))
    expect(perfilUpsert).toHaveBeenCalledWith(expect.objectContaining({
      id: user.id,
      club_id: club.id,
      email: 'admin@ejemplo.cl',
      rol: 'admin',
    }), { onConflict: 'id' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/superadmin')
  })
})

describe('eliminarClub desde Superadmin', () => {
  it('elimina invitaciones antes de borrar el club y luego las cuentas', async () => {
    const club = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Club Prueba' }
    const borrarInvitaciones = vi.fn().mockResolvedValue({ error: null })
    const borrarClub = vi.fn().mockResolvedValue({ error: null })
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const perfilUpdateEqRol = vi.fn().mockResolvedValue({ error: null })

    mocks.requireSuperadmin.mockResolvedValue({
      error: null,
      supabase: {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'superadmin-id' } } }) },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: club, error: null }) }) }),
        })),
      },
    })

    mocks.createAdminClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ list: vi.fn().mockResolvedValue({ data: [], error: null }), remove: vi.fn() })) },
      auth: { admin: { deleteUser } },
      from: vi.fn((tabla: string) => {
        if (tabla === 'perfiles') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'cuenta-id' }], error: null }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: perfilUpdateEqRol }) }),
        }
        if (tabla === 'invitaciones') return { delete: vi.fn().mockReturnValue({ eq: borrarInvitaciones }) }
        if (tabla === 'clubes') return { delete: vi.fn().mockReturnValue({ eq: borrarClub }) }
        throw new Error(`Tabla inesperada: ${tabla}`)
      }),
    })

    await expect(eliminarClub({ clubId: club.id, confirmacion: club.nombre })).resolves.toEqual({ success: true })
    expect(borrarInvitaciones).toHaveBeenCalledWith('club_id', club.id)
    expect(borrarClub).toHaveBeenCalledWith('id', club.id)
    expect(borrarInvitaciones.mock.invocationCallOrder[0]).toBeLessThan(borrarClub.mock.invocationCallOrder[0])
    expect(deleteUser).toHaveBeenCalledWith('cuenta-id')
  })
})
