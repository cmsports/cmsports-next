'use client'

import { useEffect, useState } from 'react'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { configDelClub } from '@/lib/supabase/clubConfig'

/**
 * Si quien mira puede operar los torneos del club (crear, armar grupos,
 * cargar resultados, inscribir).
 *
 * Admin siempre. Profesor solo donde el club encendió
 * `profe.gestiona_torneos`; el default de la clave es `'no'`, así que los
 * clubes sin la fila siguen exactamente como antes.
 *
 * Esto solo decide qué botones se dibujan. Quien manda es el RLS (migración
 * 281) y `requireGestorTorneos()` en las Server Actions: un profesor que se
 * salte la pantalla choca ahí igual.
 *
 * Mientras la configuración carga devuelve `false` —el botón aparece un
 * instante después— en vez de dibujar botones que la base va a rechazar.
 */
export function usePuedeGestionarTorneos(): boolean {
  const { perfil } = usePerfil()
  const [profeGestiona, setProfeGestiona] = useState(false)

  useEffect(() => {
    if (perfil?.rol !== 'profesor' || !perfil.club_id) return
    let activo = true
    configDelClub(perfil.club_id).then(config => {
      if (activo) setProfeGestiona(config('profe.gestiona_torneos') === 'si')
    })
    return () => { activo = false }
  }, [perfil?.rol, perfil?.club_id])

  if (perfil?.rol === 'admin') return true
  return perfil?.rol === 'profesor' && profeGestiona
}
