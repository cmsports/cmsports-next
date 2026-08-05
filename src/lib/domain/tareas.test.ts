import { describe, expect, it } from 'vitest'
import { horasHastaOcultar, ordenarTareas, tareaVisible } from './tareas'

const AHORA = new Date('2026-08-05T12:00:00Z')
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()

describe('tareaVisible', () => {
  it('lo pendiente siempre se ve, por viejo que sea', () => {
    expect(tareaVisible({ estado: 'sin_realizar', completada_en: null }, AHORA)).toBe(true)
    expect(tareaVisible({ estado: 'parcial', completada_en: null }, AHORA)).toBe(true)
  })

  it('una tarea recién hecha sigue en la lista', () => {
    expect(tareaVisible({ estado: 'hecho', completada_en: haceHoras(1) }, AHORA)).toBe(true)
  })

  it('a las 12 horas justas ya no se ve', () => {
    expect(tareaVisible({ estado: 'hecho', completada_en: haceHoras(12) }, AHORA)).toBe(false)
  })

  it('un minuto antes de las 12 horas todavía se ve', () => {
    expect(tareaVisible({ estado: 'hecho', completada_en: haceHoras(11.98) }, AHORA)).toBe(true)
  })

  it('pasadas las 12 horas desaparece', () => {
    expect(tareaVisible({ estado: 'hecho', completada_en: haceHoras(30) }, AHORA)).toBe(false)
  })

  // El trigger de la base no debería dejar este estado, pero si pasa es mejor
  // mostrar la tarea que hacerla desaparecer sin que nadie entienda por qué.
  it('hecha sin fecha de término se muestra igual', () => {
    expect(tareaVisible({ estado: 'hecho', completada_en: null }, AHORA)).toBe(true)
  })
})

describe('horasHastaOcultar', () => {
  it('devuelve las horas que faltan, redondeadas hacia arriba', () => {
    expect(horasHastaOcultar({ estado: 'hecho', completada_en: haceHoras(9.5) }, AHORA)).toBe(3)
  })

  it('no aplica a las pendientes', () => {
    expect(horasHastaOcultar({ estado: 'parcial', completada_en: null }, AHORA)).toBeNull()
  })

  it('nunca da negativo', () => {
    expect(horasHastaOcultar({ estado: 'hecho', completada_en: haceHoras(50) }, AHORA)).toBe(0)
  })
})

describe('ordenarTareas', () => {
  it('las pendientes van arriba y las hechas al final', () => {
    const orden = ordenarTareas([
      { id: 'hecha', estado: 'hecho', completada_en: haceHoras(1), creada_en: haceHoras(100) },
      { id: 'nueva', estado: 'sin_realizar', completada_en: null, creada_en: haceHoras(2) },
      { id: 'vieja', estado: 'parcial', completada_en: null, creada_en: haceHoras(80) },
    ]).map(t => t.id)

    // Entre pendientes manda la antigüedad: lo que lleva más tiempo sin
    // hacerse es lo que hay que mirar primero.
    expect(orden).toEqual(['vieja', 'nueva', 'hecha'])
  })

  it('entre las hechas, la más reciente primero', () => {
    const orden = ordenarTareas([
      { id: 'antes', estado: 'hecho', completada_en: haceHoras(8), creada_en: haceHoras(20) },
      { id: 'recien', estado: 'hecho', completada_en: haceHoras(1), creada_en: haceHoras(20) },
    ]).map(t => t.id)

    expect(orden).toEqual(['recien', 'antes'])
  })

  it('no muta el arreglo que recibe', () => {
    const original = [
      { id: 'b', estado: 'hecho', completada_en: haceHoras(1), creada_en: haceHoras(1) },
      { id: 'a', estado: 'sin_realizar', completada_en: null, creada_en: haceHoras(2) },
    ]
    ordenarTareas(original)
    expect(original.map(t => t.id)).toEqual(['b', 'a'])
  })
})
