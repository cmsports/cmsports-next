import { describe, it, expect } from 'vitest'
import { aplicarSerpienteSegundos } from './oficial-sorteo'
import { clasificarGrupoIttf } from './oficial-ittf'
import { esUuid, uuidOrFail } from './uuid'
import type { LlavesLayout } from './torneos'

/**
 * Los tres defectos de lógica pura que encontró la auditoría del 2026-08-26.
 *
 * Van juntos y no repartidos en los archivos de cada módulo porque lo que
 * comparten es el modo de fallar, no el tema: los tres producían un resultado
 * plausible —un cuadro completo, una tabla ordenada, una consulta que devuelve
 * filas— que estaba mal, sin lanzar ningún error.
 */

// ── M-03: la serpiente duplicaba un 2.º y perdía otro ──────────────────────
describe('aplicarSerpienteSegundos', () => {
  const layout = (matches: LlavesLayout['matches']): LlavesLayout => ({
    faseInicial: 'cuartos', matches,
  })

  it('reasigna los 2.os sin repetir ninguno ni perder ninguno', () => {
    const base = layout([
      { orden: 0, a: { grupoIdx: 0, pos: 1 }, b: { grupoIdx: 1, pos: 2 } },
      { orden: 1, a: { grupoIdx: 1, pos: 1 }, b: { grupoIdx: 2, pos: 2 } },
      { orden: 2, a: { grupoIdx: 2, pos: 1 }, b: { grupoIdx: 3, pos: 2 } },
      { orden: 3, a: { grupoIdx: 3, pos: 1 }, b: { grupoIdx: 0, pos: 2 } },
    ])

    const r = aplicarSerpienteSegundos(base)
    const segundos = r.matches.map(m => m.b!.grupoIdx).sort()

    expect(segundos).toEqual([0, 1, 2, 3])          // los cuatro, una vez cada uno
    expect(new Set(segundos).size).toBe(4)          // ninguno repetido
  })

  it('nunca enfrenta al 1.º y al 2.º del mismo grupo', () => {
    const base = layout([
      { orden: 0, a: { grupoIdx: 0, pos: 1 }, b: { grupoIdx: 1, pos: 2 } },
      { orden: 1, a: { grupoIdx: 1, pos: 1 }, b: { grupoIdx: 2, pos: 2 } },
      { orden: 2, a: { grupoIdx: 2, pos: 1 }, b: { grupoIdx: 0, pos: 2 } },
    ])

    const r = aplicarSerpienteSegundos(base)
    for (const m of r.matches) {
      expect(m.a!.grupoIdx).not.toBe(m.b!.grupoIdx)
    }
  })

  it('si la permutación no cierra, devuelve el layout base entero y no uno a medias', () => {
    // Dos cruces cuyo único 2.º disponible al final es el del propio grupo del
    // 1.º: la serpiente no tiene salida. Antes hacía `continue` y dejaba el `b`
    // original, que para entonces ya se lo había llevado el otro cruce — el
    // mismo jugador en dos llaves y otro en ninguna.
    const base = layout([
      { orden: 0, a: { grupoIdx: 0, pos: 1 }, b: { grupoIdx: 1, pos: 2 } },
      { orden: 1, a: { grupoIdx: 1, pos: 1 }, b: { grupoIdx: 0, pos: 2 } },
    ])

    const r = aplicarSerpienteSegundos(base)
    const segundos = r.matches.map(m => m.b!.grupoIdx)

    // Sea cual sea la salida, la propiedad que no se negocia es que los cupos
    // sigan siendo una permutación: ni repetidos ni faltantes.
    expect(new Set(segundos).size).toBe(segundos.length)
    expect([...segundos].sort()).toEqual([0, 1])
  })
})

// ── M-04: el W.O. acreditaba 3 juegos fijos, sin mirar el formato ──────────
describe('clasificarGrupoIttf con W.O. sin sets', () => {
  const partidos = [
    { inscritoA: 'A', inscritoB: 'B', ganador: 'A', sets: [], esWalkover: true },
  ]

  it('en bo5 acredita 3 juegos y 33 puntos', () => {
    const [ganador] = clasificarGrupoIttf(['A', 'B'], partidos, 3)
    expect(ganador.juegosGanados).toBe(3)
    expect(ganador.puntosGanados).toBe(33)
  })

  it('en bo3 acredita 2 juegos y 22 puntos, no 3 y 33', () => {
    const [ganador, perdedor] = clasificarGrupoIttf(['A', 'B'], partidos, 2)
    expect(ganador.juegosGanados).toBe(2)
    expect(ganador.puntosGanados).toBe(22)
    expect(perdedor.juegosPerdidos).toBe(2)
    expect(perdedor.puntosPerdidos).toBe(22)
  })

  it('en bo7 acredita 4 juegos y 44 puntos', () => {
    const [ganador] = clasificarGrupoIttf(['A', 'B'], partidos, 4)
    expect(ganador.juegosGanados).toBe(4)
    expect(ganador.puntosGanados).toBe(44)
  })

  it('los puntos de clasificación no cambian con el formato: 2 y 0', () => {
    // Lo que depende del formato es el marcador sintético, no el puntaje ITTF.
    for (const games of [2, 3, 4]) {
      const [ganador, perdedor] = clasificarGrupoIttf(['A', 'B'], partidos, games)
      expect(ganador.pts).toBe(2)
      expect(perdedor.pts).toBe(0)   // W.O.: el perdedor no suma el punto de derrota
    }
  })
})

// ── M-12: ids que se interpolan dentro de un filtro `.or()` ────────────────
describe('esUuid', () => {
  it('acepta un uuid real', () => {
    expect(esUuid('11111111-1111-4111-8111-111111111111')).toBe(true)
  })

  it('rechaza lo que ensancharía un filtro de PostgREST', () => {
    // El ataque concreto: la coma separa condiciones en `.or()`, así que esto
    // convertía "los partidos de este jugador" en "todos los partidos".
    expect(esUuid('11111111-1111-4111-8111-111111111111,jugador_a_id.not.is.null')).toBe(false)
    expect(esUuid('j1')).toBe(false)
    expect(esUuid('')).toBe(false)
    expect(esUuid(null)).toBe(false)
    expect(esUuid(undefined)).toBe(false)
    expect(esUuid(123)).toBe(false)
  })

  it('uuidOrFail corta en vez de devolver algo inválido', () => {
    expect(() => uuidOrFail('x', 'jugador')).toThrow(/jugador/)
    expect(uuidOrFail('11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111')
  })
})
