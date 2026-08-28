import { describe, expect, it } from 'vitest'
import { conservaDerecho, diasEntre, minutosHastaLaClase, ocurrencias, sumarDias } from './cuposDia'

// 2026-09-01 es martes. La semana: mar 1, mié 2, jue 3, vie 4, sáb 5, dom 6.
const MAR = '2026-09-01'

describe('sumarDias', () => {
  it('cruza el fin de mes', () => {
    expect(sumarDias('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('resta', () => {
    expect(sumarDias(MAR, -1)).toBe('2026-08-31')
  })

  // El cambio de hora en Chile es el primer domingo de septiembre, a
  // medianoche. Anclado al mediodía UTC, no corre el día.
  it('no se corre con el cambio de hora de septiembre', () => {
    expect(sumarDias('2026-09-05', 1)).toBe('2026-09-06')
    expect(sumarDias('2026-09-06', 1)).toBe('2026-09-07')
  })
})

describe('diasEntre', () => {
  it('cuenta hacia adelante y hacia atrás', () => {
    expect(diasEntre(MAR, '2026-09-04')).toBe(3)
    expect(diasEntre('2026-09-04', MAR)).toBe(-3)
    expect(diasEntre(MAR, MAR)).toBe(0)
  })
})

describe('minutosHastaLaClase', () => {
  it('cuenta las horas del mismo día', () => {
    expect(minutosHastaLaClase({ fecha: MAR, horaInicio: '19:00', hoy: MAR, ahora: '17:00' })).toBe(120)
  })

  it('da negativo si la clase ya empezó', () => {
    expect(minutosHastaLaClase({ fecha: MAR, horaInicio: '17:00', hoy: MAR, ahora: '19:00' })).toBe(-120)
  })

  it('suma los días de por medio', () => {
    expect(minutosHastaLaClase({ fecha: '2026-09-03', horaInicio: '19:00', hoy: MAR, ahora: '19:00' })).toBe(2 * 1440)
  })
})

describe('conservaDerecho', () => {
  // La clase es el jueves 3 a las 19:00. El corte cae el miércoles 2 a las 19:00.
  const clase = { fecha: '2026-09-03', horaInicio: '19:00:00' }

  it('avisando justo 24 horas antes, sí', () => {
    expect(conservaDerecho({ ...clase, hoy: '2026-09-02', ahora: '19:00' })).toBe(true)
  })

  it('un minuto más tarde, ya no', () => {
    expect(conservaDerecho({ ...clase, hoy: '2026-09-02', ahora: '19:01' })).toBe(false)
  })

  it('avisando con días de anticipación, sí', () => {
    expect(conservaDerecho({ ...clase, hoy: MAR, ahora: '08:00' })).toBe(true)
  })

  it('la clase ya empezada no da derecho', () => {
    expect(conservaDerecho({ ...clase, hoy: '2026-09-03', ahora: '19:30' })).toBe(false)
  })
})

describe('ocurrencias', () => {
  const jueves = { id: 'j', dia_semana: 'jue', hora_inicio: '19:00:00' }
  const martes = { id: 'm', dia_semana: 'mar', hora_inicio: '17:00:00' }

  it('convierte el bloque semanal en fechas concretas', () => {
    const r = ocurrencias({ bloques: [jueves], hoy: MAR, dias: 14 })
    expect(r.map(o => o.fecha)).toEqual(['2026-09-03', '2026-09-10'])
  })

  it('incluye hoy si hoy es su día', () => {
    const r = ocurrencias({ bloques: [martes], hoy: MAR, dias: 6 })
    expect(r.map(o => o.fecha)).toEqual([MAR])
  })

  it('nunca cae en fin de semana', () => {
    const finde = { id: 'f', dia_semana: 'sab', hora_inicio: '10:00:00' }
    expect(ocurrencias({ bloques: [finde], hoy: MAR, dias: 14 })).toEqual([])
  })

  it('ordena por fecha y después por hora', () => {
    const tarde = { id: 't', dia_semana: 'mar', hora_inicio: '20:00:00' }
    const r = ocurrencias({ bloques: [tarde, martes, jueves], hoy: MAR, dias: 3 })
    expect(r.map(o => `${o.fecha} ${o.bloque.id}`)).toEqual([
      `${MAR} m`, `${MAR} t`, '2026-09-03 j',
    ])
  })

  it('saltea las fechas suspendidas de ese bloque', () => {
    const r = ocurrencias({
      bloques: [jueves], hoy: MAR, dias: 14,
      excluir: new Set(['j|2026-09-03']),
    })
    expect(r.map(o => o.fecha)).toEqual(['2026-09-10'])
  })
})
