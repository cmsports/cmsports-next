import { describe, expect, it, vi, beforeEach } from 'vitest'

// El helper que decide si alguien puede dirigir un torneo. La prueba existe
// porque es un permiso de ESCRITURA: si el default se corre a 'si' sin querer,
// todos los profesores de todos los clubes quedan con el torneo abierto.

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))

import { requireGestorTorneos } from './require'

/**
 * @param rol            el de `perfiles`
 * @param filasConfig    lo que devuelve `club_config` para la clave
 */
function fakeSupabase(rol: string | null, filasConfig: { clave: string; valor: unknown }[]) {
  return {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'u1' } } }) },
    from(tabla: string) {
      if (tabla === 'perfiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({
            data: rol ? { id: 'u1', club_id: 'club', rol, nombre: 'Quien Sea' } : null,
          }) }) }),
        }
      }
      if (tabla === 'club_config') {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: filasConfig }) }) }) }
      }
      throw new Error('tabla inesperada: ' + tabla)
    },
  }
}

function preparar(rol: string | null, filasConfig: { clave: string; valor: unknown }[] = []) {
  mocks.createClient.mockResolvedValue(fakeSupabase(rol, filasConfig))
}

const SI = [{ clave: 'profe.gestiona_torneos', valor: 'si' }]
const NO = [{ clave: 'profe.gestiona_torneos', valor: 'no' }]

describe('requireGestorTorneos', () => {
  beforeEach(() => mocks.createClient.mockReset())

  it('el admin pasa siempre, tenga o no la clave puesta', async () => {
    preparar('admin')
    expect((await requireGestorTorneos()).error).toBe(null)
  })

  it('el profesor de un club SIN la fila NO pasa — el default es no', async () => {
    preparar('profesor', [])
    expect((await requireGestorTorneos()).error).toBe('Acceso denegado')
  })

  it("el profesor de un club con la clave en 'no' NO pasa", async () => {
    preparar('profesor', NO)
    expect((await requireGestorTorneos()).error).toBe('Acceso denegado')
  })

  it("el profesor de un club con la clave en 'si' pasa (Spinhouse)", async () => {
    preparar('profesor', SI)
    const r = await requireGestorTorneos()
    expect(r.error).toBe(null)
    expect(r.perfil?.club_id).toBe('club')
  })

  it('el jugador no pasa aunque su club tenga la clave encendida', async () => {
    preparar('jugador', SI)
    expect((await requireGestorTorneos()).error).toBe('Acceso denegado')
  })

  it('el superadmin no pasa: administra la plataforma, no suplanta al club', async () => {
    preparar('superadmin', SI)
    expect((await requireGestorTorneos()).error).toBe('Acceso denegado')
  })

  it('sin perfil no pasa', async () => {
    preparar(null)
    expect((await requireGestorTorneos()).error).toBe('Acceso denegado')
  })
})
