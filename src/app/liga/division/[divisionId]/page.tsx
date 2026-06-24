'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { calcularRankingDivision, type FilaRanking, type PartidoFinalizado } from '@/lib/domain/liga'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

export default function RankingDivisionPage() {
  const params = useParams<{ divisionId: string }>()
  const divisionId = params.divisionId
  const { perfil } = usePerfil()
  const router = useRouter()

  const [division, setDivision] = useState<{ nombre: string; ligaId: string } | null>(null)
  const [ranking, setRanking] = useState<FilaRanking[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const { data: div } = await supabase.from('liga_divisiones').select('nombre, liga_id').eq('id', divisionId).single()
    if (!div) { setLoading(false); return }
    setDivision({ nombre: div.nombre, ligaId: div.liga_id })

    const [{ data: dj }, { data: partidosData }] = await Promise.all([
      supabase.from('liga_division_jugadores').select('jugador_id').eq('division_id', divisionId),
      supabase
        .from('liga_partidos')
        .select('jugador_a_id, jugador_b_id, ganador_id, es_walkover, sets_a, sets_b')
        .eq('division_id', divisionId)
        .in('estado', ['finalizado', 'walkover']),
    ])

    const jugadorIds = (dj || []).map(j => j.jugador_id)
    const partidos: PartidoFinalizado[] = (partidosData || [])
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
    doc.text(`Ranking — ${division?.nombre ?? ''}`, 14, 24)

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

    doc.save(`ranking_${division?.nombre?.replace(/\s+/g, '_') ?? 'division'}.pdf`)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )
  if (!division) return <AppLayout perfil={perfil}><div style={{ padding:24, color: muted, fontSize:13 }}>División no encontrada</div></AppLayout>

  return (
    <AppLayout perfil={perfil}>
      <button onClick={() => router.push(`/liga/${division.ligaId}`)} style={{ background:'transparent', border:'none', color: muted, fontSize:12, cursor:'pointer', padding:0, marginBottom:8 }}>
        ← Volver a la liga
      </button>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color: text }}>🏆 Ranking — {division.nombre}</h1>
        <button onClick={exportarPDF} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>
          📄 Exportar PDF
        </button>
      </div>

      <div style={{ fontSize:12, color: muted, marginBottom:14 }}>
        PJ: jugados · PG: ganados · PP: perdidos · PTS: puntos · SF/SC: sets a favor/en contra · DS: diferencia de sets
      </div>

      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['#', 'Jugador', 'PJ', 'PG', 'PP', 'PTS', 'SF', 'SC', 'DS'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranking.map((row, i) => (
                <tr key={row.jugadorId} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'12px 16px', fontSize:14, fontWeight:700, color: i === 0 ? '#d97706' : i === 1 ? muted : i === 2 ? '#f43f5e' : hint }}>
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                  </td>
                  <td style={{ padding:'12px 16px', fontWeight:600, color: text, whiteSpace:'nowrap' }}>{nombres[row.jugadorId] ?? '—'}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, color: muted }}>{row.pj}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, color: muted }}>{row.pg}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, color: muted }}>{row.pp}</td>
                  <td style={{ padding:'12px 16px', fontSize:14, fontWeight:700, color:'#4f46e5', fontFamily:'monospace' }}>{row.pts}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, color: muted }}>{row.sf}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, color: muted }}>{row.sc}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, fontWeight:600, color: row.ds > 0 ? '#16a34a' : row.ds < 0 ? '#dc2626' : muted }}>
                    {row.ds > 0 ? `+${row.ds}` : row.ds}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ranking.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>
            Aún no hay resultados registrados en esta división
          </div>
        )}
      </div>
    </AppLayout>
  )
}
