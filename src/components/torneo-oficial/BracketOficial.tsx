'use client'

import { useState, type CSSProperties } from 'react'
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

function fasesBracket(playoff: PartidoBracket[]): string[] {
  const base: string[] = [...CONFIG.FASES_ORDEN.filter(f => playoff.some(p => p.fase === f))]
  if (playoff.some(p => p.fase === 'tercer_lugar')) {
    const idxFinal = base.indexOf('final')
    if (idxFinal >= 0) base.splice(idxFinal, 0, 'tercer_lugar')
    else base.push('tercer_lugar')
  }
  return base
}

export default function BracketOficial(props: {
  partidos: PartidoBracket[]
  nombrePorId: Map<string, string>
  esAdmin?: boolean
  faseInicial?: string | null
  onIntercambiar?: (slotA: { partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' }, slotB: { partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' }) => void | Promise<void>
}) {
  const [dragSlot, setDragSlot] = useState<{ partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' } | null>(null)
  const [dragOver, setDragOver] = useState<{ partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' } | null>(null)

  const playoff = props.partidos.filter(p => p.fase !== 'grupos')
  if (!playoff.length) return null

  const fases = fasesBracket(playoff)

  const porFase = new Map<string, PartidoBracket[]>()
  for (const f of fases) {
    porFase.set(f, playoff.filter(p => p.fase === f).sort((a, b) => a.orden - b.orden))
  }

  async function soltar(partidoId: string, posicion: 'inscrito_a' | 'inscrito_b') {
    if (!dragSlot || !props.onIntercambiar) return
    if (dragSlot.partidoId === partidoId && dragSlot.posicion === posicion) {
      setDragSlot(null)
      setDragOver(null)
      return
    }
    await props.onIntercambiar(dragSlot, { partidoId, posicion })
    setDragSlot(null)
    setDragOver(null)
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      {props.esAdmin && props.faseInicial && props.onIntercambiar && (
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>
          Arrastra jugadores en la ronda inicial para intercambiar cupos.
        </p>
      )}
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
                const esBye = !p.inscrito_b_id
                const b = esBye ? 'BYE' : (p.inscrito_b_id ? props.nombrePorId.get(p.inscrito_b_id) : '—')
                const ganoA = p.ganador_id === p.inscrito_a_id
                const ganoB = p.ganador_id === p.inscrito_b_id
                const puedeMover = Boolean(
                  props.esAdmin && props.faseInicial && p.fase === props.faseInicial
                  && !(p.ganador_id && p.inscrito_b_id) && props.onIntercambiar,
                )

                const slotStyle = (pos: 'inscrito_a' | 'inscrito_b', gano: boolean, tieneInscrito: boolean): CSSProperties => ({
                  padding: '6px 8px',
                  background: dragOver?.partidoId === p.id && dragOver?.posicion === pos
                    ? '#dbeafe'
                    : gano ? '#ecfdf5' : '#fff',
                  fontWeight: gano ? 700 : 400,
                  borderBottom: pos === 'inscrito_a' ? '1px solid #f1f5f9' : undefined,
                  cursor: puedeMover && tieneInscrito ? 'grab' : 'default',
                  opacity: dragSlot?.partidoId === p.id && dragSlot?.posicion === pos ? 0.45 : 1,
                })

                return (
                  <div key={p.id} style={{
                    border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', fontSize: 12,
                    background: '#fff',
                  }}>
                    <div
                      draggable={puedeMover && !!p.inscrito_a_id}
                      onDragStart={puedeMover && p.inscrito_a_id ? () => setDragSlot({ partidoId: p.id, posicion: 'inscrito_a' }) : undefined}
                      onDragOver={puedeMover ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'inscrito_a' }) } : undefined}
                      onDrop={puedeMover ? (e) => { e.preventDefault(); void soltar(p.id, 'inscrito_a') } : undefined}
                      onDragEnd={() => { setDragSlot(null); setDragOver(null) }}
                      style={slotStyle('inscrito_a', ganoA, !!p.inscrito_a_id)}
                    >
                      {a || '?'}
                    </div>
                    {esBye ? (
                      <div
                        onDragOver={puedeMover ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'inscrito_b' }) } : undefined}
                        onDrop={puedeMover ? (e) => { e.preventDefault(); void soltar(p.id, 'inscrito_b') } : undefined}
                        style={{ ...slotStyle('inscrito_b', false, false), fontStyle: 'italic', color: '#94a3b8' }}
                      >
                        BYE
                      </div>
                    ) : (
                      <div
                        draggable={puedeMover && !!p.inscrito_b_id}
                        onDragStart={puedeMover && p.inscrito_b_id ? () => setDragSlot({ partidoId: p.id, posicion: 'inscrito_b' }) : undefined}
                        onDragOver={puedeMover ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'inscrito_b' }) } : undefined}
                        onDrop={puedeMover ? (e) => { e.preventDefault(); void soltar(p.id, 'inscrito_b') } : undefined}
                        onDragEnd={() => { setDragSlot(null); setDragOver(null) }}
                        style={slotStyle('inscrito_b', ganoB, !!p.inscrito_b_id)}
                      >
                        {b}
                      </div>
                    )}
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
