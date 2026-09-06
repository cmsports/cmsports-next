'use client'

/**
 * Quiénes están inactivos hoy — calculado, no guardado.
 *
 * El club pidió marcar "inactivo" al alumno que lleva 60 días sin asistir ni
 * pagar. Se **calcula** en vez de escribirse como un tercer valor de
 * `jugadores.estado`, y la razón es concreta: `dashboard_kpis()` y `v_morosos`
 * filtran `estado = 'activo'`. Un tercer estado les cambiaría el denominador a
 * los seis clubes de golpe —incluido Buin— y ese es exactamente el bug que la
 * migración 209 tuvo que arreglar. Calculado, la etiqueta aparece donde hace
 * falta y ninguna cuenta existente se mueve.
 *
 * El umbral vive en `retencion.dias_inactivo` y su **default es 0 = nunca**, así
 * que un club que no lo configuró recibe un Set vacío y no ve ninguna etiqueta.
 * La misma regla y la misma función de dominio que usa el panel de retención
 * (`debeMarcarseInactivo`): un solo criterio, tres pantallas.
 */

import { createClient } from '@/lib/supabase/client'
import { configDelClub } from '@/lib/supabase/clubConfig'
import { fechaChile } from '@/lib/domain/fechaChile'
import { debeMarcarseInactivo, diasSinMovimiento } from '@/lib/domain/retencion'

const supabase = createClient()

/**
 * Cuánta asistencia se mira hacia atrás.
 *
 * Un año, no los 60 días del umbral. Y no es de más: `diasSinMovimiento`
 * devuelve `null` cuando no encuentra NINGUNA señal de vida, y `null` significa
 * "no tengo el dato" —un alumno recién inscrito— y no cuenta como inactivo. Con
 * una ventana de 60 días, el que hace 61 que no viene se queda sin marcas, cae
 * en `null` y **no** se marca: justo al revés de lo que el club quiere.
 *
 * ponytail: un año alcanza para todos los casos reales. Al que lleva más de un
 * año sin venir Y nunca pagó tampoco lo agarra; si algún día importa, la salida
 * es comparar contra su fecha de ingreso, no agrandar la ventana.
 */
const VENTANA_DIAS = 365

function restarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

export async function idsInactivos(clubId: string): Promise<Set<string>> {
  const vacio = new Set<string>()
  if (!clubId) return vacio

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const db = supabase as any
  const hoy = fechaChile()

  const [config, marcas, pagos] = await Promise.all([
    configDelClub(clubId),
    // Solo 'presente': la tabla guarda también las faltas, y una falta no es
    // una señal de vida — es lo contrario.
    db.from('asistencia').select('jugador_id, fecha')
      .eq('club_id', clubId).eq('estado', 'presente')
      .gte('fecha', restarDias(hoy, VENTANA_DIAS)),
    db.from('mensualidades').select('jugador_id, fecha_pago')
      .eq('club_id', clubId).not('fecha_pago', 'is', null),
  ])

  // Una consulta que falla devuelve `data` en null, y sin esto todos los
  // jugadores quedarían sin señales de vida y la pantalla los marcaría
  // inactivos a todos. Acusar a un club entero porque se cayó la red es peor
  // que no mostrar la etiqueta.
  if (marcas.error || pagos.error) {
    console.error('[inactivos] no se pudo calcular', marcas.error ?? pagos.error)
    return vacio
  }

  const ultima = new Map<string, string>()
  const guardarMax = (id: string, fecha: string | null | undefined) => {
    if (!id || !fecha) return
    const f = fecha.slice(0, 10)
    const previo = ultima.get(id)
    if (!previo || f > previo) ultima.set(id, f)
  }

  for (const m of (marcas.data ?? []) as any[]) guardarMax(m.jugador_id, m.fecha)
  for (const p of (pagos.data ?? []) as any[]) guardarMax(p.jugador_id, p.fecha_pago)

  const inactivos = new Set<string>()
  for (const [id, fecha] of ultima) {
    const dias = diasSinMovimiento({ ultimaAsistenciaISO: fecha, hoyISO: hoy })
    if (debeMarcarseInactivo(config, dias)) inactivos.add(id)
  }
  return inactivos
}
