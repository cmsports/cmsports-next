import { describe, expect, it } from 'vitest'
import { minutosDelDia, ventanaAbierta } from './horario'

describe('minutosDelDia', () => {
  it('acepta el HH:MM:SS que devuelve Postgres', () => {
    expect(minutosDelDia('18:30:00')).toBe(18 * 60 + 30)
  })

  it('no se cae con vacío ni con null', () => {
    expect(minutosDelDia('')).toBe(0)
    expect(minutosDelDia(null)).toBe(0)
  })
})

describe('ventanaAbierta', () => {
  // El bloque de adultos de Buin: lunes 18:30 a 20:30.
  const inicio = '18:30:00'
  const fin    = '20:30:00'

  it('abre media hora antes de empezar', () => {
    expect(ventanaAbierta(inicio, fin, '18:00')).toBe(true)
  })

  it('sigue cerrada un minuto antes de esa media hora', () => {
    expect(ventanaAbierta(inicio, fin, '17:59')).toBe(false)
  })

  it('está abierta durante el entrenamiento', () => {
    expect(ventanaAbierta(inicio, fin, '19:15')).toBe(true)
  })

  it('aguanta media hora después de terminar', () => {
    expect(ventanaAbierta(inicio, fin, '21:00')).toBe(true)
  })

  it('cierra pasada esa media hora', () => {
    expect(ventanaAbierta(inicio, fin, '21:01')).toBe(false)
  })

  it('deja fuera la madrugada', () => {
    expect(ventanaAbierta(inicio, fin, '03:00')).toBe(false)
  })

  it('no da la vuelta al día cuando el bloque arranca temprano', () => {
    // Grupo AM: 09:00. Restar 30 no puede terminar en las 23:xx del día anterior.
    expect(ventanaAbierta('09:00:00', '11:00:00', '23:50')).toBe(false)
    expect(ventanaAbierta('09:00:00', '11:00:00', '08:30')).toBe(true)
  })
})

// Las pruebas de `inicioVentana` se fueron con la función: el alumno ya no se
// marca solo, así que no hay a quién explicarle desde qué hora podía.
