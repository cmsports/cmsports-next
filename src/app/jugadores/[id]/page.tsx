'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import CampoContrasena from '@/components/CampoContrasena'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { puedeVerPantallasDeClub } from '@/lib/auth/roles'
import { useTextoMonto } from '@/components/Monto'
import { crearAccesoJugador, resetearPasswordJugador, subirFotoJugador, registrarMatricula, desmarcarMatricula } from '@/app/actions/jugadores'
import { credencialDelJugador } from '@/app/actions/credenciales'
import { formatRut } from '@/lib/rut'
import { CATEGORIAS_BUIN, categoriaBuinPorFechaNacimiento, categoriaLabel } from '@/lib/domain/categoriaBuin'
import { calcularRankingInterno, type TorneoConPartidos } from '@/lib/domain/rankingInterno'
import { sumarDias } from '@/lib/domain/panoramaAsistencia'
import DocumentosJugador from '@/components/DocumentosJugador'
import ResumenAsistenciaJugador from '@/components/ResumenAsistenciaJugador'
import RankingJugador from '@/components/RankingJugador'
import { linkWhatsApp } from '@/lib/whatsapp'
import { firmarUrl } from '@/lib/supabase/privado'
import { GRUPOS, sedeLabel, grupoLabel } from '@/lib/domain/sedeGrupo'
import WhatsAppBtn from '@/components/WhatsAppBtn'
import { MessageCircle } from 'lucide-react'
import { asignarBloquesJugador } from '@/app/actions/horario'
import { DIAS, diaLabel, rangoHorario, type BloqueHorario } from '@/lib/domain/horario'
import { SIN_CUOTA, montoIngresado } from '@/lib/domain/mensualidades'
import { fechaChile } from '@/lib/domain/fechaChile'
import { TALLAS_UNIFORME } from '@/lib/domain/tallas'
import { cargarHistorialJugador } from '@/lib/supabase/historial'
import { sesionesDelMes } from '@/lib/domain/historialAsistencia'
import { cuentaDelJugador, type ClaseExtraJugador } from '@/lib/domain/estadoCuenta'

const supabase = createClient()

const cardStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 1px 3px rgba(15,23,42,0.08)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
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

function InfoRow({ label, value, accent, tel }: { label: string; value: string | null | undefined; accent?: boolean; tel?: boolean }) {
  if (!value) return null
  // Los teléfonos se pinchan y abren WhatsApp. Si el número no sirve queda como
  // texto plano: mejor que no pase nada a que abra un chat con un desconocido.
  const wa = tel ? linkWhatsApp(value) : null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
      <span style={{ fontSize: 12, color: muted, flexShrink: 0, minWidth: 90 }}>{label}</span>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {value} <MessageCircle size={13} />
        </a>
      ) : (
        <span style={{ fontSize: 13, color: accent ? '#dc2626' : text, fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
      )}
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
  // Clases extra sin cobrar. Se muestran en el recuadro de Membresía.
  const [extrasImpagas, setExtrasImpagas] = useState<ClaseExtraJugador[]>([])
  const [partidos, setPartidos] = useState<any[]>([])
  const [externos, setExternos] = useState<any[]>([])
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [editContacto, setEditContacto] = useState(false)
  const [editPlan, setEditPlan] = useState(false)
  const [contactoForm, setContactoForm] = useState({ nombre:'', rut:'', email:'', telefono:'', categoria:'', categorias: new Set<string>(), sede:'', grupo:'', fecha_nacimiento:'', direccion:'', comuna:'', contacto_emergencia_nombre:'', contacto_emergencia_telefono:'', indicaciones_medicas:'', federado: false as boolean | null, talla_polera:'', talla_short:'' })
  const [planFormState, setPlanFormState] = useState({ tipo_plan:'mensual', entrenamientos_por_semana:'3', mensualidad:'' })
  const [editDias, setEditDias] = useState(false)
  // Los días salen de los bloques a los que está inscrito, no de casillas
  // sueltas: así la ficha y los cupos no pueden contradecirse.
  const [bloquesClub, setBloquesClub] = useState<BloqueHorario[]>([])
  const [bloquesSel, setBloquesSel]   = useState<Set<string>>(new Set())
  const [guardandoDatos, setGuardandoDatos] = useState(false)
  const [datosError, setDatosError] = useState('')
  // Grupos que quedaron sobre su tope al guardar los días. No impide guardar:
  // el club a veces pasa del cupo a propósito y prefiere enterarse.
  const [avisoCupo, setAvisoCupo] = useState('')
  const [modalExternoOpen, setModalExternoOpen] = useState(false)
  const [externoForm, setExternoForm] = useState({ club:'', clubNombre:'', categoria:'sub19', posicion:'fase_grupos', fecha:'' })
  const [guardandoExterno, setGuardandoExterno] = useState(false)
  const [tieneCuenta, setTieneCuenta] = useState(true)
  const [creandoAcceso, setCreandoAcceso] = useState(false)
  const [accesoError, setAccesoError] = useState('')
  const [accesoCreado, setAccesoCreado] = useState<{ usuario: string; password: string } | null>(null)
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [passwordNueva, setPasswordNueva] = useState('')
  const [cambiandoPassword, setCambiandoPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ok: boolean; text: string} | null>(null)
  const [recargaVersion, setRecargaVersion] = useState(0)
  const [credencial, setCredencial] = useState<{ login: string; password: string } | null>(null)
  const [clubNombre, setClubNombre] = useState('')
  const [generandoReporte, setGenerandoReporte] = useState(false)
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


  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      if (!puedeVerPantallasDeClub(perfil.rol) && perfil.rol !== 'profesor') {
        router.replace(perfil.rol === 'jugador' ? '/perfil' : '/')
        return
      }

      const mesActual = new Date().getMonth() + 1
      const anioActual = new Date().getFullYear()

      try {
        const [{ data: j }, { data: e }, { data: ext }, { data: mens }] = await Promise.all([
          supabase.from('jugadores').select('id,nombre,rut,email,telefono,categoria,categorias,sede,grupo,foto_url,foto_path,sesiones_usadas,sesiones_limite,tipo_plan,mensualidad,horario,entrena_lun,entrena_mar,entrena_mie,entrena_jue,entrena_vie,estado,fecha_nacimiento,es_externo,entrenamientos_por_semana,club_id,direccion,comuna,contacto_emergencia_nombre,contacto_emergencia_telefono,indicaciones_medicas,federado,talla_polera,talla_short,matricula_pagada,matricula_monto,matricula_fecha').eq('id', jugadorId).single(),
          supabase.from('torneo_partidos').select('id,jugador_a,jugador_b,ganador,fase,torneos(nombre)').or(`jugador_a.eq.${jugadorId},jugador_b.eq.${jugadorId}`).not('ganador', 'is', null),
          supabase.from('torneos_externos').select('id,jugador_id,nombre,resultado,rival,fecha,categoria,lugar,descripcion').eq('jugador_id', jugadorId).order('fecha', { ascending: false }),
          perfil.rol === 'admin'
            ? supabase.from('mensualidades').select('id,jugador_id,mes,anio,estado,monto,fecha_pago').eq('jugador_id', jugadorId).eq('mes', mesActual).eq('anio', anioActual).maybeSingle()
            : Promise.resolve({ data: null }),
        ])

        // Lo que debe por clases extra. Si la 098 no corrió, esto devuelve
        // error y data null: el bloque simplemente no aparece.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: extrasPend } = await (supabase as any).from('clases_extraordinarias')
          .select('id,fecha,monto,pagada_en')
          .eq('jugador_id', jugadorId).eq('club_id', perfil.club_id).is('pagada_en', null)
        setExtrasImpagas((extrasPend ?? []) as ClaseExtraJugador[])

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
        setMensualidadActual(mens)
      } catch {
        setErrorCarga('No se pudieron cargar los datos del jugador. Verificá tu conexión.')
      }

      setLoading(false)
    }
    cargar()
  }, [authLoading, perfil, jugadorId, recargaVersion, router])

  useEffect(() => {
    if (!jugadorId || !perfil?.club_id || !['admin', 'profesor'].includes(perfil.rol || '')) return
    const recargar = () => setRecargaVersion(version => version + 1)
    const canal = supabase
      .channel(`jugador-detalle-${perfil.id}-${jugadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jugadores', filter: `id=eq.${jugadorId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneos_externos', filter: `jugador_id=eq.${jugadorId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensualidades', filter: `jugador_id=eq.${jugadorId}` }, recargar)
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [jugadorId, perfil?.club_id, perfil?.id, perfil?.rol])

  const esClubBuin = /bu[ií]n/i.test(clubNombre)

  // La foto está en el bucket privado: su enlace se firma y vence solo.
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  useEffect(() => {
    let activo = true
    if (jugador?.foto_path) {
      void firmarUrl(jugador.foto_path).then(u => { if (activo) setFotoUrl(u) })
    } else {
      setFotoUrl(jugador?.foto_url ?? null)
    }
    return () => { activo = false }
  }, [jugador?.foto_path, jugador?.foto_url])
  const esAdmin = perfil?.rol === 'admin'
  // Los PDF de más arriba arman sus montos aparte y van con la cifra real.
  const fmtMonto = useTextoMonto()
  const [modalMatricula, setModalMatricula]         = useState(false)
  const [montoMatricula, setMontoMatricula]         = useState('')
  const [errorMatricula, setErrorMatricula]         = useState('')
  const [guardandoMatricula, setGuardandoMatricula] = useState(false)
  // Se fija al abrir el modal y se reusa si el guardado falla y se reintenta:
  // así un reintento no crea un segundo ingreso por la misma matrícula.
  const claveMatricula = useRef<string | null>(null)
  const esProfesor = perfil?.rol === 'profesor'

  // Traé la credencial cuando el admin abre la ficha, para que la tarjeta de
  // WhatsApp la pueda armar sin pedirle un clic extra al usuario. Si no tiene
  // espejo, la action la genera al vuelo y la guarda.
  useEffect(() => {
    if (!esAdmin || !jugadorId) return
    let vivo = true
    void credencialDelJugador(jugadorId).then(r => {
      if (!vivo || !r.login || !r.password) return
      setCredencial({ login: r.login, password: r.password })
    })
    return () => { vivo = false }
  }, [esAdmin, jugadorId, passwordMsg])
  const puedeVerTodo = esAdmin || esProfesor
  const puedeEditar = esAdmin
  const puedeEvaluar = esAdmin || esProfesor
  // Los documentos los puede subir el staff o el propio jugador desde su ficha.
  const puedeSubirDocumentos = puedeVerTodo || perfil?.jugador_id === jugadorId

  const torneosInternos = new Set(partidos.map(p => p.torneo_id).filter(Boolean)).size
  const torneosTotal = torneosInternos + externos.length
  const mensEstado = mensualidadActual?.estado
  const mensLabel = mensEstado === 'pagado' ? 'Pagado' : mensEstado === 'atrasado' ? 'Atrasado' : mensEstado === 'pendiente' ? 'Pendiente' : '—'
  const mensColor = mensEstado === 'pagado' ? '#16a34a' : mensEstado === 'atrasado' ? '#dc2626' : mensEstado === 'pendiente' ? '#d97706' : hint
  const mensBg = mensEstado === 'pagado' ? '#f0fdf4' : mensEstado === 'atrasado' ? '#fef2f2' : mensEstado === 'pendiente' ? '#fffbeb' : '#f8fafc'

  function abrirEditContacto() {
    setContactoForm({
      nombre: jugador?.nombre || '',
      rut: jugador?.rut || '',
      email: jugador?.email || '',
      telefono: jugador?.telefono || '',
      categoria: jugador?.categoria || (esClubBuin ? '' : 'principiante'),
      categorias: new Set<string>(jugador?.categorias ?? (jugador?.categoria ? [jugador.categoria] : [])),
      sede: jugador?.sede || '',
      grupo: jugador?.grupo || '',
      fecha_nacimiento: jugador?.fecha_nacimiento || '',
      direccion: jugador?.direccion || '',
      comuna: jugador?.comuna || '',
      contacto_emergencia_nombre: jugador?.contacto_emergencia_nombre || '',
      contacto_emergencia_telefono: jugador?.contacto_emergencia_telefono || '',
      indicaciones_medicas: jugador?.indicaciones_medicas || '',
      federado: jugador?.federado ?? null,
      talla_polera: jugador?.talla_polera || '',
      talla_short: jugador?.talla_short || '',
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
      // La categoría principal siempre forma parte de la lista, aunque el admin
      // no la haya marcado: ranking y torneos siguen filtrando por ella.
      categorias: [...new Set([
        ...(contactoForm.categoria ? [contactoForm.categoria] : []),
        ...contactoForm.categorias,
      ])],
      // La sede no viaja: es un espejo de los bloques y la escribe la base.
      grupo: contactoForm.grupo || null,
      fecha_nacimiento: contactoForm.fecha_nacimiento || null,
      direccion: contactoForm.direccion?.trim() || null,
      comuna: contactoForm.comuna?.trim() || null,
      contacto_emergencia_nombre: contactoForm.contacto_emergencia_nombre?.trim() || null,
      contacto_emergencia_telefono: contactoForm.contacto_emergencia_telefono?.trim() || null,
      indicaciones_medicas: contactoForm.indicaciones_medicas?.trim() || null,
      federado: contactoForm.federado,
      talla_polera: contactoForm.talla_polera || null,
      talla_short: contactoForm.talla_short || null,
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

  // Mismo cálculo que ve el jugador en su estado de cuenta: si acá dijera otra
  // cosa, el admin le estaría cobrando un número y él viendo otro.
  const cuentaExtras   = cuentaDelJugador(null, extrasImpagas)
  const totalExtras    = cuentaExtras.extras
  const extrasSinMonto = cuentaExtras.sinMonto.length

  async function desmarcarMatriculaJugador() {
    if (!jugador) return
    if (!confirm('¿Marcar la matrícula como no pagada?\n\nEl ingreso que ya se haya registrado en Finanzas se mantiene: esa plata entró de verdad. Si volvés a marcarla, se te pedirá el monto y se registra un ingreso nuevo.')) return
    setGuardandoMatricula(true)
    const res = await desmarcarMatricula({ jugadorId: jugador.id })
    setGuardandoMatricula(false)
    if (res.error) { alert(res.error); return }
    setJugador({ ...jugador, matricula_pagada: false })
  }

  async function guardarMatricula() {
    if (!jugador) return
    const monto = montoIngresado(montoMatricula)
    if (monto == null) { setErrorMatricula('Escribí un monto. Si no le cobrás nada, poné 0.'); return }
    if (monto < 0) { setErrorMatricula('El monto no puede ser negativo.'); return }
    claveMatricula.current ??= crypto.randomUUID()
    setGuardandoMatricula(true)
    setErrorMatricula('')
    const res = await registrarMatricula({ jugadorId: jugador.id, monto, idempotencyKey: claveMatricula.current })
    setGuardandoMatricula(false)
    if (res.error) { setErrorMatricula(res.error); return }
    claveMatricula.current = null
    setJugador({ ...jugador, matricula_pagada: true, matricula_monto: monto, matricula_fecha: fechaChile() })
    setModalMatricula(false)
    setMontoMatricula('')
  }

  function abrirEditPlan() {
    setPlanFormState({
      tipo_plan: jugador?.tipo_plan || 'mensual',
      entrenamientos_por_semana: String(jugador?.entrenamientos_por_semana || 3),
      // Sin cuota asignada el campo llega vacío. Antes llegaba con $30.000 ya
      // escrito: bastaba abrir el plan y guardar para dejarle al jugador una
      // cuota que nadie decidió, con toda la cara de estar bien puesta.
      mensualidad: jugador?.mensualidad != null ? String(jugador.mensualidad) : '',
    })
    setDatosError('')
    setEditPlan(true)
  }

  async function guardarPlan() {
    setGuardandoDatos(true)
    setDatosError('')
    const ent = planFormState.tipo_plan === 'libre' ? null : parseInt(planFormState.entrenamientos_por_semana) || 3
    const sesLimite = planFormState.tipo_plan === 'libre' ? 99 : (ent || 3) * 4
    // Campo vacío es "todavía no le asignan cuota", no "cuota cero". Guardar 0
    // los sacaba de la lista de pendientes por asignar y los dejaba cobrando
    // nada sin que nadie lo hubiera decidido.
    const datos = {
      tipo_plan: planFormState.tipo_plan,
      entrenamientos_por_semana: ent,
      mensualidad: montoIngresado(planFormState.mensualidad),
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

  async function abrirBloques() {
    setDatosError('')
    setEditDias(true)
    const [{ data: bloques }, { data: mios }] = await Promise.all([
      supabase.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,cupo_libres,activo')
        .eq('club_id', jugador.club_id).eq('activo', true).order('hora_inicio'),
      supabase.from('bloque_jugadores').select('bloque_id').eq('jugador_id', jugadorId).is('vigente_hasta', null),
    ])
    setBloquesClub((bloques ?? []) as BloqueHorario[])
    setBloquesSel(new Set((mios ?? []).map(b => b.bloque_id)))
  }

  async function guardarDias() {
    setGuardandoDatos(true)
    setDatosError('')

    const res = await asignarBloquesJugador({ jugadorId, bloqueIds: [...bloquesSel] })
    setGuardandoDatos(false)
    if (res?.error) { setDatosError(res.error); return }

    setJugador({ ...jugador, ...res.campos })
    setEditDias(false)

    // El cupo no bloquea, pero tiene que decirse: sin este aviso los grupos se
    // pasaban de su tope en silencio y recién se notaba contando a mano.
    if (res.sobreCupo?.length) {
      setAvisoCupo(res.sobreCupo.map(s => `${s.nombre} quedó con ${s.inscritos} inscritos y su cupo es ${s.cupo}`).join('. '))
    } else {
      setAvisoCupo('')
    }
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

    const { data: ext } = await supabase.from('torneos_externos').select('id,jugador_id,nombre,resultado,rival,fecha,categoria,lugar,descripcion').eq('jugador_id', jugadorId).order('fecha', { ascending: false })
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
    // La acción devuelve la contraseña generada y hasta ahora se descartaba: el
    // admin quedaba con un aviso que no le servía para nada.
    setAccesoCreado({ usuario: res.usuario ?? '', password: res.password ?? '' })
    setTieneCuenta(true)
    // La ficha se queda con el email viejo si la cuenta se lo acaba de generar.
    if (res.usuario?.includes('@')) setJugador((prev: any) => ({ ...prev, email: res.usuario }))
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
        <button onClick={() => { setErrorCarga(''); setLoading(true); }} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, cursor:'pointer' }}>Reintentar</button>
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
        setJugador((prev: any) => ({ ...prev, foto_path: res.path, foto_url: null }))
        if (res.url) setFotoUrl(res.url)
        setModalFoto(false)
        setFotoSrc(null)
        setSubiendoFoto(false)
      }
      reader.readAsDataURL(blob)
    }, 'image/jpeg', 0.92)
  }
  const edad = jugador.fecha_nacimiento ? new Date().getFullYear() - parseInt(jugador.fecha_nacimiento.slice(0, 4)) : null

  async function generarReportePDF() {
    setGenerandoReporte(true)
    try {
      // Anclado a Chile: `new Date().toISOString()` da la fecha de Londres, así
      // que un PDF generado después de las 20:00 de acá arrancaba el rango un
      // día más adelante. Son los mismos 90 días que dibuja el calendario de
      // abajo, contando hoy.
      const desde = sumarDias(fechaChile(), -89)

      // Asistencia, mensualidades y ranking en paralelo
      const [{ data: asist }, { data: mens3 }, { data: club }] = await Promise.all([
        supabase.from('asistencia').select('fecha').eq('jugador_id', jugadorId).eq('estado', 'presente').gte('fecha', desde).order('fecha'),
        supabase.from('mensualidades').select('mes,anio,estado,monto,fecha_pago').eq('jugador_id', jugadorId).order('anio', { ascending: false }).order('mes', { ascending: false }).limit(3),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('clubes').select('ranking_reiniciado_en').eq('id', jugador.club_id).single(),
      ])

      // Los torneos que cuentan para el ranking, con los mismos criterios que
      // usa la pantalla de Ranking. Si acá difieren, la ficha y el Ranking
      // muestran dos números distintos para lo mismo:
      //  · solo terminados — los puntos salen del puesto final, y un torneo en
      //    curso todavía no tiene puestos.
      //  · `ranking_reiniciado_en` — sin esto, "Reiniciar Ranking" limpiaba el
      //    Ranking y dejaba la ficha arrastrando los torneos viejos.
      const reinicioTs = (club as { ranking_reiniciado_en?: string } | null)?.ranking_reiniciado_en ?? null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let queryTorneos = (supabase as any).from('torneos')
        .select('id,categoria').eq('club_id', jugador.club_id).eq('tipo', 'interno')
        .in('estado', ['finalizado', 'archivado'])
      if (reinicioTs) queryTorneos = queryTorneos.gt('creado_en', reinicioTs)
      const { data: torneosClub } = await queryTorneos

      // Las sesiones del mes salen del calendario de sus bloques, no de las
      // columnas de `jugadores`: esas arrastran el total del mes anterior.
      const hoyISO = fechaChile()
      const [anioMes, mesNum] = hoyISO.split('-').map(Number)
      const historialMes = await cargarHistorialJugador(
        jugador.club_id,
        jugadorId,
        `${hoyISO.slice(0, 7)}-01`,
        `${hoyISO.slice(0, 7)}-${new Date(anioMes, mesNum, 0).getDate()}`,
      )
      const sesiones = sesionesDelMes(jugadorId, { ...historialMes, hoy: hoyISO }, hoyISO)

      // El ranking del jugador en CADA categoría donde jugó.
      //
      // Antes se miraba solo la categoría de su ficha, así que los puntos que
      // ganaba en un torneo de otra categoría no aparecían por ningún lado —y
      // la pantalla de Ranking sí los mostraba, porque agrupa por la categoría
      // del torneo. Un jugador puede competir donde el club lo inscriba.
      //
      // Los puntos salen de `calcularRankingInterno`, el mismo motor que la
      // pantalla de Ranking: acá había una segunda fórmula (3·v − d) que daba
      // otro número para lo mismo.
      const rankingsPorCategoria: {
        categoria: string; rank: number; total: number
        victorias: number; derrotas: number; jugados: number; pts: number
      }[] = []

      // El ranking que el club traía en papel (migración 188). Va agrupado solo
      // por categoría, igual que el resto de esta pantalla: la ficha no separa
      // por género, así que sumarlo por categoría es lo consistente acá.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: saldos } = await (supabase as any)
        .from('ranking_saldo_inicial')
        .select('jugador_id,categoria,puntos,creado_en')
        .eq('club_id', jugador.club_id)

      const saldoPorCategoria = new Map<string, Map<string, number>>()
      for (const s of ((saldos ?? []) as { jugador_id: string; categoria: string; puntos: number; creado_en: string }[])) {
        if (reinicioTs && s.creado_en <= reinicioTs) continue
        const porJugador = saldoPorCategoria.get(s.categoria) ?? new Map<string, number>()
        porJugador.set(s.jugador_id, (porJugador.get(s.jugador_id) ?? 0) + s.puntos)
        saldoPorCategoria.set(s.categoria, porJugador)
      }

      const torneoIds = (torneosClub || []).map((t: any) => t.id)
      if (torneoIds.length > 0 || saldoPorCategoria.size > 0) {
        const { data: todosPartidos } = torneoIds.length
          ? await supabase
              .from('torneo_partidos')
              .select('torneo_id,jugador_a,jugador_b,ganador,fase')
              .in('torneo_id', torneoIds)
              .not('jugador_b', 'is', null)
              .not('ganador', 'is', null)
          : { data: [] }

        const categoriaDelTorneo = new Map<string, string>(
          (torneosClub || []).map((t: any) => [t.id as string, (t.categoria as string) || 'Sin categoría']),
        )

        // Por categoría, y adentro por torneo: el puesto —y con él los puntos—
        // solo existe dentro de un torneo.
        const porCategoria: Record<string, Map<string, TorneoConPartidos>> = {}
        // Una categoría con saldo pero sin torneos jugados todavía también es
        // una categoría del ranking del jugador.
        for (const categoria of saldoPorCategoria.keys()) porCategoria[categoria] ??= new Map()
        for (const p of (todosPartidos || [])) {
          const torneoId = p.torneo_id as string
          const cat = categoriaDelTorneo.get(torneoId) ?? 'Sin categoría'
          const porTorneo = (porCategoria[cat] ??= new Map())
          const acc = porTorneo.get(torneoId) ?? { torneoId, partidos: [] }
          acc.partidos.push({
            jugador_a: p.jugador_a as string, jugador_b: p.jugador_b as string,
            ganador: p.ganador as string, fase: p.fase as string | null,
          })
          porTorneo.set(torneoId, acc)
        }

        for (const [categoria, porTorneo] of Object.entries(porCategoria)) {
          const tabla = calcularRankingInterno(
            [...porTorneo.values()], () => '', saldoPorCategoria.get(categoria),
          )
          const suya = tabla.find(f => f.jugadorId === jugadorId)
          if (!suya) continue
          rankingsPorCategoria.push({
            categoria, rank: suya.rank, total: tabla.length,
            victorias: suya.victorias, derrotas: suya.derrotas, jugados: suya.jugados, pts: suya.pts,
          })
        }
        rankingsPorCategoria.sort((a, b) => a.rank - b.rank || a.categoria.localeCompare(b.categoria, 'es'))
      }

      // La tarjeta de arriba tiene lugar para un número solo, así que va el
      // mejor puesto. El detalle por categoría va en su tabla, más abajo.
      const mejorRanking = rankingsPorCategoria[0] ?? null

      const fechasAsistencia = new Set((asist || []).map((a: any) => a.fecha))

      // Calendario de asistencias (últimos 90 días).
      //
      // Cada casilla se etiqueta con la fecha de Chile. Con `toISOString()` el
      // PDF generado de noche corría el calendario entero un día, y como las
      // fechas de `asistencia` sí vienen en hora de Chile, los puntitos caían
      // en el casillero equivocado.
      const dias: { fecha: string; asistio: boolean }[] = []
      const hoyCal = fechaChile()
      for (let i = 89; i >= 0; i--) {
        const iso = sumarDias(hoyCal, -i)
        dias.push({ fecha: iso, asistio: fechasAsistencia.has(iso) })
      }
      const totalAsist = fechasAsistencia.size
      const semanas: typeof dias[] = []
      for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7))

      const fmtFecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
      const mesLabel = (m: number) => ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m - 1]
      const estadoMens = (e: string) => e === 'pagado' ? '✓ Pagado' : e === 'atrasado' ? '✗ Atrasado' : '⏳ Pendiente'
      const colorMens = (e: string) => e === 'pagado' ? '#16a34a' : e === 'atrasado' ? '#dc2626' : '#d97706'

      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const { COLOR, encabezado, piePagina, filaTarjetas, tituloSeccion } = await import('@/lib/pdf/estilo')

      const doc = new jsPDF()
      const W = doc.internal.pageSize.getWidth()
      const halfW = (W - 32) / 2

      const badges = [jugador.categoria, jugador.estado === 'activo' ? 'Activo' : 'Inactivo', jugador.es_externo ? 'Externo' : ''].filter(Boolean).join(' · ')
      let y = encabezado(doc, {
        club: jugador.nombre,
        titulo: `${badges}  ·  Período: últimos 3 meses`,
        subtitulo: `${clubNombre || 'Club'}  ·  ${new Date().toLocaleDateString('es-CL')}`,
      })
      y += 4

      y = filaTarjetas(doc, y, [
        { valor: String(totalAsist), etiqueta: 'Asistencias (90 días)', color: COLOR.primario },
        { valor: mejorRanking ? `#${mejorRanking.rank} / ${mejorRanking.total}` : '—',
          etiqueta: mejorRanking ? `Mejor ranking · ${categoriaLabel(mejorRanking.categoria)}` : 'Ranking',
          color: COLOR.verde },
        { valor: jugador.mensualidad ? `$${jugador.mensualidad.toLocaleString('es-CL')}` : 'Por asignar', etiqueta: 'Mensualidad', color: COLOR.celeste },
      ])

      // Info personal
      const infoRows: [string, string][] = []
      if (jugador.rut) infoRows.push(['RUT', jugador.rut])
      if (jugador.fecha_nacimiento) infoRows.push(['Nacimiento', fmtFecha(jugador.fecha_nacimiento) + (edad ? ` (${edad} años)` : '')])
      if (jugador.email) infoRows.push(['Email', jugador.email])
      if (jugador.telefono) infoRows.push(['Telefono', jugador.telefono])
      if (jugador.contacto_emergencia_nombre) infoRows.push(['Emergencia', jugador.contacto_emergencia_nombre])
      if (jugador.indicaciones_medicas) infoRows.push(['Ind. medicas', jugador.indicaciones_medicas])
      if (!infoRows.length) infoRows.push(['—', '—'])

      // Plan
      const planRows: [string, string][] = []
      planRows.push(['Plan', jugador.tipo_plan || 'Mensual'])
      if (jugador.entrenamientos_por_semana) planRows.push(['Ent./semana', String(jugador.entrenamientos_por_semana)])
      if (jugador.tipo_plan !== 'libre' && sesiones && sesiones.limite > 0) {
        planRows.push(['Sesiones', `${sesiones.usadas} / ${sesiones.limite}`])
      }
      if (jugador.horario) planRows.push(['Horario', jugador.horario])
      if (jugador.grupo) planRows.push(['Grupo', grupoLabel(jugador.grupo)])
      if (jugador.sede) planRows.push(['Sede', sedeLabel(jugador.sede)])
      const diasEntrena = [jugador.entrena_lun ? 'Lu' : '', jugador.entrena_mar ? 'Ma' : '', jugador.entrena_mie ? 'Mi' : '', jugador.entrena_jue ? 'Ju' : '', jugador.entrena_vie ? 'Vi' : ''].filter(Boolean).join(' · ')
      if (diasEntrena) planRows.push(['Dias', diasEntrena])

      const startY2cols = y
      autoTable(doc, {
        startY: startY2cols, head: [['Información personal', '']], body: infoRows,
        theme: 'striped', headStyles: { fillColor: COLOR.primario, textColor: COLOR.blanco, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold', textColor: COLOR.mutado as any } },
        styles: { fontSize: 9, lineColor: COLOR.borde, lineWidth: 0.1 }, alternateRowStyles: { fillColor: COLOR.fondoSuave },
        tableWidth: halfW, margin: { left: 14 },
      })
      const yAfterInfo = (doc as any).lastAutoTable.finalY

      autoTable(doc, {
        startY: startY2cols, head: [['Plan & membresía', '']], body: planRows,
        theme: 'striped', headStyles: { fillColor: COLOR.celeste, textColor: COLOR.blanco, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold', textColor: COLOR.mutado as any } },
        styles: { fontSize: 9, lineColor: COLOR.borde, lineWidth: 0.1 }, alternateRowStyles: { fillColor: COLOR.fondoSuave },
        tableWidth: halfW, margin: { left: 14 + halfW + 4 },
      })
      const yAfterPlan = (doc as any).lastAutoTable.finalY

      y = Math.max(yAfterInfo, yAfterPlan) + 10

      // Mensualidades
      if ((mens3 || []).length > 0) {
        y = tituloSeccion(doc, y, 'Mensualidades recientes')
        autoTable(doc, {
          startY: y, head: [['Período', 'Monto', 'Estado', 'Fecha pago']],
          body: (mens3 || []).map((m: any) => [`${mesLabel(m.mes)} ${m.anio}`, m.monto ? `$${m.monto.toLocaleString('es-CL')}` : '—', estadoMens(m.estado), m.fecha_pago ? fmtFecha(m.fecha_pago) : '—']),
          theme: 'striped', headStyles: { fillColor: COLOR.verde, textColor: COLOR.blanco, fontStyle: 'bold' },
          styles: { fontSize: 9, lineColor: COLOR.borde, lineWidth: 0.1 }, alternateRowStyles: { fillColor: COLOR.fondoSuave }, margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 2) {
              const e = (mens3 || [])[data.row.index]?.estado
              data.cell.styles.textColor = e === 'pagado' ? COLOR.verde : e === 'atrasado' ? COLOR.rojo : COLOR.ambar
              data.cell.styles.fontStyle = 'bold'
            }
          },
        })
        y = (doc as any).lastAutoTable.finalY + 10
      }

      // Ranking: una fila por cada categoría en la que compitió.
      if (rankingsPorCategoria.length > 0) {
        y = tituloSeccion(doc, y, 'Ranking interno')
        autoTable(doc, {
          startY: y, head: [['Categoría', 'Posición', 'Victorias', 'Derrotas', 'Jugados', 'Puntos']],
          body: rankingsPorCategoria.map(r => [
            categoriaLabel(r.categoria), `#${r.rank} de ${r.total}`,
            `${r.victorias}`, `${r.derrotas}`, `${r.jugados}`, `${r.pts}`,
          ]),
          theme: 'striped', headStyles: { fillColor: COLOR.morado, textColor: COLOR.blanco, fontStyle: 'bold' },
          styles: { fontSize: 9, halign: 'center', lineColor: COLOR.borde, lineWidth: 0.1 }, margin: { left: 14, right: 14 },
        })
        y = (doc as any).lastAutoTable.finalY + 10
      }

      // Asistencia: cuadrícula de puntos (13 semanas × 7 días)
      y = tituloSeccion(doc, y, `Asistencia — últimos 90 días (${totalAsist} sesiones)`)
      const dotSize = 3.2, dotGap = 1.2, calX = 14
      semanas.forEach((semana, si) => {
        semana.forEach((d, di) => {
          const px = calX + si * (dotSize + dotGap)
          const py = y + di * (dotSize + dotGap)
          if (d.asistio) doc.setFillColor(...COLOR.verde)
          else doc.setFillColor(...COLOR.borde)
          doc.rect(px, py, dotSize, dotSize, 'F')
        })
      })
      y += 7 * (dotSize + dotGap) + 4
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLOR.mutado)
      doc.setFillColor(...COLOR.verde); doc.rect(calX, y, 3, 3, 'F')
      doc.text('Asistió', calX + 5, y + 2.5)
      doc.setFillColor(...COLOR.borde); doc.rect(calX + 24, y, 3, 3, 'F')
      doc.text('No asistió', calX + 29, y + 2.5)

      piePagina(doc, `${clubNombre || 'Club'} · Ficha de jugador · ${jugador.nombre}`)
      doc.save(`reporte_${jugador.nombre.replace(/ /g, '_')}_${fechaChile()}.pdf`)
    } finally {
      setGenerandoReporte(false)
    }
  }

  return (
    <AppLayout perfil={perfil}>
      <button onClick={() => router.back()} style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 14px', color: muted, fontSize:13, cursor:'pointer', marginBottom:16 }}>
        ← Volver
      </button>

      {/* El grupo quedó sobre su tope. No impide guardar —el club a veces pasa
          del cupo a propósito— pero antes no lo decía nadie y se descubría
          contando a mano. */}
      {avisoCupo && (
        <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'flex-start', gap:10 }}>
          <span style={{ fontSize:15 }}>⚠️</span>
          <div style={{ flex:1, fontSize:13, color:'#c2410c' }}>
            <strong>Sobre el cupo</strong>
            <div style={{ fontSize:12, marginTop:2, color: muted }}>{avisoCupo}.</div>
          </div>
          <button onClick={() => setAvisoCupo('')} style={{ background:'none', border:'none', color: muted, fontSize:14, cursor:'pointer', padding:0, lineHeight:1 }}>✕</button>
        </div>
      )}

      {/* ── Header compacto ── */}
      <div style={{ background:'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
        <div className="header-jugador" style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div
            onClick={() => esAdmin && setModalFoto(true)}
            title={esAdmin ? 'Cambiar foto' : undefined}
            style={{ width:60, height:60, borderRadius:'50%', background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:'white', flexShrink:0, overflow:'hidden', cursor: esAdmin ? 'pointer' : 'default', position:'relative' }}
          >
            {fotoUrl
              ? <img src={fotoUrl} alt="foto" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
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
          {(esAdmin || esProfesor) && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
              <button
                onClick={generarReportePDF}
                disabled={generandoReporte}
                style={{ background:'rgba(255,255,255,0.95)', color:'#4f46e5', border:'1px solid rgba(255,255,255,0.5)', borderRadius:8, padding:'6px 14px', fontSize:12, cursor:'pointer', fontWeight:700 }}
              >
                {generandoReporte ? 'Generando…' : '📄 Reporte PDF'}
              </button>
              {esAdmin && jugador.es_externo && (
                <button onClick={async () => {
                  if (!confirm('¿Agregar este jugador al club?')) return
                  const { error } = await supabase.from('jugadores').update({ es_externo: false, sesiones_limite: 12, estado: 'activo' }).eq('id', jugadorId)
                  if (error) { setDatosError(`No se pudo agregar al club: ${error.message}`); return }
                  setJugador({ ...jugador, es_externo: false })
                }} style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'6px 14px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                  Agregar al club
                </button>
              )}
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
              {esAdmin && (
                <button onClick={async () => {
                  const nuevoEstado = jugador.estado === 'activo' ? 'bloqueado' : 'activo'
                  const { error } = await supabase.from('jugadores').update({ estado: nuevoEstado }).eq('id', jugadorId)
                  if (error) { setDatosError(`No se pudo cambiar el estado: ${error.message}`); return }
                  setJugador({ ...jugador, estado: nuevoEstado })
                }} style={{ background: jugador.estado === 'activo' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'6px 14px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                  {jugador.estado === 'activo' ? 'Bloquear' : 'Activar'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Decía "Invitación enviada a {jugador.email}" y era falso dos veces:
            no se manda ningún correo —`crearAccesoJugador` crea la cuenta con
            una clave generada— y el jugador puede no tener email, con lo que el
            aviso quedaba en "Invitación enviada a ." y el admin sin saber qué
            había pasado ni qué entregarle. Ahora muestra lo único que sirve:
            el usuario y la contraseña. */}
        {esAdmin && (accesoError || accesoCreado) && (
          <div style={{ marginTop:12, background: accesoError ? 'rgba(220,38,38,0.25)' : 'rgba(34,197,94,0.25)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:10, padding:'12px 14px', fontSize:12, color:'#fff' }}>
            {accesoError ? accesoError : (
              <>
                <div style={{ fontWeight:700, marginBottom:6 }}>Cuenta creada. Estas son sus credenciales:</div>
                <div style={{ fontFamily:'monospace', fontSize:13, lineHeight:1.7 }}>
                  Usuario: <strong>{accesoCreado!.usuario}</strong><br />
                  Contraseña: <strong>{accesoCreado!.password}</strong>
                </div>
                <div style={{ marginTop:6, opacity:0.85 }}>
                  Quedan guardadas en Credenciales, así que no hace falta anotarlas ahora.
                </div>
              </>
            )}
          </div>
        )}
        {esAdmin && showPasswordReset && (
          <div style={{ marginTop:12, background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginBottom:8, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Cambiar contraseña</div>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ flex:1 }}>
                <CampoContrasena placeholder="Nueva contraseña (mín. 6 caracteres)" value={passwordNueva}
                  onChange={setPasswordNueva} autoComplete="new-password"
                  style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'8px 12px', color:'#fff', fontSize:12, outline:'none' }} />
              </div>
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

      {/* Envío de credenciales por WhatsApp. Solo para admins: el mensaje
          contiene la clave y no es cosa del profesor. Si el jugador no tiene
          celular chileno, el botón se deshabilita con la razón. */}
      {esAdmin && credencial && (() => {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
        const nombre = jugador?.nombre ?? ''
        const mensaje = `Hola ${nombre}! Estas son tus credenciales para entrar a CmSports:\n\nUsuario: ${credencial.login}\nContraseña: ${credencial.password}\n\nIngresá en: ${appUrl}/login\n\nTe recomendamos cambiar la contraseña después del primer ingreso.`
        const wa = linkWhatsApp(jugador?.telefono, mensaje)
        return (
          <div style={{ ...cardStyle, padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MessageCircle size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Enviar credenciales por WhatsApp</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                Le llega nombre de usuario, contraseña y el link para entrar.
              </div>
            </div>
            {wa ? (
              <WhatsAppBtn href={wa}>Enviar por WhatsApp</WhatsAppBtn>
            ) : (
              <span style={{ fontSize: 11, color: '#c2410c' }}>Sin celular válido para enviar</span>
            )}
          </div>
        )
      })()}

      {/* ── Stats ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:12, marginBottom:20 }}>
        {esAdmin && (
          <div style={{ ...cardStyle, padding:'16px 20px', textAlign:'center' }}>
            <div style={{ fontSize: jugador.mensualidad ? 20 : 12, fontWeight:800, color: jugador.mensualidad ? '#4f46e5' : '#c2410c', fontVariantNumeric:'tabular-nums' }}>
              {jugador.mensualidad ? fmtMonto(jugador.mensualidad) : SIN_CUOTA}
            </div>
            <div style={{ fontSize:11, color: muted, marginTop:4 }}>Mensualidad</div>
          </div>
        )}
        {(() => {
          const diasCortos = [
            jugador.entrena_lun && 'Lu',
            jugador.entrena_mar && 'Ma',
            jugador.entrena_mie && 'Mi',
            jugador.entrena_jue && 'Ju',
            jugador.entrena_vie && 'Vi',
          ].filter(Boolean)
          const diasLabel = diasCortos.length > 0 ? diasCortos.join(' · ') : '—'
          return (
            <div style={{ ...cardStyle, padding:'16px 20px', textAlign:'center' }}>
              <div style={{ fontSize: diasCortos.length > 0 ? 15 : 28, fontWeight:800, color: diasCortos.length > 0 ? '#4f46e5' : hint, lineHeight:1.6 }}>{diasLabel}</div>
              <div style={{ fontSize:11, color: muted, marginTop:4 }}>Días entrena</div>
            </div>
          )
        })()}
        {edad && (
          <div style={{ ...cardStyle, padding:'16px 20px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#4f46e5', fontFamily:'monospace' }}>{edad}</div>
            <div style={{ fontSize:11, color: muted, marginTop:2 }}>Años</div>
          </div>
        )}
      </div>

      {/* ── Tarjetas de información ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:16, marginBottom:24 }}>

        {/* Contacto rápido. RUT, dirección, tallas y el resto viven en Editar. */}
        <div style={cardStyle}>
          <CardHeader title="Contacto" onEdit={puedeEditar ? abrirEditContacto : undefined} />
          <div style={{ padding:'4px 20px 16px' }}>
            <InfoRow label="Teléfono" value={jugador.telefono} tel />
            <InfoRow label="Email" value={jugador.email} />
            {!jugador.telefono && !jugador.email && (
              <div style={{ padding:'12px 0', fontSize:12, color: hint }}>
                {puedeEditar ? 'Sin teléfono ni email — Editar' : 'Sin teléfono ni email'}
              </div>
            )}
            {(() => {
              const waApoderado = linkWhatsApp(jugador.contacto_emergencia_telefono)
              const waJugador   = linkWhatsApp(jugador.telefono)
              const esMenor     = edad !== null && edad < 18
              if (!waApoderado && !waJugador) return null
              return (
                <div style={{ paddingTop:12, display:'flex', flexDirection:'column', gap:6 }}>
                  {esMenor && waApoderado ? (
                    <>
                      <WhatsAppBtn href={waApoderado} variant="compact" style={{ fontSize:12 }}>
                        WhatsApp apoderado
                      </WhatsAppBtn>
                      {waJugador && (
                        <WhatsAppBtn href={waJugador} variant="compact" style={{ fontSize:12 }}>
                          WhatsApp jugador
                        </WhatsAppBtn>
                      )}
                    </>
                  ) : waJugador ? (
                    <WhatsAppBtn href={waJugador} variant="compact" style={{ fontSize:12 }}>
                      WhatsApp
                    </WhatsAppBtn>
                  ) : null}
                </div>
              )
            })()}
            {jugador.indicaciones_medicas && (
              <div style={{ marginTop:12, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:11, color:'#dc2626', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>Indicaciones médicas</div>
                <div style={{ fontSize:13, color:'#991b1b', lineHeight:1.5 }}>{jugador.indicaciones_medicas}</div>
              </div>
            )}
          </div>
        </div>

        {/* Asistencia del año */}
        {jugador.club_id && (
          <div style={cardStyle}>
            <CardHeader title="Asistencia" />
            <ResumenAsistenciaJugador clubId={jugador.club_id} jugadorId={jugadorId} />
          </div>
        )}

        {/* Su posición en el ranking. Hasta ahora el ranking del jugador solo
            se calculaba dentro del PDF del informe: en pantalla no se veía en
            ninguna parte, ni para él ni para su entrenador. */}
        {jugador.club_id && (
          <div style={{ marginBottom: 16 }}>
            <RankingJugador clubId={jugador.club_id} jugadorId={jugadorId} />
          </div>
        )}

        {/* Días de entrenamiento */}
        <div style={cardStyle}>
          <CardHeader title="Días de entrenamiento" onEdit={(esAdmin || esProfesor) ? () => {
            void abrirBloques()
          } : undefined} />
          <div style={{ padding:'4px 20px 16px' }}>
            {jugador.horario && (
              <div style={{ padding:'10px 0', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color: muted }}>Bloque</span>
                <span style={{ fontSize:13, fontWeight:600, color: text }}>{jugador.horario}</span>
              </div>
            )}
            {([
              { key:'entrena_lun', label:'Lunes' },
              { key:'entrena_mar', label:'Martes' },
              { key:'entrena_mie', label:'Miércoles' },
              { key:'entrena_jue', label:'Jueves' },
              { key:'entrena_vie', label:'Viernes' },
            ] as const).map(({ key, label }) => (
              <div key={key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid #f1f5f9' }}>
                <span style={{ fontSize:13, color: text }}>{label}</span>
                <span style={{ fontSize:12, fontWeight:600, color: jugador[key] === true ? '#16a34a' : '#94a3b8' }}>
                  {jugador[key] === true ? 'Entrena' : 'No entrena'}
                </span>
              </div>
            ))}
            {!jugador.horario && ![jugador.entrena_lun, jugador.entrena_mar, jugador.entrena_mie, jugador.entrena_jue, jugador.entrena_vie].some(Boolean) && (
              <div style={{ padding:'16px 0', fontSize:12, color: hint }}>Sin horario asignado — hacé clic en Editar</div>
            )}
          </div>
        </div>

        {/* Plan */}
        <div style={cardStyle}>
          <CardHeader title="Plan & Membresía" onEdit={puedeEditar ? abrirEditPlan : undefined} />
          <div style={{ padding:'16px 20px' }}>
            <div style={{ fontSize: jugador.mensualidad ? 24 : 15, fontWeight:800, color: jugador.mensualidad ? text : '#c2410c', marginBottom:4 }}>
              {jugador.mensualidad
                ? <>{fmtMonto(jugador.mensualidad)}<span style={{ fontSize:13, fontWeight:400, color: muted }}>/mes</span></>
                : SIN_CUOTA}
            </div>
            <div style={{ fontSize:13, color: muted }}>
              {jugador.tipo_plan ? jugador.tipo_plan.charAt(0).toUpperCase() + jugador.tipo_plan.slice(1) : 'Mensual'}
              {jugador.tipo_plan === 'libre' ? ' — Libre acceso' : jugador.entrenamientos_por_semana ? ` — ${jugador.entrenamientos_por_semana} entrenamientos/semana` : ''}
            </div>

            {/* Matrícula. Va en esta tarjeta y no en una propia porque es parte
                de lo que el jugador paga por pertenecer, igual que la cuota. */}
            <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid #e2e8f0',
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color: jugador.matricula_pagada ? '#15803d' : '#c2410c' }}>
                  {jugador.matricula_pagada ? '🎓 Matrícula pagada' : '⚠️ Matrícula pendiente'}
                </div>
                <div style={{ fontSize:11, color: hint, marginTop:1 }}>
                  {jugador.matricula_pagada
                    ? jugador.matricula_monto == null
                      ? 'Sin monto registrado'
                      : jugador.matricula_monto === 0
                        ? `Sin cobro${jugador.matricula_fecha ? ` · ${jugador.matricula_fecha}` : ''}`
                        : `${fmtMonto(jugador.matricula_monto)}${jugador.matricula_fecha ? ` · ${jugador.matricula_fecha}` : ''}`
                    : 'Todavía no la pagó'}
                </div>
              </div>
              {puedeEditar && (
                <button
                  onClick={() => jugador.matricula_pagada ? desmarcarMatriculaJugador() : setModalMatricula(true)}
                  disabled={guardandoMatricula}
                  style={{ padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:600,
                    cursor: guardandoMatricula ? 'default' : 'pointer',
                    border: `1px solid ${jugador.matricula_pagada ? '#bbf7d0' : '#fed7aa'}`,
                    background: jugador.matricula_pagada ? '#f0fdf4' : '#fff7ed',
                    color: jugador.matricula_pagada ? '#15803d' : '#c2410c' }}>
                  {guardandoMatricula ? '...' : jugador.matricula_pagada ? 'Desmarcar' : 'Marcar pagada'}
                </button>
              )}
            </div>

            {/* Lo que debe por venir a grupos que no son el suyo. Va aparte de
                la cuota a propósito: no es una mensualidad más cara, son clases
                sueltas que se cobran por separado. */}
            {extrasImpagas.length > 0 && (
              <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid #e2e8f0',
                display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:10 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#a16207' }}>🟡 Costo clase extra</div>
                  <div style={{ fontSize:11, color: hint, marginTop:1 }}>
                    {/* Se nombra solo lo que hay. Antes contaba las de monto 0
                        como cobrables —"3 clases sin cobrar · $3.000" con dos
                        gratis—, y arreglarlo a secas dejaba el caso de Benjamín
                        diciendo "0 clases sin cobrar · 1 sin cargo". */}
                    {[
                      cuentaExtras.porCobrar.length > 0 && `${cuentaExtras.porCobrar.length} clase${cuentaExtras.porCobrar.length === 1 ? '' : 's'} sin cobrar`,
                      extrasSinMonto > 0 && `${extrasSinMonto} sin monto`,
                      cuentaExtras.sinCargo.length > 0 && `${cuentaExtras.sinCargo.length} sin cargo`,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ fontSize:18, fontWeight:800, color:'#a16207', fontVariantNumeric:'tabular-nums' }}>
                  {totalExtras > 0 ? fmtMonto(totalExtras) : '—'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Documentos firmados — los sube el staff o el propio jugador */}
        <div style={cardStyle}>
          <CardHeader title="Documentos" />
          <DocumentosJugador jugadorId={jugadorId} puedeEditar={puedeSubirDocumentos} />
        </div>

      </div>


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
                        setContactoForm(f => ({
                          ...f,
                          fecha_nacimiento: fecha,
                          ...(catAuto ? {
                            categoria: catAuto,
                            // Todo jugador compite además en TC (todo competidor).
                            categorias: new Set([...f.categorias, catAuto, 'TC']),
                          } : {}),
                        }))
                      }} />
                  </FormField>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
                  <FormField label="Grupo de entrenamiento">
                    <select style={inputStyle} value={contactoForm.grupo} onChange={e => setContactoForm(f => ({ ...f, grupo: e.target.value }))}>
                      <option value="">— Sin grupo —</option>
                      {GRUPOS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </FormField>
                  {/* La sede ya no se edita a mano: sale de los bloques a los
                      que está inscrito, y la base la recalcula sola (111). */}
                  <FormField label="Sede habitual">
                    <div style={{ ...inputStyle, background:'#f1f5f9', color:'#64748b' }}>
                      {jugador?.sede ? sedeLabel(jugador.sede) : 'Se define por sus grupos'}
                    </div>
                  </FormField>
                </div>

                {esClubBuin && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:12, color: muted, marginBottom:6 }}>
                      Categorías en las que compite
                      <span style={{ color: hint, fontWeight:400 }}> — la de su edad más TC (todo competidor)</span>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:10 }}>
                      {CATEGORIAS_BUIN.map(c => {
                        const activa = contactoForm.categorias.has(c) || contactoForm.categoria === c
                        const esPrincipal = contactoForm.categoria === c
                        return (
                          <button
                            key={c}
                            type="button"
                            title={esPrincipal ? 'Categoría principal (por edad) — no se puede quitar' : undefined}
                            onClick={() => {
                              if (esPrincipal) return
                              setContactoForm(f => {
                                const next = new Set(f.categorias)
                                if (next.has(c)) next.delete(c); else next.add(c)
                                return { ...f, categorias: next }
                              })
                            }}
                            style={{
                              background: activa ? '#ede9fe' : '#fff',
                              border: `1px solid ${activa ? '#c4b5fd' : '#e2e8f0'}`,
                              color: activa ? '#3730a3' : muted,
                              borderRadius: 20, padding: '4px 11px', fontSize: 11,
                              fontWeight: activa ? 700 : 500,
                              cursor: esPrincipal ? 'default' : 'pointer',
                              opacity: esPrincipal ? 0.85 : 1,
                            }}
                          >
                            {c}{esPrincipal ? ' ★' : ''}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

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

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <FormField label="Talla polera">
                    <select style={inputStyle} value={contactoForm.talla_polera} onChange={e => setContactoForm(f => ({ ...f, talla_polera: e.target.value }))}>
                      <option value="">No especificada</option>
                      {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Talla short">
                    <select style={inputStyle} value={contactoForm.talla_short} onChange={e => setContactoForm(f => ({ ...f, talla_short: e.target.value }))}>
                      <option value="">No especificada</option>
                      {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
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
              <button onClick={guardarContacto} disabled={guardandoDatos} style={{ flex:1, padding:12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
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
              <button onClick={guardarPlan} disabled={guardandoDatos} style={{ flex:1, padding:12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {guardandoDatos ? 'Guardando...' : 'Guardar plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Modal: Días de entrenamiento ══════ */}
      {editDias && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth:460 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:18, fontWeight:700, color: text }}>Días de entrenamiento</div>
              <button onClick={() => setEditDias(false)} style={{ background:'#f1f5f9', border:'none', borderRadius:8, width:32, height:32, fontSize:16, cursor:'pointer', color: muted }}>✕</button>
            </div>
            <div style={{ fontSize:12, color: muted, marginBottom:16 }}>
              Marcá los grupos a los que va. Los días, la sede y los cupos se actualizan solos.
            </div>

            <div style={{ maxHeight:'50vh', overflowY:'auto', margin:'0 -4px', padding:'0 4px' }}>
              {DIAS.map(d => {
                const delDia = bloquesClub.filter(b => b.dia_semana === d.value)
                if (delDia.length === 0) return null
                return (
                  <div key={d.value} style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 }}>
                      {diaLabel(d.value)}
                    </div>
                    {delDia.map(b => {
                      const marcado = bloquesSel.has(b.id)
                      return (
                        <div key={b.id}
                          onClick={() => setBloquesSel(prev => {
                            const s = new Set(prev)
                            if (s.has(b.id)) s.delete(b.id); else s.add(b.id)
                            return s
                          })}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:8, cursor:'pointer',
                            background: marcado ? '#eef2ff' : 'transparent',
                            border:`1px solid ${marcado ? '#c7d2fe' : '#f1f5f9'}`, marginBottom:4 }}>
                          <div style={{ width:18, height:18, borderRadius:4, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                            border:`2px solid ${marcado ? '#4f46e5' : '#cbd5e1'}`, background: marcado ? '#4f46e5' : 'transparent' }}>
                            {marcado && <span style={{ color:'white', fontSize:11, fontWeight:800 }}>✓</span>}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: text }}>{b.nombre}</div>
                            <div style={{ fontSize:11, color: muted }}>
                              {sedeLabel(b.sede)} · {rangoHorario(b.hora_inicio, b.hora_fin)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {bloquesClub.length === 0 && (
                <div style={{ padding:'20px 0', textAlign:'center', fontSize:13, color: muted }}>
                  Todavía no hay grupos en el horario semanal.
                </div>
              )}
            </div>

            {datosError && <div style={{ margin:'12px 0', color:'#dc2626', fontSize:12, background:'#fef2f2', padding:'8px 12px', borderRadius:8 }}>{datosError}</div>}
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={() => setEditDias(false)} style={{ flex:1, padding:12, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:13, cursor:'pointer', fontWeight:600 }}>Cancelar</button>
              <button onClick={guardarDias} disabled={guardandoDatos} style={{ flex:1, padding:12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {guardandoDatos ? 'Guardando...' : 'Guardar'}
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
              <button onClick={guardarExterno} disabled={guardandoExterno} style={{ flex:1, padding:12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
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

      {/* Cobro de la matrícula */}
      {modalMatricula && jugador && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:22, width:'100%', maxWidth:400 }}>
            <div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:4 }}>🎓 Cobrar matrícula</div>
            <div style={{ fontSize:12, color:muted, marginBottom:16 }}>
              {jugador.nombre}. Se registra como ingreso en Finanzas.
            </div>

            {errorMatricula && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'9px 12px',
                marginBottom:12, fontSize:12, color:'#dc2626', fontWeight:600 }}>
                {errorMatricula}
              </div>
            )}

            <label style={{ fontSize:11, color:muted, display:'block', marginBottom:4 }}>Monto de la matrícula</label>
            <input
              type="number" min={0} inputMode="numeric" autoFocus
              placeholder="Ej: 20000"
              value={montoMatricula}
              onChange={e => setMontoMatricula(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !guardandoMatricula) void guardarMatricula() }}
              style={{ width:'100%', boxSizing:'border-box', background:'#f4f7fa', border:'1px solid #e2e8f0',
                borderRadius:8, padding:'10px 12px', color:text, fontSize:14, outline:'none' }}
            />
            <div style={{ fontSize:11, color:hint, marginTop:6, marginBottom:16 }}>
              Poné <strong>0</strong> si le eximís la matrícula: queda marcada como pagada y no se genera ingreso.
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setModalMatricula(false); setMontoMatricula(''); setErrorMatricula(''); claveMatricula.current = null }}
                style={{ flex:1, padding:11, background:'#f4f7fa', color:muted, border:'none', borderRadius:8, fontSize:13, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarMatricula} disabled={guardandoMatricula}
                style={{ flex:2, padding:11, background:'#16a34a', color:'#fff', border:'none', borderRadius:8,
                  fontSize:13, fontWeight:600, cursor: guardandoMatricula ? 'default' : 'pointer',
                  opacity: guardandoMatricula ? 0.6 : 1 }}>
                {guardandoMatricula ? 'Guardando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
