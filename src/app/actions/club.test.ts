import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminClub: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { actualizarClubAction, actualizarPerfilPersonalAction } from './club'

describe('acciones de configuración del club', () => {
  beforeEach(() => vi.clearAllMocks())

  it('valida los datos antes de escribir el club', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: {}, clubId: 'club-1' })

    await expect(actualizarClubAction({
      nombre: '   ', ciudad: '', deporte: '', mensualidadBase: 100,
    })).resolves.toEqual({ error: 'El nombre del club es obligatorio' })

    await expect(actualizarClubAction({
      nombre: 'Club', ciudad: '', deporte: '', mensualidadBase: -1,
    })).resolves.toEqual({ error: 'La mensualidad no puede ser negativa' })
  })

  it('normaliza y limita la actualización al club autenticado', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: { from }, clubId: 'club-1' })

    const resultado = await actualizarClubAction({
      nombre: '  Club Seguro  ', ciudad: '  Paine ', deporte: ' Tenis ', mensualidadBase: 25000,
    })

    expect(resultado).toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('clubes')
    expect(update).toHaveBeenCalledWith({
      nombre: 'Club Seguro', ciudad: 'Paine', deporte: 'Tenis', mensualidad_base: 25000,
    })
    expect(eq).toHaveBeenCalledWith('id', 'club-1')
  })

  it('rechaza actualizar un perfil sin sesión', async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const resultado = await actualizarPerfilPersonalAction({
      nombre: 'Nombre Válido', email: 'persona@example.com', telefono: '', rut: '', especialidad: '',
    })

    expect(resultado).toEqual({ error: 'No autenticado' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('sincroniza Auth, perfil y jugador dentro del mismo club', async () => {
    const perfil = {
      id: 'user-1', club_id: 'club-1', rol: 'jugador', jugador_id: 'jugador-1', email: 'anterior@example.com',
    }
    const perfilQuery = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: perfil }),
    }
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn(() => perfilQuery),
    })

    const perfilesEq = vi.fn().mockResolvedValue({ error: null })
    const jugadoresClubEq = vi.fn().mockResolvedValue({ error: null })
    const jugadoresIdEq = vi.fn(() => ({ eq: jugadoresClubEq }))
    const credencialEq = vi.fn().mockResolvedValue({ error: null })
    const credencialUpdate = vi.fn(() => ({ eq: credencialEq }))
    const adminFrom = vi.fn((tabla: string) => {
      if (tabla === 'jugadores') return { update: vi.fn(() => ({ eq: jugadoresIdEq })) }
      if (tabla === 'credencial_visible') return { update: credencialUpdate }
      return { update: vi.fn(() => ({ eq: perfilesEq })) }
    })
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { updateUserById } },
      from: adminFrom,
    })

    const resultado = await actualizarPerfilPersonalAction({
      nombre: 'Nombre Nuevo', email: 'NUEVO@example.com', telefono: '+56911111111', rut: '12.345.678-9', especialidad: '',
    })

    expect(resultado).toEqual({ success: true })
    expect(updateUserById).toHaveBeenCalledWith('user-1', expect.objectContaining({ email: 'nuevo@example.com' }))
    expect(jugadoresIdEq).toHaveBeenCalledWith('id', 'jugador-1')
    expect(jugadoresClubEq).toHaveBeenCalledWith('club_id', 'club-1')
    // El PDF y el lookup por RUT leen el espejo: sin esto el correo nuevo
    // queda en Auth y el informe sigue mostrando el viejo.
    expect(credencialUpdate).toHaveBeenCalledWith({
      usuario_login: 'nuevo@example.com', tipo_login: 'email',
    })
    expect(credencialEq).toHaveBeenCalledWith('usuario_id', 'user-1')
  })

  it('guarda en la ficha los mismos datos del ingreso, menos la foto', async () => {
    const perfil = {
      id: 'user-1', club_id: 'club-1', rol: 'jugador', jugador_id: 'jugador-1',
      nombre: 'Colomba', email: 'colomba@cmsports.cl',
    }
    const perfilQuery = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: perfil }),
    }
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: {} } } }) },
      from: vi.fn(() => perfilQuery),
    })

    const updateJugadores = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }))
    const adminFrom = vi.fn((tabla: string) => {
      if (tabla === 'jugadores') return { update: updateJugadores }
      return { update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }
    })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({ error: null }) } },
      from: adminFrom,
    })

    const resultado = await actualizarPerfilPersonalAction({
      nombre: 'Colomba Pérez',
      email: 'colomba@cmsports.cl',
      telefono: '+56911111111',
      rut: '19313040-2',
      especialidad: '',
      nombres: 'Colomba',
      apellido1: 'Pérez',
      apellido2: 'Soto',
      apellido3: 'no',
      fecha_nacimiento: '2010-05-12',
      direccion: 'Calle 123',
      comuna: 'Buin',
      contacto_emergencia_nombre: 'Mamá Pérez',
      contacto_emergencia_telefono: '+56922222222',
      indicaciones_medicas: 'Asma',
      talla_polera: 'M',
      talla_short: 'S',
    })

    expect(resultado).toEqual({ success: true })
    expect(updateJugadores).toHaveBeenCalledWith(expect.objectContaining({
      nombre: 'Colomba Pérez Soto',
      nombres: 'Colomba',
      apellido1: 'Pérez',
      apellido2: 'Soto',
      apellido3: 'no',
      fecha_nacimiento: '2010-05-12',
      direccion: 'Calle 123',
      comuna: 'Buin',
      contacto_emergencia_nombre: 'Mamá Pérez',
      contacto_emergencia_telefono: '+56922222222',
      indicaciones_medicas: 'Asma',
      talla_polera: 'M',
      talla_short: 'S',
    }))
    expect(updateJugadores.mock.calls[0][0]).not.toHaveProperty('foto_path')
    expect(updateJugadores.mock.calls[0][0]).not.toHaveProperty('foto_url')
  })

  it('rechaza una talla que no existe', async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    })
    const resultado = await actualizarPerfilPersonalAction({
      nombre: 'Colomba Pérez', email: 'colomba@cmsports.cl', telefono: '', rut: '', especialidad: '',
      talla_polera: 'XXXL',
    })
    expect(resultado).toEqual({ error: 'Talla inválida' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
