import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ staff: vi.fn(), perfil: vi.fn(), from: vi.fn(), rpc: vi.fn(), single: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireStaffClub: mocks.staff, requirePerfil: mocks.perfil }))
import { cargarFichaParalimpica, guardarFichaParalimpica, registrarConsentimientoSalud } from './ficha-paralimpica'

const jugadorId = '11111111-1111-4111-8111-111111111111'
const otroJugador = '22222222-2222-4222-8222-222222222222'
const guardar = { jugadorId, modalidad: 'sentado' as const, claseDeportiva: 3, necesidadesAccesibilidad: 'Rampa' }

beforeEach(() => {
  vi.clearAllMocks()
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.single }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
  mocks.from.mockReturnValue(query)
  mocks.single.mockResolvedValue({ data: { modulos_habilitados: ['ficha_paralimpica'] }, error: null })
  mocks.staff.mockResolvedValue({ error: null, clubId: 'club-spinhouse', supabase: { from: mocks.from, rpc: mocks.rpc } })
  mocks.perfil.mockResolvedValue({ error: null, perfil: { club_id: 'club-spinhouse', rol: 'jugador', jugador_id: jugadorId }, supabase: { from: mocks.from } })
})

describe('aislamiento ficha paralímpica', () => {
  it('un jugador no puede consultar la ficha de otro jugador', async () => {
    expect(await cargarFichaParalimpica(otroJugador)).toEqual({ error: 'Acceso denegado.' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('rechaza escrituras sin rol staff antes de consultar o escribir', async () => {
    mocks.staff.mockResolvedValue({ error: 'Acceso denegado' })
    expect(await guardarFichaParalimpica(guardar)).toEqual({ error: 'Acceso denegado' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('no ejecuta el RPC si el módulo está apagado en otro club', async () => {
    mocks.single.mockResolvedValue({ data: { modulos_habilitados: ['jugadores'] }, error: null })
    expect((await guardarFichaParalimpica(guardar)).error).toContain('no está habilitada')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('no ejecuta el RPC con clases de otra modalidad', async () => {
    expect((await guardarFichaParalimpica({ ...guardar, claseDeportiva: 8 })).error).toContain('corresponder')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('propaga el rechazo del RPC si falta consentimiento de salud', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Falta consentimiento vigente para datos de salud' } })
    expect((await guardarFichaParalimpica(guardar)).error).toContain('consentimiento vigente')
  })
  it('exige confirmación del id escrito, no informa éxito ante cero filas', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    expect((await guardarFichaParalimpica(guardar)).error).toContain('confirmar')
  })
  it('no registra consentimientos sin identidad del firmante o respaldo', async () => {
    const resultado = await registrarConsentimientoSalud({ jugadorId, otorgado: true, fecha: '2026-01-01', firmadoPor: 'apoderado', nombreFirmante: '', respaldo: '' })
    expect(resultado.error).toContain('nombre de quien firmó')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
