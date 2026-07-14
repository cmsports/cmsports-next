'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import {
  crearDivision,
  asignarJugadoresDivision, calcularDiffFixtureDivision,
  generarFixtureDivisionAction, generarProgramacionLiga, limpiarProgramacionLiga,
  iniciarFecha, crearJugadorExternoLiga,
} from '@/app/actions/liga'
import { registrarPagoLiga } from '@/app/actions/liga-pagos'
import { TableroFecha } from '@/components/liga/TableroFecha'
import { RankingDivision } from '@/components/liga/RankingDivision'
import { FixtureDivision } from '@/components/liga/FixtureDivision'
import type { DiffDivision } from '@/lib/domain/liga'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const inputStyle = { background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' } as const

interface Division { id: string; nombre: string; orden: number; fixture_generado: boolean; capacidad_max: number | null }
interface Fecha { id: string; numero: number; es_ajuste: boolean; estado: string }
interface Jugador { id: string; nombre: string; es_externo: boolean | null }
interface PagoResumen { id: string; monto_total: number; monto_pagado: number; estado: string }

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
  const [diffAbierto, setDiffAbierto] = useState(false)
  const [diffData, setDiffData] = useState<DiffDivision | null>(null)
  const [pendingDivision, setPendingDivision] = useState<Division | null>(null)
  const [aplicandoDiff, setAplicandoDiff] = useState(false)

  const [pagoModalAbierto, setPagoModalAbierto] = useState(false)
  const [jugadorPagando, setJugadorPagando] = useState<Jugador | null>(null)
  const [montoTotal, setMontoTotal] = useState('')
  const [montoAbono, setMontoAbono] = useState('')
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0])
  const [metodoPago, setMetodoPago] = useState('')
  const [registrandoPago, setRegistrandoPago] = useState(false)

  const cargar = useCallback(async () => {
    const { data: ligaData } = await (supabase as any).from('ligas').select('nombre, club_id, monto_inscripcion_default').eq('id', ligaId).single()
    if (!ligaData) { setLoading(false); return }

    setLiga({ nombre: ligaData.nombre, montoInscripcionDefault: ligaData.monto_inscripcion_default ?? null })

    const [{ data: divs }, { data: fch }, { data: jugs }, { data: dj }] = await Promise.all([
      supabase.from('liga_divisiones').select('id, nombre, orden, fixture_generado, capacidad_max').eq('liga_id', ligaId).order('orden'),
      supabase.from('liga_fechas').select('id, numero, es_ajuste, estado').eq('liga_id', ligaId).order('numero'),
      supabase.from('jugadores').select('id, nombre, es_externo').eq('club_id', ligaData.club_id).eq('estado', 'activo').order('nombre'),
      supabase.from('liga_division_jugadores').select('division_id, jugador_id'),
    ])
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

  async function handleCrearDivision() {
    if (!nombreDivision.trim()) return
    const res = await crearDivision({ ligaId, nombre: nombreDivision, orden: divisiones.length })
    if (res.error) { setMensaje(res.error); return }
    setNombreDivision('')
    setFormNuevaDivision(false)
    cargar()
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
    setMensaje(`${ids.length} jugadores registrados · ${fixtureRes.totalPartidos} partidos en el fixture`)
    cargar()
  }

  async function aplicarGuardado(division: Division) {
    const ids = divisionJugadores[division.id] || []
    setAplicandoDiff(true)
    const res = await asignarJugadoresDivision({ divisionId: division.id, jugadorIds: ids })
    setAplicandoDiff(false)
    if (res.error) { setMensaje(res.error); return }
    const partes = []
    if (res.jugadoresAgregados) partes.push(`${res.jugadoresAgregados} jugadores agregados`)
    if (res.jugadoresRemovidos) partes.push(`${res.jugadoresRemovidos} removidos`)
    if (res.partidosCreados) partes.push(`${res.partidosCreados} partidos nuevos`)
    if (res.partidosAnulados) partes.push(`${res.partidosAnulados} partidos anulados`)
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
    cargar()
  }

  async function handleLimpiarYReprogramar() {
    setProgramando(true)
    const limpRes = await limpiarProgramacionLiga({ ligaId })
    if (limpRes.error) { setMensaje(limpRes.error); setProgramando(false); return }
    const progRes = await generarProgramacionLiga({ ligaId })
    setProgramando(false)
    if (progRes.error) { setMensaje(progRes.error); return }
    const extra = (progRes.totalSinProgramar ?? 0) > 0 ? ` · ${progRes.totalSinProgramar} sin programar` : ''
    setMensaje(`Reprogramación completa: ${progRes.totalProgramados ?? 0} partidos asignados${extra}`)
    cargar()
  }

  async function handleIniciarFecha(fechaId: string) {
    const res = await iniciarFecha({ fechaId })
    if (res.error) { setMensaje(res.error); return }
    cargar()
  }

  function abrirPagoModal(jugador: Jugador) {
    setJugadorPagando(jugador)
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
    if (!mt || mt <= 0) { setMensaje('El monto total debe ser mayor a cero'); return }
    if (!ma || ma <= 0) { setMensaje('El monto del abono debe ser mayor a cero'); return }
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
    if (res.error) { setMensaje(res.error); return }
    setPagoModalAbierto(false)
    await cargarPagos(divisionActiva)
    setMensaje(`Pago registrado — ${jugadorPagando.nombre}: $${ma.toLocaleString('es-CL')}`)
  }

  if (authLoading || loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )
  if (!liga) return <AppLayout perfil={perfil}><div style={{ padding:24, color: muted, fontSize:13 }}>Liga no encontrada</div></AppLayout>

  const division = divisiones.find(d => d.id === divisionActiva) || null
  const jugadoresDeDivision = division ? (divisionJugadores[division.id] || []) : []
  const nombrePorId = Object.fromEntries(jugadoresClub.map(j => [j.id, j.nombre]))
  const fechaActual = fechas.find(f => f.id === fechaSeleccionada) || null

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:18 }}>{liga.nombre}</h1>

      {mensaje && (
        <div style={{ background:'#ede9fe', color:'#3730a3', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:18, cursor:'pointer' }} onClick={() => setMensaje('')}>
          {mensaje}
        </div>
      )}

      {/* Selector de división con "+" inline */}
      <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap', alignItems:'center' }}>
        {divisiones.map(d => (
          <button key={d.id} onClick={() => setDivisionActiva(d.id)}
            style={{
              padding:'8px 16px', borderRadius:8, border:'1px solid #e2e8f0', cursor:'pointer', fontSize:13, fontWeight:600,
              background: divisionActiva === d.id ? '#3730a3' : '#ffffff',
              color: divisionActiva === d.id ? '#ffffff' : muted,
            }}>
            {d.nombre}
          </button>
        ))}
        {!formNuevaDivision ? (
          <button
            onClick={() => setFormNuevaDivision(true)}
            style={{ padding:'7px 12px', borderRadius:8, border:'1px dashed #c7d2e0', cursor:'pointer', fontSize:12, fontWeight:600, color:'#4f46e5', background:'transparent' }}>
            + División
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
          <div style={{ display:'flex', background:'#e2e8f0', borderRadius:10, padding:4, marginBottom:18, maxWidth:420 }}>
            {([
              { key:'jugadores', label:'Jugadores' },
              { key:'programacion', label:'Programación' },
              { key:'ranking', label:'Ranking' },
            ] as { key: SubTab; label: string }[]).map(t => (
              <div key={t.key} onClick={() => setSubTab(t.key)}
                style={{ flex:1, padding:'9px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, background: subTab===t.key?'#ffffff':'transparent', color: subTab===t.key?'#3730a3':muted, transition:'all 0.15s' }}>
                {t.label}
              </div>
            ))}
          </div>

          {/* ── Tab Jugadores ─────────────────────────────────────────────── */}
          <div style={{ display: subTab === 'jugadores' ? 'block' : 'none' }}>
            <div style={{ ...card, padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10 }}>
                <div style={{ fontSize:13, color: muted }}>
                  {jugadoresDeDivision.length}{division.capacidad_max ? ` / ${division.capacidad_max}` : ''} inscritos
                </div>
                <span style={{
                  background: division.fixture_generado ? '#f0fdf4' : '#f4f7fa',
                  color: division.fixture_generado ? '#16a34a' : muted,
                  padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:'nowrap',
                }}>
                  {division.fixture_generado ? 'Fixture generado' : 'Sin fixture'}
                </span>
              </div>

              {jugadoresDeDivision.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, color: muted, fontWeight:600, marginBottom:8 }}>Inscripción y pagos</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {jugadoresDeDivision.map(jid => {
                      const nombre = nombrePorId[jid] ?? jid
                      const pago = pagos[jid]
                      const estado = pago?.estado ?? 'pendiente'
                      const color = SEMAFORO[estado] ?? SEMAFORO.pendiente
                      const label = estado === 'pagado' ? 'Pagado' : estado === 'parcial' ? 'Parcial' : 'Pendiente'
                      return (
                        <div key={jid} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'#f4f7fa', borderRadius:8 }}>
                          <span style={{ width:9, height:9, borderRadius:'50%', background: color, flexShrink:0 }} />
                          <span style={{ flex:1, fontSize:13, color: text }}>{nombre}</span>
                          {pago && (
                            <span style={{ fontSize:11, color: muted, fontVariantNumeric:'tabular-nums' }}>
                              ${pago.monto_pagado.toLocaleString('es-CL')} / ${pago.monto_total.toLocaleString('es-CL')}
                            </span>
                          )}
                          <span style={{ background: `${color}22`, color, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600, whiteSpace:'nowrap' }}>{label}</span>
                          <button
                            onClick={() => { const j = jugadoresClub.find(x => x.id === jid); if (j) abrirPagoModal(j) }}
                            style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:6, padding:'3px 8px', fontSize:11, color:'#4f46e5', cursor:'pointer', whiteSpace:'nowrap' }}>
                            + Pago
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display:'flex', gap:12, marginTop:6, fontSize:11, color: hint }}>
                    <span>● Verde = pagado</span>
                    <span>● Amarillo = parcial</span>
                    <span>● Gris = pendiente</span>
                  </div>
                </div>
              )}

              <div style={{ fontSize:12, color: muted, fontWeight:600, marginBottom:6 }}>Editar inscriptos</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8, maxHeight:280, overflow:'auto', padding:12, background:'#f4f7fa', borderRadius:10, marginBottom:10 }}>
                {jugadoresClub.map(j => (
                  <label key={j.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color: text, cursor:'pointer' }}>
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
                    background: jugadoresDeDivision.length >= 2 ? '#4f46e5' : '#e2e8f0',
                    color: jugadoresDeDivision.length >= 2 ? 'white' : hint,
                    border:'none', borderRadius:8, padding:'9px 20px', fontSize:13, fontWeight:600,
                    cursor: aplicandoDiff || jugadoresDeDivision.length < 2 ? 'not-allowed' : 'pointer',
                    opacity: aplicandoDiff ? 0.6 : 1,
                  }}>
                  {aplicandoDiff ? 'Guardando...' : 'Registrar jugadores'}
                </button>
                {jugadoresDeDivision.length < 2 && (
                  <div style={{ fontSize:11, color: hint, marginTop:6 }}>Seleccioná al menos 2 jugadores</div>
                )}
              </div>

              <FixtureDivision key={`${division.id}-${division.fixture_generado}`} divisionId={division.id} nombres={nombrePorId} />
            </div>
          </div>

          {/* ── Tab Programación ──────────────────────────────────────────── */}
          <div style={{ display: subTab === 'programacion' ? 'block' : 'none' }}>
            {/* Barra: selector de fecha + acciones */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:12, color: muted, alignSelf:'center' }}>Fecha:</span>
                {fechas.map(f => (
                  <button key={f.id} onClick={() => setFechaSeleccionada(f.id)}
                    style={{
                      padding:'5px 12px', borderRadius:8, border:'1px solid #e2e8f0', cursor:'pointer', fontSize:12, fontWeight:600,
                      background: fechaSeleccionada === f.id ? '#ede9fe' : '#ffffff',
                      color: fechaSeleccionada === f.id ? '#3730a3' : muted,
                    }}>
                    {f.numero}{f.es_ajuste ? ' (ajuste)' : ''}
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <button
                  onClick={handleGenerarProgramacion}
                  disabled={programando}
                  style={{ background: programando ? '#e2e8f0' : '#4f46e5', color: programando ? hint : 'white', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:600, cursor: programando ? 'default' : 'pointer' }}>
                  {programando ? 'Programando...' : 'Programar fecha'}
                </button>
              </div>
            </div>

            {fechaSeleccionada ? (
              <TableroFecha fechaId={fechaSeleccionada} divisionId={division.id} />
            ) : (
              <div style={{ fontSize:13, color: hint }}>Sin fechas disponibles. Usa "Programar" para asignar partidos a fechas.</div>
            )}
          </div>

          {/* ── Tab Ranking ───────────────────────────────────────────────── */}
          <div style={{ display: subTab === 'ranking' ? 'block' : 'none' }}>
            <RankingDivision divisionId={division.id} nombreDivision={division.nombre} />
          </div>
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

            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={() => setPagoModalAbierto(false)}
                style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={handleRegistrarPago}
                disabled={registrandoPago || !montoTotal || !montoAbono}
                style={{ flex:1, padding:11, background:'#16a34a', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor: (registrandoPago || !montoTotal || !montoAbono) ? 'default' : 'pointer', opacity: (registrandoPago || !montoTotal || !montoAbono) ? 0.6 : 1 }}>
                {registrandoPago ? 'Registrando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
