import { describe, expect, it } from 'vitest'
import { gruposFueraDeSincronia } from './sincroniaGrupos'

const g = (id: string, extra: Record<string, unknown> = {}) => ({ id, nombre: id.toUpperCase(), ...extra })
const m = (grupo_id: string, jugador_id: string) => ({ grupo_id, jugador_id })
const p = (grupo_id: string, jugador_a: string | null, jugador_b: string | null) => ({ grupo_id, fase: 'grupos', jugador_a, jugador_b })

describe('gruposFueraDeSincronia', () => {
  const grupos = [g('a'), g('b')]
  const miembros = [m('a', '1'), m('a', '2'), m('a', '3'), m('b', '4'), m('b', '5')]
  const partidos = [p('a', '1', '2'), p('a', '1', '3'), p('a', '2', '3'), p('b', '4', '5')]

  it('con todo coherente no marca nada, sin importar el orden de a y b', () => {
    expect(gruposFueraDeSincronia(grupos, miembros, partidos)).toEqual([])
    expect(gruposFueraDeSincronia(grupos, miembros, [p('a', '2', '1'), p('a', '3', '1'), p('a', '3', '2'), p('b', '5', '4')])).toEqual([])
  })

  it('otra persona movió a un jugador: partidos nuevos, integrantes viejos (el "vs —")', () => {
    // El jugador 3 pasó de A a B en otra pantalla. Acá llegaron los partidos
    // regenerados, pero los integrantes siguen siendo los de antes.
    const partidosNuevos = [p('a', '1', '2'), p('b', '4', '5'), p('b', '4', '3'), p('b', '5', '3')]
    expect(gruposFueraDeSincronia(grupos, miembros, partidosNuevos).sort()).toEqual(['a', 'b'])
  })

  it('con integrantes nuevos y partidos viejos también lo detecta', () => {
    const miembrosNuevos = [m('a', '1'), m('a', '2'), m('b', '4'), m('b', '5'), m('b', '3')]
    expect(gruposFueraDeSincronia(grupos, miembrosNuevos, partidos).sort()).toEqual(['a', 'b'])
  })

  it('se saca a alguien de un grupo: los integrantes viejos todavía lo incluyen', () => {
    expect(gruposFueraDeSincronia(grupos, miembros, [p('a', '1', '2'), p('b', '4', '5')])).toEqual(['a'])
  })

  it('un grupo con partidos a medio insertar (regeneración en curso) cuenta como desajuste', () => {
    expect(gruposFueraDeSincronia(grupos, miembros, [p('a', '1', '2'), p('a', '1', '3'), p('b', '4', '5')])).toEqual(['a'])
  })

  it('un partido con rival vacío (jugador borrado) no cuenta, o recargaría para siempre', () => {
    const conBorrado = [m('a', '1'), m('a', '2')]
    const partidosConNulo = [p('a', '1', '2'), p('a', '1', null), p('a', null, '2')]
    expect(gruposFueraDeSincronia([g('a')], conBorrado, partidosConNulo)).toEqual([])
  })

  it('la MESA y los grupos en preparación no juegan: se ignoran', () => {
    const gs = [g('mesa', { nombre: 'MESA' }), g('c', { en_preparacion: true })]
    expect(gruposFueraDeSincronia(gs, [m('mesa', '1'), m('mesa', '2'), m('c', '7'), m('c', '8')], [])).toEqual([])
  })

  it('los partidos de la llave no se mezclan con los de grupos', () => {
    const conLlave = [...partidos, { grupo_id: null, fase: 'semis', jugador_a: '1', jugador_b: '4' }]
    expect(gruposFueraDeSincronia(grupos, miembros, conLlave)).toEqual([])
  })

  it('un grupo de un solo integrante no espera partidos', () => {
    expect(gruposFueraDeSincronia([g('a')], [m('a', '1')], [])).toEqual([])
  })
})
