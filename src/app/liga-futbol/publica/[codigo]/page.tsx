'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calcularTablaPosiciones, calcularGoleadores, type EquipoStats } from '@/lib/domain/liga-futbol'

const supabase = createClient()

const ink = '#0f172a', muted = '#64748b', hint = '#94a3b8', green = '#059669'
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.08)' } as const

interface Liga {
  id: string; nombre: string; formato: string; estado: string
  cancha: string | null; dia_juego: string | null
  puntos_victoria: number; puntos_empate: number; puntos_derrota: number; puntos_wo_perdedor: number
}
interface Equipo { id: string; nombre: string; color_principal: string | null }
interface Fecha { id: string; numero: number; nombre: string | null; fecha: string | null; estado: string; es_playoff: boolean }
interface Partido {
  id: string; fecha_id: string | null
  equipo_local_id: string; equipo_visita_id: string
  goles_local: number | null; goles_visita: number | null
  hora: string | null; estado: string; equipo_wo_id: string | null
}
interface Jugador { id: string; equipo_id: string; nombre: string; numero: number | null }
interface Gol { jugador_id: string; equipo_id: string; tipo: string }

const RESULTADO_COLOR: Record<string, string> = { V: '#059669', E: '#d97706', D: '#dc2626' }

export default function LigaFutbolPublica() {
  const params = useParams()
  const codigo = String(params.codigo || '').toUpperCase()

  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-encontrado'>('cargando')
  const [liga, setLiga] = useState<Liga | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [fechas, setFechas] = useState<Fecha[]>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [goles, setGoles] = useState<Gol[]>([])
  const [tab, setTab] = useState<'tabla' | 'fixture' | 'goleadores'>('tabla')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activo = useRef(true)

  const cargar = useCallback(async () => {
    if (!codigo) return
    const { data: ligaRow } = await supabase.from('lf_ligas')
      .select('id, nombre, formato, estado, cancha, dia_juego, puntos_victoria, puntos_empate, puntos_derrota, puntos_wo_perdedor')
      .eq('codigo_publico', codigo).eq('es_publica', true).maybeSingle()
    if (!activo.current) return
    if (!ligaRow) { setEstado('no-encontrado'); return }
    setLiga(ligaRow as any)

    const [eqRes, fechasRes, partRes] = await Promise.all([
      supabase.from('lf_equipos').select('id, nombre, color_principal').eq('liga_id', ligaRow.id),
      supabase.from('lf_fechas').select('id, numero, nombre, fecha, estado, es_playoff').eq('liga_id', ligaRow.id).order('numero'),
      supabase.from('lf_partidos').select('id, fecha_id, equipo_local_id, equipo_visita_id, goles_local, goles_visita, hora, estado, equipo_wo_id').eq('liga_id', ligaRow.id),
    ])
    if (!activo.current) return
    setEquipos((eqRes.data as any) || [])
    setFechas((fechasRes.data as any) || [])
    setPartidos((partRes.data as any) || [])

    const partidoIds = ((partRes.data as any) || []).map((p: Partido) => p.id)
    if (partidoIds.length > 0) {
      const { data: golesData } = await supabase.from('lf_goles').select('jugador_id, equipo_id, tipo').in('partido_id', partidoIds)
      if (activo.current) setGoles((golesData as any) || [])
    }
    const equipoIds = ((eqRes.data as any) || []).map((e: Equipo) => e.id)
    if (equipoIds.length > 0) {
      const { data: jugData } = await supabase.from('lf_jugadores').select('id, equipo_id, nombre, numero').in('equipo_id', equipoIds)
      if (activo.current) setJugadores((jugData as any) || [])
    }

    setEstado('ok')
  }, [codigo])

  useEffect(() => {
    activo.current = true
    void cargar()
    return () => { activo.current = false }
  }, [cargar])

  useEffect(() => {
    let cancelado = false
    const actualizar = async () => {
      if (document.visibilityState !== 'hidden') await cargar()
      if (!cancelado) timer.current = setTimeout(actualizar, 5000)
    }
    timer.current = setTimeout(actualizar, 5000)
    return () => { cancelado = true; if (timer.current) clearTimeout(timer.current) }
  }, [cargar])

  const equipoPorId = (id: string) => equipos.find(e => e.id === id)
  const jugadorPorId = (id: string) => jugadores.find(j => j.id === id)

  if (estado === 'cargando') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f7fa' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (estado === 'no-encontrado' || !liga) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f4f7fa', gap: 8 }}>
      <div style={{ fontSize: 40 }}>⚽</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: muted }}>Liga no encontrada</div>
      <div style={{ fontSize: 13, color: hint }}>Revisá el código e intentá de nuevo</div>
    </div>
  )

  const reglas = { puntosVictoria: liga.puntos_victoria, puntosEmpate: liga.puntos_empate, puntosDerrota: liga.puntos_derrota, puntosWoPerdedor: liga.puntos_wo_perdedor }
  const tabla: EquipoStats[] = calcularTablaPosiciones(
    equipos.map(e => e.id),
    partidos.map(p => ({
      equipoLocalId: p.equipo_local_id, equipoVisitaId: p.equipo_visita_id,
      golesLocal: p.goles_local ?? 0, golesVisita: p.goles_visita ?? 0,
      estado: p.estado, equipoWoId: p.equipo_wo_id,
    })),
    reglas,
  )
  const goleadores = calcularGoleadores(goles)

  const proximaFecha = fechas.find(f => f.estado !== 'finalizada')
  const partidosProximaFecha = proximaFecha ? partidos.filter(p => p.fecha_id === proximaFecha.id) : []

  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fa', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${green}, #10b981)`, padding: '28px 20px 20px', color: 'white' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>⚽ CmSports</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>{liga.nombre}</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {liga.cancha && <span>📍 {liga.cancha}</span>}
            {liga.dia_juego && <span>📅 {liga.dia_juego}</span>}
            <span>{liga.estado === 'playoffs' ? '🏆 Playoffs' : liga.estado === 'finalizada' ? '✅ Finalizada' : '🟢 En curso'}</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 0' }}>
        {/* Próxima fecha */}
        {proximaFecha && partidosProximaFecha.length > 0 && (
          <div style={{ ...card, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: green, marginBottom: 10 }}>
              {proximaFecha.es_playoff ? '🏆' : '📆'} {proximaFecha.nombre || `Fecha ${proximaFecha.numero}`}
              {proximaFecha.fecha && ` · ${new Date(proximaFecha.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {partidosProximaFecha.map(p => {
                const local = equipoPorId(p.equipo_local_id)
                const visita = equipoPorId(p.equipo_visita_id)
                const jugado = p.estado === 'finalizado' || p.estado === 'wo'
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ width: 44, color: hint, fontSize: 11 }}>{p.hora ? p.hora.slice(0, 5) : ''}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, color: ink }}>{local?.nombre}</span>
                    <span style={{ fontWeight: 800, color: jugado ? ink : hint, minWidth: 40, textAlign: 'center' }}>
                      {jugado ? `${p.goles_local ?? 0}-${p.goles_visita ?? 0}` : 'vs'}
                    </span>
                    <span style={{ flex: 1, fontWeight: 600, color: ink }}>{visita?.nombre}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#e2e8f0', borderRadius: 12, padding: 4 }}>
          {([['tabla', '📊 Tabla'], ['fixture', '📅 Fixture'], ['goleadores', '⚽ Goleadores']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none',
              background: tab === key ? 'white' : 'transparent', color: tab === key ? green : muted, cursor: 'pointer',
              boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>{label}</button>
          ))}
        </div>

        {tab === 'tabla' && (
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    {['#', 'Equipo', 'PJ', 'PTS', 'DG', 'Últ.5'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Equipo' ? 'left' : 'center', padding: '10px 8px', color: hint, fontWeight: 700, fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tabla.map((row, i) => {
                    const eq = equipoPorId(row.equipoId)
                    return (
                      <tr key={row.equipoId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 8px', textAlign: 'center', color: hint, fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: '9px 8px', fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: 4, background: eq?.color_principal || '#e2e8f0', flexShrink: 0 }} />
                          {eq?.nombre || '—'}
                        </td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', color: muted }}>{row.pj}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 800, color: ink }}>{row.pts}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', color: muted }}>{row.dg > 0 ? `+${row.dg}` : row.dg}</td>
                        <td style={{ padding: '9px 8px' }}>
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                            {row.ultimos5.map((r, idx) => (
                              <span key={idx} style={{ width: 14, height: 14, borderRadius: 3, background: RESULTADO_COLOR[r], color: 'white', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {tabla.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Todavía no hay partidos jugados</div>}
          </div>
        )}

        {tab === 'fixture' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fechas.map(fecha => {
              const partidosDeFecha = partidos.filter(p => p.fecha_id === fecha.id)
              if (partidosDeFecha.length === 0) return null
              return (
                <div key={fecha.id} style={{ ...card, padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: green, marginBottom: 10 }}>
                    {fecha.es_playoff ? '🏆' : '📆'} {fecha.nombre || `Fecha ${fecha.numero}`}
                    {fecha.fecha && ` · ${new Date(fecha.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {partidosDeFecha.map(p => {
                      const local = equipoPorId(p.equipo_local_id)
                      const visita = equipoPorId(p.equipo_visita_id)
                      const jugado = p.estado === 'finalizado' || p.estado === 'wo'
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                          <span style={{ width: 44, color: hint, fontSize: 11 }}>{p.hora ? p.hora.slice(0, 5) : ''}</span>
                          <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, color: ink }}>{local?.nombre}</span>
                          <span style={{ fontWeight: 800, color: jugado ? ink : hint, minWidth: 40, textAlign: 'center' }}>
                            {jugado ? `${p.goles_local ?? 0}-${p.goles_visita ?? 0}` : 'vs'}
                          </span>
                          <span style={{ flex: 1, fontWeight: 600, color: ink }}>{visita?.nombre}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {fechas.length === 0 && <div style={{ ...card, padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Fixture no generado todavía</div>}
          </div>
        )}

        {tab === 'goleadores' && (
          <div style={{ ...card, overflow: 'hidden' }}>
            {goleadores.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Todavía no hay goles registrados</div>
            ) : (
              goleadores.map((g, i) => {
                const jug = jugadorPorId(g.jugadorId)
                const eq = equipoPorId(g.equipoId)
                return (
                  <div key={g.jugadorId} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderBottom: i < goleadores.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    <span style={{ width: 22, fontSize: 12, color: hint, fontWeight: 700 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>{jug?.nombre || '—'}</div>
                      <div style={{ fontSize: 11, color: hint }}>{eq?.nombre || '—'}</div>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: ink }}>{g.goles}</div>
                  </div>
                )
              })
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: hint }}>
          Powered by CmSports
        </div>
      </div>
    </div>
  )
}
