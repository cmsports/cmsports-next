'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { CONFIG } from '@/lib/config'
import { etiquetaCierreOficial, formatearSets, type SetMarcador, type TipoCierreOficial } from '@/lib/domain/oficial-ittf'
import { torneoUi } from '@/lib/torneos/ui-tokens'

type PartidoBracket = {
  id: string
  fase: string
  orden: number
  inscrito_a_id: string | null
  inscrito_b_id: string | null
  ganador_id: string | null
  sets: SetMarcador[]
  es_walkover: boolean
  tipo_cierre?: TipoCierreOficial | null
}

type Slot = { partidoId: string; posicion: 'inscrito_a' | 'inscrito_b' }

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

function nombreSlot(
  p: PartidoBracket,
  pos: 'inscrito_a' | 'inscrito_b',
  nombrePorId: Map<string, string>,
): string {
  if (pos === 'inscrito_b' && !p.inscrito_b_id) return 'BYE'
  const id = pos === 'inscrito_a' ? p.inscrito_a_id : p.inscrito_b_id
  if (!id) return '—'
  return nombrePorId.get(id) || '?'
}

export default function BracketOficial(props: {
  partidos: PartidoBracket[]
  nombrePorId: Map<string, string>
  esAdmin?: boolean
  faseInicial?: string | null
  onIntercambiar?: (slotA: Slot, slotB: Slot) => void | Promise<void>
}) {
  // En celu NO montamos el cuadro SVG (divs absolutos + conectores): con
  // display:none React lo reconcilía igual y reventaba la pestaña (OOM club).
  const [isMobile, setIsMobile] = useState(false)
  const [dragSlot, setDragSlot] = useState<Slot | null>(null)
  const [dragOver, setDragOver] = useState<Slot | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const playoff = props.partidos.filter(p => p.fase !== 'grupos')
  if (!playoff.length) return null

  const fases = fasesBracket(playoff)
  const fasesMainAll = fases.filter(f => f !== 'tercer_lugar')
  const porFase = new Map<string, PartidoBracket[]>()
  for (const f of fases) {
    porFase.set(f, playoff.filter(p => p.fase === f).sort((a, b) => a.orden - b.orden))
  }
  // El árbol de 32avos queda enorme y vacío: el cuadro visual arranca
  // en la primera ronda con 8 cruces o menos (8vos en un cuadro de 64).
  const idxArbol = fasesMainAll.findIndex(f => {
    const n = porFase.get(f)?.length || 0
    return n > 0 && n <= 8
  })
  const fasesMain = idxArbol >= 0 ? fasesMainAll.slice(idxArbol) : []
  const rondasOcultas = idxArbol > 0
    ? fasesMainAll.slice(0, idxArbol)
    : idxArbol < 0 ? fasesMainAll : []

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

  function puedeMoverPartido(p: PartidoBracket) {
    return Boolean(
      props.esAdmin && props.faseInicial && p.fase === props.faseInicial
      && !(p.ganador_id && p.inscrito_b_id) && props.onIntercambiar,
    )
  }

  const hintDrag = props.esAdmin && props.faseInicial && props.onIntercambiar
    && fasesMain.includes(props.faseInicial) && (
    <p style={{ fontSize: 12, color: torneoUi.muted, margin: '0 0 10px' }}>
      Arrastra jugadores en la ronda inicial para intercambiar cupos.
    </p>
  )
  const hintOcultas = rondasOcultas.length > 0 && (
    <p style={{ fontSize: 12, color: torneoUi.muted, margin: '0 0 10px' }}>
      {fasesMain.length
        ? `Cuadro desde ${FASE_LABELS[fasesMain[0]] || fasesMain[0]}. ${rondasOcultas.map(f => FASE_LABELS[f] || f).join(', ')} se ven con el filtro de arriba.`
        : 'Este cuadro es grande: usá los filtros de ronda (32vos, 16vos…) para cargar resultados.'}
    </p>
  )

  // —— Móvil: lista grande por fase (sin SVG) ——
  if (isMobile) {
    return (
      <div>
        {hintDrag}
        {hintOcultas}
        {[...fasesMain, ...(porFase.get('tercer_lugar')?.length ? ['tercer_lugar'] : [])].map(fase => {
          const ps = porFase.get(fase) || []
          if (!ps.length) return null
          return (
            <div key={fase} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 11, color: torneoUi.muted, textTransform: 'uppercase',
                letterSpacing: '1px', fontWeight: 700, marginBottom: 8,
              }}>
                {FASE_LABELS[fase] || fase}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ps.map((p, i) => {
                  const esBye = !p.inscrito_b_id
                  const ganoA = p.ganador_id === p.inscrito_a_id
                  const ganoB = p.ganador_id === p.inscrito_b_id
                  const mover = puedeMoverPartido(p)

                  const Lado = (pos: 'inscrito_a' | 'inscrito_b') => {
                    const gano = pos === 'inscrito_a' ? ganoA : ganoB
                    const id = pos === 'inscrito_a' ? p.inscrito_a_id : p.inscrito_b_id
                    const label = nombreSlot(p, pos, props.nombrePorId)
                    const definido = !!id
                    const esByeSlot = pos === 'inscrito_b' && esBye
                    return (
                      <div
                        draggable={mover && definido}
                        onDragStart={mover && definido ? () => setDragSlot({ partidoId: p.id, posicion: pos }) : undefined}
                        onDragOver={mover ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: pos }) } : undefined}
                        onDrop={mover ? (e) => { e.preventDefault(); void soltar(p.id, pos) } : undefined}
                        onDragEnd={() => { setDragSlot(null); setDragOver(null) }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 8, padding: '13px 14px',
                          background: dragOver?.partidoId === p.id && dragOver?.posicion === pos
                            ? '#dbeafe'
                            : gano ? '#f0fdf4' : 'transparent',
                          color: gano ? torneoUi.success : (definido || esByeSlot ? torneoUi.text : torneoUi.hint),
                          fontStyle: definido && !esByeSlot ? 'normal' : 'italic',
                          fontWeight: gano ? 700 : 500,
                          fontSize: 15,
                          cursor: mover && definido ? 'grab' : 'default',
                          opacity: dragSlot?.partidoId === p.id && dragSlot?.posicion === pos ? 0.45 : 1,
                          borderTop: pos === 'inscrito_b' ? '1px solid #f1f5f9' : undefined,
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {esByeSlot ? 'BYE (pasa directo)' : label}
                        </span>
                        {gano && <span style={{ color: torneoUi.success, fontSize: 15, flexShrink: 0 }}>✓</span>}
                      </div>
                    )
                  }

                  return (
                    <div key={p.id} style={{
                      ...torneoUi.card,
                      borderRadius: 12,
                      overflow: 'hidden',
                      boxShadow: '0 1px 4px rgba(15,23,42,0.07)',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#3730a3' }}>Llave {i + 1}</span>
                        {p.ganador_id && p.inscrito_b_id && (
                          <span style={{ fontSize: 10, color: torneoUi.success }}>
                            {formatearSets(p.sets)}{etiquetaCierreOficial(p.tipo_cierre, p.es_walkover) ? ` · ${etiquetaCierreOficial(p.tipo_cierre, p.es_walkover)}` : ''}
                          </span>
                        )}
                      </div>
                      {Lado('inscrito_a')}
                      {Lado('inscrito_b')}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // —— Desktop: cuadro con conectores SVG ——
  const CARD_H = 56
  const SLOT_H = 64
  const COL_W = 168
  const CONN_W = 16

  const byFase: Record<string, PartidoBracket[]> = {}
  for (const f of fasesMain) byFase[f] = porFase.get(f) || []

  const N0 = byFase[fasesMain[0]]?.length || 1
  const expectedN: Record<string, number> = {}
  fasesMain.forEach((f, i) => { expectedN[f] = Math.max(1, Math.round(N0 / (2 ** i))) })
  const totalH = N0 * SLOT_H
  const cy = (orden: number, N: number) => ((orden + 0.5) / N) * totalH

  const tercer = porFase.get('tercer_lugar') || []

  return (
    <div>
      {hintDrag}
      {hintOcultas}
      {fasesMain.length > 0 && (
      <div style={{ overflowX: 'auto', paddingBottom: 12, paddingTop: 36 }}>
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {fasesMain.flatMap((fase, pi) => {
            const ps = byFase[fase] || []
            const isLast = pi === fasesMain.length - 1

            const col = (
              <div key={fase} style={{ width: COL_W, position: 'relative', height: totalH }}>
                <div style={{
                  position: 'absolute', top: -36, left: 0, right: 0,
                  fontSize: 10, color: torneoUi.muted, textTransform: 'uppercase',
                  letterSpacing: '1px', textAlign: 'center', background: '#f4f7fa',
                  padding: '3px 6px', borderRadius: 5,
                }}>
                  {FASE_LABELS[fase] || fase}
                </div>
                {ps.map((p, i) => {
                  const eN = expectedN[fase] ?? ps.length
                  const top = cy(i, eN) - CARD_H / 2
                  const esBye = !p.inscrito_b_id
                  const ganoA = p.ganador_id === p.inscrito_a_id
                  const ganoB = p.ganador_id === p.inscrito_b_id
                  const mover = puedeMoverPartido(p)

                  const slotStyle = (pos: 'inscrito_a' | 'inscrito_b', gano: boolean): CSSProperties => ({
                    height: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 10px',
                    borderBottom: pos === 'inscrito_a' ? '1px solid #f1f5f9' : undefined,
                    background: dragOver?.partidoId === p.id && dragOver?.posicion === pos
                      ? '#dbeafe'
                      : gano ? '#f0fdf4' : 'transparent',
                    cursor: mover && (pos === 'inscrito_a' ? p.inscrito_a_id : p.inscrito_b_id) ? 'grab' : 'default',
                    opacity: dragSlot?.partidoId === p.id && dragSlot?.posicion === pos ? 0.45 : 1,
                  })

                  return (
                    <div key={p.id} style={{
                      position: 'absolute', left: 0, right: 0, top, height: CARD_H,
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                      overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,0.07)',
                    }}>
                      <div
                        draggable={mover && !!p.inscrito_a_id}
                        onDragStart={mover && p.inscrito_a_id ? () => setDragSlot({ partidoId: p.id, posicion: 'inscrito_a' }) : undefined}
                        onDragOver={mover ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'inscrito_a' }) } : undefined}
                        onDrop={mover ? (e) => { e.preventDefault(); void soltar(p.id, 'inscrito_a') } : undefined}
                        onDragEnd={() => { setDragSlot(null); setDragOver(null) }}
                        style={slotStyle('inscrito_a', ganoA)}
                      >
                        <span style={{
                          fontSize: 12,
                          color: ganoA ? torneoUi.success : (p.inscrito_a_id ? torneoUi.text : torneoUi.hint),
                          fontStyle: p.inscrito_a_id ? 'normal' : 'italic',
                          fontWeight: ganoA ? 700 : 400,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                        }}>
                          <span style={{
                            fontSize: 9, background: torneoUi.accentLight, color: '#3730a3',
                            padding: '1px 3px', borderRadius: 3, marginRight: 4,
                          }}>{i * 2 + 1}</span>
                          {nombreSlot(p, 'inscrito_a', props.nombrePorId)}
                        </span>
                        {ganoA && <span style={{ color: torneoUi.success, fontSize: 11, marginLeft: 4 }}>✓</span>}
                      </div>
                      {esBye ? (
                        <div
                          onDragOver={mover ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'inscrito_b' }) } : undefined}
                          onDrop={mover ? (e) => { e.preventDefault(); void soltar(p.id, 'inscrito_b') } : undefined}
                          style={{
                            ...slotStyle('inscrito_b', false),
                            fontSize: 11, color: torneoUi.hint, fontStyle: 'italic',
                          }}
                        >
                          BYE
                        </div>
                      ) : (
                        <div
                          draggable={mover && !!p.inscrito_b_id}
                          onDragStart={mover && p.inscrito_b_id ? () => setDragSlot({ partidoId: p.id, posicion: 'inscrito_b' }) : undefined}
                          onDragOver={mover ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'inscrito_b' }) } : undefined}
                          onDrop={mover ? (e) => { e.preventDefault(); void soltar(p.id, 'inscrito_b') } : undefined}
                          onDragEnd={() => { setDragSlot(null); setDragOver(null) }}
                          style={slotStyle('inscrito_b', ganoB)}
                        >
                          <span style={{
                            fontSize: 12,
                            color: ganoB ? torneoUi.success : (p.inscrito_b_id ? torneoUi.text : torneoUi.hint),
                            fontStyle: p.inscrito_b_id ? 'normal' : 'italic',
                            fontWeight: ganoB ? 700 : 400,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                          }}>
                            <span style={{
                              fontSize: 9, background: torneoUi.accentLight, color: '#3730a3',
                              padding: '1px 3px', borderRadius: 3, marginRight: 4,
                            }}>{i * 2 + 2}</span>
                            {nombreSlot(p, 'inscrito_b', props.nombrePorId)}
                          </span>
                          {ganoB && <span style={{ color: torneoUi.success, fontSize: 11, marginLeft: 4 }}>✓</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )

            if (isLast) return [col]

            const nextFase = fasesMain[pi + 1]
            const eN = expectedN[fase] ?? ps.length
            const eN2 = expectedN[nextFase] ?? Math.max(1, Math.round(eN / 2))
            const connector = (
              <svg key={`conn-${pi}`} width={CONN_W} height={totalH} style={{ flexShrink: 0, display: 'block' }}>
                {Array.from({ length: eN2 }, (_, j) => {
                  const ordA = j * 2
                  const ordB = j * 2 + 1
                  const y1 = cy(ordA, eN)
                  const y2 = cy(ordB, eN)
                  const ym = cy(j, eN2)
                  const mx = CONN_W / 2
                  return ordA === ordB
                    ? <path key={j} d={`M 0,${y1} H ${CONN_W}`} stroke={torneoUi.accentBorder} strokeWidth={1.5} fill="none" />
                    : <path key={j} d={`M 0,${y1} H ${mx} V ${y2} M 0,${y2} H ${mx} M ${mx},${ym} H ${CONN_W}`} stroke={torneoUi.accentBorder} strokeWidth={1.5} fill="none" />
                })}
              </svg>
            )

            return [col, connector]
          })}
        </div>
      </div>
      )}

      {tercer.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontSize: 10, color: torneoUi.muted, textTransform: 'uppercase',
            letterSpacing: '1px', marginBottom: 8, fontWeight: 700,
          }}>
            {FASE_LABELS.tercer_lugar || '3er lugar'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {tercer.map((p, i) => {
              const ganoA = p.ganador_id === p.inscrito_a_id
              const ganoB = p.ganador_id === p.inscrito_b_id
              return (
                <div key={p.id} style={{
                  width: COL_W, background: '#fff', border: '1px solid #e2e8f0',
                  borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,0.07)',
                }}>
                  <div style={{
                    padding: '4px 10px', fontSize: 10, color: '#3730a3', fontWeight: 700,
                    background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                  }}>
                    Llave {i + 1}
                  </div>
                  <div style={{
                    padding: '8px 10px', fontSize: 12, borderBottom: '1px solid #f1f5f9',
                    background: ganoA ? '#f0fdf4' : '#fff',
                    fontWeight: ganoA ? 700 : 400,
                    color: ganoA ? torneoUi.success : torneoUi.text,
                  }}>
                    {nombreSlot(p, 'inscrito_a', props.nombrePorId)}{ganoA ? ' ✓' : ''}
                  </div>
                  <div style={{
                    padding: '8px 10px', fontSize: 12,
                    background: ganoB ? '#f0fdf4' : '#fff',
                    fontWeight: ganoB ? 700 : 400,
                    color: ganoB ? torneoUi.success : torneoUi.text,
                  }}>
                    {nombreSlot(p, 'inscrito_b', props.nombrePorId)}{ganoB ? ' ✓' : ''}
                  </div>
                  {p.ganador_id && p.inscrito_b_id && (
                    <div style={{ padding: '4px 10px', fontSize: 10, color: torneoUi.muted, background: '#f8fafc' }}>
                      {formatearSets(p.sets)}{etiquetaCierreOficial(p.tipo_cierre, p.es_walkover) ? ` · ${etiquetaCierreOficial(p.tipo_cierre, p.es_walkover)}` : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
