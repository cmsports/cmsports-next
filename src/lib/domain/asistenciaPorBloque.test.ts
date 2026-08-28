import { describe, expect, it } from 'vitest'
import { agruparPorBloque, pctDe, razon, type JugadorDeBloque } from './asistenciaPorBloque'
import type { DatosHistorial } from './historialAsistencia'

// Agosto de 2026: los lunes son 3, 10, 17, 24 y 31. Se corta el 24 para que el
// mes tenga cuatro lunes exactos y las cuentas se puedan verificar a mano.
const DESDE = '2026-08-03'
const HASTA = '2026-08-24'

const jugadores: JugadorDeBloque[] = [
  { id: 'j1', nombre: 'Ana' },
  { id: 'j2', nombre: 'Beto' },
]

function datos(over: Partial<DatosHistorial> = {}): DatosHistorial {
  return {
    bloques: [
      { id: 'b1', nombre: 'Lunes Iniciación', sede: 'buin', dia_semana: 'lun', hora_inicio: '18:00', vigente_desde: '2026-01-01', vigente_hasta: null },
      { id: 'b2', nombre: 'Martes Avanzado', sede: 'paine', dia_semana: 'mar', hora_inicio: '19:00', vigente_desde: '2026-01-01', vigente_hasta: null },
    ] as any,
    inscripciones: [
      { bloque_id: 'b1', jugador_id: 'j1', vigente_desde: '2026-01-01', vigente_hasta: null },
      { bloque_id: 'b2', jugador_id: 'j1', vigente_desde: '2026-01-01', vigente_hasta: null },
      { bloque_id: 'b1', jugador_id: 'j2', vigente_desde: '2026-01-01', vigente_hasta: null },
    ] as any,
    asistencias: [],
    excepciones: [],
    hoy: '2026-08-31',
    ...over,
  }
}

describe('el porcentaje es sobre lo resuelto, no sobre cero', () => {
  it('sin días resueltos da null y no 0%', () => {
    // 0% dice "no vino nadie". null dice "todavía no hay nada medido", que es
    // otra cosa y se pinta como raya.
    expect(pctDe({ presentes: 0, ausentes: 0, pendientes: 5 })).toBe(null)
    expect(pctDe({ presentes: 0, ausentes: 4, pendientes: 0 })).toBe(0)
  })

  it('la razón dice asistió de programado', () => {
    expect(razon({ presentes: 8, ausentes: 4, pendientes: 2 })).toBe('8 de 12')
  })
})

describe('reparto por bloque', () => {
  it('un jugador en dos bloques suma en los dos, no se le resta a ninguno', () => {
    const a = agruparPorBloque(datos(), jugadores, DESDE, HASTA)
    const b1 = a.periodo.find(r => r.bloque.id === 'b1')!
    const b2 = a.periodo.find(r => r.bloque.id === 'b2')!
    expect(b1.jugadores.map(f => f.jugador.nombre).sort()).toEqual(['Ana', 'Beto'])
    expect(b2.jugadores.map(f => f.jugador.nombre)).toEqual(['Ana'])
    // Ana tiene sus cuatro lunes (3, 10, 17, 24) en b1 y sus tres martes
    // (4, 11, 18) en b2, enteros. Cuatro y tres, no "cuatro semanas × dos":
    // el rango se corta el 24 y el martes 25 queda afuera.
    expect(b1.jugadores.find(f => f.jugador.nombre === 'Ana')!.conteo.presentes
      + b1.jugadores.find(f => f.jugador.nombre === 'Ana')!.conteo.ausentes).toBe(4)
    expect(b2.jugadores[0].conteo.presentes + b2.jugadores[0].conteo.ausentes).toBe(3)
  })

  it('cuenta las fechas reales del calendario, no semanas por días', () => {
    const a = agruparPorBloque(datos(), jugadores, DESDE, HASTA)
    const b1 = a.periodo.find(r => r.bloque.id === 'b1')!
    // Cuatro lunes × dos jugadores. Sin asistencia registrada y con el mes ya
    // vencido, los ocho cuentan como falta.
    expect(b1.total.ausentes).toBe(8)
    expect(pctDe(b1.total)).toBe(0)
  })

  it('las asistencias marcadas suben el porcentaje del bloque', () => {
    const a = agruparPorBloque(datos({
      asistencias: [
        { jugador_id: 'j1', fecha: '2026-08-03', estado: 'presente' },
        { jugador_id: 'j1', fecha: '2026-08-10', estado: 'presente' },
        { jugador_id: 'j2', fecha: '2026-08-03', estado: 'presente' },
      ],
    }), jugadores, DESDE, HASTA)
    const b1 = a.periodo.find(r => r.bloque.id === 'b1')!
    expect(b1.total.presentes).toBe(3)
    expect(b1.total.ausentes).toBe(5)
    expect(pctDe(b1.total)).toBe(38) // 3/8
  })

  it('ordena los jugadores de peor a mejor: lo que hay que mirar va arriba', () => {
    const a = agruparPorBloque(datos({
      asistencias: [
        { jugador_id: 'j1', fecha: '2026-08-03', estado: 'presente' },
        { jugador_id: 'j1', fecha: '2026-08-10', estado: 'presente' },
      ],
    }), jugadores, DESDE, HASTA)
    const b1 = a.periodo.find(r => r.bloque.id === 'b1')!
    expect(b1.jugadores.map(f => f.jugador.nombre)).toEqual(['Beto', 'Ana'])
  })

  it('ordena los bloques por día y hora, y las sedes con Buin primero', () => {
    const a = agruparPorBloque(datos(), jugadores, DESDE, HASTA)
    expect(a.periodo.map(r => r.bloque.id)).toEqual(['b1', 'b2'])
    expect(a.sedes).toEqual(['buin', 'paine'])
  })

  it('el total del club es la suma de los bloques', () => {
    const a = agruparPorBloque(datos(), jugadores, DESDE, HASTA)
    const suma = a.periodo.reduce((s, r) => s + r.total.ausentes, 0)
    expect(a.totalClub.ausentes).toBe(suma)
  })
})

describe('el corte por mes', () => {
  it('devuelve los meses del más reciente al más viejo', () => {
    const a = agruparPorBloque(datos({ hoy: '2026-09-30' }), jugadores, '2026-07-01', '2026-09-15')
    expect(a.meses).toEqual([...a.meses].sort().reverse())
    expect(a.meses).toContain('2026-08')
  })

  it('los meses suman lo mismo que el período completo', () => {
    // Si no cuadraran, la hoja de un mes y la del resumen dirían cosas
    // distintas y no habría manera de saber cuál miente.
    const a = agruparPorBloque(datos({ hoy: '2026-09-30' }), jugadores, '2026-07-01', '2026-09-15')
    const porMes = a.meses.reduce((s, m) =>
      s + (a.porMes.get(m) ?? []).reduce((t, r) => t + r.total.presentes + r.total.ausentes + r.total.pendientes, 0), 0)
    const delPeriodo = a.periodo.reduce((t, r) => t + r.total.presentes + r.total.ausentes + r.total.pendientes, 0)
    expect(porMes).toBe(delPeriodo)
  })
})
