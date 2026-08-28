'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import AsistenciaPanel from '@/components/AsistenciaPanel'
import PanelAsistenciaHistorica from '@/components/PanelAsistenciaHistorica'
import PanelRankingAsistencia from '@/components/PanelRankingAsistencia'
import PanelAsistenciaProfes from '@/components/PanelAsistenciaProfes'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useModulos } from '@/lib/hooks/useModulos'

// Asistencia es su propio módulo: acá se pasa lista y se revisa quién faltó.
// Antes vivía como pestaña dentro de Jugadores, que mezclaba la ficha de cada
// persona con la operación de cada día. Quiénes forman cada grupo se define en
// Horario semanal, que es la configuración.
export default function AsistenciaPage() {
  const { perfil, loading } = usePerfil()
  const { tiene } = useModulos()
  const router = useRouter()
  const [tab, setTab] = useState<'pasar' | 'historica' | 'ranking' | 'profes'>('pasar')

  useEffect(() => {
    if (loading) return
    if (!perfil) router.replace('/login')
  }, [loading, perfil, router])

  if (loading || !perfil) return null

  const esStaff = perfil.rol === 'admin' || perfil.rol === 'profesor' || perfil.rol === 'superadmin'

  return (
    <AppLayout perfil={perfil}>
      {esStaff && (
        <>
          <div style={{ marginBottom: 6 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', margin: 0 }}>Asistencia</h1>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              Pasá lista del día. Los grupos y sus inscritos se arman en Cupos/bloques.
            </p>
          </div>

          <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 10, padding: 4, margin: '16px 0' }}>
            {([
              ['pasar', 'Pasar lista'] as const,
              ['historica', 'Asistencia histórica'] as const,
              ['ranking', 'Panorama'] as const,
              // Solo donde el club lleva las horas de sus profesores.
              ...(tiene('asistencia_profes') ? [['profes', 'Profesores'] as const] : []),
            ]).map(([key, label]) => (
              <div key={key} onClick={() => setTab(key)}
                style={{ flex: 1, padding: 9, textAlign: 'center', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: tab === key ? '#fff' : 'transparent', color: tab === key ? '#3730a3' : '#64748b',
                  boxShadow: tab === key ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
                {label}
              </div>
            ))}
          </div>
        </>
      )}

      {(!esStaff || tab === 'pasar') && <AsistenciaPanel perfil={perfil} />}
      {esStaff && tab === 'historica' && perfil.club_id && (
        <PanelAsistenciaHistorica
          clubId={perfil.club_id}
          puedeMontos={perfil.rol === 'admin' || perfil.rol === 'superadmin'}
        />
      )}
      {esStaff && tab === 'ranking' && perfil.club_id && (
        <PanelRankingAsistencia clubId={perfil.club_id} />
      )}
      {esStaff && tab === 'profes' && perfil.club_id && (
        <PanelAsistenciaProfes
          clubId={perfil.club_id}
          esAdmin={perfil.rol === 'admin' || perfil.rol === 'superadmin'}
        />
      )}
    </AppLayout>
  )
}
