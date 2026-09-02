'use client'

import { createClient } from '@/lib/supabase/client'
import { cachedFetch } from '@/lib/query-cache'
import {
  CONFIG_POR_DEFECTO,
  crearLectorConfig,
  type FilaConfig,
  type LectorConfig,
} from '@/lib/domain/clubConfig'

const supabase = createClient()

/**
 * La configuración de un club, lista para consultar.
 *
 *     const config = await configDelClub(clubId)
 *     if (config('cupos.modo') === 'por_mesas') { … }
 *
 * ── Por qué esta función y no la consulta suelta ────────────────────────
 *
 * Es la única puerta a `club_config`. Si cada pantalla consultara la tabla por
 * su cuenta, cada una tendría que acordarse de qué hacer cuando la fila no
 * está (usar el default), cuando el valor está mal escrito (usar el default) y
 * cuando la red se cae (usar el default). Tres oportunidades por pantalla de
 * equivocarse en algo que cambia cómo se calcula el cupo o la cuota.
 *
 * ── Qué pasa si esto falla ──────────────────────────────────────────────
 *
 * Devuelve los defaults, que son el comportamiento actual. Eso hace que el
 * peor caso de un corte de red sea "el club se comporta como Buin", que es
 * exactamente lo que hacía antes de que la configuración existiera.
 *
 * Es al revés que `useModulos`, que ante un error muestra TODOS los módulos:
 * ahí lo permisivo es mostrar de más, porque esconder el menú entero se ve
 * como una pantalla rota. Acá lo seguro es lo contrario —no encender solo un
 * bloqueo por morosidad, no cambiar solo un cálculo de plata— y por eso el
 * fallback es el default y no lo último que se vio.
 *
 * ── El caché ────────────────────────────────────────────────────────────
 *
 * Declara `club_config` como su tabla de origen, así `useEnVivo` lo tira solo
 * cuando alguien cambia la configuración. La migración 248 ya publicó la tabla
 * en `supabase_realtime`; sin eso el aviso no llegaría nunca y el caché
 * serviría lo viejo hasta que venciera el TTL.
 */
export async function configDelClub(clubId: string | null | undefined): Promise<LectorConfig> {
  if (!clubId) return CONFIG_POR_DEFECTO

  try {
    const filas = await cachedFetch<FilaConfig[]>(
      `club-config:${clubId}`,
      async () => {
        const { data, error } = await supabase
          .from('club_config')
          .select('clave, valor')
          .eq('club_id', clubId)

        // Una lectura que falla NO lanza en Supabase: devuelve `{ error }`. Sin
        // esta línea, `data` llega en null, el lector se arma vacío y el club
        // se comporta con los defaults sin que nadie se entere de que su
        // configuración no se pudo leer. Que es lo mismo que pasa igual, pero
        // se quiere ver en la consola.
        if (error) throw new Error(error.message)

        return (data ?? []) as FilaConfig[]
      },
      5 * 60_000, // La configuración cambia muy de vez en cuando.
      ['club_config'],
    )

    return crearLectorConfig(filas)
  } catch (e) {
    console.error('[club_config] no se pudo leer; se usan los valores por defecto.', e)
    return CONFIG_POR_DEFECTO
  }
}
