import { describe, expect, it } from 'vitest'
import type { DiaCalendario } from './historialAsistencia'
import {
  lunesDeLaSemana, viernesDeLaSemana, sumarDias, sumarSemanas, diaDeLaSemana,
  conteoDelRango, resumenPorDia, resumenPorSemana, resumenPorGrupo,
  diferencia, ordenarPorRiesgo, ordenarPorMerito,
  type CalendarioDeJugador,
} from './panoramaAsistencia'

function dia(fecha: string, estado: DiaCalendario['estado'], bloques: string[] = ['Grupo A']): DiaCalendario {
  return { fecha, dia: diaDeLaSemana(fecha), estado, bloques, bloqueIds: [], extra: false }
}

function jugador(id: string, nombre: string, dias: DiaCalendario[]): CalendarioDeJugador {
  return { jugador: { id, nombre }, dias }
}

describe('la semana arranca el lunes', () => {
  it('lleva cualquier día a su lunes', () => {
    // 2026-08-05 es miércoles; su lunes es el 3.
    expect(lunesDeLaSemana('2026-08-05')).toBe('2026-08-03')
    expect(lunesDeLaSemana('2026-08-03')).toBe('2026-08-03')
    expect(lunesDeLaSemana('2026-08-07')).toBe('2026-08-03')
  })

  it('el domingo pertenece a la semana que ya venía, no a la que empieza', () => {
    // 2026-08-09 es domingo. Su lunes es el 3, no el 10: si cayera en el 10,
    // lo del domingo se contaría en una semana que todavía no arrancó.
    expect(lunesDeLaSemana('2026-08-09')).toBe('2026-08-03')
  })

  it('el viernes de la semana cierra la jornada laboral', () => {
    expect(viernesDeLaSemana('2026-08-05')).toBe('2026-08-07')
    expect(viernesDeLaSemana('2026-08-09')).toBe('2026-08-07')
  })

  it('cruza el borde de mes sin perderse', () => {
    // 2026-08-01 es sábado; su lunes es el 27 de julio.
    expect(lunesDeLaSemana('2026-08-01')).toBe('2026-07-27')
    expect(sumarDias('2026-07-31', 1)).toBe('2026-08-01')
    expect(sumarSemanas('2026-07-27', 1)).toBe('2026-08-03')
  })
})

describe('conteos', () => {
  const cals = [
    jugador('1', 'Ana', [dia('2026-08-03', 'presente'), dia('2026-08-05', 'ausente')]),
    jugador('2', 'Beto', [dia('2026-08-03', 'presente'), dia('2026-08-05', 'presente')]),
  ]

  it('el porcentaje sale sobre los días resueltos', () => {
    const c = conteoDelRango(cals, '2026-08-03', '2026-08-07')
    expect(c.presentes).toBe(3)
    expect(c.ausentes).toBe(1)
    expect(c.porcentaje).toBe(75)
  })

  it('los pendientes no cuentan como falta', () => {
    const conPendiente = [...cals, jugador('3', 'Cami', [dia('2026-08-04', 'pendiente')])]
    const c = conteoDelRango(conPendiente, '2026-08-03', '2026-08-07')
    expect(c.pendientes).toBe(1)
    // Sigue siendo 3 de 4: la lista sin pasar no es una ausencia.
    expect(c.porcentaje).toBe(75)
  })

  it('las clases extraordinarias quedan fuera del porcentaje', () => {
    const conExtra = [...cals, jugador('4', 'Dani', [dia('2026-08-04', 'extraordinaria')])]
    const c = conteoDelRango(conExtra, '2026-08-03', '2026-08-07')
    expect(c.presentes).toBe(3)
    expect(c.porcentaje).toBe(75)
  })

  it('sin días resueltos el porcentaje es null, no cero', () => {
    // Cero diría "vinieron 0 de los que tenían que venir", que es una falta
    // masiva. null dice "todavía no hay nada que medir".
    const c = conteoDelRango([jugador('1', 'Ana', [dia('2026-08-03', 'pendiente')])], '2026-08-03', '2026-08-07')
    expect(c.porcentaje).toBeNull()
  })

  it('respeta el rango pedido', () => {
    const c = conteoDelRango(cals, '2026-08-03', '2026-08-03')
    expect(c.presentes).toBe(2)
    expect(c.ausentes).toBe(0)
  })
})

describe('resumen por día', () => {
  const cals = [
    jugador('1', 'Ana', [dia('2026-08-03', 'presente'), dia('2026-08-05', 'ausente')]),
    jugador('2', 'Beto', [dia('2026-08-03', 'ausente'), dia('2026-08-05', 'ausente')]),
  ]

  it('devuelve todos los días del rango, incluso los sin clases', () => {
    const dias = resumenPorDia(cals, '2026-08-03', '2026-08-07')
    // Los cinco días de la semana laboral, aunque martes/jueves/viernes estén
    // vacíos: la tira necesita dibujarlos o el lunes se corre de lugar.
    expect(dias).toHaveLength(5)
    expect(dias.map(d => d.fecha)).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
    ])
  })

  it('un día sin clases queda con programados 0 y porcentaje null', () => {
    const martes = resumenPorDia(cals, '2026-08-03', '2026-08-07').find(d => d.fecha === '2026-08-04')!
    expect(martes.programados).toBe(0)
    expect(martes.porcentaje).toBeNull()
  })

  it('cada día trae su propio porcentaje', () => {
    const dias = resumenPorDia(cals, '2026-08-03', '2026-08-07')
    const lunes = dias.find(d => d.fecha === '2026-08-03')!
    const miercoles = dias.find(d => d.fecha === '2026-08-05')!
    expect(lunes.porcentaje).toBe(50)   // Ana vino, Beto no
    expect(miercoles.porcentaje).toBe(0) // faltaron los dos
    expect(miercoles.programados).toBe(2)
  })

  it('etiqueta el día de la semana', () => {
    const dias = resumenPorDia(cals, '2026-08-03', '2026-08-07')
    expect(dias.map(d => d.dia)).toEqual(['lun', 'mar', 'mie', 'jue', 'vie'])
  })
})

describe('resumen por semana', () => {
  const cals = [
    jugador('1', 'Ana', [
      dia('2026-07-27', 'presente'), dia('2026-07-29', 'presente'), // semana del 27
      dia('2026-08-03', 'ausente'),  dia('2026-08-05', 'ausente'),  // semana del 3
    ]),
  ]

  it('agrupa por el lunes de cada semana', () => {
    const semanas = resumenPorSemana(cals, '2026-07-27', '2026-08-07')
    expect(semanas.map(s => s.inicio)).toEqual(['2026-07-27', '2026-08-03'])
    expect(semanas[0].porcentaje).toBe(100)
    expect(semanas[1].porcentaje).toBe(0)
  })

  it('una semana sin actividad aparece igual, como hueco', () => {
    // Sin sembrarla, la tendencia mostraría dos semanas pegadas y daría a
    // entender que fueron consecutivas.
    const conHueco = [jugador('1', 'Ana', [dia('2026-07-27', 'presente'), dia('2026-08-10', 'presente')])]
    const semanas = resumenPorSemana(conHueco, '2026-07-27', '2026-08-14')
    expect(semanas.map(s => s.inicio)).toEqual(['2026-07-27', '2026-08-03', '2026-08-10'])
    expect(semanas[1].programados).toBe(0)
    expect(semanas[1].porcentaje).toBeNull()
  })
})

describe('resumen por grupo', () => {
  it('cuenta cada jornada en el grupo que le tocaba ESE día', () => {
    // Ana cambió de grupo a mitad de camino. Lo vivido en el grupo viejo tiene
    // que quedar en el grupo viejo.
    const cals = [jugador('1', 'Ana', [
      dia('2026-08-03', 'presente', ['Menores']),
      dia('2026-08-05', 'ausente',  ['Todo Público']),
    ])]
    const grupos = resumenPorGrupo(cals, '2026-08-03', '2026-08-07')
    expect(grupos.find(g => g.nombre === 'Menores')!.porcentaje).toBe(100)
    expect(grupos.find(g => g.nombre === 'Todo Público')!.porcentaje).toBe(0)
  })

  it('un día en dos grupos cuenta en los dos', () => {
    const cals = [jugador('1', 'Ana', [dia('2026-08-03', 'presente', ['A', 'B'])])]
    const grupos = resumenPorGrupo(cals, '2026-08-03', '2026-08-07')
    expect(grupos).toHaveLength(2)
  })

  it('cuenta jugadores distintos, no jornadas', () => {
    const cals = [
      jugador('1', 'Ana', [dia('2026-08-03', 'presente'), dia('2026-08-05', 'presente')]),
      jugador('2', 'Beto', [dia('2026-08-03', 'presente')]),
    ]
    expect(resumenPorGrupo(cals, '2026-08-03', '2026-08-07')[0].jugadores).toBe(2)
  })
})

describe('comparación entre períodos', () => {
  it('da la diferencia en puntos', () => {
    expect(diferencia({ presentes: 8, ausentes: 2, pendientes: 0, porcentaje: 80 },
                      { presentes: 6, ausentes: 4, pendientes: 0, porcentaje: 60 })).toBe(20)
  })

  it('sin período anterior devuelve null, no cero', () => {
    // Cero diría "se mantuvo igual". Con la primera semana del club eso sería
    // inventar una estabilidad que nadie midió.
    expect(diferencia({ presentes: 8, ausentes: 2, pendientes: 0, porcentaje: 80 },
                      { presentes: 0, ausentes: 0, pendientes: 0, porcentaje: null })).toBeNull()
  })
})

describe('orden de los rankings', () => {
  const filas = [
    { jugador: { id: '1', nombre: 'Ana' },  presentes: 0, ausentes: 1,  porcentaje: 0 },
    { jugador: { id: '2', nombre: 'Beto' }, presentes: 0, ausentes: 20, porcentaje: 0 },
    { jugador: { id: '3', nombre: 'Cami' }, presentes: 5, ausentes: 5,  porcentaje: 50 },
  ]

  it('a igual porcentaje, primero el que más faltó', () => {
    // Nadie del club queda fuera del ranking, pero arriba tiene que quedar el
    // que de verdad conviene mirar: 20 faltas pesan más que 1.
    const orden = ordenarPorRiesgo(filas)
    expect(orden.map(f => f.jugador.nombre)).toEqual(['Beto', 'Ana', 'Cami'])
  })

  it('nadie desaparece del ranking', () => {
    expect(ordenarPorRiesgo(filas)).toHaveLength(3)
    expect(ordenarPorMerito(filas)).toHaveLength(3)
  })

  it('en el mérito, a igual porcentaje vale más el sostenido', () => {
    const empatados = [
      { jugador: { id: '1', nombre: 'Ana' },  presentes: 1,  ausentes: 0, porcentaje: 100 },
      { jugador: { id: '2', nombre: 'Beto' }, presentes: 20, ausentes: 0, porcentaje: 100 },
    ]
    expect(ordenarPorMerito(empatados)[0].jugador.nombre).toBe('Beto')
  })

  it('los que no tienen días resueltos van al final', () => {
    const conNull = [
      { jugador: { id: '9', nombre: 'Nuevo' }, presentes: 0, ausentes: 0, porcentaje: null },
      ...filas,
    ]
    expect(ordenarPorRiesgo(conNull).at(-1)!.jugador.nombre).toBe('Nuevo')
  })
})
