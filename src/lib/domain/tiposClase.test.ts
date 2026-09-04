import { describe, it, expect } from 'vitest'
import {
  TIPOS_CLASE,
  esClaseConAlumnos,
  esTipoClase,
  etiquetaTipoClase,
  modalidadDe,
} from './tiposClase'
import { crearLectorConfig } from './clubConfig'
import { cupoDelBloque, jugadoresPorMesa } from './mesas'

describe('tipos de clase', () => {
  it('1 · están los seis que el club enumeró', () => {
    expect(TIPOS_CLASE.map(t => t.clave)).toEqual([
      'grupal', 'competitivo', 'particular', 'adultos', 'paralimpico', 'arriendo',
    ])
  })

  it('2 · sin tipo se comporta como grupal, que es lo que hacía antes', () => {
    // Es lo que protege a Buin: sus bloques no tienen tipo y el cálculo de
    // mesas no puede cambiar por eso.
    expect(modalidadDe(null)).toBe('grupal')
    expect(modalidadDe(undefined)).toBe('grupal')
    expect(modalidadDe('')).toBe('grupal')
  })

  it('3 · solo el particular cambia la cuenta de mesas', () => {
    expect(modalidadDe('particular')).toBe('particular')
    for (const t of TIPOS_CLASE.filter(t => t.clave !== 'particular')) {
      expect(modalidadDe(t.clave)).toBe('grupal')
    }
  })

  it('4 · un tipo que no existe no revienta: cae en grupal', () => {
    expect(modalidadDe('futbol')).toBe('grupal')
    expect(esTipoClase('futbol')).toBe(false)
    expect(esTipoClase('particular')).toBe(true)
    expect(esTipoClase(null)).toBe(false)
    expect(esTipoClase(3)).toBe(false)
  })

  it('5 · el arriendo ocupa mesas pero no tiene alumnos', () => {
    expect(esClaseConAlumnos('arriendo')).toBe(false)
    expect(esClaseConAlumnos('grupal')).toBe(true)
    expect(esClaseConAlumnos('paralimpico')).toBe(true)
    // Sin tipo sí tiene alumnos: es un bloque normal de los de siempre.
    expect(esClaseConAlumnos(null)).toBe(true)
  })

  it('6 · la etiqueta siempre dice algo legible, nunca la clave cruda', () => {
    expect(etiquetaTipoClase('particular')).toBe('Particular (1 o 2)')
    expect(etiquetaTipoClase(null)).toBe('Grupal por nivel')
    expect(etiquetaTipoClase('inventado')).toBe('inventado')
  })
})

describe('el tipo se conecta con el cálculo de mesas', () => {
  /** Spinhouse: 4 por mesa en grupal, 2 en particular. */
  const spinhouse = crearLectorConfig([
    { clave: 'cupos.modo', valor: 'por_mesas' },
    { clave: 'cupos.por_mesa_grupal', valor: 4 },
    { clave: 'cupos.por_mesa_particular', valor: 2 },
  ])

  it('7 · un particular entra de a 2 por mesa y un grupal de a 4', () => {
    expect(jugadoresPorMesa(spinhouse, modalidadDe('particular'))).toBe(2)
    expect(jugadoresPorMesa(spinhouse, modalidadDe('competitivo'))).toBe(4)
  })

  it('8 · en la misma sala, el cupo de un particular es la mitad del de un grupal', () => {
    // 8 mesas libres: el grupal entra de a 4 y el particular de a 2.
    const base = {
      config: spinhouse,
      cupoMaximo: 0,
      inscritos: 0,
      totalSede: 8,
      usos: [],
      franja: { inicio: '19:00', fin: '20:00' },
    }
    expect(cupoDelBloque({ ...base, modalidad: modalidadDe('grupal') })).toBe(32)
    expect(cupoDelBloque({ ...base, modalidad: modalidadDe('particular') })).toBe(16)
  })
})
