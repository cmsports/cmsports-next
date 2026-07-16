import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { aprobarSolicitud } from './solicitudes'

describe('aprobarSolicitud', () => {
  const inviteUserByEmail = vi.fn()
  const deleteUser = vi.fn()
  const perfilUpsert = vi.fn()
  const jugadorDeleteEq = vi.fn().mockResolvedValue({ error: null })
  const solicitudUpdateClubEq = vi.fn().mockResolvedValue({ error: null })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://cmsports.example')
    const supabase = {
      from: vi.fn((tabla: string) => {
        if (tabla === 'solicitudes_jugador') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'solicitud-id', estado: 'pendiente' }, error: null }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: solicitudUpdateClubEq }) }),
        }
        if (tabla === 'jugadores') return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'jugador-id' }, error: null }) }) }),
          delete: vi.fn().mockReturnValue({ eq: jugadorDeleteEq }),
        }
        throw new Error(`Tabla inesperada: ${tabla}`)
      }),
    }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: 'club-id' })
    inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'usuario-id' } }, error: null })
    perfilUpsert.mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue({ auth: { admin: { inviteUserByEmail, deleteUser } }, from: vi.fn(() => ({ upsert: perfilUpsert })) })
  })

  const input = {
    solicitudId: 'solicitud-id', nombre: 'Pedrito', rut: '12345678-9', email: ' PEDRITO@EMAIL.CL ', telefono: '+56911111111',
    categoria: 'principiante', tipo_plan: 'mensual', entrenamientos_por_semana: 2, mensualidad: 25000, sesiones_limite: 8,
  }

  it('envía una invitación sin manejar la contraseña del jugador', async () => {
    const resultado = await aprobarSolicitud(input)
    expect(resultado).toEqual(expect.objectContaining({ success: true, cuentaCreada: true, invitacionEnviada: true }))
    expect(inviteUserByEmail).toHaveBeenCalledWith('pedrito@email.cl', {
      redirectTo: 'https://cmsports.example/auth/callback?next=/crear-contrasena',
      data: { nombre: 'Pedrito' },
    })
    expect(perfilUpsert).toHaveBeenCalledWith(expect.objectContaining({ rol: 'jugador', jugador_id: 'jugador-id', email: 'pedrito@email.cl' }))
    expect(solicitudUpdateClubEq).toHaveBeenCalledWith('club_id', 'club-id')
  })

  it('revierte el jugador si no puede enviar la invitación', async () => {
    inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { message: 'Auth failed' } })
    await expect(aprobarSolicitud(input)).resolves.toEqual({ error: 'No se pudo crear la cuenta de acceso del jugador.' })
    expect(jugadorDeleteEq).toHaveBeenCalledWith('id', 'jugador-id')
  })
})
