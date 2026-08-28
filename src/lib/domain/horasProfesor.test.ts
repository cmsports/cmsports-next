import { describe, expect, it } from 'vitest'
import { duracionMinutos, resumenHorasProfes, type MarcaProfesor } from './horasProfesor'

describe('duracionMinutos', () => {
  it('mide el bloque con el HH:MM:SS que devuelve Postgres', () => {
    expect(duracionMinutos('18:30:00', '20:30:00')).toBe(120)
  })

  it('aguanta el HH:MM del navegador', () => {
    expect(duracionMinutos('17:00', '18:30')).toBe(90)
  })

  // Un bloque con las horas al revés es un dato malo del horario. Contarlo como
  // negativo le restaría horas al profesor y nadie entendería de dónde salió.
  it('nunca da negativo', () => {
    expect(duracionMinutos('20:00', '18:00')).toBe(0)
  })
})

describe('resumenHorasProfes', () => {
  const marca = (profesor_id: string, fecha: string, hora_inicio: string, hora_fin: string): MarcaProfesor =>
    ({ profesor_id, fecha, hora_inicio, hora_fin })

  it('sin marcas devuelve la lista vacía, no un cero fantasma', () => {
    expect(resumenHorasProfes([])).toEqual([])
  })

  it('suma las clases y los minutos de cada uno', () => {
    const r = resumenHorasProfes([
      marca('ana', '2026-09-01', '17:00', '18:30'),
      marca('ana', '2026-09-03', '17:00', '18:30'),
    ])
    expect(r).toEqual([{ profesorId: 'ana', clases: 2, minutos: 180 }])
  })

  // Dos profes en el mismo bloque el mismo día: cada uno cobra sus horas. Es el
  // caso que pidió Spinhouse y el motivo de que la clave sea por profesor.
  it('cuenta a los dos profes de un mismo bloque', () => {
    const r = resumenHorasProfes([
      marca('ana', '2026-09-01', '17:00', '19:00'),
      marca('beto', '2026-09-01', '17:00', '19:00'),
    ])
    expect(r.map(x => [x.profesorId, x.minutos])).toEqual([['ana', 120], ['beto', 120]])
  })

  it('ordena de más horas a menos', () => {
    const r = resumenHorasProfes([
      marca('ana', '2026-09-01', '17:00', '18:00'),
      marca('beto', '2026-09-01', '17:00', '20:00'),
    ])
    expect(r.map(x => x.profesorId)).toEqual(['beto', 'ana'])
  })

  it('con los mismos minutos, el orden no baila', () => {
    const marcas = [
      marca('zeta', '2026-09-01', '17:00', '18:00'),
      marca('alfa', '2026-09-01', '17:00', '18:00'),
    ]
    expect(resumenHorasProfes(marcas).map(x => x.profesorId)).toEqual(['alfa', 'zeta'])
    expect(resumenHorasProfes([...marcas].reverse()).map(x => x.profesorId)).toEqual(['alfa', 'zeta'])
  })
})
