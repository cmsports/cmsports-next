'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatRut } from '@/lib/rut'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { crearJugador, editarJugador, toggleEstadoJugador, eliminarJugador, actualizarMensualidad } from '@/app/actions/jugadores'
import { CATEGORIAS_BUIN, categoriaBuinPorFechaNacimiento } from '@/lib/domain/categoriaBuin'
import { fechaChile } from '@/lib/domain/fechaChile'
import { soloVigentes } from '@/lib/supabase/vigentes'
import { useTextoMonto } from '@/components/Monto'
import { SEDES, GRUPOS, sedeLabel, grupoLabel, entrenaEnSede } from '@/lib/domain/sedeGrupo'
import { firmarUrls } from '@/lib/supabase/privado'
import FiltroMultiSelect, { setToggle, setDesdeParam } from '@/components/FiltroMultiSelect'
import { DIAS, diaLabel, rangoHorario, type BloqueHorario } from '@/lib/domain/horario'
import { SIN_CUOTA, montoIngresado } from '@/lib/domain/mensualidades'
import { TALLAS_UNIFORME } from '@/lib/domain/tallas'
import { calcularEdad } from '@/lib/domain/jugadorExport'
import ModalExportarJugadores from '@/components/ModalExportarJugadores'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const badgeCategoria: Record<string, { bg: string; color: string }> = {
  principiante: { bg: '#fffbeb', color: '#d97706' },
  intermedio:   { bg: '#ede9fe', color: '#3730a3' },
  avanzado:     { bg: '#f0fdf4', color: '#16a34a' },
}

const categorias = ['principiante', 'intermedio', 'avanzado']
const jugadoresCache: Record<string, any[]> = {}


export default function JugadoresPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [jugadores, setJugadores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const [busqueda, setBusqueda] = useState(() => searchParams.get('q') || '')
  const [filtroCat, setFiltroCat] = useState<Set<string>>(() => setDesdeParam(searchParams, 'cat'))
  const [filtroEstado, setFiltroEstado] = useState<Set<string>>(() => setDesdeParam(searchParams, 'estado'))
  const [orden, setOrden] = useState<'az'|'za'>(() => (searchParams.get('orden') === 'za' ? 'za' : 'az'))
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const formVacio = {
    nombre:'', rut:'', email:'', telefono:'',
    categoria:'principiante',
    tipo_plan:'mensual',
    entrenamientos_por_semana:'3',
    mensualidad:'',
    fecha_nacimiento:'', direccion:'', contacto_emergencia_nombre:'', contacto_emergencia_telefono:'',
    indicaciones_medicas:'', federado:false, comuna:'',
    talla_polera:'', talla_short:'',
  }
  const [form, setForm] = useState(formVacio)
  const [clubNombre, setClubNombre] = useState('')
  const esClubBuin = /bu[ií]n/i.test(clubNombre)
  const [guardando, setGuardando] = useState(false)
  const [toast, setToast] = useState('')
  const [filtroSinHorario, setFiltroSinHorario] = useState(() => searchParams.get('sinhorario') === '1')
  const [filtroDia, setFiltroDia]               = useState<Set<string>>(() => setDesdeParam(searchParams, 'dia'))
  const [filtroFederado, setFiltroFederado]     = useState<Set<string>>(() => setDesdeParam(searchParams, 'federado'))
  const [filtroPago, setFiltroPago]             = useState<Set<string>>(() => setDesdeParam(searchParams, 'pago'))
  const [filtroHorario, setFiltroHorario]       = useState<Set<string>>(() => setDesdeParam(searchParams, 'horario'))
  const [filtroPresente, setFiltroPresente]     = useState<Set<string>>(() => setDesdeParam(searchParams, 'presente'))
  const [filtroSede, setFiltroSede]             = useState<Set<string>>(() => setDesdeParam(searchParams, 'sede'))
  const [filtroGrupo, setFiltroGrupo]           = useState<Set<string>>(() => setDesdeParam(searchParams, 'grupo'))
  const [edadMin, setEdadMin]                   = useState(() => searchParams.get('edadMin') || '')
  const [edadMax, setEdadMax]                   = useState(() => searchParams.get('edadMax') || '')
  const [asistenciaHoy, setAsistenciaHoy]       = useState<Set<string>>(new Set())
  const [fotosFirmadas, setFotosFirmadas]       = useState<Record<string, string>>({})
  const [estadoPago, setEstadoPago]             = useState<Record<string, string>>({})
  const [editandoMensualidadId, setEditandoMensualidadId] = useState<string | null>(null)
  const [mensualidadTemp, setMensualidadTemp] = useState('')
  // Grupos al crear: si entra sin bloque queda invisible para la asistencia.
  const [bloquesClub, setBloquesClub] = useState<BloqueHorario[]>([])
  const [bloquesSel, setBloquesSel]   = useState<Set<string>>(new Set())
  // Quiénes entregaron el formulario firmado. Sin esto habría que abrir las
  // 102 fichas de a una para saber a quién apurar.
  const [conDocumento, setConDocumento] = useState<Set<string>>(new Set())
  const [filtroDoc, setFiltroDoc]       = useState<Set<string>>(() => setDesdeParam(searchParams, 'doc'))
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    const id = perfil.club_id
    let activo = true

    async function cargarInicial() {
      if (!id) {
        if (activo) setLoading(false)
        return
      }
      const cached = jugadoresCache[id]
      if (cached && activo) {
        setJugadores(cached)
        setLoading(false)
      }
      supabase.from('clubes').select('nombre').eq('id', id).single()
        .then(({ data }) => { if (activo && data) setClubNombre(data.nombre) })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('jugadores')
        .select('id,nombre,rut,email,telefono,categoria,tipo_plan,entrenamientos_por_semana,mensualidad,sesiones_usadas,sesiones_limite,estado,fecha_nacimiento,direccion,contacto_emergencia_nombre,contacto_emergencia_telefono,indicaciones_medicas,federado,comuna,sede,grupo,foto_url,foto_path,horario,entrena_lun,entrena_mar,entrena_mie,entrena_jue,entrena_vie,talla_polera,talla_short')
        .eq('club_id', id)
        .or('es_externo.is.null,es_externo.eq.false')
        .order('nombre')
      if (!activo) return
      if (error) {
        setToast('Error al cargar jugadores')
        setTimeout(() => setToast(''), 3000)
      } else {
        jugadoresCache[id] = data || []
        setJugadores(data || [])
        const ids = (data || []).map((j: any) => j.id)
        if (ids.length > 0) {
          const mes = new Date().getMonth() + 1
          const anio = new Date().getFullYear()
          supabase.from('mensualidades').select('jugador_id,estado').in('jugador_id', ids).eq('mes', mes).eq('anio', anio)
            .then(({ data: mens }) => {
              if (!activo) return
              const map: Record<string, string> = {}
              for (const m of (mens || [])) map[m.jugador_id] = m.estado
              setEstadoPago(map)
            })
        }
      }
      setLoading(false)
    }

    void cargarInicial()
    return () => { activo = false }
  }, [authLoading, perfil, router])

  // Quiénes ya entregaron el formulario firmado. Es una consulta sola para
  // todo el club, no una por jugador.
  useEffect(() => {
    if (!clubId) return
    let activo = true
    void (async () => {
      const { data } = await supabase.from('jugador_documentos')
        .select('jugador_id').eq('tipo', 'derecho_formacion')
      if (activo) setConDocumento(new Set((data ?? []).map(d => d.jugador_id)))
    })()
    return () => { activo = false }
  }, [clubId])

  const cargarJugadores = useCallback(async (cid?: string) => {
    const id = cid || clubId
    if (!id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('jugadores')
      .select('id,nombre,rut,email,telefono,categoria,tipo_plan,entrenamientos_por_semana,mensualidad,sesiones_usadas,sesiones_limite,estado,fecha_nacimiento,direccion,contacto_emergencia_nombre,contacto_emergencia_telefono,indicaciones_medicas,federado,comuna,sede,grupo,foto_url,foto_path,horario,entrena_lun,entrena_mar,entrena_mie,entrena_jue,entrena_vie,talla_polera,talla_short')
      .eq('club_id', id)
      .or('es_externo.is.null,es_externo.eq.false')
      .order('nombre')
    if (error) { mostrarToast('Error al cargar jugadores'); return }
    if (id) jugadoresCache[id] = data || []
    setJugadores(data || [])
    const ids = (data || []).map((j: any) => j.id)
    if (ids.length > 0) {
      const mes = new Date().getMonth() + 1
      const anio = new Date().getFullYear()
      supabase.from('mensualidades').select('jugador_id,estado').in('jugador_id', ids).eq('mes', mes).eq('anio', anio)
        .then(({ data: mens }) => {
          const map: Record<string, string> = {}
          for (const m of (mens || [])) map[m.jugador_id] = m.estado
          setEstadoPago(map)
        })
    }
  }, [clubId])

  useEffect(() => {
    if (!clubId) return
    const canal = supabase
      .channel(`jugadores-listado-${clubId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'jugadores',
        filter: `club_id=eq.${clubId}`,
      }, () => {
        delete jugadoresCache[clubId]
        void cargarJugadores(clubId)
      })
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [cargarJugadores, clubId])

  // Las fotos viven en el bucket privado: se firman todas juntas, no una por una.
  useEffect(() => {
    if (jugadores.length === 0) return
    let activo = true
    void firmarUrls(jugadores.map(j => j.foto_path))
      .then(mapa => { if (activo) setFotosFirmadas(mapa) })
    return () => { activo = false }
  }, [jugadores])

  useEffect(() => {
    if (!clubId) return
    let activo = true
    supabase.from('asistencia').select('jugador_id').eq('club_id', clubId).eq('fecha', fechaChile()).eq('estado', 'presente')
      .then(({ data }) => { if (activo) setAsistenciaHoy(new Set((data || []).map((a: any) => a.jugador_id))) })
    return () => { activo = false }
  }, [clubId])

  useEffect(() => {
    const params = new URLSearchParams()
    if (busqueda) params.set('q', busqueda)
    if (filtroCat.size) params.set('cat', [...filtroCat].join(','))
    if (filtroEstado.size) params.set('estado', [...filtroEstado].join(','))
    if (filtroDia.size) params.set('dia', [...filtroDia].join(','))
    if (filtroFederado.size) params.set('federado', [...filtroFederado].join(','))
    if (filtroDoc.size) params.set('doc', [...filtroDoc].join(','))
    if (filtroPago.size) params.set('pago', [...filtroPago].join(','))
    if (filtroHorario.size) params.set('horario', [...filtroHorario].join(','))
    if (filtroPresente.size) params.set('presente', [...filtroPresente].join(','))
    if (filtroSede.size) params.set('sede', [...filtroSede].join(','))
    if (filtroGrupo.size) params.set('grupo', [...filtroGrupo].join(','))
    if (filtroSinHorario) params.set('sinhorario', '1')
    if (edadMin) params.set('edadMin', edadMin)
    if (edadMax) params.set('edadMax', edadMax)
    if (orden !== 'az') params.set('orden', orden)
    const qs = params.toString()
    router.replace(qs ? `/jugadores?${qs}` : '/jugadores', { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, filtroCat, filtroEstado, filtroDia, filtroFederado, filtroDoc, filtroPago, filtroHorario, filtroPresente, filtroSede, filtroGrupo, filtroSinHorario, edadMin, edadMax, orden])

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const cargarBloques = useCallback(async () => {
    if (!clubId) return
    // Con vigencia: inscribir a alguien en un grupo ya cerrado le deja días de
    // entrenamiento que no existen.
    const { data } = await soloVigentes(supabase.from('bloques_horario')
      .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,cupo_libres,activo')
      .eq('club_id', clubId).eq('activo', true), fechaChile()).order('hora_inicio')
    setBloquesClub((data ?? []) as BloqueHorario[])
  }, [clubId])

  function abrirNuevo() {
    setEditando(null)
    setForm({ ...formVacio, categoria: esClubBuin ? '' : 'principiante' })
    setBloquesSel(new Set())
    void cargarBloques()
    setModalOpen(true)
  }

  function abrirEditar(j: any) {
    setEditando(j)
    setForm({
      nombre:j.nombre||'', rut:j.rut||'', email:j.email||'', telefono:j.telefono||'',
      categoria:j.categoria||(esClubBuin ? '' : 'principiante'), tipo_plan:j.tipo_plan||'mensual',
      entrenamientos_por_semana:String(j.entrenamientos_por_semana||3),
      mensualidad: j.mensualidad != null ? String(j.mensualidad) : '',
      fecha_nacimiento:j.fecha_nacimiento||'', direccion:j.direccion||'',
      contacto_emergencia_nombre:j.contacto_emergencia_nombre||'', contacto_emergencia_telefono:j.contacto_emergencia_telefono||'',
      indicaciones_medicas:j.indicaciones_medicas||'', federado:!!j.federado, comuna:j.comuna||'',
      talla_polera:j.talla_polera||'', talla_short:j.talla_short||'',
    })
    setModalOpen(true)
  }

  async function guardar() {
    if (!form.nombre.trim()) { mostrarToast('El nombre es obligatorio'); return }
    if (!clubId) { mostrarToast('Error: no hay club activo'); return }
    if (!editando) {
      if (!form.email.trim()) { mostrarToast('El email es obligatorio'); return }
    }
    if (esClubBuin) {
      if (!form.fecha_nacimiento) { mostrarToast('La fecha de nacimiento es obligatoria en este club'); return }
      if (!form.direccion.trim()) { mostrarToast('La dirección es obligatoria en este club'); return }
    }
    setGuardando(true)

    const esLibre = form.tipo_plan === 'libre'
    const entSemana = esLibre ? null : (parseInt(form.entrenamientos_por_semana) || 3)
    // Sin cuota escrita el jugador queda sin cuota, no con $25.000. Se crea un
    // jugador antes de saber cuánto va a pagar, y ese monto de relleno se veía
    // igual de real que uno acordado con el apoderado.
    const mensualidad = montoIngresado(form.mensualidad)
    const sesionesLimite = esLibre ? 99 : (entSemana || 3) * 4

    const planFields = {
      categoria: form.categoria, tipo_plan: form.tipo_plan,
      entrenamientos_por_semana: entSemana, mensualidad,
      sesiones_limite: sesionesLimite,
      fecha_nacimiento: form.fecha_nacimiento || null,
      direccion: form.direccion.trim() || null,
      contacto_emergencia_nombre: form.contacto_emergencia_nombre.trim() || null,
      contacto_emergencia_telefono: form.contacto_emergencia_telefono.trim() || null,
      indicaciones_medicas: form.indicaciones_medicas.trim() || null,
      federado: form.federado,
      comuna: form.comuna.trim() || null,
      talla_polera: form.talla_polera || null,
      talla_short: form.talla_short || null,
    }

    if (editando) {
      const res = await editarJugador({ jugadorId: editando.id, nombre: form.nombre, rut: form.rut, email: form.email, telefono: form.telefono, ...planFields })
      if (res.error) { mostrarToast(res.error); setGuardando(false); return }
      mostrarToast('Jugador actualizado')
    } else {
      const res = await crearJugador({ nombre: form.nombre, rut: form.rut, email: form.email, telefono: form.telefono, ...planFields, bloqueIds: [...bloquesSel] })
      if (res.error) { mostrarToast(res.error); setGuardando(false); return }
      mostrarToast('Jugador creado. Le enviamos un correo para crear su contraseña')
    }

    setGuardando(false)
    setModalOpen(false)
    setForm(formVacio)
    await cargarJugadores()
  }

  async function toggleEstado(j: any) {
    const nuevoEstado = j.estado === 'activo' ? 'bloqueado' : 'activo'
    const resultado = await toggleEstadoJugador({ jugadorId: j.id, nuevoEstado })
    if (resultado.error) { mostrarToast(resultado.error); return }
    mostrarToast(`Jugador ${nuevoEstado === 'activo' ? 'activado' : 'bloqueado'}`)
    void cargarJugadores()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este jugador? Esta acción no se puede deshacer.')) return
    try {
      const resultado = await eliminarJugador({ jugadorId: id })
      if (resultado.error) { mostrarToast(resultado.error); return }
      mostrarToast('Jugador eliminado')
      void cargarJugadores()
    } catch (e) {
      console.error('eliminar() falló', e)
      mostrarToast('Error al eliminar jugador')
    }
  }

  async function guardarMensualidad(j: any) {
    const nuevo = parseInt(mensualidadTemp)
    setEditandoMensualidadId(null)
    if (isNaN(nuevo) || nuevo < 0 || nuevo === j.mensualidad) return
    const res = await actualizarMensualidad({ jugadorId: j.id, mensualidad: nuevo })
    if (res.error) { mostrarToast(res.error); return }
    setJugadores(prev => prev.map(p => p.id === j.id ? { ...p, mensualidad: nuevo } : p))
    if (clubId) jugadoresCache[clubId] = (jugadoresCache[clubId] || []).map((p: any) => p.id === j.id ? { ...p, mensualidad: nuevo } : p)
    mostrarToast('Mensualidad actualizada')
  }

  const [exportModalOpen, setExportModalOpen] = useState(false)

  const sinHorario = (j: any) => !j.entrena_lun && !j.entrena_mar && !j.entrena_mie && !j.entrena_jue && !j.entrena_vie
  const sinHorarioCount = jugadores.filter(sinHorario).length

  const filtrados = jugadores
    .filter(j => !busqueda || j.nombre?.toLowerCase().includes(busqueda.toLowerCase()) || j.rut?.includes(busqueda))
    // Un jugador puede competir en varias categorías (la suya por edad + TC).
    .filter(j => filtroCat.size === 0 || [...filtroCat].some(c => (j.categorias?.length ? j.categorias.includes(c) : j.categoria === c)))
    .filter(j => filtroSede.size === 0 || [...filtroSede].some(s => entrenaEnSede(j.sede, s)))
    .filter(j => filtroGrupo.size === 0 || filtroGrupo.has(j.grupo))
    .filter(j => filtroEstado.size === 0 || filtroEstado.has(j.estado))
    .filter(j => !filtroSinHorario || sinHorario(j))
    .filter(j => filtroDia.size === 0 || [...filtroDia].some(d => j[`entrena_${d}`] === true))
    .filter(j => filtroFederado.size === 0 || (filtroFederado.has('si') && j.federado === true) || (filtroFederado.has('no') && !j.federado))
    .filter(j => filtroDoc.size === 0 || (filtroDoc.has('si') && conDocumento.has(j.id)) || (filtroDoc.has('no') && !conDocumento.has(j.id)))
    .filter(j => filtroPago.size === 0 || filtroPago.has(estadoPago[j.id] || ''))
    .filter(j => filtroHorario.size === 0 || filtroHorario.has(j.horario || ''))
    .filter(j => filtroPresente.size === 0 || (filtroPresente.has('presente') && asistenciaHoy.has(j.id)) || (filtroPresente.has('ausente') && !asistenciaHoy.has(j.id)))
    .filter(j => {
      if (!edadMin && !edadMax) return true
      const edad = calcularEdad(j.fecha_nacimiento)
      if (edad === null) return false
      if (edadMin && edad < parseInt(edadMin)) return false
      if (edadMax && edad > parseInt(edadMax)) return false
      return true
    })
    .sort((a, b) => orden === 'az'
      ? (a.nombre || '').localeCompare(b.nombre || '', 'es')
      : (b.nombre || '').localeCompare(a.nombre || '', 'es'))

  const categorias = [...new Set(jugadores.map(j => j.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const horarios = [...new Set(jugadores.map(j => j.horario).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const esAdmin = perfil?.rol === 'admin'
  const fmtMonto = useTextoMonto()

  const chipsActivos: { key: string; label: string; onRemove: () => void }[] = [
    ...(busqueda ? [{ key:'q', label:`"${busqueda}"`, onRemove: () => setBusqueda('') }] : []),
    ...[...filtroCat].map(c => ({ key:`cat-${c}`, label:c, onRemove: () => setFiltroCat(prev => setToggle(prev, c)) })),
    ...[...filtroEstado].map(v => ({ key:`estado-${v}`, label: v === 'activo' ? 'Activo' : 'Bloqueado', onRemove: () => setFiltroEstado(prev => setToggle(prev, v)) })),
    ...(filtroSinHorario ? [{ key:'sinhorario', label:'Sin horario', onRemove: () => setFiltroSinHorario(false) }] : []),
    ...[...filtroDia].map(d => ({ key:`dia-${d}`, label: diaLabel(d), onRemove: () => setFiltroDia(prev => setToggle(prev, d)) })),
    ...[...filtroFederado].map(v => ({ key:`fed-${v}`, label: v === 'si' ? 'Federado' : 'No federado', onRemove: () => setFiltroFederado(prev => setToggle(prev, v)) })),
    ...[...filtroDoc].map(v => ({ key:`doc-${v}`, label: v === 'si' ? 'Con formulario' : 'Sin formulario', onRemove: () => setFiltroDoc(prev => setToggle(prev, v)) })),
    ...[...filtroPago].map(v => ({ key:`pago-${v}`, label: v === 'pagado' ? 'Al día' : v === 'pendiente' ? 'Pendiente' : 'Atrasado', onRemove: () => setFiltroPago(prev => setToggle(prev, v)) })),
    ...[...filtroHorario].map(h => ({ key:`horario-${h}`, label:h, onRemove: () => setFiltroHorario(prev => setToggle(prev, h)) })),
    ...[...filtroPresente].map(v => ({ key:`presente-${v}`, label: v === 'presente' ? 'Presente hoy' : 'Ausente hoy', onRemove: () => setFiltroPresente(prev => setToggle(prev, v)) })),
    ...[...filtroSede].map(s => ({ key:`sede-${s}`, label: sedeLabel(s), onRemove: () => setFiltroSede(prev => setToggle(prev, s)) })),
    ...[...filtroGrupo].map(g => ({ key:`grupo-${g}`, label: grupoLabel(g), onRemove: () => setFiltroGrupo(prev => setToggle(prev, g)) })),
    ...((edadMin || edadMax) ? [{ key:'edad', label:`Edad ${edadMin || '0'}–${edadMax || '∞'}`, onRemove: () => { setEdadMin(''); setEdadMax('') } }] : []),
  ]

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color: text }}>Jugadores</h1>
        <div style={{ display:'flex', gap:8 }}>
          {esAdmin && (
            <button onClick={() => setExportModalOpen(true)} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>
              Exportar
            </button>
          )}
          {esAdmin && (
            <button onClick={abrirNuevo} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              + Nuevo jugador
            </button>
          )}
        </div>
      </div>

      {/* Pasar lista y ver inasistencias vive en su propio módulo: /asistencia.
          Acá quedan las personas, no la operación del día. */}
      <div style={{ ...card, padding:12, marginBottom:16 }}>
        {/* Búsqueda */}
        <input
          style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:10 }}
          placeholder="Buscar por nombre o RUT..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        {/* Filtros */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <FiltroMultiSelect
            label="Todas las categorías"
            options={categorias.map(c => ({ value:c, label:c }))}
            selected={filtroCat}
            onChange={setFiltroCat}
          />

          <FiltroMultiSelect
            label="Todos los estados"
            options={[{ value:'activo', label:'Activo' }, { value:'bloqueado', label:'Bloqueado' }]}
            selected={filtroEstado}
            onChange={setFiltroEstado}
          />

          <FiltroMultiSelect
            label="Formulario federado"
            options={[{ value:'si', label:'Entregado' }, { value:'no', label:'Pendiente' }]}
            selected={filtroDoc}
            onChange={setFiltroDoc}
          />

          <button
            onClick={() => setOrden(o => o === 'az' ? 'za' : 'az')}
            style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 12px', fontSize:13, color: muted, cursor:'pointer', whiteSpace:'nowrap' }}
          >
            {orden === 'az' ? 'A → Z' : 'Z → A'}
          </button>

          <button
            onClick={() => setFiltroSinHorario(v => !v)}
            style={{ background: filtroSinHorario ? '#fff7ed' : '#f4f7fa', border: `1px solid ${filtroSinHorario ? '#fed7aa' : '#e2e8f0'}`, borderRadius:8, padding:'7px 12px', fontSize:13, color: filtroSinHorario ? '#c2410c' : muted, cursor:'pointer', whiteSpace:'nowrap', fontWeight: filtroSinHorario ? 600 : 400 }}
          >
            Sin horario {sinHorarioCount > 0 && `(${sinHorarioCount})`}
          </button>

          {chipsActivos.length > 0 && (
            <button
              onClick={() => {
                setBusqueda(''); setFiltroCat(new Set()); setFiltroEstado(new Set()); setFiltroSinHorario(false)
                setFiltroDia(new Set()); setFiltroFederado(new Set()); setFiltroDoc(new Set()); setFiltroPago(new Set())
                setFiltroHorario(new Set()); setFiltroPresente(new Set()); setEdadMin(''); setEdadMax('')
                setFiltroSede(new Set()); setFiltroGrupo(new Set())
              }}
              style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'7px 12px', fontSize:13, color:'#dc2626', cursor:'pointer', whiteSpace:'nowrap' }}
            >
              Limpiar filtros
            </button>
          )}

          <span style={{ marginLeft:'auto', fontSize:12, color: hint }}>
            {filtrados.length} de {jugadores.length} jugadores
          </span>
        </div>

        {/* Fila 2: filtros avanzados */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:8, paddingTop:8, borderTop:'1px solid #f1f5f9' }}>
          <FiltroMultiSelect
            label="Sede"
            options={SEDES.map(s => ({ value: s.value, label: s.label }))}
            selected={filtroSede}
            onChange={setFiltroSede}
          />

          <FiltroMultiSelect
            label="Grupo"
            options={GRUPOS.map(g => ({ value: g.value, label: g.label }))}
            selected={filtroGrupo}
            onChange={setFiltroGrupo}
          />

          <FiltroMultiSelect
            label="Día de entrenamiento"
            options={[{ value:'lun',label:'Lunes' },{ value:'mar',label:'Martes' },{ value:'mie',label:'Miércoles' },{ value:'jue',label:'Jueves' },{ value:'vie',label:'Viernes' }]}
            selected={filtroDia}
            onChange={setFiltroDia}
          />

          <FiltroMultiSelect
            label="Federado"
            options={[{ value:'si', label:'Federado ✓' }, { value:'no', label:'No federado' }]}
            selected={filtroFederado}
            onChange={setFiltroFederado}
          />

          <FiltroMultiSelect
            label="Pago del mes"
            options={[{ value:'pagado', label:'Al día ✓' }, { value:'pendiente', label:'Pendiente' }, { value:'atrasado', label:'Atrasado' }]}
            selected={filtroPago}
            onChange={setFiltroPago}
            colorActivo={{ bg:'#f0fdf4', border:'#bbf7d0', text:'#16a34a' }}
          />

          <FiltroMultiSelect
            label="Presente hoy"
            options={[{ value:'presente', label:'Presente hoy' }, { value:'ausente', label:'Ausente hoy' }]}
            selected={filtroPresente}
            onChange={setFiltroPresente}
            colorActivo={{ bg:'#f0fdf4', border:'#bbf7d0', text:'#16a34a' }}
          />

          {horarios.length > 0 && (
            <FiltroMultiSelect
              label="Horario"
              options={horarios.map(h => ({ value:h, label:h }))}
              selected={filtroHorario}
              onChange={setFiltroHorario}
            />
          )}

          <div style={{ display:'flex', alignItems:'center', gap:6, background: (edadMin || edadMax) ? '#eff6ff' : '#f4f7fa', border: `1px solid ${(edadMin || edadMax) ? '#bfdbfe' : '#e2e8f0'}`, borderRadius:8, padding:'5px 10px' }}>
            <span style={{ fontSize:13, color: (edadMin || edadMax) ? '#1d4ed8' : hint, fontWeight: (edadMin || edadMax) ? 600 : 400 }}>Edad</span>
            <input
              type="number" min={0} placeholder="min" value={edadMin} onChange={e => setEdadMin(e.target.value)}
              style={{ width:44, border:'none', background:'transparent', outline:'none', fontSize:13, color: text }}
            />
            <span style={{ color: hint }}>–</span>
            <input
              type="number" min={0} placeholder="max" value={edadMax} onChange={e => setEdadMax(e.target.value)}
              style={{ width:44, border:'none', background:'transparent', outline:'none', fontSize:13, color: text }}
            />
          </div>
        </div>

        {/* Chips de filtros activos */}
        {chipsActivos.length > 0 && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginTop:8, paddingTop:8, borderTop:'1px solid #f1f5f9' }}>
            {chipsActivos.map(chip => (
              <span key={chip.key} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#eff6ff', border:'1px solid #bfdbfe', color:'#1d4ed8', borderRadius:999, padding:'3px 6px 3px 10px', fontSize:12 }}>
                {chip.label}
                <button
                  onClick={chip.onRemove}
                  title="Quitar filtro"
                  style={{ background:'transparent', border:'none', color:'#1d4ed8', cursor:'pointer', fontSize:13, lineHeight:1, padding:'0 4px', borderRadius:999 }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Vista tabla — pantallas medianas y grandes */}
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['#','Nombre','RUT','Categoría','Mensualidad','Horario',''].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((j, i) => {
                const cat = badgeCategoria[j.categoria] || { bg: '#f4f7fa', color: muted }
                return (
                  <tr key={j.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'8px 16px' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                        <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#3730a3,#4f46e5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'white', overflow:'hidden', flexShrink:0 }}>
                          {(() => {
                            const foto = (j.foto_path ? fotosFirmadas[j.foto_path] : j.foto_url) || null
                            return foto
                              ? <img src={foto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              : j.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()
                          })()}
                        </div>
                        <span style={{ fontSize:10, color: hint }}>{String(i+1).padStart(3,'0')}</span>
                      </div>
                    </td>
                    <td style={{ padding:'12px 16px', fontWeight:600, color: text, whiteSpace:'nowrap' }}>{j.nombre}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>{j.rut || '—'}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: cat.bg, color: cat.color, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                        {j.categoria}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      {esAdmin && editandoMensualidadId === j.id ? (
                        <input
                          autoFocus
                          type="number"
                          value={mensualidadTemp}
                          onChange={e => setMensualidadTemp(e.target.value)}
                          onBlur={() => guardarMensualidad(j)}
                          onKeyDown={e => { if (e.key === 'Enter') guardarMensualidad(j); if (e.key === 'Escape') setEditandoMensualidadId(null) }}
                          style={{ width:90, background:'#f8fafc', border:'1px solid #6366f1', borderRadius:6, padding:'4px 8px', fontSize:13, outline:'none' }}
                        />
                      ) : (
                        <span
                          onClick={esAdmin ? () => { setEditandoMensualidadId(j.id); setMensualidadTemp(j.mensualidad != null ? String(j.mensualidad) : '') } : undefined}
                          title={esAdmin ? 'Clic para editar' : undefined}
                          style={{ fontSize: j.mensualidad ? 13 : 11, color: j.mensualidad ? text : '#c2410c', fontWeight: j.mensualidad ? 600 : 500, cursor: esAdmin ? 'pointer' : 'default' }}
                        >
                          {j.mensualidad ? fmtMonto(j.mensualidad) : SIN_CUOTA}
                        </span>
                      )}
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12 }}>
                      {j.horario && <div style={{ color: text, marginBottom:2 }}>{j.horario}</div>}
                      {(() => {
                        const dias = [
                          { k:'entrena_lun', l:'Lu' }, { k:'entrena_mar', l:'Ma' },
                          { k:'entrena_mie', l:'Mi' }, { k:'entrena_jue', l:'Ju' },
                          { k:'entrena_vie', l:'Vi' },
                        ]
                        const activos = dias.filter(d => j[d.k] === true).map(d => d.l)
                        if (activos.length === 0 && !j.horario) return <span style={{ color: hint }}>—</span>
                        if (activos.length === 0) return null
                        return <div style={{ color: muted, fontSize:11 }}>{activos.join(' · ')}</div>
                      })()}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', gap:6, whiteSpace:'nowrap' }}>
                        <button onClick={() => router.push(`/jugadores/${j.id}`)} style={{ background:'#ede9fe', color:'#3730a3', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Ver perfil</button>
                        {esAdmin && <>
                          <button onClick={() => abrirEditar(j)} style={{ background:'#f4f7fa', color: muted, border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Editar</button>
                          <button onClick={() => eliminar(j.id)} style={{ background:'#fef2f2', color:'#dc2626', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>✕</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtrados.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>
            {busqueda ? 'No se encontraron jugadores' : 'Sin jugadores registrados'}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:20 }}>
              {editando ? 'Editar jugador' : 'Nuevo jugador'}
            </div>
            {[
              { label:'Nombre completo *', key:'nombre', type:'text', placeholder:'Ej: Carlos Muñoz' },
              { label:'RUT', key:'rut', type:'text', placeholder:'12345678-9' },
              { label: editando ? 'Email' : 'Email *', key:'email', type:'email', placeholder:'tu@email.com' },
              { label:'Teléfono', key:'telefono', type:'tel', placeholder:'+56 9 1234 5678' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>{f.label}</label>
                <input
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type={f.type} placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: f.key === 'rut' ? formatRut(e.target.value) : e.target.value }))}
                />
              </div>
            ))}

            {!editando && <div style={{ fontSize:11, color: hint, marginBottom:14 }}>El jugador recibirá un correo para crear su contraseña.</div>}

            {esClubBuin && <>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Fecha de nacimiento *</label>
                <input
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="date" value={form.fecha_nacimiento}
                  onChange={e => setForm(prev => ({ ...prev, fecha_nacimiento: e.target.value, categoria: categoriaBuinPorFechaNacimiento(e.target.value) || prev.categoria }))}
                />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Dirección *</label>
                <input
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="text" placeholder="Calle, número, comuna"
                  value={form.direccion} onChange={e => setForm(prev => ({ ...prev, direccion: e.target.value }))}
                />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Comuna / sede de entrenamiento</label>
                <input
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="text" placeholder="Ej: Buin (Aníbal Pinto 158)"
                  value={form.comuna} onChange={e => setForm(prev => ({ ...prev, comuna: e.target.value }))}
                />
              </div>
              <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Apoderado / contacto emergencia</label>
                  <input
                    style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                    type="text" value={form.contacto_emergencia_nombre}
                    onChange={e => setForm(prev => ({ ...prev, contacto_emergencia_nombre: e.target.value }))}
                  />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Teléfono emergencia</label>
                  <input
                    style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                    type="tel" value={form.contacto_emergencia_telefono}
                    onChange={e => setForm(prev => ({ ...prev, contacto_emergencia_telefono: e.target.value }))}
                  />
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Indicaciones médicas</label>
                <input
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="text" placeholder="Alergias, lesiones, tratamientos..."
                  value={form.indicaciones_medicas} onChange={e => setForm(prev => ({ ...prev, indicaciones_medicas: e.target.value }))}
                />
              </div>
              <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Talla polera</label>
                  <select
                    style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                    value={form.talla_polera} onChange={e => setForm(prev => ({ ...prev, talla_polera: e.target.value }))}
                  >
                    <option value="">No especificada</option>
                    {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Talla short</label>
                  <select
                    style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                    value={form.talla_short} onChange={e => setForm(prev => ({ ...prev, talla_short: e.target.value }))}
                  >
                    <option value="">No especificada</option>
                    {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, fontSize:13, color: text, cursor:'pointer' }}>
                <input type="checkbox" checked={form.federado} onChange={e => setForm(prev => ({ ...prev, federado: e.target.checked }))} />
                Federado
              </label>
            </>}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Categoría</label>
              <select
                style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={form.categoria} onChange={e => setForm(prev => ({ ...prev, categoria: e.target.value }))}>
                {!esClubBuin && categorias.map(c => <option key={c} value={c}>{c}</option>)}
                {esClubBuin && <>
                  <option value="">Selecciona...</option>
                  {CATEGORIAS_BUIN.map(c => <option key={c} value={c}>{c}</option>)}
                </>}
              </select>
            </div>

            {/* Grupos: solo al crear. Al editar se manejan desde la ficha, que
                es donde se ven junto al resto de su horario. */}
            {!editando && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:2 }}>Grupos de entrenamiento</label>
                <div style={{ fontSize:11, color: hint, marginBottom:6 }}>
                  Sin grupo no aparece en la lista de asistencia ni puede marcar su llegada desde la app.
                </div>
                <div style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:10, maxHeight:200, overflowY:'auto' }}>
                  {DIAS.map(d => {
                    const delDia = bloquesClub.filter(b => b.dia_semana === d.value)
                    if (delDia.length === 0) return null
                    return (
                      <div key={d.value} style={{ marginBottom:10 }}>
                        <div style={{ fontSize:10, color: muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>{diaLabel(d.value)}</div>
                        {delDia.map(b => {
                          const marcado = bloquesSel.has(b.id)
                          return (
                            <div key={b.id}
                              onClick={() => setBloquesSel(prev => {
                                const s = new Set(prev)
                                if (s.has(b.id)) s.delete(b.id); else s.add(b.id)
                                return s
                              })}
                              style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 8px', borderRadius:6, cursor:'pointer', marginBottom:3,
                                background: marcado ? '#eef2ff' : 'transparent', border:`1px solid ${marcado ? '#c7d2fe' : 'transparent'}` }}>
                              <div style={{ width:16, height:16, borderRadius:4, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                                border:`2px solid ${marcado ? '#4f46e5' : '#cbd5e1'}`, background: marcado ? '#4f46e5' : 'transparent' }}>
                                {marcado && <span style={{ color:'white', fontSize:10, fontWeight:800 }}>✓</span>}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:600, color: text }}>{b.nombre}</div>
                                <div style={{ fontSize:10, color: muted }}>{sedeLabel(b.sede)} · {rangoHorario(b.hora_inicio, b.hora_fin)}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                  {bloquesClub.length === 0 && (
                    <div style={{ padding:'14px 0', textAlign:'center', fontSize:12, color: muted }}>
                      Todavía no hay grupos en el horario semanal.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Plan */}
            <div style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:10, padding:14, marginBottom:20 }}>
              <div style={{ fontSize:11, color:'#3730a3', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>Plan del jugador</div>

              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Tipo de plan</label>
                <div style={{ display:'flex', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
                  {[{key:'mensual', label:'Mensual'},{key:'semanal', label:'Semanal'},{key:'libre', label:'Libre acceso'}].map(t => (
                    <div key={t.key} onClick={() => setForm(prev => ({ ...prev, tipo_plan: t.key }))}
                      style={{ flex:1, padding:'8px', textAlign:'center', cursor:'pointer', fontSize:12, fontWeight:500, background: form.tipo_plan===t.key ? '#ede9fe':'transparent', color: form.tipo_plan===t.key ? '#3730a3': muted, transition:'all 0.15s' }}>
                      {t.label}
                    </div>
                  ))}
                </div>
              </div>

              {form.tipo_plan !== 'libre' && (
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Entrenamientos por semana</label>
                  <input
                    style={{ width:'100%', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                    type="number" min="1" max="7" placeholder="3"
                    value={form.entrenamientos_por_semana}
                    onChange={e => setForm(prev => ({ ...prev, entrenamientos_por_semana: e.target.value }))}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Mensualidad (CLP)</label>
                <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                  {[{monto:15000, ent:1, label:'$15.000'},{monto:25000, ent:2, label:'$25.000'},{monto:30000, ent:3, label:'$30.000'},{monto:40000, ent:4, label:'$40.000'}].map(p => {
                    const seleccionado = parseInt(form.mensualidad) === p.monto
                    return (
                      <button key={p.monto} type="button"
                        onClick={() => setForm(prev => ({ ...prev, mensualidad: String(p.monto), entrenamientos_por_semana: prev.tipo_plan === 'libre' ? prev.entrenamientos_por_semana : String(p.ent) }))}
                        style={{ flex:'1 1 calc(50% - 3px)', padding:'8px 10px', background: seleccionado ? '#ede9fe':'#ffffff', border: `1px solid ${seleccionado ? '#4f46e5':'#e2e8f0'}`, borderRadius:8, color: seleccionado ? '#3730a3': muted, fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                        {p.label}
                      </button>
                    )
                  })}
                </div>
                <input
                  style={{ width:'100%', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="number" placeholder="Monto personalizado"
                  value={form.mensualidad}
                  onChange={e => setForm(prev => ({ ...prev, mensualidad: e.target.value }))}
                />
                <div style={{ fontSize:11, color: hint, marginTop:5 }}>
                  Si todavía no sabés cuánto va a pagar, dejalo vacío: queda como &ldquo;{SIN_CUOTA}&rdquo;.
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear jugador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {exportModalOpen && esAdmin && (
        <ModalExportarJugadores
          jugadores={filtrados}
          ctx={{ estadoPago, asistenciaHoy, conDocumento }}
          clubNombre={clubNombre}
          onClose={() => setExportModalOpen(false)}
          onExportado={mostrarToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'12px 18px', fontSize:13, color:'#16a34a', zIndex:200, boxShadow:'0 4px 12px rgba(15,23,42,0.12)' }}>
          {toast}
        </div>
      )}
    </AppLayout>
  )
}
