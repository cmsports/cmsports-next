import { describe, it, expect } from 'vitest'
import {
  ETIQUETAS, TODAS_LAS_CATEGORIAS,
  categoriasGastoDe, categoriasIngresoDe, etiquetaCategoria,
} from './categoriasFinanzas'

describe('categorías de finanzas', () => {
  /**
   * La prueba que protege a Buin, y es la que importa.
   *
   * Las dos listas de abajo están copiadas a mano de lo que `finanzas/page.tsx`
   * ofrecía antes de que este archivo existiera. Si alguien agrega una
   * categoría "para todos" en vez de sumarla a los EXTRA, esto falla — que es
   * exactamente lo que tiene que pasar: le habría cambiado el formulario de
   * plata a un club en producción sin querer.
   */
  it('sin el módulo, las listas son las de siempre', () => {
    expect(categoriasIngresoDe(false)).toEqual([
      'mensualidad', 'matricula', 'inscripcion_torneo', 'inscripcion_liga',
      'arriendo_cancha', 'donacion', 'otro_ingreso',
    ])
    expect(categoriasGastoDe(false)).toEqual([
      'sueldo_profesor', 'sueldo_staff', 'arriendo_cancha', 'material_deportivo',
      'servicios_basicos', 'mantenimiento', 'otro_gasto',
    ])
  })

  it('con el módulo, las de siempre van primero y las nuevas al final', () => {
    const conModulo = categoriasIngresoDe(true)
    expect(conModulo.slice(0, 7)).toEqual(categoriasIngresoDe(false))
    expect(conModulo).toContain('arriendo_mesa')
    expect(conModulo).toContain('auspicio')
    expect(categoriasGastoDe(true)).toContain('premio_liga')
    expect(categoriasGastoDe(true)).toContain('marketing')
  })

  it('el arriendo de mesa es una categoría distinta de la de cancha', () => {
    // El club arrienda mesas sueltas y también la sala entera. Mezclarlas
    // hace que el reporte por línea de negocio no signifique nada.
    expect(categoriasIngresoDe(true)).toContain('arriendo_cancha')
    expect(categoriasIngresoDe(true)).toContain('arriendo_mesa')
  })

  it('toda categoría que se puede elegir tiene su etiqueta en español', () => {
    // Sin esto la pantalla de plata muestra "venta_articulos" a un club.
    for (const clave of TODAS_LAS_CATEGORIAS) {
      expect(ETIQUETAS[clave], `falta la etiqueta de ${clave}`).toBeTruthy()
    }
  })

  it('una categoría vieja o desconocida se muestra, no desaparece', () => {
    expect(etiquetaCategoria('categoria_de_2024')).toBe('categoria_de_2024')
    expect(etiquetaCategoria('mensualidad')).toBe('Mensualidad')
  })

  it('el servidor acepta todo lo que alguna pantalla puede ofrecer', () => {
    for (const clave of [...categoriasIngresoDe(true), ...categoriasGastoDe(true)]) {
      expect(TODAS_LAS_CATEGORIAS as readonly string[]).toContain(clave)
    }
  })
})
