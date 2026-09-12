'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarResultadoPartido, editarResultadoPartido, asignarPartidoManual, desprogramarPartido, registrarWalkover } from '@/app/actions/liga'
import { actualizarEstadosJornada } from '@/app/actions/ligaJornadas'
import MarcadorSets from '@/components/torneos/MarcadorSets'
import { generarBloquesHorario, normalizarBloque, BLOQUE_INICIO, BLOQUE_FIN } from '@/lib/domain/liga'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const RESULTADOS_BO5 = ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3']

const selStyle = {
  fontSize:11, border:'1px solid #c7d2e0', borderRadius:6,
  padding:'3px 6px', color:text, background:'white', outline:'none',
} as const

interface PartidoFila {
  id: string
  estado: string
  jugadorAId: string
  jugadorBId: string
  setsA: number | null
  setsB: number | null
  ganadorId: string | null
  ordenFixture: number
  fechaNumero: number | null
  fechaId: string | null
  bloqueHorario: string | null
  divisionNombre: string
  mesaNumero: number | null
  arbitroId: string | null
  parciales: Array<[number, number]> | null
}

interface FechaLiga { id: string; numero: number; esAjuste: boolean }

export function FixtureDivision({
  divisionId,
  ligaId,
  nombres,
  porJornadas = false,
  soloFechaId,
}: {
  divisionId: string
  ligaId: string
  nombres: Record<string, string>
  /** Liga en modo jornadas: el partido muestra jornada, hora y mesa; se
   *  programa desde la pantalla de jornadas, no fila por fila. */
  porJornadas?: boolean
  /** Mostrar solo los partidos de esta jornada ('sin' = los que no tienen). */
  soloFechaId?: string | 'sin'
}) {
  const [partidos, setPartidos] = useState<PartidoFila[]>([])
  const [fechasLiga, setFechasLiga] = useState<FechaLiga[]>([])
  const [bloques, setBloques] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [resultados, setResultados] = useState<Record<string, string>>({})
  const [selFecha, setSelFecha] = useState<Record<string, string>>({})
  const [selBloque, setSelBloque] = useState<Record<string, string>>({})
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [asignandoId, setAsignandoId] = useState<string | null>(null)
  const [desprogramandoId, setDesprogramandoId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Modal de edición de resultado
  const [editando, setEditando] = useState<PartidoFila | null>(null)
  const [editRes, setEditRes] = useState('3-0')
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  // Modo jornadas: el resultado se carga set a set (los puntos desempatan el
  // ranking). `marcando` es el partido con la planilla abierta.
  const [marcando, setMarcando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const db = supabase as any
    const [{ data: ligaInfo }, { data: fechasData }, { data: rawPartidos }, { data: divisionData }] = await Promise.all([
      (supabase as any).from('ligas').select('bloque_minutos, hora_inicio, hora_fin').eq('id', ligaId).single(),
      supabase.from('liga_fechas').select('id, numero, es_ajuste').eq('liga_id', ligaId).order('numero'),
      db.from('liga_partidos')
        .select('id, estado, jugador_a_id, jugador_b_id, sets_a, sets_b, ganador_id, orden_fixture, fecha_id, bloque_horario, arbitro_id, parciales, liga_fechas(numero), liga_divisiones(nombre), liga_mesas(numero)')
        .eq('division_id', divisionId)
        .is('deleted_at', null)
        .order('orden_fixture', { ascending: true }),
      supabase.from('liga_divisiones').select('nombre').eq('id', divisionId).single(),
    ])

    const bmin: number = ligaInfo?.bloque_minutos ?? 30
    setBloques(generarBloquesHorario(ligaInfo?.hora_inicio ?? BLOQUE_INICIO, ligaInfo?.hora_fin ?? BLOQUE_FIN, bmin))
    setFechasLiga((fechasData || []).map((f: any) => ({ id: f.id, numero: f.numero, esAjuste: f.es_ajuste })))

    const divNombre = divisionData?.nombre ?? ''
    const lista: PartidoFila[] = (rawPartidos || []).map((p: any) => {
      const f = Array.isArray(p.liga_fechas) ? p.liga_fechas[0] : p.liga_fechas
      const m = Array.isArray(p.liga_mesas) ? p.liga_mesas[0] : p.liga_mesas
      return {
        id: p.id,
        estado: p.estado,
        jugadorAId: p.jugador_a_id,
        jugadorBId: p.jugador_b_id,
        setsA: p.sets_a,
        setsB: p.sets_b,
        ganadorId: p.ganador_id ?? null,
        ordenFixture: p.orden_fixture,
        fechaNumero: f?.numero ?? null,
        fechaId: p.fecha_id ?? null,
        bloqueHorario: normalizarBloque(p.bloque_horario),
        divisionNombre: divNombre,
        mesaNumero: m?.numero ?? null,
        arbitroId: p.arbitro_id ?? null,
        parciales: Array.isArray(p.parciales) ? p.parciales : null,
      }
    })
    setPartidos(lista)

    const initFecha: Record<string, string> = {}
    const initBloque: Record<string, string> = {}
    for (const p of lista) {
      if (p.fechaId) initFecha[p.id] = p.fechaId
      if (p.bloqueHorario) initBloque[p.id] = p.bloqueHorario
    }
    setSelFecha(initFecha)
    setSelBloque(initBloque)
    setLoading(false)
  }, [divisionId, ligaId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void cargar() }, 0)
    return () => window.clearTimeout(timer)
  }, [cargar])

  async function handleGuardar(partido: PartidoFila) {
    const val = resultados[partido.id]
    if (!val) return
    setGuardandoId(partido.id)
    // "wo:A" / "wo:B" es no presentación (solo en modo jornadas); lo demás, sets.
    let res: { error?: string }
    if (val.startsWith('wo:')) {
      res = await registrarWalkover({ partidoId: partido.id, ganadorId: val === 'wo:A' ? partido.jugadorAId : partido.jugadorBId })
    } else {
      const [sA, sB] = val.split('-').map(Number)
      res = await registrarResultadoPartido({ partidoId: partido.id, setsA: sA, setsB: sB })
    }
    if (!res.error && porJornadas) {
      const est = await actualizarEstadosJornada({ partidoId: partido.id })
      if (est.error) res = est
    }
    setGuardandoId(null)
    if (res.error) { setErrorMsg(res.error); return }
    setResultados(prev => { const n = { ...prev }; delete n[partido.id]; return n })
    cargar()
  }

  async function guardarConParciales(partido: PartidoFila, parciales: Array<[number, number]>) {
    setGuardandoId(partido.id)
    setErrorMsg('')
    const setsA = parciales.filter(([a, b]) => a > b).length
    const setsB = parciales.length - setsA
    const jugado = partido.estado === 'finalizado' || partido.estado === 'walkover'
    let res: { error?: string } = jugado
      ? await editarResultadoPartido({ partidoId: partido.id, setsA, setsB, parciales })
      : await registrarResultadoPartido({ partidoId: partido.id, setsA, setsB, parciales })
    if (!res.error) {
      const est = await actualizarEstadosJornada({ partidoId: partido.id })
      if (est.error) res = est
    }
    setGuardandoId(null)
    if (res.error) { setErrorMsg(res.error); return }
    setMarcando(null)
    cargar()
  }

  async function guardarWalkover(partido: PartidoFila, ganadorId: string) {
    if (!confirm(`¿${nombres[ganadorId] ?? 'Este jugador'} gana por W.O. (el rival no se presentó)?`)) return
    setGuardandoId(partido.id)
    setErrorMsg('')
    let res: { error?: string } = await registrarWalkover({ partidoId: partido.id, ganadorId })
    if (!res.error) {
      const est = await actualizarEstadosJornada({ partidoId: partido.id })
      if (est.error) res = est
    }
    setGuardandoId(null)
    if (res.error) { setErrorMsg(res.error); return }
    setMarcando(null)
    cargar()
  }

  async function handleAsignar(partido: PartidoFila) {
    const fId = selFecha[partido.id]
    const bloque = selBloque[partido.id]
    if (!fId || !bloque) return
    setAsignandoId(partido.id)
    setErrorMsg('')
    const res = await asignarPartidoManual({ partidoId: partido.id, fechaId: fId, bloqueHorario: bloque })
    setAsignandoId(null)
    if (res.error) { setErrorMsg(res.error); return }
    cargar()
  }

  async function handleDesprogramar(partido: PartidoFila) {
    setDesprogramandoId(partido.id)
    setErrorMsg('')
    const res = await desprogramarPartido({ partidoId: partido.id })
    setDesprogramandoId(null)
    if (res.error) { setErrorMsg(res.error); return }
    cargar()
  }

  function abrirEdicion(partido: PartidoFila) {
    const resActual = (partido.setsA !== null && partido.setsB !== null)
      ? `${partido.setsA}-${partido.setsB}`
      : '3-0'
    setEditRes(resActual)
    setEditando(partido)
  }

  async function handleEditarResultado() {
    if (!editando) return
    const snap = { ...editando }
    const [sA, sB] = editRes.split('-').map(Number)

    // Optimistic: actualizar inmediatamente
    setEditando(null)
    setPartidos(prev => prev.map(p =>
      p.id === snap.id
        ? { ...p, estado: 'finalizado', setsA: sA, setsB: sB, ganadorId: sA > sB ? p.jugadorAId : p.jugadorBId }
        : p,
    ))

    setGuardandoEdit(true)
    const res = await editarResultadoPartido({ partidoId: snap.id, setsA: sA, setsB: sB })
    setGuardandoEdit(false)

    if (res.error) {
      setErrorMsg(res.error)
      setPartidos(prev => prev.map(p => p.id === snap.id ? snap : p))
    }
  }

  if (loading) return (
    <div style={{ padding:'16px 0', textAlign:'center', fontSize:12, color:hint }}>Cargando fixture...</div>
  )
  if (!partidos.length) return (
    <div style={{ fontSize:12, color:hint, marginTop:14 }}>Sin partidos en esta división. Generá el fixture primero.</div>
  )

  const visibles = soloFechaId === undefined
    ? partidos
    : partidos.filter(p => (soloFechaId === 'sin' ? !p.fechaId : p.fechaId === soloFechaId))
      .sort((a, b) => (a.bloqueHorario ?? '').localeCompare(b.bloqueHorario ?? '') || (a.mesaNumero ?? 0) - (b.mesaNumero ?? 0))
  const jugados = visibles.filter(p => p.estado === 'finalizado' || p.estado === 'walkover').length
  const progPct = visibles.length > 0 ? Math.round((jugados / visibles.length) * 100) : 0
  const titulo = soloFechaId === undefined
    ? `Calendario completo — ${partidos.length} partidos`
    : soloFechaId === 'sin' ? `Sin programar todavía — ${visibles.length} partidos` : `${visibles.length} partidos en esta jornada`

  return (
    <div style={{ marginTop:20, borderTop:'1px solid #e2e8f0', paddingTop:16 }}>
      {/* Error pill */}
      {errorMsg && (
        <div
          onClick={() => setErrorMsg('')}
          style={{
            background:'#fff1f2', color:'#e11d48',
            borderRadius:99, padding:'7px 14px',
            fontSize:12, marginBottom:12, cursor:'pointer',
            display:'inline-flex', alignItems:'center', gap:6,
            border:'1px solid #fecdd3', fontWeight:500,
          }}
        >
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Header con barra de progreso */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:7 }}>
          <div style={{ fontSize:12, fontWeight:700, color:muted }}>
            {titulo}
          </div>
          <div style={{
            fontSize:12, fontWeight:700,
            color: jugados === visibles.length ? '#059669' : muted,
          }}>
            {jugados} / {visibles.length} jugados
          </div>
        </div>
        <div style={{ height:6, background:'#e2e8f0', borderRadius:99, overflow:'hidden' }}>
          <div style={{
            height:'100%',
            width:`${progPct}%`,
            background:'linear-gradient(90deg,#6366f1,#10b981)',
            borderRadius:99,
            transition:'width 0.4s ease',
          }} />
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {visibles.length === 0 && (
          <div style={{ fontSize:12, color:hint, padding:'10px 0' }}>Nada por acá.</div>
        )}
        {visibles.map(p => {
          const jugado = p.estado === 'finalizado' || p.estado === 'walkover'
          const esWalkover = p.estado === 'walkover'
          const nombreA = nombres[p.jugadorAId] ?? '—'
          const nombreB = nombres[p.jugadorBId] ?? '—'
          const ganadorNombre = p.ganadorId ? (nombres[p.ganadorId] ?? '').split(' ')[0] : null
          const resStr = jugado && p.setsA !== null && p.setsB !== null
            ? `${p.setsA}–${p.setsB}${porJornadas && p.parciales ? ` (${p.parciales.map(([a, b]) => `${a}-${b}`).join(', ')})` : ''}`
            : p.estado === 'walkover' ? 'W/O' : null
          const fSelActual = selFecha[p.id] ?? ''
          const bSelActual = selBloque[p.id] ?? ''

          const borderColor = jugado
            ? esWalkover ? '#f59e0b' : '#10b981'
            : '#e2e8f0'
          const cardBg = jugado
            ? esWalkover ? '#fffbeb' : '#f0fdf4'
            : '#ffffff'

          return (
            <div
              key={p.id}
              style={{
                borderRadius:10,
                background: cardBg,
                border:`1px solid ${borderColor}`,
                borderLeft:`4px solid ${borderColor}`,
                overflow:'hidden',
                fontSize:12,
              }}
            >
              {/* Fila principal */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px' }}>
                {/* Chip de fecha */}
                <span style={{
                  flexShrink:0,
                  background: p.fechaId ? '#6366f1' : '#94a3b8',
                  color:'white',
                  borderRadius:99, padding:'2px 9px',
                  fontSize:10, fontWeight:700,
                  whiteSpace:'nowrap', letterSpacing:'0.3px',
                }}>
                  {p.fechaNumero != null
                    ? `${porJornadas ? 'J' : 'F'}${p.fechaNumero}${p.bloqueHorario ? ` · ${p.bloqueHorario}` : ''}${porJornadas && p.mesaNumero ? ` · mesa ${p.mesaNumero}` : ''}`
                    : porJornadas ? 'Sin programar' : 'Sin fecha'}
                </span>

                {/* Jugadores */}
                <span style={{ flex:1, color:text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  <span style={{ fontWeight: p.ganadorId === p.jugadorAId ? 700 : 400 }}>{nombreA}</span>
                  <span style={{ color:hint, margin:'0 6px' }}>vs</span>
                  <span style={{ fontWeight: p.ganadorId === p.jugadorBId ? 700 : 400 }}>{nombreB}</span>
                  {porJornadas && p.arbitroId && !jugado && (
                    <span style={{ color:hint, marginLeft:8, fontSize:11 }}>· árbitro {nombres[p.arbitroId] ?? ''}</span>
                  )}
                </span>

                {/* Resultado o selector */}
                {jugado ? (
                  <button
                    onClick={() => porJornadas ? setMarcando(m => (m === p.id ? null : p.id)) : abrirEdicion(p)}
                    title="Clic para ver / editar resultado"
                    style={{
                      flexShrink:0, fontWeight:700,
                      background:'#dcfce7', color:'#15803d',
                      border:'1px solid #86efac',
                      borderRadius:8, cursor:'pointer',
                      padding:'4px 10px', fontSize:12,
                      display:'flex', alignItems:'center', gap:5,
                    }}
                  >
                    <span>{resStr}{ganadorNombre ? ` (${ganadorNombre})` : ''}</span>
                    <span style={{ fontSize:10, color:'#4ade80' }}>✎</span>
                  </button>
                ) : porJornadas ? (
                  <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
                    <button
                      onClick={() => setMarcando(m => (m === p.id ? null : p.id))}
                      style={{ background: marcando === p.id ? '#e0e7ff' : '#4f46e5', color: marcando === p.id ? '#3730a3' : 'white', border:'none', borderRadius:6, padding:'4px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}
                    >
                      {marcando === p.id ? 'Cerrar' : '📝 Marcar'}
                    </button>
                    <button onClick={() => guardarWalkover(p, p.jugadorAId)} disabled={guardandoId === p.id} title={`W.O.: gana ${nombreA}`}
                      style={{ background:'#fffbeb', color:'#92400e', border:'1px solid #fde68a', borderRadius:6, padding:'4px 8px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                      W.O. ← {nombreA.split(' ')[0]}
                    </button>
                    <button onClick={() => guardarWalkover(p, p.jugadorBId)} disabled={guardandoId === p.id} title={`W.O.: gana ${nombreB}`}
                      style={{ background:'#fffbeb', color:'#92400e', border:'1px solid #fde68a', borderRadius:6, padding:'4px 8px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                      W.O. → {nombreB.split(' ')[0]}
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
                    <select
                      value={resultados[p.id] ?? ''}
                      onChange={e => setResultados(prev => ({ ...prev, [p.id]: e.target.value }))}
                      style={selStyle}
                    >
                      <option value="">— resultado —</option>
                      {RESULTADOS_BO5.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                      onClick={() => handleGuardar(p)}
                      disabled={!resultados[p.id] || guardandoId === p.id}
                      style={{
                        background: resultados[p.id] ? '#10b981' : '#e2e8f0',
                        color: resultados[p.id] ? 'white' : hint,
                        border:'none', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700,
                        cursor: resultados[p.id] ? 'pointer' : 'default',
                      }}
                    >
                      {guardandoId === p.id ? '...' : '✓ OK'}
                    </button>
                  </div>
                )}
              </div>

              {porJornadas && marcando === p.id && (
                <div style={{ padding:'0 12px 10px' }}>
                  <MarcadorSets
                    key={`${p.id}-${p.setsA ?? ''}-${p.setsB ?? ''}`}
                    nombreA={nombreA}
                    nombreB={nombreB}
                    formato="bo5"
                    guardando={guardandoId === p.id}
                    onCancelar={() => setMarcando(null)}
                    onListo={parciales => guardarConParciales(p, parciales)}
                  />
                </div>
              )}

              {/* Sub-fila de programación (solo partidos no jugados, modo mesa_unica) */}
              {!jugado && !porJornadas && (
                <div style={{
                  display:'flex', gap:5, padding:'6px 12px 9px',
                  alignItems:'center', flexWrap:'wrap',
                  borderTop:'1px solid #f1f5f9',
                }}>
                  <select
                    value={fSelActual}
                    onChange={e => { setSelFecha(prev => ({ ...prev, [p.id]: e.target.value })); setSelBloque(prev => ({ ...prev, [p.id]: '' })) }}
                    style={{ ...selStyle, minWidth:100 }}
                  >
                    <option value="">— fecha —</option>
                    {fechasLiga.map(f => (
                      <option key={f.id} value={f.id}>
                        Fecha {f.numero}{f.esAjuste ? ' (ajuste)' : ''}
                      </option>
                    ))}
                  </select>

                  <select
                    value={bSelActual}
                    onChange={e => setSelBloque(prev => ({ ...prev, [p.id]: e.target.value }))}
                    disabled={!fSelActual}
                    style={{ ...selStyle, minWidth:80, opacity: fSelActual ? 1 : 0.5 }}
                  >
                    <option value="">— hora —</option>
                    {bloques.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>

                  <button
                    onClick={() => handleAsignar(p)}
                    disabled={!fSelActual || !bSelActual || asignandoId === p.id}
                    style={{
                      background: fSelActual && bSelActual ? '#6366f1' : '#e2e8f0',
                      color: fSelActual && bSelActual ? 'white' : hint,
                      border:'none', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:600,
                      cursor: fSelActual && bSelActual ? 'pointer' : 'default',
                    }}
                  >
                    {asignandoId === p.id ? '...' : '📅 Asignar'}
                  </button>

                  {p.fechaId && (
                    <button
                      onClick={() => handleDesprogramar(p)}
                      disabled={desprogramandoId === p.id}
                      style={{
                        background:'transparent', border:'1px solid #fecaca',
                        borderRadius:6, padding:'4px 10px', fontSize:11,
                        color:'#dc2626', cursor:'pointer', fontWeight:500,
                      }}
                    >
                      {desprogramandoId === p.id ? '...' : '× Desprogramar'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal editar resultado */}
      {editando && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}
          onClick={e => { if (e.target === e.currentTarget) setEditando(null) }}
        >
          <div style={{
            background:'#fff', borderRadius:18,
            width:'100%', maxWidth:400,
            boxShadow:'0 16px 48px rgba(15,23,42,0.22)',
            overflow:'hidden',
          }}>
            {/* Header con gradiente */}
            <div style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)', padding:'20px 24px 18px' }}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginBottom:4 }}>
                {editando.divisionNombre}
                {editando.fechaNumero != null && (
                  <span> · F{editando.fechaNumero}{editando.bloqueHorario ? ` · ${editando.bloqueHorario}` : ''}</span>
                )}
              </div>
              <div style={{ fontSize:16, fontWeight:700, color:'white', marginBottom:8 }}>
                ✏️ Editar resultado
              </div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.9)', fontWeight:600 }}>
                {nombres[editando.jugadorAId] ?? '—'}
                <span style={{ opacity:0.55, fontWeight:400, margin:'0 8px' }}>vs</span>
                {nombres[editando.jugadorBId] ?? '—'}
              </div>
            </div>

            <div style={{ padding:'20px 24px' }}>
              {/* Resultado actual */}
              <div style={{ background:'#f8fafc', borderRadius:10, padding:'10px 14px', fontSize:12, color:muted, marginBottom:18 }}>
                Resultado actual:{' '}
                <strong style={{ color:text }}>
                  {editando.estado === 'walkover'
                    ? `Walkover → gana ${editando.ganadorId ? (nombres[editando.ganadorId] ?? '—') : '—'}`
                    : editando.setsA !== null
                    ? `${editando.setsA}–${editando.setsB} (gana ${editando.ganadorId ? (nombres[editando.ganadorId] ?? '—') : '—'})`
                    : 'Sin resultado'}
                </strong>
              </div>

              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, color:muted, display:'block', marginBottom:6 }}>Nuevo resultado</label>
                <select
                  value={editRes}
                  onChange={e => setEditRes(e.target.value)}
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color:text, fontSize:14, outline:'none' }}
                >
                  {RESULTADOS_BO5.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <div style={{ fontSize:11, color:hint, marginTop:6 }}>
                  {(() => {
                    const [sA, sB] = editRes.split('-').map(Number)
                    const ganId = sA > sB ? editando.jugadorAId : editando.jugadorBId
                    return `Gana: ${nombres[ganId] ?? '—'}`
                  })()}
                </div>
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button
                  onClick={() => setEditando(null)}
                  style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color:muted, fontSize:14, cursor:'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEditarResultado}
                  disabled={guardandoEdit}
                  style={{
                    flex:1, padding:11,
                    background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
                    border:'none', borderRadius:8, color:'white',
                    fontSize:14, fontWeight:600, cursor:'pointer',
                    opacity: guardandoEdit ? 0.6 : 1,
                  }}
                >
                  {guardandoEdit ? 'Guardando...' : 'Guardar cambio'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
