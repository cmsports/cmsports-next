'use client'

import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { Landmark } from 'lucide-react'

export default function CentralDePagoPage() {
  const { perfil, loading } = usePerfil()

  if (loading) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Landmark size={20} color="#4f46e5" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Central de Pago</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Módulo en construcción</p>
          </div>
        </div>

        <div style={{
          background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14,
          padding: 48, textAlign: 'center', color: '#94a3b8',
        }}>
          <Landmark size={40} color="#e2e8f0" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 15, margin: 0 }}>Próximamente</p>
        </div>
      </div>
    </AppLayout>
  )
}
