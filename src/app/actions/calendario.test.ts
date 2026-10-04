import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), modulo: vi.fn(), admin: vi.fn(), from: vi.fn(), borrar: vi.fn(), eq: vi.fn(), resultado: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requirePerfil: mocks.auth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
import { eliminarActividadCalendario } from './calendario'

const id = '11111111-1111-4111-8111-111111111111'
const clubId = '22222222-2222-4222-8222-222222222222'
const actividad = { id, origen: 'actividad' as const }

beforeEach(() => {
  vi.clearAllMocks()
  const lectura = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.modulo }
  lectura.select.mockReturnValue(lectura); lectura.eq.mockReturnValue(lectura)
  mocks.auth.mockResolvedValue({ error: null, perfil: { club_id: clubId, rol: 'admin' }, supabase: { from: () => lectura } })
  mocks.modulo.mockResolvedValue({ data: { modulos_habilitados: ['calendario_integrado'] }, error: null })
  const escritura = { delete: mocks.borrar, eq: mocks.eq, select: mocks.resultado }
  mocks.borrar.mockReturnValue(escritura); mocks.eq.mockReturnValue(escritura)
  mocks.from.mockReturnValue(escritura); mocks.admin.mockReturnValue({ from: mocks.from })
  mocks.resultado.mockResolvedValue({ data: [{ id }], error: null })
})

describe('borrado autorizado del calendario integrado', () => {
  it('rechaza sesiones no autenticadas antes de acceder al cliente privilegiado', async () => {
    mocks.auth.mockResolvedValue({ error: 'No autenticado' })
    expect(await eliminarActividadCalendario(actividad)).toEqual({ error: 'No autenticado' })
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it.each(['jugador', 'superadmin', null])('rechaza el rol %s que no puede editar esta agenda', async rol => {
    mocks.auth.mockResolvedValue({ error: null, perfil: { club_id: clubId, rol } })
    expect((await eliminarActividadCalendario(actividad)).error).toContain('Acceso denegado')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('rechaza identificadores inválidos', async () => {
    expect((await eliminarActividadCalendario({ ...actividad, id: 'id,club_id.not.is.null' })).error).toContain('no válida')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it.each(['torneo', 'liga', 'clase', '__proto__'])('no permite borrar el origen %s desde el calendario', async origen => {
    expect((await eliminarActividadCalendario({ id, origen: origen as 'actividad' })).error).toContain('no válida')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it.each([{ modulos: null }, { modulos: [] }, { modulos: ['calendario'] }])('no habilita el borrado por defecto en clubes con módulos $modulos', async ({ modulos }) => {
    mocks.modulo.mockResolvedValue({ data: { modulos_habilitados: modulos }, error: null })
    expect((await eliminarActividadCalendario(actividad)).error).toContain('no está habilitado')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('una consulta de permisos fallida no autoriza el borrado', async () => {
    mocks.modulo.mockResolvedValue({ data: null, error: { message: 'Sin conexión' } })
    expect((await eliminarActividadCalendario(actividad)).error).toContain('verificar el permiso')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it.each([['actividad', 'calendario_actividades'], ['evento', 'eventos']] as const)('elimina %s solamente por id y club de la sesión', async (origen, tabla) => {
    expect(await eliminarActividadCalendario({ id, origen })).toEqual({ success: true })
    expect(mocks.from).toHaveBeenCalledWith(tabla)
    expect(mocks.eq).toHaveBeenCalledWith('id', id)
    expect(mocks.eq).toHaveBeenCalledWith('club_id', clubId)
  })
  it('permite al entrenador administrar actividades de su propio club', async () => {
    mocks.auth.mockResolvedValue({ error: null, perfil: { club_id: clubId, rol: 'profesor' }, supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.modulo }) }) }) } })
    expect(await eliminarActividadCalendario(actividad)).toEqual({ success: true })
  })
  it('propaga los errores de borrado sin confirmar éxito', async () => {
    mocks.resultado.mockResolvedValue({ data: null, error: { message: 'Registro referenciado' } })
    expect((await eliminarActividadCalendario(actividad)).error).toContain('Registro referenciado')
  })
  it('cero filas (id ajeno o borrado concurrente) no se presentan como éxito', async () => {
    mocks.resultado.mockResolvedValue({ data: [], error: null })
    expect((await eliminarActividadCalendario(actividad)).error).toContain('no existe o no pertenece')
  })
})
