import { describe, expect, it } from 'vitest'
import {
  asignarArbitrosJornada,
  bloquesNecesarios,
  distribuirEnBloques,
  elegirPartidosDeJornada,
  horaDeBloque,
  normalizarNombre,
  parsearProgramacionJornada,
  programarJornadaDivision,
  sumarDias,
  type PartidoPendiente,
} from './ligaJornadas'

// Todos contra todos de n jugadores, como los deja el fixture de la liga.
function todosContraTodos(n: number): { jugadores: string[]; pendientes: PartidoPendiente[] } {
  const jugadores = Array.from({ length: n }, (_, i) => `j${i + 1}`)
  const pendientes: PartidoPendiente[] = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    pendientes.push({ id: `${jugadores[i]}-${jugadores[j]}`, jugadorAId: jugadores[i], jugadorBId: jugadores[j] })
  }
  return { jugadores, pendientes }
}

const partidosDe = (partidos: { jugadorAId: string; jugadorBId: string }[], j: string) =>
  partidos.filter(p => p.jugadorAId === j || p.jugadorBId === j).length

describe('elegirPartidosDeJornada', () => {
  it('con 10 jugadores y 3 por cabeza saca 15 partidos, todos con exactamente 3 (la Honor de la Jornada 1)', () => {
    const { jugadores, pendientes } = todosContraTodos(10)
    const elegidos = elegirPartidosDeJornada(pendientes, jugadores, 3)
    expect(elegidos).toHaveLength(15)
    for (const j of jugadores) expect(partidosDe(elegidos, j)).toBe(3)
  })

  it('con 14 saca 21 (la Segunda), con 12 saca 18 (la Primera)', () => {
    for (const [n, esperado] of [[14, 21], [12, 18]] as const) {
      const { jugadores, pendientes } = todosContraTodos(n)
      const elegidos = elegirPartidosDeJornada(pendientes, jugadores, 3)
      expect(elegidos).toHaveLength(esperado)
      for (const j of jugadores) expect(partidosDe(elegidos, j)).toBe(3)
    }
  })

  it('con número impar (15, la Tercera) nadie pasa de 3 y saca lo más posible', () => {
    const { jugadores, pendientes } = todosContraTodos(15)
    const elegidos = elegirPartidosDeJornada(pendientes, jugadores, 3)
    // 15 × 3 / 2 = 22,5: caben 22 como máximo.
    expect(elegidos.length).toBeGreaterThanOrEqual(21)
    expect(elegidos.length).toBeLessThanOrEqual(22)
    for (const j of jugadores) expect(partidosDe(elegidos, j)).toBeLessThanOrEqual(3)
  })

  it('en la última jornada, con pocos pendientes, toma lo que queda sin inventar', () => {
    const { jugadores, pendientes } = todosContraTodos(4)
    // Ya se jugaron todos menos dos partidos.
    const quedan = pendientes.slice(0, 2)
    const elegidos = elegirPartidosDeJornada(quedan, jugadores, 3)
    expect(elegidos.map(p => p.id).sort()).toEqual(quedan.map(p => p.id).sort())
  })

  it('es determinista: la misma entrada da la misma salida', () => {
    const { jugadores, pendientes } = todosContraTodos(10)
    const a = elegirPartidosDeJornada(pendientes, jugadores, 3).map(p => p.id)
    const b = elegirPartidosDeJornada(pendientes, jugadores, 3).map(p => p.id)
    expect(a).toEqual(b)
  })
})

function verificarBloques(partidos: ReturnType<typeof distribuirEnBloques>['partidos'], k: number, huecoMax: number) {
  const porBloque = new Map<number, typeof partidos>()
  for (const p of partidos) porBloque.set(p.bloque, [...(porBloque.get(p.bloque) ?? []), p])
  for (const [, ps] of porBloque) {
    expect(ps.length).toBeLessThanOrEqual(k)
    const gente = ps.flatMap(p => [p.jugadorAId, p.jugadorBId])
    expect(new Set(gente).size).toBe(gente.length) // nadie dos veces en el mismo bloque
    expect(new Set(ps.map(p => p.mesa)).size).toBe(ps.length) // una mesa, un partido
  }
  const bloquesDe = new Map<string, number[]>()
  for (const p of partidos) for (const j of [p.jugadorAId, p.jugadorBId]) bloquesDe.set(j, [...(bloquesDe.get(j) ?? []), p.bloque])
  for (const [, bs] of bloquesDe) {
    bs.sort((a, b) => a - b)
    for (let i = 1; i < bs.length; i++) expect(bs[i] - bs[i - 1] - 1).toBeLessThanOrEqual(huecoMax)
  }
}

describe('distribuirEnBloques', () => {
  it('15 partidos en 3 mesas ocupan exactamente 5 bloques, sin choques y con hueco máximo 1', () => {
    const { jugadores, pendientes } = todosContraTodos(10)
    const elegidos = elegirPartidosDeJornada(pendientes, jugadores, 3)
    const { partidos, huecoRespetado } = distribuirEnBloques(elegidos, [1, 2, 3])
    expect(partidos).toHaveLength(15)
    expect(huecoRespetado).toBe(true)
    expect(Math.max(...partidos.map(p => p.bloque))).toBe(4)
    verificarBloques(partidos, 3, 1)
  })

  it('21 partidos en 3 mesas: 7 bloques (la Segunda termina a las 18:00)', () => {
    const { jugadores, pendientes } = todosContraTodos(14)
    const elegidos = elegirPartidosDeJornada(pendientes, jugadores, 3)
    const { partidos } = distribuirEnBloques(elegidos, [1, 2, 3])
    expect(partidos).toHaveLength(21)
    expect(Math.max(...partidos.map(p => p.bloque))).toBe(6)
    // Con 14 en 3 mesas no siempre existe reparto con hueco 1 (la programación
    // real de Spinhouse tampoco lo logra: hay quien juega 15:00, 16:00 y 17:30).
    // El motor relaja a 2 y lo avisa; nunca más que eso.
    verificarBloques(partidos, 3, 2)
    expect(horaDeBloque(6, '15:00')).toBe('18:00')
  })

  it('con dos mesas por división (tres divisiones en 6 mesas) también reparte', () => {
    const { jugadores, pendientes } = todosContraTodos(10)
    const elegidos = elegirPartidosDeJornada(pendientes, jugadores, 3)
    const { partidos } = distribuirEnBloques(elegidos, [4, 5])
    expect(partidos).toHaveLength(15)
    expect(Math.max(...partidos.map(p => p.bloque))).toBe(bloquesNecesarios(15, 2) - 1)
    verificarBloques(partidos, 2, 2) // con 2 mesas puede que el hueco 1 no alcance; nunca más de 2
  })
})

describe('asignarArbitrosJornada', () => {
  it('cada partido tiene árbitro de la división que no juega ni arbitra otro en ese bloque', () => {
    const { jugadores, pendientes } = todosContraTodos(10)
    const { partidos } = programarJornadaDivision({ pendientes, jugadorIds: jugadores, porJugador: 3, mesas: [1, 2, 3] })
    const porBloque = new Map<number, typeof partidos>()
    for (const p of partidos) porBloque.set(p.bloque, [...(porBloque.get(p.bloque) ?? []), p])
    for (const [, ps] of porBloque) {
      const jugando = new Set(ps.flatMap(p => [p.jugadorAId, p.jugadorBId]))
      const arbitros = ps.map(p => p.arbitroId)
      for (const a of arbitros) {
        expect(a).toBeTruthy()
        expect(jugadores).toContain(a)
        expect(jugando.has(a!)).toBe(false)
      }
      expect(new Set(arbitros).size).toBe(arbitros.length)
    }
  })

  it('reparte el arbitraje: nadie arbitra más del doble que el promedio', () => {
    const { jugadores, pendientes } = todosContraTodos(14)
    const { partidos } = programarJornadaDivision({ pendientes, jugadorIds: jugadores, porJugador: 3, mesas: [1, 2, 3] })
    const veces = new Map<string, number>()
    for (const p of partidos) veces.set(p.arbitroId!, (veces.get(p.arbitroId!) ?? 0) + 1)
    const promedio = partidos.length / jugadores.length
    for (const v of veces.values()) expect(v).toBeLessThanOrEqual(Math.ceil(promedio * 2))
  })

  it('si no alcanza la gente, deja el partido sin árbitro en vez de repetir a alguien', () => {
    // 6 jugadores, 3 mesas: en un bloque lleno juegan los 6 y no queda nadie.
    const { jugadores, pendientes } = todosContraTodos(6)
    const elegidos = elegirPartidosDeJornada(pendientes, jugadores, 3)
    const { partidos } = distribuirEnBloques(elegidos, [1, 2, 3])
    const con = asignarArbitrosJornada(partidos, jugadores)
    const bloqueLleno = [...new Set(con.map(p => p.bloque))].find(b => con.filter(p => p.bloque === b).length === 3)
    if (bloqueLleno !== undefined) {
      expect(con.filter(p => p.bloque === bloqueLleno).every(p => p.arbitroId === null)).toBe(true)
    }
  })
})

// El texto tal cual sale de copiar el PDF "Jornada 1 Liga SpinHouse" (rival y
// árbitro pegados sin separador: es el caso difícil).
const TEXTO_JORNADA_1 = `LIGA INDIVIDUAL SPINHOUSE 2026
Programación oficial — Jornada 1
Sábado 12 de septiembre · desde las 15:00 hrs
División de Honor — mesas 1 a 3
Hora Mesa Partido Árbitro
15:00 1 Javier Cabrera vs Santiago Rojas María Ignacia Valenzuela
15:00 2 Gustavo Cerda vs Óscar Vásquez Agustín Acuña
15:00 3 Axel Tobar vs José Luis Velazquez Marcos Morales
15:30 1 María Ignacia Valenzuela vs Domingo Campos Gustavo Cerda
15:30 2 Marcos Morales vs Agustín Acuña Axel Tobar
15:30 3 Óscar Vásquez vs Javier Cabrera José Luis Velazquez
16:00 1 José Luis Velazquez vs Santiago Rojas Javier Cabrera
16:00 2 Domingo Campos vs Gustavo Cerda Óscar Vásquez
16:00 3 Axel Tobar vs Marcos Morales María Ignacia Valenzuela
16:30 1 María Ignacia Valenzuela vs Agustín Acuña Santiago Rojas
16:30 2 Javier Cabrera vs José Luis Velazquez Gustavo Cerda
16:30 3 Óscar Vásquez vs Domingo Campos Axel Tobar
17:00 1 Marcos Morales vs Santiago Rojas Domingo Campos
17:00 2 Agustín Acuña vs Gustavo Cerda Javier Cabrera
17:00 3 María Ignacia Valenzuela vs Axel Tobar José Luis Velazquez
Primera División — mesas 4 a 6
Hora Mesa Partido Árbitro
15:00 4 Luciano Pardo vs Andrés Pérez Maximiliano Fernández
15:00 5 Benjamín Guerrero vs Camilo Lira Javier Gallegos
15:00 6 Carlos Yelamo vs Maxi Rodríguez Seba Jaque
15:30 4 Maximiliano Fernández vs Juan Penna Carlos Yelamo
15:30 5 Javier Gallegos vs Joseline Yevenes Andrés Pérez
15:30 6 Seba Jaque vs Fernanda Quiroz Benjamín Guerrero
16:00 4 Andrés Pérez vs Camilo Lira Fernanda Quiroz
16:00 5 Maxi Rodríguez vs Luciano Pardo Joseline Yevenes
16:00 6 Juan Penna vs Benjamín Guerrero Maximiliano Fernández
16:30 4 Joseline Yevenes vs Carlos Yelamo Juan Penna
16:30 5 Fernanda Quiroz vs Maximiliano Fernández Maxi Rodríguez
16:30 6 Seba Jaque vs Javier Gallegos Camilo Lira
17:00 4 Andrés Pérez vs Maxi Rodríguez Benjamín Guerrero
17:00 5 Camilo Lira vs Juan Penna Carlos Yelamo
17:00 6 Luciano Pardo vs Joseline Yevenes Javier Gallegos
17:30 4 Benjamín Guerrero vs Fernanda Quiroz Luciano Pardo
17:30 5 Carlos Yelamo vs Seba Jaque Andrés Pérez
17:30 6 Maximiliano Fernández vs Javier Gallegos Joseline Yevenes
Presentarse 15 minutos antes del primer compromiso (partido o arbitraje) · Sugerencias de horario: lunes y martes al WhatsApp +56 9 7492 7997 · Espera máxima
15 min → W.O. 3-0 · Reglamento ITTF — SPINHOUSE · José Ananías 128, Macul · www.spinhouse.cl · @spinhouseacademy
LIGA INDIVIDUAL SPINHOUSE 2026
Programación oficial — Jornada 1
Domingo 13 de septiembre · desde las 15:00 hrs
Segunda División — mesas 1 a 3
Hora Mesa Partido Árbitro
15:00 1 Miguel Maureira vs Katherine Flores Loreto Becerra
15:00 2 Bruno Irarrazabal vs Mauricio Alquinta Danae Martínez
15:00 3 Marco Maldonado vs Erick Miller David Araya
15:30 1 David Araya vs Martina Llancalahuen Mauricio Alquinta
15:30 2 Matías Toledo vs Luis Flores Marco Maldonado
15:30 3 Diana López vs Samuel Cerda Katherine Flores
16:00 1 Loreto Becerra vs Danae Martínez Matías Toledo
16:00 2 Katherine Flores vs Bruno Irarrazabal Diana López
16:00 3 Miguel Maureira vs Erick Miller Samuel Cerda
16:30 1 Mauricio Alquinta vs Martina Llancalahuen Bruno Irarrazabal
16:30 2 Luis Flores vs Marco Maldonado Miguel Maureira
16:30 3 Samuel Cerda vs David Araya Erick Miller
17:00 1 Danae Martínez vs Matías Toledo Luis Flores
17:00 2 Loreto Becerra vs Diana López Martina Llancalahuen
17:00 3 Erick Miller vs Katherine Flores Marco Maldonado
17:30 1 Martina Llancalahuen vs Bruno Irarrazabal Katherine Flores
17:30 2 Luis Flores vs Miguel Maureira David Araya
17:30 3 Samuel Cerda vs Mauricio Alquinta Erick Miller
18:00 1 Marco Maldonado vs Danae Martínez Mauricio Alquinta
18:00 2 David Araya vs Loreto Becerra Samuel Cerda
18:00 3 Matías Toledo vs Diana López Luis Flores
Tercera División — mesas 4 a 6
Hora Mesa Partido Árbitro
15:00 4 Benjamín Poblete vs Luciana Martínez Gonzalo Moreira
15:00 5 Nicolás Silva vs Clemente Lavín Grace Martínez
15:00 6 Mateo Arriagada vs Eric Ramírez Benito Vos
15:30 4 Julieta Tumayan vs Geremy Álvarez Nicolás Silva
15:30 5 Esteban Fernández vs Franklyn Hernández Mateo Arriagada
15:30 6 María Fernanda Álvarez vs Cristóbal Yañez Clemente Lavín
16:00 4 Grace Martínez vs Benito Vos Esteban Fernández
16:00 5 Luciana Martínez vs Gonzalo Moreira María Fernanda Álvarez
16:00 6 Eric Ramírez vs Benjamín Poblete Julieta Tumayan
16:30 4 Geremy Álvarez vs Nicolás Silva Benjamín Poblete
16:30 5 Franklyn Hernández vs Mateo Arriagada Eric Ramírez
16:30 6 Cristóbal Yañez vs Julieta Tumayan Luciana Martínez
17:00 4 Benito Vos vs Esteban Fernández Geremy Álvarez
17:00 5 Grace Martínez vs María Fernanda Álvarez Cristóbal Yañez
17:00 6 Gonzalo Moreira vs Clemente Lavín Franklyn Hernández
17:30 4 Luciana Martínez vs Eric Ramírez Gonzalo Moreira
17:30 5 Benjamín Poblete vs Franklyn Hernández Mateo Arriagada
17:30 6 Nicolás Silva vs Cristóbal Yañez Julieta Tumayan
18:00 4 Mateo Arriagada vs Benito Vos Geremy Álvarez
18:00 5 Julieta Tumayan vs Grace Martínez Clemente Lavín
18:00 6 Esteban Fernández vs María Fernanda Álvarez Benjamín Poblete`

describe('parsearProgramacionJornada con la Jornada 1 real de Spinhouse', () => {
  const prog = parsearProgramacionJornada(TEXTO_JORNADA_1, 2026)

  it('lee la jornada, los dos días con su fecha y hora, y las cuatro divisiones con sus mesas', () => {
    expect(prog.jornada).toBe(1)
    expect(prog.dias).toHaveLength(2)
    expect(prog.dias[0].fecha).toBe('2026-09-12')
    expect(prog.dias[0].horaInicio).toBe('15:00')
    expect(prog.dias[1].fecha).toBe('2026-09-13')
    expect(prog.dias[0].divisiones.map(d => d.nombre)).toEqual(['División de Honor', 'Primera División'])
    expect(prog.dias[1].divisiones.map(d => d.nombre)).toEqual(['Segunda División', 'Tercera División'])
    expect(prog.dias[0].divisiones[0].mesas).toEqual([1, 2, 3])
    expect(prog.dias[0].divisiones[1].mesas).toEqual([4, 5, 6])
  })

  it('separa rival y árbitro en TODAS las filas aunque vengan pegados', () => {
    const filas = prog.dias.flatMap(d => d.divisiones.flatMap(x => x.filas))
    expect(filas).toHaveLength(15 + 18 + 21 + 21)
    expect(filas.filter(f => f.ambiguo)).toEqual([])
    // Casos difíciles: el rival nunca aparece como jugador A (Santiago Rojas),
    // nombres de tres palabras (María Ignacia Valenzuela, José Luis Velazquez).
    const honor = prog.dias[0].divisiones[0].filas
    expect(honor[0]).toMatchObject({ hora: '15:00', mesa: 1, jugadorA: 'Javier Cabrera', jugadorB: 'Santiago Rojas', arbitro: 'María Ignacia Valenzuela' })
    expect(honor[2]).toMatchObject({ jugadorA: 'Axel Tobar', jugadorB: 'José Luis Velazquez', arbitro: 'Marcos Morales' })
    const tercera = prog.dias[1].divisiones[1].filas
    expect(tercera[5]).toMatchObject({ jugadorA: 'María Fernanda Álvarez', jugadorB: 'Cristóbal Yañez', arbitro: 'Clemente Lavín' })
  })

  it('cada división trae su gente completa: 10, 12, 14 y 15 jugadores', () => {
    const gente = (d: { filas: { jugadorA: string; jugadorB: string; arbitro: string | null }[] }) =>
      new Set(d.filas.flatMap(f => [f.jugadorA, f.jugadorB, f.arbitro].filter(Boolean) as string[]))
    expect(gente(prog.dias[0].divisiones[0]).size).toBe(10)
    expect(gente(prog.dias[0].divisiones[1]).size).toBe(12)
    expect(gente(prog.dias[1].divisiones[0]).size).toBe(14)
    expect(gente(prog.dias[1].divisiones[1]).size).toBe(15)
    expect(prog.nombres).toHaveLength(51)
  })

  it('en la programación real, cada uno juega 3 (o 2 en la división impar) y el árbitro nunca juega en su bloque', () => {
    for (const dia of prog.dias) for (const div of dia.divisiones) {
      const porJugador = new Map<string, number>()
      for (const f of div.filas) for (const j of [f.jugadorA, f.jugadorB]) porJugador.set(j, (porJugador.get(j) ?? 0) + 1)
      for (const v of porJugador.values()) expect(v).toBeLessThanOrEqual(3)
      const porHora = new Map<string, typeof div.filas>()
      for (const f of div.filas) porHora.set(f.hora, [...(porHora.get(f.hora) ?? []), f])
      for (const [, fs] of porHora) {
        const jugando = new Set(fs.flatMap(f => [f.jugadorA, f.jugadorB]))
        for (const f of fs) expect(jugando.has(f.arbitro!)).toBe(false)
      }
    }
  })
})

describe('utilidades', () => {
  it('normalizarNombre iguala tildes, mayúsculas y espacios', () => {
    expect(normalizarNombre('  Óscar   VÁSQUEZ ')).toBe('oscar vasquez')
    expect(normalizarNombre('Oscar Vasquez')).toBe(normalizarNombre('Óscar Vásquez'))
  })
  it('sumarDias no se descuadra con el cambio de mes', () => {
    expect(sumarDias('2026-09-12', 1)).toBe('2026-09-13')
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01')
  })
})
