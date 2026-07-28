import { describe, expect, it } from 'vitest'
import {
  calcularReporteMes, diaDe, diasHabilesDelMes, horas, semanasDelMes,
  type AsignacionProfesor, type BloqueMes, type DiaSuspendido, type InscripcionMes,
} from './reportesMes'

// Julio 2026: el 1 cae miércoles. Martes: 7, 14, 21, 28.
const JULIO = { anio: 2026, mes: 7, hoy: '2026-07-31' }

function bloque(over: Partial<BloqueMes> = {}): BloqueMes {
  return {
    id: 'b1', nombre: 'Juvenil', sede: 'buin', dia_semana: 'mar',
    hora_inicio: '17:00', hora_fin: '19:00', cupo_maximo: 12,
    vigente_desde: '2026-01-01', vigente_hasta: null, ...over,
  }
}

function correr(over: {
  bloques?: BloqueMes[]
  asignaciones?: AsignacionProfesor[]
  inscripciones?: InscripcionMes[]
  suspensiones?: DiaSuspendido[]
} = {}) {
  return calcularReporteMes({
    ...JULIO,
    bloques: over.bloques ?? [bloque()],
    asignaciones: over.asignaciones ?? [],
    inscripciones: over.inscripciones ?? [],
    suspensiones: over.suspensiones ?? [],
  })
}

describe('diasHabilesDelMes', () => {
  it('deja fuera sábados y domingos', () => {
    const dias = diasHabilesDelMes(2026, 7)
    expect(dias).toHaveLength(23)
    expect(dias[0]).toBe('2026-07-01')
    expect(dias.at(-1)).toBe('2026-07-31')
    expect(dias).not.toContain('2026-07-04')
    expect(dias).not.toContain('2026-07-05')
  })

  it('no se pasa al mes siguiente en febrero', () => {
    expect(diasHabilesDelMes(2026, 2).at(-1)).toBe('2026-02-27')
  })

  it('diaDe coincide con los códigos del horario', () => {
    expect(diaDe('2026-07-07')).toBe('mar')
    expect(diaDe('2026-07-01')).toBe('mie')
  })
})

describe('clases de un grupo', () => {
  it('cuenta las veces que cayó el día, no las semanas', () => {
    const r = correr()
    expect(r.grupos[0].dictadas.map(d => d.fecha))
      .toEqual(['2026-07-07', '2026-07-14', '2026-07-21', '2026-07-28'])
    expect(r.grupos[0].minutos).toBe(4 * 120)
  })

  it('un día marcado sin clase no se dictó, y dice por qué', () => {
    const r = correr({ suspensiones: [{ bloque_id: 'b1', fecha: '2026-07-14', motivo: 'feriado' }] })
    expect(r.grupos[0].dictadas).toHaveLength(3)
    expect(r.grupos[0].suspendidas).toEqual([
      { fecha: '2026-07-14', motivo: 'marcado sin clase — feriado' },
    ])
    expect(r.clasesSuspendidas).toBe(1)
  })

  it('un grupo cerrado a mitad de mes deja de sumar, con el motivo', () => {
    const r = correr({ bloques: [bloque({ vigente_hasta: '2026-07-15' })] })
    expect(r.grupos[0].dictadas.map(d => d.fecha)).toEqual(['2026-07-07', '2026-07-14'])
    expect(r.grupos[0].fueraDeVigencia.map(o => o.fecha)).toEqual(['2026-07-21', '2026-07-28'])
    expect(r.grupos[0].fueraDeVigencia[0].motivo).toContain('cerró el 2026-07-15')
  })

  it('un grupo creado a mitad de mes no cuenta lo de antes', () => {
    const r = correr({ bloques: [bloque({ vigente_desde: '2026-07-20' })] })
    expect(r.grupos[0].dictadas.map(d => d.fecha)).toEqual(['2026-07-21', '2026-07-28'])
    expect(r.grupos[0].fueraDeVigencia[0].motivo).toContain('empezó el 2026-07-20')
  })

  it('los inscritos son los de hoy, no los del mes', () => {
    const r = correr({ inscripciones: [
      { bloque_id: 'b1', jugador_id: 'j1', vigente_desde: '2026-01-01', vigente_hasta: null },
      { bloque_id: 'b1', jugador_id: 'j2', vigente_desde: '2026-01-01', vigente_hasta: '2026-07-10' },
    ] })
    expect(r.grupos[0].inscritos).toBe(1)
  })
})

describe('horas por profesor', () => {
  const asig = (over: Partial<AsignacionProfesor> = {}): AsignacionProfesor => ({
    bloque_id: 'b1', profesor_id: 'p1', vigente_desde: '2026-01-01', vigente_hasta: null, ...over,
  })

  it('suma las clases que dictó', () => {
    const r = correr({ asignaciones: [asig()] })
    expect(r.profesores[0].minutos).toBe(4 * 120)
    expect(r.profesores[0].diasTrabajados).toHaveLength(4)
  })

  it('si entró a mitad de mes cobra desde que entró', () => {
    const r = correr({ asignaciones: [asig({ vigente_desde: '2026-07-15' })] })
    expect(r.profesores[0].minutos).toBe(2 * 120)
    expect(r.profesores[0].porGrupo[0].dictadas.map(d => d.fecha))
      .toEqual(['2026-07-21', '2026-07-28'])
  })

  it('si le sacaron el grupo, deja de sumarle desde ahí', () => {
    const r = correr({ asignaciones: [asig({ vigente_hasta: '2026-07-15' })] })
    expect(r.profesores[0].minutos).toBe(2 * 120)
  })

  it('el feriado le aparece explicado, no como horas que faltan', () => {
    const r = correr({
      asignaciones: [asig()],
      suspensiones: [{ bloque_id: 'b1', fecha: '2026-07-14', motivo: 'feriado' }],
    })
    expect(r.profesores[0].minutos).toBe(3 * 120)
    expect(r.profesores[0].porGrupo[0].omitidas).toEqual([
      { fecha: '2026-07-14', motivo: 'marcado sin clase — feriado' },
    ])
  })

  it('dos profesores en el mismo bloque suman cada uno sus horas', () => {
    const r = correr({ asignaciones: [asig(), asig({ profesor_id: 'p2' })] })
    expect(r.profesores).toHaveLength(2)
    expect(r.profesores.map(p => p.minutos)).toEqual([480, 480])
  })

  it('el mismo día en dos grupos cuenta un solo día trabajado', () => {
    const r = correr({
      bloques: [bloque(), bloque({ id: 'b2', nombre: 'Otro', hora_inicio: '19:00', hora_fin: '20:00' })],
      asignaciones: [asig(), asig({ bloque_id: 'b2' })],
    })
    expect(r.profesores[0].diasTrabajados).toHaveLength(4)
    expect(r.profesores[0].minutos).toBe(4 * 120 + 4 * 60)
  })

  it('el total del club coincide con la suma de los grupos', () => {
    const r = correr({
      bloques: [bloque(), bloque({ id: 'b2', dia_semana: 'jue', hora_inicio: '18:00', hora_fin: '20:00' })],
      asignaciones: [asig()],
    })
    expect(r.minutosTotales).toBe(r.grupos.reduce((s, g) => s + g.minutos, 0))
    expect(r.clasesDictadas).toBe(r.grupos.reduce((s, g) => s + g.dictadas.length, 0))
  })

  it('un grupo sin profesor asignado no inventa un profesor', () => {
    expect(correr().profesores).toHaveLength(0)
  })
})

describe('formato', () => {
  it('horas van con una decimal y coma', () => {
    expect(horas(120)).toBe('2,0')
    expect(horas(90)).toBe('1,5')
    expect(horas(100)).toBe('1,7')
  })

  it('las semanas del mes salen de los días hábiles, no de un 4 fijo', () => {
    expect(semanasDelMes(diasHabilesDelMes(2026, 7))).toBeCloseTo(4.6)
  })
})
