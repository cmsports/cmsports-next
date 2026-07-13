'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import CampanaNotificaciones from '@/components/campana-notificaciones'
import { useModulos } from '@/lib/hooks/useModulos'
import {
  LayoutDashboard, Users, Trophy, ClipboardCheck, Calendar,
  BookOpen, CreditCard, DollarSign, User, BarChart2, Globe,
  Receipt, LogOut, Menu, X, Camera, ShoppingBag, Settings,
} from 'lucide-react'

const navAdmin = [
  { section: 'Principal' },
  { label: 'Dashboard',     icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Jugadores',     icon: Users,            href: '/jugadores' },
  { label: 'Torneos',       icon: Trophy,           href: '/torneos',    modulo: 'torneos' },
  { label: 'Liga',          icon: BarChart2,        href: '/liga',       modulo: 'liga' },
  { section: 'Gestión' },
  { label: 'Clases',        icon: BookOpen,         href: '/clases',     modulo: 'clases' },
  { label: 'Calendario',    icon: Calendar,         href: '/calendario', modulo: 'calendario' },
  { label: 'Finanzas',      icon: DollarSign,       href: '/finanzas',   modulo: 'finanzas' },
  { section: 'Marketing' },
  { label: 'Redes Sociales', icon: Camera,          href: '/redes-sociales', modulo: 'redes' },
  { label: 'Tienda DoubleTT', icon: ShoppingBag,    href: '/tienda',     modulo: 'tienda' },
]

const navProfesor = [
  { section: 'Principal' },
  { label: 'Dashboard',  icon: LayoutDashboard, href: '/dashboard-profesor' },
  { label: 'Jugadores',  icon: Users,           href: '/jugadores' },
  { section: 'Gestión' },
  { label: 'Mis clases', icon: BookOpen,        href: '/clases',     modulo: 'clases' },
  { label: 'Calendario', icon: Calendar,        href: '/calendario', modulo: 'calendario' },
  { label: 'Torneos',    icon: Trophy,          href: '/torneos',    modulo: 'torneos' },
  { section: 'Tienda' },
  { label: 'Tienda DoubleTT', icon: ShoppingBag,    href: '/tienda', modulo: 'tienda' },
]

const navJugador = [
  { section: 'Mi cuenta' },
  { label: 'Mi perfil',           icon: User,          href: '/perfil' },
  { label: 'Mi Estado de Cuenta', icon: Receipt,       href: '/estado-cuenta', modulo: 'mensualidades' },
  { label: 'Asistencia',          icon: ClipboardCheck,href: '/asistencia',    modulo: 'asistencia' },
  { section: 'Club' },
  { label: 'Mis clases',          icon: BookOpen,      href: '/mis-clases',    modulo: 'clases' },
  { label: 'Torneos externos',    icon: Globe,         href: '/torneos-externos', modulo: 'torneos' },
  { label: 'Calendario',          icon: Calendar,      href: '/calendario',    modulo: 'calendario' },
  { section: 'Tienda' },
  { label: 'Tienda DoubleTT', icon: ShoppingBag,    href: '/tienda', modulo: 'tienda' },
]

const mobileNavAdmin = [
  { label: 'Inicio',     icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Jugadores',  icon: Users,            href: '/jugadores' },
  { label: 'Torneos',    icon: Trophy,           href: '/torneos',  modulo: 'torneos' },
  { label: 'Finanzas',   icon: DollarSign,       href: '/finanzas', modulo: 'finanzas' },
]

const mobileNavProfesor = [
  { label: 'Inicio',     icon: LayoutDashboard, href: '/dashboard-profesor' },
  { label: 'Clases',     icon: BookOpen,        href: '/clases',     modulo: 'clases' },
  { label: 'Asistencia', icon: ClipboardCheck,  href: '/asistencia', modulo: 'asistencia' },
  { label: 'Alumnos',    icon: Users,           href: '/jugadores' },
]

const mobileNavJugador = [
  { label: 'Perfil',     icon: User,          href: '/perfil' },
  { label: 'Asistencia', icon: ClipboardCheck, href: '/asistencia',    modulo: 'asistencia' },
  { label: 'Mis clases', icon: BookOpen,      href: '/mis-clases',    modulo: 'clases' },
  { label: 'Mi cuenta',  icon: CreditCard,    href: '/estado-cuenta', modulo: 'mensualidades' },
]

type NavItem = { section: string } | { label: string; icon: any; href: string; modulo?: string }

const clubNombreCache: Record<string, string> = {}

export default function AppLayout({ children, perfil }: { children: React.ReactNode; perfil: any }) {
  const router = useRouter()
  const pathname = usePathname()
  const [masOpen, setMasOpen] = useState(false)
  const [clubNombre, setClubNombre] = useState(() => clubNombreCache[perfil?.club_id] || '')
  const { tiene } = useModulos()

  useEffect(() => {
    if (!perfil?.club_id) return
    if (clubNombreCache[perfil.club_id]) {
      setClubNombre(clubNombreCache[perfil.club_id])
      return
    }
    const supabase = createClient()
    supabase.from('clubes').select('nombre').eq('id', perfil.club_id).single()
      .then(({ data }) => {
        const nombre = data?.nombre || ''
        clubNombreCache[perfil.club_id] = nombre
        setClubNombre(nombre)
      })
  }, [perfil?.club_id])

  const esAdminOSuperadmin = perfil?.rol === 'admin' || perfil?.rol === 'superadmin'
  const navRaw: NavItem[] = esAdminOSuperadmin ? navAdmin : perfil?.rol === 'profesor' ? navProfesor : navJugador
  const mobileNavRaw = esAdminOSuperadmin ? mobileNavAdmin : perfil?.rol === 'profesor' ? mobileNavProfesor : mobileNavJugador

  // Filtrar items por módulos habilitados, eliminar secciones vacías
  const filtrado = navRaw.filter(item => !('section' in item) ? (!item.modulo || tiene(item.modulo)) : true)
  const nav = filtrado.filter((item, i) => {
    if (!('section' in item)) return true
    const next = filtrado[i + 1]
    return next && !('section' in next)
  })
  const mobileNav = mobileNavRaw.filter(item => !item.modulo || tiene(item.modulo))

  const mobileNavHrefs = new Set(mobileNav.map((item) => item.href))
  const masItems = nav.filter(
    (item): item is { label: string; icon: any; href: string } => !('section' in item) && !mobileNavHrefs.has(item.href),
  )

  const initials = perfil?.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'U'
  const rolLabel = perfil?.rol === 'superadmin' ? 'Superadmin' : perfil?.rol === 'admin' ? 'Administrador' : perfil?.rol === 'profesor' ? 'Profesor' : 'Jugador'

  async function cerrarSesion() {
    const supabase = createClient()
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } finally {
      window.location.href = '/login'
    }
  }

  function isActive(href: string) {
    return pathname.startsWith(href) && href !== '/' && href !== '#mas'
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>

      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="sidebar" style={{
        width: 220,
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        height: '100vh',
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: '#4f46e5',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Image src="/logo.png" alt="CmSports" width={22} height={22} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>CmSports</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{clubNombre || 'CmSports'}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
          {nav.map((item, i) => {
            if ('section' in item) {
              return (
                <div key={`s-${i}`} style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#64748b',
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  padding: '10px 10px 4px',
                  marginTop: i === 0 ? 0 : 4,
                }}>
                  {item.section}
                </div>
              )
            }
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 10px',
                paddingLeft: active ? 9 : 10,
                borderRadius: 7,
                cursor: 'pointer',
                marginBottom: 1,
                background: active ? '#4f46e5' : 'transparent',
                color: active ? '#ffffff' : '#1e293b',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                borderLeft: active ? '3px solid #3730a3' : '3px solid transparent',
                transition: 'all 0.12s',
                textDecoration: 'none',
              }}>
                <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <CampanaNotificaciones perfil={perfil} placement="top" />
            {esAdminOSuperadmin && (
              <Link href="/configuracion" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 7, color: '#64748b',
                background: 'transparent', textDecoration: 'none',
              }} title="Configuración">
                <Settings size={16} strokeWidth={1.8} />
              </Link>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#ede9fe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, color: '#3730a3', flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {perfil?.email}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{rolLabel}</div>
            </div>
          </div>
          {perfil?.rol === 'superadmin' && (
            <button onClick={() => router.push('/superadmin')} style={{
              width: '100%',
              padding: '6px 10px',
              marginBottom: 6,
              background: 'transparent',
              border: '1px solid #e2e8f0',
              borderRadius: 7,
              color: '#4f46e5',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}>
              Volver a Superadmin
            </button>
          )}
          <button onClick={cerrarSesion} style={{
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            border: '1px solid #e2e8f0',
            borderRadius: 7,
            color: '#64748b',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}>
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <main style={{ marginLeft: 220, flex: 1, padding: 24, paddingBottom: 80 }} className="main-content">
        {children}
      </main>

      {/* ── NAV MÓVIL ── */}
      <div style={{
        display: 'none',
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        zIndex: 20,
        padding: '6px 4px 8px',
      }} className="mobile-nav">
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {mobileNav.map(item => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link key={item.href}
                href={item.href}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '5px 8px', cursor: 'pointer',
                  color: active ? '#4f46e5' : '#94a3b8',
                  fontSize: 10, minWidth: 50, textAlign: 'center',
                  textDecoration: 'none',
                }}>
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
              </Link>
            )
          })}
          {masItems.length > 0 && (
            <div onClick={() => setMasOpen(!masOpen)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '5px 8px', cursor: 'pointer',
              color: masOpen ? '#4f46e5' : '#94a3b8',
              fontSize: 10, minWidth: 50, textAlign: 'center',
            }}>
              <Menu size={20} strokeWidth={masOpen ? 2.2 : 1.8} />
              <span>Más</span>
            </div>
          )}
          <div onClick={cerrarSesion} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '5px 8px', cursor: 'pointer',
            color: '#94a3b8', fontSize: 10, minWidth: 50, textAlign: 'center',
          }}>
            <LogOut size={20} strokeWidth={1.8} />
            <span>Salir</span>
          </div>
        </div>
      </div>

      {/* ── MENÚ MÁS (móvil, todos los roles) ── */}
      {masOpen && masItems.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 64, left: 0, right: 0,
          background: '#ffffff', borderTop: '1px solid #e2e8f0',
          zIndex: 19, padding: 12,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {masItems.map(item => {
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} onClick={() => setMasOpen(false)}
                  style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 10, padding: 14, textAlign: 'center', cursor: 'pointer',
                    textDecoration: 'none', display: 'block',
                  }}>
                  <Icon size={20} color="#4f46e5" style={{ margin: '0 auto 4px' }} />
                  <div style={{ fontSize: 11, color: '#64748b' }}>{item.label}</div>
                </Link>
              )
            })}
          </div>
          <button onClick={() => setMasOpen(false)} style={{
            width: '100%', marginTop: 8, padding: '8px',
            background: 'transparent', border: '1px solid #e2e8f0',
            borderRadius: 8, color: '#64748b', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <X size={13} /> Cerrar
          </button>
        </div>
      )}

      {/* ── CAMPANA MÓVIL ── */}
      <div className="mobile-bell" style={{ position: 'fixed', top: 12, right: 12, zIndex: 30, display: 'none' }}>
        <CampanaNotificaciones perfil={perfil} />
      </div>

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
