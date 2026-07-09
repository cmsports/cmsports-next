'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import AsistenciaPanel from '@/components/AsistenciaPanel'
import { usePerfil } from '@/lib/auth/PerfilProvider'

// ponytail: admin/profesor entran por Jugadores → tab Asistencia; jugador
// sigue viendo el panel aquí (no tiene acceso a /jugadores).
export default function AsistenciaPage() {
  const { perfil, loading } = usePerfil()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.replace('/login'); return }
    if (perfil.rol === 'admin' || perfil.rol === 'profesor') {
      router.replace('/jugadores?tab=asistencia')
    }
  }, [loading, perfil, router])

  if (loading || !perfil || perfil.rol === 'admin' || perfil.rol === 'profesor') return null

  return (
    <AppLayout perfil={perfil}>
      <AsistenciaPanel perfil={perfil} />
    </AppLayout>
  )
}
