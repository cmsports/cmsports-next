'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { Building2, Plus, LogIn } from 'lucide-react'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12 } as const

export default function SuperadminPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clubes, setClubes] = useState<any[]>([])
  const [conteos, setConteos] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ nombre: '', ciudad: '', deporte: 'tenis de mesa' })
  const [guardando, setGuardando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      if (p?.rol !== 'superadmin') { router.push('/login'); return }
      setPerfil(p)
      await cargarClubes()
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarClubes() {
    const { data } = await supabase.from('clubes').select('*').order('nombre')
    setClubes(data || [])
    const counts: Record<string, number> = {}
    for (const c of data || []) {
      const { count } = await supabase.from('jugadores').select('id', { count: 'exact', head: true }).eq('club_id', c.id)
      counts[c.id] = count || 0
    }
    setConteos(counts)
  }

  async function crearClub() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    const { error } = await supabase.from('clubes').insert({
      nombre: form.nombre.trim(),
      ciudad: form.ciudad.trim() || null,
      deporte: form.deporte.trim() || null,
    })
    setGuardando(false)
    if (error) return
    setModalOpen(false)
    setForm({ nombre: '', ciudad: '', deporte: 'tenis de mesa' })
    await cargarClubes()
  }

  async function gestionarClub(clubId: string) {
    await supabase.from('perfiles').update({ club_id: clubId }).eq('id', perfil.id)
    router.push('/dashboard')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <div style={{ color: '#94a3b8', fontSize: 14 }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
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
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
              {conteos[c.id] ?? 0} jugador{(conteos[c.id] ?? 0) === 1 ? '' : 'es'}
            </div>
            <button onClick={() => gestionarClub(c.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 7, fontSize: 12, color: '#1e293b', cursor: 'pointer',
            }}>
              <LogIn size={13} /> Gestionar este club
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
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModalOpen(false)} style={{
                flex: 1, padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 7, fontSize: 12, color: '#64748b', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={crearClub} disabled={guardando} style={{
                flex: 1, padding: '8px', background: '#4f46e5', border: 'none',
                borderRadius: 7, fontSize: 12, color: '#fff', cursor: 'pointer', opacity: guardando ? 0.6 : 1,
              }}>{guardando ? 'Creando...' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
