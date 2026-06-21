'use client'

import { useEffect, useState, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { Building2, Wallet, LogOut } from 'lucide-react'

const nav = [
  { label: 'Clubes', icon: Building2, href: '/superadmin' },
  { label: 'Finanzas', icon: Wallet, href: '/superadmin/finanzas' },
]

const PerfilContext = createContext<any>(null)
export function usePerfilSuperadmin() {
  return useContext(PerfilContext)
}

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      if (p?.rol !== 'superadmin') { router.push('/login'); return }
      setPerfil(p)
      setLoading(false)
    }
    cargar()
  }, [])

  async function cerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/login')
  }

  function isActive(href: string) {
    return href === '/superadmin' ? pathname === href : pathname.startsWith(href)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <div style={{ color: '#94a3b8', fontSize: 14 }}>Cargando...</div>
    </div>
  )

  const initials = perfil?.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'SA'

  return (
    <PerfilContext.Provider value={perfil}>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
        <aside style={{
          width: 220, background: '#ffffff', borderRight: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh', zIndex: 10,
        }}>
          <div style={{ padding: 16, borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: '#3730a3',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <img src="/logo.png" alt="CmSports" style={{ width: 22, height: 22, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>CmSports</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Panel Superadmin</div>
              </div>
            </div>
          </div>

          <nav style={{ flex: 1, padding: 8 }}>
            {nav.map(item => {
              const active = isActive(item.href)
              const Icon = item.icon
              return (
                <div key={item.href} onClick={() => router.push(item.href)} style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '7px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 1,
                  background: active ? '#4f46e5' : 'transparent',
                  color: active ? '#ffffff' : '#1e293b',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  borderLeft: active ? '3px solid #3730a3' : '3px solid transparent',
                }}>
                  <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                  <span>{item.label}</span>
                </div>
              )
            })}
          </nav>

          <div style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', background: '#ede9fe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: '#3730a3', flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {perfil?.email}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Superadmin</div>
              </div>
            </div>
            <button onClick={cerrarSesion} style={{
              width: '100%', padding: '6px 10px', background: 'transparent',
              border: '1px solid #e2e8f0', borderRadius: 7, color: '#64748b', fontSize: 12,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <LogOut size={13} /> Cerrar sesión
            </button>
          </div>
        </aside>

        <main style={{ marginLeft: 220, flex: 1, padding: 24 }}>
          {children}
        </main>
      </div>
    </PerfilContext.Provider>
  )
}
