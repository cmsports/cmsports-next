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

export function PerfilProvider({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  const cargarPerfil = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPerfil(null); setLoading(false); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
    setPerfil(p)
    setLoading(false)
  }, [])

  useEffect(() => {
    cargarPerfil()
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setPerfil(null); setLoading(false) }
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
