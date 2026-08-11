'use client'

import { CONFIG } from '@/lib/config'
import { formatearSets, type SetMarcador } from '@/lib/domain/oficial-ittf'

type PartidoBracket = {
  id: string
  fase: string
  orden: number
  inscrito_a_id: string | null
  inscrito_b_id: string | null
  ganador_id: string | null
  sets: SetMarcador[]
  es_walkover: boolean
}

const FASE_LABELS = CONFIG.FASE_LABELS as Record<string, string>

export default function BracketOficial(props: {
  partidos: PartidoBracket[]
  nombrePorId: Map<string, string>
}) {
  const playoff = props.partidos.filter(p => p.fase !== 'grupos')
  if (!playoff.length) return null

  const fases = CONFIG.FASES_ORDEN.filter(f =>
    playoff.some(p => p.fase === f),
  )

  const porFase = new Map<string, PartidoBracket[]>()
  for (const f of fases) {
    porFase.set(f, playoff.filter(p => p.fase === f).sort((a, b) => a.orden - b.orden))
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', gap: 16, minWidth: 'max-content' }}>
        {fases.map(fase => (
          <div key={fase} style={{ minWidth: 180 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
              letterSpacing: 0.5, marginBottom: 8, textAlign: 'center',
            }}>
              {FASE_LABELS[fase] || fase}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(porFase.get(fase) || []).map(p => {
                const a = p.inscrito_a_id ? props.nombrePorId.get(p.inscrito_a_id) : '—'
                const b = p.inscrito_b_id ? props.nombrePorId.get(p.inscrito_b_id) : 'BYE'
                const ganoA = p.ganador_id === p.inscrito_a_id
                const ganoB = p.ganador_id === p.inscrito_b_id
                return (
                  <div key={p.id} style={{
                    border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', fontSize: 12,
                    background: '#fff',
                  }}>
                    <div style={{
                      padding: '6px 8px',
                      background: ganoA ? '#ecfdf5' : '#fff',
                      fontWeight: ganoA ? 700 : 400,
                      borderBottom: '1px solid #f1f5f9',
                    }}>
                      {a || '?'}
                    </div>
                    <div style={{
                      padding: '6px 8px',
                      background: ganoB ? '#ecfdf5' : '#fff',
                      fontWeight: ganoB ? 700 : 400,
                    }}>
                      {b}
                    </div>
                    {p.ganador_id && p.inscrito_b_id && (
                      <div style={{ padding: '4px 8px', fontSize: 10, color: '#64748b', background: '#f8fafc' }}>
                        {formatearSets(p.sets)}{p.es_walkover ? ' · W.O.' : ''}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
