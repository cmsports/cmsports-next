'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import {
  GLOSARIO_INDICADORES,
  NOTAS_IMPORTANTES,
  PASOS_USO_RAPIDO,
} from '@/lib/tecnico/manual-contenido'

type Tab = 'uso' | 'indicadores'

export default function ManualTecnicoPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [tab, setTab] = useState<Tab>('uso')
  const router = useRouter()

  useEffect(() => {
    if (authLoading) return
    if (!perfil) {
      router.replace('/login')
      return
    }
    if (typeof window !== 'undefined' && window.location.hash === '#indicadores') {
      setTab('indicadores')
    }
  }, [authLoading, perfil, router])

  if (authLoading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando...</div>
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <Link href="/tecnico" style={{ color: '#4f46e5', fontSize: 12, textDecoration: 'none' }}>← Volver al perfil técnico</Link>

        <div style={{ ...card, marginTop: 16, background: 'linear-gradient(135deg, #312e81, #4f46e5)', color: '#fff', border: 0 }}>
          <div style={{ fontSize: 10, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1 }}>Ayuda del módulo</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 24 }}>Manual del perfil técnico</h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.9, maxWidth: 560, lineHeight: 1.45 }}>
            Cómo usar el módulo día a día y qué significa cada número que ves en el historial y en cara a cara.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setTab('uso')}
            style={tab === 'uso' ? tabActivo : tabInactivo}
          >
            Manual de uso
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('indicadores')
              if (typeof window !== 'undefined') window.history.replaceState(null, '', '#indicadores')
            }}
            style={tab === 'indicadores' ? tabActivo : tabInactivo}
          >
            Qué significa cada parámetro
          </button>
        </div>

        {tab === 'uso' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PASOS_USO_RAPIDO.map(paso => (
              <div key={paso.titulo} style={card}>
                <h2 style={{ margin: 0, color: '#0f172a', fontSize: 15 }}>{paso.titulo}</h2>
                <p style={{ margin: '6px 0 0', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>{paso.texto}</p>
              </div>
            ))}
            <div style={{ ...card, background: '#fffbeb', borderColor: '#fcd34d' }}>
              <h2 style={{ margin: 0, color: '#92400e', fontSize: 14 }}>Tener en cuenta</h2>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#78350f', fontSize: 12, lineHeight: 1.55 }}>
                {NOTAS_IMPORTANTES.map(n => <li key={n}>{n}</li>)}
              </ul>
            </div>
          </div>
        ) : (
          <div id="indicadores" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>
              Todos estos números salen de lo que el profe marca en el video (golpe, zona, resultado, fase, tipo de error)
              y de la evaluación humana de objetivos. Si no se marca, el indicador queda vacío o en cero.
            </p>
            {GLOSARIO_INDICADORES.map(item => (
              <div key={item.id} id={item.id} style={card}>
                <h2 style={{ margin: 0, color: '#0f172a', fontSize: 15 }}>{item.nombre}</h2>
                <p style={{ margin: '8px 0 0', color: '#334155', fontSize: 13, lineHeight: 1.45 }}>
                  <strong style={{ color: '#0f172a' }}>Qué es: </strong>{item.significado}
                </p>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 12, lineHeight: 1.45 }}>
                  <strong>Cómo se calcula: </strong>{item.comoSeCalcula}
                </p>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 12, lineHeight: 1.45 }}>
                  <strong>Cómo se llena: </strong>{item.comoSeLlena}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
} as const

const tabActivo = {
  border: 0,
  borderRadius: 8,
  padding: '9px 14px',
  background: '#4f46e5',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
} as const

const tabInactivo = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '9px 14px',
  background: '#fff',
  color: '#475569',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
} as const
