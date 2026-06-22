'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { Link2, Copy, Check, UserCheck, XCircle } from 'lucide-react'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { aprobarSolicitud, rechazarSolicitud } from '@/app/actions/solicitudes'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const muted = '#64748b'
const text  = '#0f172a'
const hint  = '#94a3b8'

export default function SolicitudesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [linkInvitacion, setLink]     = useState('')
  const [loading, setLoading]         = useState(true)
  const [copiado, setCopiado]         = useState(false)
  const [modalAprobar, setModalAprobar] = useState<any>(null)
  const [planForm, setPlanForm]       = useState({ categoria: 'principiante', tipo_plan: 'mensual', entrenamientos_por_semana: '3', mensualidad: '30000' })
  const [aprobando, setAprobando]     = useState(false)
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  const PRESETS = [
    { label: '$15.000', valor: 15000, ent: 1 },
    { label: '$25.000', valor: 25000, ent: 2 },
    { label: '$30.000', valor: 30000, ent: 3 },
    { label: '$40.000', valor: 40000, ent: 4 },
  ]

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) {
      cargarSolicitudes(perfil.club_id).then(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [authLoading, perfil])

  async function cargarSolicitudes(cid?: string) {
    const id = cid || clubId
    let { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', id).eq('activa', true).limit(1)
    if (!inv?.length) {
      await supabase.from('invitaciones').insert({ club_id: id })
      const { data: newInv } = await supabase.from('invitaciones').select('*').eq('club_id', id).eq('activa', true).limit(1)
      inv = newInv
    }
    const codigo = inv?.[0]?.codigo || ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    setLink(`${origin}/registro?club=${id}&code=${codigo}`)
    const { data } = await supabase.from('solicitudes_jugador').select('*').eq('club_id', id).order('creado_en', { ascending: false })
    setSolicitudes(data || [])
  }

  async function confirmarAprobar() {
    if (!modalAprobar) return
    setAprobando(true)
    const s   = modalAprobar
    const ent = planForm.tipo_plan === 'libre' ? null : parseInt(planForm.entrenamientos_por_semana) || 3
    const ses = planForm.tipo_plan === 'libre' ? 99 : (ent || 3) * 4
    await aprobarSolicitud({
      solicitudId: s.id, nombre: s.nombre, rut: s.rut || '', email: s.email || '', telefono: s.telefono || '',
      categoria: planForm.categoria, tipo_plan: planForm.tipo_plan, entrenamientos_por_semana: ent,
      mensualidad: parseInt(planForm.mensualidad) || 0, sesiones_limite: ses,
    })
    setModalAprobar(null); setAprobando(false); cargarSolicitudes()
  }

  async function rechazar(id: string) {
    if (!confirm('¿Rechazar esta solicitud?')) return
    await rechazarSolicitud({ solicitudId: id })
    cargarSolicitudes()
  }

  function copiarLink() {
    navigator.clipboard.writeText(linkInvitacion)
    setCopiado(true); setTimeout(() => setCopiado(false), 2000)
  }

  const estadoBadge: Record<string, { bg: string; color: string }> = {
    pendiente: { bg: '#fffbeb', color: '#d97706' },
    aprobado:  { bg: '#f0fdf4', color: '#16a34a' },
    rechazado: { bg: '#fef2f2', color: '#dc2626' },
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8edf4' }}><div style={{ color: hint }}>Cargando...</div></div>

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: text }}>Solicitudes de jugadores</h1>
          <p style={{ fontSize: 12, color: hint, marginTop: 2 }}>Gestiona las inscripciones al club</p>
        </div>
      </div>

      {/* Link de invitación */}
      <div style={{ ...card, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Link2 size={15} color='#4f46e5' />
          <span style={{ fontSize: 13, fontWeight: 600, color: text }}>Link de inscripción</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#3730a3', wordBreak: 'break-all' }}>
            {linkInvitacion || 'Generando...'}
          </div>
          <button onClick={copiarLink} style={{ background: copiado ? '#f0fdf4' : '#ede9fe', color: copiado ? '#16a34a' : '#3730a3', border: `1px solid ${copiado ? '#bbf7d0' : '#c4b5fd'}`, borderRadius: 8, padding: '10px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
          </button>
        </div>
        <p style={{ fontSize: 12, color: hint, marginTop: 8 }}>Comparte este link con los jugadores que quieran unirse al club</p>
      </div>

      {/* Tabla de solicitudes */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: text }}>Solicitudes</span>
          {solicitudes.filter(s => s.estado === 'pendiente').length > 0 && (
            <span style={{ background: '#fff7ed', color: '#c2410c', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
              {solicitudes.filter(s => s.estado === 'pendiente').length} pendientes
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Nombre', 'RUT', 'Email', 'Teléfono', 'Fecha', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => {
                const badge = estadoBadge[s.estado] || estadoBadge.pendiente
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500, color: text }}>{s.nombre}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: muted }}>{s.rut || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: muted }}>{s.email || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: muted }}>{s.telefono || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: muted }}>{new Date(s.creado_en).toLocaleDateString('es-CL')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{s.estado}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {s.estado === 'pendiente' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setModalAprobar(s); setPlanForm({ categoria: 'principiante', tipo_plan: 'mensual', entrenamientos_por_semana: '3', mensualidad: '30000' }) }}
                            style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <UserCheck size={12} /> Aprobar
                          </button>
                          <button onClick={() => rechazar(s.id)}
                            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <XCircle size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {solicitudes.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>No hay solicitudes aún</div>
          )}
        </div>
      </div>

      {/* Modal aprobar */}
      {modalAprobar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: text, marginBottom: 4 }}>Aprobar solicitud</h2>
            <p style={{ fontSize: 13, color: muted, marginBottom: 20 }}>{modalAprobar.nombre} — {modalAprobar.rut || 'Sin RUT'}</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Categoría</label>
              <select style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none' }}
                value={planForm.categoria} onChange={e => setPlanForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="principiante">Principiante</option>
                <option value="intermedio">Intermedio</option>
                <option value="avanzado">Avanzado</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Tipo de plan</label>
              <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                {(['mensual', 'semanal', 'libre'] as const).map(t => (
                  <button key={t} onClick={() => setPlanForm(f => ({ ...f, tipo_plan: t }))}
                    style={{ flex: 1, padding: '9px 0', background: planForm.tipo_plan === t ? '#4f46e5' : '#f4f7fa', color: planForm.tipo_plan === t ? '#fff' : muted, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {t === 'libre' ? 'Libre acceso' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {planForm.tipo_plan !== 'libre' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Entrenamientos por semana</label>
                <input type="number" min={1} max={7}
                  style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none' }}
                  value={planForm.entrenamientos_por_semana}
                  onChange={e => setPlanForm(f => ({ ...f, entrenamientos_por_semana: e.target.value }))} />
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Mensualidad</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {PRESETS.map(p => (
                  <button key={p.valor} onClick={() => setPlanForm(f => ({ ...f, mensualidad: String(p.valor), entrenamientos_por_semana: String(p.ent) }))}
                    style={{ padding: '6px 12px', borderRadius: 20, border: parseInt(planForm.mensualidad) === p.valor ? '1px solid #4f46e5' : '1px solid #e2e8f0', background: parseInt(planForm.mensualidad) === p.valor ? '#ede9fe' : '#f4f7fa', color: parseInt(planForm.mensualidad) === p.valor ? '#3730a3' : muted, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {p.label} ({p.ent} ent/sem)
                  </button>
                ))}
              </div>
              <input type="number" placeholder="Monto personalizado"
                style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none' }}
                value={planForm.mensualidad}
                onChange={e => setPlanForm(f => ({ ...f, mensualidad: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalAprobar(null)} style={{ flex: 1, padding: 11, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, color: muted, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarAprobar} disabled={aprobando} style={{ flex: 1, padding: 11, background: '#f43f5e', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {aprobando ? 'Aprobando...' : 'Aprobar jugador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
