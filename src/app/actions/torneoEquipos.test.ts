import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '@/lib/test/fakeSupabase'

const mocks = vi.hoisted(() => ({ requireAdminClub: vi.fn() }))
vi.mock('@/lib/auth/require', () => ({ requireAdminClub: mocks.requireAdminClub }))

import { armarEncuentro, generarEncuentros, guardarEquipo, marcarPartidoDeEncuentro } from './torneoEquipos'

const TORNEO = { id: 't1', club_id: 'club-1', formato: 'equipos', sistema_equipos: 'corbillon', fase: 'inscripcion', estado: 'en_curso', nombre: 'Copa' }

function montar(extra: Record<string, unknown> = {}) {
  const fake = fakeSupabase({
    torneos: [TORNEO],
    torneo_grupos: [{ id: 'mesa' }],
    grupo_jugadores: [{ jugador_id: 'j1' }, { jugador_id: 'j2' }, { jugador_id: 'j3' }, { jugador_id: 'j4' }],
    torneo_equipo_jugadores: [],
    torneo_equipos: [],
    torneo_encuentros: [],
    torneo_partidos: [],
    ...extra,
  })
  mocks.requireAdminClub.mockResolvedValue({ error: null, supabase: fake.cliente, clubId: 'club-1', userId: 'u1' })
  return fake
}

describe('torneo por equipos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('corta sin autorización', async () => {
    mocks.requireAdminClub.mockResolvedValue({ error: 'Acceso denegado', supabase: null, clubId: null })
    await expect(guardarEquipo({ torneoId: 't1', nombre: 'A', jugadorIds: ['j1', 'j2'] })).resolves.toEqual({ error: 'Acceso denegado' })
    await expect(generarEncuentros({ torneoId: 't1' })).resolves.toEqual({ error: 'Acceso denegado' })
  })

  it('un equipo Corbillon necesita dos jugadores, y no escribe nada si le falta', async () => {
    const fake = montar()
    const res = await guardarEquipo({ torneoId: 't1', nombre: 'Los Pinos', jugadorIds: ['j1'] })
    expect(res.error).toMatch(/al menos 2/)
    expect(fake.escrituras('torneo_equipos')).toHaveLength(0)
  })

  it('rechaza a un jugador que no está inscrito en la mesa', async () => {
    const fake = montar()
    const res = await guardarEquipo({ torneoId: 't1', nombre: 'Los Pinos', jugadorIds: ['j1', 'ajeno'] })
    expect(res.error).toMatch(/no están inscritos/)
    expect(fake.escrituras('torneo_equipos')).toHaveLength(0)
  })

  it('crea el equipo y su plantel en orden (A, B, …)', async () => {
    const fake = montar()
    const res = await guardarEquipo({ torneoId: 't1', nombre: 'Los Pinos', clubProcedencia: ' Spinhouse ', jugadorIds: ['j2', 'j1'] })
    expect(res.error).toBeUndefined()
    expect(fake.escrituras('torneo_equipos')).toEqual([expect.objectContaining({ nombre: 'Los Pinos', club_procedencia: 'Spinhouse' })])
    expect(fake.escrituras('torneo_equipo_jugadores')).toEqual([
      expect.objectContaining({ jugador_id: 'j2', orden: 0 }),
      expect.objectContaining({ jugador_id: 'j1', orden: 1 }),
    ])
  })

  it('el todos contra todos de tres equipos son tres encuentros, y la inscripción se cierra', async () => {
    const fake = montar({
      torneo_equipos: [{ id: 'e1', nombre: 'Uno', orden: 0 }, { id: 'e2', nombre: 'Dos', orden: 1 }, { id: 'e3', nombre: 'Tres', orden: 2 }],
      torneo_equipo_jugadores: [
        { equipo_id: 'e1' }, { equipo_id: 'e1' }, { equipo_id: 'e2' }, { equipo_id: 'e2' }, { equipo_id: 'e3' }, { equipo_id: 'e3' },
      ],
    })
    const res = await generarEncuentros({ torneoId: 't1' })
    expect(res).toEqual({ encuentros: 3 })
    const enc = fake.escrituras('torneo_encuentros')
    expect(enc).toHaveLength(3)
    expect(enc.every(e => e.fase === 'grupos' && e.sistema === 'corbillon')).toBe(true)
    expect(new Set(enc.map(e => e.orden))).toEqual(new Set([1, 2, 3]))
    expect(fake.escrituras('torneos')).toEqual([expect.objectContaining({ fase: 'grupos' })])
  })

  it('no genera encuentros si un equipo está incompleto', async () => {
    const fake = montar({
      torneo_equipos: [{ id: 'e1', nombre: 'Uno', orden: 0 }, { id: 'e2', nombre: 'Dos', orden: 1 }],
      torneo_equipo_jugadores: [{ equipo_id: 'e1' }, { equipo_id: 'e1' }, { equipo_id: 'e2' }],
    })
    const res = await generarEncuentros({ torneoId: 't1' })
    expect(res.error).toMatch(/"Dos" tiene 1 jugador/)
    expect(fake.escrituras('torneo_encuentros')).toHaveLength(0)
  })

  it('armar un encuentro Corbillon crea los cinco partidos, con el dobles en el tercero', async () => {
    const fake = montar({
      torneo_encuentros: [{ id: 'enc1', orden: 2, equipo_a_id: 'e1', equipo_b_id: 'e2', sistema: 'corbillon' }],
      torneo_equipo_jugadores: [
        { equipo_id: 'e1', jugador_id: 'a1' }, { equipo_id: 'e1', jugador_id: 'a2' },
        { equipo_id: 'e2', jugador_id: 'b1' }, { equipo_id: 'e2', jugador_id: 'b2' },
      ],
    })
    const res = await armarEncuentro({
      torneoId: 't1', encuentroId: 'enc1',
      alineacionA: { individuales: ['a1', 'a2'], dobles: ['a1', 'a2'] },
      alineacionB: { individuales: ['b1', 'b2'], dobles: ['b2', 'b1'] },
    })
    expect(res).toEqual({ success: true })
    const partidos = fake.escrituras('torneo_partidos')
    expect(partidos).toHaveLength(5)
    // A-X, B-Y, dobles, A-Y, B-X — y el orden no choca con nada: 1000 + 2×10 + n.
    expect(partidos.map(p => [p.jugador_a, p.jugador_b])).toEqual([['a1', 'b1'], ['a2', 'b2'], ['a1', 'b2'], ['a1', 'b2'], ['a2', 'b1']])
    expect(partidos[2]).toEqual(expect.objectContaining({ jugador_a2: 'a2', jugador_b2: 'b1', numero_en_encuentro: 3 }))
    expect(partidos.map(p => p.orden)).toEqual([1021, 1022, 1023, 1024, 1025])
    expect(partidos.every(p => p.fase === 'grupos' && p.encuentro_id === 'enc1')).toBe(true)
  })

  it('rechaza una alineación con alguien que no es del plantel', async () => {
    const fake = montar({
      torneo_encuentros: [{ id: 'enc1', orden: 1, equipo_a_id: 'e1', equipo_b_id: 'e2', sistema: 'corbillon' }],
      torneo_equipo_jugadores: [{ equipo_id: 'e1', jugador_id: 'a1' }, { equipo_id: 'e1', jugador_id: 'a2' }, { equipo_id: 'e2', jugador_id: 'b1' }, { equipo_id: 'e2', jugador_id: 'b2' }],
    })
    const res = await armarEncuentro({
      torneoId: 't1', encuentroId: 'enc1',
      alineacionA: { individuales: ['a1', 'b1'], dobles: ['a1', 'a2'] },
      alineacionB: { individuales: ['b1', 'b2'], dobles: ['b1', 'b2'] },
    })
    expect(res.error).toMatch(/Equipo A.*plantel/)
    expect(fake.escrituras('torneo_partidos')).toHaveLength(0)
  })

  it('no acepta resultado en un partido que ya no se juega (el encuentro cerró 3-0)', async () => {
    const fake = montar({
      torneo_encuentros: [{ id: 'enc1', orden: 1, equipo_a_id: 'e1', equipo_b_id: 'e2', sistema: 'corbillon' }],
      // La primera fila es la que se intenta marcar (la 4); las otras tres ya las ganó A.
      torneo_partidos: [
        { id: 'p4', encuentro_id: 'enc1', numero_en_encuentro: 4, jugador_a: 'a1', jugador_b: 'b2', ganador: null },
        { id: 'p1', encuentro_id: 'enc1', numero_en_encuentro: 1, jugador_a: 'a1', jugador_b: 'b1', ganador: 'a1' },
        { id: 'p2', encuentro_id: 'enc1', numero_en_encuentro: 2, jugador_a: 'a2', jugador_b: 'b2', ganador: 'a2' },
        { id: 'p3', encuentro_id: 'enc1', numero_en_encuentro: 3, jugador_a: 'a1', jugador_b: 'b1', ganador: 'a1' },
      ],
    })
    const res = await marcarPartidoDeEncuentro({ torneoId: 't1', partidoId: 'p4', parciales: [[11, 5], [11, 5], [11, 5]] })
    expect(res.error).toMatch(/ya no se juega/)
    expect(fake.escrituras('torneo_partidos')).toHaveLength(0)
  })

  it('con el tercer partido ganado, el encuentro queda cerrado 3-0', async () => {
    const fake = montar({
      torneo_encuentros: [{ id: 'enc1', orden: 1, equipo_a_id: 'e1', equipo_b_id: 'e2', sistema: 'corbillon' }],
      torneo_partidos: [
        { id: 'p3', encuentro_id: 'enc1', numero_en_encuentro: 3, jugador_a: 'a1', jugador_b: 'b1', ganador: null },
        { id: 'p1', encuentro_id: 'enc1', numero_en_encuentro: 1, jugador_a: 'a1', jugador_b: 'b1', ganador: 'a1' },
        { id: 'p2', encuentro_id: 'enc1', numero_en_encuentro: 2, jugador_a: 'a2', jugador_b: 'b2', ganador: 'a2' },
      ],
    })
    const res = await marcarPartidoDeEncuentro({ torneoId: 't1', partidoId: 'p3', parciales: [[11, 9], [9, 11], [11, 7], [11, 3]] })
    expect(res).toEqual({ encuentroTerminado: true })
    expect(fake.escrituras('torneo_partidos')).toEqual([expect.objectContaining({ ganador: 'a1', sets_a: 3, sets_b: 1, puntos_a: 42, puntos_b: 30 })])
    expect(fake.escrituras('torneo_encuentros')).toEqual([expect.objectContaining({ ganador_equipo_id: 'e1' })])
  })

  it('rechaza parciales que no son un partido terminado', async () => {
    const fake = montar({
      torneo_encuentros: [{ id: 'enc1', orden: 1, equipo_a_id: 'e1', equipo_b_id: 'e2', sistema: 'corbillon' }],
      torneo_partidos: [{ id: 'p1', encuentro_id: 'enc1', numero_en_encuentro: 1, jugador_a: 'a1', jugador_b: 'b1', ganador: null }],
    })
    const res = await marcarPartidoDeEncuentro({ torneoId: 't1', partidoId: 'p1', parciales: [[11, 9], [11, 9]] })
    expect(res.error).toMatch(/Parciales inválidos/)
    expect(fake.escrituras('torneo_partidos')).toHaveLength(0)
  })
})
