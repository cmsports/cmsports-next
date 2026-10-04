import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdmin }))
import { cargarFinanzasSpinhouse, guardarTarifaSpinhouse, liquidarEntrenadorSpinhouse, confirmarHorasSpinhouse } from './finanzasSpinhouse'
const id = 'd3333333-3333-4333-8333-333333333333'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: { success: true }, error: null })
  mocks.requireAdmin.mockResolvedValue({ error: null, clubId: 'club-auth', supabase: { rpc: mocks.rpc } })
})
describe('acciones financieras aisladas', () => {
  it('rechaza usuarios sin administración antes de llamar la base', async () => {
    mocks.requireAdmin.mockResolvedValue({ error: 'Acceso denegado', supabase: null })
    expect(await cargarFinanzasSpinhouse({ mes: 9, anio: 2026 })).toEqual({ error: 'Acceso denegado' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('no acepta un clubId del cliente y conserva el contexto de Supabase al llamar RPC', async () => {
    const client = { rpc: function (this: { marker: string }, nombre: string, params: Record<string, unknown>) { expect(this.marker).toBe('sesion'); return mocks.rpc(nombre, params) }, marker: 'sesion' }
    mocks.requireAdmin.mockResolvedValue({ error: null, clubId: 'club-auth', supabase: client })
    await liquidarEntrenadorSpinhouse({ profesorId: id, mes: 9, anio: 2026 })
    expect(mocks.rpc).toHaveBeenCalledWith('spinhouse_finanzas_liquidar', { p_profesor: id, p_mes: 9, p_anio: 2026 })
  })
  it('no informa éxito cuando falla el RPC o no devuelve resultado', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Falta tarifa' } })
    expect(await liquidarEntrenadorSpinhouse({ profesorId: id, mes: 9, anio: 2026 })).toEqual({ error: 'Falta tarifa' })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await liquidarEntrenadorSpinhouse({ profesorId: id, mes: 9, anio: 2026 })).toEqual({ error: 'La operación no devolvió un resultado confirmado' })
  })
  it('exige confirmar modalidad de cobro histórica y envía false explícito para clases incluidas', async () => {
    const input = { asistenciaId: id, minutos: 90, tipoClase: 'particular' as const, rol: 'principal' as const, seCobraAparte: null as unknown as boolean }
    expect(await confirmarHorasSpinhouse(input)).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    await confirmarHorasSpinhouse({ ...input, seCobraAparte: false })
    expect(mocks.rpc).toHaveBeenCalledWith('spinhouse_finanzas_confirmar_horas', { p_asistencia: id, p_minutos: 90, p_tipo: 'particular', p_rol: 'principal', p_cobro_aparte: false })
  })
  it('valida importes y UUID antes de autorizar una escritura', async () => {
    const result = await guardarTarifaSpinhouse({ profesorId: 'otro', tipoClase: 'grupal', rol: 'principal', desde: '2026-09-01', montoHora: -1 })
    expect(result).toHaveProperty('error')
    expect(mocks.requireAdmin).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
