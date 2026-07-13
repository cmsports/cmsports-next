'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Trophy, DollarSign, Menu,
  BookOpen, Smartphone, Calendar, User, CreditCard,
  LogOut, BarChart3, X, Swords
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface MobileNavItem {
  label: string
  icon: LucideIcon
  href: string
}

const mobileAdmin: MobileNavItem[] = [
  { label: 'Inicio', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Jugadores', icon: Users, href: '/jugadores' },
  { label: 'Torneos', icon: Trophy, href: '/torneos' },
  { label: 'Finanzas', icon: DollarSign, href: '/finanzas' },
]

const mobileProfesor: MobileNavItem[] = [
  { label: 'Inicio', icon: LayoutDashboard, href: '/dashboard-profesor' },
  { label: 'Clases', icon: BookOpen, href: '/clases' },
  { label: 'Asistencia', icon: Smartphone, href: '/asistencia' },
  { label: 'Alumnos', icon: Users, href: '/jugadores' },
]

const mobileJugador: MobileNavItem[] = [
  { label: 'Perfil', icon: User, href: '/perfil' },
  { label: 'Mis clases', icon: BookOpen, href: '/mis-clases' },
  { label: 'Mi cuenta', icon: CreditCard, href: '/estado-cuenta' },
  { label: 'Torneos', icon: Trophy, href: '/torneos' },
]

const masItemsAdmin: MobileNavItem[] = [
  { label: 'Liga', icon: Swords, href: '/liga' },
  { label: 'Asistencia', icon: BarChart3, href: '/asistencia-stats' },
  { label: 'Clases', icon: BookOpen, href: '/clases' },
  { label: 'Calendario', icon: Calendar, href: '/calendario' },
  { label: 'Finanzas', icon: DollarSign, href: '/finanzas' },
]

const masItemsProfesor: MobileNavItem[] = [
  { label: 'Calendario', icon: Calendar, href: '/calendario' },
  { label: 'Torneos', icon: Trophy, href: '/torneos' },
]

const masItemsJugador: MobileNavItem[] = [
  { label: 'Calendario', icon: Calendar, href: '/calendario' },
  { label: 'Externos', icon: Trophy, href: '/torneos-externos' },
]

export default function MobileNav({ perfil, onLogout }: { perfil: any; onLogout: () => void }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const rol = perfil?.rol
  const mobileNav = rol === 'admin' ? mobileAdmin : rol === 'profesor' ? mobileProfesor : mobileJugador
  const masItems = rol === 'admin' ? masItemsAdmin : rol === 'profesor' ? masItemsProfesor : masItemsJugador

  function navegar(href: string) {
    router.push(href)
    setSheetOpen(false)
  }

  return (
    <>
      {/* Bottom bar */}
      <div className="mobile-nav fixed bottom-0 left-0 right-0 bg-[#0a0c12] border-t border-[var(--border)] z-20 px-1 py-2 hidden">
        <div className="flex justify-around">
          {mobileNav.map(item => {
            const activo = pathname.startsWith(item.href)
            return (
              <div
                key={item.href}
                onClick={() => navegar(item.href)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 cursor-pointer min-w-[50px] text-center ${
                  activo ? 'text-[var(--purple-light)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <item.icon className="size-5" />
                <span className="text-[10px]">{item.label}</span>
              </div>
            )
          })}
          <div
            onClick={() => setSheetOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 cursor-pointer min-w-[50px] text-center text-[var(--text-muted)]"
          >
            <Menu className="size-5" />
            <span className="text-[10px]">Más</span>
          </div>
          <div
            onClick={onLogout}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 cursor-pointer min-w-[50px] text-center text-[var(--text-muted)]"
          >
            <LogOut className="size-5" />
            <span className="text-[10px]">Salir</span>
          </div>
        </div>
      </div>

      {/* Bottom sheet "Más" */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setSheetOpen(false)}>
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60" />
          {/* Sheet */}
          <div
            className="relative bg-[#0a0c12] border-t border-[var(--border)] rounded-t-2xl p-4 pb-8 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-semibold text-[var(--text)]">Más opciones</span>
              <button onClick={() => setSheetOpen(false)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {masItems.map(item => (
                <div
                  key={item.href}
                  onClick={() => navegar(item.href)}
                  className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3.5 text-center cursor-pointer hover:border-[var(--purple-light)] transition-colors"
                >
                  <item.icon className="size-5 mx-auto mb-1 text-[var(--purple-light)]" />
                  <div className="text-[11px] text-[var(--text-muted)]">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
