'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'

export type Modulo =
  | 'torneos' | 'liga' | 'clases' | 'calendario'
  | 'asistencia' | 'mensualidades' | 'finanzas'
  | 'redes' | 'tienda'

const CORE: readonly string[] = ['dashboard', 'jugadores']
const ALL_MODULOS: Modulo[] = ['torneos','liga','clases','calendario','asistencia','mensualidades','finanzas','redes','tienda']

export function useModulos() {
  const { perfil } = usePerfil()
  const clubId = perfil?.club_id ?? ''
  const [estado, setEstado] = useState<{ clubId: string; modulos: string[] } | null>(null)

  useEffect(() => {
    let activo = true
    if (!clubId) return () => { activo = false }
    const supabase = createClient()
    supabase.from('clubes').select('modulos_habilitados').eq('id', clubId).single()
      .then(({ data }) => {
        if (!activo) return
        setEstado({
          clubId,
          modulos: (data?.modulos_habilitados ?? ALL_MODULOS).filter((m: string) => m !== 'elo'),
        })
      })
    return () => { activo = false }
  }, [clubId])

  const modulos = estado?.clubId === clubId ? estado.modulos : []
  const tiene = (m: string) => CORE.includes(m) || modulos.includes(m)
  return { modulos, tiene, ALL_MODULOS }
}
