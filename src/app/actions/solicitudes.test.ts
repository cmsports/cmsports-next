import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn(), createAdminClient: vi.fn(), asignarBloques: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/app/actions/horario', () => ({ asignarBloquesJugador: mocks.asignarBloques }))

import { aprobarSolicitud } from './solicitudes'

describe('aprobarSolicitud', () => {
  const createUser = vi.fn()
  const deleteUser = vi.fn()
  const perfilUpsert = vi.fn()
  const jugadorDeleteEq = vi.fn().mockResolvedValue({ error: null })
  const solicitudUpdateClubEq = vi.fn().mockResolvedValue({ error: null })

  beforeEach(() => {
    vi.clearAllMocks()
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
    createUser.mockResolvedValue({ data: { user: { id: 'usuario-id' } }, error: null })
    perfilUpsert.mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue({ auth: { admin: { createUser, deleteUser } }, from: vi.fn(() => ({ upsert: perfilUpsert })) })
    mocks.asignarBloques.mockResolvedValue({ success: true })
  })

  const input = {
    solicitudId: 'solicitud-id', nombre: 'Pedrito', rut: '12345678-9', email: ' PEDRITO@EMAIL.CL ', telefono: '+56911111111',
    fecha_nacimiento: '2015-05-01', direccion: 'Calle Falsa 123', comuna: 'Buin',
    contacto_emergencia_nombre: 'Mamá Pedrito', contacto_emergencia_telefono: '+56922222222', indicaciones_medicas: '',
    password: 'clave123',
    categoria: 'principiante', tipo_plan: 'mensual', entrenamientos_por_semana: 2, mensualidad: 25000, sesiones_limite: 8,
    bloqueIds: [],
  }

  it('crea la cuenta con la contraseña indicada por el admin', async () => {
    const resultado = await aprobarSolicitud(input)
    expect(resultado).toEqual(expect.objectContaining({
      success: true,
      cuentaCreada: true,
      jugador: { nombre: 'Pedrito', email: 'pedrito@email.cl', telefono: '+56911111111' },
    }))
    expect(createUser).toHaveBeenCalledWith({
      email: 'pedrito@email.cl',
      password: 'clave123',
      email_confirm: true,
      user_metadata: { nombre: 'Pedrito' },
    })
    expect(perfilUpsert).toHaveBeenCalledWith(expect.objectContaining({ rol: 'jugador', jugador_id: 'jugador-id', email: 'pedrito@email.cl' }))
    expect(solicitudUpdateClubEq).toHaveBeenCalledWith('club_id', 'club-id')
  })

  it('rechaza contraseñas de menos de 6 caracteres sin crear nada', async () => {
    const resultado = await aprobarSolicitud({ ...input, password: '123' })
    expect(resultado).toEqual({ error: 'La contraseña debe tener al menos 6 caracteres' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('revierte el jugador si no puede crear la cuenta', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth failed' } })
    await expect(aprobarSolicitud(input)).resolves.toEqual({ error: 'No se pudo crear la cuenta de acceso del jugador.' })
    expect(jugadorDeleteEq).toHaveBeenCalledWith('id', 'jugador-id')
  })

  // Sin grupo, el jugador nuevo no aparece en la lista de asistencia ni puede
  // marcar su llegada desde la app: queda entrando por la puerta de atrás.
  it('inscribe al jugador nuevo en los grupos elegidos', async () => {
    await aprobarSolicitud({ ...input, bloqueIds: ['bloque-lun', 'bloque-vie'] })

    expect(mocks.asignarBloques).toHaveBeenCalledWith({
      jugadorId: 'jugador-id',
      bloqueIds: ['bloque-lun', 'bloque-vie'],
    })
  })

  it('no toca los grupos si el admin no eligió ninguno', async () => {
    await aprobarSolicitud({ ...input, bloqueIds: [] })

    expect(mocks.asignarBloques).not.toHaveBeenCalled()
  })
})

