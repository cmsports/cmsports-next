import { describe, expect, it } from 'vitest'
import { alertasCumplimientoPlan } from './alertas-plan'

describe('alertasCumplimientoPlan', () => {
  it('marca alta cuando no hay sesiones tras 14 días', () => {
    const alertas = alertasCumplimientoPlan({
      hoy: '2026-08-09',
      asignaciones: [{
        plan_id: 'p1',
        jugador_id: 'j1',
        estado: 'asignado',
        fecha_inicio: '2026-07-01',
      }],
      planes: [{ id: 'p1', nombre: 'Plan base' }],
      jugadores: [{ id: 'j1', nombre: 'Matías' }],
      ejercicios: [{ id: 'e1', plan_id: 'p1' }],
      sesiones: [],
    })
    expect(alertas).toHaveLength(1)
    expect(alertas[0].severidad).toBe('alta')
    expect(alertas[0].motivo).toMatch(/Sin ninguna sesión/)
  })

  it('no alerta si hubo sesión reciente', () => {
    const alertas = alertasCumplimientoPlan({
      hoy: '2026-08-09',
      asignaciones: [{
        plan_id: 'p1',
        jugador_id: 'j1',
        estado: 'en_curso',
        fecha_inicio: '2026-07-01',
      }],
      planes: [{ id: 'p1', nombre: 'Plan base' }],
      jugadores: [{ id: 'j1', nombre: 'Matías' }],
      ejercicios: [{ id: 'e1', plan_id: 'p1' }, { id: 'e2', plan_id: 'p1' }],
      sesiones: [{
        plan_id: 'p1',
        jugador_id: 'j1',
        ejercicio_id: 'e1',
        fecha: '2026-08-05',
      }],
    })
    expect(alertas).toHaveLength(0)
  })
})
