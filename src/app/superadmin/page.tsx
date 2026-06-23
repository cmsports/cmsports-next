'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Building2, Plus, LogIn, Users, Wallet, ShieldCheck } from 'lucide-react'
import { usePerfilSuperadmin, useClubesSuperadmin } from './layout'
import { crearClub } from '@/app/actions/superadmin'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12 } as const

function formatCLP(n: number) {
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
}

export default function SuperadminPage() {
  const perfil = usePerfilSuperadmin()
  const { refetchPerfil } = usePerfil()
  const { clubes, conteos, loading, recargar } = useClubesSuperadmin()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ nombre: '', ciudad: '', deporte: 'tenis de mesa', planMensual: '' })
  const [guardando, setGuardando] = useState(false)
  const [gestionandoId, setGestionandoId] = useState<string | null>(null)
  const router = useRouter()

  async function handleCrearClub() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    const res = await crearClub({
      nombre: form.nombre,
      ciudad: form.ciudad,
      deporte: form.deporte,
      planMensual: Number(form.planMensual) || 0,
    })
    setGuardando(false)
    if (res?.error) return
    setModalOpen(false)
    setForm({ nombre: '', ciudad: '', deporte: 'tenis de mesa', planMensual: '' })
    await recargar()
  }

  async function gestionarClub(clubId: string) {
    setGestionandoId(clubId)
    await supabase.from('perfiles').update({ club_id: clubId }).eq('id', perfil.id)
    await refetchPerfil()
    router.push('/dashboard')
  }

  if (loading) return (
    <div style={{ color: '#94a3b8', fontSize: 14, padding: 24 }}>Cargando...</div>
  )

  const totalJugadores = Object.values(conteos).reduce((a, b) => a + b, 0)
  const mrr = clubes.reduce((a, c) => a + (c.plan_mensual || 0), 0)
  const clubesAlDia = clubes.filter(c => c.estado_pago === 'pagado').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Clubes</h1>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>Gestiona todos los clubes de CmSports</p>
        </div>
        <button onClick={() => setModalOpen(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', background: '#4f46e5', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          <Plus size={15} /> Crear club nuevo
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Clubes activos', value: clubes.length, icon: Building2, color: '#4f46e5' },
          { label: 'Jugadores totales', value: totalJugadores, icon: Users, color: '#0891b2' },
          { label: 'MRR (ingreso mensual)', value: formatCLP(mrr), icon: Wallet, color: '#16a34a' },
          { label: 'Clubes al día', value: `${clubesAlDia}/${clubes.length}`, icon: ShieldCheck, color: '#d97706' },
        ].map(m => (
          <div key={m.label} style={{ ...card, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <m.icon size={15} color={m.color} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{m.label}</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#0f172a' }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {clubes.map(c => (
          <div key={c.id} style={{ ...card, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: '#ede9fe',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Building2 size={18} color="#4f46e5" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{c.nombre}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.ciudad || 'Sin ciudad'}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
              {conteos[c.id] ?? 0} jugador{(conteos[c.id] ?? 0) === 1 ? '' : 'es'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
              Plan: {formatCLP(c.plan_mensual || 0)}/mes
            </div>
            <button onClick={() => gestionarClub(c.id)} disabled={gestionandoId === c.id} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 7, fontSize: 12, color: '#1e293b', cursor: gestionandoId === c.id ? 'not-allowed' : 'pointer',
              opacity: gestionandoId === c.id ? 0.6 : 1,
            }}>
              <LogIn size={13} /> {gestionandoId === c.id ? 'Entrando...' : 'Gestionar este club'}
            </button>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => setModalOpen(false)}>
          <div style={{ ...card, padding: 20, width: 360 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 14 }}>Crear club nuevo</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Nombre del club" value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <input placeholder="Ciudad" value={form.ciudad}
                onChange={e => setForm({ ...form, ciudad: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <input placeholder="Deporte" value={form.deporte}
                onChange={e => setForm({ ...form, deporte: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <input placeholder="Plan mensual (CLP)" type="number" value={form.planMensual}
                onChange={e => setForm({ ...form, planMensual: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModalOpen(false)} style={{
                flex: 1, padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 7, fontSize: 12, color: '#64748b', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={handleCrearClub} disabled={guardando} style={{
                flex: 1, padding: '8px', background: '#4f46e5', border: 'none',
                borderRadius: 7, fontSize: 12, color: '#fff', cursor: 'pointer', opacity: guardando ? 0.6 : 1,
              }}>{guardando ? 'Creando...' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
