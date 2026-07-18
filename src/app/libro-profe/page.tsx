'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'

export default function LibroProfePage() {
  const { perfil, loading } = usePerfil()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (perfil?.rol === 'jugador') router.replace('/perfil')
  }, [perfil, loading, router])

  if (loading || perfil?.rol === 'jugador') return null

  return (
    <AppLayout perfil={perfil ?? null}>
      <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>📖</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
          Libro del profe
        </h1>
        <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.7 }}>
          Este módulo está en construcción.<br />
          Contenido exclusivo para administradores y profesores.
        </p>
      </div>
    </AppLayout>
  )
}
