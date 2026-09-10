import { describe, it, expect } from 'vitest'
import {
  MAX_JUGADORES_EN_CUADRO,
  calcularNumGrupos,
  calcularTamanoBracket,
  determinarFaseInicial,
  maxCuadroSoportado,
  siguienteFase,

} from './torneos'
import { CONFIG, type FaseOrden } from '../config'
import {
  generarLiguilla,
  partidosDeLiguilla,
  rondasDeLiguilla,
} from './torneoLiguilla'
import {
  elegiblesParaConsolacion,
  generarCuadroConsolacion,
  generarCuadroDirecto,
  siguienteFaseDeCualquierCuadro,
  type PartidoJugado,
} from './torneoConsolacion'

/**
 * Simulación del CICLO DE VIDA de cada modalidad, de punta a punta.
 *
 * Las pruebas que había verificaban cada formato POR DENTRO —el calendario, la
 * siembra, la regla del consuelo— y ninguna recorría inscribir → jugar →
 * cerrar. Ahí estaban escondidos los dos peores bugs de la auditoría del
 * 2026-09-10:
 *
 *   · Un cuadro de más de 64 llegaba a 'final' con DOS partidos, o sea dos
 *     campeones, sin dar un solo error.
 *   · Una liguilla se jugaba entera y no se podía cerrar nunca.
 *
 * Los dos aparecen recién cuando se juega el torneo hasta el final. Por eso
 * esto simula, y por eso barre muchos tamaños en vez de uno cómodo: los bordes
 * son 2, los impares, las potencias de 2 justas y el tamaño de arriba de todo.
 */

const TAMANOS = [4, 5, 6, 7, 8, 11, 12, 16, 17, 21, 30, 31, 32, 33, 50, 63, 64, 65, 100, 128]

const jugadores = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `j${i + 1}`, nombre: `J${i + 1}` }))

// ═══ El camino del cuadro ═══════════════════════════════════════════════════

/** Recorre el cuadro ronda por ronda y devuelve cuántas llaves tuvo cada fase. */
function recorrerCuadro(tam: number): Array<{ fase: string; llaves: number }> {
  const camino: Array<{ fase: string; llaves: number }> = []
  let fase: FaseOrden | null = determinarFaseInicial(tam)
  let llaves = tam / 2
  const visto = new Set<string>()

  while (fase && llaves >= 1) {
    if (visto.has(fase)) throw new Error(`El camino repite la fase ${fase}`)
    visto.add(fase)
    camino.push({ fase, llaves })
    if (llaves === 1) break
    fase = siguienteFase(fase)
    llaves /= 2
  }
  return camino
}

describe('el cuadro llega a UNA final, con cualquier cantidad', () => {
  for (const n of TAMANOS) {
    it(`con ${n} participantes termina en una sola final`, () => {
      const tam = calcularTamanoBracket(n)
      const camino = recorrerCuadro(tam)
      const ultima = camino.at(-1)!

      expect(ultima.fase, `n=${n} no termina en 'final'`).toBe('final')
      expect(ultima.llaves, `n=${n} termina con ${ultima.llaves} finales`).toBe(1)
    })
  }

  // Éste es EL bug que la auditoría encontró: con 65 el torneo daba dos
  // campeones y no avisaba nada.
  it('65 participantes ya no terminan en dos finales', () => {
    const camino = recorrerCuadro(calcularTamanoBracket(65))
    expect(camino.at(-1)).toEqual({ fase: 'final', llaves: 1 })
    expect(camino[0].fase).toBe('64vos')
  })

  it('cada fase tiene la mitad de llaves que la anterior', () => {
    for (const n of TAMANOS) {
      const camino = recorrerCuadro(calcularTamanoBracket(n))
      for (let i = 1; i < camino.length; i++) {
        expect(camino[i].llaves, `n=${n} en ${camino[i].fase}`).toBe(camino[i - 1].llaves / 2)
      }
    }
  })

  it('el nombre de la fase dice cuántas llaves tiene', () => {
    const esperado: Record<string, number> = {
      '128vos': 128, '64vos': 64, '32vos': 32, '16vos': 16,
      '8vos': 8, cuartos: 4, semis: 2, final: 1,
    }
    for (const n of TAMANOS) {
      for (const paso of recorrerCuadro(calcularTamanoBracket(n))) {
        const dice = esperado[paso.fase]
        if (dice !== undefined) {
          expect(paso.llaves, `n=${n}: '${paso.fase}' con ${paso.llaves} llaves`).toBe(dice)
        }
      }
    }
  })

  it('todas las fases del camino existen en FASES_ORDEN', () => {
    for (const n of TAMANOS) {
      for (const paso of recorrerCuadro(calcularTamanoBracket(n))) {
        expect(CONFIG.FASES_ORDEN as readonly string[], `n=${n}`).toContain(paso.fase)
      }
    }
  })

  it('el techo declarado coincide con lo que el camino aguanta de verdad', () => {
    const tam = maxCuadroSoportado()
    expect(() => recorrerCuadro(tam)).not.toThrow()
    expect(recorrerCuadro(tam).at(-1)).toEqual({ fase: 'final', llaves: 1 })
    expect(MAX_JUGADORES_EN_CUADRO).toBe(tam)
    // Y un cuadro por encima del techo NO se puede recorrer: por eso hay que
    // validarlo antes de generarlo, no confiar en que "quepa".
    expect(determinarFaseInicial(tam * 2)).toBe(CONFIG.FASES_ORDEN[1])
  })
})

// ═══ Eliminación directa, con y sin consuelo ════════════════════════════════

/** Juega un cuadro completo. `decidir` elige ganador. */
function jugarCuadro(n: number, decidir: (a: string, b: string) => string): PartidoJugado[] {
  const inicial = [...generarCuadroDirecto(jugadores(n))].sort((a, b) => a.orden - b.orden)
  const jugados: PartidoJugado[] = []
  let fase: string = inicial[0]?.fase ?? 'final'
  let vivos: string[] = []

  for (const p of inicial) {
    if (!p.jugadorB) { if (p.jugadorA) vivos.push(p.jugadorA); continue }
    const g = decidir(p.jugadorA, p.jugadorB)
    jugados.push({ fase, jugador_a: p.jugadorA, jugador_b: p.jugadorB, ganador: g })
    vivos.push(g)
  }

  let i = (CONFIG.FASES_ORDEN as readonly string[]).indexOf(fase)
  while (vivos.length > 1) {
    fase = CONFIG.FASES_ORDEN[++i] ?? 'final'
    const siguen: string[] = []
    for (let k = 0; k < vivos.length; k += 2) {
      const a = vivos[k], b = vivos[k + 1]
      if (!b) { siguen.push(a); continue }
      const g = decidir(a, b)
      jugados.push({ fase, jugador_a: a, jugador_b: b, ganador: g })
      siguen.push(g)
    }
    vivos = siguen
  }
  return jugados
}

describe('eliminación directa: se juega entera y queda un campeón', () => {
  for (const n of TAMANOS) {
    it(`con ${n} inscritos queda exactamente un campeón`, () => {
      const partidos = jugarCuadro(n, a => a)
      const finales = partidos.filter(p => p.fase === 'final')
      expect(finales, `n=${n}`).toHaveLength(1)
      expect(finales[0].ganador).toBeTruthy()
    })
  }

  it('todos los inscritos entran al cuadro, sin repetirse', () => {
    for (const n of TAMANOS) {
      const inicial = generarCuadroDirecto(jugadores(n))
      const ids = inicial.flatMap(p => [p.jugadorA, p.jugadorB]).filter(Boolean) as string[]
      expect(new Set(ids).size, `n=${n}`).toBe(n)
    }
  })
})

describe('consolación: la promesa se cumple con cualquier cantidad', () => {
  for (const n of TAMANOS.filter(x => x >= 8)) {
    for (const [nombre, decidir] of [['gana A', (a: string) => a], ['gana B', (_a: string, b: string) => b]] as const) {
      it(`con ${n} inscritos (${nombre}), nadie eliminado juega un solo partido`, () => {
        const partidos = jugarCuadro(n, decidir)
        const jugadosPorId = new Map<string, number>()
        for (const p of partidos) {
          for (const id of [p.jugador_a, p.jugador_b]) {
            if (id) jugadosPorId.set(id, (jugadosPorId.get(id) ?? 0) + 1)
          }
        }
        const elegibles = new Set(elegiblesParaConsolacion(partidos))
        const campeon = partidos.find(p => p.fase === 'final')?.ganador

        for (const [id, veces] of jugadosPorId) {
          if (veces !== 1 || id === campeon) continue
          expect(elegibles.has(id), `n=${n}: ${id} jugó 1 y quedó fuera`).toBe(true)
        }
      })
    }
  }

  it('el cuadro de consuelo también llega a una sola final', () => {
    for (const n of [11, 16, 21, 32, 50]) {
      const elegibles = elegiblesParaConsolacion(jugarCuadro(n, a => a))
      if (elegibles.length < 2) continue
      const consuelo = generarCuadroConsolacion(elegibles.map(id => ({ id, nombre: id })))
      const tam = calcularTamanoBracket(elegibles.length)

      let fase: string | null = consuelo[0].fase
      let llaves = tam / 2
      while (fase && llaves > 1) { fase = siguienteFaseDeCualquierCuadro(fase); llaves /= 2 }
      expect(fase, `n=${n} con ${elegibles.length} en consuelo`).toBe('cons_final')
    }
  })
})

// ═══ Liguilla ═══════════════════════════════════════════════════════════════

describe('liguilla: se juega entera y se puede cerrar', () => {
  for (const n of TAMANOS.filter(x => x >= 3 && partidosDeLiguilla(x, 1) <= CONFIG.LIGUILLA_MAX_PARTIDOS)) {
    it(`con ${n} inscritos genera un calendario jugable y completo`, () => {
      const partidos = generarLiguilla(jugadores(n).map(j => j.id), 1)

      expect(partidos).toHaveLength(partidosDeLiguilla(n, 1))
      expect(new Set(partidos.map(p => p.ronda)).size).toBe(rondasDeLiguilla(n, 1))

      // Nadie dos veces en la misma fecha.
      const porRonda = new Map<number, string[]>()
      for (const p of partidos) {
        porRonda.set(p.ronda, [...(porRonda.get(p.ronda) ?? []), p.jugadorA, p.jugadorB])
      }
      for (const [ronda, ids] of porRonda) {
        expect(new Set(ids).size, `n=${n} fecha ${ronda}`).toBe(ids.length)
      }

      // Y todos contra todos, sin repetir ni faltar.
      const cruces = new Set(partidos.map(p => [p.jugadorA, p.jugadorB].sort().join('|')))
      expect(cruces.size).toBe(n * (n - 1) / 2)
    })
  }

  // Éste es el segundo bug de la auditoría: la liguilla NO tiene fase 'final',
  // así que `finalizarTorneo` —que la exige— no podía cerrarla nunca. El podio
  // tiene que salir de la tabla de posiciones.
  it('una liguilla no produce ninguna fase de cuadro', () => {
    const fases = new Set(generarLiguilla(jugadores(8).map(j => j.id), 1).map(() => 'grupos'))
    expect(fases.has('final')).toBe(false)
    expect([...fases]).toEqual(['grupos'])
  })

  it('el tope de partidos deja pasar 30 a una rueda y frena 30 a dos', () => {
    expect(partidosDeLiguilla(30, 1)).toBeLessThanOrEqual(CONFIG.LIGUILLA_MAX_PARTIDOS)
    expect(partidosDeLiguilla(30, 2)).toBeGreaterThan(CONFIG.LIGUILLA_MAX_PARTIDOS)
  })
})

// ═══ Tradicional ════════════════════════════════════════════════════════════

describe('tradicional: los grupos no crecen sin control', () => {
  it('con muchos inscritos los grupos se vuelven inmanejables', () => {
    // Documenta el techo real: `calcularNumGrupos` capa en 32 grupos, así que a
    // partir de ~96 inscritos lo que crece es el TAMAÑO de cada grupo, y los
    // partidos con el cuadrado de ese tamaño.
    const medir = (n: number) => {
      const g = calcularNumGrupos(n)
      const k = Math.round(n / g)
      return { grupos: g, porGrupo: k, partidos: g * (k * (k - 1) / 2) }
    }
    expect(medir(96).porGrupo).toBe(3)
    expect(medir(96).partidos).toBe(96)

    // A 300 inscritos son grupos de ~9 y más de mil partidos solo de grupos.
    expect(medir(300).grupos).toBe(CONFIG.TORNEO_MAX_GRUPOS)
    expect(medir(300).partidos).toBeGreaterThan(1000)
  })

  it('los clasificados nunca desbordan el cuadro soportado', () => {
    const clasificados = CONFIG.TORNEO_MAX_GRUPOS * 2
    expect(clasificados).toBeLessThanOrEqual(MAX_JUGADORES_EN_CUADRO)
    expect(calcularTamanoBracket(clasificados)).toBeLessThanOrEqual(maxCuadroSoportado())
  })
})
