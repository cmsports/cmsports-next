import { describe, expect, it } from 'vitest'
import { inconsistenciasDeGrupos, type GrupoDelTorneo, type MiembroDeGrupo, type PartidoDeGrupo } from './torneoConsistencia'
import { generarRoundRobin } from './torneos'

const grupo = (id: string, nombre = id, extra: Partial<GrupoDelTorneo> = {}): GrupoDelTorneo => ({ id, nombre, ...extra })
const miembros = (grupoId: string, ids: string[]): MiembroDeGrupo[] => ids.map(j => ({ grupo_id: grupoId, jugador_id: j }))
const partidosDe = (grupoId: string, ids: string[], desde = 0): PartidoDeGrupo[] =>
  generarRoundRobin(ids).map(([a, b], i) => ({ id: `${grupoId}-p${desde + i}`, grupo_id: grupoId, jugador_a: a, jugador_b: b }))
const codigos = (r: ReturnType<typeof inconsistenciasDeGrupos>) => r.map(x => x.codigo).sort()

describe('inconsistenciasDeGrupos', () => {
  it('un torneo sano no tiene nada que avisar', () => {
    const r = inconsistenciasDeGrupos({
      grupos: [grupo('A'), grupo('B')],
      miembros: [...miembros('A', ['a1', 'a2', 'a3', 'a4']), ...miembros('B', ['b1', 'b2', 'b3'])],
      partidos: [...partidosDe('A', ['a1', 'a2', 'a3', 'a4']), ...partidosDe('B', ['b1', 'b2', 'b3'])],
    })
    expect(r).toEqual([])
  })

  it('detecta lo que pasó en TC A y TC B el 2026-10-25: el origen conserva al que se fue y el destino no recibe al que llegó', () => {
    // a3 se movió de A a B, pero los partidos se regeneraron con la foto de antes.
    const r = inconsistenciasDeGrupos({
      grupos: [grupo('A'), grupo('B')],
      miembros: [...miembros('A', ['a1', 'a2']), ...miembros('B', ['b1', 'b2', 'a3'])],
      partidos: [...partidosDe('A', ['a1', 'a2', 'a3']), ...partidosDe('B', ['b1', 'b2'])],
    })
    // En A: dos partidos con a3, que ya no está en A. En B: faltan b1-a3 y b2-a3.
    expect(codigos(r)).toEqual(['pareja_sin_partido', 'pareja_sin_partido', 'partido_con_jugador_ajeno', 'partido_con_jugador_ajeno'])
    expect(r.filter(x => x.codigo === 'partido_con_jugador_ajeno').every(x => x.grupo === 'A' && x.jugadorIds.includes('a3'))).toBe(true)
    expect(r.filter(x => x.codigo === 'pareja_sin_partido').every(x => x.grupo === 'B')).toBe(true)
  })

  it('un partido sin rival ("vs —") se marca', () => {
    const r = inconsistenciasDeGrupos({
      grupos: [grupo('A')],
      miembros: miembros('A', ['a1', 'a2']),
      partidos: [{ id: 'p1', grupo_id: 'A', jugador_a: 'a1', jugador_b: null }, { id: 'p2', grupo_id: 'A', jugador_a: 'a1', jugador_b: 'a2' }],
    })
    expect(codigos(r)).toEqual(['partido_sin_rival'])
  })

  it('un partido que apunta a un grupo borrado se marca', () => {
    const r = inconsistenciasDeGrupos({
      grupos: [grupo('A')],
      miembros: miembros('A', ['a1', 'a2']),
      partidos: [...partidosDe('A', ['a1', 'a2']), { id: 'x', grupo_id: 'borrado', jugador_a: 'a1', jugador_b: 'a2' }],
    })
    expect(codigos(r)).toEqual(['partido_en_grupo_inexistente'])
  })

  it('una pareja repetida se marca, salvo en liguilla a doble rueda', () => {
    const base = {
      grupos: [grupo('A')],
      miembros: miembros('A', ['a1', 'a2', 'a3']),
      partidos: [...partidosDe('A', ['a1', 'a2', 'a3']), { id: 'dup', grupo_id: 'A', jugador_a: 'a2', jugador_b: 'a1' }],
    }
    expect(codigos(inconsistenciasDeGrupos(base))).toEqual(['partido_repetido'])
    expect(inconsistenciasDeGrupos({ ...base, ruedas: 2 })).toEqual([])
  })

  it('un jugador en dos grupos que se juegan se marca; en MESA no, porque ahí queda el respaldo de la inscripción', () => {
    const r = inconsistenciasDeGrupos({
      grupos: [grupo('A'), grupo('B'), grupo('M', 'MESA')],
      miembros: [...miembros('A', ['a1', 'a2']), ...miembros('B', ['b1', 'a1']), ...miembros('M', ['a1', 'a2', 'b1'])],
      partidos: [...partidosDe('A', ['a1', 'a2']), ...partidosDe('B', ['b1', 'a1'])],
    })
    expect(codigos(r)).toEqual(['jugador_en_dos_grupos'])
  })

  it('un grupo vacío se marca; MESA y los grupos en preparación no se exigen', () => {
    const r = inconsistenciasDeGrupos({
      grupos: [grupo('A'), grupo('M', 'MESA'), grupo('P', 'P', { en_preparacion: true }), grupo('Z')],
      miembros: [...miembros('A', ['a1', 'a2']), ...miembros('P', ['p1', 'p2'])],
      partidos: partidosDe('A', ['a1', 'a2']),
    })
    expect(codigos(r)).toEqual(['grupo_sin_jugadores'])
    expect(r[0].grupo).toBe('Z')
  })

  it('usa el nombre del jugador cuando se lo dan', () => {
    const r = inconsistenciasDeGrupos({
      grupos: [grupo('A')],
      miembros: miembros('A', ['a1', 'a2']),
      partidos: [],
      nombreDe: id => ({ a1: 'Juan Pérez', a2: 'Ana Soto' })[id] ?? id,
    })
    expect(r[0].detalle).toContain('Juan Pérez vs Ana Soto')
  })
})
