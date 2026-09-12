import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  cargarRankingDelClub: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/supabase/rankingClub', () => ({ cargarRankingDelClub: mocks.cargarRankingDelClub }))

import { GET } from './[codigo]/route'

// El club que responde a un código. `modulos` decide si publica o no.
function adminConClub(club: { id: string; nombre: string; modulos_habilitados: string[] } | null) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: club, error: null }),
  }
  return { from: () => builder }
}

const llamar = (codigo: string) => GET(new Request('http://x/api/ranking-publico/' + codigo), { params: Promise.resolve({ codigo }) })

describe('GET /api/ranking-publico/[codigo]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cargarRankingDelClub.mockResolvedValue({
      clubNombre: 'Buin', reiniciadoEn: null,
      categorias: [{ categoria: 'SUB 15', genero: 'varones', filas: [
        { jugadorId: 'a', nombre: 'ana', pts: 100, victorias: 2, derrotas: 0, jugados: 2, torneos: 1, rank: 1 },
      ] }],
      jugadores: [{ id: 'a', nombre: 'ana', foto_path: 'fotos/a.jpg' }],
    })
  })

  it('un código con forma inválida es 404 sin tocar la base', async () => {
    mocks.createAdminClient.mockReturnValue(adminConClub(null))
    const res = await llamar('../etc')
    expect(res.status).toBe(404)
    expect(mocks.cargarRankingDelClub).not.toHaveBeenCalled()
  })

  it('un código que no es de ningún club es 404', async () => {
    mocks.createAdminClient.mockReturnValue(adminConClub(null))
    const res = await llamar('ABCD2345')
    expect(res.status).toBe(404)
  })

  it('un club SIN el módulo qr_publico es 404 aunque el código exista', async () => {
    mocks.createAdminClient.mockReturnValue(adminConClub({ id: 'c', nombre: 'Otro', modulos_habilitados: ['torneos'] }))
    const res = await llamar('ABCD2345')
    expect(res.status).toBe(404)
    expect(mocks.cargarRankingDelClub).not.toHaveBeenCalled()
  })

  it('con el módulo, responde nombre y puntos por categoría — sin ids ni fotos', async () => {
    mocks.createAdminClient.mockReturnValue(adminConClub({ id: 'c', nombre: 'Buin', modulos_habilitados: ['torneos', 'qr_publico'] }))
    const res = await llamar('abcd2345') // en minúscula: se normaliza
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('public')
    const json = await res.json()
    expect(json.club).toBe('Buin')
    expect(json.categorias[0].filas[0]).toEqual({ rank: 1, nombre: 'ana', pts: 100, victorias: 2, derrotas: 0, jugados: 2, torneos: 1 })
    expect(JSON.stringify(json)).not.toContain('foto')
    expect(JSON.stringify(json)).not.toContain('jugadorId')
  })
})
