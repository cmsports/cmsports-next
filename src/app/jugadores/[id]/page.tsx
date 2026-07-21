'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { crearAccesoJugador, resetearPasswordJugador, subirFotoJugador } from '@/app/actions/jugadores'
import { guardarFeedbackAction } from '@/app/actions/feedback'
import { formatRut } from '@/lib/rut'
import { trimestreActual } from '@/lib/domain/trimestre'
import { CATEGORIAS_BUIN, categoriaBuinPorFechaNacimiento } from '@/lib/domain/categoriaBuin'

const supabase = createClient()

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 1px 3px rgba(15,23,42,0.08)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const inputStyle = { width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none' } as const
const labelStyle = { fontSize: 12, color: muted, display: 'block' as const, marginBottom: 4 }
const modalOverlay = { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modalCard = { background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: '0 20px 60px rgba(15,23,42,0.2)' }

const POSICION_LABEL: Record<string, string> = {
  fase_grupos:'Fase de grupos', octavos:'Octavos de final', cuartos:'Cuartos de final',
  semifinal:'Semifinal', subcampeon:'Subcampeón', campeon:'Campeón'
}

const CAT_LABEL: Record<string, string> = {
  sub19:'Sub 19', aficionados:'Aficionados', intermedia:'Intermedia', tc:'TC'
}

const CLUBES_EXTERNOS = ['Club Nuevo Olimpo','Valentín Ramos','Club Deportivo La Florida','Club San Miguel','Club Maipú','Club Providencia','Otro']

function InfoRow({ label, value, accent }: { label: string; value: string | null | undefined; accent?: boolean }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
      <span style={{ fontSize: 12, color: muted, flexShrink: 0, minWidth: 90 }}>{label}</span>
      <span style={{ fontSize: 13, color: accent ? '#dc2626' : text, fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

function CardHeader({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      {onEdit && (
        <button onClick={onEdit} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: muted, cursor: 'pointer', fontWeight: 600 }}>
          Editar
        </button>
      )}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

export default function JugadorDetallePage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [jugador, setJugador] = useState<any>(null)
  const [mensualidadActual, setMensualidadActual] = useState<any>(null)
  const [partidos, setPartidos] = useState<any[]>([])
  const [externos, setExternos] = useState<any[]>([])
  const [evaluaciones, setEvaluaciones] = useState<any[]>([])
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [guardandoFeedback, setGuardandoFeedback] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [feedbackExito, setFeedbackExito] = useState('')
  const [feedbackForm, setFeedbackForm] = useState({ feedback:'', meta:'' })
  const [editContacto, setEditContacto] = useState(false)
  const [editPlan, setEditPlan] = useState(false)
  const [contactoForm, setContactoForm] = useState({ nombre:'', rut:'', email:'', telefono:'', categoria:'', fecha_nacimiento:'', direccion:'', comuna:'', contacto_emergencia_nombre:'', contacto_emergencia_telefono:'', indicaciones_medicas:'', federado: false as boolean | null })
  const [planFormState, setPlanFormState] = useState({ tipo_plan:'mensual', entrenamientos_por_semana:'3', mensualidad:'30000' })
  const [guardandoDatos, setGuardandoDatos] = useState(false)
  const [datosError, setDatosError] = useState('')
  const [modalExternoOpen, setModalExternoOpen] = useState(false)
  const [externoForm, setExternoForm] = useState({ club:'', clubNombre:'', categoria:'sub19', posicion:'fase_grupos', fecha:'' })
  const [guardandoExterno, setGuardandoExterno] = useState(false)
  const [tieneCuenta, setTieneCuenta] = useState(true)
  const [creandoAcceso, setCreandoAcceso] = useState(false)
  const [accesoError, setAccesoError] = useState('')
  const [accesoExito, setAccesoExito] = useState(false)
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [passwordNueva, setPasswordNueva] = useState('')
  const [cambiandoPassword, setCambiandoPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ok: boolean; text: string} | null>(null)
  const [recargaVersion, setRecargaVersion] = useState(0)
  const [clubNombre, setClubNombre] = useState('')
  // Foto
  const [modalFoto, setModalFoto] = useState(false)
  const [fotoSrc, setFotoSrc] = useState<string | null>(null)
  const [fotoOffset, setFotoOffset] = useState({ x: 0, y: 0 })
  const [fotoScale, setFotoScale] = useState(1)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  const PRESETS = [
    { label:'$15.000', valor:15000, ent:1 },
    { label:'$25.000', valor:25000, ent:2 },
    { label:'$30.000', valor:30000, ent:3 },
    { label:'$40.000', valor:40000, ent:4 },
  ]
  const router = useRouter()
  const params = useParams()
  const jugadorId = params.id as string

  const trimestre = trimestreActual()

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      if (perfil.rol !== 'admin' && perfil.rol !== 'profesor') {
        router.replace(perfil.rol === 'jugador' ? '/perfil' : '/')
        return
      }

      const mesActual = new Date().getMonth() + 1
      const anioActual = new Date().getFullYear()

      try {
        const [{ data: j }, { data: e }, { data: ext }, { data: evs }, { data: mens }] = await Promise.all([
          supabase.from('jugadores').select('*').eq('id', jugadorId).single(),
          supabase.from('torneo_partidos').select('*,torneos(nombre)').or(`jugador_a.eq.${jugadorId},jugador_b.eq.${jugadorId}`).not('ganador', 'is', null),
          supabase.from('torneos_externos').select('id,jugador_id,nombre,resultado,rival,fecha,categoria,lugar,descripcion').eq('jugador_id', jugadorId).order('fecha', { ascending: false }),
          supabase.from('evaluaciones_trimestrales').select('id,jugador_id,periodo_trimestre,feedback_profesor,meta_proximo_periodo,firmado_alumno,creado_en').eq('jugador_id', jugadorId).order('creado_en', { ascending: false }).limit(2),
          perfil.rol === 'admin'
            ? supabase.from('mensualidades').select('id,jugador_id,mes,anio,estado,monto,fecha_pago').eq('jugador_id', jugadorId).eq('mes', mesActual).eq('anio', anioActual).maybeSingle()
            : Promise.resolve({ data: null }),
        ])

        if (perfil.rol === 'admin') {
          const { data: perfilJugador } = await supabase.from('perfiles').select('id').eq('jugador_id', jugadorId).maybeSingle()
          setTieneCuenta(!!perfilJugador)
        }

        if (!j) { setErrorCarga('No se encontró el jugador o no tenés acceso.'); setLoading(false); return }

        if (j.club_id) {
          const { data: club } = await supabase.from('clubes').select('nombre').eq('id', j.club_id).single()
          if (club?.nombre) setClubNombre(club.nombre)
        }

        setJugador(j)
        setPartidos(e || [])
        setExternos(ext || [])
        setEvaluaciones(evs || [])
        setMensualidadActual(mens)

        const evalActual = evs?.find((ev: any) => ev.periodo_trimestre === trimestre)
        if (evalActual) setFeedbackForm({ feedback: evalActual.feedback_profesor || '', meta: evalActual.meta_proximo_periodo || '' })
      } catch {
        setErrorCarga('No se pudieron cargar los datos del jugador. Verificá tu conexión.')
      }

      setLoading(false)
    }
    cargar()
  }, [authLoading, perfil, jugadorId, recargaVersion, router, trimestre])

  useEffect(() => {
    if (!jugadorId || !perfil?.club_id || !['admin', 'profesor'].includes(perfil.rol || '')) return
    const recargar = () => setRecargaVersion(version => version + 1)
    const canal = supabase
      .channel(`jugador-detalle-${perfil.id}-${jugadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jugadores', filter: `id=eq.${jugadorId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluaciones_trimestrales', filter: `jugador_id=eq.${jugadorId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneos_externos', filter: `jugador_id=eq.${jugadorId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensualidades', filter: `jugador_id=eq.${jugadorId}` }, recargar)
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [jugadorId, perfil?.club_id, perfil?.id, perfil?.rol])

  const esClubBuin = /bu[ií]n/i.test(clubNombre)
  const esAdmin = perfil?.rol === 'admin'
  const esProfesor = perfil?.rol === 'profesor'
  const puedeVerTodo = esAdmin || esProfesor
  const puedeEditar = esAdmin
  const puedeEvaluar = esAdmin || esProfesor

  const torneosInternos = new Set(partidos.map(p => p.torneo_id).filter(Boolean)).size
  const torneosTotal = torneosInternos + externos.length
  const mensEstado = mensualidadActual?.estado
  const mensLabel = mensEstado === 'pagado' ? 'Pagado' : mensEstado === 'atrasado' ? 'Atrasado' : mensEstado === 'pendiente' ? 'Pendiente' : '—'
  const mensColor = mensEstado === 'pagado' ? '#16a34a' : mensEstado === 'atrasado' ? '#dc2626' : mensEstado === 'pendiente' ? '#d97706' : hint
  const mensBg = mensEstado === 'pagado' ? '#f0fdf4' : mensEstado === 'atrasado' ? '#fef2f2' : mensEstado === 'pendiente' ? '#fffbeb' : '#f8fafc'

  const evalActual = evaluaciones.find(ev => ev.periodo_trimestre === trimestre)

  async function guardarFeedback() {
    if (!feedbackForm.feedback.trim()) {
      setFeedbackError('El feedback es obligatorio')
      return
    }
    setGuardandoFeedback(true)
    setFeedbackError('')
    setFeedbackExito('')
    const resultado = await guardarFeedbackAction({
      jugadorId,
      evaluacionId: evalActual?.id,
      periodo: trimestre,
      feedback: feedbackForm.feedback,
      meta: feedbackForm.meta,
    })
    if (resultado.error) {
      setFeedbackError(resultado.error)
      setGuardandoFeedback(false)
      return
    }
    const { data: evs } = await supabase.from('evaluaciones_trimestrales').select('id,jugador_id,periodo_trimestre,feedback_profesor,meta_proximo_periodo,firmado_alumno,creado_en').eq('jugador_id', jugadorId).order('creado_en', { ascending: false }).limit(2)
    setEvaluaciones(evs || [])
    setFeedbackExito('Feedback guardado. El jugador debe confirmarlo.')
    setGuardandoFeedback(false)
  }

  function abrirEditContacto() {
    setContactoForm({
      nombre: jugador?.nombre || '',
      rut: jugador?.rut || '',
      email: jugador?.email || '',
      telefono: jugador?.telefono || '',
      categoria: jugador?.categoria || (esClubBuin ? '' : 'principiante'),
      fecha_nacimiento: jugador?.fecha_nacimiento || '',
      direccion: jugador?.direccion || '',
      comuna: jugador?.comuna || '',
      contacto_emergencia_nombre: jugador?.contacto_emergencia_nombre || '',
      contacto_emergencia_telefono: jugador?.contacto_emergencia_telefono || '',
      indicaciones_medicas: jugador?.indicaciones_medicas || '',
      federado: jugador?.federado ?? null,
    })
    setDatosError('')
    setEditContacto(true)
  }

  async function guardarContacto() {
    if (puedeEditar && !contactoForm.nombre.trim()) {
      setDatosError('El nombre es obligatorio')
      return
    }
    setGuardandoDatos(true)
    setDatosError('')
    const datos: Record<string, any> = {
      ...(puedeEditar ? { nombre: contactoForm.nombre.trim(), rut: contactoForm.rut || null } : {}),
      email: contactoForm.email || null,
      telefono: contactoForm.telefono || null,
      categoria: contactoForm.categoria,
      fecha_nacimiento: contactoForm.fecha_nacimiento || null,
      direccion: contactoForm.direccion?.trim() || null,
      comuna: contactoForm.comuna?.trim() || null,
      contacto_emergencia_nombre: contactoForm.contacto_emergencia_nombre?.trim() || null,
      contacto_emergencia_telefono: contactoForm.contacto_emergencia_telefono?.trim() || null,
      indicaciones_medicas: contactoForm.indicaciones_medicas?.trim() || null,
      federado: contactoForm.federado,
    }
    const { error } = await supabase.from('jugadores').update(datos).eq('id', jugadorId)
    if (error) {
      setDatosError(`No se pudieron guardar los cambios: ${error.message}`)
      setGuardandoDatos(false)
      return
    }
    setJugador({ ...jugador, ...datos })
    setEditContacto(false)
    setGuardandoDatos(false)
  }

  function abrirEditPlan() {
    setPlanFormState({
      tipo_plan: jugador?.tipo_plan || 'mensual',
      entrenamientos_por_semana: String(jugador?.entrenamientos_por_semana || 3),
      mensualidad: String(jugador?.mensualidad || 30000),
    })
    setDatosError('')
    setEditPlan(true)
  }

  async function guardarPlan() {
    setGuardandoDatos(true)
    setDatosError('')
    const ent = planFormState.tipo_plan === 'libre' ? null : parseInt(planFormState.entrenamientos_por_semana) || 3
    const sesLimite = planFormState.tipo_plan === 'libre' ? 99 : (ent || 3) * 4
    const datos = {
      tipo_plan: planFormState.tipo_plan,
      entrenamientos_por_semana: ent,
      mensualidad: parseInt(planFormState.mensualidad) || 0,
      sesiones_limite: sesLimite,
    }
    const { error } = await supabase.from('jugadores').update(datos).eq('id', jugadorId)
    if (error) {
      setDatosError(`No se pudo guardar el plan: ${error.message}`)
      setGuardandoDatos(false)
      return
    }
    setJugador({ ...jugador, ...datos })
    setEditPlan(false)
    setGuardandoDatos(false)
  }

  async function guardarExterno() {
    const clubNombreExt = externoForm.club === 'Otro' ? externoForm.clubNombre : externoForm.club
    if (!clubNombreExt || !externoForm.fecha) return
    setGuardandoExterno(true)
    setDatosError('')

    const { error } = await supabase.from('torneos_externos').insert({
      club_id: jugador?.club_id, jugador_id: jugadorId,
      nombre_club: clubNombreExt, categoria: externoForm.categoria,
      posicion: externoForm.posicion, fecha: externoForm.fecha,
    })
    if (error) {
      setDatosError(`No se pudo registrar el torneo: ${error.message}`)
      setGuardandoExterno(false)
      return
    }

    const { data: ext } = await supabase.from('torneos_externos').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: false })
    setExternos(ext || [])
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
    setAccesoExito(true)
    setTieneCuenta(true)
  }

  // ── Foto callbacks (hooks deben ir antes de cualquier early return) ──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: fotoOffset.x, oy: fotoOffset.y }
  }, [fotoOffset])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || !imgRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const newOffset = { x: dragRef.current.ox + dx, y: dragRef.current.oy + dy }
    setFotoOffset(newOffset)
    dibujarCanvas(imgRef.current, newOffset, fotoScale)
  }, [fotoScale])

  const onMouseUp = useCallback(() => { dragRef.current = null }, [])

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (errorCarga) return (
    <AppLayout perfil={perfil}>
      <div style={{ padding:40, textAlign:'center' }}>
        <div style={{ fontSize:16, color:'#dc2626', marginBottom:12 }}>{errorCarga}</div>
        <button onClick={() => { setErrorCarga(''); setLoading(true); }} style={{ background:'#4f46e5', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, cursor:'pointer' }}>Reintentar</button>
      </div>
    </AppLayout>
  )

  if (!jugador) return (
    <AppLayout perfil={perfil}>
      <div style={{ padding:40, textAlign:'center', color: muted }}>Jugador no encontrado</div>
    </AppLayout>
  )

  const iniciales = jugador.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()

  // ── Foto helpers ──
  function onFotoFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => {
      const src = e.target?.result as string
      setFotoSrc(src)
      setFotoOffset({ x: 0, y: 0 })
      setFotoScale(1)
      const img = new Image()
      img.onload = () => { imgRef.current = img; dibujarCanvas(img, { x: 0, y: 0 }, 1) }
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  function dibujarCanvas(img: HTMLImageElement, offset: { x: number; y: number }, scale: number) {
    const canvas = canvasRef.current
    if (!canvas) return
    const SIZE = 300
    canvas.width = SIZE; canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, SIZE, SIZE)
    // clip circular
    ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2); ctx.clip()
    // fit image
    const ratio = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight) * scale
    const w = img.naturalWidth * ratio
    const h = img.naturalHeight * ratio
    const x = (SIZE - w) / 2 + offset.x
    const y = (SIZE - h) / 2 + offset.y
    ctx.drawImage(img, x, y, w, h)
  }

  function onScaleChange(v: number) {
    setFotoScale(v)
    if (imgRef.current) dibujarCanvas(imgRef.current, fotoOffset, v)
  }

  async function guardarFoto() {
    const canvas = canvasRef.current
    if (!canvas) return
    setSubiendoFoto(true)
    canvas.toBlob(async blob => {
      if (!blob) { setSubiendoFoto(false); return }
      const reader = new FileReader()
      reader.onload = async e => {
        const base64 = e.target?.result as string
        const res = await subirFotoJugador({ jugadorId, base64 })
        if (res.error) { alert('Error subiendo foto: ' + res.error); setSubiendoFoto(false); return }
        setJugador((prev: any) => ({ ...prev, foto_url: res.url }))
        setModalFoto(false)
        setFotoSrc(null)
        setSubiendoFoto(false)
      }
      reader.readAsDataURL(blob)
    }, 'image/jpeg', 0.92)
  }
  const edad = jugador.fecha_nacimiento ? new Date().getFullYear() - parseInt(jugador.fecha_nacimiento.slice(0, 4)) : null
  const tieneEmergencia = jugador.contacto_emergencia_nombre || jugador.indicaciones_medicas

  return (
    <AppLayout perfil={perfil}>
      <button onClick={() => router.back()} style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 14px', color: muted, fontSize:13, cursor:'pointer', marginBottom:16 }}>
        ← Volver
      </button>

      {/* ── Header compacto ── */}
      <div style={{ background:'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div
            onClick={() => esAdmin && setModalFoto(true)}
            title={esAdmin ? 'Cambiar foto' : undefined}
            style={{ width:60, height:60, borderRadius:'50%', background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:'white', flexShrink:0, overflow:'hidden', cursor: esAdmin ? 'pointer' : 'default', position:'relative' }}
          >
            {jugador.foto_url
              ? <img src={jugador.foto_url} alt="foto" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
              : iniciales}
            {esAdmin && (
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', transition:'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.35)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0)')}
              >
                <span style={{ fontSize:10, color:'white', fontWeight:700, opacity:0, transition:'opacity 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                >📷</span>
              </div>
            )}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:22, fontWeight:700, color:'#fff' }}>{jugador.nombre}</div>
            <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:4, flexWrap:'wrap' }}>
              <span style={{ background:'rgba(255,255,255,0.2)', color:'#fff', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>{jugador.categoria || '—'}</span>
              {jugador.es_externo && <span style={{ background:'rgba(251,191,36,0.3)', color:'#fde68a', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>Externo</span>}
              <span style={{ background: jugador.estado === 'activo' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)', color: jugador.estado === 'activo' ? '#86efac' : '#fca5a5', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                {jugador.estado === 'activo' ? 'Activo' : 'Bloqueado'}
              </span>
            </div>
          </div>
          {esAdmin && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
              {jugador.es_externo && (
                <button onClick={async () => {
                  if (!confirm('¿Agregar este jugador al club?')) return
                  const { error } = await supabase.from('jugadores').update({ es_externo: false, sesiones_limite: 12, estado: 'activo' }).eq('id', jugadorId)
                  if (error) { setDatosError(`No se pudo agregar al club: ${error.message}`); return }
                  setJugador({ ...jugador, es_externo: false })
                }} style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'6px 14px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                  Agregar al club
                </button>
              )}
              <button onClick={async () => {
                const nuevoEstado = jugador.estado === 'activo' ? 'bloqueado' : 'activo'
                const { error } = await supabase.from('jugadores').update({ estado: nuevoEstado }).eq('id', jugadorId)
                if (error) { setDatosError(`No se pudo cambiar el estado: ${error.message}`); return }
                setJugador({ ...jugador, estado: nuevoEstado })
              }} style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'6px 14px', fontSize:12, cursor:'pointer' }}>
                {jugador.estado==='activo' ? 'Bloquear' : 'Activar'}
              </button>
              {puedeEditar && !tieneCuenta && (
                <button onClick={crearAcceso} disabled={creandoAcceso} style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'6px 14px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                  {creandoAcceso ? 'Creando...' : 'Crear acceso'}
                </button>
              )}
              {puedeEditar && tieneCuenta && (
                <button onClick={() => { setShowPasswordReset(v => !v); setPasswordMsg(null); setPasswordNueva('') }} style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'6px 14px', fontSize:12, cursor:'pointer' }}>
                  Contraseña
                </button>
              )}
            </div>
          )}
        </div>

        {esAdmin && (accesoError || accesoExito) && (
          <div style={{ marginTop:12, background: accesoError ? 'rgba(220,38,38,0.25)' : 'rgba(34,197,94,0.25)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#fff' }}>
            {accesoError ? accesoError : <>Invitación enviada a {jugador.email}. El jugador debe usar ese enlace para crear su contraseña.</>}
          </div>
        )}
        {esAdmin && showPasswordReset && (
          <div style={{ marginTop:12, background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginBottom:8, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Cambiar contraseña</div>
            <div style={{ display:'flex', gap:8 }}>
              <input type="password" placeholder="Nueva contraseña (mín. 6 caracteres)" value={passwordNueva}
                onChange={e => setPasswordNueva(e.target.value)}
                style={{ flex:1, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'8px 12px', color:'#fff', fontSize:12, outline:'none' }} />
              <button disabled={cambiandoPassword || passwordNueva.length < 6}
                onClick={async () => {
                  setCambiandoPassword(true); setPasswordMsg(null)
                  const res = await resetearPasswordJugador({ jugadorId, nuevaPassword: passwordNueva })
                  setCambiandoPassword(false)
                  if (res.error) { setPasswordMsg({ ok: false, text: res.error }); return }
                  setPasswordNueva(''); setShowPasswordReset(false)
                  setPasswordMsg({ ok: true, text: 'Contraseña actualizada' })
                }}
                style={{ background:'rgba(255,255,255,0.25)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'8px 14px', fontSize:12, cursor: cambiandoPassword || passwordNueva.length < 6 ? 'not-allowed' : 'pointer', fontWeight:600, whiteSpace:'nowrap', opacity: passwordNueva.length < 6 ? 0.5 : 1 }}>
                {cambiandoPassword ? '...' : 'Guardar'}
              </button>
            </div>
            {passwordMsg && <div style={{ marginTop:8, fontSize:11, color: passwordMsg.ok ? '#86efac' : '#fca5a5' }}>{passwordMsg.ok ? '✓ ' : '✗ '}{passwordMsg.text}</div>}
          </div>
        )}
        {esAdmin && passwordMsg && !showPasswordReset && (
          <div style={{ marginTop:12, background:'rgba(34,197,94,0.25)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#fff' }}>
            ✓ {passwordMsg.text}
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:12, marginBottom:20 }}>
        <div style={{ ...cardStyle, padding:'16px 20px', textAlign:'center' }}>
          <div style={{ fontSize:28, fontWeight:800, color:'#4f46e5', fontFamily:'monospace' }}>{torneosTotal}</div>
          <div style={{ fontSize:11, color: muted, marginTop:2 }}>Torneos</div>
        </div>
        {esAdmin && (
          <div style={{ ...cardStyle, padding:'16px 20px', textAlign:'center', background: mensBg }}>
            <div style={{ fontSize:14, fontWeight:700, color: mensColor }}>{mensLabel}</div>
            <div style={{ fontSize:11, color: muted, marginTop:2 }}>Mensualidad</div>
          </div>
        )}
        {jugador.tipo_plan !== 'libre' && (
          <div style={{ ...cardStyle, padding:'16px 20px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:800, color: (jugador.sesiones_usadas||0) >= (jugador.sesiones_limite||1) ? '#dc2626' : '#4f46e5', fontFamily:'monospace' }}>
              {jugador.sesiones_usadas || 0}<span style={{ fontSize:14, color: muted }}>/{jugador.sesiones_limite || 0}</span>
            </div>
            <div style={{ fontSize:11, color: muted, marginTop:2 }}>Sesiones</div>
          </div>
        )}
        {edad && (
          <div style={{ ...cardStyle, padding:'16px 20px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#4f46e5', fontFamily:'monospace' }}>{edad}</div>
            <div style={{ fontSize:11, color: muted, marginTop:2 }}>Años</div>
          </div>
        )}
      </div>

      {/* ── Tarjetas de información ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:16, marginBottom:24 }}>

        {/* Información personal */}
        <div style={cardStyle}>
          <CardHeader title="Información personal" onEdit={puedeEditar ? abrirEditContacto : undefined} />
          <div style={{ padding:'4px 20px 16px' }}>
            <InfoRow label="Nombre" value={jugador.nombre} />
            <InfoRow label="RUT" value={jugador.rut} />
            <InfoRow label="Email" value={jugador.email} />
            <InfoRow label="Teléfono" value={jugador.telefono} />
            <InfoRow label="Categoría" value={jugador.categoria} />
            {jugador.fecha_nacimiento && <InfoRow label="Nacimiento" value={jugador.fecha_nacimiento} />}
            {jugador.grupo && <InfoRow label="Grupo" value={jugador.grupo} />}
            {jugador.horario && <InfoRow label="Horario" value={jugador.horario} />}
            {esClubBuin && <InfoRow label="Federado" value={jugador.federado ? 'Sí' : jugador.federado === false ? 'No' : '—'} />}
            {jugador.telefono && (
              <div style={{ paddingTop:12 }}>
                <a href={`https://wa.me/${jugador.telefono.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'#16a34a', textDecoration:'none', background:'#f0fdf4', padding:'6px 12px', borderRadius:8, border:'1px solid #bbf7d0', fontWeight:600 }}>
                  WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Plan */}
        <div style={cardStyle}>
          <CardHeader title="Plan & Membresía" onEdit={puedeEditar ? abrirEditPlan : undefined} />
          <div style={{ padding:'16px 20px' }}>
            <div style={{ fontSize:24, fontWeight:800, color: text, marginBottom:4 }}>
              ${(jugador.mensualidad || 0).toLocaleString('es-CL')}<span style={{ fontSize:13, fontWeight:400, color: muted }}>/mes</span>
            </div>
            <div style={{ fontSize:13, color: muted, marginBottom:16 }}>
              {jugador.tipo_plan ? jugador.tipo_plan.charAt(0).toUpperCase() + jugador.tipo_plan.slice(1) : 'Mensual'}
              {jugador.tipo_plan === 'libre' ? ' — Libre acceso' : jugador.entrenamientos_por_semana ? ` — ${jugador.entrenamientos_por_semana} entrenamientos/semana` : ''}
            </div>
            {jugador.tipo_plan !== 'libre' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color: muted, marginBottom:6 }}>
                  <span>Sesiones usadas</span>
                  <span style={{ fontWeight:600, color: text }}>{jugador.sesiones_usadas || 0} / {jugador.sesiones_limite || 0}</span>
                </div>
                <div style={{ background:'#e2e8f0', borderRadius:6, height:8 }}>
                  <div style={{ width:`${Math.min(((jugador.sesiones_usadas||0)/(jugador.sesiones_limite||1))*100,100)}%`, background: (jugador.sesiones_usadas||0) >= (jugador.sesiones_limite||1) ? '#dc2626' : '#4f46e5', borderRadius:6, height:'100%', transition:'width 0.3s' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ubicación (si hay datos) */}
        {(jugador.direccion || jugador.comuna) && (
          <div style={cardStyle}>
            <CardHeader title="Ubicación" onEdit={puedeEditar ? abrirEditContacto : undefined} />
            <div style={{ padding:'4px 20px 16px' }}>
              <InfoRow label="Dirección" value={jugador.direccion} />
              <InfoRow label="Comuna" value={jugador.comuna} />
            </div>
          </div>
        )}

        {/* Emergencia & Salud */}
        {(esClubBuin || tieneEmergencia) && (
          <div style={cardStyle}>
            <CardHeader title="Emergencia & Salud" onEdit={puedeEditar ? abrirEditContacto : undefined} />
            <div style={{ padding:'4px 20px 16px' }}>
              {jugador.contacto_emergencia_nombre ? (
                <>
                  <InfoRow label="Contacto" value={jugador.contacto_emergencia_nombre} />
                  <InfoRow label="Tel. emergencia" value={jugador.contacto_emergencia_telefono} />
                </>
              ) : (
                <div style={{ padding:'12px 0', fontSize:12, color: hint }}>Sin contacto de emergencia registrado</div>
              )}
              {jugador.indicaciones_medicas ? (
                <div style={{ marginTop:12, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ fontSize:11, color:'#dc2626', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>Indicaciones médicas</div>
                  <div style={{ fontSize:13, color:'#991b1b', lineHeight:1.5 }}>{jugador.indicaciones_medicas}</div>
                </div>
              ) : esClubBuin ? (
                <div style={{ padding:'12px 0', fontSize:12, color: hint }}>Sin indicaciones médicas</div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', background:'#f1f5f9', borderRadius:10, padding:4, marginBottom:16, gap:4 }}>
        {['Competencia', ...(puedeVerTodo ? ['Feedback'] : [])].map((t, i) => (
          <div key={i} onClick={() => setTab(i)} style={{ flex:1, padding:'10px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600, background: tab===i ? '#fff' : 'transparent', color: tab===i ? '#4f46e5' : muted, transition:'all 0.15s', boxShadow: tab===i ? '0 1px 3px rgba(15,23,42,0.1)' : 'none' }}>
            {t}
          </div>
        ))}
      </div>

      {/* ── Tab: Competencia ── */}
      {tab === 0 && (
        <div style={{ display:'grid', gap:16 }}>
          <div style={cardStyle}>
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
                    <span style={{ background: gane ? '#f0fdf4' : '#fef2f2', color: gane ? '#16a34a' : '#dc2626', padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                      {gane ? 'Victoria' : 'Derrota'}
                    </span>
                  </div>
                )
              })
            }
          </div>

          <div style={cardStyle}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:13, fontWeight:600, color: text }}>Torneos externos</div>
              {puedeEditar && (
                <button onClick={() => { setModalExternoOpen(true); setExternoForm(f => ({ ...f, fecha: new Date().toISOString().slice(0,10) })) }}
                  style={{ background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:6, padding:'5px 12px', fontSize:11, cursor:'pointer', fontWeight:600 }}>
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
                  <div style={{ fontSize:12, color: muted }}>{POSICION_LABEL[t.posicion] || t.posicion}</div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Tab: Feedback ── */}
      {tab === 1 && puedeVerTodo && (
        <div style={{ display:'grid', gap:16 }}>
          {evalActual?.feedback_profesor ? (
            <>
              <div style={{ ...cardStyle, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:8 }}>Informe del entrenador</div>
                <div style={{ fontSize:13, color: text, lineHeight:1.6, marginBottom:16 }}>{evalActual.feedback_profesor}</div>
                {evalActual.meta_proximo_periodo && (
                  <div style={{ background:'#ede9fe', borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:'#3730a3', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>Meta del próximo período</div>
                    <div style={{ fontSize:13, color: text, lineHeight:1.6 }}>{evalActual.meta_proximo_periodo}</div>
                  </div>
                )}
              </div>
              <div style={{ ...cardStyle, padding:16 }}>
                <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:8 }}>Estado del compromiso</div>
                {evalActual.firmado_alumno
                  ? <div style={{ background:'#f0fdf4', color:'#16a34a', padding:'10px 16px', borderRadius:10, fontSize:13, border:'1px solid #bbf7d0' }}>Compromiso aceptado por el alumno</div>
                  : <div style={{ background:'#fffbeb', color:'#d97706', padding:'10px 16px', borderRadius:10, fontSize:13, border:'1px solid #fde68a' }}>Pendiente de aceptación</div>
                }
              </div>
            </>
          ) : (
            <div style={{ ...cardStyle, padding:30, textAlign:'center' }}>
              <div style={{ fontSize:13, color: muted }}>Sin feedback registrado aún</div>
            </div>
          )}

          {puedeEvaluar && (
            <div style={{ ...cardStyle, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>
                {evalActual?.feedback_profesor ? 'Editar feedback' : 'Agregar feedback'} — {trimestre}
              </div>
              <FormField label="Diagnóstico técnico y desarrollo">
                <textarea style={{ ...inputStyle, resize:'vertical', minHeight:80 }}
                  placeholder="Diagnóstico del alumno este trimestre..."
                  value={feedbackForm.feedback} onChange={e => setFeedbackForm(f => ({ ...f, feedback: e.target.value }))} />
              </FormField>
              <FormField label="Metas para el próximo período">
                <textarea style={{ ...inputStyle, resize:'vertical', minHeight:60 }}
                  placeholder="Objetivos para el siguiente trimestre..."
                  value={feedbackForm.meta} onChange={e => setFeedbackForm(f => ({ ...f, meta: e.target.value }))} />
              </FormField>
              {feedbackError && <div style={{ marginBottom:10, color:'#dc2626', fontSize:12 }}>{feedbackError}</div>}
              {feedbackExito && <div style={{ marginBottom:10, color:'#16a34a', fontSize:12 }}>{feedbackExito}</div>}
              <button onClick={guardarFeedback} disabled={guardandoFeedback} style={{ width:'100%', padding:12, background:'#4f46e5', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {guardandoFeedback ? 'Guardando...' : 'Guardar feedback'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════ Modal: Editar datos ══════ */}
      {editContacto && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div style={{ fontSize:18, fontWeight:700, color: text }}>Editar jugador</div>
              <button onClick={() => setEditContacto(false)} style={{ background:'#f1f5f9', border:'none', borderRadius:8, width:32, height:32, fontSize:16, cursor:'pointer', color: muted }}>✕</button>
            </div>

            {puedeEditar && (
              <>
                <div style={{ fontSize:12, fontWeight:600, color: muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>Datos personales</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <FormField label="Nombre completo">
                    <input style={inputStyle} value={contactoForm.nombre} onChange={e => setContactoForm(f => ({ ...f, nombre: e.target.value }))} />
                  </FormField>
                  <FormField label="RUT">
                    <input style={inputStyle} placeholder="12.345.678-9" value={contactoForm.rut}
                      onChange={e => setContactoForm(f => ({ ...f, rut: formatRut(e.target.value) }))} />
                  </FormField>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <FormField label="Categoría">
                    <select style={inputStyle} value={contactoForm.categoria} onChange={e => setContactoForm(f => ({ ...f, categoria: e.target.value }))}>
                      {esClubBuin
                        ? CATEGORIAS_BUIN.map(c => <option key={c} value={c}>{c}</option>)
                        : <>
                            <option value="principiante">Principiante</option>
                            <option value="intermedio">Intermedio</option>
                            <option value="avanzado">Avanzado</option>
                          </>
                      }
                    </select>
                  </FormField>
                  <FormField label="Fecha de nacimiento">
                    <input type="date" style={inputStyle} value={contactoForm.fecha_nacimiento}
                      onChange={e => {
                        const fecha = e.target.value
                        const catAuto = esClubBuin ? categoriaBuinPorFechaNacimiento(fecha) : null
                        setContactoForm(f => ({ ...f, fecha_nacimiento: fecha, ...(catAuto ? { categoria: catAuto } : {}) }))
                      }} />
                  </FormField>
                </div>

                <div style={{ borderTop:'1px solid #e2e8f0', margin:'20px 0', paddingTop:20 }}>
                  <div style={{ fontSize:12, fontWeight:600, color: muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>Contacto</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <FormField label="Email">
                    <input type="email" style={inputStyle} value={contactoForm.email} onChange={e => setContactoForm(f => ({ ...f, email: e.target.value }))} />
                  </FormField>
                  <FormField label="Teléfono">
                    <input type="tel" style={inputStyle} placeholder="+56912345678" value={contactoForm.telefono} onChange={e => setContactoForm(f => ({ ...f, telefono: e.target.value }))} />
                  </FormField>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12 }}>
                  <FormField label="Dirección">
                    <input style={inputStyle} value={contactoForm.direccion} onChange={e => setContactoForm(f => ({ ...f, direccion: e.target.value }))} />
                  </FormField>
                  <FormField label="Comuna">
                    <input style={inputStyle} value={contactoForm.comuna} onChange={e => setContactoForm(f => ({ ...f, comuna: e.target.value }))} />
                  </FormField>
                </div>

                {esClubBuin && (
                  <>
                    <div style={{ borderTop:'1px solid #e2e8f0', margin:'20px 0', paddingTop:20 }}>
                      <div style={{ fontSize:12, fontWeight:600, color: muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>Emergencia & Salud</div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      <FormField label="Contacto de emergencia">
                        <input style={inputStyle} placeholder="Nombre del contacto" value={contactoForm.contacto_emergencia_nombre}
                          onChange={e => setContactoForm(f => ({ ...f, contacto_emergencia_nombre: e.target.value }))} />
                      </FormField>
                      <FormField label="Tel. emergencia">
                        <input type="tel" style={inputStyle} placeholder="+56912345678" value={contactoForm.contacto_emergencia_telefono}
                          onChange={e => setContactoForm(f => ({ ...f, contacto_emergencia_telefono: e.target.value }))} />
                      </FormField>
                    </div>
                    <FormField label="Indicaciones médicas">
                      <textarea style={{ ...inputStyle, resize:'vertical', minHeight:60 }} placeholder="Alergias, condiciones, medicamentos..."
                        value={contactoForm.indicaciones_medicas} onChange={e => setContactoForm(f => ({ ...f, indicaciones_medicas: e.target.value }))} />
                    </FormField>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                      <input type="checkbox" id="federado-check" checked={contactoForm.federado === true}
                        onChange={e => setContactoForm(f => ({ ...f, federado: e.target.checked }))}
                        style={{ accentColor:'#4f46e5', width:18, height:18 }} />
                      <label htmlFor="federado-check" style={{ fontSize:13, color: text, cursor:'pointer' }}>Jugador federado</label>
                    </div>
                  </>
                )}
              </>
            )}

            {!puedeEditar && (
              <>
                <FormField label="Email">
                  <input type="email" style={inputStyle} value={contactoForm.email} onChange={e => setContactoForm(f => ({ ...f, email: e.target.value }))} />
                </FormField>
                <FormField label="Teléfono">
                  <input type="tel" style={inputStyle} value={contactoForm.telefono} onChange={e => setContactoForm(f => ({ ...f, telefono: e.target.value }))} />
                </FormField>
              </>
            )}

            {datosError && <div style={{ marginBottom:12, color:'#dc2626', fontSize:12, background:'#fef2f2', padding:'8px 12px', borderRadius:8 }}>{datosError}</div>}

            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button onClick={() => setEditContacto(false)} style={{ flex:1, padding:12, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:13, cursor:'pointer', fontWeight:600 }}>Cancelar</button>
              <button onClick={guardarContacto} disabled={guardandoDatos} style={{ flex:1, padding:12, background:'#4f46e5', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {guardandoDatos ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Modal: Editar plan ══════ */}
      {editPlan && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth:440 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div style={{ fontSize:18, fontWeight:700, color: text }}>Editar plan</div>
              <button onClick={() => setEditPlan(false)} style={{ background:'#f1f5f9', border:'none', borderRadius:8, width:32, height:32, fontSize:16, cursor:'pointer', color: muted }}>✕</button>
            </div>

            <FormField label="Tipo de plan">
              <div style={{ display:'flex', gap:0, borderRadius:8, overflow:'hidden', border:'1px solid #e2e8f0' }}>
                {(['mensual','semanal','libre'] as const).map(t => (
                  <button key={t} onClick={() => setPlanFormState(f => ({ ...f, tipo_plan: t }))}
                    style={{ flex:1, padding:'10px 0', background: planFormState.tipo_plan === t ? '#4f46e5' : '#f8fafc', color: planFormState.tipo_plan === t ? '#fff' : muted, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                    {t === 'libre' ? 'Libre' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </FormField>

            {planFormState.tipo_plan !== 'libre' && (
              <FormField label="Entrenamientos por semana">
                <input type="number" min={1} max={7} style={inputStyle}
                  value={planFormState.entrenamientos_por_semana}
                  onChange={e => setPlanFormState(f => ({ ...f, entrenamientos_por_semana: e.target.value }))} />
              </FormField>
            )}

            <FormField label="Mensualidad">
              <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                {PRESETS.map(p => (
                  <button key={p.valor} onClick={() => setPlanFormState(f => ({ ...f, mensualidad: String(p.valor), entrenamientos_por_semana: String(p.ent) }))}
                    style={{ padding:'6px 14px', borderRadius:20, border: parseInt(planFormState.mensualidad) === p.valor ? '2px solid #4f46e5' : '1px solid #e2e8f0', background: parseInt(planFormState.mensualidad) === p.valor ? '#ede9fe' : '#fff', color: parseInt(planFormState.mensualidad) === p.valor ? '#4f46e5' : text, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input type="number" placeholder="Monto personalizado" style={inputStyle}
                value={planFormState.mensualidad}
                onChange={e => setPlanFormState(f => ({ ...f, mensualidad: e.target.value }))} />
            </FormField>

            {datosError && <div style={{ marginBottom:12, color:'#dc2626', fontSize:12, background:'#fef2f2', padding:'8px 12px', borderRadius:8 }}>{datosError}</div>}

            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button onClick={() => setEditPlan(false)} style={{ flex:1, padding:12, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:13, cursor:'pointer', fontWeight:600 }}>Cancelar</button>
              <button onClick={guardarPlan} disabled={guardandoDatos} style={{ flex:1, padding:12, background:'#4f46e5', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {guardandoDatos ? 'Guardando...' : 'Guardar plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Modal: Torneo externo ══════ */}
      {modalExternoOpen && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth:440 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div style={{ fontSize:18, fontWeight:700, color: text }}>Registrar torneo externo</div>
              <button onClick={() => setModalExternoOpen(false)} style={{ background:'#f1f5f9', border:'none', borderRadius:8, width:32, height:32, fontSize:16, cursor:'pointer', color: muted }}>✕</button>
            </div>

            <FormField label="Club / Lugar">
              <select style={inputStyle} value={externoForm.club} onChange={e => setExternoForm(f => ({ ...f, club: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {CLUBES_EXTERNOS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>

            {externoForm.club === 'Otro' && (
              <FormField label="Nombre del club">
                <input style={inputStyle} placeholder="Nombre del club" value={externoForm.clubNombre} onChange={e => setExternoForm(f => ({ ...f, clubNombre: e.target.value }))} />
              </FormField>
            )}

            <FormField label="Categoría">
              <select style={inputStyle} value={externoForm.categoria} onChange={e => setExternoForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="sub19">Sub 19</option>
                <option value="aficionados">Aficionados</option>
                <option value="intermedia">Intermedia</option>
                <option value="tc">TC (Top Competencia)</option>
              </select>
            </FormField>

            <FormField label="Posición alcanzada">
              <select style={inputStyle} value={externoForm.posicion} onChange={e => setExternoForm(f => ({ ...f, posicion: e.target.value }))}>
                {Object.entries(POSICION_LABEL).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </FormField>

            <FormField label="Fecha">
              <input type="date" style={inputStyle} value={externoForm.fecha} onChange={e => setExternoForm(f => ({ ...f, fecha: e.target.value }))} />
            </FormField>

            {datosError && <div style={{ marginBottom:12, color:'#dc2626', fontSize:12 }}>{datosError}</div>}

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalExternoOpen(false)} style={{ flex:1, padding:12, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:13, cursor:'pointer', fontWeight:600 }}>Cancelar</button>
              <button onClick={guardarExterno} disabled={guardandoExterno} style={{ flex:1, padding:12, background:'#4f46e5', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {guardandoExterno ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal foto ── */}
      {modalFoto && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:28, width:'100%', maxWidth:400, boxShadow:'0 24px 64px rgba(15,23,42,0.25)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:text, marginBottom:4 }}>Foto del jugador</div>
            <div style={{ fontSize:12, color:muted, marginBottom:20 }}>La foto quedará centrada en un círculo. Arrastrá para reposicionar.</div>

            {!fotoSrc ? (
              <label style={{ display:'block', border:'2px dashed #c4b5fd', borderRadius:12, padding:'32px 20px', textAlign:'center', cursor:'pointer', background:'#f5f3ff' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📷</div>
                <div style={{ fontSize:13, color:'#5b21b6', fontWeight:600 }}>Subir foto</div>
                <div style={{ fontSize:11, color:muted, marginTop:4 }}>JPG, PNG, WEBP — cualquier tamaño</div>
                <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => e.target.files?.[0] && onFotoFile(e.target.files[0])} />
              </label>
            ) : (
              <>
                {/* Canvas preview */}
                <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
                  <div style={{ position:'relative', width:300, height:300, borderRadius:'50%', overflow:'hidden', border:'3px solid #7c3aed', cursor:'grab', userSelect:'none' }}>
                    <canvas
                      ref={canvasRef}
                      width={300} height={300}
                      style={{ display:'block' }}
                      onMouseDown={onMouseDown}
                      onMouseMove={onMouseMove}
                      onMouseUp={onMouseUp}
                      onMouseLeave={onMouseUp}
                    />
                  </div>
                </div>

                {/* Zoom */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, color:muted, marginBottom:6 }}>Zoom</div>
                  <input
                    type="range" min={0.5} max={3} step={0.05}
                    value={fotoScale}
                    onChange={e => onScaleChange(Number(e.target.value))}
                    style={{ width:'100%' }}
                  />
                </div>

                {/* Cambiar foto */}
                <label style={{ display:'block', fontSize:12, color:'#5b21b6', fontWeight:600, cursor:'pointer', marginBottom:16, textAlign:'center', textDecoration:'underline' }}>
                  Cambiar imagen
                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => e.target.files?.[0] && onFotoFile(e.target.files[0])} />
                </label>
              </>
            )}

            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button onClick={() => { setModalFoto(false); setFotoSrc(null) }}
                style={{ flex:1, padding:11, background:'#f4f7fa', color:muted, border:'none', borderRadius:8, fontSize:13, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarFoto} disabled={!fotoSrc || subiendoFoto}
                style={{ flex:2, padding:11, background:'#7c3aed', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', opacity:(!fotoSrc || subiendoFoto) ? 0.5 : 1 }}>
                {subiendoFoto ? 'Subiendo...' : 'Guardar foto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
