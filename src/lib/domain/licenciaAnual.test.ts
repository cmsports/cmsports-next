import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { definicionDe, valorPorDefecto } from './clubConfig'
import { etiquetaCategoria } from './categoriasFinanzas'
import { MODULOS_FALLBACK, MODULOS_HABILITACION_EXPLICITA } from './modulos'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

describe('licencia anual (migración 301)', () => {
  const migracion = leer('supabase/migrations/301_licencia_anual_buin.sql')
  const accion = leer('src/app/actions/jugadores.ts')

  it('el año por defecto es el mismo en el catálogo y en la base', () => {
    // Son dos números en dos lenguajes: si se separan, la ficha ofrece un año
    // y el RPC exige otro, y nadie puede confirmar ninguna licencia.
    const def = definicionDe('licencia.anio')
    expect(valorPorDefecto('licencia.anio')).toBe(2027)
    const anioCobro = migracion.slice(migracion.indexOf('FUNCTION public._licencia_anio_cobro'))
    expect(anioCobro).toContain(`RETURN ${def.defecto};`)
    expect(anioCobro).toContain(`v_num < ${def.min} OR v_num > ${def.max}`)
  })

  it('la migración apunta a Buin y no queda para todos los clubes', () => {
    expect(migracion).toContain("SELECT _migracion_nueva('301_licencia_anual_buin');")
    expect(migracion).toContain("SELECT _migracion_para_club('Asociación TDM Buin y Paine');")
    expect(migracion).not.toContain('_migracion_para_todos_los_clubes')
  })

  it('el módulo no se enciende solo en otros clubes, ni con la red caída', () => {
    expect(MODULOS_HABILITACION_EXPLICITA).toContain('licencia_anual')
    expect(MODULOS_FALLBACK).not.toContain('licencia_anual')
  })

  it('el RPC solo crea movimiento si entró plata, con la descripción pedida', () => {
    const cuerpo = migracion.slice(migracion.indexOf('FUNCTION public.registrar_pago_licencia_atomico'))
    expect(cuerpo).toContain('IF p_monto > 0 THEN')
    expect(cuerpo).toContain("'Pago licencia año ' || p_anio || ' — ' || v_nombre")
    expect(cuerpo).toContain('INSERT INTO public.audit_log')
    expect(cuerpo).toContain('Jugador no encontrado en el club')
  })

  it('el RPC rechaza un año distinto del que el admin está cobrando', () => {
    const cuerpo = migracion.slice(migracion.indexOf('FUNCTION public.registrar_pago_licencia_atomico'))
    expect(cuerpo).toContain('p_anio IS DISTINCT FROM v_anio_cobro')
  })

  it('la tabla está publicada en realtime', () => {
    // Sin esto la ficha y el filtro escuchan y no reciben nada (CLAUDE.md).
    expect(migracion).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.licencias_pagadas;')
  })

  it('las acciones pasan por los RPC, no escriben la tabla suelta', () => {
    const desde = accion.indexOf('export async function registrarLicencia')
    const bloque = accion.slice(desde)
    expect(bloque).toContain("rpc('registrar_pago_licencia_atomico'")
    expect(bloque).toContain("rpc('desmarcar_licencia_atomico'")
    expect(bloque).not.toContain("from('licencias_pagadas')")
    expect(bloque).not.toContain("from('movimientos')")
  })

  it('anular el pago borra también su ingreso, así volver a marcar no lo duplica (302)', () => {
    const m302 = leer('supabase/migrations/302_licencia_anular_pago.sql')
    expect(m302).toContain("SELECT _migracion_nueva('302_licencia_anular_pago');")
    const desmarcar = m302.slice(m302.indexOf('FUNCTION public.desmarcar_licencia_atomico'))
    expect(desmarcar).toContain('DELETE FROM public.movimientos WHERE id = v_fila.movimiento_id AND club_id = v_club_id')
    expect(desmarcar).toContain("'movimientos', v_fila.movimiento_id, 'eliminar', v_mov")
  })

  it('el candado de Finanzas envuelve la regla de producción en vez de reescribirla', () => {
    // El repo va atrás de la base: reescribir `_movimiento_editable` desde la
    // copia de la 105 podría borrar una regla que solo está en producción.
    const m302 = leer('supabase/migrations/302_licencia_anular_pago.sql')
    expect(m302).toContain('ALTER FUNCTION public._movimiento_editable(uuid, uuid) RENAME TO _movimiento_editable_base;')
    expect(m302).toContain('RETURN public._movimiento_editable_base(p_movimiento_id, p_club_id);')
    expect(m302).not.toContain('CREATE OR REPLACE FUNCTION public._movimiento_editable(')
  })

  it('el movimiento se lee como "Licencia" en Finanzas, no con la clave cruda', () => {
    expect(etiquetaCategoria('licencia')).toBe('Licencia')
  })
})
