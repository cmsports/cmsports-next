import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { listarCredenciales, resetearCredencial, resetearTodasLasCredenciales } from './credenciales'

const CLUB = 'club-1'

// Helper: arma un cliente admin mockeado con las tablas que uno le pase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adminConTablas(tablas: Record<string, any>, extra: Record<string, unknown> = {}) {
  return {
    from: vi.fn((tabla: string) => tablas[tabla] ?? {}),
    ...extra,
  }
}

describe('listarCredenciales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminClub.mockResolvedValue({ error: null, clubId: CLUB })
  })

  it('mezcla perfiles con su espejo, y para los que no lo tienen genera la clave al vuelo', async () => {
    const perfiles = {
      select: () => ({ eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: [
        { id: 'u-admin', nombre: 'Ana', email: 'ana@x.cl', rol: 'admin', jugador_id: null },
        { id: 'u-j1', nombre: 'Colomba Gonzalez', email: null, rol: 'jugador', jugador_id: 'j1' },
        { id: 'u-j2', nombre: 'Sofia Gaete', email: null, rol: 'jugador', jugador_id: 'j2' },
      ] }) }) }) }),
    }
    const espejos = {
      select: () => ({ eq: () => Promise.resolve({ data: [
        { usuario_id: 'u-j1', password_plano: 'colombagonzalez123', usuario_login: '958730364', tipo_login: 'celular', actualizado_en: '2026-07-30' },
      ] }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }
    const jugadores = {
      select: () => ({ eq: () => Promise.resolve({ data: [
        { id: 'j1', telefono: '958730364', rut: null },
        { id: 'j2', telefono: '931266944', rut: null },
      ] }) }),
    }
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue(adminConTablas(
      { perfiles, credencial_visible: espejos, jugadores },
      { auth: { admin: { updateUserById } } },
    ))

    const r = await listarCredenciales()

    expect(r.filas).toHaveLength(3)
    // El admin sin espejo: se le generó y se muestra la clave.
    expect(r.filas![0]).toMatchObject({ nombre: 'Ana', rol: 'admin', usuarioLogin: 'ana@x.cl', tipoLogin: 'email', passwordPlano: 'ana123' })
    // El jugador que ya tenía espejo trae la clave existente.
    expect(r.filas![1]).toMatchObject({ nombre: 'Colomba Gonzalez', usuarioLogin: '958730364', passwordPlano: 'colombagonzalez123' })
    // El jugador sin espejo se genera y ya sale con clave.
    expect(r.filas![2]).toMatchObject({ nombre: 'Sofia Gaete', usuarioLogin: '931266944', tipoLogin: 'celular', passwordPlano: 'sofiagaete123' })
    // Se aplicó en auth para los dos que no tenían.
    expect(updateUserById).toHaveBeenCalledWith('u-admin', { password: 'ana123' })
    expect(updateUserById).toHaveBeenCalledWith('u-j2', { password: 'sofiagaete123' })
    expect(espejos.upsert).toHaveBeenCalled()
  })

  it('sin admin no lista nada', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado' })

    const r = await listarCredenciales()

    expect(r).toEqual({ error: 'Acceso denegado' })
  })
})

describe('resetearCredencial', () => {
  const updateUserById = vi.fn()
  const perfilFrom = vi.fn()
  const espejoUpsert = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminClub.mockResolvedValue({ error: null, clubId: CLUB })
    updateUserById.mockResolvedValue({ error: null })
    espejoUpsert.mockResolvedValue({ error: null })
    perfilFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: {
        id: 'u-1', nombre: 'Colomba Gonzalez', email: null, rol: 'jugador', jugador_id: 'j1', club_id: CLUB,
      } }) }) }),
    })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { updateUserById } },
      from: vi.fn((tabla: string) => {
        if (tabla === 'perfiles') return perfilFrom()
        if (tabla === 'jugadores') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { email: null, telefono: '958730364', rut: null } }) }) }),
        }
        if (tabla === 'credencial_visible') return { upsert: espejoUpsert }
        return {}
      }),
    })
  })

  it('genera nueva clave, la aplica en auth y la espeja', async () => {
    const r = await resetearCredencial({ usuarioId: 'u-1' })

    expect(r).toEqual({ password: 'colombagonzalez123' })
    expect(updateUserById).toHaveBeenCalledWith('u-1', { password: 'colombagonzalez123' })
    expect(espejoUpsert).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 'u-1', club_id: CLUB, password_plano: 'colombagonzalez123',
      usuario_login: '958730364', tipo_login: 'celular',
    }))
  })

  it('no toca a usuarios de otro club', async () => {
    perfilFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: {
        id: 'u-1', nombre: 'Ajena', email: null, rol: 'jugador', jugador_id: null, club_id: 'otro-club',
      } }) }) }),
    })

    const r = await resetearCredencial({ usuarioId: 'u-1' })

    expect(r).toEqual({ error: 'Ese usuario no es de este club' })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  // Escribir la clave en auth y no poder guardarla en el espejo es la peor
  // mezcla posible: el jugador ya no puede entrar con la vieja y el admin ve la
  // vieja. Se avisa con claridad al admin para que reintente.
  it('si falla el espejo avisa fuerte, aunque auth ya cambió', async () => {
    espejoUpsert.mockResolvedValue({ error: { message: 'timeout' } })

    const r = await resetearCredencial({ usuarioId: 'u-1' })

    expect(r.error).toContain('no se guardó en el reporte')
    expect(updateUserById).toHaveBeenCalled()
  })
})

describe('resetearTodasLasCredenciales', () => {
  const updateUserById = vi.fn()
  const espejoUpsert = vi.fn()
  const perfilesUpdate = vi.fn()
  let perfilesData: Array<{ id: string; nombre: string }> = []

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminClub.mockResolvedValue({ error: null, clubId: CLUB })
    updateUserById.mockResolvedValue({ error: null })
    espejoUpsert.mockResolvedValue({ error: null })
    perfilesUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    perfilesData = [
      { id: 'u-1', nombre: 'Colomba Gonzalez Gonzalez' },
      { id: 'u-2', nombre: 'Sofia Salgado Gaete' },
    ]
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { updateUserById } },
      from: vi.fn((tabla: string) => {
        if (tabla === 'perfiles') return {
          select: () => ({ eq: () => Promise.resolve({ data: perfilesData }) }),
          update: perfilesUpdate,
        }
        if (tabla === 'credencial_visible') return { upsert: espejoUpsert }
        return {}
      }),
    })
  })

  it('a cada perfil le reescribe email y clave con el patrón del club', async () => {
    const r = await resetearTodasLasCredenciales()

    expect(r).toEqual({ cambiadas: 2, fallidas: 0 })
    // La clave sigue el patrón viejo, el email el nuevo.
    expect(updateUserById).toHaveBeenCalledWith('u-1', { email: 'cgonzalezg@cmsports.cl', password: 'colombagonzalez123' })
    expect(updateUserById).toHaveBeenCalledWith('u-2', { email: 'ssalgadog@cmsports.cl', password: 'sofiagaete123' })
    // El espejo guarda el email como usuario_login y tipo=email.
    expect(espejoUpsert).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 'u-1', usuario_login: 'cgonzalezg@cmsports.cl', tipo_login: 'email',
    }))
    // perfiles.email también queda alineado para que el resto del sistema
    // (dashboards, tarjetas de contacto) no muestre el email viejo.
    expect(perfilesUpdate).toHaveBeenCalledWith({ email: 'cgonzalezg@cmsports.cl' })
  })

  // Sin esto, dos "Sofia Salgado Gaete" fallarían por email duplicado en auth
  // y la segunda quedaría contada como "fallida", con la clave ya cambiada.
  it('dos personas con el mismo patrón: al segundo le pone un numerito', async () => {
    perfilesData = [
      { id: 'u-1', nombre: 'Sofia Salgado Gaete' },
      { id: 'u-2', nombre: 'Sofia Salgado Gomez' },   // sale igual: ssalgadog
    ]

    const r = await resetearTodasLasCredenciales()

    expect(r).toEqual({ cambiadas: 2, fallidas: 0 })
    expect(updateUserById).toHaveBeenCalledWith('u-1', expect.objectContaining({ email: 'ssalgadog@cmsports.cl' }))
    expect(updateUserById).toHaveBeenCalledWith('u-2', expect.objectContaining({ email: 'ssalgadog2@cmsports.cl' }))
  })

  it('un fallo en auth se cuenta y no aborta el resto', async () => {
    updateUserById.mockResolvedValueOnce({ error: { message: 'X' } })

    const r = await resetearTodasLasCredenciales()

    expect(r).toEqual({ cambiadas: 1, fallidas: 1 })
  })

  it('sin admin no corre', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado' })

    const r = await resetearTodasLasCredenciales()

    expect(r).toEqual({ error: 'Acceso denegado' })
    expect(updateUserById).not.toHaveBeenCalled()
  })
})
