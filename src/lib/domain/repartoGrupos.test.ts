import { describe, expect, it } from 'vitest'
import { calcularNumGrupos, calcularTamanoBracket } from './torneos'

/** Cómo queda repartido un torneo de N jugadores con la regla vigente. */
function reparto(N: number) {
  const grupos = calcularNumGrupos(N)
  const menor = Math.floor(N / grupos)
  const mayor = N % grupos ? menor + 1 : menor
  const clasificados = grupos * 2
  const cuadro = calcularTamanoBracket(clasificados)
  return { grupos, menor, mayor, clasificados, cuadro, byes: cuadro - clasificados }
}

describe('reparto de grupos', () => {
  it('nunca arma grupos de 2 (salvo con menos de 6 jugadores)', () => {
    const conGruposDeDos: number[] = []
    for (let N = 6; N <= 100; N++) {
      if (reparto(N).menor < 3) conGruposDeDos.push(N)
    }
    expect(conGruposDeDos).toEqual([])
  })

  it('nunca arma grupos de mas de 4', () => {
    const grandes: number[] = []
    for (let N = 6; N <= 100; N++) {
      if (reparto(N).mayor > 4) grandes.push(N)
    }
    expect(grandes).toEqual([])
  })

  // Los casos que antes armaban un cuadro con medio bracket vacio.
  it('los tamanos que antes eran catastroficos quedan en cuadro exacto', () => {
    for (const N of [50, 56, 64, 100]) {
      const r = reparto(N)
      expect(r.byes, `N=${N} deberia quedar sin BYEs`).toBe(0)
    }
  })

  it('100 jugadores caben en el tope de 32 grupos que ya existia', () => {
    for (let N = 6; N <= 100; N++) {
      expect(reparto(N).grupos, `N=${N}`).toBeLessThanOrEqual(32)
    }
  })

  // Deuda conocida, anotada a proposito para que no se olvide: elegir bien los
  // grupos NO alcanza para dejar el cuadro sin BYEs. Los tamanos que caen justo
  // debajo de una potencia de 2 siguen sobrando gente, y eso lo arregla la
  // ronda de avance (CONFIG.FASES_ORDEN ya la tiene reservada y nunca se genera):
  // los sobrantes juegan por entrar al cuadro en vez de recibir un BYE.
  //
  // Si algun dia este test falla porque la lista se achico, es una buena
  // noticia: hay que actualizar el numero.
  it('deja anotados los tamanos que todavia dependen de la ronda de avance', () => {
    const conByes: number[] = []
    for (let N = 6; N <= 100; N++) {
      if (reparto(N).byes > 0) conByes.push(N)
    }
    expect(conByes.length).toBe(56)
    // El peor caso baja de 48% a 38% del cuadro, pero sigue siendo mucho.
    const peor = Math.max(...conByes.map(N => {
      const r = reparto(N)
      return Math.round((r.byes / r.cuadro) * 100)
    }))
    expect(peor).toBe(38)
  })

  it('conserva el reparto de los tamanos chicos', () => {
    expect(calcularNumGrupos(3)).toBe(2)
    expect(calcularNumGrupos(4)).toBe(2)
    expect(calcularNumGrupos(6)).toBe(2)
    expect(calcularNumGrupos(9)).toBe(3)
    expect(calcularNumGrupos(12)).toBe(4)
  })

  it('el sub19 de Buin (24 jugadores) sigue armando 8 grupos de 3', () => {
    const r = reparto(24)
    expect(r.grupos).toBe(8)
    expect(r.menor).toBe(3)
    expect(r.mayor).toBe(3)
    expect(r.byes).toBe(0)
  })
})
