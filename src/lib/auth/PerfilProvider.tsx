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

  const cargarPerfil = useCallback(async (forzarBD = false) => {
    const generacionCarga = ++generacionRef.current
    const resultado = await obtenerPerfil(forzarBD)
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
    })
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      generacionRef.current++
      if (event === 'SIGNED_OUT') { setPerfil(null); guardarCache(null); clearQueryCache(); setLoading(false) }
      if (event === 'SIGNED_IN') void cargarPerfil(true)
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
