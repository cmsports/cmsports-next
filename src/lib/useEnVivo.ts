'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { invalidarPorTabla } from '@/lib/query-cache'

const supabase = createClient()

/**
 * Mantiene una pantalla al día sin que nadie tenga que recargar.
 *
 * Escucha los cambios de las tablas indicadas y vuelve a cargar. Dos cosas que
 * parecen detalles y no lo son:
 *
 * Filtra por club siempre que la tabla tenga `club_id`. Hay cuatro clubes en la
 * misma base, y sin el filtro un cambio en cualquiera recargaba las pantallas
 * de todos.
 *
 * Agrupa las ráfagas. Pasar lista son veinte clics seguidos y cada uno vuelve
 * por acá; sin esperar a que la ráfaga termine serían veinte recargas de la
 * lista completa en un minuto. 250ms alcanza a agrupar dos clics rápidos
 * (los del profe caen cada 300-500ms) y deja el delay entre pestañas por
 * debajo del cuarto de segundo, que es lo que se pedía notar.
 */
export function useEnVivo(
  tablas: string[],
  clubId: string | null,
  recargar: () => void,
  opciones: { conClub?: string[]; esperaMs?: number } = {},
) {
  const { conClub = [], esperaMs = 250 } = opciones

  // La función de recarga se rearma en cada render. Guardarla en una referencia
  // evita volver a suscribirse cada vez, y se actualiza en un efecto porque
  // tocar una referencia durante el render no está permitido.
  const alCambiar = useRef(recargar)
  useEffect(() => { alCambiar.current = recargar })

  const clave = tablas.join(',')
  const claveClub = conClub.join(',')

  useEffect(() => {
    if (!clubId || tablas.length === 0) return

    let pendiente: ReturnType<typeof setTimeout> | null = null
    const canal = supabase.channel(`envivo-${clubId}-${clave}`)

    for (const tabla of clave.split(',')) {
      canal.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        claveClub.split(',').includes(tabla)
          ? { event: '*', schema: 'public', table: tabla, filter: `club_id=eq.${clubId}` }
          : { event: '*', schema: 'public', table: tabla },
        () => {
          // El caché se tira en el acto, no dentro de la espera: si algo lee
          // mientras dura la ráfaga, tiene que leer datos nuevos. La recarga sí
          // espera, que es lo caro.
          invalidarPorTabla(tabla)
          if (pendiente) clearTimeout(pendiente)
          pendiente = setTimeout(() => alCambiar.current(), esperaMs)
        },
      )
    }

    canal.subscribe()
    return () => {
      if (pendiente) clearTimeout(pendiente)
      void supabase.removeChannel(canal)
    }
  }, [clubId, clave, claveClub, esperaMs, tablas.length])
}
