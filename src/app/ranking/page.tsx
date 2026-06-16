'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient()

const medallas = ['🥇', '🥈', '🥉']
const cols = ['#f59e0b', '#6c63ff', '#059669', '#0891b2', '#7c3aed']

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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:4 }}>Ranking</h1>
        <p style={{ fontSize:13, color:'#6c7280' }}>{jugadores.length} jugadores clasificados</p>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {jugadores.map((j, i) => (
          <div
            key={j.id}
            onClick={() => router.push(`/jugadores/${j.id}`)}
            style={{
              background:'#14161f', border:'1px solid #1e2030', borderRadius:12,
              padding:'14px 16px', display:'flex', alignItems:'center', gap:14,
              cursor:'pointer', transition:'all 0.15s'
            }}
          >
            <div style={{ width:32, fontSize:18, textAlign:'center', fontWeight:700, color: i < 3 ? ['#fbbf24','#94a3b8','#f43f5e'][i] : '#6c7280' }}>
              {i < 3 ? medallas[i] : i + 1}
            </div>
            <div style={{
              width:40, height:40, borderRadius:'50%', flexShrink:0,
              background:`linear-gradient(135deg,${cols[i % cols.length]},${cols[i % cols.length]}88)`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:13, fontWeight:700, color:'white'
            }}>
              {j.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#c8cfe0' }}>{j.nombre}</div>
              <div style={{ fontSize:11, color:'#6c7280', marginTop:2 }}>{j.categoria}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#a78bfa', fontFamily:'monospace' }}>{j.elo}</div>
              <div style={{ fontSize:10, color:'#6c7280' }}>Ranking</div>
            </div>
          </div>
        ))}

        {jugadores.length === 0 && (
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>
            Sin jugadores en el ranking
          </div>
        )}
      </div>
    </AppLayout>
  )
}
