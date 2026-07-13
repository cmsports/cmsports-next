'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'

export type Modulo =
  | 'torneos' | 'liga' | 'clases' | 'calendario'
  | 'asistencia' | 'mensualidades' | 'finanzas'
  | 'elo' | 'redes' | 'tienda'

const CORE = ['dashboard', 'jugadores'] as const
const ALL_MODULOS: Modulo[] = ['torneos','liga','clases','calendario','asistencia','mensualidades','finanzas','elo','redes','tienda']

const cache: Record<string, string[]> = {}

export function useModulos() {
  const { perfil } = usePerfil()
  const clubId = perfil?.club_id ?? ''
  const [modulos, setModulos] = useState<string[]>(cache[clubId] ?? ALL_MODULOS)

  useEffect(() => {
    if (!clubId) return
    if (cache[clubId]) { setModulos(cache[clubId]); return }
    const supabase = createClient()
    supabase.from('clubes').select('modulos_habilitados').eq('id', clubId).single()
      .then(({ data }) => {
        const m = data?.modulos_habilitados ?? ALL_MODULOS
        cache[clubId] = m
        setModulos(m)
      })
  }, [clubId])

  const tiene = (m: string) => CORE.includes(m as any) || modulos.includes(m)
  return { modulos, tiene, ALL_MODULOS }
}
