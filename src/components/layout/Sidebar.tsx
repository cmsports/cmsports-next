'use client'

import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Trophy, BarChart3, Calendar, BookOpen,
  CreditCard, DollarSign, User, Smartphone, Globe, Award,
  LogOut
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import CampanaNotificaciones from '@/components/campana-notificaciones'

interface NavItem {
  label: string
  icon: LucideIcon
  href: string
}

const navAdmin: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Jugadores', icon: Users, href: '/jugadores' },
  { label: 'Torneos', icon: Trophy, href: '/torneos' },
  { label: 'Asistencia', icon: BarChart3, href: '/asistencia-stats' },
  { label: 'Calendario', icon: Calendar, href: '/calendario' },
  { label: 'Clases', icon: BookOpen, href: '/clases' },
  { label: 'Mensualidades', icon: CreditCard, href: '/mensualidades' },
  { label: 'Finanzas', icon: DollarSign, href: '/finanzas' },
]

const navProfesor: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard-profesor' },
  { label: 'Mis clases', icon: BookOpen, href: '/clases' },
  { label: 'Asistencia', icon: Smartphone, href: '/asistencia' },
  { label: 'Calendario', icon: Calendar, href: '/calendario' },
  { label: 'Jugadores', icon: Users, href: '/jugadores' },
  { label: 'Ranking', icon: Award, href: '/ranking' },
  { label: 'Torneos', icon: Trophy, href: '/torneos' },
]

const navJugador: NavItem[] = [
  { label: 'Mi perfil', icon: User, href: '/perfil' },
  { label: 'Mis clases', icon: BookOpen, href: '/mis-clases' },
  { label: 'Mi Estado de Cuenta', icon: CreditCard, href: '/estado-cuenta' },
  { label: 'Torneos', icon: Trophy, href: '/torneos' },
  { label: 'Torneos externos', icon: Globe, href: '/torneos-externos' },
  { label: 'Calendario', icon: Calendar, href: '/calendario' },
  { label: 'Ranking', icon: Award, href: '/ranking' },
]

export function getNavItems(rol: string | undefined): NavItem[] {
  if (rol === 'admin') return navAdmin
  if (rol === 'profesor') return navProfesor
  return navJugador
}

function getRolLabel(rol: string | undefined) {
  if (rol === 'admin') return 'Administrador'
  if (rol === 'profesor') return 'Profesor'
  return 'Jugador'
}

export default function Sidebar({ perfil, onLogout }: { perfil: any; onLogout: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const nav = getNavItems(perfil?.rol)

  const iniciales = perfil?.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'U'

  return (
    <div className="sidebar w-[220px] bg-[#0a0c12] border-r border-[var(--border)] flex flex-col fixed h-screen z-10">
      {/* Logo */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="CmSports" width={36} height={36} />
          <div>
            <div className="text-[15px] font-bold text-[var(--text)]">CmSports</div>
            <div className="text-[11px] text-[var(--text-muted)]">Club Unión San Bernardo</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-y-auto">
        {nav.map(item => {
          const activo = pathname.startsWith(item.href) && item.href !== '/'
          return (
            <div
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer mb-0.5 text-[13px] transition-all ${
                activo
                  ? 'bg-[#1e1b4b] text-[var(--purple-light)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/5'
              }`}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border)]">
        {(perfil?.rol === 'jugador' || perfil?.rol === 'profesor') && (
          <div className="mb-2.5">
            <CampanaNotificaciones perfil={perfil} />
          </div>
        )}
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--purple)] to-[var(--purple-light)] flex items-center justify-center text-xs font-bold text-white">
            {iniciales}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-[var(--text)] font-medium truncate">{perfil?.email}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{getRolLabel(perfil?.rol)}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-transparent border border-[var(--border)] rounded-lg text-[var(--text-muted)] text-xs cursor-pointer hover:text-[var(--text)] hover:border-[var(--purple-light)] transition-colors"
        >
          <LogOut className="size-3.5" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
