import { describe, expect, it } from 'vitest'
import { cargarRankingDelClub, claveCategoria } from './rankingClub'

type Fila = Record<string, any>

// Supabase de mentira, solo lectura: lo que `cargarRankingDelClub` usa.
function fakeSupabase(tablas: Record<string, Fila[]>) {
  const from = (tabla: string) => {
    const filtros: Array<(f: Fila) => boolean> = []
    const aplicar = () => (tablas[tabla] ?? []).filter(f => filtros.every(p => p(f)))
    const builder: any = {
      select: () => builder,
      eq: (c: string, v: any) => (filtros.push(f => f[c] === v), builder),
      in: (c: string, vs: any[]) => (filtros.push(f => vs.includes(f[c])), builder),
      gt: (c: string, v: any) => (filtros.push(f => f[c] > v), builder),
      not: (c: string, _op: string, v: any) => (filtros.push(f => (f[c] ?? null) !== v), builder),
      single: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: aplicar(), error: null }),
    }
    return builder
  }
  return { from }
}

const CLUB = 'club-1'

function escenario() {
  return {
    clubes: [{ id: CLUB, nombre: 'Club de Prueba', ranking_reiniciado_en: null as string | null }],
    torneos: [
      // Interno y finalizado: cuenta.
      { id: 't1', club_id: CLUB, tipo: 'interno', estado: 'finalizado', categoria: 'SUB 15', genero: 'varones', creado_en: '2026-08-01' },
      // Externo: no cuenta para el ranking.
      { id: 't2', club_id: CLUB, tipo: 'externo', estado: 'finalizado', categoria: 'SUB 15', genero: 'varones', creado_en: '2026-08-02' },
      // En curso: todavía no tiene puestos.
      { id: 't3', club_id: CLUB, tipo: 'interno', estado: 'en_curso', categoria: 'SUB 15', genero: 'varones', creado_en: '2026-08-03' },
      // De otro club.
      { id: 't4', club_id: 'otro', tipo: 'interno', estado: 'finalizado', categoria: 'SUB 15', genero: 'varones', creado_en: '2026-08-04' },
    ],
    ranking_saldo_inicial: [
      // Una categoría que solo existe por el saldo del papel.
      { club_id: CLUB, jugador_id: 'z', categoria: 'ADULTO', genero: 'damas', puntos: 50, creado_en: '2026-07-01' },
    ],
    torneo_partidos: [
      { torneo_id: 't1', jugador_a: 'a', jugador_b: 'b', ganador: 'a', fase: 'final' },
      { torneo_id: 't1', jugador_a: 'a', jugador_b: 'c', ganador: 'a', fase: 'semis' },
      { torneo_id: 't1', jugador_a: 'b', jugador_b: 'd', ganador: 'b', fase: 'semis' },
      // Un BYE (sin rival) no cuenta como partido.
      { torneo_id: 't1', jugador_a: 'a', jugador_b: null, ganador: 'a', fase: 'cuartos' },
      // Del torneo externo: no debe entrar.
      { torneo_id: 't2', jugador_a: 'x', jugador_b: 'y', ganador: 'x', fase: 'final' },
      // Del torneo en curso: tampoco.
      { torneo_id: 't3', jugador_a: 'x', jugador_b: 'y', ganador: 'y', fase: 'final' },
    ],
    jugadores: [
      { id: 'a', nombre: 'ana perez', foto_path: 'fotos/a.jpg' },
      { id: 'b', nombre: 'beto soto', foto_path: null },
      { id: 'c', nombre: 'cata', foto_path: null },
      { id: 'd', nombre: 'dani', foto_path: null },
      { id: 'z', nombre: 'zoe', foto_path: null },
      { id: 'x', nombre: 'externo x', foto_path: null },
      { id: 'y', nombre: 'externo y', foto_path: null },
    ],
  }
}

describe('cargarRankingDelClub', () => {
  it('arma una categoría por (categoría, género) solo con torneos internos finalizados del club', async () => {
    const r = await cargarRankingDelClub(fakeSupabase(escenario()), CLUB)
    expect(r.clubNombre).toBe('Club de Prueba')
    expect(r.categorias.map(c => claveCategoria(c.categoria, c.genero))).toEqual(['ADULTO||damas', 'SUB 15||varones'])

    const sub15 = r.categorias.find(c => c.categoria === 'SUB 15')!
    expect(sub15.filas[0].nombre).toBe('ana perez')  // campeona
    expect(sub15.filas[0].rank).toBe(1)
    expect(sub15.filas[1].nombre).toBe('beto soto')  // finalista
    expect(sub15.filas.map(f => f.nombre)).not.toContain('externo x')
    expect(sub15.filas.map(f => f.nombre)).not.toContain('externo y')
  })

  it('la categoría que solo tiene saldo del papel también sale, con sus puntos', async () => {
    const r = await cargarRankingDelClub(fakeSupabase(escenario()), CLUB)
    const adulto = r.categorias.find(c => c.categoria === 'ADULTO')!
    expect(adulto.genero).toBe('damas')
    expect(adulto.filas).toHaveLength(1)
    expect(adulto.filas[0]).toMatchObject({ nombre: 'zoe', pts: 50 })
  })

  it('devuelve los jugadores con su foto sin firmar, para que la pantalla privada la firme', async () => {
    const r = await cargarRankingDelClub(fakeSupabase(escenario()), CLUB)
    expect(r.jugadores.find(j => j.id === 'a')?.foto_path).toBe('fotos/a.jpg')
    expect(r.jugadores.some(j => j.id === 'x')).toBe(false)
  })

  it('con el ranking reiniciado, ignora torneos y saldos anteriores al reinicio', async () => {
    const t = escenario()
    t.clubes[0].ranking_reiniciado_en = '2026-08-10'
    const r = await cargarRankingDelClub(fakeSupabase(t), CLUB)
    expect(r.reiniciadoEn).toBe('2026-08-10')
    expect(r.categorias).toEqual([])
  })
})
