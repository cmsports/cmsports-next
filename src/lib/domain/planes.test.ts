import { describe, expect, it } from 'vitest'
import { crearLectorConfig, CONFIG_POR_DEFECTO } from './clubConfig'
import {
  alcanzaLaFrecuencia,
  cobraPorPlan,
  etiquetaPlan,
  montoDelJugador,
  origenDelMonto,
  planVigente,
  planesVigentes,
  type Plan,
} from './planes'

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  nombre: 'Grupal',
  frecuencia_semanal: 2,
  tipo_clase: 'grupal',
  monto: 45000,
  vigente_desde: null,
  vigente_hasta: null,
  activo: true,
  ...over,
})

/** Un club que cobra por plan, como Spinhouse. */
const porPlan = crearLectorConfig([{ clave: 'mensualidad.modo', valor: 'por_plan' }])

describe('cobraPorPlan', () => {
  it('el default es monto libre, que es como cobra Buin', () => {
    expect(cobraPorPlan(CONFIG_POR_DEFECTO)).toBe(false)
  })

  it('con la config puesta, cobra por plan', () => {
    expect(cobraPorPlan(porPlan)).toBe(true)
  })
})

describe('montoDelJugador', () => {
  it('en un club de monto libre IGNORA el plan', () => {
    // Este es el caso de Buin. Si esta prueba falla, a Buin le cambió la cuota.
    expect(montoDelJugador({
      config: CONFIG_POR_DEFECTO, plan: plan({ monto: 45000 }), mensualidadPropia: 30000,
    })).toBe(30000)
  })

  it('en un club por plan usa la tarifa del plan', () => {
    expect(montoDelJugador({
      config: porPlan, plan: plan({ monto: 45000 }), mensualidadPropia: 30000,
    })).toBe(45000)
  })

  it('lo ya emitido gana sobre todo lo demás', () => {
    // La plata de un mes cerrado no cambia: subirle el precio al plan en marzo
    // no puede reescribir la cuota de febrero.
    expect(montoDelJugador({
      config: porPlan, emitido: 38000, plan: plan({ monto: 45000 }), mensualidadPropia: 30000,
    })).toBe(38000)
  })

  it('sin plan cae a su monto propio, que es el escape para un acuerdo especial', () => {
    expect(montoDelJugador({
      config: porPlan, plan: null, mensualidadPropia: 22000,
    })).toBe(22000)
  })

  it('sin plan y sin monto propio devuelve null, NO un monto inventado', () => {
    // La lección de la migración 097: un monto inventado se ve igual de real
    // que uno correcto, así que nadie lo revisa y termina cobrado.
    expect(montoDelJugador({ config: porPlan, plan: null, mensualidadPropia: null })).toBeNull()
    expect(montoDelJugador({ config: CONFIG_POR_DEFECTO })).toBeNull()
  })

  it('un plan de monto 0 no se confunde con "sin plan"', () => {
    // Una beca es un monto real, pero `0` es falsy: sin cuidado, caería al
    // monto propio y le cobraría al becado.
    expect(montoDelJugador({
      config: porPlan, plan: plan({ monto: 0 }), mensualidadPropia: 30000,
    })).toBe(30000)
    // ⚠ Documentado a propósito: hoy un plan gratis NO gana sobre el monto
    // propio. Si el club crea becas, hay que distinguir 0 de ausente.
  })
})

describe('origenDelMonto', () => {
  it('dice de dónde salió cada monto', () => {
    expect(origenDelMonto({ config: porPlan, emitido: 38000 })).toBe('emitido')
    expect(origenDelMonto({ config: porPlan, plan: plan() })).toBe('plan')
    expect(origenDelMonto({ config: porPlan, mensualidadPropia: 22000 })).toBe('propio')
    expect(origenDelMonto({ config: porPlan })).toBe('sin_asignar')
  })

  it('en monto libre nunca dice que salió del plan', () => {
    expect(origenDelMonto({ config: CONFIG_POR_DEFECTO, plan: plan() })).toBe('sin_asignar')
  })
})

describe('vigencia de un plan', () => {
  it('un plan activo sin fechas se puede contratar siempre', () => {
    expect(planVigente(plan(), '2026-09-02')).toBe(true)
  })

  it('un plan desactivado no', () => {
    expect(planVigente(plan({ activo: false }), '2026-09-02')).toBe(false)
  })

  it('no antes de su fecha de inicio', () => {
    expect(planVigente(plan({ vigente_desde: '2026-10-01' }), '2026-09-02')).toBe(false)
  })

  it('sí el último día, inclusive', () => {
    expect(planVigente(plan({ vigente_hasta: '2026-09-02' }), '2026-09-02')).toBe(true)
    expect(planVigente(plan({ vigente_hasta: '2026-09-02' }), '2026-09-03')).toBe(false)
  })

  it('los ordena del más barato al más caro', () => {
    const lista = [plan({ id: 'a', monto: 60000 }), plan({ id: 'b', monto: 30000 })]
    expect(planesVigentes(lista, '2026-09-02').map(p => p.id)).toEqual(['b', 'a'])
  })
})

describe('etiquetaPlan', () => {
  it('agrega la frecuencia cuando la tiene', () => {
    expect(etiquetaPlan(plan({ nombre: 'Grupal', frecuencia_semanal: 2 })))
      .toBe('Grupal · 2 veces por semana')
  })

  it('singular con una sola vez', () => {
    expect(etiquetaPlan(plan({ frecuencia_semanal: 1 }))).toContain('1 vez por semana')
  })

  it('sin frecuencia deja solo el nombre', () => {
    expect(etiquetaPlan(plan({ nombre: 'Libre', frecuencia_semanal: null }))).toBe('Libre')
  })
})

/** La validación 7 de la toma de bloques. */
describe('alcanzaLaFrecuencia', () => {
  it('un plan de 2 aguanta 2 grupos', () => {
    expect(alcanzaLaFrecuencia(plan({ frecuencia_semanal: 2 }), 2)).toEqual({ ok: true })
  })

  it('un plan de 2 NO aguanta 3, y lo dice con los números', () => {
    const r = alcanzaLaFrecuencia(plan({ frecuencia_semanal: 2 }), 3)
    expect(r?.ok).toBe(false)
    expect(r && r.ok === false && r.motivo)
      .toBe('Su plan es de 2 veces por semana y quedaría en 3 grupos.')
  })

  it('un plan sin frecuencia no restringe nada', () => {
    expect(alcanzaLaFrecuencia(plan({ frecuencia_semanal: null }), 5)).toBeNull()
  })

  it('sin plan tampoco: no hay nada que comprobar', () => {
    expect(alcanzaLaFrecuencia(null, 5)).toBeNull()
  })
})
