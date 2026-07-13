import { describe, expect, it } from 'vitest'
import { planVencido, sumarMesesISO } from './suscripciones'

describe('ciclo mensual de suscripción', () => {
  it('respeta el último día del mes', () => {
    expect(sumarMesesISO('2026-01-31')).toBe('2026-02-28')
    expect(sumarMesesISO('2024-01-31')).toBe('2024-02-29')
  })

  it('mantiene el día cuando existe', () => {
    expect(sumarMesesISO('2026-07-13')).toBe('2026-08-13')
    expect(sumarMesesISO('2026-12-15')).toBe('2027-01-15')
  })

  it('solo avisa planes activos vencidos', () => {
    expect(planVencido('activo', '2026-07-13', '2026-07-13')).toBe(true)
    expect(planVencido('activo', '2026-07-14', '2026-07-13')).toBe(false)
    expect(planVencido('suspendido', '2026-07-01', '2026-07-13')).toBe(false)
  })
})
