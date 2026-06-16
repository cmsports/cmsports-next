'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [jugador, setJugador] = useState<any>(null)
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.jugador_id) {
        const { data: j } = await supabase.from('jugadores').select('*').eq('id', p.jugador_id).single()
        setJugador(j)
        const { data: a } = await supabase.from('asistencia').select('*').eq('jugador_id', p.jugador_id).order('fecha', { ascending: false }).limit(10)
        setAsistencias(a || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (!jugador) return (
    <AppLayout perfil={perfil}>
      <div style={{ ...card, padding:40, textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🏓</div>
        <div style={{ fontSize:16, color: text, marginBottom:8 }}>Perfil no vinculado</div>
        <div style={{ fontSize:13, color: muted }}>Contacta al administrador del club</div>
      </div>
    </AppLayout>
  )

  const iniciales = jugador.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()

  return (
    <AppLayout perfil={perfil}>
      {/* Hero */}
      <div style={{ background:'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius:16, padding:24, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
          <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:'white', flexShrink:0, border:'2px solid rgba(255,255,255,0.3)' }}>
            {iniciales}
          </div>
          <div>
            <div style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:4 }}>{jugador.nombre}</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)' }}>{jugador.categoria}</div>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
          <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#fff', fontFamily:'monospace' }}>{jugador.elo}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>Ranking</div>
          </div>
          <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#fff', fontFamily:'monospace' }}>{jugador.sesiones_usadas}/{jugador.sesiones_limite}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>Sesiones</div>
          </div>
        </div>
      </div>

      {/* Últimas asistencias */}
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', fontSize:13, fontWeight:600, color: text }}>
          Últimas asistencias
        </div>
        {asistencias.length === 0 ? (
          <div style={{ padding:30, textAlign:'center', color: hint, fontSize:13 }}>Sin asistencias registradas</div>
        ) : asistencias.map(a => (
          <div key={a.id} style={{ display:'flex', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
            <span style={{ fontSize:13, color: text }}>{a.fecha}</span>
            <span style={{ fontSize:13, color: muted }}>{a.hora?.slice(0,5)}</span>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}
