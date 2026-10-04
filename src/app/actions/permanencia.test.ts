import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ require: vi.fn(), rpc: vi.fn(), single: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.require }))
vi.mock('@/lib/domain/fechaChile', () => ({ fechaChile: () => '2026-10-03' }))
import { registrarPermanencia } from './permanencia'

const jugadorId = 'f4e05005-cdb9-46ec-a207-9248614821cb'
const movimiento = { jugadorId, tipo: 'retiro' as const, fecha: '2026-10-01', motivo: 'Retiro informado por el apoderado' }

describe('permanencia del jugador', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const db = { from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }), rpc: mocks.rpc }
    mocks.require.mockResolvedValue({ error: null, supabase: db, clubId: 'club' })
    mocks.single.mockResolvedValue({ data: { modulos_habilitados: ['indicador_bajas_club'] }, error: null })
    mocks.rpc.mockResolvedValue({ data: 'evento-creado', error: null })
  })
  it('rechaza usuarios sin permiso antes de escribir', async () => {
    mocks.require.mockResolvedValue({ error: 'Acceso denegado', supabase: null, clubId: null })
    expect(await registrarPermanencia(movimiento)).toEqual({ error: 'Acceso denegado' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('no activa retiros en clubes que no tienen el módulo explícito', async () => {
    mocks.single.mockResolvedValue({ data: { modulos_habilitados: null }, error: null })
    expect((await registrarPermanencia(movimiento)).error).toContain('no tiene habilitado')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('no confunde una falla consultando módulos con autorización', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'Sin conexión' } })
    expect((await registrarPermanencia(movimiento)).error).toContain('no tiene habilitado')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['2026-10-04', '2026-02-30', '2026-13-01', 'no-fecha'])('rechaza fecha futura o inválida %s', async fecha => {
    expect((await registrarPermanencia({ ...movimiento, fecha })).error).toContain('Fecha inválida')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('requiere motivo documentado', async () => {
    expect((await registrarPermanencia({ ...movimiento, motivo: ' ' })).error).toContain('motivo')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('envía el movimiento al RPC y propaga los errores de la escritura', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'El jugador ya figura inactivo' } })
    expect(await registrarPermanencia(movimiento)).toEqual({ error: 'El jugador ya figura inactivo' })
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_permanencia_jugador', {
      p_jugador_id: jugadorId, p_tipo: 'retiro', p_fecha: '2026-10-01', p_motivo: movimiento.motivo,
    })
  })
  it('solo confirma cuando la base devuelve un movimiento creado', async () => {
    expect(await registrarPermanencia(movimiento)).toEqual({ success: true })
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    expect((await registrarPermanencia(movimiento)).error).toContain('No se confirmó')
  })
})
