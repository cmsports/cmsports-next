'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { registrarActividad } from '@/app/actions/actividad'
import { rutaRegistrable, rutaSinParametros } from '@/lib/domain/actividad'

/** Cada cuánto se manda un tramo de permanencia. */
const INTERVALO_MS = 60_000

/** Tope del schema de la Action; se recorta acá para no perder el ping entero. */
const MAX_SEGUNDOS = 300

/**
 * Emite los pings de actividad. No pinta nada.
 *
 * Manda un ping de llegada (segundos = 0) al entrar a cada ruta y después uno
 * cada minuto con el tiempo transcurrido. Esa convención de "0 = visita" es la
 * que usa el ranking de módulos para separar visitas de tiempo, así que los
 * pings periódicos nunca mandan 0.
 *
 * Solo cuenta el tiempo con la pestaña visible: si alguien deja CmSports
 * abierto en una pestaña de fondo toda la tarde, eso no es uso. Al ocultarse se
 * cierra el tramo y al volver se reinicia el reloj.
 *
 * Lo que se pierde a propósito: el último tramo cuando se cierra el navegador
 * de golpe. Se podría rescatar con `sendBeacon` contra un endpoint propio, pero
 * eso obliga a una API route aparte solo para esto. Es telemetría: perder menos
 * de un minuto de vez en cuando no cambia ningún promedio.
 */
export default function RegistroActividad() {
  const pathname = usePathname()
  const desde = useRef(Date.now())

  useEffect(() => {
    const ruta = rutaSinParametros(pathname)
    if (!rutaRegistrable(ruta)) return

    void registrarActividad({ ruta, segundos: 0 })
    desde.current = Date.now()

    function enviarTramo() {
      const segundos = Math.round((Date.now() - desde.current) / 1000)
      desde.current = Date.now()
      if (segundos > 0) void registrarActividad({ ruta, segundos: Math.min(segundos, MAX_SEGUNDOS) })
    }

    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') enviarTramo()
    }, INTERVALO_MS)

    function alCambiarVisibilidad() {
      // Al ocultarse se cierra el tramo; al volver se reinicia el reloj para
      // que el rato en segundo plano no se cuente como uso.
      if (document.visibilityState === 'hidden') enviarTramo()
      else desde.current = Date.now()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      // El tramo que quedó abierto al cambiar de pantalla.
      enviarTramo()
    }
  }, [pathname])

  return null
}
