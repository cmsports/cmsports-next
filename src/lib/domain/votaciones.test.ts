import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  enCategoria, idsDeSeleccion, votacionesPendientes, edadCumplida, enRangoDeEdad, sinFechaDeNacimiento, idsDeEdicion, validarEdicion, validarCreacion, porcentajeDeVotos, ganadores, resumenSeleccion,
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
  ({ modo: 'categorias', categorias: new Set(), jugadores: new Set(), edadMin: null, edadMax: null, ...s })

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

describe('editar una votación', () => {
  it('quien ya votó queda en la lista aunque la selección no lo incluya', () => {
    const ids = idsDeEdicion(jugadores, sel({ modo: 'jugadores', jugadores: new Set(['a']) }), new Set(['b']))
    expect(ids.sort()).toEqual(['a', 'b'])
  })
  it('no repite a quien ya votó y además está seleccionado', () => {
    const ids = idsDeEdicion(jugadores, sel({ modo: 'jugadores', jugadores: new Set(['a', 'b']) }), new Set(['b']))
    expect(ids.sort()).toEqual(['a', 'b'])
  })
  it('sacar a alguien que no votó lo saca de la lista', () => {
    expect(idsDeEdicion(jugadores, sel({ modo: 'jugadores', jugadores: new Set(['a']) }), new Set())).toEqual(['a'])
  })
  it('pide nombre, y votantes solo si se están cambiando', () => {
    expect(validarEdicion({ titulo: '  ', votantes: null })).toMatch(/nombre/)
    expect(validarEdicion({ titulo: 'X', votantes: [] })).toMatch(/votar/)
    expect(validarEdicion({ titulo: 'X', votantes: null })).toBeNull()
    expect(validarEdicion({ titulo: 'X', votantes: ['a'] })).toBeNull()
  })
})

describe('migración 304', () => {
  const sql = leer('supabase/migrations/304_votaciones_editar.sql')
  it('lleva los dos portazos y es solo para Buin', () => {
    expect(sql).toContain("_migracion_nueva('304_votaciones_editar')")
    expect(sql).toContain("_migracion_para_club('Asociación TDM Buin y Paine')")
  })
  it('no deja quitar a quien ya votó y bloquea la fila contra un voto simultáneo', () => {
    expect(sql).toContain('No se puede quitar a quien ya votó')
    expect(sql).toContain('FOR UPDATE')
  })
  it('las dos funciones se cierran a anon', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.editar_votacion_atomico(uuid, text, text, uuid[]) FROM PUBLIC, anon')
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.votantes_de_votacion(uuid) FROM PUBLIC, anon')
  })
})

describe('filtrar por edad', () => {
  const hoy = '2026-10-25'
  it('cuenta el cumpleaños: quien cumple mañana todavía tiene un año menos', () => {
    expect(edadCumplida('2012-10-25', hoy)).toBe(14)
    expect(edadCumplida('2012-10-26', hoy)).toBe(13)
    expect(edadCumplida('2012-12-31', hoy)).toBe(13)
    expect(edadCumplida('2012-01-01', hoy)).toBe(14)
  })
  it('sin fecha, con basura o con fecha futura no hay edad', () => {
    expect(edadCumplida(null, hoy)).toBeNull()
    expect(edadCumplida('', hoy)).toBeNull()
    expect(edadCumplida('no-es-fecha', hoy)).toBeNull()
    expect(edadCumplida('2030-01-01', hoy)).toBeNull()
  })
  it('el rango incluye los dos extremos y un lado vacío es sin tope', () => {
    expect(enRangoDeEdad(10, 10, 13)).toBe(true)
    expect(enRangoDeEdad(13, 10, 13)).toBe(true)
    expect(enRangoDeEdad(14, 10, 13)).toBe(false)
    expect(enRangoDeEdad(14, null, 13)).toBe(false)
    expect(enRangoDeEdad(3, null, 13)).toBe(true)
    expect(enRangoDeEdad(40, 18, null)).toBe(true)
  })
  it('sin ningún extremo no entra nadie, y sin edad tampoco', () => {
    expect(enRangoDeEdad(10, null, null)).toBe(false)
    expect(enRangoDeEdad(null, 0, 120)).toBe(false)
  })
  const con = (id: string, estado: string, fecha: string | null): JugadorVotacion =>
    ({ id, nombre: id, estado, categoria: 'X', fecha_nacimiento: fecha })
  const lista = [
    con('menor', 'activo', '2015-03-01'),      // 11
    con('limite', 'activo', '2012-10-26'),     // 13, cumple 14 mañana
    con('mayor', 'activo', '2012-10-25'),      // 14
    con('retirado', 'inactivo', '2015-03-01'), // 11 pero inactivo
    con('sinFecha', 'activo', null),
  ]
  it('"menores de 14" toma los activos de 0 a 13 y deja fuera al que no tiene fecha', () => {
    const r = idsDeSeleccion(lista, sel({ modo: 'edad', edadMax: 13 }), hoy)
    expect(r.sort()).toEqual(['limite', 'menor'])
  })
  it('un rango vacío no toma a nadie', () => {
    expect(idsDeSeleccion(lista, sel({ modo: 'edad' }), hoy)).toEqual([])
  })
  it('avisa cuántos activos no se pueden ubicar por edad', () => {
    expect(sinFechaDeNacimiento(lista)).toBe(1)
  })
})

describe('aviso de votaciones pendientes en Mi perfil', () => {
  const vs = [
    { id: 'abierta-sin-votar', estado: 'abierta' },
    { id: 'abierta-votada', estado: 'abierta' },
    { id: 'cerrada', estado: 'cerrada' },
  ]
  it('solo las abiertas en las que todavía no vota', () => {
    expect(votacionesPendientes(vs, new Set(['abierta-votada'])).map(v => v.id)).toEqual(['abierta-sin-votar'])
  })
  it('sin votaciones o con todo votado no hay aviso', () => {
    expect(votacionesPendientes([], new Set())).toEqual([])
    expect(votacionesPendientes(vs, new Set(['abierta-sin-votar', 'abierta-votada']))).toEqual([])
  })
  it('el perfil lo muestra solo con el módulo encendido', () => {
    const perfil = leer('src/app/perfil/page.tsx')
    expect(perfil).toContain("tiene('votaciones') && perfil?.club_id && <AvisoVotacionesPendientes")
  })
})
