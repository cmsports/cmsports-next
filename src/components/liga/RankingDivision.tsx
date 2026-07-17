'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calcularRankingDivision, type FilaRanking, type PartidoFinalizado } from '@/lib/domain/liga'

const supabase = createClient()

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const DIV_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f43f5e','#84cc16','#ec4899','#3b82f6',
]
function divColor(nombre: string) {
  let h = 0; for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) | 0
  return DIV_COLORS[Math.abs(h) % DIV_COLORS.length]
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function CountUp({ to, duration = 800 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!to) return
    let frame: number
    const s = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - s) / duration)
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setVal(Math.round(to * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [to, duration])
  return <>{to ? val : 0}</>
}

export function RankingDivision({ divisionId, nombreDivision }: { divisionId: string; nombreDivision: string }) {
  const [ranking, setRanking] = useState<FilaRanking[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const accent = divColor(nombreDivision)

  const PODIO_CONFIG = [
    {
      bg: `linear-gradient(135deg,${hexAlpha(accent, 0.08)},${hexAlpha(accent, 0.16)})`,
      border: `2px solid ${hexAlpha(accent, 0.5)}`,
      shadow: `0 8px 24px ${hexAlpha(accent, 0.28)}`,
      badgeColor: accent,
      medal: '🥇', label: '1°',
    },
    {
      bg: 'linear-gradient(135deg,#f8fafc,#e2e8f0)',
      border: '2px solid #94a3b8',
      shadow: '0 5px 16px rgba(148,163,184,0.22)',
      badgeColor: '#64748b',
      medal: '🥈', label: '2°',
    },
    {
      bg: 'linear-gradient(135deg,#fff7ed,#fed7aa)',
      border: '2px solid #f97316',
      shadow: '0 4px 14px rgba(249,115,22,0.2)',
      badgeColor: '#ea580c',
      medal: '🥉', label: '3°',
    },
  ]

  // Sombra escalada por rango
  const rankShadow = (i: number) => {
    if (i === 0) return `0 10px 32px ${hexAlpha(accent, 0.3)}, 0 2px 8px rgba(0,0,0,0.1)`
    if (i === 1) return '0 6px 20px rgba(148,163,184,0.25), 0 2px 6px rgba(0,0,0,0.08)'
    if (i === 2) return '0 5px 16px rgba(249,115,22,0.2), 0 2px 4px rgba(0,0,0,0.06)'
    const factor = Math.max(0, 1 - (i - 3) * 0.08)
    return `0 ${Math.round(3 * factor)}px ${Math.round(8 * factor)}px rgba(0,0,0,${(0.04 * factor).toFixed(2)})`
  }

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

  useEffect(() => {
    const timer = window.setTimeout(() => { void cargar() }, 0)
    return () => window.clearTimeout(timer)
  }, [cargar])

  async function exportarPDF() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const W = doc.internal.pageSize.getWidth()

    // Header con color de división
    const r = parseInt(accent.slice(1, 3), 16)
    const g = parseInt(accent.slice(3, 5), 16)
    const b = parseInt(accent.slice(5, 7), 16)
    doc.setFillColor(r, g, b)
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
      headStyles: { fillColor: [r, g, b] },
      margin: { left: 14, right: 14 },
    })

    doc.save(`ranking_${nombreDivision.replace(/\s+/g, '_')}.pdf`)
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${accent}40`, borderTop: `3px solid ${accent}`, margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      Cargando ranking...
    </div>
  )

  return (
    <div>
      <style>{`
        @keyframes gold-glow{0%,100%{box-shadow:0 0 0 0 ${hexAlpha(accent, 0.6)},0 4px 12px rgba(0,0,0,0.18)}50%{box-shadow:0 0 0 10px ${hexAlpha(accent, 0)},0 4px 12px rgba(0,0,0,0.18)}}
        .rank-avatar-1{animation:gold-glow 2.5s ease-in-out infinite}
        @keyframes fadeUp-rank{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .rank-card{animation:fadeUp-rank 0.3s ease both}
      `}</style>

      {/* Leyenda + botón PDF */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: accent }} />
          <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.5px', fontWeight: 600 }}>
            {nombreDivision} · PJ · PG · PP · DS · PTS
          </span>
        </div>
        <button
          onClick={exportarPDF}
          style={{
            background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
            borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          📄 PDF
        </button>
      </div>

      {/* Lista de jugadores */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ranking.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: '#f8fafc', borderRadius: 16, border: '2px dashed #e2e8f0' }}>
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.35 }}>
              <circle cx="36" cy="36" r="32" fill={hexAlpha(accent, 0.12)} stroke={accent} strokeWidth="2" strokeDasharray="6 4" />
              <text x="36" y="44" textAnchor="middle" fontSize="28" fill={accent}>🏆</text>
            </svg>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Sin resultados aún</div>
            <div style={{ fontSize: 12, color: '#94a3b8', maxWidth: 240, margin: '0 auto' }}>
              Registrá resultados en la pestaña Programación para ver el ranking
            </div>
          </div>
        )}

        {ranking.map((row, i) => {
          const nombre = nombres[row.jugadorId] ?? '—'
          const inits = nombre !== '—' ? initials(nombre) : '?'
          const bg = nombre !== '—' ? avatarBg(nombre) : 'linear-gradient(135deg,#94a3b8,#64748b)'
          const dsColor = row.ds > 0 ? '#059669' : row.ds < 0 ? '#dc2626' : '#94a3b8'
          const dsStr = row.ds > 0 ? `+${row.ds}` : String(row.ds)
          const isPodio = i < 3
          const cfg = isPodio ? PODIO_CONFIG[i] : null
          const badgeColor = cfg ? cfg.badgeColor : '#6366f1'
          const maxPts = ranking[0]?.pts ?? 1
          const pctBar = Math.round((row.pts / maxPts) * 100)
          const MEDALS = ['🥇', '🥈', '🥉']

          return (
            <div
              key={row.jugadorId}
              className="rank-card"
              style={{
                animationDelay: `${i * 0.06}s`,
                background: cfg ? cfg.bg : '#ffffff',
                border: cfg ? cfg.border : '1px solid #e2e8f0',
                boxShadow: rankShadow(i),
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
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                )}
              </div>

              {/* Avatar */}
              <div
                className={i === 0 ? 'rank-avatar-1' : ''}
                style={{
                  width: isPodio ? (i === 0 ? 54 : 46) : 36,
                  height: isPodio ? (i === 0 ? 54 : 46) : 36,
                  borderRadius: '50%', background: bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: isPodio ? (i === 0 ? 19 : 16) : 12,
                  fontWeight: 800, color: 'white',
                  letterSpacing: '0.5px',
                  border: i === 0 ? `3px solid ${accent}` : isPodio ? '3px solid white' : 'none',
                }}>
                {inits}
              </div>

              {/* Nombre + barra de progreso */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 800, color: '#0f172a',
                  fontSize: isPodio ? (i === 0 ? 17 : 15) : 13,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {nombre}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {row.pj}PJ · {row.pg}V · {row.pp}D
                </div>
                {isPodio && (
                  <div style={{ marginTop: 6, height: 4, background: 'rgba(0,0,0,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pctBar}%`, borderRadius: 2,
                      background: `linear-gradient(90deg,${badgeColor},${badgeColor}cc)`,
                      transition: 'width 0.8s cubic-bezier(0.23,1,0.32,1)',
                    }} />
                  </div>
                )}
              </div>

              {/* DS badge */}
              <div style={{
                fontSize: 11, fontWeight: 700, color: dsColor,
                background: `${dsColor}18`,
                borderRadius: 6, padding: '3px 8px',
                fontFamily: 'monospace', flexShrink: 0,
                border: `1px solid ${dsColor}33`,
              }}>
                DS {dsStr}
              </div>

              {/* Badge de puntos con count-up */}
              <div style={{
                background: `linear-gradient(135deg,${badgeColor},${badgeColor}cc)`,
                color: 'white', borderRadius: 12,
                padding: isPodio ? '7px 16px' : '4px 10px',
                flexShrink: 0,
                boxShadow: `0 3px 10px ${badgeColor}55`,
                textAlign: 'center', minWidth: isPodio ? 56 : 40,
              }}>
                <div style={{ fontSize: isPodio ? (i === 0 ? 24 : 19) : 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {isPodio ? <CountUp to={row.pts} duration={900 + i * 150} /> : row.pts}
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
