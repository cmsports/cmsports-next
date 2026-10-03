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
  const jugadorInsert = vi.fn()
  const jugadorUpdate = vi.fn()
  const jugadorDeleteEq = vi.fn().mockResolvedValue({ error: null })
  const solicitudUpdateClubEq = vi.fn().mockResolvedValue({ error: null })
  const perfilPorJugador = vi.fn()

  function mockear({
    ficha = null as { id: string } | null,
    perfil = null as { id: string } | null,
    correoDeOtraCuenta = false,
  } = {}) {
    jugadorInsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'jugador-id' }, error: null }) }) })
    jugadorUpdate.mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
    perfilPorJugador.mockResolvedValue({ data: perfil, error: null })

    const supabase = {
      from: vi.fn((tabla: string) => {
        if (tabla === 'solicitudes_jugador') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'solicitud-id', estado: 'pendiente' }, error: null }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: solicitudUpdateClubEq }) }),
        }
        if (tabla === 'jugadores') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: ficha, error: null }) }) }) }),
          insert: jugadorInsert,
          update: jugadorUpdate,
          delete: vi.fn().mockReturnValue({ eq: jugadorDeleteEq }),
        }
        throw new Error(`Tabla inesperada: ${tabla}`)
      }),
    }
    mocks.requireAdminClub.mockResolvedValue({ error: null, supabase, clubId: 'club-id' })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { createUser, deleteUser } },
      from: vi.fn((tabla: string) => {
        if (tabla === 'perfiles') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
            maybeSingle: perfilPorJugador,
            limit: vi.fn().mockResolvedValue({ data: correoDeOtraCuenta ? [{ id: 'cuenta-hermana' }] : [], error: null }),
          }) }),
          upsert: perfilUpsert,
        }
        return { upsert: perfilUpsert }
      }),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    createUser.mockResolvedValue({ data: { user: { id: 'usuario-id' } }, error: null })
    perfilUpsert.mockResolvedValue({ error: null })
    mocks.asignarBloques.mockResolvedValue({ success: true })
    mockear()
  })

  const input = {
    solicitudId: 'solicitud-id', nombre: 'Pedrito', rut: '12345678-9', email: ' PEDRITO@EMAIL.CL ', telefono: '+56911111111',
    fecha_nacimiento: '2015-05-01', direccion: 'Calle Falsa 123', comuna: 'Buin',
    contacto_emergencia_nombre: 'Mamá Pedrito', contacto_emergencia_telefono: '+56922222222', indicaciones_medicas: '',
    talla_polera: '', talla_short: '',
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

  it('reutiliza la ficha de visita: plan y acceso, sin borrar ranking ni pagos', async () => {
    mockear({ ficha: { id: 'visita-id' } })

    const resultado = await aprobarSolicitud({ ...input, nombre: 'José Croff', rut: '13905776-7' })

    expect(resultado).toEqual(expect.objectContaining({ success: true, cuentaCreada: true }))
    expect(jugadorInsert).not.toHaveBeenCalled()
    expect(jugadorUpdate).toHaveBeenCalledWith(expect.objectContaining({
      nombre: 'José Croff',
      email: 'pedrito@email.cl',
      es_externo: false,
      mensualidad: 25000,
    }))
    expect(perfilUpsert).toHaveBeenCalledWith(expect.objectContaining({ jugador_id: 'visita-id' }))
    expect(jugadorDeleteEq).not.toHaveBeenCalled()
  })

  it('no borra la ficha reutilizada si falla el alta de la cuenta', async () => {
    mockear({ ficha: { id: 'visita-id' } })
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth failed' } })

    await expect(aprobarSolicitud(input)).resolves.toEqual({ error: 'No se pudo crear la cuenta de acceso del jugador.' })
    expect(jugadorDeleteEq).not.toHaveBeenCalled()
  })

  it('no pisa una ficha que ya tiene cuenta', async () => {
    mockear({ ficha: { id: 'visita-id' }, perfil: { id: 'usuario-previo' } })

    const resultado = await aprobarSolicitud(input)

    expect(resultado).toEqual({ error: 'Este RUT ya está en el club y tiene cuenta. Abre su ficha para cambiar el plan.' })
    expect(jugadorUpdate).not.toHaveBeenCalled()
    expect(createUser).not.toHaveBeenCalled()
  })

  // Caso hermanas González Rozas: las dos inscritas con el correo de la mamá.
  describe('correo que ya es el usuario de otra cuenta', () => {
    it('crea la cuenta con el RUT y deja la ficha sin ese correo', async () => {
      mockear({ correoDeOtraCuenta: true })

      const resultado = await aprobarSolicitud(input)

      expect(resultado).toEqual(expect.objectContaining({
        success: true, login: '12345678-9', accesoSinCorreo: true,
      }))
      expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: '123456789@rut.cmsports.cl' }))
      expect(perfilUpsert).toHaveBeenCalledWith(expect.objectContaining({ email: '123456789@rut.cmsports.cl' }))
      // Con el correo en la ficha, el informe y el reseteo recalcularían el
      // usuario del hermano.
      expect(jugadorInsert).toHaveBeenCalledWith(expect.objectContaining({ email: null }))
      expect(perfilUpsert).toHaveBeenCalledWith(expect.objectContaining({ usuario_login: '12345678-9', tipo_login: 'rut' }))
    })

    it('usa el celular si es de 9 dígitos, igual que el resto del sistema', async () => {
      mockear({ correoDeOtraCuenta: true })

      const resultado = await aprobarSolicitud({ ...input, telefono: '911111111' })

      expect(resultado).toEqual(expect.objectContaining({ login: '911111111' }))
      expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: '911111111@cel.cmsports.cl' }))
    })

    it('sin RUT ni celular válido pide otro correo y no crea nada', async () => {
      mockear({ correoDeOtraCuenta: true })

      const resultado = await aprobarSolicitud({ ...input, rut: '', telefono: '' })

      expect(resultado.error).toMatch(/otra cuenta/)
      expect(jugadorInsert).not.toHaveBeenCalled()
      expect(createUser).not.toHaveBeenCalled()
    })

    it('un correo libre sigue siendo el usuario', async () => {
      const resultado = await aprobarSolicitud(input)
      expect(resultado).toEqual(expect.objectContaining({ login: 'pedrito@email.cl', accesoSinCorreo: false }))
    })
  })
})
