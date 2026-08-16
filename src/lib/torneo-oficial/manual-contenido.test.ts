import { describe, expect, it } from 'vitest'
import { MANUAL_REGLAS, MANUAL_USO } from './manual-contenido'

describe('manual de torneo oficial', () => {
  it('tiene las dos pestañas con anclas únicas', () => {
    const usoIds = MANUAL_USO.map(b => b.id)
    const reglasIds = MANUAL_REGLAS.map(b => b.id)
    expect(new Set(usoIds).size).toBe(usoIds.length)
    expect(new Set(reglasIds).size).toBe(reglasIds.length)
    expect(usoIds).toEqual(expect.arrayContaining(['inscripcion', 'programa', 'grupos', 'llaves', 'dia']))
    expect(reglasIds).toEqual(expect.arrayContaining(['grupos-reglas', 'puntos', 'partido', 'llave-reglas']))
  })

  it('explica puntos ITTF 2 / 1 / 0 en reglas', () => {
    const pts = MANUAL_REGLAS.find(b => b.id === 'puntos')
    const texto = [...(pts?.parrafos ?? []), ...(pts?.pasos ?? [])].join(' ')
    expect(texto).toMatch(/2 puntos/)
    expect(texto).toMatch(/1 punto/)
    expect(texto).toMatch(/0 puntos/)
  })
})
