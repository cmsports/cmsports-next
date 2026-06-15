'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient()

export default function SolicitudesPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [linkInvitacion, setLinkInvitacion] = useState('')
  const [loading, setLoading] = useState(true)
  const [clubId, setClubId] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [modalAprobar, setModalAprobar] = useState<any>(null)
  const [planForm, setPlanForm] = useState({ categoria:'principiante', tipo_plan:'mensual', entrenamientos_por_semana:'3', mensualidad:'30000' })
  const [aprobando, setAprobando] = useState(false)
  const router = useRouter()

  const PRESETS = [
    { label:'$15.000', valor:15000, ent:1 },
    { label:'$25.000', valor:25000, ent:2 },
    { label:'$30.000', valor:30000, ent:3 },
    { label:'$40.000', valor:40000, ent:4 },
  ]

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      setClubId(p?.club_id)
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (!clubId) return
    cargarSolicitudes()
  }, [clubId])

  async function cargarSolicitudes() {
    // Obtener o crear link de invitación
    let { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
    if (!inv?.length) {
      await supabase.from('invitaciones').insert({ club_id: clubId })
      const { data: newInv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
      inv = newInv
    }
    const codigo = inv?.[0]?.codigo || ''
    setLinkInvitacion(`${window.location.origin}/registro?club=${clubId}&code=${codigo}`)

    // Cargar solicitudes
    const { data } = await supabase.from('solicitudes_jugador').select('*').eq('club_id', clubId).order('creado_en', { ascending: false })
    setSolicitudes(data || [])
  }

  function abrirAprobar(s: any) {
    setModalAprobar(s)
    setPlanForm({ categoria:'principiante', tipo_plan:'mensual', entrenamientos_por_semana:'3', mensualidad:'30000' })
  }

  async function confirmarAprobar() {
    if (!modalAprobar) return
    setAprobando(true)
    const s = modalAprobar
    const ent = planForm.tipo_plan === 'libre' ? null : parseInt(planForm.entrenamientos_por_semana) || 3
    const sesLimite = planForm.tipo_plan === 'libre' ? 99 : (ent || 3) * 4
    await supabase.from('jugadores').insert({
      club_id: clubId, nombre: s.nombre, rut: s.rut || null,
      email: s.email || null, telefono: s.telefono || null,
      categoria: planForm.categoria,
      tipo_plan: planForm.tipo_plan,
      entrenamientos_por_semana: ent,
      mensualidad: parseInt(planForm.mensualidad) || 0,
      sesiones_limite: sesLimite,
      elo: 1200, sesiones_usadas: 0, estado: 'activo', es_externo: false
    })
    await supabase.from('solicitudes_jugador').update({ estado: 'aprobado' }).eq('id', s.id)
    setModalAprobar(null)
    setAprobando(false)
    cargarSolicitudes()
  }

  async function rechazar(id: string) {
    if (!confirm('¿Rechazar esta solicitud?')) return
    await supabase.from('solicitudes_jugador').update({ estado: 'rechazado' }).eq('id', id)
    cargarSolicitudes()
  }

  function copiarLink() {
    navigator.clipboard.writeText(linkInvitacion)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const estadoColor: Record<string, string> = {
    pendiente: '#fbbf24', aprobado: '#34d399', rechazado: '#f87171'
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:20 }}>Solicitudes de jugadores</h1>

      {/* Link de invitación */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Link de invitación</div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ flex:1, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#a78bfa', wordBreak:'break-all' }}>
            {linkInvitacion}
          </div>
          <button
            onClick={copiarLink}
            style={{ background: copiado ? '#34d39922' : '#1e1b4b', color: copiado ? '#34d399' : '#a78bfa', border:'1px solid #1e2030', borderRadius:8, padding:'10px 16px', fontSize:12, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}
          >
            {copiado ? '✓ Copiado' : '📋 Copiar'}
          </button>
        </div>
        <div style={{ fontSize:12, color:'#6c7280', marginTop:8 }}>Comparte este link con los jugadores que quieran unirse al club</div>
      </div>

      {/* Solicitudes */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>
          Solicitudes pendientes
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #1e2030' }}>
              {['Nombre','RUT','Email','Teléfono','Fecha','Estado','Acciones'].map(h => (
                <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {solicitudes.map(s => (
              <tr key={s.id} style={{ borderBottom:'1px solid #1e2030' }}>
                <td style={{ padding:'12px 16px', fontWeight:600, color:'#c8cfe0' }}>{s.nombre}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{s.rut || '—'}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{s.email || '—'}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{s.telefono || '—'}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{new Date(s.creado_en).toLocaleDateString('es-CL')}</td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ background: estadoColor[s.estado] + '22', color: estadoColor[s.estado], padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                    {s.estado}
                  </span>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  {s.estado === 'pendiente' && (
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => abrirAprobar(s)} style={{ background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer', fontWeight:600 }}>✓ Aprobar</button>
                      <button onClick={() => rechazar(s.id)} style={{ background:'#f8717122', color:'#f87171', border:'1px solid #f8717144', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer' }}>✕</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {solicitudes.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>No hay solicitudes aún</div>
        )}
      </div>
      {/* Modal aprobar con plan */}
      {modalAprobar && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:17, fontWeight:600, color:'#fff', marginBottom:6 }}>Aprobar solicitud</div>
            <div style={{ fontSize:13, color:'#6c7280', marginBottom:20 }}>{modalAprobar.nombre} — {modalAprobar.rut || 'Sin RUT'}</div>

            {/* Categoría */}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Categoría</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={planForm.categoria} onChange={e => setPlanForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="principiante">Principiante</option>
                <option value="intermedio">Intermedio</option>
                <option value="avanzado">Avanzado</option>
              </select>
            </div>

            {/* Tipo de plan */}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Tipo de plan</label>
              <div style={{ display:'flex', gap:0, borderRadius:8, overflow:'hidden', border:'1px solid #1e2030' }}>
                {(['mensual','semanal','libre'] as const).map(t => (
                  <button key={t} onClick={() => setPlanForm(f => ({ ...f, tipo_plan: t }))}
                    style={{ flex:1, padding:'9px 0', background: planForm.tipo_plan === t ? '#6c63ff' : '#0a0c12', color: planForm.tipo_plan === t ? '#fff' : '#6c7280', border:'none', fontSize:12, fontWeight:600, cursor:'pointer', textTransform:'capitalize' }}>
                    {t === 'libre' ? 'Libre acceso' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Entrenamientos por semana */}
            {planForm.tipo_plan !== 'libre' && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Entrenamientos por semana</label>
                <input type="number" min={1} max={7}
                  style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                  value={planForm.entrenamientos_por_semana}
                  onChange={e => setPlanForm(f => ({ ...f, entrenamientos_por_semana: e.target.value }))} />
              </div>
            )}

            {/* Mensualidad */}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Mensualidad</label>
              <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                {PRESETS.map(p => (
                  <button key={p.valor} onClick={() => setPlanForm(f => ({ ...f, mensualidad: String(p.valor), entrenamientos_por_semana: String(p.ent) }))}
                    style={{ padding:'6px 12px', borderRadius:20, border: parseInt(planForm.mensualidad) === p.valor ? '1px solid #6c63ff' : '1px solid #1e2030', background: parseInt(planForm.mensualidad) === p.valor ? '#6c63ff22' : '#0a0c12', color: parseInt(planForm.mensualidad) === p.valor ? '#a78bfa' : '#6c7280', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    {p.label} ({p.ent} ent/sem)
                  </button>
                ))}
              </div>
              <input type="number" placeholder="Monto personalizado"
                style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={planForm.mensualidad}
                onChange={e => setPlanForm(f => ({ ...f, mensualidad: e.target.value }))} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalAprobar(null)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #1e2030', borderRadius:8, color:'#6c7280', fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={confirmarAprobar} disabled={aprobando} style={{ flex:1, padding:11, background:'#34d399', border:'none', borderRadius:8, color:'#0f1117', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {aprobando ? 'Aprobando...' : 'Aprobar jugador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
