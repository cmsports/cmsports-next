'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { Link2, Copy, Check, UserCheck, XCircle, Sun, Moon } from 'lucide-react'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { aprobarSolicitud, rechazarSolicitud } from '@/app/actions/solicitudes'
import { copiarTexto } from '@/lib/clipboard'

const supabase = createClient()

const lightTheme = {
  card: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const,
  muted: '#64748b', text: '#0f172a', hint: '#94a3b8', bg: '#e8edf4',
  inputBg: '#f4f7fa', inputBorder: '#e2e8f0', tableBg: '#f8fafc', rowBorder: '#f1f5f9',
  linkBg: '#f4f7fa', linkColor: '#3730a3',
  modalBg: '#ffffff', overlay: 'rgba(0,0,0,0.35)',
}
const darkTheme = {
  card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' } as const,
  muted: '#94a3b8', text: '#f1f5f9', hint: '#64748b', bg: '#0f172a',
  inputBg: '#1e293b', inputBorder: '#334155', tableBg: '#1e293b', rowBorder: '#334155',
  linkBg: '#1e293b', linkColor: '#a5b4fc',
  modalBg: '#1e293b', overlay: 'rgba(0,0,0,0.6)',
}

async function obtenerSolicitudes(clubId: string) {
  let { data: invitaciones } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
  if (!invitaciones?.length) {
    await supabase.from('invitaciones').insert({ club_id: clubId })
    const { data } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
    invitaciones = data
  }
  const codigo = invitaciones?.[0]?.codigo || ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const { data: solicitudes } = await supabase.from('solicitudes_jugador').select('*').eq('club_id', clubId).order('creado_en', { ascending: false })
  return { link: `${origin}/registro?club=${clubId}&code=${codigo}`, solicitudes: solicitudes || [] }
}

export default function SolicitudesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [linkInvitacion, setLink]     = useState('')
  const [loading, setLoading]         = useState(true)
  const [copiado, setCopiado]         = useState(false)
  const [modalAprobar, setModalAprobar] = useState<any>(null)
  const [planForm, setPlanForm]       = useState({ categoria: 'principiante', tipo_plan: 'mensual', entrenamientos_por_semana: '3', mensualidad: '30000' })
  const [aprobando, setAprobando]     = useState(false)
  const [errorAprobar, setErrorAprobar] = useState('')
  const [dark, setDark] = useState(false)
  const [rechazandoId, setRechazandoId] = useState<string|null>(null)
  const [errorRechazar, setErrorRechazar] = useState('')
  const [aprobadoInfo, setAprobadoInfo] = useState<null | { nombre: string; email: string | null; telefono: string | null; cuentaCreada?: boolean }>(null)
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  const PRESETS = [
    { label: '$15.000', valor: 15000, ent: 1 },
    { label: '$25.000', valor: 25000, ent: 2 },
    { label: '$30.000', valor: 30000, ent: 3 },
    { label: '$40.000', valor: 40000, ent: 4 },
  ]

  const cargarSolicitudes = useCallback(async (cid?: string) => {
    const id = cid || clubId
    if (!id) return
    const resultado = await obtenerSolicitudes(id)
    setLink(resultado.link)
    setSolicitudes(resultado.solicitudes)
  }, [clubId])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.rol !== 'admin') { router.push('/dashboard'); return }
    if (!perfil.club_id) return
    let activo = true

    async function cargarInicial() {
      const resultado = await obtenerSolicitudes(perfil!.club_id!)
      if (!activo) return
      setLink(resultado.link)
      setSolicitudes(resultado.solicitudes)
      setLoading(false)
    }

    void cargarInicial()
    return () => { activo = false }
  }, [authLoading, perfil, router])

  async function confirmarAprobar() {
    if (!modalAprobar) return
    setAprobando(true)
    const s   = modalAprobar
    const ent = planForm.tipo_plan === 'libre' ? null : parseInt(planForm.entrenamientos_por_semana) || 3
    const ses = planForm.tipo_plan === 'libre' ? 99 : (ent || 3) * 4
    const res = await aprobarSolicitud({
      solicitudId: s.id, nombre: s.nombre, rut: s.rut || '', email: s.email || '', telefono: s.telefono || '',
      categoria: planForm.categoria, tipo_plan: planForm.tipo_plan, entrenamientos_por_semana: ent,
      mensualidad: parseInt(planForm.mensualidad) || 0, sesiones_limite: ses,
    })
    setAprobando(false)
    if (res.error) { setErrorAprobar(res.error); return }
    setErrorAprobar('')
    setModalAprobar(null)
    void cargarSolicitudes()
    setAprobadoInfo({
      nombre: res.jugador?.nombre ?? s.nombre,
      email: res.jugador?.email ?? (s.email || null),
      telefono: res.jugador?.telefono ?? (s.telefono || null),
      cuentaCreada: res.cuentaCreada,
    })
  }

  function linkWhatsApp(info: NonNullable<typeof aprobadoInfo>) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const tel = (info.telefono || '').replace(/[^0-9]/g, '')
    const msg = `¡Hola ${info.nombre}! 🏓 Tu solicitud en CmSports fue aprobada. Revisa el correo enviado a ${info.email ?? ''} y usa el enlace para crear tu contraseña. Luego podrás entrar en ${origin}/login. ¡Nos vemos en el club!`
    return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
  }

  async function rechazar(id: string) {
    if (!confirm('¿Rechazar esta solicitud?')) return
    setRechazandoId(id)
    setErrorRechazar('')
    const res = await rechazarSolicitud({ solicitudId: id })
    setRechazandoId(null)
    if (res?.error) { setErrorRechazar('No se pudo rechazar: ' + res.error); return }
    void cargarSolicitudes()
  }

  async function copiarLink() {
    const ok = await copiarTexto(linkInvitacion)
    if (!ok) return
    setCopiado(true); setTimeout(() => setCopiado(false), 2000)
  }

  const t = dark ? darkTheme : lightTheme

  const estadoBadge: Record<string, { bg: string; color: string }> = {
    pendiente: { bg: dark ? '#422006' : '#fffbeb', color: '#d97706' },
    aprobado:  { bg: dark ? '#052e16' : '#f0fdf4', color: '#16a34a' },
    rechazado: { bg: dark ? '#450a0a' : '#fef2f2', color: '#dc2626' },
  }

  if (authLoading || (!!clubId && loading)) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg }}><div style={{ color: t.hint }}>Cargando...</div></div>

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: t.text }}>Solicitudes de jugadores</h1>
          <p style={{ fontSize: 12, color: t.hint, marginTop: 2 }}>Gestiona las inscripciones al club</p>
        </div>
        <button onClick={() => setDark(d => !d)} title={dark ? 'Modo claro' : 'Modo oscuro'}
          style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: t.muted, fontSize: 12, fontWeight: 500 }}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
          {dark ? 'Claro' : 'Oscuro'}
        </button>
      </div>

      {errorRechazar && (
        <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:8, fontSize:13, background: dark ? '#450a0a' : '#fef2f2', color:'#dc2626', border:'1px solid #fecaca', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          {errorRechazar}
          <button onClick={() => setErrorRechazar('')} style={{ background:'none', border:'none', color:'#dc2626', fontSize:16, cursor:'pointer', padding:'0 4px' }}>✕</button>
        </div>
      )}

      {/* Link de invitación */}
      <div style={{ ...t.card, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Link2 size={15} color='#4f46e5' />
          <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Link de inscripción</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, background: t.linkBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: t.linkColor, wordBreak: 'break-all' }}>
            {linkInvitacion || 'Generando...'}
          </div>
          <button onClick={copiarLink} style={{ background: copiado ? (dark ? '#052e16' : '#f0fdf4') : (dark ? '#312e81' : '#ede9fe'), color: copiado ? '#16a34a' : (dark ? '#a5b4fc' : '#3730a3'), border: `1px solid ${copiado ? '#bbf7d0' : '#c4b5fd'}`, borderRadius: 8, padding: '10px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
          </button>
        </div>
        <p style={{ fontSize: 12, color: t.hint, marginTop: 8 }}>Comparte este link con los jugadores que quieran unirse al club</p>
      </div>

      {/* Tabla de solicitudes */}
      <div style={{ ...t.card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.inputBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Solicitudes</span>
          {solicitudes.filter(s => s.estado === 'pendiente').length > 0 && (
            <span style={{ background: dark ? '#431407' : '#fff7ed', color: '#c2410c', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
              {solicitudes.filter(s => s.estado === 'pendiente').length} pendientes
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: t.tableBg, borderBottom: `1px solid ${t.inputBorder}` }}>
                {['Nombre', 'RUT', 'Email', 'Teléfono', 'Fecha', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: t.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => {
                const badge = estadoBadge[s.estado] || estadoBadge.pendiente
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${t.rowBorder}` }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500, color: t.text }}>{s.nombre}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: t.muted }}>{s.rut || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: t.muted }}>{s.email || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: t.muted }}>{s.telefono || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: t.muted }}>{new Date(s.creado_en).toLocaleDateString('es-CL')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{s.estado}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {s.estado === 'pendiente' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setModalAprobar(s); setPlanForm({ categoria: 'principiante', tipo_plan: 'mensual', entrenamientos_por_semana: '3', mensualidad: '30000' }); setErrorAprobar('') }}
                            style={{ background: dark ? '#052e16' : '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <UserCheck size={12} /> Aprobar
                          </button>
                          <button onClick={() => rechazar(s.id)} disabled={rechazandoId === s.id}
                            style={{ background: dark ? '#450a0a' : '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: rechazandoId === s.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', opacity: rechazandoId === s.id ? 0.6 : 1 }}>
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
            <div style={{ padding: 40, textAlign: 'center', color: t.hint, fontSize: 13 }}>No hay solicitudes aún</div>
          )}
        </div>
      </div>

      {/* Modal aprobar */}
      {modalAprobar && (
        <div style={{ position: 'fixed', inset: 0, background: t.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: t.modalBg, border: `1px solid ${t.inputBorder}`, borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 4 }}>Aprobar solicitud</h2>
            <p style={{ fontSize: 13, color: t.muted, marginBottom: 20 }}>{modalAprobar.nombre} — {modalAprobar.rut || 'Sin RUT'}</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: t.muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Categoría</label>
              <select style={{ width: '100%', background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: '10px 12px', color: t.text, fontSize: 13, outline: 'none' }}
                value={planForm.categoria} onChange={e => setPlanForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="principiante">Principiante</option>
                <option value="intermedio">Intermedio</option>
                <option value="avanzado">Avanzado</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: t.muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Tipo de plan</label>
              <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${t.inputBorder}` }}>
                {(['mensual', 'semanal', 'libre'] as const).map(tp => (
                  <button key={tp} onClick={() => setPlanForm(f => ({ ...f, tipo_plan: tp }))}
                    style={{ flex: 1, padding: '9px 0', background: planForm.tipo_plan === tp ? '#4f46e5' : t.inputBg, color: planForm.tipo_plan === tp ? '#fff' : t.muted, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {tp === 'libre' ? 'Libre acceso' : tp.charAt(0).toUpperCase() + tp.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {planForm.tipo_plan !== 'libre' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: t.muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Entrenamientos por semana</label>
                <input type="number" min={1} max={7}
                  style={{ width: '100%', background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: '10px 12px', color: t.text, fontSize: 13, outline: 'none' }}
                  value={planForm.entrenamientos_por_semana}
                  onChange={e => setPlanForm(f => ({ ...f, entrenamientos_por_semana: e.target.value }))} />
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: t.muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Mensualidad</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {PRESETS.map(p => (
                  <button key={p.valor} onClick={() => setPlanForm(f => ({ ...f, mensualidad: String(p.valor), entrenamientos_por_semana: String(p.ent) }))}
                    style={{ padding: '6px 12px', borderRadius: 20, border: parseInt(planForm.mensualidad) === p.valor ? '1px solid #4f46e5' : `1px solid ${t.inputBorder}`, background: parseInt(planForm.mensualidad) === p.valor ? (dark ? '#312e81' : '#ede9fe') : t.inputBg, color: parseInt(planForm.mensualidad) === p.valor ? (dark ? '#a5b4fc' : '#3730a3') : t.muted, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {p.label} ({p.ent} ent/sem)
                  </button>
                ))}
              </div>
              <input type="number" placeholder="Monto personalizado"
                style={{ width: '100%', background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: '10px 12px', color: t.text, fontSize: 13, outline: 'none' }}
                value={planForm.mensualidad}
                onChange={e => setPlanForm(f => ({ ...f, mensualidad: e.target.value }))} />
            </div>

            {errorAprobar && (
              <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:8, fontSize:12, fontWeight:500, background: dark ? '#450a0a' : '#fef2f2', color:'#dc2626', border:'1px solid #fecaca' }}>
                {errorAprobar}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setModalAprobar(null); setErrorAprobar('') }} style={{ flex: 1, padding: 11, background: 'transparent', border: `1px solid ${t.inputBorder}`, borderRadius: 8, color: t.muted, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarAprobar} disabled={aprobando} style={{ flex: 1, padding: 11, background: '#f43f5e', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {aprobando ? 'Aprobando...' : 'Aprobar jugador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal éxito + aviso WhatsApp */}
      {aprobadoInfo && (
        <div style={{ position: 'fixed', inset: 0, background: t.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: t.modalBg, border: `1px solid ${t.inputBorder}`, borderRadius: 14, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>✅</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: t.text, textAlign: 'center', marginBottom: 6 }}>Jugador aprobado</h2>
            {aprobadoInfo.cuentaCreada ? (
              <p style={{ fontSize: 13, color: t.muted, textAlign: 'center', marginBottom: 18 }}>
                Enviamos a <strong>{aprobadoInfo.email}</strong> un enlace para que {aprobadoInfo.nombre} cree su contraseña.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: '#d97706', textAlign: 'center', marginBottom: 18 }}>
                No se pudo confirmar la cuenta de acceso.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {aprobadoInfo.telefono && (
                <a href={linkWhatsApp(aprobadoInfo)} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, padding: 11, background: dark ? '#052e16' : '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#16a34a', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                  Enviar WhatsApp
                </a>
              )}
              <button onClick={() => setAprobadoInfo(null)}
                style={{ flex: 1, padding: 11, background: aprobadoInfo.telefono ? 'transparent' : '#4f46e5', border: aprobadoInfo.telefono ? `1px solid ${t.inputBorder}` : 'none', borderRadius: 8, color: aprobadoInfo.telefono ? t.muted : '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
