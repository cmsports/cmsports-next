'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'
import CampanaNotificaciones from '@/components/campana-notificaciones'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AppLayout({ children, perfil }: { children: React.ReactNode; perfil: any }) {
  const router = useRouter()

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)] tabular-nums">
      <Sidebar perfil={perfil} onLogout={cerrarSesion} />

      <div className="ml-[220px] flex-1 p-6 pb-20 main-content">
        {children}
      </div>

      <MobileNav perfil={perfil} onLogout={cerrarSesion} />

      {/* Campana flotante móvil */}
      {(perfil?.rol === 'jugador' || perfil?.rol === 'profesor') && (
        <div className="mobile-bell fixed top-3 right-3 z-30 hidden">
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
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
      `}</style>
    </div>
  )
}
