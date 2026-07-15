'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'

export type Modulo =
  | 'torneos' | 'liga' | 'clases' | 'calendario'
  | 'asistencia' | 'mensualidades' | 'finanzas'
  | 'redes' | 'tienda'

const CORE: readonly string[] = ['dashboard', 'jugadores']
const ALL_MODULOS: Modulo[] = ['torneos','liga','clases','calendario','asistencia','mensualidades','finanzas','redes','tienda']

type ModulosContextValue = {
  modulos: string[]
  cargando: boolean
  tiene: (modulo: string) => boolean
  recargar: () => Promise<void>
  ALL_MODULOS: Modulo[]
}

const ModulosContext = createContext<ModulosContextValue>({
  modulos: [],
  cargando: true,
  tiene: modulo => CORE.includes(modulo),
  recargar: async () => {},
  ALL_MODULOS,
})

export function ModulosProvider({ children }: { children: React.ReactNode }) {
  const { perfil } = usePerfil()
  const clubId = perfil?.club_id ?? ''
  const [estado, setEstado] = useState<{ clubId: string; modulos: string[] } | null>(null)

  const cargar = useCallback(async (id: string) => {
    if (!id) return
    const supabase = createClient()
    const { data } = await supabase.from('clubes').select('modulos_habilitados').eq('id', id).single()
    setEstado({
      clubId: id,
      modulos: data?.modulos_habilitados ?? ALL_MODULOS,
    })
  }, [])

  useEffect(() => {
    if (!clubId) return
    cargar(clubId)
  }, [clubId, cargar])

  useEffect(() => {
    const actualizar = (event: Event) => {
      const id = (event as CustomEvent<{ clubId?: string }>).detail?.clubId
      if (!id || id === clubId) cargar(clubId)
    }
    window.addEventListener('cmsports:modulos-actualizados', actualizar)
    return () => window.removeEventListener('cmsports:modulos-actualizados', actualizar)
  }, [clubId, cargar])

  const modulos = estado?.clubId === clubId ? estado.modulos : []
  const cargando = !!clubId && estado?.clubId !== clubId
  const tiene = (modulo: string) => CORE.includes(modulo) || modulos.includes(modulo)
  const recargar = async () => cargar(clubId)

  return createElement(
    ModulosContext.Provider,
    { value: { modulos, cargando, tiene, recargar, ALL_MODULOS } },
    children,
  )
}

export function useModulos() {
  return useContext(ModulosContext)
}
