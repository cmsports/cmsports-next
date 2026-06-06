'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, usePathname } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const navAdmin = [
  { label:'Dashboard', icon:'📊', href:'/dashboard' },
  { label:'Jugadores', icon:'👥', href:'/jugadores' },
  { label:'Torneos', icon:'🎯', href:'/torneos' },
  { label:'Ranking ELO', icon:'🏆', href:'/ranking' },
  { label:'QR Asistencia', icon:'📱', href:'/asistencia' },
  { label:'Calendario', icon:'📅', href:'/calendario' },
  { label:'Clases', icon:'📚', href:'/clases' },
  { label:'Solicitudes', icon:'📨', href:'/solicitudes' },
  { label:'Mensualidades', icon:'💳', href:'/mensualidades' },
  { label:'Finanzas', icon:'💰', href:'/finanzas' },
]

const navProfesor = [
  { label:'Dashboard', icon:'📊', href:'/dashboard' },
  { label:'Jugadores', icon:'👥', href:'/jugadores' },
  { label:'Torneos', icon:'🎯', href:'/torneos' },
  { label:'Ranking ELO', icon:'🏆', href:'/ranking' },
  { label:'Mis clases', icon:'📚', href:'/clases' },
  { label:'QR Asistencia', icon:'📱', href:'/asistencia' },
  { label:'Calendario', icon:'📅', href:'/calendario' },
]

const navJugador = [
  { label:'Mi perfil', icon:'👤', href:'/perfil' },
  { label:'Mi Estado de Cuenta', icon:'💳', href:'/estado-cuenta' },
  { label:'Ranking ELO', icon:'🏆', href:'/ranking' },
  { label:'Torneos', icon:'🎯', href:'/torneos' },
  { label:'Torneos externos', icon:'🌎', href:'/torneos-externos' },
  { label:'Calendario', icon:'📅', href:'/calendario' },
]

export default function AppLayout({ children, perfil }: { children: React.ReactNode, perfil: any }) {
  const router = useRouter()
  const pathname = usePathname()

  const nav = perfil?.rol === 'admin' ? navAdmin : perfil?.rol === 'profesor' ? navProfesor : navJugador

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0f1117' }}>
      {/* SIDEBAR */}
      <div style={{ width:220, background:'#0a0c12', borderRight:'1px solid #1e2030', display:'flex', flexDirection:'column', position:'fixed', height:'100vh', zIndex:10 }}>
        {/* Logo */}
        <div style={{ padding:'20px 16px', borderBottom:'1px solid #1e2030' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, background:'linear-gradient(135deg,#6c63ff,#a78bfa)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'white' }}>CM</div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>CmSports</div>
              <div style={{ fontSize:11, color:'#6c7280' }}>Club Unión San Bernardo</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'12px 8px', overflowY:'auto' }}>
          {nav.map(item => (
            <div
              key={item.href}
              onClick={() => router.push(item.href)}
              style={{
                display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                borderRadius:8, cursor:'pointer', marginBottom:2,
                background: pathname === item.href ? '#1e1b4b' : 'transparent',
                color: pathname === item.href ? '#a78bfa' : '#8890a4',
                fontSize:13, fontWeight: pathname === item.href ? 600 : 400,
                transition:'all 0.15s'
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        {/* Usuario */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid #1e2030' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#6c63ff,#a78bfa)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'white' }}>
              {perfil?.nombre?.split(' ').map((n:string)=>n[0]).join('').slice(0,2) || 'U'}
            </div>
            <div>
              <div style={{ fontSize:12, color:'#c8cfe0', fontWeight:500 }}>{perfil?.email}</div>
              <div style={{ fontSize:11, color:'#6c7280' }}>
                {perfil?.rol === 'admin' ? '👑 Administrador' : perfil?.rol === 'profesor' ? '👨‍🏫 Profesor' : '🏓 Jugador'}
              </div>
            </div>
          </div>
          <button onClick={cerrarSesion} style={{ width:'100%', padding:'7px', background:'transparent', border:'1px solid #1e2030', borderRadius:8, color:'#6c7280', fontSize:12, cursor:'pointer' }}>
            ↩ Cerrar sesión
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ marginLeft:220, flex:1, padding:24 }}>
        {children}
      </div>
    </div>
  )
}