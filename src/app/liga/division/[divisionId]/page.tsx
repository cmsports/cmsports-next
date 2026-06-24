'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { Card, CardHeader, Table, Button } from '@/components/ui'
import { calcularRankingDivision, type FilaRanking, type PartidoFinalizado } from '@/lib/domain/liga'

const supabase = createClient()

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

  if (loading) return <AppLayout perfil={perfil}><div className="p-6 text-sm text-[var(--text-muted)]">Cargando…</div></AppLayout>
  if (!division) return <AppLayout perfil={perfil}><div className="p-6 text-sm text-[var(--text-muted)]">División no encontrada</div></AppLayout>

  return (
    <AppLayout perfil={perfil}>
      <div className="p-6 space-y-4">
        <div>
          <button onClick={() => router.push(`/liga/${division.ligaId}`)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] mb-1 cursor-pointer">← Volver a la liga</button>
          <h1 className="text-xl font-semibold text-[var(--text)]">Ranking — {division.nombre}</h1>
        </div>

        <Card noPadding>
          <div className="p-5 pb-0 flex items-start justify-between">
            <CardHeader title="Tabla de posiciones" subtitle="PJ: jugados · PG: ganados · PP: perdidos · PTS: puntos · SF/SC: sets a favor/en contra · DS: diferencia de sets" />
            <Button size="sm" variant="secondary" onClick={exportarPDF}>Exportar PDF</Button>
          </div>
          <Table
            columns={[
              { key: 'pos', header: '#', render: (_row: FilaRanking) => ranking.indexOf(_row) + 1 },
              { key: 'jugador', header: 'Jugador', render: (row: FilaRanking) => nombres[row.jugadorId] ?? '—' },
              { key: 'pj', header: 'PJ' },
              { key: 'pg', header: 'PG' },
              { key: 'pp', header: 'PP' },
              { key: 'pts', header: 'PTS', className: 'font-semibold' },
              { key: 'sf', header: 'SF' },
              { key: 'sc', header: 'SC' },
              { key: 'ds', header: 'DS', render: (row: FilaRanking) => (row.ds > 0 ? `+${row.ds}` : row.ds) },
            ]}
            data={ranking}
            rowKey={row => row.jugadorId}
            emptyMessage="Aún no hay resultados registrados en esta división"
          />
        </Card>
      </div>
    </AppLayout>
  )
}
