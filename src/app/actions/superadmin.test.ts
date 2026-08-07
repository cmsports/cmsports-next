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
  const club = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Club Prueba' }

  // Objeto que es a la vez promesa resuelta y eslabón de cadena: permite
  // `.eq(...).eq(...)` tantas veces como haga falta y se puede await en
  // cualquier punto, igual que el builder real de supabase-js.
  type Cadena = Promise<{ error: null }> & { eq: () => Cadena; in: () => Cadena }
  const cadenaEq = (): Cadena => Object.assign(
    Promise.resolve({ error: null }),
    { eq: () => cadenaEq(), in: () => cadenaEq() },
  ) as Cadena

  // El borrado toca muchas tablas en cadena. El mock responde a cualquiera con
  // "sin filas / sin error" y solo registra las llamadas, así el test no se cae
  // cada vez que se agrega una tabla más al barrido; lo que se verifica es el
  // orden, que es donde estaban los bugs reales.
  function montarMocks() {
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const llamadas: Array<{ tabla: string; op: string }> = []
    type Borrar = ReturnType<typeof vi.fn<(columna: string, valor: string) => Promise<{ error: null }>>>
    const borrados: Record<string, Borrar> = {}

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
        const filas = tabla === 'perfiles' ? [{ id: 'cuenta-id' }] : []
        const resultado = { data: filas, error: null }
        const borrar = borrados[tabla] ??= vi.fn<(columna: string, valor: string) => Promise<{ error: null }>>()
          .mockResolvedValue({ error: null })
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((columna: string, valor: string) => {
              llamadas.push({ tabla, op: `select:${columna}=${valor}` })
              return Object.assign(Promise.resolve(resultado), { single: vi.fn().mockResolvedValue(resultado) })
            }),
            in: vi.fn().mockResolvedValue(resultado),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn((columna: string, valor: string) => {
              llamadas.push({ tabla, op: 'delete' })
              return borrar(columna, valor)
            }),
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
          // `.eq()` encadenable sin límite: el update final del superadmin
          // encadena tres (`id`, `rol`, `club_id`).
          update: vi.fn().mockReturnValue(cadenaEq()),
        }
      }),
    })

    return { deleteUser, llamadas, borrados }
  }

  it('borra invitaciones y cuentas antes que el club', async () => {
    const { deleteUser, llamadas, borrados } = montarMocks()

    await expect(eliminarClub({ clubId: club.id, confirmacion: club.nombre })).resolves.toEqual({ success: true })

    expect(borrados.invitaciones).toHaveBeenCalledWith('club_id', club.id)
    expect(borrados.clubes).toHaveBeenCalledWith('id', club.id)
    expect(deleteUser).toHaveBeenCalledWith('cuenta-id')

    const indice = (predicado: (l: { tabla: string; op: string }) => boolean) =>
      llamadas.findIndex(predicado)
    expect(indice(l => l.tabla === 'invitaciones' && l.op === 'delete'))
      .toBeLessThan(indice(l => l.tabla === 'clubes' && l.op === 'delete'))
  })

  // La cuenta de auth no se puede borrar mientras su fila de `perfiles` la
  // referencie: sin ON DELETE CASCADE (migración 126, que se corre a mano y
  // puede no estar aplicada) deleteUser rebota y el club nunca se borra.
  it('borra el perfil antes que la cuenta de auth, y ambos antes que el club', async () => {
    const { deleteUser, llamadas, borrados } = montarMocks()

    await expect(eliminarClub({ clubId: club.id, confirmacion: club.nombre })).resolves.toEqual({ success: true })

    expect(borrados.perfiles).toHaveBeenCalledWith('id', 'cuenta-id')
    expect(borrados.perfiles.mock.invocationCallOrder[0])
      .toBeLessThan(deleteUser.mock.invocationCallOrder[0])
    expect(deleteUser.mock.invocationCallOrder[0])
      .toBeLessThan(borrados.clubes.mock.invocationCallOrder[0])
    expect(llamadas.some(l => l.tabla === 'jugadores')).toBe(true)
  })
})
