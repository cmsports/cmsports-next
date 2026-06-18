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

  const esJugador = perfil?.rol === 'jugador'
  const miJugadorId = perfil?.jugador_id

  const miPosicion = jugadores.findIndex(j => j.id === miJugadorId)
  const miJugador = miPosicion >= 0 ? jugadores[miPosicion] : null

  const top3 = jugadores.slice(0, 3)
  const resto = jugadores.slice(3)

  function irAPerfil(jugadorId: string) {
    router.push(`/jugadores/${jugadorId}`)
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: text, marginBottom: 4 }}>🏆 Ranking</h1>
        <p style={{ fontSize: 13, color: muted }}>{jugadores.length} jugadores clasificados</p>
      </div>

      {/* Tarjeta propia destacada para jugadores */}
      {esJugador && miJugador && (
        <div
          onClick={() => irAPerfil(miJugador.id)}
          style={{ background: 'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius: 16, padding: 20, marginBottom: 20, cursor: 'pointer' }}
        >
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Tu posición</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'white', flexShrink: 0 }}>
              {miJugador.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{miJugador.nombre}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{miJugador.categoria}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{miJugador.elo}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>pts · #{miPosicion + 1}</div>
            </div>
          </div>
          <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#fff', textAlign: 'center' }}>
            Ver mi perfil completo →
          </div>
        </div>
      )}

      {/* Podio top 3 */}
      {top3.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {top3.map((j, i) => {
            const medallaColor = i === 0 ? '#d97706' : i === 1 ? '#64748b' : '#ea580c'
            const medallaBg = i === 0 ? '#fffbeb' : i === 1 ? '#f8fafc' : '#fff7ed'
            const medallaBorder = i === 0 ? '#fde68a' : i === 1 ? '#e2e8f0' : '#fed7aa'
            const esPropio = j.id === miJugadorId
            const clickable = !esJugador || esPropio
            return (
              <div key={j.id}
                onClick={() => clickable && irAPerfil(j.id)}
                style={{ ...card, padding: '20px 14px', textAlign: 'center', cursor: clickable ? 'pointer' : 'default', background: medallaBg, border: esPropio ? '2px solid #4f46e5' : `1px solid ${medallaBorder}` }}>
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
                {esPropio && <div style={{ marginTop: 8, fontSize: 10, color: '#4f46e5', fontWeight: 600 }}>← Tú</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Resto de la tabla */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {resto.map((j, i) => {
          const pos = i + 4
          const esPropio = j.id === miJugadorId
          const clickable = !esJugador || esPropio
          return (
            <div key={j.id}
              onClick={() => clickable && irAPerfil(j.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: clickable ? 'pointer' : 'default', background: esPropio ? '#ede9fe' : 'white' }}>
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
                <div style={{ fontSize: 14, fontWeight: esPropio ? 700 : 500, color: text }}>{j.nombre}{esPropio && <span style={{ marginLeft: 6, fontSize: 11, color: '#4f46e5', fontWeight: 600 }}>← Tú</span>}</div>
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
