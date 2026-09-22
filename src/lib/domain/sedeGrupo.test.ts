import { describe, expect, it } from 'vitest'
import { sedeLabel, sedesDe } from './sedeGrupo'

describe('sedeLabel', () => {
  // Con la dirección: la etiqueta se lee en "Mesas en …", donde un apodo suelto
  // no dice dónde queda.
  it('nombra la sede de Spinhouse con su dirección', () => {
    expect(sedeLabel('spinhouse')).toBe('Spinhouse (José Ananías 128, Macul)')
  })

  // Ninguna sede todavía: quien llame decide qué poner, pero nunca hereda la
  // de otro club.
  it('no inventa una sede cuando no hay ninguna', () => {
    expect(sedeLabel('')).toBe('—')
    expect(sedeLabel(null)).toBe('—')
  })

  it('devuelve el valor crudo si no está en el catálogo', () => {
    expect(sedeLabel('temuco')).toBe('temuco')
  })
})

describe('sedesDe', () => {
  it('sin bloques no ofrece ninguna pestaña', () => {
    expect(sedesDe([])).toEqual([])
  })

  // El caso que motivó la función: Spinhouse veía las pestañas de Buin y
  // ninguna suya, así que sus bloques no aparecían en ningún lado.
  it('devuelve solo las sedes que el club usa', () => {
    expect(sedesDe([{ sede: 'spinhouse' }, { sede: 'spinhouse' }])).toEqual(['spinhouse'])
  })

  it('no le inventa a Buin una pestaña de Spinhouse', () => {
    expect(sedesDe([{ sede: 'buin' }, { sede: 'paine' }])).toEqual(['buin', 'paine'])
  })

  it('respeta el orden del catálogo, no el de llegada', () => {
    expect(sedesDe([{ sede: 'paine' }, { sede: 'buin' }])).toEqual(['buin', 'paine'])
  })

  it('una sede fuera del catálogo se muestra igual, al final', () => {
    expect(sedesDe([{ sede: 'temuco' }, { sede: 'buin' }])).toEqual(['buin', 'temuco'])
  })

  it('ignora los vacíos en vez de ofrecer una pestaña sin nombre', () => {
    expect(sedesDe([{ sede: '' }, { sede: 'buin' }])).toEqual(['buin'])
  })
})
