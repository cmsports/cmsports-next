'use client'

import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'

export default function BibliografiaTdmPage() {
  const { perfil } = usePerfil()

  return (
    <AppLayout perfil={perfil ?? null}>
      <div style={{ maxWidth: 500, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📚</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          Bibliografía TDM
        </h1>
        <p style={{ fontSize: 14, color: '#94a3b8' }}>Módulo vacío</p>
      </div>
    </AppLayout>
  )
}
