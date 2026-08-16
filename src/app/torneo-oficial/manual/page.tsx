'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { ManualOficialConUrl } from '@/components/torneo-oficial/ManualOficialCuerpo'
import { torneoUi } from '@/lib/torneos/ui-tokens'

export default function ManualTorneoOficialPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()

  useEffect(() => {
    if (authLoading) return
    if (!perfil) router.replace('/login')
  }, [authLoading, perfil, router])

  if (authLoading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando…</div>
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
        <Link href="/torneo-oficial" style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>
          ← Volver a torneo oficial
        </Link>
        <div style={{
          marginTop: 16,
          background: 'linear-gradient(135deg, #312e81, #4f46e5)',
          color: '#fff',
          borderRadius: 14,
          padding: 20,
        }}>
          <div style={{ fontSize: 10, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1 }}>Ayuda del módulo</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 24 }}>Manual de torneo oficial</h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.92, maxWidth: 560, lineHeight: 1.45 }}>
            Dos pestañas: cómo se opera en CMSports, y las bases ITTF con las que se decide un grupo o una llave.
          </p>
        </div>
        <div style={{ marginTop: 16 }}>
          <ManualOficialConUrl />
        </div>
        <p style={{ marginTop: 20, fontSize: 11, color: torneoUi.hint }}>
          Este texto describe lo que la app hace hoy (individual, grupos + llaves). No cubre equipos ni doble eliminación.
        </p>
      </div>
    </AppLayout>
  )
}
