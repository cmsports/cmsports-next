'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { MODULOS_CORE as CORE, MODULOS_KEYS as ALL_MODULOS, type Modulo } from '@/lib/domain/modulos'

export type { Modulo }

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

  // Sin `?? ALL_MODULOS` a la salida, un corte de red acá no se veía como un
  // error en ningún lado: `estado` se quedaba en null, `modulos` en `[]`
  // (ver más abajo) y el menú lateral perdía toda la sección de Recursos
  // (tienda, bibliografía, libro del profe) sin aviso ni reintento, para el
  // resto de esa sesión — se veía como un cuadro en blanco en la barra
  // lateral. Mejor pecar de permisivo (mostrar todo) que de vacío.
  const cargar = useCallback(async (id: string) => {
    if (!id) return
    const supabase = createClient()
    try {
      const { data } = await supabase.from('clubes').select('modulos_habilitados').eq('id', id).single()
      setEstado({ clubId: id, modulos: data?.modulos_habilitados ?? ALL_MODULOS })
    } catch {
      setEstado({ clubId: id, modulos: ALL_MODULOS })
    }
  }, [])

  useEffect(() => {
    if (!clubId) return
    let activo = true
    const supabase = createClient()
    supabase.from('clubes').select('modulos_habilitados').eq('id', clubId).single()
      .then(
        ({ data }) => {
          if (!activo) return
          setEstado({ clubId, modulos: data?.modulos_habilitados ?? ALL_MODULOS })
        },
        () => {
          if (!activo) return
          setEstado({ clubId, modulos: ALL_MODULOS })
        },
      )
    return () => { activo = false }
  }, [clubId])

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
