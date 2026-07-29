import { describe, expect, it } from 'vitest'
import { cierreVigencia, diasVigentes, vigenteEn, vigentesEn } from './vigencia'

const abierta = { vigente_desde: '2026-08-01', vigente_hasta: null }
const cerrada = { vigente_desde: '2026-03-01', vigente_hasta: '2026-05-15' }

describe('vigenteEn', () => {
  it('cuenta el primer y el último día', () => {
    expect(vigenteEn(cerrada, '2026-03-01')).toBe(true)
    expect(vigenteEn(cerrada, '2026-05-15')).toBe(true)
  })

  it('deja fuera lo anterior y lo posterior', () => {
    expect(vigenteEn(cerrada, '2026-02-28')).toBe(false)
    expect(vigenteEn(cerrada, '2026-05-16')).toBe(false)
  })

  it('sin fecha de término vale para siempre hacia adelante', () => {
    expect(vigenteEn(abierta, '2026-08-01')).toBe(true)
    expect(vigenteEn(abierta, '2030-01-01')).toBe(true)
    expect(vigenteEn(abierta, '2026-07-31')).toBe(false)
  })
})

describe('cierreVigencia', () => {
  it('el último día que valió es el anterior', () => {
    expect(cierreVigencia('2026-07-29')).toBe('2026-07-28')
  })

  it('cruza el fin de mes y el fin de año', () => {
    expect(cierreVigencia('2026-08-01')).toBe('2026-07-31')
    expect(cierreVigencia('2026-01-01')).toBe('2025-12-31')
    expect(cierreVigencia('2028-03-01')).toBe('2028-02-29')   // bisiesto
  })

  // El bug de Sofía: la sacaron del grupo por la mañana y a la tarde seguía
  // saliendo en la lista de asistencia de ese mismo día.
  it('quien sale del grupo deja de estar vigente hoy mismo', () => {
    const hoy = '2026-07-29'
    const suya = { vigente_desde: '2026-03-01', vigente_hasta: cierreVigencia(hoy) }
    expect(vigenteEn(suya, hoy)).toBe(false)
    expect(vigenteEn(suya, '2026-07-28')).toBe(true)
  })

  // Cerrar con la fecha de hoy dejaba al jugador en los dos grupos ese día:
  // el viejo todavía vigente y el nuevo ya empezado.
  it('el cambio de grupo no deja al jugador en los dos a la vez', () => {
    const hoy = '2026-08-13'
    const viejo = { vigente_desde: '2026-08-01', vigente_hasta: cierreVigencia(hoy) }
    const nuevo = { vigente_desde: hoy, vigente_hasta: null }
    expect(vigenteEn(viejo, hoy)).toBe(false)
    expect(vigenteEn(nuevo, hoy)).toBe(true)
  })
})

describe('vigentesEn', () => {
  it('separa a los que estaban de los que no', () => {
    const gente = [
      { jugador: 'ana',   ...cerrada },
      { jugador: 'luis',  ...abierta },
    ]
    expect(vigentesEn(gente, '2026-04-01').map(g => g.jugador)).toEqual(['ana'])
    expect(vigentesEn(gente, '2026-09-01').map(g => g.jugador)).toEqual(['luis'])
    expect(vigentesEn(gente, '2026-06-01')).toEqual([])
  })
})

describe('diasVigentes', () => {
  // El caso que motivó todo esto: los meses no tienen la misma cantidad de
  // cada día de la semana.
  const lunesDeAgosto2026     = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']
  const lunesDeSeptiembre2026 = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']

  it('agosto tiene cinco lunes y septiembre cuatro', () => {
    expect(diasVigentes(abierta, lunesDeAgosto2026)).toBe(5)
    expect(diasVigentes(abierta, lunesDeSeptiembre2026)).toBe(4)
  })

  it('quien entra a mitad de mes solo debe los que le tocaban', () => {
    const entraEl17 = { vigente_desde: '2026-08-17', vigente_hasta: null }
    expect(diasVigentes(entraEl17, lunesDeAgosto2026)).toBe(3)
  })

  it('quien se va a mitad de mes no debe los siguientes', () => {
    const seVaEl12 = { vigente_desde: '2026-08-01', vigente_hasta: '2026-08-12' }
    expect(diasVigentes(seVaEl12, lunesDeAgosto2026)).toBe(2)
  })

  it('quien entró y salió antes del período no debe ninguno', () => {
    expect(diasVigentes(cerrada, lunesDeAgosto2026)).toBe(0)
  })

  it('un jugador que se cambia de grupo no pierde ni duplica sesiones', () => {
    // Estaba en el grupo del lunes hasta el 12 y pasó a otro desde el 13.
    const viejo = { vigente_desde: '2026-08-01', vigente_hasta: '2026-08-12' }
    const nuevo = { vigente_desde: '2026-08-13', vigente_hasta: null }
    const suma = diasVigentes(viejo, lunesDeAgosto2026) + diasVigentes(nuevo, lunesDeAgosto2026)
    expect(suma).toBe(lunesDeAgosto2026.length)
  })
})
