'use client'

import { useCallback, useEffect, useState } from 'react'
import CampoContrasena from '@/components/CampoContrasena'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { Link2, Copy, Check, UserCheck, XCircle } from 'lucide-react'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { puedeVerPantallasDeClub } from '@/lib/auth/roles'
import { aprobarSolicitud, rechazarSolicitud } from '@/app/actions/solicitudes'
import { DIAS, diaLabel, rangoHorario, type BloqueHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { copiarTexto } from '@/lib/clipboard'
import { categoriaPorDefecto, esquemaCategoriasDe } from '@/lib/domain/esquemaCategorias'
import WhatsAppBtn from '@/components/WhatsAppBtn'
import { linkWhatsApp } from '@/lib/whatsapp'
import { montoIngresado } from '@/lib/domain/mensualidades'
import { fechaChile } from '@/lib/domain/fechaChile'
import { soloVigentes } from '@/lib/supabase/vigentes'
import { TALLAS_UNIFORME } from '@/lib/domain/tallas'


const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const muted = '#64748b'
const text  = '#0f172a'
const hint  = '#94a3b8'

async function obtenerSolicitudes(clubId: string) {
  let { data: invitaciones } = await supabase.from('invitaciones').select('codigo').eq('club_id', clubId).eq('activa', true).limit(1)
  if (!invitaciones?.length) {
    await supabase.from('invitaciones').insert({ club_id: clubId })
    const { data } = await supabase.from('invitaciones').select('codigo').eq('club_id', clubId).eq('activa', true).limit(1)
    invitaciones = data
  }
  const codigo = invitaciones?.[0]?.codigo || ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const { data: solicitudes } = await supabase.from('solicitudes_jugador').select('id,nombre,rut,email,telefono,estado,creado_en,fecha_nacimiento,direccion,comuna,contacto_emergencia_nombre,contacto_emergencia_telefono,indicaciones_medicas,nombres,apellido1,apellido2,apellido3,talla_polera,talla_short').eq('club_id', clubId).order('creado_en', { ascending: false })
  return { link: `${origin}/registro?club=${clubId}&code=${codigo}`, solicitudes: solicitudes || [] }
}

// El formulario obliga a escribir "no" cuando el postulante no tiene el dato,
// así que un campo vacío es información que faltó, no un dato inexistente.
const CAMPOS_REVISAR = [
  { key: 'rut',                          label: 'RUT' },
  { key: 'email',                        label: 'Email' },
  { key: 'telefono',                     label: 'Teléfono' },
  { key: 'fecha_nacimiento',             label: 'Fecha de nacimiento' },
  { key: 'direccion',                    label: 'Dirección' },
  { key: 'comuna',                       label: 'Comuna' },
  { key: 'contacto_emergencia_nombre',   label: 'Contacto de emergencia' },
  { key: 'contacto_emergencia_telefono', label: 'Teléfono de emergencia' },
  { key: 'indicaciones_medicas',         label: 'Indicaciones médicas' },
  { key: 'apellido1',                    label: 'Apellido paterno' },
  { key: 'apellido2',                    label: 'Apellido materno' },
] as const

function camposIncompletos(s: Record<string, unknown>): string[] {
  return CAMPOS_REVISAR.filter(c => !String(s[c.key] ?? '').trim()).map(c => c.label)
}

export default function SolicitudesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [linkInvitacion, setLink]     = useState('')
  const [loading, setLoading]         = useState(true)
  const [copiado, setCopiado]         = useState(false)
  const [modalAprobar, setModalAprobar] = useState<any>(null)
  const [infoForm, setInfoForm] = useState({
    nombre: '', rut: '', email: '', telefono: '',
    fecha_nacimiento: '', direccion: '', comuna: '',
    contacto_emergencia_nombre: '', contacto_emergencia_telefono: '',
    indicaciones_medicas: '', password: '', passwordConfirm: '',
    talla_polera: '', talla_short: '',
  })
  const [planForm, setPlanForm]       = useState({ categoria: 'principiante', tipo_plan: 'mensual', entrenamientos_por_semana: '3', mensualidad: '' })
  // Arranca sin marcar: el que recién entra solo figura con la matrícula al día
  // si la pagó en este momento. Los jugadores que ya venían quedaron marcados
  // por la migración 138, que es otra cosa.
  const [matriculaForm, setMatriculaForm] = useState({ pagada: false, monto: '' })
  // Desde qué mes se le empieza a cobrar. Por defecto el mes en curso, que es
  // lo normal, pero se puede correr: alguien que entra a fin de mes y arranca
  // en septiembre no tiene por qué pagar agosto.
  const [cobrarDesde, setCobrarDesde] = useState(fechaChile().slice(0, 7))
  // Los grupos se eligen al aprobar: si entra sin bloque queda invisible para
  // la asistencia y no puede marcarse solo desde la app.
  const [bloquesClub, setBloquesClub] = useState<BloqueHorario[]>([])
  const [bloquesSel, setBloquesSel]   = useState<Set<string>>(new Set())
  const [aprobando, setAprobando]     = useState(false)
  const [errorAprobar, setErrorAprobar] = useState('')
  const [rechazandoId, setRechazandoId] = useState<string|null>(null)
  const [errorRechazar, setErrorRechazar] = useState('')
  const [aprobadoInfo, setAprobadoInfo] = useState<null | { nombre: string; email: string | null; telefono: string | null; cuentaCreada?: boolean; password?: string }>(null)
  const router = useRouter()
  const clubId = perfil?.club_id ?? null
  // Qué categorías ofrece este club y si las sugiere por edad. La pantalla ya no
  // pregunta "¿es Buin?": pide el esquema y lo aplica igual para todos.
  const esquema = esquemaCategoriasDe(clubId)

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
    if (!puedeVerPantallasDeClub(perfil.rol)) { router.push('/dashboard'); return }
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

  const cargarBloques = useCallback(async () => {
    if (!clubId) return
    // Igual que en Jugadores: aprobar una solicitud hacia un grupo cerrado deja
    // al recién llegado con días que no existen.
    const { data } = await soloVigentes(supabase.from('bloques_horario')
      .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,cupo_libres,activo')
      .eq('club_id', clubId).eq('activo', true), fechaChile()).order('hora_inicio')
    setBloquesClub((data ?? []) as BloqueHorario[])
  }, [clubId])

  async function confirmarAprobar() {
    if (!modalAprobar) return
    if (infoForm.password !== infoForm.passwordConfirm) { setErrorAprobar('Las contraseñas no coinciden'); return }
    setAprobando(true)
    const ent = planForm.tipo_plan === 'libre' ? null : parseInt(planForm.entrenamientos_por_semana) || 3
    const ses = planForm.tipo_plan === 'libre' ? 99 : (ent || 3) * 4
    const res = await aprobarSolicitud({
      solicitudId: modalAprobar.id,
      nombre: infoForm.nombre,
      rut: infoForm.rut,
      email: infoForm.email,
      telefono: infoForm.telefono,
      fecha_nacimiento: infoForm.fecha_nacimiento,
      direccion: infoForm.direccion,
      comuna: infoForm.comuna,
      contacto_emergencia_nombre: infoForm.contacto_emergencia_nombre,
      contacto_emergencia_telefono: infoForm.contacto_emergencia_telefono,
      indicaciones_medicas: infoForm.indicaciones_medicas,
      talla_polera: infoForm.talla_polera,
      talla_short: infoForm.talla_short,
      password: infoForm.password,
      categoria: planForm.categoria,
      tipo_plan: planForm.tipo_plan,
      entrenamientos_por_semana: ent,
      mensualidad: montoIngresado(planForm.mensualidad),
      sesiones_limite: ses,
      bloqueIds: [...bloquesSel],
      matriculaPagada: matriculaForm.pagada,
      matriculaMonto: matriculaForm.pagada ? montoIngresado(matriculaForm.monto) : null,
      cobrarDesde,
    })
    setAprobando(false)
    if (res.error) { setErrorAprobar(res.error); return }
    setErrorAprobar('')
    setModalAprobar(null)
    void cargarSolicitudes()
    setAprobadoInfo({
      nombre: res.jugador?.nombre ?? infoForm.nombre,
      email: res.jugador?.email ?? infoForm.email,
      telefono: res.jugador?.telefono ?? infoForm.telefono,
      cuentaCreada: res.cuentaCreada,
      password: infoForm.password,
    })
  }

  function linkAvisoAprobado(info: NonNullable<typeof aprobadoInfo>) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const msg = `¡Hola ${info.nombre}! 🏓 Tu solicitud fue aprobada. Ya puedes entrar en ${origin}/login con:\n📧 Email: ${info.email ?? ''}\n🔑 Contraseña: ${info.password ?? ''}\n¡Nos vemos en el club!`
    return linkWhatsApp(info.telefono, msg)
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

  const estadoBadge: Record<string, { bg: string; color: string }> = {
    pendiente: { bg: '#fffbeb', color: '#d97706' },
    aprobado:  { bg: '#f0fdf4', color: '#16a34a' },
    rechazado: { bg: '#fef2f2', color: '#dc2626' },
  }

  if (authLoading || (!!clubId && loading)) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8edf4' }}><div style={{ color: hint }}>Cargando...</div></div>

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: text }}>Solicitudes de jugadores</h1>
          <p style={{ fontSize: 12, color: hint, marginTop: 2 }}>Gestiona las inscripciones al club</p>
        </div>
      </div>

      {errorRechazar && (
        <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:8, fontSize:13, background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          {errorRechazar}
          <button onClick={() => setErrorRechazar('')} style={{ background:'none', border:'none', color:'#dc2626', fontSize:16, cursor:'pointer', padding:'0 4px' }}>✕</button>
        </div>
      )}

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
                const faltantes = camposIncompletos(s)
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500, color: text }}>
                      {s.nombre}
                      {s.estado === 'pendiente' && faltantes.length > 0 && (
                        <div title={`Falta: ${faltantes.join(', ')}`} style={{ fontSize: 11, color: '#c2410c', fontWeight: 500, marginTop: 2 }}>
                          ⚠ {faltantes.length} campo{faltantes.length !== 1 ? 's' : ''} sin completar
                        </div>
                      )}
                    </td>
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
                          <button onClick={() => {
                            const catAuto = (s.fecha_nacimiento && esquema.sugerirPorFechaNacimiento?.(s.fecha_nacimiento))
                              ?? categoriaPorDefecto(esquema)
                            setModalAprobar(s)
                            setBloquesSel(new Set())
                            void cargarBloques()
                            setInfoForm({
                              nombre: s.nombre || '',
                              rut: s.rut || '',
                              email: s.email || '',
                              telefono: s.telefono || '',
                              fecha_nacimiento: s.fecha_nacimiento || '',
                              direccion: s.direccion || '',
                              comuna: s.comuna || '',
                              contacto_emergencia_nombre: s.contacto_emergencia_nombre || '',
                              contacto_emergencia_telefono: s.contacto_emergencia_telefono || '',
                              indicaciones_medicas: s.indicaciones_medicas || '',
                              talla_polera: s.talla_polera || '',
                              talla_short: s.talla_short || '',
                              password: '',
                              passwordConfirm: '',
                            })
                            setPlanForm({ categoria: catAuto, tipo_plan: 'mensual', entrenamientos_por_semana: '3', mensualidad: '' })
                            setMatriculaForm({ pagada: false, monto: '' })
                            setErrorAprobar('')
                          }}
                            style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <UserCheck size={12} /> Aprobar
                          </button>
                          <button onClick={() => rechazar(s.id)} disabled={rechazandoId === s.id}
                            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: rechazandoId === s.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', opacity: rechazandoId === s.id ? 0.6 : 1 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: text, marginBottom: 18 }}>Revisar y aprobar solicitud</h2>

            {(() => {
              const faltantes = camposIncompletos(modalAprobar)
              if (faltantes.length === 0) return null
              return (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#c2410c', lineHeight: 1.5 }}>
                  <strong>⚠ Faltan {faltantes.length} campo{faltantes.length !== 1 ? 's' : ''}:</strong> {faltantes.join(', ')}.
                  <div style={{ marginTop: 4, color: muted }}>
                    Completalos acá antes de aprobar.
                  </div>
                </div>
              )
            })()}


            {/* SECCIÓN: Datos personales */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Datos personales</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Nombre *</label>
                <input style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.nombre} onChange={e => setInfoForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>RUT</label>
                <input style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.rut} onChange={e => setInfoForm(f => ({ ...f, rut: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Email *</label>
                <input style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.email} onChange={e => setInfoForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Teléfono</label>
                <input style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.telefono} onChange={e => setInfoForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Fecha de nacimiento</label>
                <input type="date" style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.fecha_nacimiento} onChange={e => {
                    const fn = e.target.value
                    setInfoForm(f => ({ ...f, fecha_nacimiento: fn }))
                    const sugerida = fn ? esquema.sugerirPorFechaNacimiento?.(fn) : null
                    if (sugerida) setPlanForm(p => ({ ...p, categoria: sugerida }))
                  }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Comuna</label>
                <input style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.comuna} onChange={e => setInfoForm(f => ({ ...f, comuna: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Dirección</label>
              <input style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                value={infoForm.direccion} onChange={e => setInfoForm(f => ({ ...f, direccion: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Talla polera</label>
                <select style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.talla_polera} onChange={e => setInfoForm(f => ({ ...f, talla_polera: e.target.value }))}>
                  <option value="">No especificada</option>
                  {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Talla short</label>
                <select style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.talla_short} onChange={e => setInfoForm(f => ({ ...f, talla_short: e.target.value }))}>
                  <option value="">No especificada</option>
                  {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* SECCIÓN: Emergencia */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 16 }}>Contacto de emergencia</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Nombre</label>
                <input style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.contacto_emergencia_nombre} onChange={e => setInfoForm(f => ({ ...f, contacto_emergencia_nombre: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Teléfono</label>
                <input style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.contacto_emergencia_telefono} onChange={e => setInfoForm(f => ({ ...f, contacto_emergencia_telefono: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Indicaciones médicas</label>
              <input style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                value={infoForm.indicaciones_medicas} onChange={e => setInfoForm(f => ({ ...f, indicaciones_medicas: e.target.value }))} />
            </div>

            {/* SECCIÓN: Plan */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 16 }}>Plan de entrenamiento</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Categoría {infoForm.fecha_nacimiento && esquema.sugerirPorFechaNacimiento && <span style={{ color: '#7c3aed' }}>(sugerida por edad)</span>}
              </label>
              <select style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', color: text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                value={planForm.categoria} onChange={e => setPlanForm(f => ({ ...f, categoria: e.target.value }))}>
                {esquema.opciones.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Tipo de plan</label>
              <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                {(['mensual', 'semanal', 'libre'] as const).map(t => (
                  <button key={t} onClick={() => setPlanForm(f => ({ ...f, tipo_plan: t }))}
                    style={{ flex: 1, padding: '8px 0', background: planForm.tipo_plan === t ? '#4f46e5' : '#f4f7fa', color: planForm.tipo_plan === t ? '#fff' : muted, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {t === 'libre' ? 'Libre acceso' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {planForm.tipo_plan !== 'libre' && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 4, fontWeight: 600 }}>Entrenamientos por semana</label>
                <input type="number" min={1} max={7} style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={planForm.entrenamientos_por_semana} onChange={e => setPlanForm(f => ({ ...f, entrenamientos_por_semana: e.target.value }))} />
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 6, fontWeight: 600 }}>Mensualidad</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {PRESETS.map(p => (
                  <button key={p.valor} onClick={() => setPlanForm(f => ({ ...f, mensualidad: String(p.valor), entrenamientos_por_semana: String(p.ent) }))}
                    style={{ padding: '5px 12px', borderRadius: 20, border: parseInt(planForm.mensualidad) === p.valor ? '1px solid #4f46e5' : '1px solid #e2e8f0', background: parseInt(planForm.mensualidad) === p.valor ? '#ede9fe' : '#f4f7fa', color: parseInt(planForm.mensualidad) === p.valor ? '#3730a3' : muted, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {p.label} ({p.ent} ent/sem)
                  </button>
                ))}
              </div>
              <input type="number" placeholder="Monto personalizado" style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                value={planForm.mensualidad} onChange={e => setPlanForm(f => ({ ...f, mensualidad: e.target.value }))} />

              {/* Desde cuándo se le cobra. Se pregunta acá y no se deduce de
                  la fecha de la ficha: desde que una visita que se hace socia
                  conserva su ficha, esa fecha puede ser de hace meses y le
                  arrastraría cuotas que nunca le tocaron. */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5 }}>
                  Primera cuota que se le cobra
                </label>
                <input type="month" value={cobrarDesde}
                  onChange={e => setCobrarDesde(e.target.value)}
                  style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none' }} />
                <div style={{ fontSize: 11, color: hint, marginTop: 5 }}>
                  No se le generan cuotas de meses anteriores a este.
                </div>
              </div>

              {/* Matrícula: se pregunta acá porque es el momento en que se
                  cobra. Si no la paga ahora, la ficha queda pendiente y se
                  cobra después desde su perfil. */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: text }}>
                  <input type="checkbox" checked={matriculaForm.pagada}
                    onChange={e => setMatriculaForm(f => ({ ...f, pagada: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#16a34a' }} />
                  🎓 Pagó la matrícula
                </label>
                {matriculaForm.pagada ? (
                  <>
                    <input type="number" min={0} placeholder="Monto de la matrícula"
                      style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none', marginTop: 8 }}
                      value={matriculaForm.monto} onChange={e => setMatriculaForm(f => ({ ...f, monto: e.target.value }))} />
                    <div style={{ fontSize: 11, color: hint, marginTop: 5 }}>
                      Se registra como ingreso en Finanzas. Poné <strong>0</strong> si se la eximís.
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: hint, marginTop: 5 }}>
                    Queda como pendiente en su ficha; se puede cobrar después.
                  </div>
                )}
              </div>
            </div>

            {/* SECCIÓN: Credenciales */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 16 }}>Credenciales de acceso</div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: muted }}>
              Email de acceso: <strong>{infoForm.email || '—'}</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Contraseña *</label>
                <CampoContrasena placeholder="Mín. 6 caracteres" autoComplete="new-password"
                  style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.password} onChange={v => setInfoForm(f => ({ ...f, password: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 3, fontWeight: 600 }}>Confirmar contraseña *</label>
                <CampoContrasena placeholder="Repetir contraseña" autoComplete="new-password"
                  style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none' }}
                  value={infoForm.passwordConfirm} onChange={v => setInfoForm(f => ({ ...f, passwordConfirm: v }))} />
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Grupos de entrenamiento</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
              Sin un grupo no aparece en la lista de asistencia ni puede marcar su llegada desde la app.
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 18, maxHeight: 220, overflowY: 'auto' }}>
              {DIAS.map(d => {
                const delDia = bloquesClub.filter(b => b.dia_semana === d.value)
                if (delDia.length === 0) return null
                return (
                  <div key={d.value} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{diaLabel(d.value)}</div>
                    {delDia.map(b => {
                      const marcado = bloquesSel.has(b.id)
                      return (
                        <div key={b.id}
                          onClick={() => setBloquesSel(prev => {
                            const s = new Set(prev)
                            if (s.has(b.id)) s.delete(b.id); else s.add(b.id)
                            return s
                          })}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 3,
                            background: marcado ? '#eef2ff' : 'transparent', border: `1px solid ${marcado ? '#c7d2fe' : 'transparent'}` }}>
                          <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `2px solid ${marcado ? '#4f46e5' : '#cbd5e1'}`, background: marcado ? '#4f46e5' : 'transparent' }}>
                            {marcado && <span style={{ color: 'white', fontSize: 10, fontWeight: 800 }}>✓</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: text }}>{b.nombre}</div>
                            <div style={{ fontSize: 10, color: muted }}>{sedeLabel(b.sede)} · {rangoHorario(b.hora_inicio, b.hora_fin)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {bloquesClub.length === 0 && (
                <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: muted }}>
                  Todavía no hay grupos en el horario semanal.
                </div>
              )}
            </div>

            {errorAprobar && (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                {errorAprobar}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setModalAprobar(null); setErrorAprobar('') }} style={{ flex: 1, padding: 11, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, color: muted, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarAprobar} disabled={aprobando} style={{ flex: 1, padding: 11, background: '#f43f5e', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {aprobando ? 'Aprobando...' : 'Crear perfil jugador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal éxito + credenciales */}
      {aprobadoInfo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 6 }}>✅</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: text, textAlign: 'center', marginBottom: 16 }}>
              {aprobadoInfo.nombre} fue aprobado
            </h2>

            {/* Credenciales */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Credenciales de acceso</div>
              <div style={{ fontSize: 13, color: '#166534', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>📧 <strong>Email:</strong> {aprobadoInfo.email}</div>
                <div>🔑 <strong>Contraseña:</strong> {aprobadoInfo.password}</div>
              </div>
            </div>

            {(() => {
              const url = linkAvisoAprobado(aprobadoInfo)
              return (
                <div style={{ display: 'flex', gap: 10 }}>
                  {url && (
                    <WhatsAppBtn href={url} style={{ flex: 1, padding: 11, borderRadius: 8, fontSize: 13 }}>
                      Enviar por WhatsApp
                    </WhatsAppBtn>
                  )}
                  <button onClick={() => setAprobadoInfo(null)}
                    style={{ flex: 1, padding: 11, background: url ? 'transparent' : '#4f46e5', border: url ? '1px solid #e2e8f0' : 'none', borderRadius: 8, color: url ? muted : '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Listo
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
