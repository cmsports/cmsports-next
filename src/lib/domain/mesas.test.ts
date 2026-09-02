import { describe, expect, it } from 'vitest'
import { crearLectorConfig, CONFIG_POR_DEFECTO } from './clubConfig'
import {
  cupoDelBloque,
  jugadoresPorMesa,
  mesaVigente,
  mesasLibres,
  mesasVigentes,
  puedeAsignarMesas,
  seSolapan,
  type Mesa,
} from './mesas'

const mesa = (numero: number, extra: Partial<Mesa> = {}): Mesa => ({
  id: `m${numero}`,
  numero,
  vigente_desde: null,
  vigente_hasta: null,
  ...extra,
})

/** Un club con las mesas encendidas, como Spinhouse. */
const porMesas = crearLectorConfig([
  { clave: 'cupos.modo', valor: 'por_mesas' },
  { clave: 'cupos.por_mesa_grupal', valor: 4 },
  { clave: 'cupos.por_mesa_particular', valor: 2 },
])

describe('seSolapan', () => {
  /**
   * ESTE es el caso que se escribe mal.
   *
   * Con `>=` en vez de `>`, una clase que empieza justo cuando termina el
   * arriendo queda bloqueada sin razón — y programar cada hora en punto es
   * exactamente lo que hace una sala de tenis de mesa.
   */
  it('el borde exacto NO se solapa: 19–20 con 20–21', () => {
    expect(seSolapan({ inicio: '19:00', fin: '20:00' }, { inicio: '20:00', fin: '21:00' })).toBe(false)
  })

  it('el borde exacto tampoco al revés: 20–21 con 19–20', () => {
    expect(seSolapan({ inicio: '20:00', fin: '21:00' }, { inicio: '19:00', fin: '20:00' })).toBe(false)
  })

  it('se pisan por el medio', () => {
    expect(seSolapan({ inicio: '19:00', fin: '20:00' }, { inicio: '19:30', fin: '20:30' })).toBe(true)
  })

  it('uno contiene al otro', () => {
    expect(seSolapan({ inicio: '18:00', fin: '21:00' }, { inicio: '19:00', fin: '20:00' })).toBe(true)
  })

  it('el mismo rango se solapa consigo mismo', () => {
    expect(seSolapan({ inicio: '19:00', fin: '20:00' }, { inicio: '19:00', fin: '20:00' })).toBe(true)
  })

  it('un minuto de encimada ya es solapamiento', () => {
    expect(seSolapan({ inicio: '19:00', fin: '20:01' }, { inicio: '20:00', fin: '21:00' })).toBe(true)
  })

  it('rangos separados no se tocan', () => {
    expect(seSolapan({ inicio: '17:00', fin: '18:00' }, { inicio: '19:00', fin: '20:00' })).toBe(false)
  })

  it('acepta HH:MM:SS, que es como lo guarda Postgres', () => {
    expect(seSolapan({ inicio: '19:00:00', fin: '20:00:00' }, { inicio: '20:00:00', fin: '21:00:00' })).toBe(false)
    expect(seSolapan({ inicio: '19:00:00', fin: '20:00:00' }, { inicio: '19:30:00', fin: '20:30:00' })).toBe(true)
  })

  it('un rango invertido o vacío no bloquea nada', () => {
    // Una fila mal cargada no puede dejar media sala inutilizable.
    expect(seSolapan({ inicio: '20:00', fin: '19:00' }, { inicio: '19:00', fin: '21:00' })).toBe(false)
    expect(seSolapan({ inicio: '19:00', fin: '19:00' }, { inicio: '18:00', fin: '21:00' })).toBe(false)
  })
})

describe('vigencia de una mesa', () => {
  it('una mesa sin fechas sirve siempre', () => {
    expect(mesaVigente(mesa(1), '2026-09-02')).toBe(true)
  })

  it('no sirve antes de su alta', () => {
    expect(mesaVigente(mesa(1, { vigente_desde: '2026-09-10' }), '2026-09-02')).toBe(false)
  })

  it('sirve el mismo día del alta', () => {
    expect(mesaVigente(mesa(1, { vigente_desde: '2026-09-02' }), '2026-09-02')).toBe(true)
  })

  it('sirve el ÚLTIMO día de su vigencia, inclusive', () => {
    // Misma semántica que en el resto del proyecto: cerrar es con ayer.
    expect(mesaVigente(mesa(1, { vigente_hasta: '2026-09-02' }), '2026-09-02')).toBe(true)
    expect(mesaVigente(mesa(1, { vigente_hasta: '2026-09-02' }), '2026-09-03')).toBe(false)
  })

  it('una mesa dada de baja a mitad de semana deja de contar desde ese día', () => {
    const sala = [mesa(1), mesa(2), mesa(3, { vigente_hasta: '2026-09-02' })]
    expect(mesasVigentes(sala, '2026-09-02')).toHaveLength(3)
    expect(mesasVigentes(sala, '2026-09-03')).toHaveLength(2)
  })

  it('las devuelve ordenadas por número', () => {
    expect(mesasVigentes([mesa(3), mesa(1), mesa(2)], '2026-09-02').map(m => m.numero))
      .toEqual([1, 2, 3])
  })
})

describe('cupoDelBloque', () => {
  it('con el modo por defecto usa el número escrito a mano y NO mira las mesas', () => {
    // Este es el caso de Buin. Si esta prueba falla, Buin cambió de cupo.
    expect(cupoDelBloque({
      config: CONFIG_POR_DEFECTO, cupoMaximo: 12, mesasAsignadas: 99,
    })).toBe(12)
  })

  it('4 mesas grupales dan 16', () => {
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 0, mesasAsignadas: 4 })).toBe(16)
  })

  it('2 mesas particulares dan 4', () => {
    expect(cupoDelBloque({
      config: porMesas, cupoMaximo: 0, mesasAsignadas: 2, modalidad: 'particular',
    })).toBe(4)
  })

  it('sin mesas asignadas da 0, no null ni error', () => {
    // No hay dónde jugar, así que no entra nadie. Devolver null obligaría a
    // cada pantalla a decidir qué hacer, y alguna decidiría mal.
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 12, mesasAsignadas: 0 })).toBe(0)
  })

  it('ignora el cupo escrito a mano cuando cuenta mesas', () => {
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 999, mesasAsignadas: 1 })).toBe(4)
  })

  it('jugadoresPorMesa respeta lo que configuró el club', () => {
    expect(jugadoresPorMesa(porMesas, 'grupal')).toBe(4)
    expect(jugadoresPorMesa(porMesas, 'particular')).toBe(2)
  })
})

describe('mesasLibres', () => {
  const sala = [mesa(1), mesa(2), mesa(3), mesa(4)]
  const hoy = '2026-09-02'

  it('sin nada ocupado están todas', () => {
    expect(mesasLibres({ mesas: sala, usos: [], fechaISO: hoy, franja: { inicio: '19:00', fin: '20:00' } }))
      .toHaveLength(4)
  })

  it('descuenta las que tiene una clase que se solapa', () => {
    const usos = [
      { mesa_id: 'm1', inicio: '19:00', fin: '20:30', origen_id: 'b1' },
      { mesa_id: 'm2', inicio: '19:00', fin: '20:30', origen_id: 'b1' },
    ]
    const libres = mesasLibres({ mesas: sala, usos, fechaISO: hoy, franja: { inicio: '19:00', fin: '20:00' } })
    expect(libres.map(m => m.numero)).toEqual([3, 4])
  })

  it('un arriendo que termina justo cuando empieza la clase NO la bloquea', () => {
    const usos = [{ mesa_id: 'm1', inicio: '19:00', fin: '20:00', origen_id: 'a1' }]
    const libres = mesasLibres({ mesas: sala, usos, fechaISO: hoy, franja: { inicio: '20:00', fin: '21:00' } })
    expect(libres).toHaveLength(4)
  })

  it('no cuenta las mesas dadas de baja', () => {
    const sala2 = [mesa(1), mesa(2, { vigente_hasta: '2026-09-01' })]
    const libres = mesasLibres({ mesas: sala2, usos: [], fechaISO: hoy, franja: { inicio: '19:00', fin: '20:00' } })
    expect(libres.map(m => m.numero)).toEqual([1])
  })

  it('un bloque que se está editando no compite consigo mismo', () => {
    // Sin esto, reasignarle sus propias mesas diría siempre "ya están tomadas".
    const usos = [{ mesa_id: 'm1', inicio: '19:00', fin: '20:00', origen_id: 'b1' }]
    const libres = mesasLibres({
      mesas: sala, usos, fechaISO: hoy,
      franja: { inicio: '19:00', fin: '20:00' }, excluirOrigen: 'b1',
    })
    expect(libres).toHaveLength(4)
  })

  it('pero sí compite con OTRO bloque a la misma hora', () => {
    const usos = [{ mesa_id: 'm1', inicio: '19:00', fin: '20:00', origen_id: 'b2' }]
    const libres = mesasLibres({
      mesas: sala, usos, fechaISO: hoy,
      franja: { inicio: '19:00', fin: '20:00' }, excluirOrigen: 'b1',
    })
    expect(libres.map(m => m.numero)).toEqual([2, 3, 4])
  })
})

/**
 * Los mensajes son parte de la especificación, no decoración: "error de
 * validación" obliga a escribirle al club por WhatsApp; "la mesa 3 ya está
 * tomada de 19:00 a 20:00" se resuelve solo.
 */
describe('puedeAsignarMesas', () => {
  const sala = [mesa(1), mesa(2), mesa(3)]
  const hoy = '2026-09-02'
  const franja = { inicio: '19:00', fin: '20:00' }

  it('deja asignar mesas libres', () => {
    expect(puedeAsignarMesas({ mesas: sala, usos: [], fechaISO: hoy, franja, mesaIds: ['m1', 'm2'] }))
      .toEqual({ ok: true })
  })

  it('exige al menos una mesa', () => {
    const r = puedeAsignarMesas({ mesas: sala, usos: [], fechaISO: hoy, franja, mesaIds: [] })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('al menos una mesa')
  })

  it('dice QUÉ mesa está tomada y a qué hora', () => {
    const usos = [{ mesa_id: 'm2', inicio: '19:00', fin: '20:00', origen_id: 'a1' }]
    const r = puedeAsignarMesas({ mesas: sala, usos, fechaISO: hoy, franja, mesaIds: ['m1', 'm2'] })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('La mesa 2 ya está tomada de 19:00 a 20:00.')
  })

  it('rechaza una mesa que no existe', () => {
    const r = puedeAsignarMesas({ mesas: sala, usos: [], fechaISO: hoy, franja, mesaIds: ['m9'] })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('no existe')
  })

  it('rechaza una mesa dada de baja, nombrándola', () => {
    const sala2 = [mesa(1, { vigente_hasta: '2026-09-01' })]
    const r = puedeAsignarMesas({ mesas: sala2, usos: [], fechaISO: hoy, franja, mesaIds: ['m1'] })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('La mesa 1 no está disponible en esa fecha.')
  })

  it('deja reasignarle al bloque sus propias mesas', () => {
    const usos = [{ mesa_id: 'm1', inicio: '19:00', fin: '20:00', origen_id: 'b1' }]
    expect(puedeAsignarMesas({
      mesas: sala, usos, fechaISO: hoy, franja, mesaIds: ['m1'], excluirOrigen: 'b1',
    })).toEqual({ ok: true })
  })
})
