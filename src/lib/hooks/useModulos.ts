'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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

// Los módulos del club se recuerdan en el navegador, por club. Antes cada
// carga de pantalla los pedía a la base desde cero —un viaje de ~150 ms desde
// Chile a Ohio, medido el 2026-09-12— antes de poder dibujar el menú. Ahora
// se usa lo recordado al instante y se vuelve a pedir por detrás: si el
// superadmin encendió algo, aparece al segundo, no cinco minutos después.
// La llave lleva el club para que "Gestionar otro club" no herede la lista
// del anterior — el mismo error que ya mordió con el caché del perfil.
const CACHE_KEY = 'cmsports_modulos'
const CACHE_MAX_EDAD = 24 * 60 * 60_000 // un día: solo por si un club deja de existir

type CacheModulos = { clubId: string; modulos: string[]; ts: number }

export function leerCacheModulos(clubId: string): string[] | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(CACHE_KEY)
    if (!v) return null
    const e = JSON.parse(v) as CacheModulos
    if (e.clubId !== clubId || !Array.isArray(e.modulos)) return null
    if (Date.now() - e.ts > CACHE_MAX_EDAD) return null
    return e.modulos
  } catch { return null }
}

export function guardarCacheModulos(clubId: string, modulos: string[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ clubId, modulos, ts: Date.now() } satisfies CacheModulos))
  } catch {}
}

export function ModulosProvider({ children }: { children: React.ReactNode }) {
  const { perfil } = usePerfil()
  const clubId = perfil?.club_id ?? ''
  const [estado, setEstado] = useState<{ clubId: string; modulos: string[] } | null>(null)
  // Lo recordado para este club, si hay. Se lee al render y no en un efecto:
  // así el menú sale con los módulos desde el primer dibujo, sin esperar.
  const recordados = useMemo(() => (clubId ? leerCacheModulos(clubId) : null), [clubId])

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
      const modulos = data?.modulos_habilitados ?? ALL_MODULOS
      setEstado({ clubId: id, modulos })
      // Solo se recuerda lo que la base confirmó, nunca el "todos" de emergencia.
      if (data?.modulos_habilitados) guardarCacheModulos(id, data.modulos_habilitados)
    } catch {
      setEstado({ clubId: id, modulos: ALL_MODULOS })
    }
  }, [])

  useEffect(() => {
    if (!clubId) return
    let activo = true
    // La base, por detrás: mientras responde, vale lo recordado (ver abajo).
    const supabase = createClient()
    supabase.from('clubes').select('modulos_habilitados').eq('id', clubId).single()
      .then(
        ({ data }) => {
          if (!activo) return
          setEstado({ clubId, modulos: data?.modulos_habilitados ?? ALL_MODULOS })
          if (data?.modulos_habilitados) guardarCacheModulos(clubId, data.modulos_habilitados)
        },
        () => {
          if (!activo) return
          // Sin red: lo recordado sigue valiendo; sin nada recordado, todo.
          setEstado({ clubId, modulos: recordados ?? ALL_MODULOS })
        },
      )
    return () => { activo = false }
  }, [clubId, recordados])

  useEffect(() => {
    const actualizar = (event: Event) => {
      const id = (event as CustomEvent<{ clubId?: string }>).detail?.clubId
      if (!id || id === clubId) cargar(clubId)
    }
    window.addEventListener('cmsports:modulos-actualizados', actualizar)
    return () => window.removeEventListener('cmsports:modulos-actualizados', actualizar)
  }, [clubId, cargar])

  // Lo que confirmó la base para este club; si todavía no llegó, lo recordado.
  const modulos = estado?.clubId === clubId ? estado.modulos : (recordados ?? [])
  const cargando = !!clubId && estado?.clubId !== clubId && !recordados
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
