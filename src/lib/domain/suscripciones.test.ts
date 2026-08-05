import { describe, expect, it } from 'vitest'
import { metricasPlanes, planVencido, sumarMesesISO, vencimientoTrasPago } from './suscripciones'

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

describe('vencimientoTrasPago', () => {
  const inicioAgosto = { fechaInicioPlan: '2026-08-01', periodoAnio: 2026 }

  // El caso reportado: un plan que parte el 1 de agosto quedaba venciendo el 1
  // de octubre. Activar el plan ya deja el vencimiento en 09-01, y el pago de
  // agosto lo corría un mes más.
  it('pagar el primer mes deja el vencimiento un mes después del inicio', () => {
    expect(vencimientoTrasPago({ ...inicioAgosto, proximoVencimiento: '2026-09-01', periodoMes: 8 }))
      .toBe('2026-09-01')
  })

  it('pagar el segundo mes sí lo corre a octubre', () => {
    expect(vencimientoTrasPago({ ...inicioAgosto, proximoVencimiento: '2026-09-01', periodoMes: 9 }))
      .toBe('2026-10-01')
  })

  // Sin esto, un doble registro por error del admin le regalaba un mes al club.
  it('registrar dos veces el mismo período no mueve la fecha', () => {
    const primera = vencimientoTrasPago({ ...inicioAgosto, proximoVencimiento: '2026-09-01', periodoMes: 9 })
    const segunda = vencimientoTrasPago({ ...inicioAgosto, proximoVencimiento: primera, periodoMes: 9 })
    expect(segunda).toBe(primera)
  })

  it('un mes atrasado no hace retroceder el vencimiento ya ganado', () => {
    expect(vencimientoTrasPago({ ...inicioAgosto, proximoVencimiento: '2026-11-01', periodoMes: 8 }))
      .toBe('2026-11-01')
  })

  it('sin fecha de inicio se conserva lo que había', () => {
    expect(vencimientoTrasPago({ fechaInicioPlan: null, proximoVencimiento: '2026-09-01', periodoMes: 8, periodoAnio: 2026 }))
      .toBe('2026-09-01')
  })

  it('respeta el día del mes de la fecha de inicio', () => {
    expect(vencimientoTrasPago({ fechaInicioPlan: '2026-08-15', proximoVencimiento: null, periodoMes: 8, periodoAnio: 2026 }))
      .toBe('2026-09-15')
  })

  it('cruza el año sin romperse', () => {
    expect(vencimientoTrasPago({ fechaInicioPlan: '2026-12-01', proximoVencimiento: null, periodoMes: 12, periodoAnio: 2026 }))
      .toBe('2027-01-01')
  })
})

describe('metricasPlanes', () => {
  // Refleja el estado real: 4 clubes, uno solo pagando.
  const clubes = [
    { estado_plan: 'activo', plan_mensual: 50000, proximo_vencimiento: '2026-09-01' },
    { estado_plan: 'prueba', plan_mensual: 0, proximo_vencimiento: null },
    { estado_plan: 'prueba', plan_mensual: 0, proximo_vencimiento: null },
    { estado_plan: 'prueba', plan_mensual: 0, proximo_vencimiento: null },
  ]

  it('cuenta como activos solo los de plan activo, no los de prueba', () => {
    const m = metricasPlanes(clubes, '2026-08-05')
    expect(m.activos).toBe(1)
    expect(m.totalClubes).toBe(4)
  })

  // Era el "2 de 4 al día": un club en prueba marcado como pagado sumaba.
  it('"al día" se mide solo sobre los planes activos', () => {
    const m = metricasPlanes(clubes, '2026-08-05')
    expect(m.alDia).toBe(1)
    expect(m.vencidos).toBe(0)
  })

  it('el MRR ignora el monto de planes que no están activos', () => {
    const conSuspendido = [...clubes, { estado_plan: 'suspendido', plan_mensual: 90000, proximo_vencimiento: null }]
    expect(metricasPlanes(conSuspendido, '2026-08-05').mrr).toBe(50000)
  })

  it('un activo pasado de fecha cuenta como vencido, no como al día', () => {
    const m = metricasPlanes(clubes, '2026-09-02')
    expect(m.vencidos).toBe(1)
    expect(m.alDia).toBe(0)
  })
})
