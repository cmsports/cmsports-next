import { describe, expect, it } from 'vitest'
import {
  bloquesSinInscripcion, calendarioJugador, diasHabiles, indexar, indicadores,
  type DatosHistorial, type EstadoDia,
} from './historialAsistencia'

const JUG = 'jugador-1'

// Menores Avanzado, Buin, martes y jueves. Vigente desde agosto.
const bloqueMar = { id: 'b-mar', nombre: 'Menores Avanzado', sede: 'buin', dia_semana: 'mar', vigente_desde: '2026-08-01', vigente_hasta: null }
const bloqueJue = { id: 'b-jue', nombre: 'Menores Avanzado', sede: 'buin', dia_semana: 'jue', vigente_desde: '2026-08-01', vigente_hasta: null }
const bloqueLun = { id: 'b-lun', nombre: 'Todo Público 1',   sede: 'buin', dia_semana: 'lun', vigente_desde: '2026-08-01', vigente_hasta: null }

// `hoy` fijo en el 1 de agosto: todo lo que estas pruebas arman cae ese día o
// después, así que un día sin registro sigue siendo 'pendiente' y los casos de
// siempre miden lo que medían. La regla de "día vencido sin registro = ausente"
// se prueba aparte, moviendo el `hoy` hacia adelante.
const HOY = '2026-08-01'

function datos(p: Partial<DatosHistorial> = {}): DatosHistorial {
  return {
    bloques: [bloqueMar, bloqueJue, bloqueLun],
    inscripciones: [],
    asistencias: [],
    excepciones: [],
    hoy: HOY,
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

describe('indexar', () => {
  // El panorama del club llama al calendario una vez por jugador sobre los
  // mismos datos. El índice compartido tiene que dar exactamente lo mismo.
  it('el índice compartido no cambia el resultado', () => {
    const d = datos({
      inscripciones: [
        { bloque_id: 'b-mar', jugador_id: 'ana',  vigente_desde: '2026-08-01', vigente_hasta: null },
        { bloque_id: 'b-jue', jugador_id: 'ana',  vigente_desde: '2026-08-01', vigente_hasta: null },
        { bloque_id: 'b-lun', jugador_id: 'luis', vigente_desde: '2026-08-01', vigente_hasta: null },
      ],
      asistencias: [
        { jugador_id: 'ana',  fecha: '2026-08-04', estado: 'presente' },
        { jugador_id: 'luis', fecha: '2026-08-03', estado: 'ausente' },
      ],
    })
    const i = indexar(d)
    for (const quien of ['ana', 'luis', 'nadie']) {
      expect(calendarioJugador(quien, '2026-08-01', '2026-08-31', d, i))
        .toEqual(calendarioJugador(quien, '2026-08-01', '2026-08-31', d))
    }
  })

  // La regla que pidió el club: el olvido del profe tiene que verse.
  describe('día vencido sin registro', () => {
    const inscritoMar = [{ bloque_id: 'b-mar', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: null }]

    it('cuenta como ausencia si la fecha ya pasó', () => {
      const cal = calendarioJugador(JUG, '2026-08-04', '2026-08-04', datos({
        inscripciones: inscritoMar, hoy: '2026-08-05',
      }))
      expect(cal[0].estado).toBe('ausente')
    })

    it('sigue pendiente el mismo día, que todavía no termina', () => {
      const cal = calendarioJugador(JUG, '2026-08-04', '2026-08-04', datos({
        inscripciones: inscritoMar, hoy: '2026-08-04',
      }))
      expect(cal[0].estado).toBe('pendiente')
    })

    it('sigue pendiente si la fecha todavía no llegó', () => {
      const cal = calendarioJugador(JUG, '2026-08-11', '2026-08-11', datos({
        inscripciones: inscritoMar, hoy: '2026-08-04',
      }))
      expect(cal[0].estado).toBe('pendiente')
    })

    it('lo registrado manda: un presente viejo no se convierte en falta', () => {
      const cal = calendarioJugador(JUG, '2026-08-04', '2026-08-04', datos({
        inscripciones: inscritoMar, hoy: '2026-08-20',
        asistencias: [{ jugador_id: JUG, fecha: '2026-08-04', estado: 'presente' }],
      }))
      expect(cal[0].estado).toBe('presente')
    })

    it('un día suspendido no se vuelve falta aunque haya vencido', () => {
      const cal = calendarioJugador(JUG, '2026-08-04', '2026-08-04', datos({
        inscripciones: inscritoMar, hoy: '2026-08-20',
        excepciones: [{ bloque_id: 'b-mar', fecha: '2026-08-04' }],
      }))
      expect(cal).toEqual([])
    })

    it('el grupo sin lista pasada deja de marcar 100%', () => {
      // Cuatro martes vencidos, ninguno registrado. Antes: sin resueltos, el
      // porcentaje era null y la pantalla lo leía como "nada que reprochar".
      const cal = calendarioJugador(JUG, '2026-08-01', '2026-08-28', datos({
        inscripciones: inscritoMar, hoy: '2026-08-29',
      }))
      const ind = indicadores(cal)
      expect(ind.ausentes).toBe(4)
      expect(ind.pendientes).toBe(0)
      expect(ind.porcentaje).toBe(0)
    })
  })

  it('no le pasa a un jugador la asistencia de otro', () => {
    const d = datos({
      inscripciones: [
        { bloque_id: 'b-mar', jugador_id: 'ana',  vigente_desde: '2026-08-01', vigente_hasta: null },
        { bloque_id: 'b-mar', jugador_id: 'luis', vigente_desde: '2026-08-01', vigente_hasta: null },
      ],
      asistencias: [{ jugador_id: 'ana', fecha: '2026-08-04', estado: 'presente' }],
    })
    const i = indexar(d)
    expect(calendarioJugador('ana',  '2026-08-04', '2026-08-04', d, i)[0].estado).toBe('presente')
    expect(calendarioJugador('luis', '2026-08-04', '2026-08-04', d, i)[0].estado).toBe('pendiente')
  })
})

describe('indicadores', () => {
  const cal = (estados: EstadoDia[], dia = 'lun') =>
    estados.map((estado, i) => ({
      fecha: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
      dia, estado, bloques: ['Todo Público 1'], extra: false,
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
      { fecha: '2026-08-03', dia: 'lun', estado: 'presente', bloques: [], extra: false },
      { fecha: '2026-08-10', dia: 'lun', estado: 'ausente',  bloques: [], extra: false },
      { fecha: '2026-09-07', dia: 'lun', estado: 'presente', bloques: [], extra: false },
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

// Vino a un grupo que no es el suyo. Antes esto se guardaba como asistencia
// normal: le descontaba una sesión del plan y encima el día no aparecía en su
// calendario, porque no estaba programado. Ahora es un hecho aparte.
describe('clases extraordinarias', () => {
  const inscritoMarJue = [
    { bloque_id: 'b-mar', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: null },
    { bloque_id: 'b-jue', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: null },
  ]

  it('un día que no le tocaba aparece, si vino igual', () => {
    // Entrena martes y jueves. El lunes 3 vino de más.
    const cal = calendarioJugador(JUG, '2026-08-03', '2026-08-07', datos({
      inscripciones: inscritoMarJue,
      extraordinarias: [{ jugador_id: JUG, fecha: '2026-08-03' }],
    }))

    const lunes = cal.find(d => d.fecha === '2026-08-03')
    expect(lunes).toMatchObject({ estado: 'extraordinaria', extra: true, bloques: [] })
  })

  it('sin la extra, ese día sigue sin aparecer', () => {
    const cal = calendarioJugador(JUG, '2026-08-03', '2026-08-07', datos({
      inscripciones: inscritoMarJue,
    }))
    expect(cal.map(d => d.fecha)).not.toContain('2026-08-03')
  })

  it('si además le tocaba entrenar, manda su estado normal', () => {
    // El martes 4 le tocaba y asistió; encima vino a otro grupo ese mismo día.
    const cal = calendarioJugador(JUG, '2026-08-04', '2026-08-04', datos({
      inscripciones: inscritoMarJue,
      asistencias: [{ jugador_id: JUG, fecha: '2026-08-04', estado: 'presente' }],
      extraordinarias: [{ jugador_id: JUG, fecha: '2026-08-04' }],
    }))

    expect(cal[0]).toMatchObject({ estado: 'presente', extra: true })
  })

  it('no le suma asistencia ni le sube el porcentaje', () => {
    const i = indicadores(indicadoresDe([
      { fecha: '2026-08-04', estado: 'presente' },
      { fecha: '2026-08-06', estado: 'ausente' },
      { fecha: '2026-08-03', estado: 'extraordinaria' },
    ]))

    // Dos días programados, uno asistido: 50%. La extra no toca ese número.
    expect(i.programados).toBe(2)
    expect(i.porcentaje).toBe(50)
    expect(i.extraordinarias).toBe(1)
  })

  it('tampoco se la resta', () => {
    const soloExtras = indicadores(indicadoresDe([
      { fecha: '2026-08-03', estado: 'extraordinaria' },
      { fecha: '2026-08-05', estado: 'extraordinaria' },
    ]))
    // Nada programado: no hay porcentaje que calcular, y no es cero.
    expect(soloExtras.programados).toBe(0)
    expect(soloExtras.porcentaje).toBeNull()
    expect(soloExtras.extraordinarias).toBe(2)
  })

  it('no corta una racha de asistencias', () => {
    const i = indicadores(indicadoresDe([
      { fecha: '2026-08-04', estado: 'presente' },
      { fecha: '2026-08-05', estado: 'extraordinaria' },
      { fecha: '2026-08-06', estado: 'presente' },
    ]))
    expect(i.rachaPresentes).toBe(2)
  })

  it('la extra de otro jugador no se le cuenta a este', () => {
    const cal = calendarioJugador(JUG, '2026-08-03', '2026-08-03', datos({
      inscripciones: inscritoMarJue,
      extraordinarias: [{ jugador_id: 'otro', fecha: '2026-08-03' }],
    }))
    expect(cal).toEqual([])
  })
})

describe('bloquesSinInscripcion', () => {
  const inscritoMar = [
    { bloque_id: 'b-mar', jugador_id: JUG, vigente_desde: '2026-08-01', vigente_hasta: null },
  ]

  it('deja fuera el grupo en el que sí está', () => {
    // Martes: existe b-mar, y está inscrito. No hay otro martes.
    const libres = bloquesSinInscripcion(datos({ inscripciones: inscritoMar }), JUG, '2026-08-04', 'mar')
    expect(libres).toEqual([])
  })

  it('ofrece los grupos de ese día en los que no está', () => {
    // Lunes: existe b-lun y no está inscrito.
    const libres = bloquesSinInscripcion(datos({ inscripciones: inscritoMar }), JUG, '2026-08-03', 'lun')
    expect(libres.map(b => b.id)).toEqual(['b-lun'])
  })

  it('no ofrece grupos de otro día de la semana', () => {
    const libres = bloquesSinInscripcion(datos({ inscripciones: [] }), JUG, '2026-08-03', 'lun')
    expect(libres.map(b => b.id)).not.toContain('b-mar')
  })

  it('no ofrece un grupo que todavía no existía', () => {
    const futuro = { id: 'b-nuevo', nombre: 'Nuevo', sede: 'buin', dia_semana: 'lun', vigente_desde: '2026-10-01', vigente_hasta: null }
    const libres = bloquesSinInscripcion(
      datos({ bloques: [bloqueLun, futuro], inscripciones: [] }), JUG, '2026-08-03', 'lun')
    expect(libres.map(b => b.id)).toEqual(['b-lun'])
  })

  // Si en marzo estaba en ese grupo y en agosto ya no, en marzo su asistencia
  // era la normal y en agosto venir ahí es una clase extra.
  it('mira la inscripción tal como estaba esa fecha', () => {
    const cerrada = [
      { bloque_id: 'b-lun', jugador_id: JUG, vigente_desde: '2026-03-01', vigente_hasta: '2026-06-30' },
    ]
    const d = datos({ inscripciones: cerrada })
    expect(bloquesSinInscripcion(d, JUG, '2026-03-02', 'lun').map(b => b.id)).toEqual([])
    expect(bloquesSinInscripcion(d, JUG, '2026-08-03', 'lun').map(b => b.id)).toEqual(['b-lun'])
  })
})

/** Días sueltos para probar indicadores, sin armar un calendario completo. */
function indicadoresDe(dias: { fecha: string; estado: EstadoDia }[]) {
  return dias.map(d => ({
    ...d, dia: 'lun', bloques: ['Todo Público 1'],
    extra: d.estado === 'extraordinaria',
  }))
}
