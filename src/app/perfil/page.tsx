'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import dynamic from 'next/dynamic'

const QRCodeSVG = dynamic(() => import('qrcode.react').then(mod => mod.QRCodeSVG), { ssr: false })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  if (!jugador) return (
    <AppLayout perfil={perfil}>
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:40, textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🏓</div>
        <div style={{ fontSize:16, color:'#c8cfe0', marginBottom:8 }}>Perfil no vinculado</div>
        <div style={{ fontSize:13, color:'#6c7280' }}>Contacta al administrador del club</div>
      </div>
    </AppLayout>
  )

  const iniciales = jugador.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()

  return (
    <AppLayout perfil={perfil}>
      {/* Hero */}
      <div style={{ background:'linear-gradient(135deg,#1e1b4b,#14161f)', border:'1px solid #1e2030', borderRadius:16, padding:24, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
          <div style={{ width:64, height:64, borderRadius:'50%', background:'linear-gradient(135deg,#6c63ff,#a78bfa)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:'white', flexShrink:0 }}>
            {iniciales}
          </div>
          <div>
            <div style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:4 }}>{jugador.nombre}</div>
            <div style={{ fontSize:13, color:'#6c7280' }}>{jugador.categoria}</div>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
          <div style={{ background:'#1e1b4b', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#a78bfa', fontFamily:'monospace' }}>{jugador.elo}</div>
            <div style={{ fontSize:11, color:'#6c7280', marginTop:2 }}>ELO</div>
          </div>
          <div style={{ background:'#1e1b4b', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#c8cfe0', fontFamily:'monospace' }}>{jugador.sesiones_usadas}/{jugador.sesiones_limite}</div>
            <div style={{ fontSize:11, color:'#6c7280', marginTop:2 }}>Sesiones</div>
          </div>
        </div>
      </div>

      {/* QR */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, marginBottom:16, textAlign:'center' }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Mi código QR de ingreso</div>
        <div style={{ background:'white', padding:16, borderRadius:12, display:'inline-block', marginBottom:12 }}>
          <QRCodeSVG
            value={`cmsports:jugador:${jugador.id}`}
            size={160}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
          />
        </div>
        <div style={{ fontSize:12, color:'#6c7280' }}>Muestra este código al ingresar al club</div>
      </div>

      {/* Últimas asistencias */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>
          Últimas asistencias
        </div>
        {asistencias.length === 0 ? (
          <div style={{ padding:30, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin asistencias registradas</div>
        ) : asistencias.map(a => (
          <div key={a.id} style={{ display:'flex', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #1e2030' }}>
            <span style={{ fontSize:13, color:'#c8cfe0' }}>{a.fecha}</span>
            <span style={{ fontSize:13, color:'#6c7280' }}>{a.hora?.slice(0,5)}</span>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}
