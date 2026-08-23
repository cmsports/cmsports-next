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
  it('el sobrante nunca engorda un grupo a 4; forma grupos de 2', () => {
    const conCuatro: number[] = []
    for (let N = 6; N < 97; N++) {
      if (reparto(N).mayor > 3) conCuatro.push(N)
    }
    // Desde 97 jugadores el tope de 32 grupos obliga a grupos de 4 igual.
    expect(conCuatro).toEqual([])
  })

  it('nunca arma un grupo de 1', () => {
    const conUno: number[] = []
    for (let N = 6; N <= 100; N++) {
      if (reparto(N).menor < 2) conUno.push(N)
    }
    expect(conUno).toEqual([])
  })

  // Ejemplos pedidos explícitamente: el sobrante se reparte en grupos de 2,
  // no engordando grupos existentes a 4.
  it('reparte el sobrante en grupos de 2, no en grupos de 4', () => {
    expect(reparto(8)).toMatchObject({ grupos: 3, menor: 2, mayor: 3 }) // 3,3,2
    expect(reparto(7)).toMatchObject({ grupos: 3, menor: 2, mayor: 3 }) // 3,2,2
    expect(reparto(4)).toMatchObject({ grupos: 2, menor: 2, mayor: 2 }) // 2,2
  })

  it('a partir de ~97 jugadores el tope de 32 grupos si deja grupos de 4', () => {
    expect(reparto(97)).toMatchObject({ grupos: 32, menor: 3, mayor: 4 })
    expect(reparto(100)).toMatchObject({ grupos: 32, menor: 3, mayor: 4 })
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
    expect(conByes.length).toBe(78)
    const peor = Math.max(...conByes.map(N => {
      const r = reparto(N)
      return Math.round((r.byes / r.cuadro) * 100)
    }))
    expect(peor).toBe(47)
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
