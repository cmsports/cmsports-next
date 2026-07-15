'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { generarBloquesHorario, normalizarBloque, BLOQUE_INICIO, BLOQUE_FIN } from '@/lib/domain/liga'
import {
  moverPartidoLiga, iniciarFecha, registrarResultadoPartido,
  registrarWalkover, reprogramarPartidoAFecha5, cambiarArbitroPartido,
} from '@/app/actions/liga'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const RESULTADOS_BO5 = ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3']

const exportBtn = { background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap' } as const

interface PartidoBoard {
  id: string
  divisionId: string
  mesaId: string | null
  bloqueHorario: string | null
  jugadorAId: string
  jugadorBId: string
  arbitroId: string | null
  estado: string
  setsA: number | null
  setsB: number | null
  divisionNombre: string
}

interface Mesa { id: string; numero: number }

export function TableroFecha({
  fechaId,
  divisionId,
  ligaId,
}: {
  fechaId: string
  divisionId?: string
  ligaId: string
}) {
  const [fecha, setFecha] = useState<{ numero: number; estado: string; ligaId: string; ligaNombre: string } | null>(null)
  const [bloques, setBloques] = useState<string[]>(() => generarBloquesHorario())
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [partidos, setPartidos] = useState<PartidoBoard[]>([])
  const [editandoArbitroId, setEditandoArbitroId] = useState<string | null>(null)
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [jugadoresPorDivision, setJugadoresPorDivision] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [partidoResultado, setPartidoResultado] = useState<PartidoBoard | null>(null)
  const [setsA, setSetsA] = useState('3')
  const [setsB, setSetsB] = useState('0')
  const [guardandoResultado, setGuardandoResultado] = useState(false)
  const [guardandoAccion, setGuardandoAccion] = useState(false)

  const cargar = useCallback(async () => {
    const db = supabase as any

    // RT1: 5 queries en paralelo — ligaId ya conocido, no hay round-trip secuencial
    const [{ data: fechaData }, { data: mesasData }, { data: rawPartidos }, { data: divisionesData }, { data: jugadoresData }] = await Promise.all([
      supabase.from('liga_fechas').select('numero, estado, liga_id, ligas(nombre, bloque_minutos)').eq('id', fechaId).single(),
      supabase.from('liga_mesas').select('id, numero').eq('liga_id', ligaId).order('numero', { ascending: true }),
      db.from('liga_partidos').select('id, division_id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id, arbitro_id, estado, sets_a, sets_b').eq('fecha_id', fechaId).is('deleted_at', null),
      supabase.from('liga_divisiones').select('id, nombre').eq('liga_id', ligaId),
      supabase.from('jugadores').select('id, nombre'),
    ])
    if (!fechaData) { setLoading(false); return }

    const ligaRel = (Array.isArray(fechaData.ligas) ? fechaData.ligas[0] : fechaData.ligas) as Record<string, unknown> | null
    setFecha({ numero: fechaData.numero, estado: fechaData.estado, ligaId: fechaData.liga_id, ligaNombre: String(ligaRel?.nombre ?? '') })
    setBloques(generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, Number(ligaRel?.bloque_minutos ?? 30)))

    // RT2: divJug filtrado por divisiones de ESTA liga (evita mezclar jugadores de otras ligas)
    const divisionIds = (divisionesData || []).map((d: any) => d.id)
    const { data: divJugData } = divisionIds.length > 0
      ? await supabase.from('liga_division_jugadores').select('division_id, jugador_id').in('division_id', divisionIds)
      : { data: [] as any[] }

    const nombreDivisionPorId = new Map((divisionesData || []).map((d: any) => [d.id, d.nombre]))
    setMesas(mesasData || [])

    const lista: PartidoBoard[] = ((rawPartidos || []) as Array<{
      id: string; division_id: string; mesa_id: string | null; bloque_horario: string | null
      jugador_a_id: string; jugador_b_id: string; arbitro_id: string | null
      estado: string; sets_a: number | null; sets_b: number | null
    }>).map(p => ({
      id: p.id,
      divisionId: p.division_id,
      mesaId: p.mesa_id,
      bloqueHorario: normalizarBloque(p.bloque_horario),
      jugadorAId: p.jugador_a_id,
      jugadorBId: p.jugador_b_id,
      arbitroId: p.arbitro_id,
      estado: p.estado,
      setsA: p.sets_a,
      setsB: p.sets_b,
      divisionNombre: nombreDivisionPorId.get(p.division_id) ?? '',
    }))
    setPartidos(lista)

    const mapaDivJug: Record<string, string[]> = {}
    for (const row of divJugData || []) {
      mapaDivJug[row.division_id] = [...(mapaDivJug[row.division_id] || []), row.jugador_id]
    }
    setJugadoresPorDivision(mapaDivJug)

    const mapa: Record<string, string> = {}
    for (const j of jugadoresData || []) mapa[j.id] = j.nombre
    setNombres(mapa)

    setLoading(false)
  }, [fechaId, ligaId])

  useEffect(() => { cargar() }, [cargar])

  const partidosVisibles = divisionId ? partidos.filter(p => p.divisionId === divisionId) : partidos

  const mesasVisibles = divisionId
    ? mesas.filter(m => partidosVisibles.some(p => p.mesaId === m.id))
    : mesas

  function partidoEn(mesaId: string, bloque: string) {
    return partidosVisibles.find(p => p.mesaId === mesaId && p.bloqueHorario === bloque)
  }

  async function soltarEn(mesaId: string, bloque: string) {
    if (!draggingId || fecha?.estado !== 'programada') return
    const partidoId = draggingId
    setDraggingId(null)
    setError('')

    if (partidoEn(mesaId, bloque)) {
      setError('Esa mesa ya está ocupada en ese horario')
      return
    }

    const anterior = partidos.find(p => p.id === partidoId)
    if (!anterior) return

    // Optimistic update para drag & drop
    setPartidos(prev => prev.map(p => (p.id === partidoId ? { ...p, mesaId, bloqueHorario: bloque } : p)))

    const res = await moverPartidoLiga({ partidoId, fechaId, mesaId, bloqueHorario: bloque })
    if (res.error) {
      setError(res.error)
      setPartidos(prev => prev.map(p => (p.id === partidoId ? anterior : p)))
    }
  }

  async function handleIniciarFecha() {
    const res = await iniciarFecha({ fechaId })
    if (res.error) { setError(res.error); return }
    // Optimistic: fecha → en_juego (sin recargar todo)
    setFecha(prev => prev ? { ...prev, estado: 'en_juego' } : prev)
  }

  // Registrar resultado disponible independiente del estado de la fecha
  function abrirResultado(partido: PartidoBoard) {
    if (['finalizado', 'walkover'].includes(partido.estado)) return
    setPartidoResultado(partido)
    setSetsA('3')
    setSetsB('0')
  }

  async function handleGuardarResultado() {
    if (!partidoResultado) return
    const partSnap = { ...partidoResultado }
    const sA = Number(setsA), sB = Number(setsB)

    // Cierra modal y actualiza inmediatamente (optimistic)
    setPartidoResultado(null)
    setPartidos(prev => prev.map(p =>
      p.id === partSnap.id ? { ...p, estado: 'finalizado', setsA: sA, setsB: sB } : p,
    ))

    setGuardandoResultado(true)
    const res = await registrarResultadoPartido({ partidoId: partSnap.id, setsA: sA, setsB: sB })
    setGuardandoResultado(false)

    if (res.error) {
      setError(res.error)
      setPartidos(prev => prev.map(p => p.id === partSnap.id ? partSnap : p))
    }
  }

  async function handleWalkover(ganadorId: string) {
    if (!partidoResultado) return
    const partSnap = { ...partidoResultado }

    setPartidoResultado(null)
    setPartidos(prev => prev.map(p => p.id === partSnap.id ? { ...p, estado: 'walkover' } : p))

    setGuardandoAccion(true)
    const res = await registrarWalkover({ partidoId: partSnap.id, ganadorId })
    setGuardandoAccion(false)

    if (res.error) {
      setError(res.error)
      setPartidos(prev => prev.map(p => p.id === partSnap.id ? partSnap : p))
    }
  }

  async function handleReprogramar() {
    if (!partidoResultado) return
    const partSnap = { ...partidoResultado }

    // Quitar de esta fecha visualmente (se mueve a reajuste)
    setPartidoResultado(null)
    setPartidos(prev => prev.filter(p => p.id !== partSnap.id))

    setGuardandoAccion(true)
    const res = await reprogramarPartidoAFecha5({ partidoId: partSnap.id })
    setGuardandoAccion(false)

    if (res.error) {
      setError(res.error)
      setPartidos(prev => [...prev, partSnap])
    }
  }

  async function handleCambiarArbitro(partidoId: string, arbitroId: string) {
    setError('')
    const anterior = partidos.find(p => p.id === partidoId)

    // Optimistic update — sin recargar
    setPartidos(prev => prev.map(p => p.id === partidoId ? { ...p, arbitroId: arbitroId || null } : p))
    setEditandoArbitroId(null)

    const res = await cambiarArbitroPartido({ partidoId, arbitroId: arbitroId || null })
    if (res.error) {
      setError(res.error)
      if (anterior) setPartidos(prev => prev.map(p => p.id === partidoId ? anterior : p))
    }
  }

  async function exportarProgramacion(orden: 'fecha' | 'mesa') {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const W = doc.internal.pageSize.getWidth()

    doc.setFillColor(79, 70, 229)
    doc.rect(0, 0, W, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('CmSports', 14, 14)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(`${fecha?.ligaNombre} — Fecha ${fecha?.numero} — Programación por ${orden === 'fecha' ? 'horario' : 'mesa'}`, 14, 24)

    const filas = [...partidosVisibles].sort((a, b) => {
      if (orden === 'mesa') {
        const mA = mesas.find(m => m.id === a.mesaId)?.numero ?? 0
        const mB = mesas.find(m => m.id === b.mesaId)?.numero ?? 0
        if (mA !== mB) return mA - mB
      }
      return (a.bloqueHorario ?? '').localeCompare(b.bloqueHorario ?? '')
    })

    autoTable(doc, {
      startY: 42,
      head: [['Horario', 'Mesa', 'División', 'Jugador A', 'Jugador B', 'Árbitro']],
      body: filas.map(p => [
        p.bloqueHorario ?? '—',
        mesas.find(m => m.id === p.mesaId)?.numero ?? '—',
        p.divisionNombre,
        nombres[p.jugadorAId] ?? '—',
        nombres[p.jugadorBId] ?? '—',
        p.arbitroId ? nombres[p.arbitroId] ?? '—' : '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      margin: { left: 14, right: 14 },
    })

    doc.save(`liga_fecha${fecha?.numero}_por_${orden}.pdf`)
  }

  async function exportarHojasDePartido() {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const filas = [...partidosVisibles].sort((a, b) => (a.bloqueHorario ?? '').localeCompare(b.bloqueHorario ?? ''))

    filas.forEach((p, i) => {
      if (i > 0) doc.addPage()
      let y = 18
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(fecha?.ligaNombre ?? 'Liga', 14, y)
      y += 10
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      const linea = (label: string, valor: string) => { doc.text(`${label}: ${valor}`, 14, y); y += 7 }
      linea('Fecha', String(fecha?.numero ?? ''))
      linea('División', p.divisionNombre)
      linea('Mesa', String(mesas.find(m => m.id === p.mesaId)?.numero ?? '—'))
      linea('Horario', p.bloqueHorario ?? '—')
      linea('Jugador A', nombres[p.jugadorAId] ?? '—')
      linea('Jugador B', nombres[p.jugadorBId] ?? '—')
      linea('Árbitro', p.arbitroId ? nombres[p.arbitroId] ?? '—' : '—')

      y += 6
      doc.setFont('helvetica', 'bold')
      doc.text('Sets', 14, y)
      y += 8
      doc.setFont('helvetica', 'normal')
      for (let s = 1; s <= 5; s++) {
        doc.text(`Set ${s}:  ____  -  ____`, 14, y)
        y += 8
      }
      y += 4
      doc.text('Resultado final:  ____  -  ____', 14, y); y += 10
      doc.text('Ganador: ______________________________', 14, y); y += 10
      doc.text('Observaciones: ________________________________________________', 14, y)
    })

    doc.save(`liga_fecha${fecha?.numero}_hojas_de_partido.pdf`)
  }

  if (loading) return <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>Cargando...</div>
  if (!fecha) return <div style={{ padding:24, color: muted, fontSize:13 }}>Fecha no encontrada</div>

  const estLabel = fecha.estado === 'programada' ? 'Programada' : fecha.estado === 'en_juego' ? 'En juego' : 'Finalizada'
  const estColor = fecha.estado === 'en_juego' ? '#16a34a' : muted
  const estBg = fecha.estado === 'en_juego' ? '#f0fdf4' : '#f4f7fa'

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontSize:18, fontWeight:600, color: text, marginBottom:4 }}>Fecha {fecha.numero}</h2>
          <p style={{ fontSize:13, color: muted }}>
            {fecha.estado === 'programada'
              ? 'Arrastra un partido a otra mesa u horario para reprogramarlo'
              : fecha.estado === 'en_juego'
              ? 'Haz clic en un partido para registrar su resultado'
              : 'Fecha finalizada'}
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
          <span style={{ background: estBg, color: estColor, padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:600 }}>{estLabel}</span>
          <button onClick={() => exportarProgramacion('fecha')} style={exportBtn}>📄 PDF por horario</button>
          <button onClick={() => exportarProgramacion('mesa')} style={exportBtn}>📄 PDF por mesa</button>
          {fecha.estado === 'programada' && (
            <button onClick={handleIniciarFecha} style={{ background:'#16a34a', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              Iniciar Fecha
            </button>
          )}
        </div>
      </div>

      {error && (
        <div onClick={() => setError('')} style={{ background:'#fef2f2', color:'#dc2626', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:14, cursor:'pointer' }}>{error}</div>
      )}

      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                <th style={{ position:'sticky', left:0, background:'#f8fafc', padding:'10px 14px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Horario</th>
                {mesasVisibles.map(mesa => (
                  <th key={mesa.id} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', minWidth:170 }}>
                    Mesa {mesa.numero}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloques.map(bloque => (
                <tr key={bloque}>
                  <td style={{ position:'sticky', left:0, background:'#ffffff', borderBottom:'1px solid #f1f5f9', padding:'8px 14px', fontSize:12, fontWeight:600, color: text, fontFamily:'monospace' }}>
                    {bloque}
                  </td>
                  {mesasVisibles.map(mesa => {
                    const partido = partidoEn(mesa.id, bloque)
                    // Clic para resultado disponible siempre (no solo en en_juego)
                    const clickeable = partido && !['finalizado', 'walkover'].includes(partido.estado)
                    const bg = !partido ? 'transparent'
                      : partido.estado === 'finalizado' ? '#f0fdf4'
                      : partido.estado === 'walkover' ? '#fffbeb'
                      : '#f4f7fa'
                    const roster = partido ? (jugadoresPorDivision[partido.divisionId] || []) : []
                    return (
                      <td key={mesa.id} style={{ borderBottom:'1px solid #f1f5f9', borderLeft:'1px solid #f1f5f9', padding:6, verticalAlign:'top' }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => soltarEn(mesa.id, bloque)}
                      >
                        {partido ? (
                          <div
                            draggable={fecha.estado === 'programada'}
                            onDragStart={() => setDraggingId(partido.id)}
                            onDragEnd={() => setDraggingId(null)}
                            style={{
                              borderRadius:8, border:'1px solid #e2e8f0', background: bg, padding:'8px 10px',
                              cursor: fecha.estado === 'programada' ? 'grab' : clickeable ? 'pointer' : 'default',
                            }}
                          >
                            <div onClick={() => abrirResultado(partido)} style={{ fontSize:12, fontWeight:600, color: text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {nombres[partido.jugadorAId] ?? '—'} vs {nombres[partido.jugadorBId] ?? '—'}
                            </div>
                            <div style={{ fontSize:10, color: hint }}>{partido.divisionNombre}</div>
                            {fecha.estado === 'programada' && roster.length > 0 ? (
                              editandoArbitroId === partido.id ? (
                                <select
                                  autoFocus
                                  value={partido.arbitroId ?? ''}
                                  onBlur={() => setEditandoArbitroId(null)}
                                  onClick={e => e.stopPropagation()}
                                  onChange={async e => {
                                    await handleCambiarArbitro(partido.id, e.target.value)
                                  }}
                                  style={{ width:'100%', marginTop:2, fontSize:10, color: text, background:'#ffffff', border:'1px solid #4f46e5', borderRadius:4, outline:'none' }}
                                >
                                  <option value="">Sin árbitro</option>
                                  {roster.filter(id => id !== partido.jugadorAId && id !== partido.jugadorBId).map(id => (
                                    <option key={id} value={id}>{nombres[id] ?? id}</option>
                                  ))}
                                </select>
                              ) : (
                                <div
                                  onClick={e => { e.stopPropagation(); setEditandoArbitroId(partido.id) }}
                                  title="Clic para cambiar árbitro"
                                  style={{ fontSize:10, color: muted, marginTop:2, cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}
                                >
                                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                    {partido.arbitroId ? `Árb: ${nombres[partido.arbitroId] ?? '—'}` : 'Sin árbitro'}
                                  </span>
                                  <span style={{ color: hint, flexShrink:0 }}>✎</span>
                                </div>
                              )
                            ) : partido.arbitroId && (
                              <div style={{ fontSize:10, color: muted, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                Árb: {nombres[partido.arbitroId] ?? '—'}
                              </div>
                            )}
                            {partido.estado === 'finalizado' && (
                              <div style={{ fontSize:11, fontWeight:700, color:'#16a34a', marginTop:2 }}>{partido.setsA}-{partido.setsB}</div>
                            )}
                            {partido.estado === 'walkover' && (
                              <div style={{ fontSize:11, fontWeight:700, color:'#d97706', marginTop:2 }}>Walkover</div>
                            )}
                          </div>
                        ) : (
                          <div style={{ height:46, borderRadius:8, border:'1px dashed #e2e8f0' }} />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Partidos sin programar */}
      {(() => {
        const sinProgramar = partidosVisibles.filter(p => !p.mesaId || !p.bloqueHorario)
        if (!sinProgramar.length) return null
        return (
          <div style={{ marginTop:16, ...card, padding:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color: muted, marginBottom:4 }}>
              Sin programar ({sinProgramar.length})
            </div>
            <div style={{ fontSize:11, color: hint, marginBottom:10 }}>
              {fecha.estado === 'programada' ? 'Arrastra un partido hacia una celda de la grilla para ubicarlo' : 'Partidos pendientes de ubicación'}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {sinProgramar.map(partido => (
                <div
                  key={partido.id}
                  draggable={fecha.estado === 'programada'}
                  onDragStart={() => setDraggingId(partido.id)}
                  onDragEnd={() => setDraggingId(null)}
                  style={{
                    borderRadius:8, border:'1px dashed #94a3b8', background:'#f8fafc', padding:'8px 12px',
                    cursor: fecha.estado === 'programada' ? 'grab' : 'default',
                    minWidth:170, opacity: draggingId === partido.id ? 0.4 : 1,
                  }}
                >
                  <div style={{ fontSize:12, fontWeight:600, color: text }}>
                    {nombres[partido.jugadorAId] ?? '—'} vs {nombres[partido.jugadorBId] ?? '—'}
                  </div>
                  <div style={{ fontSize:10, color: hint, marginTop:2 }}>{partido.divisionNombre}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Modal resultado */}
      {partidoResultado && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:16, fontWeight:600, color: text, marginBottom:4 }}>Registrar resultado</div>
            <div style={{ fontSize:13, color: muted, marginBottom:18 }}>
              {nombres[partidoResultado.jugadorAId] ?? '—'} vs {nombres[partidoResultado.jugadorBId] ?? '—'}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
              <select
                style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={`${setsA}-${setsB}`}
                onChange={e => { const [a, b] = e.target.value.split('-'); setSetsA(a); setSetsB(b) }}
              >
                {RESULTADOS_BO5.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <span style={{ fontSize:11, color: muted }}>
                Sets {nombres[partidoResultado.jugadorAId] ?? 'A'} — Sets {nombres[partidoResultado.jugadorBId] ?? 'B'}
              </span>
            </div>

            <div style={{ display:'flex', gap:10, marginBottom:22 }}>
              <button onClick={() => setPartidoResultado(null)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleGuardarResultado} disabled={guardandoResultado} style={{ flex:1, padding:11, background:'#16a34a', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer', opacity: guardandoResultado ? 0.6 : 1 }}>
                {guardandoResultado ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>

            <div style={{ borderTop:'1px solid #e2e8f0', paddingTop:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color: muted, marginBottom:10 }}>¿No se pudo jugar?</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button disabled={guardandoAccion} onClick={() => handleWalkover(partidoResultado.jugadorAId)} style={{ background:'#fffbeb', color:'#d97706', border:'1px solid #fde68a', borderRadius:8, padding:'7px 12px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                  Walkover: gana {nombres[partidoResultado.jugadorAId] ?? 'Jugador A'}
                </button>
                <button disabled={guardandoAccion} onClick={() => handleWalkover(partidoResultado.jugadorBId)} style={{ background:'#fffbeb', color:'#d97706', border:'1px solid #fde68a', borderRadius:8, padding:'7px 12px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                  Walkover: gana {nombres[partidoResultado.jugadorBId] ?? 'Jugador B'}
                </button>
                <button disabled={guardandoAccion} onClick={handleReprogramar} style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:8, padding:'7px 12px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                  Reajuste
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
