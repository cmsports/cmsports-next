'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const medallas = ['🥇', '🥈', '🥉']
const avatarColors = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed']

export default function RankingPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [jugadores, setJugadores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.club_id) {
        const { data: j } = await supabase.from('jugadores').select('*').eq('club_id', p.club_id).eq('estado', 'activo').neq('es_externo', true).order('elo', { ascending: false })
        setJugadores(j || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  const top3 = jugadores.slice(0, 3)
  const resto = jugadores.slice(3)

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: text, marginBottom: 4 }}>🏆 Ranking</h1>
        <p style={{ fontSize: 13, color: muted }}>{jugadores.length} jugadores clasificados</p>
      </div>

      {/* Podio top 3 */}
      {top3.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {top3.map((j, i) => {
            const medallaColor = i === 0 ? '#d97706' : i === 1 ? '#64748b' : '#ea580c'
            const medallaBg = i === 0 ? '#fffbeb' : i === 1 ? '#f8fafc' : '#fff7ed'
            const medallaBorder = i === 0 ? '#fde68a' : i === 1 ? '#e2e8f0' : '#fed7aa'
            return (
              <div key={j.id} onClick={() => router.push(`/jugadores/${j.id}`)}
                style={{ ...card, padding: '20px 14px', textAlign: 'center', cursor: 'pointer', background: medallaBg, border: `1px solid ${medallaBorder}` }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{medallas[i]}</div>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', margin: '0 auto 10px',
                  background: avatarColors[i % avatarColors.length],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 600, color: 'white'
                }}>
                  {j.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 2 }}>{j.nombre}</div>
                <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>{j.categoria}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: medallaColor, fontFamily: 'monospace' }}>{j.elo}</div>
                <div style={{ fontSize: 10, color: hint }}>puntos</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Resto de la tabla */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {resto.map((j, i) => {
          const pos = i + 4
          return (
            <div key={j.id} onClick={() => router.push(`/jugadores/${j.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
              <div style={{ width: 28, textAlign: 'center', fontSize: 13, fontWeight: 600, color: hint }}>{pos}</div>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: avatarColors[i % avatarColors.length] + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, color: avatarColors[i % avatarColors.length]
              }}>
                {j.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: text }}>{j.nombre}</div>
                <div style={{ fontSize: 11, color: hint }}>{j.categoria}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#4f46e5', fontFamily: 'monospace' }}>{j.elo}</div>
                <div style={{ fontSize: 10, color: hint }}>pts</div>
              </div>
            </div>
          )
        })}
        {jugadores.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Sin jugadores en el ranking</div>
        )}
      </div>
    </AppLayout>
  )
}
