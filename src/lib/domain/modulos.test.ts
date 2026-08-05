import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODULOS, MODULOS_KEYS, conDependencias } from './modulos'

describe('conDependencias', () => {
  it('descarta claves que no son módulos', () => {
    expect(conDependencias(['torneos', 'inventado', 'liga'])).toEqual(['torneos', 'liga'])
  })

  it('mensualidades arrastra finanzas', () => {
    expect(conDependencias(['mensualidades'])).toEqual(['mensualidades', 'finanzas'])
  })

  it('no duplica finanzas si ya venía marcado', () => {
    expect(conDependencias(['finanzas', 'mensualidades'])).toEqual(['finanzas', 'mensualidades'])
  })

  it('deja pasar los módulos de Recursos, que antes se descartaban en silencio', () => {
    const recursos = ['tienda_buin', 'tienda_asociacion', 'bibliografia', 'libro_profe']
    expect(conDependencias(recursos)).toEqual(recursos)
  })
})

// Este es el chequeo que faltaba. La lista de módulos vivía copiada en el hook,
// en el panel del superadmin y en la Server Action; las copias se
// desincronizaron y los cuatro módulos de Recursos quedaron sin forma de
// activarse. Ahora hay un solo catálogo, pero el sidebar sigue siendo una
// lista aparte: si alguien agrega ahí un `modulo:` nuevo y olvida el catálogo,
// el módulo vuelve a ser inactivable desde el panel. Esto lo caza.
describe('catálogo vs. sidebar', () => {
  it('todo `modulo:` del sidebar existe en el catálogo', () => {
    const layout = readFileSync(join(__dirname, '../../app/layout-app.tsx'), 'utf8')
    const usados = [...layout.matchAll(/modulo:\s*'([a-z_]+)'/g)].map(m => m[1])

    expect(usados.length).toBeGreaterThan(0)
    for (const clave of new Set(usados)) {
      expect(MODULOS_KEYS).toContain(clave)
    }
  })

  it('no hay claves repetidas en el catálogo', () => {
    expect(new Set(MODULOS_KEYS).size).toBe(MODULOS.length)
  })
})
