'use client'

import { useState, useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import CampanaNotificaciones from '@/components/campana-notificaciones'
import { verificarBloqueoPerfil } from '@/app/actions/jugadores'
import { useModulos } from '@/lib/hooks/useModulos'
import {
  LayoutDashboard, Users, Trophy, ClipboardCheck, Calendar,
  BookOpen, CreditCard, DollarSign, User, BarChart2, Globe,
  Receipt, LogOut, Menu, X, Camera, ShoppingBag, Settings,
} from 'lucide-react'
import type { Perfil } from '@/types'

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
  { label: 'Perfil',     icon: User,           href: '/perfil' },
  { label: 'Asistencia', icon: ClipboardCheck,  href: '/asistencia',    modulo: 'asistencia' },
  { label: 'Mis clases', icon: BookOpen,        href: '/mis-clases',    modulo: 'clases' },
  { label: 'Torneos',    icon: Trophy,          href: '/torneos-externos', modulo: 'torneos' },
]

type NavLink = { label: string; icon: LucideIcon; href: string; modulo?: string }
type NavItem = { section: string } | NavLink

const clubNombreCache: Record<string, string> = {}
const clubLogoCache: Record<string, string | null> = {}
const clubTelefonoCache: Record<string, string> = {}

export default function AppLayout({ children, perfil }: { children: React.ReactNode; perfil: Perfil | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const clubId = perfil?.club_id ?? ''
  const [masOpen, setMasOpen] = useState(false)
  const [clubCargado, setClubCargado] = useState<{ id: string; nombre: string } | null>(null)
  const [clubLogoUrl, setClubLogoUrl] = useState<string | null>(() => clubLogoCache[clubId] ?? null)
  const [jugadorBloqueado, setJugadorBloqueado] = useState(false)
  const [clubTelefono, setClubTelefono] = useState('')
  const { tiene } = useModulos()

  useEffect(() => {
    if (!clubId) return
    if (clubNombreCache[clubId]) {
      setClubLogoUrl(clubLogoCache[clubId] ?? null)
      setClubTelefono(clubTelefonoCache[clubId] ?? '')
      return
    }
    let activo = true
    const supabase = createClient()
    supabase.from('clubes').select('nombre,logo_url,telefono').eq('id', clubId).single()
      .then(({ data }) => {
        if (!activo) return
        const nombre = data?.nombre || ''
        const logo = data?.logo_url ?? null
        clubNombreCache[clubId] = nombre
        clubLogoCache[clubId] = logo
        clubTelefonoCache[clubId] = data?.telefono || ''
        setClubCargado({ id: clubId, nombre })
        setClubLogoUrl(logo)
        setClubTelefono(data?.telefono || '')
      })
    return () => { activo = false }
  }, [clubId])

  useEffect(() => {
    if (perfil?.rol !== 'jugador') return
    verificarBloqueoPerfil().then(bloqueado => { if (bloqueado) setJugadorBloqueado(true) })
  }, [perfil?.rol])

  const clubNombre = clubNombreCache[clubId]
    ?? (clubCargado?.id === clubId ? clubCargado.nombre : '')

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
  const masItemsBase = nav.filter(
    (item): item is NavLink => !('section' in item) && !mobileNavHrefs.has(item.href),
  )
  const masItems = [...masItemsBase, { label: 'Configuración', icon: Settings, href: '/configuracion' }]

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

  if (jugadorBloqueado && perfil?.rol === 'jugador') {
    const mensajeWA = encodeURIComponent(
      `Hola! Soy ${perfil?.nombre || 'un jugador'} 👋. Mi cuenta en ${clubNombre || 'el club'} aparece bloqueada y no puedo acceder a la plataforma. ¿Me pueden ayudar a regularizar mi situación? Gracias.`
    )
    const linkWA = clubTelefono
      ? `https://wa.me/${clubTelefono.replace(/[^0-9]/g, '')}?text=${mensajeWA}`
      : null
    return (
      <div style={{ minHeight: '100vh', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#ffffff', border: '2px solid #fecaca', borderRadius: 20, padding: 40, maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 8px 32px rgba(220,38,38,0.12)' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#dc2626', marginBottom: 10, margin: '0 0 10px' }}>Cuenta bloqueada</h1>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 28, margin: '0 0 28px' }}>
            Tu acceso fue suspendido por falta de pago. Para reactivar tu cuenta, comunícate con tu club.
          </p>
          {linkWA && (
            <a href={linkWA} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: '#16a34a', color: '#ffffff', textDecoration: 'none',
              padding: '13px 20px', borderRadius: 10, fontSize: 15, fontWeight: 600,
              marginBottom: 12,
            }}>
              💬 Hablar con el club por WhatsApp
            </a>
          )}
          <button onClick={cerrarSesion} style={{
            width: '100%', padding: '11px 20px',
            background: 'transparent', border: '1px solid #e2e8f0',
            borderRadius: 10, color: '#64748b', fontSize: 14, cursor: 'pointer',
          }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'linear-gradient(160deg,#f0f4ff 0%,#f8fafc 40%,#f0fdf4 100%)' }}>

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
              background: clubLogoUrl ? '#f8fafc' : '#4f46e5',
              border: clubLogoUrl ? '1px solid #e2e8f0' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              overflow: 'hidden',
            }}>
              {clubLogoUrl
                ? <img src={clubLogoUrl} alt={clubNombre || 'Club'} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3 }} />
                : <Image src="/logo.png" alt="CmSports" width={22} height={22} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
              }
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
            <Link href="/configuracion" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 7, color: '#64748b',
                background: 'transparent', textDecoration: 'none',
              }} title="Configuración">
                <Settings size={16} strokeWidth={1.8} />
            </Link>
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
