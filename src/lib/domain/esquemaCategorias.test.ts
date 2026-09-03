import { describe, it, expect } from 'vitest'
import { esquemaCategoriasDe } from './esquemaCategorias'
import { crearLectorConfig, CONFIG_POR_DEFECTO } from './clubConfig'
import { CLUB_ID_BUIN } from './clubSlug'

const spinhouse = crearLectorConfig([{ clave: 'categorias.esquema', valor: 'spinhouse' }])

describe('sin configuración, todo se comporta como antes', () => {
  /**
   * La prueba que protege a Buin.
   *
   * La clave nació en `'auto'` justamente para esto: un club sin fila en
   * `club_config` tiene que recibir exactamente el mismo esquema que recibía
   * antes de que la clave existiera.
   */
  it('Buin sigue con sus categorías de siempre', () => {
    const sinConfig = esquemaCategoriasDe(CLUB_ID_BUIN)
    const conDefault = esquemaCategoriasDe(CLUB_ID_BUIN, CONFIG_POR_DEFECTO)

    expect(sinConfig.opciones).toContain('PENECA')
    expect(sinConfig.opciones).toContain('MASTER J')
    expect(conDefault.opciones).toEqual(sinConfig.opciones)
  })

  it('Buin sigue sugiriendo por año de nacimiento', () => {
    const esquema = esquemaCategoriasDe(CLUB_ID_BUIN, CONFIG_POR_DEFECTO)
    expect(esquema.sugerirPorFechaNacimiento?.('2013-05-20')).toBe('PREINFANTIL')
  })

  it('un club cualquiera recibe el genérico', () => {
    expect(esquemaCategoriasDe('otro-club-id').opciones).toEqual(['principiante', 'intermedio', 'avanzado'])
  })
})

describe('Spinhouse: Adultos y Menores', () => {
  /**
   * Los nombres tienen que ser EXACTAMENTE los que ya están en la base: 34
   * jugadores en "Adultos" y 16 en "Menores". Un "Adulto" en singular deja a
   * 34 fichas con una categoría que no figura entre las opciones, y el primer
   * guardado se la cambia sin que nadie lo note.
   */
  it('ofrece los dos grupos que el club ya usa, con ese nombre exacto', () => {
    expect(esquemaCategoriasDe(null, spinhouse).opciones).toEqual(['Adultos', 'Menores'])
  })

  it('no ofrece las categorías federadas: ese es otro eje', () => {
    const opciones = esquemaCategoriasDe(null, spinhouse).opciones
    expect(opciones).not.toContain('U11')
    expect(opciones).not.toContain('Senior')
  })

  it('no ofrece las genéricas, que es de donde salió el "principiante" suelto', () => {
    expect(esquemaCategoriasDe(null, spinhouse).opciones).not.toContain('principiante')
  })

  it.each([
    ['2020-01-01', 'Menores'],
    ['2012-06-15', 'Menores'],
    ['1988-03-02', 'Adultos'],
    ['1950-01-01', 'Adultos'],
  ])('%s → %s', (nacimiento, esperado) => {
    expect(esquemaCategoriasDe(null, spinhouse).sugerirPorFechaNacimiento?.(nacimiento)).toBe(esperado)
  })

  it('sin fecha de nacimiento no sugiere nada', () => {
    // Caer en "Adultos" por defecto metería a un niño en el grupo de adultos
    // por un campo vacío.
    expect(esquemaCategoriasDe(null, spinhouse).sugerirPorFechaNacimiento?.('')).toBeNull()
  })
})

describe('la configuración manda sobre el club', () => {
  it('un club puede pedir el genérico aunque tenga esquema propio', () => {
    const config = crearLectorConfig([{ clave: 'categorias.esquema', valor: 'generico' }])
    expect(esquemaCategoriasDe(CLUB_ID_BUIN, config).opciones).toEqual(['principiante', 'intermedio', 'avanzado'])
  })

  it('un valor desconocido cae al genérico, no revienta', () => {
    // `normalizarValor` ya descarta lo que no está en las opciones, pero la
    // pantalla no puede quedar en blanco ni aunque se cuele algo raro.
    const config = crearLectorConfig([{ clave: 'categorias.esquema', valor: 'esquema_que_no_existe' }])
    expect(esquemaCategoriasDe(CLUB_ID_BUIN, config).opciones).toContain('PENECA')
  })
})
