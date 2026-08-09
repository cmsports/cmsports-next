import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cuentaDelJugador, tieneExtrasPendientes, type ClaseExtraJugador } from './estadoCuenta'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

const extra = (parcial: Partial<ClaseExtraJugador> & { id: string }): ClaseExtraJugador => ({
  fecha: '2026-08-05',
  monto: null,
  pagada_en: null,
  ...parcial,
})

describe('cuentaDelJugador: el total que ve el jugador', () => {
  it('el caso Jonathan: la mensualidad sola mentía', () => {
    // $35.000 pendientes y una clase extra de $3.000 sin pagar. La pantalla
    // mostraba 35.000 y él debía 38.000.
    const cuenta = cuentaDelJugador(
      { monto: 35000, estado: 'pendiente' },
      [extra({ id: 'a', monto: 3000 })],
    )
    expect(cuenta.mensualidad).toBe(35000)
    expect(cuenta.extras).toBe(3000)
    expect(cuenta.total).toBe(38000)
  })

  it('la mensualidad pagada no suma, pero la clase extra impaga sí', () => {
    // El mes cerrado no borra lo que se le cobra aparte.
    const cuenta = cuentaDelJugador(
      { monto: 35000, estado: 'pagado' },
      [extra({ id: 'a', monto: 3000 })],
    )
    expect(cuenta.mensualidad).toBe(0)
    expect(cuenta.total).toBe(3000)
  })

  it('sin mensualidad emitida el total es solo lo de las extras', () => {
    const cuenta = cuentaDelJugador(null, [extra({ id: 'a', monto: 3000 })])
    expect(cuenta.mensualidad).toBe(0)
    expect(cuenta.total).toBe(3000)
  })

  it('sin nada, todo en cero y sin explotar', () => {
    const cuenta = cuentaDelJugador(undefined, undefined)
    expect(cuenta.total).toBe(0)
    expect(cuenta.porCobrar).toEqual([])
    expect(cuenta.pagadas).toEqual([])
  })

  it('la mensualidad sin monto asignado cuenta como cero, no como NaN', () => {
    const cuenta = cuentaDelJugador({ monto: null, estado: 'pendiente' }, [])
    expect(cuenta.mensualidad).toBe(0)
    expect(cuenta.total).toBe(0)
  })
})

describe('cuentaDelJugador: los tres montos son estados distintos', () => {
  const extras = [
    extra({ id: 'conPrecio', monto: 3000 }),
    extra({ id: 'sinCargo', monto: 0 }),
    extra({ id: 'sinPrecio', monto: null }),
  ]

  it('solo la que tiene precio suma', () => {
    const cuenta = cuentaDelJugador({ monto: 0, estado: 'pagado' }, extras)
    expect(cuenta.extras).toBe(3000)
  })

  it('monto 0 es "sin cargo", no una deuda de cero', () => {
    // Importa la distinción: al jugador se le dice "el profe te debía esta
    // clase", que no es lo mismo que no mostrarla.
    const cuenta = cuentaDelJugador(null, extras)
    expect(cuenta.sinCargo.map(e => e.id)).toEqual(['sinCargo'])
    expect(cuenta.porCobrar.map(e => e.id)).toEqual(['conPrecio'])
  })

  it('monto null es "todavía sin precio" y no se cuela en el total', () => {
    const cuenta = cuentaDelJugador(null, extras)
    expect(cuenta.sinMonto.map(e => e.id)).toEqual(['sinPrecio'])
    expect(cuenta.total).toBe(3000)
  })

  it('un monto negativo nunca descuenta del total', () => {
    // La base lo prohíbe (CHECK monto >= 0), pero un total que puede bajar por
    // un dato raro es peor que uno que ignora el dato raro.
    const cuenta = cuentaDelJugador(
      { monto: 35000, estado: 'pendiente' },
      [extra({ id: 'raro', monto: -5000 })],
    )
    expect(cuenta.total).toBe(35000)
    expect(cuenta.sinCargo.map(e => e.id)).toEqual(['raro'])
  })
})

describe('cuentaDelJugador: pagada_en manda sobre el monto', () => {
  it('una clase pagada no vuelve a ser deuda', () => {
    const cuenta = cuentaDelJugador(null, [
      extra({ id: 'vieja', monto: 3000, pagada_en: '2026-07-28T12:00:00Z' }),
    ])
    expect(cuenta.total).toBe(0)
    expect(cuenta.porCobrar).toEqual([])
    expect(cuenta.pagadas.map(e => e.id)).toEqual(['vieja'])
  })

  it('las pagadas quedan en el historial aunque no tengan precio', () => {
    const cuenta = cuentaDelJugador(null, [
      extra({ id: 'x', monto: null, pagada_en: '2026-07-28T12:00:00Z' }),
    ])
    expect(cuenta.sinMonto).toEqual([])
    expect(cuenta.pagadas.map(e => e.id)).toEqual(['x'])
  })
})

describe('cuentaDelJugador: las deudas viejas siguen siendo deudas', () => {
  it('una extra del mes pasado sin pagar entra en el total de hoy', () => {
    // No se filtra por mes a propósito: si quedó impaga, se debe.
    const cuenta = cuentaDelJugador({ monto: 35000, estado: 'pendiente' }, [
      extra({ id: 'julio', fecha: '2026-07-14', monto: 3000 }),
      extra({ id: 'agosto', fecha: '2026-08-05', monto: 3000 }),
    ])
    expect(cuenta.total).toBe(41000)
  })

  it('las más nuevas se muestran primero', () => {
    const cuenta = cuentaDelJugador(null, [
      extra({ id: 'vieja', fecha: '2026-07-14', monto: 3000 }),
      extra({ id: 'nueva', fecha: '2026-08-05', monto: 3000 }),
      extra({ id: 'media', fecha: '2026-07-30', monto: 3000 }),
    ])
    expect(cuenta.porCobrar.map(e => e.id)).toEqual(['nueva', 'media', 'vieja'])
  })

  it('no muta el arreglo que recibe', () => {
    // Llega desde el estado de React; ordenarlo en el lugar lo corrompería.
    const entrada = [
      extra({ id: 'vieja', fecha: '2026-07-14', monto: 3000 }),
      extra({ id: 'nueva', fecha: '2026-08-05', monto: 3000 }),
    ]
    cuentaDelJugador(null, entrada)
    expect(entrada.map(e => e.id)).toEqual(['vieja', 'nueva'])
  })
})

describe('tieneExtrasPendientes', () => {
  it('es falso cuando lo único que debe es la cuota', () => {
    const cuenta = cuentaDelJugador({ monto: 35000, estado: 'pendiente' }, [])
    expect(tieneExtrasPendientes(cuenta)).toBe(false)
  })

  it('una clase sin cargo no cuenta como pendiente', () => {
    const cuenta = cuentaDelJugador(null, [extra({ id: 'a', monto: 0 })])
    expect(tieneExtrasPendientes(cuenta)).toBe(false)
  })

  it('es verdadero con una extra con precio impaga', () => {
    const cuenta = cuentaDelJugador(null, [extra({ id: 'a', monto: 3000 })])
    expect(tieneExtrasPendientes(cuenta)).toBe(true)
  })
})

describe('la pantalla del jugador consulta lo que dice mostrar', () => {
  const pagina = leer('src/app/estado-cuenta/page.tsx')

  it('lee las clases extraordinarias, que era lo que faltaba', () => {
    expect(pagina).toContain("from('clases_extraordinarias')")
  })

  it('filtra por su jugador_id: la RLS lo hace igual, pero pedir de más es pedir de otros', () => {
    const consulta = pagina.slice(pagina.indexOf("from('clases_extraordinarias')"))
    expect(consulta.slice(0, 300)).toContain("eq('jugador_id'")
  })

  it('se refresca sola cuando cambia una clase extra', () => {
    // Sin esto, ponerle precio desde Finanzas no llega a su pantalla.
    expect(pagina).toContain('clases_extraordinarias')
    expect(pagina).toMatch(/table: 'clases_extraordinarias'/)
  })

  it('el total sale del dominio y no se recalcula a mano en la vista', () => {
    expect(pagina).toContain('cuentaDelJugador')
  })
})

describe('las dos pantallas del jugador no pueden contradecirse', () => {
  const perfilPage = leer('src/app/perfil/page.tsx')

  it('el perfil mira la misma cuenta que el estado de cuenta', () => {
    // Decían cosas distintas del mismo jugador el mismo día: el perfil leía
    // solo `mensualidades` y cantaba "✅ Pagado" con una extra sin pagar.
    expect(perfilPage).toContain('cuentaDelJugador')
    expect(perfilPage).toContain("from('clases_extraordinarias')")
  })

  it('el rótulo del perfil ya no sale del estado de la cuota a secas', () => {
    expect(perfilPage).not.toMatch(/mensLabel = mensEstado === 'pagado'/)
  })
})
