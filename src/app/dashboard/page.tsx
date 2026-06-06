'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const stats = [
  { label:'Jugadores activos', value:'—', icon:'🏓', color:'#a78bfa' },
  { label:'Asistencias este mes', value:'—', icon:'📅', color:'#34d399' },
  { label:'Torneos activos', value:'—', icon:'🎯', color:'#fbbf24' },
  { label:'Tasa morosidad', value:'—%', icon:'⚠️', color:'#f87171' },
]

export default function DashboardPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
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
        <h1 style={{ fontSize:24, fontWeight:700, color:'#fff', marginBottom:4 }}>Dashboard</h1>
        <p style={{ fontSize:13, color:'#6c7280' }}>Bienvenido, {perfil?.nombre || perfil?.email}</p>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        {stats.map(stat => (
          <div key={stat.label} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20 }}>
            <div style={{ fontSize:28, marginBottom:10 }}>{stat.icon}</div>
            <div style={{ fontSize:28, fontWeight:700, color:stat.color, fontFamily:'monospace', marginBottom:4 }}>{stat.value}</div>
            <div style={{ fontSize:12, color:'#6c7280' }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}
