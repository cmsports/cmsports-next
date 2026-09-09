import { describe, it, expect } from 'vitest'
import {
  MODALIDADES,
  MODALIDAD_POR_DEFECTO,
  fasesDeSets,
  minParticipantes,
  modalidadDe,
  modalidadesDisponibles,
  moduloDe,
  puedeUsarModalidad,
  ruedasDe,
  usaCabezasSerie,
  usaRuedas,
} from './modalidadTorneo'
import { MODULOS_KEYS } from './modulos'

/** Un club con todos los módulos encendidos. */
const conTodo = () => true
/** Un club sin ningún módulo opcional: Buin el día de hoy. */
const sinNada = () => false

describe('la modalidad por defecto es lo que el sistema hizo siempre', () => {
  it('es grupos', () => {
    expect(MODALIDAD_POR_DEFECTO).toBe('grupos')
  })

  // La columna `torneos.formato` es NOT NULL con default 'grupos' desde la
  // migración 264, y los 10 torneos que existían ya decían eso. Si alguien
  // cambia el default de este módulo, un torneo viejo cambiaría de modalidad
  // sin que nadie lo tocara.
  it('un torneo sin formato declarado se sigue jugando como siempre', () => {
    expect(modalidadDe(null)).toBe('grupos')
    expect(modalidadDe(undefined)).toBe('grupos')
    expect(modalidadDe('')).toBe('grupos')
  })

  it('un formato desconocido no revienta: cae en el tradicional', () => {
    expect(modalidadDe('suizo')).toBe('grupos')
    expect(modalidadDe('DROP TABLE torneos')).toBe('grupos')
  })

  it('reconoce las cuatro que la base acepta', () => {
    for (const m of MODALIDADES) expect(modalidadDe(m)).toBe(m)
  })
})

describe('quién puede elegir modalidad', () => {
  // Ésta es la prueba que protege a Buin. Su torneo interno es la pantalla que
  // más usa, y la decisión del 2026-09-09 fue dejarla literalmente fuera.
  it('un torneo INTERNO es siempre tradicional, aunque el club tenga todo encendido', () => {
    expect(modalidadesDisponibles({ tipo: 'interno', tiene: conTodo })).toEqual(['grupos'])
  })

  it('un club sin los módulos ve solo el tradicional, aunque sea externo', () => {
    expect(modalidadesDisponibles({ tipo: 'externo', tiene: sinNada })).toEqual(['grupos'])
  })

  it('un torneo externo con los módulos encendidos ve las cuatro', () => {
    expect(modalidadesDisponibles({ tipo: 'externo', tiene: conTodo })).toEqual([...MODALIDADES])
  })

  it('los módulos se piden por separado: liguilla sin equipos', () => {
    const soloModalidades = (m: string) => m === 'torneos_modalidades'
    expect(modalidadesDisponibles({ tipo: 'externo', tiene: soloModalidades }))
      .toEqual(['grupos', 'liguilla', 'eliminacion_consolacion'])
  })

  it('un tipo nulo o desconocido cae en el tradicional', () => {
    expect(modalidadesDisponibles({ tipo: null, tiene: conTodo })).toEqual(['grupos'])
    expect(modalidadesDisponibles({ tipo: undefined, tiene: conTodo })).toEqual(['grupos'])
  })

  // `crearTorneo` recibe lo que le manden: esconder el selector no impide nada.
  it('puedeUsarModalidad rechaza una liguilla en un torneo interno', () => {
    expect(puedeUsarModalidad({ modalidad: 'liguilla', tipo: 'interno', tiene: conTodo })).toBe(false)
    expect(puedeUsarModalidad({ modalidad: 'equipos', tipo: 'interno', tiene: conTodo })).toBe(false)
  })

  it('puedeUsarModalidad acepta el tradicional siempre, sin módulo ninguno', () => {
    expect(puedeUsarModalidad({ modalidad: 'grupos', tipo: 'interno', tiene: sinNada })).toBe(true)
    expect(puedeUsarModalidad({ modalidad: 'grupos', tipo: 'externo', tiene: sinNada })).toBe(true)
  })

  it('puedeUsarModalidad rechaza una modalidad cuyo módulo está apagado', () => {
    expect(puedeUsarModalidad({ modalidad: 'liguilla', tipo: 'externo', tiene: sinNada })).toBe(false)
  })
})

describe('los módulos que declara existen de verdad', () => {
  // Si alguien renombra un módulo en modulos.ts y olvida este catálogo, la
  // modalidad queda inalcanzable: `tiene('torneos_viejo')` nunca da true y el
  // selector no la muestra jamás, sin error ni aviso.
  it('cada módulo citado está en MODULOS_KEYS', () => {
    for (const m of MODALIDADES) {
      const modulo = moduloDe(m)
      if (modulo !== null) expect(MODULOS_KEYS).toContain(modulo)
    }
  })

  it('el tradicional no depende de ningún módulo', () => {
    expect(moduloDe('grupos')).toBeNull()
  })
})

describe('qué cambia según la modalidad', () => {
  it('solo la liguilla se juega en dos ruedas', () => {
    expect(usaRuedas('liguilla')).toBe(true)
    expect(usaRuedas('grupos')).toBe(false)
    expect(usaRuedas('eliminacion_consolacion')).toBe(false)
    expect(usaRuedas('equipos')).toBe(false)
  })

  it('las ruedas se normalizan a lo que el CHECK de la base acepta', () => {
    expect(ruedasDe(2)).toBe(2)
    expect(ruedasDe('2')).toBe(2)
    expect(ruedasDe(1)).toBe(1)
    expect(ruedasDe(null)).toBe(1)
    expect(ruedasDe(99)).toBe(1)
    expect(ruedasDe('muchas')).toBe(1)
  })

  // Con todos contra todos, sembrar no cambia un solo resultado.
  it('la liguilla no usa cabezas de serie; las demás sí', () => {
    expect(usaCabezasSerie('liguilla')).toBe(false)
    expect(usaCabezasSerie('grupos')).toBe(true)
    expect(usaCabezasSerie('eliminacion_consolacion')).toBe(true)
    expect(usaCabezasSerie('equipos')).toBe(true)
  })

  it('el tradicional conserva sus dos selectores de sets, con sus nombres de hoy', () => {
    expect(fasesDeSets('grupos')).toEqual([
      { campo: 'formato_grupos', label: 'Fase de grupos' },
      { campo: 'formato_llave', label: 'Llave (playoffs)' },
    ])
  })

  // El selector viejo preguntaba por "Fase de grupos" y "Llave (playoffs)"
  // siempre. Una liguilla no tiene ninguna de las dos.
  it('la liguilla pregunta una sola vez, y no habla de grupos ni de llave', () => {
    const fases = fasesDeSets('liguilla')
    expect(fases).toHaveLength(1)
    expect(fases[0].label).not.toMatch(/grupo|llave/i)
  })

  it('cada modalidad declara al menos un selector de sets', () => {
    for (const m of MODALIDADES) expect(fasesDeSets(m).length).toBeGreaterThan(0)
  })

  it('ninguna modalidad repite el mismo campo dos veces', () => {
    for (const m of MODALIDADES) {
      const campos = fasesDeSets(m).map(f => f.campo)
      expect(new Set(campos).size).toBe(campos.length)
    }
  })

  it('el mínimo de participantes nunca baja de 2', () => {
    for (const m of MODALIDADES) expect(minParticipantes(m)).toBeGreaterThanOrEqual(2)
  })
})
