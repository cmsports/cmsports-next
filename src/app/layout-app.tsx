'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, usePathname } from 'next/navigation'
import CampanaNotificaciones from '@/components/campana-notificaciones'

const navAdmin = [
  { label:'Dashboard', icon:'📊', href:'/dashboard' },
  { label:'Jugadores', icon:'👥', href:'/jugadores' },
  { label:'Torneos', icon:'🎯', href:'/torneos' },
  { label:'Asistencia', icon:'📈', href:'/asistencia-stats' },
  { label:'Calendario', icon:'📅', href:'/calendario' },
  { label:'Clases', icon:'📚', href:'/clases' },
  { label:'Mensualidades', icon:'💳', href:'/mensualidades' },
  { label:'Finanzas', icon:'💰', href:'/finanzas' },
]

const navProfesor = [
  { label:'Dashboard', icon:'📊', href:'/dashboard-profesor' },
  { label:'Jugadores', icon:'👥', href:'/jugadores' },
  { label:'Torneos', icon:'🎯', href:'/torneos' },
  { label:'Ranking ELO', icon:'🏆', href:'/ranking' },
  { label:'Mis clases', icon:'📚', href:'/clases' },
  { label:'Asistencia', icon:'📱', href:'/asistencia' },
  { label:'Calendario', icon:'📅', href:'/calendario' },
]

const navJugador = [
  { label:'Mi perfil', icon:'👤', href:'/perfil' },
  { label:'Mis clases', icon:'📚', href:'/mis-clases' },
  { label:'Mi Estado de Cuenta', icon:'💳', href:'/estado-cuenta' },
  { label:'Torneos', icon:'🎯', href:'/torneos' },
  { label:'Torneos externos', icon:'🌎', href:'/torneos-externos' },
  { label:'Calendario', icon:'📅', href:'/calendario' },
  { label:'Ranking ELO', icon:'🏆', href:'/ranking' },
]

const mobileNavAdmin = [
  { label:'Inicio', icon:'📊', href:'/dashboard' },
  { label:'Jugadores', icon:'👥', href:'/jugadores' },
  { label:'Torneos', icon:'🎯', href:'/torneos' },
  { label:'Finanzas', icon:'💰', href:'/finanzas' },
  { label:'Más', icon:'☰', href:'#mas' },
]

const mobileNavProfesor = [
  { label:'Inicio', icon:'📊', href:'/dashboard-profesor' },
  { label:'Clases', icon:'📚', href:'/clases' },
  { label:'Asistencia', icon:'📱', href:'/asistencia' },
  { label:'Alumnos', icon:'👥', href:'/jugadores' },
  { label:'Calendario', icon:'📅', href:'/calendario' },
]

const mobileNavJugador = [
  { label:'Perfil', icon:'👤', href:'/perfil' },
  { label:'Mis clases', icon:'📚', href:'/mis-clases' },
  { label:'Mi cuenta', icon:'💳', href:'/estado-cuenta' },
  { label:'Torneos', icon:'🎯', href:'/torneos' },
  { label:'Calendario', icon:'📅', href:'/calendario' },
]

export default function AppLayout({ children, perfil }: { children: React.ReactNode, perfil: any }) {
  const router = useRouter()
  const pathname = usePathname()
  const [masOpen, setMasOpen] = useState(false)

  const nav = perfil?.rol === 'admin' ? navAdmin : perfil?.rol === 'profesor' ? navProfesor : navJugador
  const mobileNav = perfil?.rol === 'admin' ? mobileNavAdmin : perfil?.rol === 'profesor' ? mobileNavProfesor : mobileNavJugador

  async function cerrarSesion() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0f1117' }}>
      {/* SIDEBAR desktop */}
      <div className="sidebar" style={{ width:220, background:'#0a0c12', borderRight:'1px solid #1e2030', display:'flex', flexDirection:'column', position:'fixed', height:'100vh', zIndex:10 }}>
        <div style={{ padding:'20px 16px', borderBottom:'1px solid #1e2030' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, background:'linear-gradient(135deg,#6c63ff,#a78bfa)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'white' }}>CM</div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>CmSports</div>
              <div style={{ fontSize:11, color:'#6c7280' }}>Club Unión San Bernardo</div>
            </div>
          </div>
        </div>
        <nav style={{ flex:1, padding:'12px 8px', overflowY:'auto' }}>
          {nav.map(item => (
            <div key={item.href} onClick={() => router.push(item.href)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, cursor:'pointer', marginBottom:2, background: pathname.startsWith(item.href) && item.href !== '/' ? '#1e1b4b' : 'transparent', color: pathname.startsWith(item.href) && item.href !== '/' ? '#a78bfa' : '#8890a4', fontSize:13, fontWeight: pathname.startsWith(item.href) ? 600 : 400, transition:'all 0.15s' }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </div>
          ))}
        </nav>
        <div style={{ padding:'12px 16px', borderTop:'1px solid #1e2030' }}>
          {(perfil?.rol === 'jugador' || perfil?.rol === 'profesor') && (
            <div style={{ marginBottom:10 }}>
              <CampanaNotificaciones perfil={perfil} />
            </div>
          )}
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
      <div style={{ marginLeft:220, flex:1, padding:24, paddingBottom:80 }} className="main-content">
        {children}
      </div>

      {/* NAV MÓVIL */}
      <div style={{ display:'none', position:'fixed', bottom:0, left:0, right:0, background:'#0a0c12', borderTop:'1px solid #1e2030', zIndex:20, padding:'8px 4px' }} className="mobile-nav">
        <div style={{ display:'flex', justifyContent:'space-around' }}>
          {mobileNav.map(item => {
            const activo = pathname.startsWith(item.href) && item.href !== '#mas'
            return (
              <div key={item.href} onClick={() => item.href === '#mas' ? setMasOpen(!masOpen) : router.push(item.href)}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'6px 8px', cursor:'pointer', color: activo ? '#a78bfa' : '#6c7280', fontSize:10, minWidth:50, textAlign:'center' }}>
                <span style={{ fontSize:20 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
          <div onClick={cerrarSesion} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'6px 8px', cursor:'pointer', color:'#6c7280', fontSize:10, minWidth:50, textAlign:'center' }}>
            <span style={{ fontSize:20 }}>↩️</span>
            <span>Salir</span>
          </div>
        </div>
      </div>

      {/* MENÚ MÁS (admin móvil) */}
      {masOpen && (
        <div style={{ position:'fixed', bottom:64, left:0, right:0, background:'#0a0c12', borderTop:'1px solid #1e2030', zIndex:19, padding:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {[
              { label:'Mensualidades', icon:'💳', href:'/mensualidades' },
              { label:'Ranking', icon:'🏆', href:'/ranking' },
              { label:'Asistencia', icon:'📈', href:'/asistencia-stats' },
              { label:'Clases', icon:'📚', href:'/clases' },
              { label:'Calendario', icon:'📅', href:'/calendario' },
              { label:'Finanzas', icon:'💰', href:'/finanzas' },
            ].map(item => (
              <div key={item.href} onClick={() => { router.push(item.href); setMasOpen(false) }}
                style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:10, padding:14, textAlign:'center', cursor:'pointer' }}>
                <div style={{ fontSize:22, marginBottom:4 }}>{item.icon}</div>
                <div style={{ fontSize:11, color:'#8890a4' }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campana flotante móvil — solo jugador y profesor */}
      {(perfil?.rol === 'jugador' || perfil?.rol === 'profesor') && (
        <div className="mobile-bell" style={{ position:'fixed', top:12, right:12, zIndex:30, display:'none' }}>
          <CampanaNotificaciones perfil={perfil} />
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .sidebar { display: none !important; }
          .main-content { margin-left: 0 !important; padding: 12px !important; padding-bottom: 80px !important; padding-top: 56px !important; }
          .mobile-nav { display: block !important; }
          .mobile-bell { display: block !important; }
        }
      `}</style>
    </div>
  )
}
