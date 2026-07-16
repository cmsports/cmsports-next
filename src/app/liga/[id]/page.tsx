'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import {
  crearDivision, actualizarCapacidadDivision,
  asignarJugadoresDivision, calcularDiffFixtureDivision,
  generarFixtureDivisionAction, generarProgramacionLiga,
  crearJugadorExternoLiga,
  terminarFechaAction, programarEnReajuste, programarNuevosPartidosDivision,
} from '@/app/actions/liga'
import { registrarPagoLiga } from '@/app/actions/liga-pagos'
import { TableroFecha } from '@/components/liga/TableroFecha'
import { RankingDivision } from '@/components/liga/RankingDivision'
import { FixtureDivision } from '@/components/liga/FixtureDivision'
import { calcularRankingDivision } from '@/lib/domain/liga'
import type { DiffDivision, PartidoFinalizado, FilaRanking } from '@/lib/domain/liga'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 4px 20px rgba(15,23,42,0.10)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const inputStyle = { background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' } as const

const AVATAR_BG_D = [
  ['#6366f1','#818cf8'],['#8b5cf6','#a78bfa'],['#ec4899','#f472b6'],
  ['#ef4444','#f87171'],['#f97316','#fb923c'],['#f59e0b','#fbbf24'],
  ['#10b981','#34d399'],['#06b6d4','#22d3ee'],['#3b82f6','#60a5fa'],
  ['#84cc16','#a3e635'],
]
function avatarBgD(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0
  const [c1, c2] = AVATAR_BG_D[Math.abs(h) % AVATAR_BG_D.length]
  return `linear-gradient(135deg, ${c1}, ${c2})`
}
function initialsD(name: string) {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

// Color de acento por división (cycling)
const DIV_ACCENT = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f43f5e','#84cc16']

interface Division { id: string; nombre: string; orden: number; fixture_generado: boolean; capacidad_max: number | null }
interface Fecha { id: string; numero: number; es_ajuste: boolean; estado: string }
interface Jugador { id: string; nombre: string; es_externo: boolean | null }
interface PagoResumen { id: string; monto_total: number; monto_pagado: number; estado: string }
interface PodioDivision { id: string; nombre: string; top4: Array<{ pos: number; jugadorId: string; pts: number; pg: number }> }

type SubTab = 'jugadores' | 'programacion' | 'ranking'

const SEMAFORO: Record<string, string> = {
  pagado:   '#16a34a',
  parcial:  '#d97706',
  pendiente: '#94a3b8',
}

export default function LigaDetallePage() {
  const params = useParams<{ id: string }>()
  const ligaId = params.id
  const { perfil, loading: authLoading } = usePerfil()

  const [liga, setLiga] = useState<{ nombre: string; montoInscripcionDefault: number | null } | null>(null)
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [fechas, setFechas] = useState<Fecha[]>([])
  const [jugadoresClub, setJugadoresClub] = useState<Jugador[]>([])
  const [divisionJugadores, setDivisionJugadores] = useState<Record<string, string[]>>({})
  const [pagos, setPagos] = useState<Record<string, PagoResumen>>({})
  const [loading, setLoading] = useState(true)
  const [mensaje, setMensaje] = useState('')

  const [nombreDivision, setNombreDivision] = useState('')
  const [formNuevaDivision, setFormNuevaDivision] = useState(false)

  const [divisionActiva, setDivisionActiva] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('jugadores')
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string | null>(null)
  const [formExternoAbierto, setFormExternoAbierto] = useState(false)
  const [nombreExterno, setNombreExterno] = useState('')
  const [rutExterno, setRutExterno] = useState('')
  const [telefonoExterno, setTelefonoExterno] = useState('')
  const [creandoExterno, setCreandoExterno] = useState(false)

  const [programando, setProgramando] = useState(false)
  const [programacionKey, setProgramacionKey] = useState(0)
  const [fixtureKey, setFixtureKey] = useState(0)
  const [diffAbierto, setDiffAbierto] = useState(false)
  const [diffData, setDiffData] = useState<DiffDivision | null>(null)
  const [pendingDivision, setPendingDivision] = useState<Division | null>(null)
  const [aplicandoDiff, setAplicandoDiff] = useState(false)

  const [editandoCupo, setEditandoCupo] = useState(false)
  const [nuevoCupo, setNuevoCupo] = useState('')
  const [guardandoCupo, setGuardandoCupo] = useState(false)

  const [podioAbierto, setPodioAbierto] = useState(false)
  const [podioDivisiones, setPodioDivisiones] = useState<PodioDivision[]>([])
  const [loadingPodio, setLoadingPodio] = useState(false)
  const [confirmPendientes, setConfirmPendientes] = useState<{ fechaId: string; cantidad: number } | null>(null)

  const [pagoModalAbierto, setPagoModalAbierto] = useState(false)
  const [jugadorPagando, setJugadorPagando] = useState<Jugador | null>(null)
  const [montoTotal, setMontoTotal] = useState('')
  const [montoAbono, setMontoAbono] = useState('')
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0])
  const [metodoPago, setMetodoPago] = useState('')
  const [registrandoPago, setRegistrandoPago] = useState(false)
  const [pagoError, setPagoError] = useState('')

  const [darkMode, setDarkMode] = useState(false)
  const [filtroJugador, setFiltroJugador] = useState('')
  const [hoveredJugador, setHoveredJugador] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    // 5 queries en paralelo — RLS filtra por club sin necesitar club_id explícito
    const [{ data: ligaData }, { data: divs }, { data: fch }, { data: jugs }, { data: dj }] = await Promise.all([
      (supabase as any).from('ligas').select('nombre, monto_inscripcion_default').eq('id', ligaId).single(),
      supabase.from('liga_divisiones').select('id, nombre, orden, fixture_generado, capacidad_max').eq('liga_id', ligaId).order('orden'),
      supabase.from('liga_fechas').select('id, numero, es_ajuste, estado').eq('liga_id', ligaId).order('numero'),
      supabase.from('jugadores').select('id, nombre, es_externo').eq('estado', 'activo').order('nombre'),
      supabase.from('liga_division_jugadores').select('division_id, jugador_id'),
    ])
    if (!ligaData) { setLoading(false); return }

    setLiga({ nombre: ligaData.nombre, montoInscripcionDefault: ligaData.monto_inscripcion_default ?? null })
    setDivisiones(divs || [])
    setFechas(fch || [])
    setJugadoresClub(jugs || [])

    const mapa: Record<string, string[]> = {}
    for (const row of dj || []) {
      if (!(divs || []).find(d => d.id === row.division_id)) continue
      mapa[row.division_id] = [...(mapa[row.division_id] || []), row.jugador_id]
    }
    setDivisionJugadores(mapa)

    setDivisionActiva(prev => prev ?? (divs && divs[0] ? divs[0].id : null))
    setFechaSeleccionada(prev => prev ?? (fch && fch[0] ? fch[0].id : null))
    setLoading(false)
  }, [ligaId])

  useEffect(() => { cargar() }, [cargar])

  // Lectura directa (RLS liga_jugador_pagos_select ya restringe al club) —
  // evita el hop del Server Action y su re-autenticación en cada cambio de división.
  const cargarPagos = useCallback(async (divisionId: string) => {
    const { data } = await (supabase as any)
      .from('liga_jugador_pagos')
      .select('id, jugador_id, monto_total, monto_pagado, estado')
      .eq('division_id', divisionId)
    const mapa: Record<string, PagoResumen> = {}
    for (const p of (data || []) as Array<PagoResumen & { jugador_id: string }>) mapa[p.jugador_id] = p
    setPagos(mapa)
  }, [])

  useEffect(() => {
    if (divisionActiva) cargarPagos(divisionActiva)
  }, [divisionActiva, cargarPagos])

  useEffect(() => { setEditandoCupo(false) }, [divisionActiva])

  // Auto-dismiss mensaje after 5s
  useEffect(() => {
    if (!mensaje) return
    const t = setTimeout(() => setMensaje(''), 5000)
    return () => clearTimeout(t)
  }, [mensaje])

  useEffect(() => {
    if (!podioAbierto) return
    setLoadingPodio(true)
    setPodioDivisiones([])
    const db = supabase as any
    Promise.all(
      divisiones.map(async (div) => {
        const [{ data: dj }, { data: rawPartidos }] = await Promise.all([
          supabase.from('liga_division_jugadores').select('jugador_id').eq('division_id', div.id),
          db.from('liga_partidos')
            .select('jugador_a_id, jugador_b_id, ganador_id, es_walkover, sets_a, sets_b')
            .eq('division_id', div.id)
            .in('estado', ['finalizado', 'walkover'])
            .is('deleted_at', null),
        ])
        const jugIds = (dj || []).map((j: { jugador_id: string }) => j.jugador_id)
        const partidos: PartidoFinalizado[] = (rawPartidos || [])
          .filter((p: any) => p.ganador_id)
          .map((p: any) => ({
            jugadorAId: p.jugador_a_id,
            jugadorBId: p.jugador_b_id,
            ganadorId: p.ganador_id,
            esWalkover: p.es_walkover ?? false,
            setsA: p.sets_a ?? 0,
            setsB: p.sets_b ?? 0,
          }))
        const ranking = calcularRankingDivision(jugIds, partidos)
        return {
          id: div.id,
          nombre: div.nombre,
          top4: ranking.slice(0, 4).map((r: FilaRanking, i: number) => ({ pos: i + 1, jugadorId: r.jugadorId, pts: r.pts, pg: r.pg })),
        }
      })
    ).then(results => {
      setPodioDivisiones(results)
      setLoadingPodio(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podioAbierto])

  async function handleCrearDivision() {
    if (!nombreDivision.trim()) return
    const res = await crearDivision({ ligaId, nombre: nombreDivision, orden: divisiones.length })
    if (res.error) { setMensaje(res.error); return }
    // Optimista: agregar inmediatamente sin esperar cargar()
    const nueva: Division = { id: res.divisionId!, nombre: nombreDivision.trim(), orden: divisiones.length, fixture_generado: false, capacidad_max: null }
    setDivisiones(prev => [...prev, nueva])
    setDivisionActiva(res.divisionId!)
    setNombreDivision('')
    setFormNuevaDivision(false)
    cargar()
  }

  async function handleGuardarCupo() {
    if (!division) return
    const cap = nuevoCupo.trim() === '' ? null : parseInt(nuevoCupo)
    if (cap !== null && (isNaN(cap) || cap < 2)) { setMensaje('El cupo mínimo es 2 jugadores'); return }
    setGuardandoCupo(true)
    const res = await actualizarCapacidadDivision({ divisionId: division.id, capacidadMax: cap })
    setGuardandoCupo(false)
    if (res.error) { setMensaje(res.error); return }
    setDivisiones(prev => prev.map(d => d.id === division.id ? { ...d, capacidad_max: cap } : d))
    setEditandoCupo(false)
  }

  function toggleJugadorDivision(division: Division, jugadorId: string) {
    setDivisionJugadores(prev => {
      const actuales = prev[division.id] || []
      const yaIncluido = actuales.includes(jugadorId)
      if (!yaIncluido && division.capacidad_max && actuales.length >= division.capacidad_max) {
        setMensaje(`Esta división ya alcanzó su cupo máximo (${division.capacidad_max} jugadores)`)
        return prev
      }
      const nuevos = yaIncluido ? actuales.filter(id => id !== jugadorId) : [...actuales, jugadorId]
      return { ...prev, [division.id]: nuevos }
    })
  }

  async function handleRegistrarJugadores(division: Division) {
    const ids = divisionJugadores[division.id] || []
    if (ids.length < 2) {
      setMensaje('Seleccioná al menos 2 jugadores para continuar')
      return
    }
    if (division.fixture_generado) {
      const res = await calcularDiffFixtureDivision({ divisionId: division.id, nuevosJugadorIds: ids })
      if (res.error) { setMensaje(res.error); return }
      setDiffData(res.data)
      setPendingDivision(division)
      setDiffAbierto(true)
      return
    }
    setAplicandoDiff(true)
    const saveRes = await asignarJugadoresDivision({ divisionId: division.id, jugadorIds: ids })
    if (saveRes.error) { setMensaje(saveRes.error); setAplicandoDiff(false); return }
    const fixtureRes = await generarFixtureDivisionAction({ divisionId: division.id })
    setAplicandoDiff(false)
    if (fixtureRes.error) {
      setMensaje(`Jugadores guardados, pero el fixture falló: ${fixtureRes.error}`)
      cargar()
      return
    }
    // Optimista: marcar fixture_generado=true y forzar remount de FixtureDivision
    setDivisiones(prev => prev.map(d => d.id === division.id ? { ...d, fixture_generado: true } : d))
    setFixtureKey(k => k + 1)
    setMensaje(`${ids.length} jugadores registrados · ${fixtureRes.totalPartidos} partidos en el fixture`)
    cargar()
  }

  async function aplicarGuardado(division: Division) {
    const ids = divisionJugadores[division.id] || []
    setAplicandoDiff(true)
    const res = await asignarJugadoresDivision({ divisionId: division.id, jugadorIds: ids })
    if (res.error) { setMensaje(res.error); setAplicandoDiff(false); return }

    const partes: string[] = []
    if (res.jugadoresAgregados) partes.push(`${res.jugadoresAgregados} jugador${res.jugadoresAgregados !== 1 ? 'es' : ''} agregado${res.jugadoresAgregados !== 1 ? 's' : ''}`)
    if (res.jugadoresRemovidos) partes.push(`${res.jugadoresRemovidos} removido${res.jugadoresRemovidos !== 1 ? 's' : ''}`)
    if (res.partidosAnulados) partes.push(`${res.partidosAnulados} partido${res.partidosAnulados !== 1 ? 's' : ''} anulado${res.partidosAnulados !== 1 ? 's' : ''}`)

    // Nuevos partidos → programarlos automáticamente en los huecos reales de cada fecha
    if ((res.partidosCreados ?? 0) > 0) {
      const progRes = await programarNuevosPartidosDivision({ ligaId, divisionId: division.id })
      if (progRes.error) {
        partes.push(`${res.partidosCreados} partido${(res.partidosCreados ?? 0) !== 1 ? 's' : ''} creado${(res.partidosCreados ?? 0) !== 1 ? 's' : ''} (pendiente programar: ${progRes.error})`)
      } else {
        if (progRes.programados) partes.push(`${progRes.programados} partido${progRes.programados !== 1 ? 's' : ''} programado${progRes.programados !== 1 ? 's' : ''} en fechas`)
        if ((progRes.enReajuste ?? 0) > 0) partes.push(`${progRes.enReajuste} pasan a fecha de ajuste`)
      }
    }

    setFixtureKey(k => k + 1)
    setAplicandoDiff(false)
    setMensaje(partes.length ? `Guardado — ${partes.join(', ')}` : 'Jugadores guardados')
    setDiffAbierto(false)
    cargar()
  }

  async function handleCrearExterno(division: Division) {
    if (!nombreExterno.trim()) return
    setCreandoExterno(true)
    const res = await crearJugadorExternoLiga({ nombre: nombreExterno, rut: rutExterno || undefined, telefono: telefonoExterno || undefined })
    setCreandoExterno(false)
    if (res.error || !res.jugadorId) { setMensaje(res.error || 'No se pudo crear el jugador externo'); return }
    setNombreExterno('')
    setRutExterno('')
    setTelefonoExterno('')
    setFormExternoAbierto(false)
    setJugadoresClub(prev => [...prev, { id: res.jugadorId!, nombre: res.jugadorNombre!, es_externo: true }].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    toggleJugadorDivision(division, res.jugadorId)
  }

  async function handleGenerarProgramacion() {
    setProgramando(true)
    const res = await generarProgramacionLiga({ ligaId })
    setProgramando(false)
    if (res.error) { setMensaje(res.error); return }
    const extra = (res.totalSinProgramar ?? 0) > 0 ? ` · ${res.totalSinProgramar} sin programar (irán a Fecha ajuste)` : ''
    setMensaje(`Programación lista: ${res.totalProgramados ?? 0} partidos asignados${extra}`)
    setProgramacionKey(k => k + 1)
    cargar()
  }

  async function handleTerminarFecha(fechaId: string, forzar = false) {
    setProgramando(true)
    const res = await terminarFechaAction({ fechaId, forzar })
    if ('pendientes' in res && (res.pendientes ?? 0) > 0) {
      setProgramando(false)
      setConfirmPendientes({ fechaId, cantidad: res.pendientes! })
      return
    }
    if (res.error) { setMensaje(res.error); setProgramando(false); return }
    if (res.ligaFinalizada) {
      setProgramando(false)
      setMensaje('¡Liga finalizada!')
      setPodioAbierto(true)
      cargar()
      return
    }
    if (res.todasTerminadas) {
      const rRes = await programarEnReajuste({ ligaId })
      setProgramando(false)
      if (rRes.error) { setMensaje(`Fecha terminada · Error al programar reajuste: ${rRes.error}`); return }
      setMensaje(`Todas las fechas terminadas — ${rRes.total ?? 0} partidos programados en fecha de reajuste`)
      setProgramacionKey(k => k + 1)
    } else {
      setProgramando(false)
      setMensaje('Fecha terminada')
    }
    cargar()
  }

  async function handleProgramarReajuste() {
    setProgramando(true)
    const res = await programarEnReajuste({ ligaId })
    setProgramando(false)
    if (res.error) { setMensaje(res.error); return }
    setMensaje(`Reajuste programado: ${res.total ?? 0} partidos asignados`)
    setProgramacionKey(k => k + 1)
    cargar()
  }

  function abrirPagoModal(jugador: Jugador) {
    setJugadorPagando(jugador)
    setPagoError('')
    const pagoExistente = pagos[jugador.id]
    if (pagoExistente) {
      setMontoTotal(String(pagoExistente.monto_total))
      setMontoAbono('')
    } else {
      setMontoTotal(liga?.montoInscripcionDefault ? String(liga.montoInscripcionDefault) : '')
      setMontoAbono('')
    }
    setFechaPago(new Date().toISOString().split('T')[0])
    setMetodoPago('')
    setPagoModalAbierto(true)
  }

  async function handleRegistrarPago() {
    if (!jugadorPagando || !divisionActiva || !liga) return
    const mt = parseInt(montoTotal)
    const ma = parseInt(montoAbono)
    if (!mt || mt <= 0) { setPagoError('El monto total debe ser mayor a cero'); return }
    if (!ma || ma <= 0) { setPagoError('El monto del abono debe ser mayor a cero'); return }
    setPagoError('')
    setRegistrandoPago(true)
    const res = await registrarPagoLiga({
      divisionId: divisionActiva,
      jugadorId: jugadorPagando.id,
      montoTotal: mt,
      montoAbono: ma,
      fecha: fechaPago,
      metodo: metodoPago || undefined,
      nombreJugador: jugadorPagando.nombre,
      nombreLiga: liga.nombre,
    })
    setRegistrandoPago(false)
    if (res.error) { setPagoError(res.error); return }
    setPagoModalAbierto(false)
    await cargarPagos(divisionActiva)
    setMensaje(`Pago registrado — ${jugadorPagando.nombre}: $${ma.toLocaleString('es-CL')}`)
  }

  if (authLoading || loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4f8' }}>
      <div style={{ width:320, display:'flex', flexDirection:'column', gap:12 }}>
        <style>{`@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}.sk{background:linear-gradient(90deg,#e2e8f0 25%,#f1f5f9 50%,#e2e8f0 75%);background-size:800px 100%;animation:shimmer 1.4s infinite linear;border-radius:8px}`}</style>
        <div className="sk" style={{ height:60, borderRadius:12 }} />
        <div className="sk" style={{ height:36, width:'60%' }} />
        <div style={{ display:'flex', gap:8 }}>
          {[1,2,3].map(i => <div key={i} className="sk" style={{ height:32, flex:1 }} />)}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[1,2,3,4].map(i => <div key={i} className="sk" style={{ height:52 }} />)}
        </div>
      </div>
    </div>
  )
  if (!liga) return <AppLayout perfil={perfil}><div style={{ padding:24, color: muted, fontSize:13 }}>Liga no encontrada</div></AppLayout>

  const division = divisiones.find(d => d.id === divisionActiva) || null
  const jugadoresDeDivision = division ? (divisionJugadores[division.id] || []) : []
  const nombrePorId = Object.fromEntries(jugadoresClub.map(j => [j.id, j.nombre]))
  const fechaActual = fechas.find(f => f.id === fechaSeleccionada) || null

  const dm = darkMode
  const pageBg = dm ? '#0f172a' : undefined
  const cardBg = dm ? '#1e293b' : '#ffffff'
  const cardBorder = dm ? '#334155' : '#e2e8f0'
  const txtColor = dm ? '#e2e8f0' : text
  const mutedColor = dm ? '#94a3b8' : muted
  const rowBg = dm ? '#1e293b' : '#f8faff'
  const rowBorder = dm ? '#334155' : '#e8edf5'
  const inputBg = dm ? '#0f172a' : '#f4f7fa'

  return (
    <AppLayout perfil={perfil}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .liga-fade{animation:fadeUp 0.35s ease both}
        .liga-fade-d1{animation-delay:0.05s}
        .liga-fade-d2{animation-delay:0.12s}
        .liga-fade-d3{animation-delay:0.20s}
        .liga-fade-d4{animation-delay:0.28s}
        .lig-tab:hover{opacity:0.85}
        .lig-jug-row:hover{box-shadow:0 3px 12px rgba(99,102,241,0.18)!important;transform:translateY(-1px);transition:all 0.15s}
        @keyframes pulse-green{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)}50%{box-shadow:0 0 0 6px rgba(16,185,129,0)}}
        .chip-en-curso{animation:pulse-green 2s infinite}
      `}</style>

      {/* Wrapper con dark mode */}
      <div style={{ background: pageBg, minHeight:'100%', margin: dm ? '-1rem' : undefined, padding: dm ? '1rem' : undefined, transition:'background 0.3s' }}>

      {/* Header de liga */}
      <div className="liga-fade" style={{ background:'linear-gradient(135deg,#1e1b4b,#312e81)', borderRadius:16, padding:'20px 24px', marginBottom:18, boxShadow:'0 4px 20px rgba(30,27,75,0.35)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', marginBottom:4 }}>🏓 Liga activa</div>
            <h1 style={{ fontSize:22, fontWeight:800, color:'white', margin:0, letterSpacing:'-0.5px' }}>{liga.nombre}</h1>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{
              background:'rgba(255,255,255,0.12)', borderRadius:10, padding:'8px 14px',
              display:'flex', flexDirection:'column', alignItems:'center', backdropFilter:'blur(4px)',
              border:'1px solid rgba(255,255,255,0.15)',
            }}>
              <span style={{ fontSize:16, fontWeight:800, color:'white' }}>{divisiones.length}</span>
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:600, letterSpacing:'0.5px' }}>DIV</span>
            </div>
            <div style={{
              background:'rgba(255,255,255,0.12)', borderRadius:10, padding:'8px 14px',
              display:'flex', flexDirection:'column', alignItems:'center', backdropFilter:'blur(4px)',
              border:'1px solid rgba(255,255,255,0.15)',
            }}>
              <span style={{ fontSize:16, fontWeight:800, color:'white' }}>{fechas.length}</span>
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:600, letterSpacing:'0.5px' }}>FECHAS</span>
            </div>
            {/* Toggle dark mode */}
            <button
              onClick={() => setDarkMode(d => !d)}
              title={dm ? 'Modo claro' : 'Modo oscuro'}
              style={{
                background: dm ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius:10, padding:'8px 12px', cursor:'pointer',
                fontSize:18, lineHeight:1, backdropFilter:'blur(4px)',
              }}>
              {dm ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </div>

      {mensaje && (
        <div style={{
          background:'linear-gradient(135deg,#4f46e5,#7c3aed)', color:'white',
          borderRadius:12, padding:'12px 16px', fontSize:13, marginBottom:18,
          cursor:'pointer', boxShadow:'0 4px 14px rgba(79,70,229,0.35)',
          display:'flex', alignItems:'center', gap:10,
        }} onClick={() => setMensaje('')}>
          <span style={{ fontSize:16 }}>✅</span>
          <span style={{ flex:1 }}>{mensaje}</span>
          <span style={{ opacity:0.7, fontSize:16 }}>×</span>
        </div>
      )}

      {/* Selector de división con "+" inline */}
      <div className="liga-fade liga-fade-d1" style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap', alignItems:'center' }}>
        {divisiones.map((d, idx) => {
          const accent = DIV_ACCENT[idx % DIV_ACCENT.length]
          const isActive = divisionActiva === d.id
          return (
            <button key={d.id} onClick={() => setDivisionActiva(d.id)}
              style={{
                padding:'8px 18px', borderRadius:20, cursor:'pointer', fontSize:13, fontWeight:700,
                background: isActive ? accent : (dm ? '#1e293b' : '#ffffff'),
                color: isActive ? 'white' : (dm ? '#94a3b8' : muted),
                boxShadow: isActive ? `0 4px 12px ${accent}55` : (dm ? 'none' : '0 1px 4px rgba(0,0,0,0.08)'),
                border: isActive ? 'none' : `1px solid ${dm ? '#334155' : '#e2e8f0'}`,
                transition:'all 0.15s',
              }}>
              {d.nombre}
            </button>
          )
        })}
        {!formNuevaDivision ? (
          <button
            onClick={() => setFormNuevaDivision(true)}
            style={{ padding:'7px 14px', borderRadius:20, border:'1px dashed #c7d2e0', cursor:'pointer', fontSize:12, fontWeight:700, color:'#6366f1', background:'transparent' }}>
            ＋ División
          </button>
        ) : (
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <input
              autoFocus
              style={{ ...inputStyle, padding:'7px 10px', fontSize:13, width:150 }}
              placeholder="Ej: División 6"
              value={nombreDivision}
              onChange={e => setNombreDivision(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCrearDivision()
                if (e.key === 'Escape') { setFormNuevaDivision(false); setNombreDivision('') }
              }}
            />
            <button
              onClick={handleCrearDivision}
              disabled={!nombreDivision.trim()}
              style={{ padding:'7px 10px', borderRadius:8, border:'none', background:'#4f46e5', color:'white', fontSize:12, fontWeight:600, cursor: nombreDivision.trim() ? 'pointer' : 'not-allowed', opacity: nombreDivision.trim() ? 1 : 0.5 }}>
              ✓
            </button>
            <button
              onClick={() => { setFormNuevaDivision(false); setNombreDivision('') }}
              style={{ padding:'7px 10px', borderRadius:8, border:'1px solid #e2e8f0', background:'transparent', color: muted, fontSize:12, cursor:'pointer' }}>
              ✕
            </button>
          </div>
        )}
        {divisiones.length === 0 && !formNuevaDivision && (
          <span style={{ fontSize:13, color: hint }}>Agrega una división para empezar</span>
        )}
      </div>

      {division && (
        <div>
          {/* Sub-pestañas */}
          <div className="liga-fade liga-fade-d2" style={{ display:'flex', background: dm ? '#1e293b' : '#f1f5f9', borderRadius:12, padding:4, marginBottom:18, maxWidth:460, gap:2, border: `1px solid ${dm ? '#334155' : 'transparent'}` }}>
            {([
              { key:'jugadores',    label:'👥 Jugadores' },
              { key:'programacion', label:'📅 Programación' },
              { key:'ranking',      label:'🏆 Ranking' },
            ] as { key: SubTab; label: string }[]).map(t => (
              <div key={t.key} onClick={() => setSubTab(t.key)}
                style={{
                  flex:1, padding:'9px 6px', textAlign:'center', borderRadius:9, cursor:'pointer',
                  fontSize:12, fontWeight:700,
                  background: subTab===t.key ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent',
                  color: subTab===t.key ? 'white' : (dm ? '#94a3b8' : muted),
                  boxShadow: subTab===t.key ? '0 2px 8px rgba(99,102,241,0.35)' : 'none',
                  transition:'all 0.15s',
                }}>
                {t.label}
              </div>
            ))}
          </div>

          {/* ── Tab Jugadores ─────────────────────────────────────────────── */}
          {subTab === 'jugadores' && <div className="liga-fade">
            <div style={{ background: cardBg, border:`1px solid ${cardBorder}`, borderRadius:16, boxShadow:'0 4px 20px rgba(15,23,42,0.10)', padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10 }}>
                <div style={{ fontSize:13, color: mutedColor, display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ fontVariantNumeric:'tabular-nums' }}>{jugadoresDeDivision.length}</span>
                  <span style={{ color: mutedColor }}>/</span>
                  {editandoCupo ? (
                    <>
                      <input
                        autoFocus
                        type="number"
                        min={Math.max(2, jugadoresDeDivision.length)}
                        value={nuevoCupo}
                        onChange={e => setNuevoCupo(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleGuardarCupo()
                          if (e.key === 'Escape') setEditandoCupo(false)
                        }}
                        style={{ width:56, background:'#f4f7fa', border:'1px solid #c7d2e0', borderRadius:6, padding:'2px 6px', fontSize:13, color: text, outline:'none' }}
                        placeholder="—"
                      />
                      <button onClick={handleGuardarCupo} disabled={guardandoCupo}
                        style={{ background:'#16a34a', color:'white', border:'none', borderRadius:6, padding:'2px 9px', fontSize:12, fontWeight:600, cursor:'pointer', opacity: guardandoCupo ? 0.6 : 1 }}>
                        {guardandoCupo ? '…' : '✓'}
                      </button>
                      <button onClick={() => setEditandoCupo(false)}
                        style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:6, padding:'2px 8px', fontSize:12, color: muted, cursor:'pointer' }}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontVariantNumeric:'tabular-nums' }}>
                        {division.capacidad_max ?? '∞'}
                      </span>
                      <button
                        onClick={() => { setNuevoCupo(division.capacidad_max ? String(division.capacidad_max) : ''); setEditandoCupo(true) }}
                        title="Editar cupo de la división"
                        style={{ background:'transparent', border:'none', color: hint, cursor:'pointer', padding:'0 2px', fontSize:11, lineHeight:1 }}>
                        ✎
                      </button>
                    </>
                  )}
                  <span style={{ color: muted }}>inscritos</span>
                </div>
                <span style={{
                  background: division.fixture_generado ? '#f0fdf4' : (dm ? '#0f172a' : '#f4f7fa'),
                  color: division.fixture_generado ? '#16a34a' : mutedColor,
                  padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:'nowrap',
                  border: `1px solid ${division.fixture_generado ? '#bbf7d0' : (dm ? '#334155' : 'transparent')}`,
                }}>
                  {division.fixture_generado ? 'Fixture generado' : 'Sin fixture'}
                </span>
              </div>

              {jugadoresDeDivision.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, gap:8 }}>
                    <div style={{ fontSize:12, color: mutedColor, fontWeight:600 }}>Inscripción y pagos</div>
                    {/* Búsqueda rápida (punto 12) */}
                    <input
                      placeholder="🔍 Buscar jugador..."
                      value={filtroJugador}
                      onChange={e => setFiltroJugador(e.target.value)}
                      style={{
                        background: inputBg, border:`1px solid ${cardBorder}`,
                        borderRadius:20, padding:'4px 12px', fontSize:12, color: txtColor,
                        outline:'none', width:160,
                      }}
                    />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {jugadoresDeDivision
                      .filter(jid => !filtroJugador || (nombrePorId[jid] ?? '').toLowerCase().includes(filtroJugador.toLowerCase()))
                      .map((jid, idx) => {
                      const nombre = nombrePorId[jid] ?? jid
                      const pago = pagos[jid]
                      const estado = pago?.estado ?? 'pendiente'
                      const color = SEMAFORO[estado] ?? SEMAFORO.pendiente
                      const label = estado === 'pagado' ? '✅ Pagado' : estado === 'parcial' ? '⚡ Parcial' : '⏳ Pendiente'
                      const avatarStyle = { background: avatarBgD(nombre) }
                      const isHovered = hoveredJugador === jid
                      return (
                        <div
                          key={jid}
                          className="liga-fade lig-jug-row"
                          style={{
                            animationDelay: `${idx * 0.04}s`,
                            display:'flex', alignItems:'center', gap:10,
                            padding:'10px 12px', background: rowBg,
                            borderRadius:10, border:`1px solid ${rowBorder}`,
                            position:'relative', cursor:'default',
                            transition:'all 0.15s',
                          }}
                          onMouseEnter={() => setHoveredJugador(jid)}
                          onMouseLeave={() => setHoveredJugador(null)}
                        >
                          {/* Avatar */}
                          <div style={{
                            width:34, height:34, borderRadius:'50%', ...avatarStyle,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            flexShrink:0, fontSize:12, fontWeight:800, color:'white',
                            boxShadow:'0 2px 6px rgba(0,0,0,0.15)',
                          }}>
                            {initialsD(nombre)}
                          </div>
                          <span style={{ flex:1, fontSize:13, fontWeight:600, color: txtColor }}>{nombre}</span>
                          {pago && (
                            <span style={{ fontSize:11, color: mutedColor, fontVariantNumeric:'tabular-nums', fontFamily:'monospace' }}>
                              ${pago.monto_pagado.toLocaleString('es-CL')} / ${pago.monto_total.toLocaleString('es-CL')}
                            </span>
                          )}
                          <span style={{ background: `${color}20`, color, padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700, whiteSpace:'nowrap', border:`1px solid ${color}40` }}>{label}</span>
                          <button
                            onClick={() => { const j = jugadoresClub.find(x => x.id === jid); if (j) abrirPagoModal(j) }}
                            style={{ background:'transparent', border:'1px solid #c7d2fe', borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:700, color:'#6366f1', cursor:'pointer', whiteSpace:'nowrap' }}>
                            💰 Pago
                          </button>
                          {/* Tooltip hover (punto 4) */}
                          {isHovered && (
                            <div style={{
                              position:'absolute', bottom:'calc(100% + 6px)', left:0, zIndex:50,
                              background: dm ? '#1e293b' : '#fff',
                              border:`1px solid ${dm ? '#334155' : '#e2e8f0'}`,
                              borderRadius:10, padding:'10px 14px', minWidth:180,
                              boxShadow:'0 8px 24px rgba(0,0,0,0.14)',
                              pointerEvents:'none',
                            }}>
                              <div style={{ fontWeight:700, fontSize:13, color: txtColor, marginBottom:4 }}>{nombre}</div>
                              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                                <div style={{ fontSize:11, color: mutedColor }}>
                                  {estado === 'pagado' ? '✅ Inscripción al día'
                                    : estado === 'parcial' ? `⚡ Abonó $${pago?.monto_pagado.toLocaleString('es-CL')}`
                                    : '⏳ Pago pendiente'}
                                </div>
                                {pago && (
                                  <div style={{ fontSize:11, color: mutedColor }}>
                                    Total: ${pago.monto_total.toLocaleString('es-CL')}
                                  </div>
                                )}
                                <div style={{ fontSize:11, color:'#6366f1', marginTop:2 }}>División: {division?.nombre}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ fontSize:12, color: mutedColor, fontWeight:600, marginBottom:6 }}>Editar inscriptos</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8, maxHeight:280, overflow:'auto', padding:12, background: dm ? '#0f172a' : '#f4f7fa', borderRadius:10, marginBottom:10, border:`1px solid ${dm ? '#334155' : 'transparent'}` }}>
                {jugadoresClub.map(j => (
                  <label key={j.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color: txtColor, cursor:'pointer' }}>
                    <input
                      type="checkbox"
                      checked={jugadoresDeDivision.includes(j.id)}
                      onChange={() => toggleJugadorDivision(division, j.id)}
                    />
                    {j.nombre}{j.es_externo && <span style={{ color: hint, fontSize:10 }}> (ext)</span>}
                  </label>
                ))}
                {jugadoresClub.length === 0 && <span style={{ fontSize:12, color: hint }}>No hay jugadores activos en el club</span>}
                <button onClick={() => setFormExternoAbierto(!formExternoAbierto)} style={{ background:'transparent', border:'1px dashed #c7d2e0', borderRadius:6, padding:'4px 8px', color:'#4f46e5', fontSize:11, fontWeight:600, cursor:'pointer', textAlign:'left' }}>
                  + Externo
                </button>
              </div>

              {formExternoAbierto && (
                <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center', background:'#f4f7fa', borderRadius:10, padding:12 }}>
                  <input style={{ ...inputStyle, flex:1, minWidth:140 }} placeholder="Nombre" value={nombreExterno} onChange={e => setNombreExterno(e.target.value)} />
                  <input style={{ ...inputStyle, width:130 }} placeholder="RUT (opcional)" value={rutExterno} onChange={e => setRutExterno(e.target.value)} />
                  <input style={{ ...inputStyle, width:130 }} placeholder="Teléfono (opcional)" value={telefonoExterno} onChange={e => setTelefonoExterno(e.target.value)} />
                  <button onClick={() => handleCrearExterno(division)} disabled={creandoExterno || !nombreExterno.trim()} style={{ background:'#4f46e5', color:'white', border:'none', borderRadius:8, padding:'10px 16px', fontSize:12, fontWeight:600, cursor: creandoExterno ? 'default' : 'pointer', opacity: creandoExterno ? 0.6 : 1 }}>
                    Agregar
                  </button>
                </div>
              )}

              <div style={{ marginTop:4 }}>
                <button
                  onClick={() => handleRegistrarJugadores(division)}
                  disabled={aplicandoDiff}
                  style={{
                    background: jugadoresDeDivision.length >= 2
                      ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                      : '#e2e8f0',
                    color: jugadoresDeDivision.length >= 2 ? 'white' : hint,
                    border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700,
                    cursor: aplicandoDiff || jugadoresDeDivision.length < 2 ? 'not-allowed' : 'pointer',
                    opacity: aplicandoDiff ? 0.6 : 1,
                    boxShadow: jugadoresDeDivision.length >= 2 ? '0 4px 14px rgba(99,102,241,0.4)' : 'none',
                  }}>
                  {aplicandoDiff ? 'Guardando...' : '💾 Registrar jugadores'}
                </button>
                {jugadoresDeDivision.length < 2 && (
                  <div style={{ fontSize:11, color: hint, marginTop:6 }}>Seleccioná al menos 2 jugadores</div>
                )}
              </div>

              <FixtureDivision key={`${division.id}-${division.fixture_generado}-${fixtureKey}`} divisionId={division.id} ligaId={ligaId} nombres={nombrePorId} />
            </div>
          </div>}

          {/* ── Tab Programación ──────────────────────────────────────────── */}
          {subTab === 'programacion' && <div className="liga-fade">
            {/* Barra: selector de fecha + acciones */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:11, color: hint, alignSelf:'center', fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase' }}>Fecha</span>
                {fechas.map(f => {
                  const isSelected = fechaSeleccionada === f.id
                  const isAjuste = f.es_ajuste
                  const chipAccent =
                    f.estado === 'finalizada' ? '#3b82f6'
                    : f.estado === 'en_curso'  ? '#10b981'
                    : isAjuste ? '#7c3aed'
                    : '#6366f1'
                  const chipLabel =
                    f.estado === 'finalizada' ? `✓ ${isAjuste ? '⚡' : `F${f.numero}`}`
                    : f.estado === 'en_curso'  ? `▶ ${isAjuste ? '⚡' : `F${f.numero}`}`
                    : (isAjuste ? '⚡' : `F${f.numero}`)
                  return (
                    <button key={f.id}
                      onClick={() => setFechaSeleccionada(f.id)}
                      className={f.estado === 'en_curso' && !isSelected ? 'chip-en-curso' : ''}
                      style={{
                        padding:'5px 14px', borderRadius:20, cursor:'pointer', fontSize:12, fontWeight:700,
                        background: isSelected
                          ? `linear-gradient(135deg,${chipAccent},${chipAccent}cc)`
                          : f.estado === 'finalizada' ? '#eff6ff'
                          : f.estado === 'en_curso' ? '#ecfdf5'
                          : (dm ? '#1e293b' : '#f1f5f9'),
                        color: isSelected ? 'white'
                          : f.estado === 'finalizada' ? '#3b82f6'
                          : f.estado === 'en_curso' ? '#059669'
                          : mutedColor,
                        boxShadow: isSelected ? `0 2px 10px ${chipAccent}55` : 'none',
                        border: isSelected ? 'none'
                          : f.estado === 'finalizada' ? '1px solid #bfdbfe'
                          : f.estado === 'en_curso' ? '1px solid #a7f3d0'
                          : `1px solid ${dm ? '#334155' : '#e2e8f0'}`,
                        transition:'all 0.15s',
                      }}>
                      {chipLabel}
                    </button>
                  )
                })}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                {fechaActual?.es_ajuste ? (
                  <>
                    {fechaActual.estado !== 'finalizada' && (
                      <button
                        onClick={handleProgramarReajuste}
                        disabled={programando}
                        style={{
                          background: programando ? '#e2e8f0' : 'linear-gradient(135deg,#7c3aed,#6366f1)',
                          color: programando ? hint : 'white', border:'none', borderRadius:10,
                          padding:'7px 16px', fontSize:12, fontWeight:700, cursor: programando ? 'default' : 'pointer',
                          boxShadow: programando ? 'none' : '0 3px 10px rgba(124,58,237,0.4)',
                        }}>
                        ⚡ {programando ? 'Programando...' : 'Programar Reajuste'}
                      </button>
                    )}
                    {fechaSeleccionada && fechaActual.estado !== 'finalizada' && (
                      <button
                        onClick={() => handleTerminarFecha(fechaSeleccionada)}
                        disabled={programando}
                        style={{
                          background: programando ? '#e2e8f0' : 'linear-gradient(135deg,#dc2626,#ef4444)',
                          color: programando ? hint : 'white', border:'none', borderRadius:10,
                          padding:'7px 16px', fontSize:12, fontWeight:700, cursor: programando ? 'default' : 'pointer',
                          boxShadow: programando ? 'none' : '0 3px 10px rgba(220,38,38,0.4)',
                        }}>
                        🏁 {programando ? 'Terminando...' : 'Terminar Liga'}
                      </button>
                    )}
                    {fechaActual.estado === 'finalizada' && (
                      <button
                        onClick={() => setPodioAbierto(true)}
                        style={{
                          background:'linear-gradient(135deg,#f59e0b,#f97316)',
                          color:'white', border:'none', borderRadius:10,
                          padding:'7px 16px', fontSize:12, fontWeight:700, cursor:'pointer',
                          boxShadow:'0 3px 10px rgba(245,158,11,0.4)',
                        }}>
                        🏆 Ver Podio
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleGenerarProgramacion}
                      disabled={programando}
                      style={{
                        background: programando ? '#e2e8f0' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                        color: programando ? hint : 'white', border:'none', borderRadius:10,
                        padding:'7px 16px', fontSize:12, fontWeight:700, cursor: programando ? 'default' : 'pointer',
                        boxShadow: programando ? 'none' : '0 3px 10px rgba(99,102,241,0.4)',
                      }}>
                      📅 {programando ? 'Programando...' : 'Programar fecha'}
                    </button>
                    {fechaSeleccionada && fechaActual?.estado !== 'finalizada' && (
                      <button
                        onClick={() => handleTerminarFecha(fechaSeleccionada)}
                        disabled={programando}
                        style={{
                          background: programando ? '#e2e8f0' : 'linear-gradient(135deg,#dc2626,#ef4444)',
                          color: programando ? hint : 'white', border:'none', borderRadius:10,
                          padding:'7px 16px', fontSize:12, fontWeight:700, cursor: programando ? 'default' : 'pointer',
                          boxShadow: programando ? 'none' : '0 3px 10px rgba(220,38,38,0.4)',
                        }}>
                        🏁 Terminar Fecha
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Stats de fecha terminada (punto 15) */}
            {fechaActual?.estado === 'finalizada' && (
              <div style={{
                display:'flex', gap:10, marginBottom:14, flexWrap:'wrap',
                background: dm ? 'rgba(99,102,241,0.12)' : 'linear-gradient(135deg,#eef2ff,#f5f3ff)',
                borderRadius:12, padding:'12px 16px',
                border:`1px solid ${dm ? '#4338ca55' : '#c7d2fe'}`,
              }}>
                <div style={{ fontSize:12, color:'#4338ca', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:16 }}>✅</span> Fecha {fechaActual.es_ajuste ? 'de ajuste' : `${fechas.find(f => f.id === fechaSeleccionada)?.numero ?? ''}`} finalizada
                </div>
                <div style={{ marginLeft:'auto', fontSize:11, color:'#6366f1', fontWeight:600 }}>
                  {fechas.filter(f => f.estado === 'finalizada').length} / {fechas.length} fechas completadas
                </div>
              </div>
            )}

            {fechaSeleccionada ? (
              <TableroFecha key={`${fechaSeleccionada}-${programacionKey}`} fechaId={fechaSeleccionada} divisionId={division.id} ligaId={ligaId} />
            ) : (
              <div style={{ fontSize:13, color: hint }}>Sin fechas disponibles. Usa &quot;Programar fecha&quot; para asignar partidos a fechas.</div>
            )}
          </div>}

          {/* ── Tab Ranking ───────────────────────────────────────────────── */}
          {subTab === 'ranking' && <div className="liga-fade">
            <RankingDivision divisionId={division.id} nombreDivision={division.nombre} />
          </div>}
        </div>
      )}

      {/* ── Modal confirmación de diff ─────────────────────────────────────── */}
      {diffAbierto && diffData && pendingDivision && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:440, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:16, fontWeight:600, color: text, marginBottom:6 }}>Cambios en {pendingDivision.nombre}</div>
            <div style={{ fontSize:12, color: muted, marginBottom:18 }}>
              Revisá qué va a cambiar antes de confirmar. Los partidos ya jugados no se tocan.
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
              {diffData.jugadoresAgregados.length > 0 && (
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'10px 14px' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#16a34a', marginBottom:4 }}>
                    + {diffData.jugadoresAgregados.length} jugador{diffData.jugadoresAgregados.length !== 1 ? 'es' : ''} agregado{diffData.jugadoresAgregados.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize:12, color: muted }}>{diffData.jugadoresAgregados.map(id => nombrePorId[id] ?? id).join(', ')}</div>
                </div>
              )}
              {diffData.jugadoresRemovidos.length > 0 && (
                <div style={{ background:'#fff1f2', border:'1px solid #fecdd3', borderRadius:10, padding:'10px 14px' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#e11d48', marginBottom:4 }}>
                    − {diffData.jugadoresRemovidos.length} jugador{diffData.jugadoresRemovidos.length !== 1 ? 'es' : ''} removido{diffData.jugadoresRemovidos.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize:12, color: muted }}>{diffData.jugadoresRemovidos.map(id => nombrePorId[id] ?? id).join(', ')}</div>
                </div>
              )}
              {diffData.partidosNuevos.length > 0 && (
                <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#1d4ed8' }}>
                  {diffData.partidosNuevos.length} partido{diffData.partidosNuevos.length !== 1 ? 's' : ''} nuevo{diffData.partidosNuevos.length !== 1 ? 's' : ''} se crearán (sin fecha asignada)
                </div>
              )}
              {diffData.partidosAAnular.length > 0 && (
                <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#c2410c' }}>
                  {diffData.partidosAAnular.length} partido{diffData.partidosAAnular.length !== 1 ? 's' : ''} sin jugar {diffData.partidosAAnular.length !== 1 ? 'serán anulados' : 'será anulado'}
                </div>
              )}
              {diffData.partidosPreservados.length > 0 && (
                <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', fontSize:12, color: muted }}>
                  {diffData.partidosPreservados.length} partido{diffData.partidosPreservados.length !== 1 ? 's' : ''} ya jugado{diffData.partidosPreservados.length !== 1 ? 's' : ''} se preserva{diffData.partidosPreservados.length !== 1 ? 'n' : ''}
                </div>
              )}
              {diffData.jugadoresAgregados.length === 0 && diffData.jugadoresRemovidos.length === 0 && (
                <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', fontSize:12, color: muted }}>
                  Sin cambios en la lista de jugadores
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={() => setDiffAbierto(false)}
                style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => aplicarGuardado(pendingDivision)}
                disabled={aplicandoDiff}
                style={{ flex:1, padding:11, background:'#4f46e5', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor: aplicandoDiff ? 'default' : 'pointer', opacity: aplicandoDiff ? 0.6 : 1 }}>
                {aplicandoDiff ? 'Aplicando...' : 'Confirmar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal confirmar cierre con partidos pendientes ────────────────── */}
      {confirmPendientes && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}>
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, maxWidth:400, width:'100%', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:16, fontWeight:600, color: text, marginBottom:8 }}>Partidos sin registrar</div>
            <div style={{ fontSize:13, color: muted, marginBottom:20 }}>
              {confirmPendientes.cantidad === 1
                ? 'Hay 1 partido sin resultado en esta fecha.'
                : `Hay ${confirmPendientes.cantidad} partidos sin resultado en esta fecha.`}{' '}
              Si la terminás ahora esos partidos quedarán sin resolver y no contarán en el ranking.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={() => setConfirmPendientes(null)}
                style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>
                Volver
              </button>
              <button
                onClick={() => { const id = confirmPendientes.fechaId; setConfirmPendientes(null); handleTerminarFecha(id, true) }}
                style={{ flex:1, padding:11, background:'#dc2626', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                Terminar igual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal podio / liga finalizada ────────────────────────────────── */}
      {podioAbierto && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}
          onClick={e => { if (e.target === e.currentTarget) setPodioAbierto(false) }}>
          <div style={{ background:'#fff', borderRadius:20, padding:32, maxWidth:540, width:'100%', maxHeight:'85vh', overflow:'auto', boxShadow:'0 24px 64px rgba(15,23,42,0.3)' }}>
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ fontSize:48, lineHeight:1, marginBottom:10 }}>🏆</div>
              <div style={{ fontSize:22, fontWeight:700, color: text }}>{liga?.nombre}</div>
              <div style={{ fontSize:13, color: muted, marginTop:4 }}>Liga finalizada</div>
            </div>

            {loadingPodio ? (
              <div style={{ textAlign:'center', color: hint, fontSize:13, padding:24 }}>Calculando resultados finales...</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                {podioDivisiones.map(div => (
                  <div key={div.id}>
                    <div style={{ fontSize:11, fontWeight:600, color: muted, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>{div.nombre}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      {div.top4.length === 0 ? (
                        <div style={{ fontSize:12, color: hint, padding:'6px 0' }}>Sin resultados registrados</div>
                      ) : div.top4.map(fila => {
                        const emblema = ['🥇', '🥈', '🥉', '4°'][fila.pos - 1]
                        const bgColor = fila.pos === 1 ? '#fffbeb' : fila.pos === 3 ? '#fff7ed' : '#f8fafc'
                        const borderColor = fila.pos === 1 ? '#fde68a' : '#e2e8f0'
                        return (
                          <div key={fila.jugadorId} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background: bgColor, border:`1px solid ${borderColor}`, borderRadius:10 }}>
                            <span style={{ fontSize:20, width:28, flexShrink:0, textAlign:'center' }}>{emblema}</span>
                            <span style={{ flex:1, fontWeight:600, color: text, fontSize:14 }}>{nombrePorId[fila.jugadorId] ?? '—'}</span>
                            <span style={{ fontSize:12, color: muted, fontVariantNumeric:'tabular-nums' }}>{fila.pts} pts · {fila.pg}V</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop:24 }}>
              <button
                onClick={() => setPodioAbierto(false)}
                style={{ width:'100%', padding:12, background:'#f4f7fa', border:'none', borderRadius:8, color: muted, fontSize:14, cursor:'pointer', fontWeight:500 }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal registrar pago ───────────────────────────────────────────── */}
      {pagoModalAbierto && jugadorPagando && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:400, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:16, fontWeight:600, color: text, marginBottom:4 }}>Registrar pago</div>
            <div style={{ fontSize:13, color: muted, marginBottom:18 }}>{jugadorPagando.nombre}</div>

            {pagos[jugadorPagando.id] && (
              <div style={{ background:'#f4f7fa', borderRadius:10, padding:'10px 14px', fontSize:12, color: muted, marginBottom:16 }}>
                Pagado hasta ahora:{' '}
                <strong style={{ color: text, fontVariantNumeric:'tabular-nums' }}>
                  ${pagos[jugadorPagando.id].monto_pagado.toLocaleString('es-CL')}
                </strong>
                {' '}de{' '}
                <strong style={{ color: text, fontVariantNumeric:'tabular-nums' }}>
                  ${pagos[jugadorPagando.id].monto_total.toLocaleString('es-CL')}
                </strong>
              </div>
            )}

            <div style={{ display:'flex', gap:10, marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Monto total inscripción ($)</label>
                <input type="number" min={1} style={{ ...inputStyle, width:'100%' }}
                  placeholder="Ej: 15000" value={montoTotal} onChange={e => setMontoTotal(e.target.value)} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Abono a registrar ($)</label>
                <input type="number" min={1} style={{ ...inputStyle, width:'100%' }}
                  placeholder="Ej: 5000" value={montoAbono} onChange={e => setMontoAbono(e.target.value)} />
              </div>
            </div>

            <div style={{ display:'flex', gap:10, marginBottom:16 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Fecha</label>
                <input type="date" style={{ ...inputStyle, width:'100%' }}
                  value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Método (opcional)</label>
                <select style={{ ...inputStyle, width:'100%' }} value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                  <option value="">Sin especificar</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="debito">Débito</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize:11, color: hint, marginBottom:16 }}>
              El pago quedará registrado en Finanzas como ingreso de inscripción.
            </div>

            {pagoError && (
              <div style={{ background:'#fef2f2', color:'#dc2626', borderRadius:8, padding:'9px 12px', fontSize:12, marginBottom:14 }}>
                {pagoError}
              </div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={() => setPagoModalAbierto(false)}
                style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={handleRegistrarPago}
                disabled={registrandoPago}
                style={{ flex:1, padding:11, background:'#16a34a', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor: registrandoPago ? 'default' : 'pointer', opacity: registrandoPago ? 0.6 : 1 }}>
                {registrandoPago ? 'Registrando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>{/* /dark mode wrapper */}
    </AppLayout>
  )
}
