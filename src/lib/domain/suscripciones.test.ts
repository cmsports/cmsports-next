import { describe, expect, it } from 'vitest'
import { metricasPlanes, planVencido, resumenCmsports, sumarMesesISO, vencimientoTrasPago } from './suscripciones'

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

describe('las cuentas de CmSports', () => {
  // El caso real: Buin pagó la implementación en junio, y después dos
  // mensualidades. Antes la pantalla mostraba $50.000 —el mes corriente— y el
  // resto no aparecía en ninguna parte.
  const pagos = [
    { club_id: 'buin', monto: 80000, fecha_pago: '2026-06-10' },
    { club_id: 'buin', monto: 50000, fecha_pago: '2026-08-05' },
    { club_id: 'buin', monto: 50000, fecha_pago: '2026-09-02' },
    { club_id: 'paine', monto: 30000, fecha_pago: '2026-09-01' },
  ]
  const gastos = [
    { monto: 12000, fecha: '2026-09-01' },
    { monto: 8000, fecha: '2026-07-01' },
  ]

  it('suma el histórico completo, no solo el mes', () => {
    const r = resumenCmsports(pagos, gastos, '2026-09-03')
    expect(r.ingresos).toBe(210000)
    expect(r.porClub.get('buin')).toEqual({ total: 180000, pagos: 3, ultimo: '2026-09-02' })
  })

  it('descuenta los gastos: el balance es un resultado, no la mitad de uno', () => {
    const r = resumenCmsports(pagos, gastos, '2026-09-03')
    expect(r.egresos).toBe(20000)
    expect(r.balance).toBe(190000)
  })

  // Registrar hoy un pago viejo no puede inflar la caja del mes.
  it('el mes se mide por la fecha en que entró la plata', () => {
    const r = resumenCmsports(pagos, gastos, '2026-09-03')
    expect(r.ingresosMes).toBe(80000)   // los dos de septiembre, no los de junio ni agosto
    expect(r.egresosMes).toBe(12000)
  })

  it('sin pagos ni gastos no revienta: todo en cero', () => {
    const r = resumenCmsports([], [], '2026-09-03')
    expect(r).toMatchObject({ ingresos: 0, egresos: 0, balance: 0, ingresosMes: 0, egresosMes: 0 })
    expect(r.porClub.size).toBe(0)
  })
})
