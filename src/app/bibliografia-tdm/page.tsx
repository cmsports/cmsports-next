'use client'

import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'

export default function BibliografiaTdmPage() {
  const { perfil } = usePerfil()

  return (
    <AppLayout perfil={perfil ?? null}>
      <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>📚</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
          Bibliografía TDM
        </h1>
        <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.7 }}>
          Este módulo está en construcción.<br />
          Aquí encontrarás el material bibliográfico del club.
        </p>
      </div>
    </AppLayout>
  )
}
