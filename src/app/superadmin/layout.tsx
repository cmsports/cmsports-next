'use client'

import { useCallback, useEffect, useState, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { Building2, Wallet, LogOut, Settings, ListChecks, Activity, CalendarDays, Database, Download, X, Eye, EyeOff, Menu } from 'lucide-react'
import { useMontos } from '@/lib/ui/MontosProvider'
import ThemeToggle from '@/components/ThemeToggle'
import type { Tables } from '@/types/database'
import { fechaChile } from '@/lib/domain/fechaChile'
import { CLAVE_ULTIMO_RESPALDO, tocaRespaldar } from '@/lib/domain/respaldoAviso'

type Perfil = Tables<'perfiles'>
type Club = Tables<'clubes'>

const nav = [
  { label: 'Clubes', icon: Building2, href: '/superadmin' },
  { label: 'Finanzas', icon: Wallet, href: '/superadmin/finanzas' },
  { label: 'Actividad', icon: Activity, href: '/superadmin/actividad' },
  { label: 'Tareas', icon: ListChecks, href: '/superadmin/tareas' },
  { label: 'Calendario', icon: CalendarDays, href: '/superadmin/calendario' },
  { label: 'Respaldos', icon: Database, href: '/superadmin/respaldos' },
  { label: 'Configuración', icon: Settings, href: '/superadmin/configuracion' },
]

const mobileNav = [
  { label: 'Clubes', icon: Building2, href: '/superadmin' },
  { label: 'Finanzas', icon: Wallet, href: '/superadmin/finanzas' },
  { label: 'Actividad', icon: Activity, href: '/superadmin/actividad' },
]

const mobileNavHrefs = new Set(mobileNav.map(i => i.href))
const masNav = nav.filter(i => !mobileNavHrefs.has(i.href))

type SuperadminContextValue = {
  perfil: Perfil | null
  clubes: Club[]
  administradores: Record<string, { nombre: string | null; email: string | null }>
  conteos: Record<string, number>
  loadingClubes: boolean
  recargarClubes: () => Promise<void>
}

const PerfilContext = createContext<SuperadminContextValue | null>(null)
export function usePerfilSuperadmin() {
  return useContext(PerfilContext)?.perfil
}
export function useClubesSuperadmin() {
  const ctx = useContext(PerfilContext)
  return {
    clubes: ctx?.clubes || [],
    administradores: ctx?.administradores || {},
    conteos: ctx?.conteos || {},
    loading: ctx?.loadingClubes ?? true,
    recargar: ctx?.recargarClubes ?? (async () => {}),
  }
}

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { ocultos: montosOcultos, alternar: alternarMontos } = useMontos()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [clubes, setClubes] = useState<Club[]>([])
  const [administradores, setAdministradores] = useState<Record<string, { nombre: string | null; email: string | null }>>({})
  const [conteos, setConteos] = useState<Record<string, number>>({})
  const [loadingClubes, setLoadingClubes] = useState(true)
  const [masOpen, setMasOpen] = useState(false)

  const recargarClubes = useCallback(async () => {
    setLoadingClubes(true)
    const supabase = createClient()
    const [{ data: c }, { data: j }, { data: admins }] = await Promise.all([
      supabase.from('clubes').select('*').order('nombre'),
      // Sin el filtro de es_externo, un jugador de otro club inscrito de paso
      // en un torneo (fichas es_externo, con su propio club_procedencia desde
      // la migración 126) se contaba como si fuera del plantel del club
      // anfitrión. Sin el de estado, sumaba también a los inactivos/retirados
      // que siguen en la tabla pero ya no cuentan como plantel activo.
      supabase.from('jugadores').select('club_id').eq('estado', 'activo').or('es_externo.is.null,es_externo.eq.false'),
      supabase.from('perfiles').select('club_id,nombre,email').eq('rol', 'admin'),
    ])
    setClubes(c || [])
    const counts: Record<string, number> = {}
    for (const row of j || []) {
      counts[row.club_id] = (counts[row.club_id] || 0) + 1
    }
    setConteos(counts)
    const adminsPorClub: Record<string, { nombre: string | null; email: string | null }> = {}
    for (const admin of admins || []) {
      if (admin.club_id && !adminsPorClub[admin.club_id]) {
        adminsPorClub[admin.club_id] = { nombre: admin.nombre, email: admin.email }
      }
    }
    setAdministradores(adminsPorClub)
    setLoadingClubes(false)
  }, [])

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      if (p?.rol !== 'superadmin') { router.push('/login'); return }
      setPerfil(p)
      setLoading(false)
      void recargarClubes()
    }
    void cargar()
  }, [recargarClubes, router])

  async function cerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
    window.location.href = '/login'
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
    <PerfilContext.Provider value={{ perfil, clubes, administradores, conteos, loadingClubes, recargarClubes }}>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
        <aside className="sidebar" style={{
          width: 220, background: '#ffffff', borderRight: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh', zIndex: 10,
        }}>
          <div style={{ padding: 16, borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: '#3730a3',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Image src="/logo.png" alt="CmSports" width={22} height={22} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
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
            {/* El panel de superadmin tiene su propio layout, así que el
                interruptor de layout-app no llega hasta acá. Va también, que
                es donde se ven el MRR y los planes de todos los clubes. */}
            <button onClick={alternarMontos} title={montosOcultos ? 'Mostrar los montos' : 'Ocultar los montos'} style={{
              width: '100%', padding: '6px 10px', marginBottom: 6,
              background: montosOcultos ? '#ede9fe' : 'transparent',
              border: `1px solid ${montosOcultos ? '#c4b5fd' : '#e2e8f0'}`,
              borderRadius: 7, color: montosOcultos ? '#4f46e5' : '#64748b', fontSize: 12,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {montosOcultos ? <EyeOff size={13} /> : <Eye size={13} />}
              {montosOcultos ? 'Montos ocultos' : 'Ocultar montos'}
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <ThemeToggle />
              <button onClick={cerrarSesion} style={{
                flex: 1, padding: '6px 10px', background: 'transparent',
                border: '1px solid #e2e8f0', borderRadius: 7, color: '#64748b', fontSize: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <LogOut size={13} /> Cerrar sesión
              </button>
            </div>
          </div>
        </aside>

        <main className="main-content" style={{ marginLeft: 220, flex: 1, padding: 24 }}>
          {pathname !== '/superadmin/respaldos' && <AvisoRespaldo onIr={() => router.push('/superadmin/respaldos')} />}
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
                <div key={item.href} onClick={() => router.push(item.href)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '5px 8px', cursor: 'pointer',
                  color: active ? '#4f46e5' : '#94a3b8',
                  fontSize: 10, minWidth: 50, textAlign: 'center',
                }}>
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                  <span>{item.label}</span>
                </div>
              )
            })}
            <div onClick={() => setMasOpen(!masOpen)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '5px 8px', cursor: 'pointer',
              color: masOpen ? '#4f46e5' : '#94a3b8',
              fontSize: 10, minWidth: 50, textAlign: 'center',
            }}>
              <Menu size={20} strokeWidth={masOpen ? 2.2 : 1.8} />
              <span>Más</span>
            </div>
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

        {/* ── MENÚ MÁS (móvil) ── */}
        {masOpen && (
          <div style={{
            position: 'fixed', bottom: 64, left: 0, right: 0,
            background: '#ffffff', borderTop: '1px solid #e2e8f0',
            zIndex: 19, padding: 12,
          }}>
            <button onClick={alternarMontos} style={{
              width: '100%', padding: '10px 12px', marginBottom: 8,
              background: montosOcultos ? '#ede9fe' : '#f8fafc',
              border: `1px solid ${montosOcultos ? '#c4b5fd' : '#e2e8f0'}`,
              borderRadius: 10, color: montosOcultos ? '#4f46e5' : '#64748b',
              fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {montosOcultos ? <EyeOff size={16} /> : <Eye size={16} />}
              {montosOcultos ? 'Mostrar los montos' : 'Ocultar los montos'}
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {masNav.map(item => {
                const Icon = item.icon
                return (
                  <div key={item.href} onClick={() => { router.push(item.href); setMasOpen(false) }}
                    style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0',
                      borderRadius: 10, padding: 14, textAlign: 'center', cursor: 'pointer',
                    }}>
                    <Icon size={20} color="#4f46e5" style={{ margin: '0 auto 4px' }} />
                    <div style={{ fontSize: 11, color: '#64748b' }}>{item.label}</div>
                  </div>
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

        <style>{`
          @media (max-width: 768px) {
            .sidebar { display: none !important; }
            .main-content { margin-left: 0 !important; padding: 12px !important; padding-bottom: 80px !important; padding-top: 12px !important; }
            .mobile-nav { display: block !important; }
          }
        `}</style>
      </div>
    </PerfilContext.Provider>
  )
}

// Cartel semanal: aparece cada domingo en todo el panel y no se va hasta que
// se descarga el respaldo completo. "Ahora no" lo esconde solo hasta que se
// cierre la pestaña, para que no se pierda el domingo entero por un click.
function AvisoRespaldo({ onIr }: { onIr: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function revisar() {
      const oculto = sessionStorage.getItem('cmsports:aviso-respaldo-oculto') === '1'
      setVisible(!oculto && tocaRespaldar(localStorage.getItem(CLAVE_ULTIMO_RESPALDO), fechaChile()))
    }
    revisar()
    window.addEventListener('cmsports:respaldo-hecho', revisar)
    return () => window.removeEventListener('cmsports:respaldo-hecho', revisar)
  }, [])

  if (!visible) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff',
      borderRadius: 12, padding: '14px 16px', marginBottom: 18,
      boxShadow: '0 6px 20px rgba(79,70,229,0.25)',
      animation: 'entraTarjeta var(--normal) var(--curva) both',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Database size={19} />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>DESCARGA LAS BASES DE DATOS</div>
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Respaldo semanal pendiente: guarda el ZIP con todos los datos de todos los clubes.</div>
      </div>
      <button onClick={onIr} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
        background: '#fff', color: '#3730a3', border: 'none', borderRadius: 8,
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
      }}>
        <Download size={14} /> Descargar ahora
      </button>
      <button aria-label="Ocultar aviso" onClick={() => { sessionStorage.setItem('cmsports:aviso-respaldo-oculto', '1'); setVisible(false) }} style={{
        background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', padding: 4, display: 'flex',
      }}>
        <X size={16} />
      </button>
    </div>
  )
}
