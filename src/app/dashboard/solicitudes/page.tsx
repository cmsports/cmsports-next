'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { aprobarSolicitud, rechazarSolicitud } from '@/app/actions/dashboard'
import { copiarTexto } from '@/lib/clipboard'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

export default function SolicitudesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [linkInvitacion, setLinkInvitacion] = useState('')
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState(false)
  const [modalAprobar, setModalAprobar] = useState<any>(null)
  const [planForm, setPlanForm] = useState({ categoria:'principiante', tipo_plan:'mensual', entrenamientos_por_semana:'3', mensualidad:'30000' })
  const [aprobando, setAprobando] = useState(false)
  const [aprobarMsg, setAprobarMsg] = useState('')
  const [passwordGenerada, setPasswordGenerada] = useState('')
  const [passwordCopiada, setPasswordCopiada] = useState(false)
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  const PRESETS = [
    { label:'$15.000', valor:15000, ent:1 },
    { label:'$25.000', valor:25000, ent:2 },
    { label:'$30.000', valor:30000, ent:3 },
    { label:'$40.000', valor:40000, ent:4 },
  ]

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      setLoading(false)
    }
    cargar()
  }, [authLoading, perfil])

  useEffect(() => {
    if (!clubId) return
    cargarSolicitudes()
  }, [clubId])

  async function cargarSolicitudes() {
    let { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
    if (!inv?.length) {
      await supabase.from('invitaciones').insert({ club_id: clubId })
      const { data: newInv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
      inv = newInv
    }
    const codigo = inv?.[0]?.codigo || ''
    setLinkInvitacion(`${window.location.origin}/registro?code=${codigo}`)

    const { data } = await supabase.from('solicitudes_jugador').select('*').eq('club_id', clubId).order('creado_en', { ascending: false })
    setSolicitudes(data || [])
  }

  function abrirAprobar(s: any) {
    setModalAprobar(s)
    setAprobarMsg('')
    setPasswordGenerada('')
    setPlanForm({ categoria:'principiante', tipo_plan:'mensual', entrenamientos_por_semana:'3', mensualidad:'30000' })
  }

  async function copiarPassword() {
    const ok = await copiarTexto(passwordGenerada)
    if (!ok) return
    setPasswordCopiada(true)
    setTimeout(() => setPasswordCopiada(false), 2000)
  }

  async function confirmarAprobar() {
    if (!modalAprobar || !clubId) return
    setAprobando(true)
    setAprobarMsg('')
    const s = modalAprobar
    const ent = planForm.tipo_plan === 'libre' ? null : parseInt(planForm.entrenamientos_por_semana) || 3
    const sesLimite = planForm.tipo_plan === 'libre' ? 99 : (ent || 3) * 4
    const res = await aprobarSolicitud({
      solicitudId: s.id,
      clubId,
      categoria: planForm.categoria,
      tipoPlan: planForm.tipo_plan,
      entrenamientosPorSemana: ent,
      mensualidad: parseInt(planForm.mensualidad) || 0,
      sesionesLimite: sesLimite,
      origin: window.location.origin,
    })
    setAprobando(false)
    if (res.error) { setAprobarMsg(res.error); return }
    cargarSolicitudes()
    if (res.inviteError) {
      setAprobarMsg('Jugador creado, pero no se pudo crear su cuenta: ' + res.inviteError)
      return
    }
    if (res.password) setPasswordGenerada(res.password)
  }

  async function rechazar(id: string) {
    if (!confirm('¿Rechazar esta solicitud?')) return
    if (!clubId) return
    await rechazarSolicitud(id, clubId)
    cargarSolicitudes()
  }

  async function copiarLink() {
    const ok = await copiarTexto(linkInvitacion)
    if (!ok) return
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const estadoConfig: Record<string, { color: string; bg: string }> = {
    pendiente: { color:'#d97706', bg:'#fffbeb' },
    aprobado:  { color:'#16a34a', bg:'#f0fdf4' },
    rechazado: { color:'#dc2626', bg:'#fef2f2' },
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:20 }}>Solicitudes de jugadores</h1>

      {/* Link de invitación */}
      <div style={{ ...card, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Link de invitación</div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ flex:1, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#3730a3', wordBreak:'break-all' }}>
            {linkInvitacion}
          </div>
          <button
            onClick={copiarLink}
            style={{ background: copiado ? '#f0fdf4' : '#ede9fe', color: copiado ? '#16a34a' : '#3730a3', border:`1px solid ${copiado ? '#bbf7d0' : '#c4b5fd'}`, borderRadius:8, padding:'10px 16px', fontSize:12, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}
          >
            {copiado ? '✓ Copiado' : '📋 Copiar'}
          </button>
        </div>
        <div style={{ fontSize:12, color: muted, marginTop:8 }}>Comparte este link con los jugadores que quieran unirse al club</div>
      </div>

      {/* Solicitudes */}
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', fontSize:13, fontWeight:600, color: text }}>
          Solicitudes pendientes
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #e2e8f0', background:'#f8fafc' }}>
                {['Nombre','RUT','Email','Teléfono','Fecha','Estado','Acciones'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => {
                const cfg = estadoConfig[s.estado] || estadoConfig.pendiente
                return (
                  <tr key={s.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'12px 16px', fontWeight:600, color: text }}>{s.nombre}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>{s.rut || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>{s.email || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>{s.telefono || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>{new Date(s.creado_en).toLocaleDateString('es-CL')}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: cfg.bg, color: cfg.color, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                        {s.estado}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      {s.estado === 'pendiente' && (
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={() => abrirAprobar(s)} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer', fontWeight:600 }}>✓ Aprobar</button>
                          <button onClick={() => rechazar(s.id)} style={{ background:'#fef2f2', color:'#dc2626', border:'none', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer' }}>✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {solicitudes.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>No hay solicitudes aún</div>
        )}
      </div>

      {/* Modal aprobar con plan */}
      {modalAprobar && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:6 }}>Aprobar solicitud</div>
            <div style={{ fontSize:13, color: muted, marginBottom:20 }}>{modalAprobar.nombre} — {modalAprobar.rut || 'Sin RUT'}</div>

            {aprobarMsg && (
              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#92400e', marginBottom:14 }}>
                {aprobarMsg}
              </div>
            )}

            {passwordGenerada ? (
              <>
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'14px', fontSize:13, color:'#166534', marginBottom:16 }}>
                  ✓ Jugador creado. Copia esta contraseña y envíasela junto con su email (<b>{modalAprobar.email}</b>) — la va a necesitar para entrar.
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:20 }}>
                  <div style={{ flex:1, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', fontSize:15, fontWeight:600, color: text, fontFamily:'monospace' }}>
                    {passwordGenerada}
                  </div>
                  <button
                    onClick={copiarPassword}
                    style={{ background: passwordCopiada ? '#f0fdf4' : '#ede9fe', color: passwordCopiada ? '#16a34a' : '#3730a3', border:`1px solid ${passwordCopiada ? '#bbf7d0' : '#c4b5fd'}`, borderRadius:8, padding:'10px 16px', fontSize:12, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}
                  >
                    {passwordCopiada ? '✓ Copiada' : '📋 Copiar'}
                  </button>
                </div>
                <button onClick={() => setModalAprobar(null)} style={{ width:'100%', padding:11, background:'#4f46e5', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                  Listo
                </button>
              </>
            ) : (
              <>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Categoría</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={planForm.categoria} onChange={e => setPlanForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="principiante">Principiante</option>
                <option value="intermedio">Intermedio</option>
                <option value="avanzado">Avanzado</option>
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Tipo de plan</label>
              <div style={{ display:'flex', gap:0, borderRadius:8, overflow:'hidden', border:'1px solid #e2e8f0' }}>
                {(['mensual','semanal','libre'] as const).map(t => (
                  <button key={t} onClick={() => setPlanForm(f => ({ ...f, tipo_plan: t }))}
                    style={{ flex:1, padding:'9px 0', background: planForm.tipo_plan === t ? '#4f46e5' : '#f4f7fa', color: planForm.tipo_plan === t ? '#fff' : muted, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', textTransform:'capitalize' }}>
                    {t === 'libre' ? 'Libre acceso' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {planForm.tipo_plan !== 'libre' && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Entrenamientos por semana</label>
                <input type="number" min={1} max={7}
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  value={planForm.entrenamientos_por_semana}
                  onChange={e => setPlanForm(f => ({ ...f, entrenamientos_por_semana: e.target.value }))} />
              </div>
            )}

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Mensualidad</label>
              <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                {PRESETS.map(p => (
                  <button key={p.valor} onClick={() => setPlanForm(f => ({ ...f, mensualidad: String(p.valor), entrenamientos_por_semana: String(p.ent) }))}
                    style={{ padding:'6px 12px', borderRadius:20, border: parseInt(planForm.mensualidad) === p.valor ? '1px solid #4f46e5' : '1px solid #e2e8f0', background: parseInt(planForm.mensualidad) === p.valor ? '#ede9fe' : '#f4f7fa', color: parseInt(planForm.mensualidad) === p.valor ? '#3730a3' : muted, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    {p.label} ({p.ent} ent/sem)
                  </button>
                ))}
              </div>
              <input type="number" placeholder="Monto personalizado"
                style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={planForm.mensualidad}
                onChange={e => setPlanForm(f => ({ ...f, mensualidad: e.target.value }))} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalAprobar(null)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={confirmarAprobar} disabled={aprobando} style={{ flex:1, padding:11, background:'#16a34a', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {aprobando ? 'Aprobando...' : 'Aprobar jugador'}
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
