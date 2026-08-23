'use client'

// Resumen de la liga de fútbol activa para el Dashboard principal. Vive
// aparte del dashboard (900 líneas, producción real de TDM) a propósito:
// fetch, estado y renderizado propios, así una liga de fútbol nunca puede
// romper nada de lo que ya funciona para los clubes de tenis de mesa.
// Si el club no tiene ninguna liga en curso, no renderiza nada.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calcularTablaPosiciones, type EquipoStats } from '@/lib/domain/liga-futbol'

const supabase = createClient()

const C = {
  card: '#ffffff', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', hint: '#94a3b8',
  green: '#059669', greenL: '#f0fdf4', indigo: '#6366f1', indigoL: '#eef2ff',
}

interface Liga {
  id: string; nombre: string; estado: string; max_equipos: number; monto_inscripcion: number
  puntos_victoria: number; puntos_empate: number; puntos_derrota: number; puntos_wo_perdedor: number
}

export default function LigaFutbolDashboardWidget({ clubId }: { clubId: string | null | undefined }) {
  const router = useRouter()
  const [liga, setLiga] = useState<Liga | null>(null)
  const [tabla, setTabla] = useState<EquipoStats[]>([])
  const [equipoNombre, setEquipoNombre] = useState<Record<string, string>>({})
  const [equiposCount, setEquiposCount] = useState(0)
  const [totalPagado, setTotalPagado] = useState(0)
  const [proximaFecha, setProximaFecha] = useState<{ nombre: string | null; numero: number; fecha: string | null } | null>(null)
  const [partidosJugados, setPartidosJugados] = useState(0)
  const [partidosTotal, setPartidosTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clubId) { setLoading(false); return }
    let vigente = true

    supabase.from('lf_ligas')
      .select('id, nombre, estado, max_equipos, monto_inscripcion, puntos_victoria, puntos_empate, puntos_derrota, puntos_wo_perdedor')
      .eq('club_id', clubId).in('estado', ['en_curso', 'playoffs'])
      .order('creado_en', { ascending: false }).limit(1).maybeSingle()
      .then(async ({ data: ligaRow }) => {
        if (!vigente) return
        if (!ligaRow) { setLoading(false); return }
        setLiga(ligaRow as any)

        const [eqRes, partRes, fechasRes] = await Promise.all([
          supabase.from('lf_equipos').select('id, nombre, monto_pagado').eq('liga_id', ligaRow.id),
          supabase.from('lf_partidos').select('equipo_local_id, equipo_visita_id, goles_local, goles_visita, estado, equipo_wo_id, fecha_id').eq('liga_id', ligaRow.id),
          supabase.from('lf_fechas').select('numero, nombre, fecha, estado').eq('liga_id', ligaRow.id).order('numero'),
        ])
        if (!vigente) return

        const equipos = eqRes.data || []
        setEquiposCount(equipos.length)
        setTotalPagado(equipos.reduce((s, e) => s + (e.monto_pagado || 0), 0))
        setEquipoNombre(Object.fromEntries(equipos.map(e => [e.id, e.nombre])))

        const partidos = partRes.data || []
        setPartidosTotal(partidos.length)
        setPartidosJugados(partidos.filter(p => p.estado === 'finalizado' || p.estado === 'wo').length)

        setTabla(calcularTablaPosiciones(
          equipos.map(e => e.id),
          partidos.map(p => ({
            equipoLocalId: p.equipo_local_id, equipoVisitaId: p.equipo_visita_id,
            golesLocal: p.goles_local ?? 0, golesVisita: p.goles_visita ?? 0,
            estado: p.estado, equipoWoId: p.equipo_wo_id,
          })),
          {
            puntosVictoria: ligaRow.puntos_victoria, puntosEmpate: ligaRow.puntos_empate,
            puntosDerrota: ligaRow.puntos_derrota, puntosWoPerdedor: ligaRow.puntos_wo_perdedor,
          },
        ))

        const siguiente = (fechasRes.data || []).find(f => f.estado !== 'finalizada')
        setProximaFecha(siguiente ? { nombre: siguiente.nombre, numero: siguiente.numero, fecha: siguiente.fecha } : null)

        setLoading(false)
      })

    return () => { vigente = false }
  }, [clubId])

  if (loading || !liga) return null

  const totalEsperado = equiposCount * liga.monto_inscripcion
  const pctRecaudado = totalEsperado > 0 ? Math.round((totalPagado / totalEsperado) * 100) : null
  const pctPartidos = partidosTotal > 0 ? Math.round((partidosJugados / partidosTotal) * 100) : 0

  return (
    <div
      onClick={() => router.push(`/liga-futbol/${liga.id}`)}
      style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20,
        boxShadow: '0 4px 16px rgba(15,23,42,0.1)', marginBottom: 16, cursor: 'pointer',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.green, display: 'flex', alignItems: 'center', gap: 6 }}>
          ⚽ {liga.nombre}
        </div>
        <span style={{ fontSize: 11, color: C.hint }}>Ver liga →</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{equiposCount}/{liga.max_equipos}</div>
          <div style={{ fontSize: 11, color: C.muted }}>Equipos inscritos</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{partidosJugados}/{partidosTotal}</div>
          <div style={{ fontSize: 11, color: C.muted }}>Partidos jugados{partidosTotal > 0 ? ` (${pctPartidos}%)` : ''}</div>
        </div>
        {pctRecaudado !== null && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: pctRecaudado >= 100 ? C.green : C.text }}>{pctRecaudado}%</div>
            <div style={{ fontSize: 11, color: C.muted }}>Inscripción recaudada</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            {proximaFecha ? (proximaFecha.nombre || `Fecha ${proximaFecha.numero}`) : '—'}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {proximaFecha?.fecha
              ? new Date(proximaFecha.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
              : 'Próxima fecha'}
          </div>
        </div>
      </div>

      {tabla.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.hint, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top de la tabla</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tabla.slice(0, 4).map((row, i) => (
              <div key={row.equipoId} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 5, background: i === 0 ? C.greenL : '#f8fafc',
                  color: i === 0 ? C.green : C.muted, fontSize: 11, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{i + 1}</span>
                <span style={{ flex: 1, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {equipoNombre[row.equipoId] || '—'}
                </span>
                <span style={{ color: C.muted, fontSize: 12 }}>{row.pj} PJ</span>
                <span style={{
                  background: C.indigoL, color: C.indigo, borderRadius: 6, padding: '2px 8px',
                  fontSize: 12, fontWeight: 700, minWidth: 32, textAlign: 'center',
                }}>{row.pts} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
