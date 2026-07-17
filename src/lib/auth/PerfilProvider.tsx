'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Perfil } from '@/types'

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

// ponytail: caché del perfil en localStorage para entrar al instante; se revalida contra Supabase en segundo plano
const CACHE_KEY = 'cmsports_perfil'
const leerCache = (): Perfil | null => {
  if (typeof window === 'undefined') return null
  try { const v = localStorage.getItem(CACHE_KEY); return v ? JSON.parse(v) : null } catch { return null }
}
const guardarCache = (p: Perfil | null) => {
  try {
    if (p) localStorage.setItem(CACHE_KEY, JSON.stringify(p))
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

  const obtenerPerfil = useCallback(async (): Promise<{ perfil: Perfil | null; userId: string | null }> => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { perfil: null, userId: null }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
    return { perfil: p, userId: session.user.id }
  }, [])

  const cargarPerfil = useCallback(async () => {
    const generacionCarga = ++generacionRef.current
    const resultado = await obtenerPerfil()
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
      if (event === 'SIGNED_OUT') { setPerfil(null); guardarCache(null); setLoading(false) }
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
