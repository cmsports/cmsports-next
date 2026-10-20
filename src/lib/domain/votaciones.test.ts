import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  enCategoria, idsDeSeleccion, validarCreacion, porcentajeDeVotos, ganadores, resumenSeleccion,
  type JugadorVotacion, type Seleccion,
} from './votaciones'
import { puestosDeVotacion } from '@/lib/votaciones-pdf'
import { MODULOS_FALLBACK, MODULOS_HABILITACION_EXPLICITA } from './modulos'
import { moduloRequeridoPorRuta } from '@/lib/auth/modulos-rutas'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

const j = (id: string, estado: string, categoria: string, categorias?: string[]): JugadorVotacion =>
  ({ id, nombre: id, estado, categoria, categorias })

const jugadores = [
  j('a', 'activo', 'INFANTIL', ['INFANTIL', 'TC']),
  j('b', 'activo', 'JUVENIL'),
  j('c', 'inactivo', 'INFANTIL'),
  j('d', 'activo', 'PENECA', []),
]
const sel = (s: Partial<Seleccion>): Seleccion =>
  ({ modo: 'categorias', categorias: new Set(), jugadores: new Set(), ...s })

describe('quién entra en cada lista', () => {
  it('una categoría toma solo a los activos', () => {
    expect(idsDeSeleccion(jugadores, sel({ categorias: new Set(['INFANTIL']) }))).toEqual(['a'])
  })
  it('un jugador en varias categorías entra por cualquiera de ellas', () => {
    expect(enCategoria(jugadores[0], 'TC')).toBe(true)
    expect(idsDeSeleccion(jugadores, sel({ categorias: new Set(['TC']) }))).toEqual(['a'])
  })
  it('sin la lista `categorias` manda la categoría suelta', () => {
    expect(enCategoria(jugadores[3], 'PENECA')).toBe(true)
  })
  it('"todos" son los activos', () => {
    expect(idsDeSeleccion(jugadores, sel({ modo: 'todos' }))).toEqual(['a', 'b', 'd'])
  })
  it('los elegidos uno por uno entran aunque estén inactivos, y se ignora lo que no existe', () => {
    expect(idsDeSeleccion(jugadores, sel({ modo: 'jugadores', jugadores: new Set(['c', 'fantasma']) }))).toEqual(['c'])
  })
  it('sin categorías marcadas no entra nadie', () => {
    expect(idsDeSeleccion(jugadores, sel({}))).toEqual([])
  })
  it('el resumen concuerda en singular y plural', () => {
    expect(resumenSeleccion(0, 'votantes')).toBe('Sin votantes todavía')
    expect(resumenSeleccion(1, 'candidatos')).toBe('1 candidato')
    expect(resumenSeleccion(3, 'votantes')).toBe('3 votantes')
  })
})

describe('validarCreacion', () => {
  const base = { titulo: 'Mejor compañero', tipo: 'jugadores' as const, votantes: ['a'], candidatos: ['a', 'b'], opciones: [] }
  it('acepta una votación completa', () => expect(validarCreacion(base)).toBeNull())
  it('pide nombre, votantes y al menos dos candidatos', () => {
    expect(validarCreacion({ ...base, titulo: '  ' })).toMatch(/nombre/)
    expect(validarCreacion({ ...base, votantes: [] })).toMatch(/votar/)
    expect(validarCreacion({ ...base, candidatos: ['a'] })).toMatch(/dos candidatos/)
  })
  it('en opciones propias cuenta solo las distintas y no vacías', () => {
    const o = { ...base, tipo: 'opciones' as const, candidatos: [] }
    expect(validarCreacion({ ...o, opciones: ['Sábado', ' sábado ', ''] })).toMatch(/dos opciones/)
    expect(validarCreacion({ ...o, opciones: ['Sábado', 'Domingo'] })).toBeNull()
  })
})

describe('resultados', () => {
  it('el porcentaje es 0 mientras no vote nadie', () => {
    expect(porcentajeDeVotos(0, 0)).toBe(0)
    expect(porcentajeDeVotos(1, 3)).toBe(33)
  })
  it('con empate en el primer lugar devuelve a todos los empatados; sin votos, a nadie', () => {
    const o = (id: string, votos: number) => ({ id, texto: id, votos })
    expect(ganadores([o('x', 3), o('y', 3), o('z', 1)]).map(g => g.id)).toEqual(['x', 'y'])
    expect(ganadores([o('x', 0), o('y', 0)])).toEqual([])
  })
  it('los puestos del PDF comparten número en un empate y el siguiente salta', () => {
    expect(puestosDeVotacion([5, 5, 3, 0])).toEqual([1, 1, 3, 4])
  })
})

describe('módulo y migración 303', () => {
  const migracion = leer('supabase/migrations/303_votaciones_buin.sql')
  const acciones = leer('src/app/actions/votaciones.ts')

  it('nace apagado: requiere habilitación explícita y no entra por el fallback', () => {
    expect(MODULOS_HABILITACION_EXPLICITA).toContain('votaciones')
    expect(MODULOS_FALLBACK).not.toContain('votaciones')
  })
  it('la ruta depende del módulo', () => {
    expect(moduloRequeridoPorRuta('/votaciones')).toBe('votaciones')
  })
  it('apunta a Buin y trae los dos portazos', () => {
    expect(migracion).toContain("SELECT _migracion_nueva('303_votaciones_buin');")
    expect(migracion).toContain("SELECT _migracion_para_club('Asociación TDM Buin y Paine');")
    expect(migracion).not.toContain('_migracion_para_todos_los_clubes')
  })
  it('un voto por jugador lo garantiza la base', () => {
    expect(migracion).toContain('UNIQUE (votacion_id, votante_jugador_id)')
  })
  it('el voto es secreto: ninguna política lee votos ajenos y la tabla no se publica', () => {
    const politicas = migracion.slice(migracion.indexOf('CREATE POLICY votacion_votos_lee_el_propio'))
    expect(politicas.slice(0, politicas.indexOf(';'))).toContain('votante_jugador_id = public.get_my_jugador_id()')
    expect(migracion).not.toContain('ADD TABLE public.votacion_votos')
    // Quien lee los resultados no recibe quién votó por quién.
    const res = migracion.slice(migracion.indexOf('FUNCTION public.resultados_votacion'))
    // Quiénes votaron sale solo como nombres, sin la opción elegida.
    expect(res).toContain('SELECT j.nombre FROM public.votacion_votos v')
    const retorno = res.slice(res.indexOf('RETURN jsonb_build_object('))
    expect(retorno).toContain("'votaron', v_votaron")
    expect(retorno).not.toMatch(/votante_jugador_id|opcion_id/)
  })
  it('las tablas visibles están publicadas en realtime (CLAUDE.md, 121 y 142)', () => {
    expect(migracion).toContain('ADD TABLE public.votaciones;')
    expect(migracion).toContain('ADD TABLE public.votacion_opciones;')
  })
  it('votar valida que esté abierta, que el votante esté habilitado y que no sea él mismo', () => {
    const cuerpo = migracion.slice(migracion.indexOf('FUNCTION public.votar_atomico'))
    expect(cuerpo).toContain("v_estado <> 'abierta'")
    expect(cuerpo).toContain('FROM public.votacion_votantes')
    expect(cuerpo).toContain('No puedes votar por ti mismo')
    expect(cuerpo).toContain('Ya votaste en esta votación')
  })
  it('las acciones pasan por los RPC y no escriben las tablas sueltas', () => {
    for (const rpc of ['crear_votacion_atomico', 'cambiar_estado_votacion_atomico', 'eliminar_votacion_atomico', 'votar_atomico', 'resultados_votacion']) {
      expect(acciones).toContain(`rpc('${rpc}'`)
    }
    expect(acciones).not.toMatch(/from\('votacion/)
  })
})
