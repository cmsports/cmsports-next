'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  RadialLinearScale, Filler, Tooltip, Legend, BarElement
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { crearAccesoJugador } from '@/app/actions/jugadores'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, RadialLinearScale, Filler, Tooltip, Legend, BarElement)

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const POSICION_LABEL: Record<string, string> = {
  fase_grupos:'Fase de grupos', octavos:'Octavos de final', cuartos:'Cuartos de final',
  semifinal:'Semifinal', subcampeon:'Subcampeón', campeon:'Campeón 🏆'
}

const CAT_LABEL: Record<string, string> = {
  sub19:'Sub 19', aficionados:'Aficionados', intermedia:'Intermedia', tc:'TC'
}

const ELO_TABLA: Record<string, Record<string, number>> = {
  sub19:      { fase_grupos:5,  octavos:10, cuartos:15, semifinal:20, subcampeon:25, campeon:35 },
  aficionados:{ fase_grupos:8,  octavos:15, cuartos:22, semifinal:30, subcampeon:40, campeon:55 },
  intermedia: { fase_grupos:12, octavos:20, cuartos:30, semifinal:42, subcampeon:55, campeon:75 },
  tc:         { fase_grupos:20, octavos:32, cuartos:45, semifinal:60, subcampeon:80, campeon:110 }
}

const CLUBES_EXTERNOS = ['Club Nuevo Olimpo','Valentín Ramos','Club Deportivo La Florida','Club San Miguel','Club Maipú','Club Providencia','Otro']

export default function JugadorDetallePage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [jugador, setJugador] = useState<any>(null)
  const [historialElo, setHistorialElo] = useState<any[]>([])
  const [mensualidadActual, setMensualidadActual] = useState<any>(null)
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [partidos, setPartidos] = useState<any[]>([])
  const [externos, setExternos] = useState<any[]>([])
  const [evaluaciones, setEvaluaciones] = useState<any[]>([])
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mostrarAsistencia, setMostrarAsistencia] = useState(false)
  const [guardandoFeedback, setGuardandoFeedback] = useState(false)
  const [feedbackForm, setFeedbackForm] = useState({ feedback:'', meta:'' })
  const [editContacto, setEditContacto] = useState(false)
  const [editPlan, setEditPlan] = useState(false)
  const [contactoForm, setContactoForm] = useState({ email:'', telefono:'', categoria:'' })
  const [planFormState, setPlanFormState] = useState({ tipo_plan:'mensual', entrenamientos_por_semana:'3', mensualidad:'30000' })
  const [guardandoDatos, setGuardandoDatos] = useState(false)
  const [modalExternoOpen, setModalExternoOpen] = useState(false)
  const [externoForm, setExternoForm] = useState({ club:'', clubNombre:'', categoria:'sub19', posicion:'fase_grupos', fecha:'' })
  const [guardandoExterno, setGuardandoExterno] = useState(false)
  const [tieneCuenta, setTieneCuenta] = useState(true)
  const [creandoAcceso, setCreandoAcceso] = useState(false)
  const [accesoPassword, setAccesoPassword] = useState('')
  const [accesoError, setAccesoError] = useState('')
  const [accesoExito, setAccesoExito] = useState(false)

  const PRESETS = [
    { label:'$15.000', valor:15000, ent:1 },
    { label:'$25.000', valor:25000, ent:2 },
    { label:'$30.000', valor:30000, ent:3 },
    { label:'$40.000', valor:40000, ent:4 },
  ]
  const router = useRouter()
  const params = useParams()
  const jugadorId = params.id as string

  const trimestre = `Q${Math.ceil((new Date().getMonth()+1)/3)}-${new Date().getFullYear()}`

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      if (perfil.rol === 'jugador' && perfil.jugador_id !== jugadorId) {
        router.replace('/jugadores')
        return
      }

      const mesActual = new Date().getMonth() + 1
      const anioActual = new Date().getFullYear()

      const [{ data: j }, { data: h }, { data: e }, { data: ext }, { data: evs }, { data: asist }, { data: mens }] = await Promise.all([
        supabase.from('jugadores').select('*').eq('id', jugadorId).single(),
        supabase.from('historial_elo').select('*,torneos(nombre)').eq('jugador_id', jugadorId).order('fecha', { ascending: true }),
        supabase.from('torneo_partidos').select('*,torneos(nombre)').or(`jugador_a.eq.${jugadorId},jugador_b.eq.${jugadorId}`).not('ganador', 'is', null),
        supabase.from('torneos_externos').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: false }),
        supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', jugadorId).order('creado_en', { ascending: false }).limit(2),
        supabase.from('asistencia').select('fecha').eq('jugador_id', jugadorId).order('fecha', { ascending: true }),
        supabase.from('mensualidades').select('*').eq('jugador_id', jugadorId).eq('mes', mesActual).eq('anio', anioActual).maybeSingle(),
      ])

      const { data: perfilJugador } = await supabase.from('perfiles').select('id').eq('jugador_id', jugadorId).maybeSingle()
      setTieneCuenta(!!perfilJugador)

      setJugador(j)
      setHistorialElo(h || [])
      setPartidos(e || [])
      setExternos(ext || [])
      setEvaluaciones(evs || [])
      setAsistencias(asist || [])
      setMensualidadActual(mens)

      const evalActual = evs?.find((ev: any) => ev.periodo_trimestre === trimestre)
      if (evalActual) setFeedbackForm({ feedback: evalActual.feedback_profesor || '', meta: evalActual.meta_proximo_periodo || '' })

      setLoading(false)
    }
    cargar()
  }, [authLoading, perfil, jugadorId])

  const esAdmin = perfil?.rol === 'admin'
  const esProfesor = perfil?.rol === 'profesor'
  const esPropio = perfil?.jugador_id === jugadorId
  const puedeVerTodo = esAdmin || esProfesor || esPropio
  const puedeEditar = esAdmin || esProfesor

  const torneosInternos = new Set(historialElo.filter(h => h.torneo_id).map(h => h.torneo_id)).size
  const torneosTotal = torneosInternos + externos.length
  const mensEstado = mensualidadActual?.estado
  const mensLabel = mensEstado === 'pagado' ? '✅ Pagado' : mensEstado === 'atrasado' ? '❌ Atrasado' : mensEstado === 'pendiente' ? '⚠️ Pendiente' : '—'
  const mensColor = mensEstado === 'pagado' ? '#86efac' : mensEstado === 'atrasado' ? '#fca5a5' : mensEstado === 'pendiente' ? '#fde68a' : 'rgba(255,255,255,0.7)'

  const evalActual = evaluaciones.find(ev => ev.periodo_trimestre === trimestre)

  const eloLabels = [
    ...historialElo.map(h => {
      if (!h.fecha) return ''
      const d = new Date(h.fecha)
      return d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
    }),
    'Hoy'
  ]
  const eloData = [...historialElo.map(h => h.elo_despues), jugador?.elo || 1200]
  const eloNombres = [...historialElo.map(h => (h as any).torneos?.nombre || 'Torneo externo'), 'ELO actual']
  const eloTooltips = [...historialElo.map(h => h.posicion || ''), '']
  const eloColores = [...historialElo.map(h => h.torneo_id ? '#3730a3' : '#0F6E56'), '#94a3b8']

  const asistPorMes: Record<string, number> = {}
  asistencias.forEach((a: any) => {
    const m = a.fecha?.slice(0,7)
    if (m) asistPorMes[m] = (asistPorMes[m] || 0) + 1
  })
  const asistData = eloLabels.map(l => asistPorMes[l?.slice(0,7)] || 0)

  async function guardarFeedback() {
    if (!feedbackForm.feedback) return
    setGuardandoFeedback(true)
    if (evalActual) {
      await supabase.from('evaluaciones_trimestrales').update({
        feedback_profesor: feedbackForm.feedback,
        meta_proximo_periodo: feedbackForm.meta || null
      }).eq('id', evalActual.id)
    } else {
      await supabase.from('evaluaciones_trimestrales').insert({
        club_id: jugador?.club_id, jugador_id: jugadorId,
        periodo_trimestre: trimestre,
        feedback_profesor: feedbackForm.feedback,
        meta_proximo_periodo: feedbackForm.meta || null
      })
    }
    const { data: evs } = await supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', jugadorId).order('creado_en', { ascending: false }).limit(2)
    setEvaluaciones(evs || [])
    setGuardandoFeedback(false)
  }

  function abrirEditContacto() {
    setContactoForm({ email: jugador?.email || '', telefono: jugador?.telefono || '', categoria: jugador?.categoria || 'principiante' })
    setEditContacto(true)
  }

  async function guardarContacto() {
    setGuardandoDatos(true)
    await supabase.from('jugadores').update({
      email: contactoForm.email || null,
      telefono: contactoForm.telefono || null,
      categoria: contactoForm.categoria,
    }).eq('id', jugadorId)
    setJugador({ ...jugador, email: contactoForm.email || null, telefono: contactoForm.telefono || null, categoria: contactoForm.categoria })
    setEditContacto(false)
    setGuardandoDatos(false)
  }

  function abrirEditPlan() {
    setPlanFormState({
      tipo_plan: jugador?.tipo_plan || 'mensual',
      entrenamientos_por_semana: String(jugador?.entrenamientos_por_semana || 3),
      mensualidad: String(jugador?.mensualidad || 30000),
    })
    setEditPlan(true)
  }

  async function guardarPlan() {
    setGuardandoDatos(true)
    const ent = planFormState.tipo_plan === 'libre' ? null : parseInt(planFormState.entrenamientos_por_semana) || 3
    const sesLimite = planFormState.tipo_plan === 'libre' ? 99 : (ent || 3) * 4
    const datos = {
      tipo_plan: planFormState.tipo_plan,
      entrenamientos_por_semana: ent,
      mensualidad: parseInt(planFormState.mensualidad) || 0,
      sesiones_limite: sesLimite,
    }
    await supabase.from('jugadores').update(datos).eq('id', jugadorId)
    setJugador({ ...jugador, ...datos })
    setEditPlan(false)
    setGuardandoDatos(false)
  }

  const puntosExternoPreview = ELO_TABLA[externoForm.categoria]?.[externoForm.posicion] || 0

  async function guardarExterno() {
    const clubNombre = externoForm.club === 'Otro' ? externoForm.clubNombre : externoForm.club
    if (!clubNombre || !externoForm.fecha) return
    setGuardandoExterno(true)

    const puntos = ELO_TABLA[externoForm.categoria]?.[externoForm.posicion] || 0
    await supabase.from('torneos_externos').insert({
      club_id: jugador?.club_id, jugador_id: jugadorId,
      nombre_club: clubNombre, categoria: externoForm.categoria,
      posicion: externoForm.posicion, fecha: externoForm.fecha, puntos_elo: puntos
    })

    const eloAntes = jugador?.elo || 1200
    const nuevoElo = eloAntes + puntos
    await supabase.from('jugadores').update({ elo: nuevoElo }).eq('id', jugadorId)
    await supabase.from('historial_elo').insert({
      jugador_id: jugadorId, club_id: jugador?.club_id,
      elo_antes: eloAntes, elo_despues: nuevoElo,
      posicion: POSICION_LABEL[externoForm.posicion], fecha: externoForm.fecha
    })

    const [{ data: ext }, { data: h }] = await Promise.all([
      supabase.from('torneos_externos').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: false }),
      supabase.from('historial_elo').select('*,torneos(nombre)').eq('jugador_id', jugadorId).order('fecha', { ascending: true }),
    ])
    setExternos(ext || [])
    setHistorialElo(h || [])
    setJugador({ ...jugador, elo: nuevoElo })
    setModalExternoOpen(false)
    setExternoForm({ club:'', clubNombre:'', categoria:'sub19', posicion:'fase_grupos', fecha:'' })
    setGuardandoExterno(false)
  }

  async function crearAcceso() {
    setCreandoAcceso(true)
    setAccesoError('')
    const res = await crearAccesoJugador({ jugadorId })
    setCreandoAcceso(false)
    if (res.error) { setAccesoError(res.error); return }
    setAccesoPassword(res.password || '')
    setAccesoExito(true)
    setTieneCuenta(true)
  }

  async function aceptarCompromiso() {
    if (!evalActual) return
    await supabase.from('evaluaciones_trimestrales').update({ firmado_alumno: true }).eq('id', evalActual.id)
    const { data: evs } = await supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', jugadorId).order('creado_en', { ascending: false }).limit(2)
    setEvaluaciones(evs || [])
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (!jugador) return (
    <AppLayout perfil={perfil}>
      <div style={{ padding:40, textAlign:'center', color: muted }}>Jugador no encontrado</div>
    </AppLayout>
  )

  const iniciales = jugador.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()

  return (
    <AppLayout perfil={perfil}>
      <button onClick={() => router.back()} style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 14px', color: muted, fontSize:13, cursor:'pointer', marginBottom:20 }}>
        ← Volver
      </button>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius:16, padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'white', flexShrink:0 }}>
            {iniciales}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:20, fontWeight:700, color:'#fff' }}>{jugador.nombre}</div>
            <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:2 }}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)' }}>{jugador.categoria}</div>
              {jugador.es_externo && <span style={{ background:'rgba(255,255,255,0.2)', color:'#fff', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600 }}>Participante externo</span>}
            </div>
          </div>
          {esAdmin && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {jugador.es_externo && (
                <button onClick={async () => {
                  if (!confirm('¿Agregar este jugador al club? Aparecerá en la lista de jugadores y mensualidades.')) return
                  await supabase.from('jugadores').update({ es_externo: false, sesiones_limite: 12, estado: 'activo' }).eq('id', jugadorId)
                  setJugador({ ...jugador, es_externo: false })
                }} style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                  ✅ Agregar al club
                </button>
              )}
              <button onClick={async () => {
                const nuevoEstado = jugador.estado === 'activo' ? 'bloqueado' : 'activo'
                await supabase.from('jugadores').update({ estado: nuevoEstado }).eq('id', jugadorId)
                setJugador({ ...jugador, estado: nuevoEstado })
              }} style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>
                {jugador.estado==='activo' ? '🔒 Bloquear' : '✅ Activar'}
              </button>
              {!tieneCuenta && (
                <button onClick={crearAcceso} disabled={creandoAcceso} style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                  {creandoAcceso ? 'Creando...' : '🔑 Crear acceso'}
                </button>
              )}
            </div>
          )}
        </div>

        {esAdmin && (accesoError || accesoExito) && (
          <div style={{ marginTop:10, background: accesoError ? 'rgba(220,38,38,0.25)' : 'rgba(34,197,94,0.25)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#fff' }}>
            {accesoError ? accesoError : accesoPassword ? (
              <>✓ Cuenta creada. Contraseña: <b style={{ fontFamily:'monospace' }}>{accesoPassword}</b> — envíasela a {jugador.email}.</>
            ) : (
              <>✓ Cuenta creada con la contraseña que el jugador eligió al pedir la solicitud. Ya puede entrar con {jugador.email}.</>
            )}
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
          <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'10px', textAlign:'center' }}>
            <div style={{ fontSize:22, fontWeight:800, color:'#fff', fontFamily:'monospace' }}>{torneosTotal}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>Torneos</div>
          </div>
          <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'10px', textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:800, color: mensColor, lineHeight:1.8 }}>{mensLabel}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>Mensualidad</div>
          </div>
        </div>

        {/* Info contacto + Plan */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
          {/* Contacto */}
          <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Contacto</div>
              {(puedeEditar || esPropio) && !editContacto && (
                <button onClick={abrirEditContacto} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:6, padding:'2px 8px', fontSize:11, color:'#fff', cursor:'pointer' }}>Editar</button>
              )}
            </div>
            {editContacto ? (
              <div>
                {puedeEditar && (
                  <div style={{ marginBottom:8 }}>
                    <label style={{ fontSize:11, color:'rgba(255,255,255,0.7)', display:'block', marginBottom:3 }}>Categoría</label>
                    <select style={{ width:'100%', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'6px 8px', color:'#fff', fontSize:12, outline:'none' }}
                      value={contactoForm.categoria} onChange={e => setContactoForm(f => ({ ...f, categoria: e.target.value }))}>
                      <option value="principiante">Principiante</option>
                      <option value="intermedio">Intermedio</option>
                      <option value="avanzado">Avanzado</option>
                    </select>
                  </div>
                )}
                <div style={{ marginBottom:8 }}>
                  <label style={{ fontSize:11, color:'rgba(255,255,255,0.7)', display:'block', marginBottom:3 }}>Email</label>
                  <input style={{ width:'100%', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'6px 8px', color:'#fff', fontSize:12, outline:'none' }}
                    type="email" value={contactoForm.email} onChange={e => setContactoForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div style={{ marginBottom:8 }}>
                  <label style={{ fontSize:11, color:'rgba(255,255,255,0.7)', display:'block', marginBottom:3 }}>Teléfono</label>
                  <input style={{ width:'100%', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'6px 8px', color:'#fff', fontSize:12, outline:'none' }}
                    type="tel" placeholder="+56975235780" value={contactoForm.telefono} onChange={e => setContactoForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => setEditContacto(false)} style={{ flex:1, padding:'5px 0', background:'rgba(255,255,255,0.1)', border:'none', borderRadius:6, color:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
                  <button onClick={guardarContacto} disabled={guardandoDatos} style={{ flex:1, padding:'5px 0', background:'#f43f5e', border:'none', borderRadius:6, color:'white', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                    {guardandoDatos ? '...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {jugador.rut && <div style={{ fontSize:12, color:'#fff', marginBottom:4 }}>🪪 {jugador.rut}</div>}
                {jugador.email && <div style={{ fontSize:12, color:'#fff', marginBottom:4 }}>✉️ {jugador.email}</div>}
                {jugador.telefono
                  ? <a href={`https://wa.me/${jugador.telefono.replace(/[^0-9]/g,'')}`} target="_blank"
                      style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:'#fff', textDecoration:'none', marginTop:4 }}>
                      💬 {jugador.telefono}
                    </a>
                  : <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>Sin teléfono</div>
                }
              </>
            )}
          </div>

          {/* Plan */}
          <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Plan</div>
              {puedeEditar && !editPlan && (
                <button onClick={abrirEditPlan} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:6, padding:'2px 8px', fontSize:11, color:'#fff', cursor:'pointer' }}>Editar</button>
              )}
            </div>
            {editPlan ? (
              <div>
                <div style={{ marginBottom:8 }}>
                  <label style={{ fontSize:11, color:'rgba(255,255,255,0.7)', display:'block', marginBottom:3 }}>Tipo de plan</label>
                  <div style={{ display:'flex', gap:0, borderRadius:6, overflow:'hidden', border:'1px solid rgba(255,255,255,0.3)' }}>
                    {(['mensual','semanal','libre'] as const).map(t => (
                      <button key={t} onClick={() => setPlanFormState(f => ({ ...f, tipo_plan: t }))}
                        style={{ flex:1, padding:'6px 0', background: planFormState.tipo_plan === t ? '#f43f5e' : 'rgba(255,255,255,0.1)', color:'#fff', border:'none', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                        {t === 'libre' ? 'Libre' : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {planFormState.tipo_plan !== 'libre' && (
                  <div style={{ marginBottom:8 }}>
                    <label style={{ fontSize:11, color:'rgba(255,255,255,0.7)', display:'block', marginBottom:3 }}>Ent./semana</label>
                    <input type="number" min={1} max={7}
                      style={{ width:'100%', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'6px 8px', color:'#fff', fontSize:12, outline:'none' }}
                      value={planFormState.entrenamientos_por_semana}
                      onChange={e => setPlanFormState(f => ({ ...f, entrenamientos_por_semana: e.target.value }))} />
                  </div>
                )}
                <div style={{ marginBottom:8 }}>
                  <label style={{ fontSize:11, color:'rgba(255,255,255,0.7)', display:'block', marginBottom:3 }}>Mensualidad</label>
                  <div style={{ display:'flex', gap:4, marginBottom:4, flexWrap:'wrap' }}>
                    {PRESETS.map(p => (
                      <button key={p.valor} onClick={() => setPlanFormState(f => ({ ...f, mensualidad: String(p.valor), entrenamientos_por_semana: String(p.ent) }))}
                        style={{ padding:'3px 8px', borderRadius:12, border: parseInt(planFormState.mensualidad) === p.valor ? '1px solid #f43f5e' : '1px solid rgba(255,255,255,0.3)', background: parseInt(planFormState.mensualidad) === p.valor ? '#f43f5e' : 'transparent', color:'#fff', fontSize:10, fontWeight:600, cursor:'pointer' }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <input type="number" placeholder="Monto personalizado"
                    style={{ width:'100%', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'6px 8px', color:'#fff', fontSize:12, outline:'none' }}
                    value={planFormState.mensualidad}
                    onChange={e => setPlanFormState(f => ({ ...f, mensualidad: e.target.value }))} />
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => setEditPlan(false)} style={{ flex:1, padding:'5px 0', background:'rgba(255,255,255,0.1)', border:'none', borderRadius:6, color:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
                  <button onClick={guardarPlan} disabled={guardandoDatos} style={{ flex:1, padding:'5px 0', background:'#f43f5e', border:'none', borderRadius:6, color:'white', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                    {guardandoDatos ? '...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:13, color:'#fff', fontWeight:700, marginBottom:4 }}>
                  ${(jugador.mensualidad || 0).toLocaleString('es-CL')}/mes
                  {jugador.tipo_plan === 'libre' ? ' — Libre acceso' : jugador.entrenamientos_por_semana ? ` — ${jugador.entrenamientos_por_semana} ent/sem` : ''}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginBottom:6 }}>
                  {jugador.tipo_plan ? jugador.tipo_plan.charAt(0).toUpperCase() + jugador.tipo_plan.slice(1) : 'Mensual'}
                  {jugador.tipo_plan !== 'libre' && <> · Usadas: <strong style={{ color:'#fff' }}>{jugador.sesiones_usadas}/{jugador.sesiones_limite}</strong></>}
                </div>
                {jugador.tipo_plan !== 'libre' && (
                  <div style={{ background:'rgba(255,255,255,0.2)', borderRadius:4, height:6 }}>
                    <div style={{ width:`${Math.min(((jugador.sesiones_usadas||0)/(jugador.sesiones_limite||1))*100,100)}%`, background: (jugador.sesiones_usadas||0) >= (jugador.sesiones_limite||1) ? '#fca5a5' : '#fff', borderRadius:4, height:'100%', transition:'width 0.3s' }} />
                  </div>
                )}
                {mensualidadActual && (
                  <div style={{ marginTop:8 }}>
                    <span style={{ background:'rgba(255,255,255,0.2)', color:'#fff', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                      {mensualidadActual.estado==='pagado'?'Mes pagado':mensualidadActual.estado==='atrasado'?'Mes atrasado':'Mes pendiente'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#e2e8f0', borderRadius:10, padding:4, marginBottom:16 }}>
        {['📊 Competencia', ...(puedeVerTodo ? ['📝 Feedback'] : [])].map((t, i) => (
          <div key={i} onClick={() => setTab(i)} style={{ flex:1, padding:'8px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:500, background: tab===i ? '#ffffff' : 'transparent', color: tab===i ? '#4f46e5' : muted, transition:'all 0.15s', boxShadow: tab===i ? '0 4px 16px rgba(15,23,42,0.18)' : 'none' }}>
            {t}
          </div>
        ))}
      </div>

      {/* Tab 0 — Competencia */}
      {tab === 0 && (
        <div>

          {/* Partidos */}
          <div style={{ ...card, overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', fontSize:13, fontWeight:600, color: text }}>Historial de partidos</div>
            {partidos.length === 0
              ? <div style={{ padding:30, textAlign:'center', color: hint, fontSize:13 }}>Sin partidos registrados</div>
              : partidos.slice(0,10).map(p => {
                const gane = p.ganador === jugadorId
                return (
                  <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize:13, color: text }}>{(p as any).torneos?.nombre || '—'}</div>
                      <div style={{ fontSize:11, color: muted }}>{p.fase}</div>
                    </div>
                    <span style={{ background: gane ? '#f0fdf4' : '#fef2f2', color: gane ? '#16a34a' : '#dc2626', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                      {gane ? 'Victoria' : 'Derrota'}
                    </span>
                  </div>
                )
              })
            }
          </div>

          {/* Torneos externos */}
          <div style={{ ...card, overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:13, fontWeight:600, color: text }}>Torneos externos</div>
              {puedeEditar && (
                <button onClick={() => { setModalExternoOpen(true); setExternoForm(f => ({ ...f, fecha: new Date().toISOString().slice(0,10) })) }}
                  style={{ background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer', fontWeight:600 }}>
                  + Agregar
                </button>
              )}
            </div>
            {externos.length === 0
              ? <div style={{ padding:30, textAlign:'center', color: hint, fontSize:13 }}>Sin torneos externos</div>
              : externos.map(t => (
                <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize:13, color: text }}>{t.nombre_club}</div>
                    <div style={{ fontSize:11, color: muted }}>{t.fecha} · {CAT_LABEL[t.categoria] || t.categoria}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:12, color: muted }}>{POSICION_LABEL[t.posicion] || t.posicion}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Tab 1 — Feedback */}
      {tab === 1 && puedeVerTodo && (
        <div>
          {evalActual?.feedback_profesor ? (
            <>
              <div style={{ ...card, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:8 }}>Informe del entrenador</div>
                <div style={{ fontSize:13, color: text, lineHeight:1.6, marginBottom:16 }}>{evalActual.feedback_profesor}</div>
                {evalActual.meta_proximo_periodo && (
                  <div style={{ background:'#ede9fe', borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:'#3730a3', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>Meta del próximo período</div>
                    <div style={{ fontSize:13, color: text, lineHeight:1.6 }}>{evalActual.meta_proximo_periodo}</div>
                  </div>
                )}
              </div>
              {esPropio && (
                <div style={{ ...card, padding:20, marginBottom:16 }}>
                  {evalActual.firmado_alumno
                    ? <div style={{ background:'#f0fdf4', color:'#16a34a', padding:'12px 16px', borderRadius:10, fontSize:13, textAlign:'center', border:'1px solid #bbf7d0' }}>✅ Compromiso aceptado</div>
                    : <>
                        <div style={{ fontSize:13, color: text, marginBottom:12 }}>He leído el informe de mi entrenador y acepto mis metas para el próximo período.</div>
                        <button onClick={aceptarCompromiso} style={{ width:'100%', padding:14, background:'linear-gradient(135deg,#3730a3,#4f46e5)', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
                          ✍️ Aceptar compromiso del trimestre
                        </button>
                      </>
                  }
                </div>
              )}
              {!esPropio && (
                <div style={{ ...card, padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:8 }}>Estado del compromiso</div>
                  {evalActual.firmado_alumno
                    ? <div style={{ background:'#f0fdf4', color:'#16a34a', padding:'10px 16px', borderRadius:10, fontSize:13, border:'1px solid #bbf7d0' }}>✅ Compromiso aceptado por el alumno</div>
                    : <div style={{ background:'#fffbeb', color:'#d97706', padding:'10px 16px', borderRadius:10, fontSize:13, border:'1px solid #fde68a' }}>⏳ Pendiente de aceptación</div>
                  }
                </div>
              )}
            </>
          ) : (
            <div style={{ ...card, padding:30, textAlign:'center', marginBottom:16 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📝</div>
              <div style={{ fontSize:13, color: muted }}>Sin feedback registrado aún</div>
            </div>
          )}

          {puedeEditar && (
            <div style={{ ...card, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>
                {evalActual?.feedback_profesor ? 'Editar feedback' : 'Agregar feedback'} — {trimestre}
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Diagnóstico técnico y desarrollo</label>
                <textarea
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none', resize:'vertical', minHeight:80 }}
                  placeholder="Diagnóstico del alumno este trimestre..."
                  value={feedbackForm.feedback}
                  onChange={e => setFeedbackForm(f => ({ ...f, feedback: e.target.value }))}
                />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Metas para el próximo período</label>
                <textarea
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none', resize:'vertical', minHeight:60 }}
                  placeholder="Objetivos para el siguiente trimestre..."
                  value={feedbackForm.meta}
                  onChange={e => setFeedbackForm(f => ({ ...f, meta: e.target.value }))}
                />
              </div>
              <button onClick={guardarFeedback} disabled={guardandoFeedback} style={{ width:'100%', padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {guardandoFeedback ? 'Guardando...' : 'Guardar feedback'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal — agregar torneo externo */}
      {modalExternoOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:20 }}>Registrar torneo externo — {jugador.nombre}</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Club / Lugar</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={externoForm.club} onChange={e => setExternoForm(f => ({ ...f, club: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {CLUBES_EXTERNOS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {externoForm.club === 'Otro' && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Nombre del club</label>
                <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  placeholder="Nombre del club" value={externoForm.clubNombre} onChange={e => setExternoForm(f => ({ ...f, clubNombre: e.target.value }))} />
              </div>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Categoría</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={externoForm.categoria} onChange={e => setExternoForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="sub19">Sub 19</option>
                <option value="aficionados">Aficionados</option>
                <option value="intermedia">Intermedia</option>
                <option value="tc">TC (Top Competencia)</option>
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Posición alcanzada</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={externoForm.posicion} onChange={e => setExternoForm(f => ({ ...f, posicion: e.target.value }))}>
                {Object.entries(POSICION_LABEL).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Fecha</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                type="date" value={externoForm.fecha} onChange={e => setExternoForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalExternoOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardarExterno} disabled={guardandoExterno} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {guardandoExterno ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
