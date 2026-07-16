'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calcularRankingDivision, type FilaRanking, type PartidoFinalizado } from '@/lib/domain/liga'

const supabase = createClient()

const AVATAR_BG = [
  ['#6366f1','#818cf8'],['#8b5cf6','#a78bfa'],['#ec4899','#f472b6'],
  ['#ef4444','#f87171'],['#f97316','#fb923c'],['#f59e0b','#fbbf24'],
  ['#10b981','#34d399'],['#06b6d4','#22d3ee'],['#3b82f6','#60a5fa'],
  ['#84cc16','#a3e635'],
]
function avatarBg(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0
  const [c1, c2] = AVATAR_BG[Math.abs(h) % AVATAR_BG.length]
  return `linear-gradient(135deg, ${c1}, ${c2})`
}
function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

const PODIO_CONFIG = [
  { bg: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '2px solid #f59e0b', shadow: '0 6px 20px rgba(245,158,11,0.25)', badgeColor: '#f59e0b', medal: '🥇', label: '1°' },
  { bg: 'linear-gradient(135deg,#f8fafc,#e2e8f0)', border: '2px solid #94a3b8', shadow: '0 4px 14px rgba(148,163,184,0.2)', badgeColor: '#64748b', medal: '🥈', label: '2°' },
  { bg: 'linear-gradient(135deg,#fff7ed,#fed7aa)', border: '2px solid #f97316', shadow: '0 4px 14px rgba(249,115,22,0.2)', badgeColor: '#ea580c', medal: '🥉', label: '3°' },
]
const cardStyle = (i: number) => {
  if (i < 3) return { background: PODIO_CONFIG[i].bg, border: PODIO_CONFIG[i].border, boxShadow: PODIO_CONFIG[i].shadow }
  return { background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
}
const ptsBadgeColor = (i: number) => i < 3 ? PODIO_CONFIG[i].badgeColor : '#6366f1'
const MEDALS = ['🥇', '🥈', '🥉']

export function RankingDivision({ divisionId, nombreDivision }: { divisionId: string; nombreDivision: string }) {
  const [ranking, setRanking] = useState<FilaRanking[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const db = supabase as any
    const [{ data: dj }, { data: rawPartidos }] = await Promise.all([
      supabase.from('liga_division_jugadores').select('jugador_id').eq('division_id', divisionId),
      db
        .from('liga_partidos')
        .select('jugador_a_id, jugador_b_id, ganador_id, es_walkover, sets_a, sets_b')
        .eq('division_id', divisionId)
        .in('estado', ['finalizado', 'walkover'])
        .is('deleted_at', null),
    ])
    const partidosData = (rawPartidos || []) as Array<{
      jugador_a_id: string; jugador_b_id: string; ganador_id: string | null
      es_walkover: boolean; sets_a: number | null; sets_b: number | null
    }>

    // Usar la unión de division_jugadores + IDs que aparecen en partidos como
    // lista base, para que ningún partido quede sin contar si un jugador no
    // está en liga_division_jugadores (bug: calcularRankingDivision saltea el
    // partido entero si cualquiera de los dos jugadores falta en el Map).
    const divJugIds = (dj || []).map(j => j.jugador_id)
    const partidoJugIds = partidosData.flatMap(p => [p.jugador_a_id, p.jugador_b_id])
    const jugadorIds = Array.from(new Set([...divJugIds, ...partidoJugIds]))

    const partidos: PartidoFinalizado[] = partidosData
      .filter(p => p.ganador_id)
      .map(p => ({
        jugadorAId: p.jugador_a_id,
        jugadorBId: p.jugador_b_id,
        ganadorId: p.ganador_id as string,
        esWalkover: p.es_walkover,
        setsA: p.sets_a,
        setsB: p.sets_b,
      }))

    setRanking(calcularRankingDivision(jugadorIds, partidos))

    if (jugadorIds.length) {
      const { data: jugadoresData } = await supabase.from('jugadores').select('id, nombre').in('id', jugadorIds)
      const mapa: Record<string, string> = {}
      for (const j of jugadoresData || []) mapa[j.id] = j.nombre
      setNombres(mapa)
    }
    setLoading(false)
  }, [divisionId])

  useEffect(() => { cargar() }, [cargar])

  async function exportarPDF() {
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
    doc.text(`Ranking — ${nombreDivision}`, 14, 24)

    autoTable(doc, {
      startY: 42,
      head: [['#', 'Jugador', 'PJ', 'PG', 'PP', 'PTS', 'SF', 'SC', 'DS']],
      body: ranking.map((row, i) => [
        i + 1,
        nombres[row.jugadorId] ?? '—',
        row.pj, row.pg, row.pp, row.pts, row.sf, row.sc,
        row.ds > 0 ? `+${row.ds}` : row.ds,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      margin: { left: 14, right: 14 },
    })

    doc.save(`ranking_${nombreDivision.replace(/\s+/g, '_')}.pdf`)
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
      Cargando...
    </div>
  )

  return (
    <div>
      {/* Leyenda + botón PDF */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.5px', fontWeight: 500 }}>
          PJ · PG · PP · DS · PTS
        </div>
        <button
          onClick={exportarPDF}
          style={{
            background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
            borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          📄 Exportar PDF
        </button>
      </div>

      {/* Lista de jugadores */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ranking.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Aún no hay resultados registrados en esta división
          </div>
        )}

        {ranking.map((row, i) => {
          const nombre = nombres[row.jugadorId] ?? '—'
          const inits = nombre !== '—' ? initials(nombre) : '?'
          const bg = nombre !== '—' ? avatarBg(nombre) : 'linear-gradient(135deg,#94a3b8,#64748b)'
          const dsColor = row.ds > 0 ? '#059669' : row.ds < 0 ? '#dc2626' : '#94a3b8'
          const dsStr = row.ds > 0 ? `+${row.ds}` : String(row.ds)
          const badgeColor = ptsBadgeColor(i)
          const maxPts = ranking[0]?.pts ?? 1
          const pctBar = Math.round((row.pts / maxPts) * 100)
          const isPodio = i < 3

          return (
            <div
              key={row.jugadorId}
              style={{
                ...cardStyle(i),
                borderRadius: isPodio ? 16 : 12,
                padding: isPodio ? '16px 18px' : '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
            >
              {/* Posición / Medalla */}
              <div style={{ width: isPodio ? 36 : 28, textAlign: 'center', flexShrink: 0 }}>
                {isPodio ? (
                  <span style={{ fontSize: i === 0 ? 30 : 24, lineHeight: 1 }}>{MEDALS[i]}</span>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>{i + 1}</span>
                )}
              </div>

              {/* Avatar con iniciales */}
              <div style={{
                width: isPodio ? (i === 0 ? 52 : 44) : 36,
                height: isPodio ? (i === 0 ? 52 : 44) : 36,
                borderRadius: '50%', background: bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                fontSize: isPodio ? (i === 0 ? 18 : 15) : 12,
                fontWeight: 800, color: 'white',
                boxShadow: isPodio ? '0 3px 10px rgba(0,0,0,0.22)' : '0 2px 6px rgba(0,0,0,0.15)',
                letterSpacing: '0.5px',
                border: isPodio ? `3px solid white` : 'none',
              }}>
                {inits}
              </div>

              {/* Nombre + barra de progreso */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 700, color: '#0f172a',
                  fontSize: isPodio ? (i === 0 ? 16 : 14) : 13,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {nombre}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {row.pj}PJ · {row.pg}V · {row.pp}D
                </div>
                {isPodio && (
                  <div style={{ marginTop:5, height:4, background:'rgba(0,0,0,0.08)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pctBar}%`, background: badgeColor, borderRadius:2, transition:'width 0.6s ease' }} />
                  </div>
                )}
              </div>

              {/* DS coloreado */}
              <div style={{
                fontSize: 11, fontWeight: 700, color: dsColor,
                background: `${dsColor}18`,
                borderRadius: 6, padding: '3px 8px',
                fontFamily: 'monospace', flexShrink: 0,
                border: `1px solid ${dsColor}33`,
              }}>
                DS {dsStr}
              </div>

              {/* Badge de puntos */}
              <div style={{
                background: badgeColor, color: 'white',
                borderRadius: 10, padding: isPodio ? '6px 14px' : '4px 10px',
                flexShrink: 0,
                boxShadow: `0 3px 10px ${badgeColor}55`,
                textAlign: 'center', minWidth: isPodio ? 52 : 40,
              }}>
                <div style={{ fontSize: isPodio ? (i === 0 ? 22 : 18) : 14, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1 }}>
                  {row.pts}
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, opacity: 0.85, letterSpacing: '0.8px', marginTop: 2 }}>
                  PTS
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
