import { describe, it, expect } from 'vitest'
import { decidirRetiro, MOTIVO_GRUPO_DE_UNO } from './retiroTorneo'

const sinJugar = [{ ganador: null }, { ganador: null }, { ganador: null }]
const conUnResultado = [{ ganador: 'x' }, { ganador: null }, { ganador: null }]
const base = { enPreparacion: false, partidosGrupo: sinJugar, otrosActivos: 2, estaEnLaLlave: false, llaveConResultados: false }

describe('decidirRetiro', () => {
  it('grupo sin jugar y con dos que siguen: sale del grupo y se rehace', () => {
    expect(decidirRetiro(base)).toEqual({ modo: 'quitar' })
  })

  it('grupo con algún resultado: W.O. en lo pendiente, sin rehacer (borraría resultados de otros)', () => {
    expect(decidirRetiro({ ...base, partidosGrupo: conUnResultado })).toEqual({ modo: 'wo' })
  })

  it('si la llave ya empezó, aunque su grupo no haya jugado, no se rehace el grupo', () => {
    expect(decidirRetiro({ ...base, llaveConResultados: true })).toEqual({ modo: 'wo' })
  })

  it('si él ya está en la llave: W.O., aunque su grupo de origen fuera chico', () => {
    expect(decidirRetiro({ ...base, estaEnLaLlave: true, otrosActivos: 1 })).toEqual({ modo: 'wo' })
  })

  it('grupo que quedaría con uno solo: se bloquea con el motivo, jugado o no', () => {
    expect(decidirRetiro({ ...base, otrosActivos: 1 })).toEqual({ modo: 'bloqueado', motivo: MOTIVO_GRUPO_DE_UNO })
    expect(decidirRetiro({ ...base, otrosActivos: 1, partidosGrupo: conUnResultado })).toEqual({ modo: 'bloqueado', motivo: MOTIVO_GRUPO_DE_UNO })
  })

  it('un retirado anterior no cuenta como activo: grupo de 3 con uno ya retirado se bloquea', () => {
    // otrosActivos lo calcula quien llama sin contar retirados; acá se ve el efecto.
    expect(decidirRetiro({ ...base, otrosActivos: 1, partidosGrupo: conUnResultado }).modo).toBe('bloqueado')
  })

  it('grupo en preparación (sin partidos): siempre sale del grupo', () => {
    expect(decidirRetiro({ ...base, enPreparacion: true, otrosActivos: 0 })).toEqual({ modo: 'quitar' })
  })
})
