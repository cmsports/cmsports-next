import { describe, expect, it } from 'vitest'
import {
  calendarioJugador, diasHabiles, indicadores,
  type DatosHistorial,
} from './historialAsistencia'

const JUG = 'jugador-1'

// Menores Avanzado, Buin, martes y jueves. Vigente desde agosto.
const bloqueMar = { id: 'b-mar', nombre: 'Menores Avanzado', sede: 'buin', dia_semana: 'mar', vigente_desde: '2026-08-01', vigente_hasta: null }
const bloqueJue = { id: 'b-jue', nombre: 'Menores Avanzado', sede: 'buin', dia_semana: 'jue', vigente_desde: '2026-08-01', vigente_hasta: null }
const bloqueLun = { id: 'b-lun', nombre: 'Todo Público 1',   sede: 'buin', dia_semana: 'lun', vigente_desde: '2026-08-01', vigente_hasta: null }

function datos(p: Partial<DatosHistorial> = {}): DatosHistorial {
  return {
    bloques: [bloqueMar, bloqueJue, bloqueLun],
    inscripciones: [],
    asistencias: [],
    excepciones: [],
    ...p,
  }
}

describe('diasHabiles', () => {
  it('deja fuera sábados y domingos', () => {
    const d = diasHabiles('2026-08-01', '2026-08-09')   // sáb 1 a dom 9
    expect(d.map(x => x.fecha)).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
    ])
  })

  it('devuelve vacío si el rango está al revés', () => {
    expect(diasHabiles('2026-08-10', '2026-08-01')).toEqual([])
  })
})

describe('calendarioJugador', () => {
  const inscritoMarJue = [
    { bloque_id: 'b-mar', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: null },
    { bloque_id: 'b-jue', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: null },
  ]

  it('solo muestra los días que le tocaban', () => {
    const cal = calendarioJugador(JUG, '2026-08-01', '2026-08-14', datos({ inscripciones: inscritoMarJue }))
    // Martes 4 y 11, jueves 6 y 13.
    expect(cal.map(d => d.fecha)).toEqual(['2026-08-04', '2026-08-06', '2026-08-11', '2026-08-13'])
    expect(cal.every(d => d.estado === 'pendiente')).toBe(true)
  })

  it('marca presente y ausente según lo registrado', () => {
    const cal = calendarioJugador(JUG, '2026-08-01', '2026-08-14', datos({
      inscripciones: inscritoMarJue,
      asistencias: [
        { jugador_id: JUG, fecha: '2026-08-04', estado: 'presente' },
        { jugador_id: JUG, fecha: '2026-08-06', estado: 'ausente' },
      ],
    }))
    expect(cal.map(d => d.estado)).toEqual(['presente', 'ausente', 'pendiente', 'pendiente'])
  })

  it('no mezcla la asistencia de otro jugador', () => {
    const cal = calendarioJugador(JUG, '2026-08-01', '2026-08-07', datos({
      inscripciones: inscritoMarJue,
      asistencias: [{ jugador_id: 'otro', fecha: '2026-08-04', estado: 'presente' }],
    }))
    expect(cal[0].estado).toBe('pendiente')
  })

  it('un día con excepción deja de contar como entrenamiento', () => {
    const cal = calendarioJugador(JUG, '2026-08-01', '2026-08-14', datos({
      inscripciones: inscritoMarJue,
      excepciones: [{ bloque_id: 'b-mar', fecha: '2026-08-11' }],
    }))
    expect(cal.map(d => d.fecha)).toEqual(['2026-08-04', '2026-08-06', '2026-08-13'])
  })

  // El caso que motivó la dimensión temporal.
  it('refleja el cambio de grupo desde la fecha en que entró en vigencia', () => {
    const cal = calendarioJugador(JUG, '2026-08-01', '2026-08-21', datos({
      inscripciones: [
        // Martes y jueves hasta el 12, lunes desde el 13.
        { bloque_id: 'b-mar', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: '2026-08-12' },
        { bloque_id: 'b-jue', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: '2026-08-12' },
        { bloque_id: 'b-lun', jugador_id: JUG, vigente_desde: '2026-08-13', vigente_hasta: null },
      ],
    }))
    expect(cal.map(d => `${d.dia} ${d.fecha.slice(-2)}`)).toEqual([
      'mar 04', 'jue 06', 'mar 11',   // programación vieja
      'lun 17',                        // programación nueva
    ])
  })

  it('el historial anterior al cambio no se toca', () => {
    const cal = calendarioJugador(JUG, '2026-08-01', '2026-08-21', datos({
      inscripciones: [
        { bloque_id: 'b-mar', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: '2026-08-12' },
        { bloque_id: 'b-lun', jugador_id: JUG, vigente_desde: '2026-08-13', vigente_hasta: null },
      ],
      asistencias: [{ jugador_id: JUG, fecha: '2026-08-04', estado: 'presente' }],
    }))
    expect(cal.find(d => d.fecha === '2026-08-04')?.estado).toBe('presente')
  })

  it('un bloque dado de baja deja de programar días', () => {
    const cal = calendarioJugador(JUG, '2026-08-01', '2026-08-21', datos({
      bloques: [{ ...bloqueMar, vigente_hasta: '2026-08-10' }],
      inscripciones: [{ bloque_id: 'b-mar', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: null }],
    }))
    expect(cal.map(d => d.fecha)).toEqual(['2026-08-04'])
  })

  it('quien entrena dos veces el mismo día tiene un solo estado', () => {
    const mismoDia = { ...bloqueMar, id: 'b-mar-2', nombre: 'Formativo Intermedio' }
    const cal = calendarioJugador(JUG, '2026-08-01', '2026-08-07', datos({
      bloques: [bloqueMar, mismoDia],
      inscripciones: [
        { bloque_id: 'b-mar',   jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: null },
        { bloque_id: 'b-mar-2', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: null },
      ],
      asistencias: [{ jugador_id: JUG, fecha: '2026-08-04', estado: 'presente' }],
    }))
    expect(cal).toHaveLength(1)
    expect(cal[0].bloques).toEqual(['Menores Avanzado', 'Formativo Intermedio'])
  })
})

describe('indicadores', () => {
  const cal = (estados: ('presente' | 'ausente' | 'pendiente')[], dia = 'lun') =>
    estados.map((estado, i) => ({
      fecha: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
      dia, estado, bloques: ['Todo Público 1'],
    }))

  it('el porcentaje ignora los pendientes', () => {
    // Tres resueltos: dos presentes de tres. El pendiente no es una falta.
    const i = indicadores(cal(['presente', 'ausente', 'presente', 'pendiente']))
    expect(i.programados).toBe(4)
    expect(i.presentes).toBe(2)
    expect(i.ausentes).toBe(1)
    expect(i.pendientes).toBe(1)
    expect(i.porcentaje).toBe(67)
  })

  it('sin días resueltos el porcentaje es null, no cero', () => {
    const i = indicadores(cal(['pendiente', 'pendiente']))
    expect(i.porcentaje).toBeNull()
  })

  it('cuenta la racha actual de asistencias', () => {
    const i = indicadores(cal(['ausente', 'presente', 'presente', 'presente']))
    expect(i.rachaPresentes).toBe(3)
    expect(i.rachaAusentes).toBe(0)
  })

  it('cuenta la racha actual de ausencias', () => {
    const i = indicadores(cal(['presente', 'ausente', 'ausente']))
    expect(i.rachaAusentes).toBe(2)
    expect(i.rachaPresentes).toBe(0)
  })

  it('guarda la mayor racha histórica aunque después se haya cortado', () => {
    const i = indicadores(cal(['presente', 'presente', 'presente', 'ausente', 'presente']))
    expect(i.mejorRacha).toBe(3)
    expect(i.rachaPresentes).toBe(1)
  })

  it('un pendiente en el medio no corta la racha', () => {
    const i = indicadores(cal(['presente', 'pendiente', 'presente']))
    expect(i.rachaPresentes).toBe(2)
  })

  it('recuerda la última asistencia y la última ausencia', () => {
    const dias = cal(['presente', 'ausente', 'presente'])
    const i = indicadores(dias)
    expect(i.ultimaAsistencia).toBe(dias[2].fecha)
    expect(i.ultimaAusencia).toBe(dias[1].fecha)
  })

  it('encuentra el día de la semana con mejor asistencia', () => {
    const i = indicadores([
      ...cal(['presente', 'presente'], 'lun'),
      ...cal(['ausente', 'presente'], 'vie'),
    ])
    expect(i.mejorDia).toEqual({ dia: 'lun', porcentaje: 100 })
  })

  it('agrupa por mes', () => {
    const i = indicadores([
      { fecha: '2026-08-03', dia: 'lun', estado: 'presente', bloques: [] },
      { fecha: '2026-08-10', dia: 'lun', estado: 'ausente',  bloques: [] },
      { fecha: '2026-09-07', dia: 'lun', estado: 'presente', bloques: [] },
    ])
    expect(i.porMes).toEqual([
      { mes: '2026-08', presentes: 1, ausentes: 1, pendientes: 0, porcentaje: 50 },
      { mes: '2026-09', presentes: 1, ausentes: 0, pendientes: 0, porcentaje: 100 },
    ])
  })

  it('no se cae con un calendario vacío', () => {
    const i = indicadores([])
    expect(i.programados).toBe(0)
    expect(i.porcentaje).toBeNull()
    expect(i.mejorDia).toBeNull()
    expect(i.ultimaAsistencia).toBeNull()
  })
})
