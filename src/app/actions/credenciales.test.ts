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

  // Abrir el informe es una LECTURA: no puede cambiarle la contraseña a nadie.
  //
  // Antes sí lo hacía. A todo perfil sin espejo se le generaba
  // `nombreapellido123` y se le aplicaba en auth (el "alta silenciosa"), así
  // que a quien había elegido su propia clave y no tenía espejo, mirar la
  // pantalla lo dejaba afuera. Hoy esos aparecen con `passwordPlano: null` y el
  // reseteo vive donde corresponde: detrás del botón "Resetear", explícito y
  // de a uno. Cambiado en la auditoría del 2026-08-26.
  it('mezcla perfiles con su espejo y NO le toca la clave a quien no lo tiene', async () => {
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
    // El admin sin espejo aparece igual, con el login deducido de su ficha,
    // pero SIN clave: no la tenemos y no se inventa una.
    expect(r.filas![0]).toMatchObject({ nombre: 'Ana', rol: 'admin', usuarioLogin: 'ana@x.cl', tipoLogin: 'email', passwordPlano: null })
    // El jugador que ya tenía espejo trae la clave existente.
    expect(r.filas![1]).toMatchObject({ nombre: 'Colomba Gonzalez', usuarioLogin: '958730364', passwordPlano: 'colombagonzalez123' })
    // El jugador sin espejo también aparece, y también sin clave.
    expect(r.filas![2]).toMatchObject({ nombre: 'Sofia Gaete', usuarioLogin: '931266944', tipoLogin: 'celular', passwordPlano: null })
    // Lo que de verdad importa: no se tocó una sola contraseña en auth.
    expect(updateUserById).not.toHaveBeenCalled()
    expect(espejos.upsert).not.toHaveBeenCalled()
  })

  // El caso real: un reset (individual o masivo) cambió el email en auth y en
  // `perfiles`, pero el espejo se quedó con el login viejo —pasa cuando el
  // upsert del espejo falla y el reset no reintenta—. El reporte tiene que
  // notar que el login ya no sirve y corregirlo, no repetir el dato viejo
  // para siempre. La clave espejada se conserva: abrir el PDF no es un reset.
  it('si el espejo quedó con un login que ya no coincide con perfiles.email, corrige el usuario y no toca la clave', async () => {
    const perfiles = {
      select: () => ({ eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: [
        { id: 'u-j1', nombre: 'Agustin', email: 'agustin@cmsports.cl', rol: 'jugador', jugador_id: 'j1' },
      ] }) }) }) }),
    }
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const espejos = {
      select: () => ({ eq: () => Promise.resolve({ data: [
        // Login viejo, de antes del reset: ya no coincide con perfiles.email.
        { usuario_id: 'u-j1', password_plano: 'agustin1234', usuario_login: 'franciscoqhuelquen@gmail.com', tipo_login: 'email', actualizado_en: '2026-07-30' },
      ] }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: updateEq }),
    }
    const jugadores = {
      select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'j1', telefono: null, rut: null }] }) }),
    }
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    mocks.createAdminClient.mockReturnValue(adminConTablas(
      { perfiles, credencial_visible: espejos, jugadores },
      { auth: { admin: { updateUserById } } },
    ))

    const r = await listarCredenciales()

    // El login se alinea a perfiles.email; la clave que ya tenía el espejo se
    // deja: el admin no pidió un reset, solo abrió el informe.
    expect(r.filas![0]).toMatchObject({ usuarioLogin: 'agustin@cmsports.cl', passwordPlano: 'agustin1234' })
    expect(updateUserById).not.toHaveBeenCalled()
    expect(espejos.upsert).not.toHaveBeenCalled()
    expect(espejos.update).toHaveBeenCalledWith({ usuario_login: 'agustin@cmsports.cl', tipo_login: 'email' })
    expect(updateEq).toHaveBeenCalledWith('usuario_id', 'u-j1')
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
        if (tabla === 'perfiles') return { ...perfilFrom(), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
        if (tabla === 'jugadores') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { email: null, telefono: '958730364', rut: null } }) }) }),
        }
        if (tabla === 'credencial_visible') return {
          upsert: espejoUpsert,
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
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

  // El caso real que motivó el fix: el jugador se creó con celular y luego se
  // le agregó un email real en su ficha. auth.users se queda con el celular
  // viejo hasta que algo lo sincroniza; sin este fix, resetear la clave la
  // aplicaba sobre la cuenta vieja y el jugador seguía sin poder entrar con
  // el email que el reporte ya le mostraba.
  it('si el email del jugador cambió desde que se creó la cuenta, sincroniza auth antes de espejar', async () => {
    perfilFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: {
        id: 'u-1', nombre: 'Agustin Quinteros', email: '958730364@cel.cmsports.cl', rol: 'jugador', jugador_id: 'j1', club_id: CLUB,
      } }) }) }),
    })
    const perfilesUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { updateUserById } },
      from: vi.fn((tabla: string) => {
        if (tabla === 'perfiles') return { ...perfilFrom(), update: perfilesUpdate }
        if (tabla === 'jugadores') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { email: 'franciscoqhuelquen@gmail.com', telefono: '958730364', rut: null } }) }) }),
        }
        if (tabla === 'credencial_visible') return {
          upsert: espejoUpsert,
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
        return {}
      }),
    })

    const r = await resetearCredencial({ usuarioId: 'u-1' })

    expect(r).toEqual({ password: 'agustinquinteros123' })
    // Se aplica el email real en auth, aparte del cambio de clave.
    expect(updateUserById).toHaveBeenCalledWith('u-1', { email: 'franciscoqhuelquen@gmail.com', email_confirm: true })
    expect(updateUserById).toHaveBeenCalledWith('u-1', { password: 'agustinquinteros123' })
    expect(perfilesUpdate).toHaveBeenCalledWith({ email: 'franciscoqhuelquen@gmail.com' })
    // El reporte muestra el email nuevo, que ahora sí coincide con auth.
    expect(espejoUpsert).toHaveBeenCalledWith(expect.objectContaining({
      usuario_login: 'franciscoqhuelquen@gmail.com', tipo_login: 'email',
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
  let perfilesData: Array<{ id: string; nombre: string; rol?: string }> = []
  // Guarda el (columna, valor) del .neq() para poder afirmar que se excluye al
  // superadmin en la consulta y no después, en memoria.
  let neqArgs: [string, string] | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    neqArgs = null
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
          select: () => ({
            eq: () => ({
              neq: (col: string, val: string) => {
                neqArgs = [col, val]
                return Promise.resolve({ data: perfilesData.filter(p => p[col as 'rol'] !== val) })
              },
            }),
          }),
          update: perfilesUpdate,
        }
        if (tabla === 'credencial_visible') return {
          upsert: espejoUpsert,
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
        return {}
      }),
    })
  })

  it('a cada perfil le reescribe email y clave con el patrón del club', async () => {
    const r = await resetearTodasLasCredenciales()

    expect(r).toEqual({ cambiadas: 2, fallidas: 0 })
    // La clave sigue el patrón viejo, el email el nuevo.
    expect(updateUserById).toHaveBeenCalledWith('u-1', { email: 'cgonzalezg@cmsports.cl', password: 'colombagonzalez123', email_confirm: true })
    expect(updateUserById).toHaveBeenCalledWith('u-2', { email: 'ssalgadog@cmsports.cl', password: 'sofiagaete123', email_confirm: true })
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

  // El superadmin toma el club_id del club que gestiona, así que el filtro por
  // club lo alcanzaba: un reset masivo le reescribía email y clave con el
  // patrón del club y lo dejaba sin poder entrar a la plataforma.
  it('nunca toca al superadmin, aunque esté gestionando este club', async () => {
    perfilesData = [
      { id: 'u-1', nombre: 'Colomba Gonzalez Gonzalez', rol: 'admin' },
      { id: 'u-sa', nombre: 'CmSports', rol: 'superadmin' },
    ]

    const r = await resetearTodasLasCredenciales()

    expect(neqArgs).toEqual(['rol', 'superadmin'])
    expect(r).toEqual({ cambiadas: 1, fallidas: 0 })
    expect(updateUserById).not.toHaveBeenCalledWith('u-sa', expect.anything())
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
