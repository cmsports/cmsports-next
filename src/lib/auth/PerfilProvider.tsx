'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Perfil } from '@/types'
import { clearAll as clearQueryCache } from '@/lib/query-cache'

type PerfilContextValue = {
  perfil: Perfil | null
  loading: boolean
  refetchPerfil: () => Promise<void>
}

const PerfilContext = createContext<PerfilContextValue>({
  perfil: null,
  loading: true,
  refetchPerfil: async () => {},
})

const CACHE_KEY = 'cmsports_perfil'
const CACHE_TTL = 5 * 60_000 // 5 minutos

type CacheEntry = { perfil: Perfil; ts: number }

function leerCacheEntry(): CacheEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(CACHE_KEY)
    if (!v) return null
    const parsed = JSON.parse(v) as CacheEntry | Perfil
    // Compatibilidad con formato antiguo (sin ts)
    if (!('ts' in parsed)) return { perfil: parsed as Perfil, ts: 0 }
    return parsed as CacheEntry
  } catch { return null }
}

const leerCache = (): Perfil | null => leerCacheEntry()?.perfil ?? null

// Devuelve el perfil solo si el cache tiene menos de CACHE_TTL
const leerCacheFresco = (): Perfil | null => {
  const e = leerCacheEntry()
  if (!e) return null
  return Date.now() - e.ts < CACHE_TTL ? e.perfil : null
}

const guardarCache = (p: Perfil | null) => {
  try {
    if (p) localStorage.setItem(CACHE_KEY, JSON.stringify({ perfil: p, ts: Date.now() } satisfies CacheEntry))
    else localStorage.removeItem(CACHE_KEY)
  } catch {}
}

export function cargaPerfilSigueVigente(
  generacionActual: number,
  generacionCarga: number,
  usuarioCarga: string | null,
  usuarioActual: string | null,
) {
  return generacionActual === generacionCarga && usuarioCarga === usuarioActual
}

// Solo estos eventos cambian quién está logueado. `INITIAL_SESSION` y
// `TOKEN_REFRESHED` también llegan por onAuthStateChange, pero no deben
// invalidar una carga en curso: si lo hacen, `loading` queda en true para
// siempre (pantalla "Cargando..." eterna). En el celu se nota más porque
// no hay cache de perfil en localStorage; en el PC a veces se veía igual
// el contenido viejo del cache y parecía que "funcionaba".
export function authEventCambiaSesion(event: string): 'sign-in' | 'sign-out' | null {
  if (event === 'SIGNED_OUT') return 'sign-out'
  if (event === 'SIGNED_IN') return 'sign-in'
  return null
}

export function PerfilProvider({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(() => leerCache())
  const [loading, setLoading] = useState(() => leerCache() === null)

  const generacionRef = useRef(0)

  const obtenerPerfil = useCallback(async (forzarBD = false): Promise<{ perfil: Perfil | null; userId: string | null }> => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { perfil: null, userId: null }
    // Si el cache es fresco y no se fuerza, omitimos el round-trip a la BD
    if (!forzarBD) {
      const fresco = leerCacheFresco()
      if (fresco && fresco.id === session.user.id) return { perfil: fresco, userId: session.user.id }
    }
    const { data: p } = await supabase.from('perfiles').select('id,nombre,email,rol,club_id,jugador_id,creado_en').eq('id', session.user.id).single()
    return { perfil: p, userId: session.user.id }
  }, [])

  // Siempre va a la base: es la función que se expone como `refetchPerfil` y
  // sus dos usos (cambiar de club desde superadmin, editar el perfil propio)
  // ocurren justo después de escribir en `perfiles`. Antes tenía un parámetro
  // `forzarBD` que por defecto era `false`, y como nadie lo pasaba, el refetch
  // leía el cache de localStorage —vigente 5 minutos— y devolvía el perfil
  // anterior: "Gestionar" grababa bien el club nuevo pero volvía con el viejo,
  // así que todos los clubes aterrizaban en el que estuviera cacheado.
  const cargarPerfil = useCallback(async () => {
    const generacionCarga = ++generacionRef.current
    const resultado = await obtenerPerfil(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!cargaPerfilSigueVigente(
      generacionRef.current,
      generacionCarga,
      resultado.userId,
      session?.user.id ?? null,
    )) return
    setPerfil(resultado.perfil)
    guardarCache(resultado.perfil)
    setLoading(false)
  }, [obtenerPerfil])

  useEffect(() => {
    let activo = true
    const generacionCarga = ++generacionRef.current
    void obtenerPerfil().then(async (resultado) => {
      const clienteActual = createClient()
      const { data: { session } } = await clienteActual.auth.getSession()
      if (!activo || !cargaPerfilSigueVigente(
        generacionRef.current,
        generacionCarga,
        resultado.userId,
        session?.user.id ?? null,
      )) return
      setPerfil(resultado.perfil)
      guardarCache(resultado.perfil)
      setLoading(false)
    }).catch(() => {
      // Sin esto un getSession colgado/roto deja "Cargando..." eterno.
      if (activo && generacionRef.current === generacionCarga) setLoading(false)
    })
    const supabase = createClient()
    // Solo SIGNED_IN / SIGNED_OUT invalidan o recargan. INITIAL_SESSION y
    // TOKEN_REFRESHED también disparan onAuthStateChange: si bumpábamos la
    // generación en todos, la carga inicial se descartaba y nadie volvía a
    // poner loading=false. En el celu (sin cache de localStorage) eso es
    // "Cargando..." para siempre; en el PC a menudo el cache tapaba el bug.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        generacionRef.current++
        setPerfil(null)
        guardarCache(null)
        clearQueryCache()
        setLoading(false)
      }
      if (event === 'SIGNED_IN') void cargarPerfil()
    })
    return () => {
      activo = false
      subscription.unsubscribe()
    }
  }, [cargarPerfil, obtenerPerfil])

  return (
    <PerfilContext.Provider value={{ perfil, loading, refetchPerfil: cargarPerfil }}>
      {children}
    </PerfilContext.Provider>
  )
}

export function usePerfil() {
  return useContext(PerfilContext)
}
