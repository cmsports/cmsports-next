'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
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
  try { const v = localStorage.getItem(CACHE_KEY); return v ? JSON.parse(v) : null } catch { return null }
}
const guardarCache = (p: Perfil | null) => {
  try { p ? localStorage.setItem(CACHE_KEY, JSON.stringify(p)) : localStorage.removeItem(CACHE_KEY) } catch {}
}

export function PerfilProvider({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  const cargarPerfil = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPerfil(null); guardarCache(null); setLoading(false); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
    setPerfil(p)
    guardarCache(p)
    setLoading(false)
  }, [])

  useEffect(() => {
    // Pinta el perfil cacheado sin esperar red; si existe, la app arranca al instante
    const cache = leerCache()
    if (cache) { setPerfil(cache); setLoading(false) }
    cargarPerfil()
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setPerfil(null); guardarCache(null); setLoading(false) }
      if (event === 'SIGNED_IN') cargarPerfil()
    })
    return () => subscription.unsubscribe()
  }, [cargarPerfil])

  return (
    <PerfilContext.Provider value={{ perfil, loading, refetchPerfil: cargarPerfil }}>
      {children}
    </PerfilContext.Provider>
  )
}

export function usePerfil() {
  return useContext(PerfilContext)
}
