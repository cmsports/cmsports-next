import { describe, it, expect } from 'vitest'
import { altasYBajasDelMes, type Inscripcion } from './altasBajas'

const SEPTIEMBRE = { desde: '2026-09-01', hasta: '2026-09-30' }

const i = (jugadorId: string, desde: string, hasta: string | null = null): Inscripcion =>
  ({ jugadorId, desde, hasta })

describe('altas y bajas del mes', () => {
  it('1 · el que entró por primera vez en el mes es un alta', () => {
    expect(altasYBajasDelMes([i('a', '2026-09-10')], SEPTIEMBRE))
      .toEqual({ altas: 1, bajas: 0, reingresos: 0, neto: 1 })
  })

  it('2 · el que venía de antes y sigue no es nada: ni alta ni baja', () => {
    expect(altasYBajasDelMes([i('a', '2026-03-01')], SEPTIEMBRE))
      .toEqual({ altas: 0, bajas: 0, reingresos: 0, neto: 0 })
  })

  it('3 · el que cerró su única inscripción en el mes es una baja', () => {
    expect(altasYBajasDelMes([i('a', '2026-03-01', '2026-09-12')], SEPTIEMBRE))
      .toEqual({ altas: 0, bajas: 1, reingresos: 0, neto: -1 })
  })

  it('4 · cambiar de grupo NO es una baja, y este es el caso que importa', () => {
    // Cerró el bloque de los martes y el mismo día abrió el de los jueves.
    // Si "baja" fuera "se le cerró una inscripción", cada cambio de horario
    // aparecería como una deserción que nunca ocurrió.
    const cambio = [
      i('a', '2026-03-01', '2026-09-12'),
      i('a', '2026-09-13'),
    ]
    expect(altasYBajasDelMes(cambio, SEPTIEMBRE))
      .toEqual({ altas: 0, bajas: 0, reingresos: 0, neto: 0 })
  })

  it('5 · el que ya tenía historial y volvió tras estar fuera es un reingreso', () => {
    const volvio = [
      i('a', '2026-03-01', '2026-06-30'),
      i('a', '2026-09-05'),
    ]
    expect(altasYBajasDelMes(volvio, SEPTIEMBRE))
      .toEqual({ altas: 0, bajas: 0, reingresos: 1, neto: 1 })
  })

  it('6 · entró y se fue dentro del mismo mes: cuenta en las dos columnas', () => {
    expect(altasYBajasDelMes([i('a', '2026-09-03', '2026-09-20')], SEPTIEMBRE))
      .toEqual({ altas: 1, bajas: 1, reingresos: 0, neto: 0 })
  })

  it('7 · el que se fue en un mes anterior no vuelve a contar como baja', () => {
    expect(altasYBajasDelMes([i('a', '2026-03-01', '2026-06-30')], SEPTIEMBRE))
      .toEqual({ altas: 0, bajas: 0, reingresos: 0, neto: 0 })
  })

  it('8 · una vigencia que termina el último día del mes todavía no es baja', () => {
    // El 30 sigue vigente. Su baja, si no renueva, es del mes siguiente.
    expect(altasYBajasDelMes([i('a', '2026-03-01', '2026-09-30')], SEPTIEMBRE))
      .toEqual({ altas: 0, bajas: 0, reingresos: 0, neto: 0 })
  })

  it('9 · sin inscripciones da todo en cero, no revienta', () => {
    expect(altasYBajasDelMes([], SEPTIEMBRE))
      .toEqual({ altas: 0, bajas: 0, reingresos: 0, neto: 0 })
  })

  it('10 · el neto siempre cierra: altas + reingresos − bajas', () => {
    const mezcla = [
      i('nuevo', '2026-09-02'),                       // alta
      i('otro',  '2026-09-04'),                       // alta
      i('vuelve', '2026-01-01', '2026-05-01'),        // …
      i('vuelve', '2026-09-08'),                      // reingreso
      i('se-va', '2026-02-01', '2026-09-15'),         // baja
      i('sigue', '2026-02-01'),                       // nada
    ]
    const r = altasYBajasDelMes(mezcla, SEPTIEMBRE)
    expect(r).toEqual({ altas: 2, bajas: 1, reingresos: 1, neto: 2 })
    expect(r.neto).toBe(r.altas + r.reingresos - r.bajas)
  })
})
