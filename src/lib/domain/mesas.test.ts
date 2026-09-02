import { describe, expect, it } from 'vitest'
import { crearLectorConfig, CONFIG_POR_DEFECTO } from './clubConfig'
import {
  cupoDelBloque,
  jugadoresPorMesa,
  mesasEnUso,
  mesasLibres,
  puedeUsarMesas,
  seSolapan,
  tramosDelDia,
} from './mesas'

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

  it('el borde exacto tampoco al revés', () => {
    expect(seSolapan({ inicio: '20:00', fin: '21:00' }, { inicio: '19:00', fin: '20:00' })).toBe(false)
  })

  it('se pisan por el medio', () => {
    expect(seSolapan({ inicio: '19:00', fin: '20:00' }, { inicio: '19:30', fin: '20:30' })).toBe(true)
  })

  it('uno contiene al otro', () => {
    expect(seSolapan({ inicio: '18:00', fin: '21:00' }, { inicio: '19:00', fin: '20:00' })).toBe(true)
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

describe('cupoDelBloque', () => {
  it('con el modo por defecto usa el número escrito a mano y NO mira las mesas', () => {
    // Este es el caso de Buin. Si esta prueba falla, Buin cambió de cupo.
    expect(cupoDelBloque({ config: CONFIG_POR_DEFECTO, cupoMaximo: 12, mesas: 99 })).toBe(12)
  })

  it('3 mesas grupales dan 12', () => {
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 0, mesas: 3 })).toBe(12)
  })

  it('5 mesas grupales dan 20', () => {
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 0, mesas: 5 })).toBe(20)
  })

  it('2 mesas particulares dan 4', () => {
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 0, mesas: 2, modalidad: 'particular' })).toBe(4)
  })

  it('un bloque sin mesas declaradas cae al cupo escrito a mano, no a cero', () => {
    // "No declaré cuántas mesas uso" no puede significar "no entra nadie": eso
    // dejaría en cero a todos los bloques del club apenas alguien encienda el
    // modo por mesas.
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 10, mesas: null })).toBe(10)
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 10, mesas: 0 })).toBe(10)
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 10, mesas: undefined })).toBe(10)
  })

  it('con mesas declaradas ignora el cupo escrito a mano', () => {
    expect(cupoDelBloque({ config: porMesas, cupoMaximo: 999, mesas: 1 })).toBe(4)
  })

  it('jugadoresPorMesa respeta lo que configuró el club', () => {
    expect(jugadoresPorMesa(porMesas, 'grupal')).toBe(4)
    expect(jugadoresPorMesa(porMesas, 'particular')).toBe(2)
  })
})

describe('mesasEnUso y mesasLibres', () => {
  const usos = [
    { id: 'menores', etiqueta: 'Menores', inicio: '17:00', fin: '18:30', mesas: 3 },
    { id: 'adultos', etiqueta: 'Adultos', inicio: '19:00', fin: '20:30', mesas: 5 },
    { id: 'arr1',    etiqueta: 'Arriendo', inicio: '19:00', fin: '20:00', mesas: 2 },
  ]

  it('suma solo lo que se solapa', () => {
    expect(mesasEnUso(usos, { inicio: '17:00', fin: '18:00' })).toBe(3)
    expect(mesasEnUso(usos, { inicio: '19:15', fin: '19:45' })).toBe(7)
  })

  it('a una hora sin nada, cero', () => {
    expect(mesasEnUso(usos, { inicio: '21:00', fin: '22:00' })).toBe(0)
  })

  it('las libres salen del total', () => {
    expect(mesasLibres({ total: 12, usos, franja: { inicio: '19:15', fin: '19:45' } })).toBe(5)
    expect(mesasLibres({ total: 12, usos, franja: { inicio: '21:00', fin: '22:00' } })).toBe(12)
  })

  it('nunca da negativo, aunque lo cargado supere el total', () => {
    // Puede pasar si alguien baja la cantidad de mesas de la sede después.
    expect(mesasLibres({ total: 4, usos, franja: { inicio: '19:15', fin: '19:45' } })).toBe(0)
  })

  it('un bloque que se está editando no se cuenta a sí mismo', () => {
    // Sin esto, cambiarle las mesas a Adultos diría siempre "no hay lugar".
    expect(mesasEnUso(usos, { inicio: '19:15', fin: '19:45' }, 'adultos')).toBe(2)
    expect(mesasLibres({ total: 12, usos, franja: { inicio: '19:15', fin: '19:45' }, excluirId: 'adultos' })).toBe(10)
  })
})

/**
 * Los mensajes son parte de la especificación, no decoración: "error de
 * validación" obliga a escribirle al club por WhatsApp; "a esa hora quedan 3
 * mesas libres de 12" se resuelve solo.
 */
describe('puedeUsarMesas', () => {
  const usos = [
    { id: 'adultos', etiqueta: 'Adultos', inicio: '19:00', fin: '20:30', mesas: 5 },
  ]
  const franja = { inicio: '19:00', fin: '20:00' }

  it('deja usar lo que hay libre', () => {
    expect(puedeUsarMesas({ total: 12, usos, franja, mesas: 7 })).toEqual({ ok: true })
  })

  it('cero mesas siempre pasa: es "no uso el modelo de mesas"', () => {
    expect(puedeUsarMesas({ total: 12, usos, franja, mesas: 0 })).toEqual({ ok: true })
  })

  it('rechaza pasarse del total de la sede, diciendo cuántas hay', () => {
    const r = puedeUsarMesas({ total: 12, usos, franja, mesas: 15 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('La sede tiene 12 mesas en total.')
  })

  it('rechaza pasarse de las libres, diciendo cuántas quedan y quién usa el resto', () => {
    const r = puedeUsarMesas({ total: 12, usos, franja, mesas: 8 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe(
      'A esa hora quedan 7 mesas libres de 12. El resto lo usa Adultos (5).',
    )
  })

  it('cuando no queda ninguna lo dice distinto', () => {
    const llenas = [{ id: 'x', etiqueta: 'Adultos', inicio: '19:00', fin: '20:30', mesas: 12 }]
    const r = puedeUsarMesas({ total: 12, usos: llenas, franja, mesas: 1 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('no queda ninguna mesa libre de las 12')
  })

  it('avisa cuando la sede no tiene mesas cargadas', () => {
    const r = puedeUsarMesas({ total: 0, usos: [], franja, mesas: 3 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('todavía no tiene mesas cargadas')
  })

  it('rechaza un número que no es entero', () => {
    const r = puedeUsarMesas({ total: 12, usos: [], franja, mesas: 2.5 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('número entero')
  })

  it('deja reasignarle al bloque sus propias mesas', () => {
    expect(puedeUsarMesas({ total: 12, usos, franja, mesas: 5, excluirId: 'adultos' }))
      .toEqual({ ok: true })
  })

  it('una clase que empieza cuando termina la otra no compite', () => {
    const r = puedeUsarMesas({
      total: 12, usos: [{ id: 'a', etiqueta: 'Adultos', inicio: '19:00', fin: '20:00', mesas: 12 }],
      franja: { inicio: '20:00', fin: '21:00' }, mesas: 12,
    })
    expect(r).toEqual({ ok: true })
  })
})

describe('tramosDelDia', () => {
  it('parte el día en los cortes que marcan los propios bloques', () => {
    expect(tramosDelDia([
      { inicio: '17:00', fin: '18:30' },
      { inicio: '19:00', fin: '20:30' },
    ])).toEqual([
      { inicio: '17:00', fin: '18:30' },
      { inicio: '18:30', fin: '19:00' },
      { inicio: '19:00', fin: '20:30' },
    ])
  })

  it('parte donde algo empieza en medio de otra cosa', () => {
    expect(tramosDelDia([
      { inicio: '19:00', fin: '20:30' },
      { inicio: '19:30', fin: '20:00' },
    ])).toEqual([
      { inicio: '19:00', fin: '19:30' },
      { inicio: '19:30', fin: '20:00' },
      { inicio: '20:00', fin: '20:30' },
    ])
  })

  it('sin nada programado no hay tramos', () => {
    expect(tramosDelDia([])).toEqual([])
  })

  it('acepta HH:MM:SS', () => {
    expect(tramosDelDia([{ inicio: '19:00:00', fin: '20:00:00' }]))
      .toEqual([{ inicio: '19:00', fin: '20:00' }])
  })
})
