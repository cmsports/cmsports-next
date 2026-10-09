'use client'

/**
 * Quiénes tienen confirmada la licencia de un año (migración 301).
 *
 * Una sola consulta para todo el club: la usan la ficha —que mira a un
 * jugador— y el filtro del listado —que mira a todos—. Son pocas filas por
 * año y la misma clave de caché sirve a las dos pantallas.
 *
 * Declara `licencias_pagadas` como tabla de origen, así `useEnVivo` tira el
 * caché en cuanto alguien confirma o desmarca una licencia.
 *
 * A diferencia de `configDelClub`, un error acá SÍ se lanza: devolver un Map
 * vacío haría que el filtro "no han pagado" mostrara a todo el club como
 * deudor, que es justo el dato equivocado que no hay que inventar.
 */

import { createClient } from '@/lib/supabase/client'
import { cachedFetch } from '@/lib/query-cache'

const supabase = createClient()

export type LicenciaPagada = { monto: number; fecha: string }

export async function licenciasDelClub(clubId: string, anio: number): Promise<Map<string, LicenciaPagada>> {
  const filas = await cachedFetch<{ jugador_id: string; monto: number; fecha: string }[]>(
    `licencias:${clubId}:${anio}`,
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('licencias_pagadas')
        .select('jugador_id, monto, fecha').eq('club_id', clubId).eq('anio', anio)
      if (error) throw new Error(error.message)
      return data ?? []
    },
    60_000,
    ['licencias_pagadas'],
  )
  return new Map(filas.map(f => [f.jugador_id, { monto: f.monto, fecha: f.fecha }]))
}
