'use client'

import { useMemo, type CSSProperties } from 'react'
import { torneoUi } from '@/lib/torneos/ui-tokens'

const FASE_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f43f5e', '#84cc16', '#ec4899', '#3b82f6',
]

function colorFase(nombre: string) {
  let h = 0
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) | 0
  return FASE_COLORS[Math.abs(h) % FASE_COLORS.length]
}

function iniciales(nombre: string) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return nombre.slice(0, 2).toUpperCase() || '?'
}

export type CeldaProgramaOficial = {
  id: string
  mesa: number
  hora: string
  faseLabel: string
  jugadorA: string
  jugadorB: string
  resultado?: string
  eventoNombre?: string
  estado: 'pendiente' | 'finalizado' | 'walkover' | 'retiro'
}

export type SinProgramarOficial = {
  id: string
  faseLabel: string
  jugadorA: string
  jugadorB: string
  eventoNombre?: string
}

type Props = {
  celdas: CeldaProgramaOficial[]
  sinProgramar?: SinProgramarOficial[]
  emptyMessage?: string
  /** Si hay config de campeonato, rellena columnas de mesa vacías 1..N */
  mesasCount?: number
}

export default function ProgramaOficialTablero({
  celdas,
  sinProgramar = [],
  emptyMessage = 'Sin partidos programados. Usa «Auto-programar» (configura mesas en el campeonato).',
  mesasCount,
}: Props) {
  const { bloques, mesas } = useMemo(() => {
    const horas = [...new Set(celdas.map(c => c.hora))].sort()
    const fromData = [...new Set(celdas.map(c => c.mesa).filter(m => m > 0))].sort((a, b) => a - b)
    const maxCfg = mesasCount && mesasCount > 0 ? mesasCount : 0
    const maxData = fromData[fromData.length - 1] ?? 0
    const max = Math.max(maxCfg, maxData)
    const listaMesas = max > 0
      ? Array.from({ length: max }, (_, i) => i + 1)
      : fromData
    return { bloques: horas, mesas: listaMesas }
  }, [celdas, mesasCount])

  const porCelda = useMemo(() => {
    const map = new Map<string, CeldaProgramaOficial>()
    for (const c of celdas) {
      if (c.mesa > 0 && c.hora) map.set(`${c.mesa}|${c.hora}`, c)
    }
    return map
  }, [celdas])

  if (celdas.length === 0) {
    return (
      <div>
        <div style={{ ...cardPad, padding: 24, color: torneoUi.muted, textAlign: 'center' }}>
          {emptyMessage}
        </div>
        {sinProgramar.length > 0 && <SinProgramarLista items={sinProgramar} />}
      </div>
    )
  }

  const finalizados = celdas.filter(c => c.estado !== 'pendiente').length
  const progPct = Math.round((finalizados / celdas.length) * 100)

  return (
    <div>
      <div style={headerStyle}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            Programa · mesa × horario
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
            {celdas.length} partido{celdas.length !== 1 ? 's' : ''} programado{celdas.length !== 1 ? 's' : ''}
            {sinProgramar.length > 0 ? ` · ${sinProgramar.length} sin ubicar` : ''}
          </div>
        </div>
        <div style={{ minWidth: 140 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Progreso</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{finalizados}/{celdas.length} · {progPct}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progPct}%`, background: 'linear-gradient(90deg,#6ee7b7,#10b981)', borderRadius: 99 }} />
          </div>
        </div>
      </div>

      <div style={{ ...torneoUi.card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(520, 100 + mesas.length * 170) }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }}>
                <th style={thSticky}>Horario</th>
                {mesas.map(m => (
                  <th key={m} style={thMesa}>🏓 Mesa {m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloques.map((bloque, bIdx) => (
                <tr key={bloque} style={{ borderBottom: '1px solid #f1f5f9', background: bIdx % 2 === 0 ? '#ffffff' : '#fafbff' }}>
                  <td style={{
                    ...tdHora,
                    background: bIdx % 2 === 0 ? '#ffffff' : '#fafbff',
                  }}>
                    {bloque}
                  </td>
                  {mesas.map(mesa => {
                    const p = porCelda.get(`${mesa}|${bloque}`)
                    return (
                      <td key={mesa} style={tdCelda}>
                        {p ? <PartidoCard p={p} /> : <div style={celdaVacia} />}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sinProgramar.length > 0 && <SinProgramarLista items={sinProgramar} />}
    </div>
  )
}

function PartidoCard({ p }: { p: CeldaProgramaOficial }) {
  const dc = colorFase(p.eventoNombre || p.faseLabel)
  const bg = p.estado === 'finalizado'
    ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)'
    : p.estado === 'walkover' || p.estado === 'retiro'
      ? 'linear-gradient(135deg,#fffbeb,#fef9c3)'
      : '#ffffff'
  const border = p.estado === 'finalizado' ? '#86efac'
    : p.estado === 'walkover' || p.estado === 'retiro' ? '#fcd34d' : '#e8edf5'

  return (
    <div style={{
      borderRadius: 12,
      background: bg,
      border: `1px solid ${border}`,
      borderLeft: `4px solid ${dc}`,
      padding: '10px 12px',
      boxShadow: p.estado === 'finalizado' ? '0 2px 8px rgba(16,185,129,0.12)' : '0 2px 8px rgba(15,23,42,0.06)',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 8,
        background: `${dc}18`, borderRadius: 20, padding: '2px 8px 2px 5px',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dc, flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: dc, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {p.eventoNombre ? `${p.eventoNombre} · ${p.faseLabel}` : p.faseLabel}
        </span>
      </div>

      {[p.jugadorA, p.jugadorB].map((nm, ji) => (
        <div key={ji} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: ji === 0 ? 3 : 0 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: dc, opacity: 0.85,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {iniciales(nm)}
          </div>
          <span style={{
            fontSize: 12, fontWeight: 700, color: torneoUi.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {nm}
          </span>
          {ji === 0 && <span style={{ fontSize: 9, color: torneoUi.hint, flexShrink: 0, marginLeft: 'auto' }}>vs</span>}
        </div>
      ))}

      {p.estado === 'finalizado' && p.resultado && (
        <div style={{
          marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '4px 8px',
        }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#15803d', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
            {p.resultado}
          </span>
          <span style={{ fontSize: 12 }}>✅</span>
        </div>
      )}
      {(p.estado === 'walkover' || p.estado === 'retiro') && (
        <div style={{
          marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 8, padding: '4px 10px',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#a16207' }}>
            {p.estado === 'retiro' ? 'Retiro' : '🏳️ Walkover'}
          </span>
          {p.resultado ? <span style={{ fontSize: 11, color: '#a16207' }}>{p.resultado}</span> : null}
        </div>
      )}
    </div>
  )
}

function SinProgramarLista({ items }: { items: SinProgramarOficial[] }) {
  return (
    <div style={{ ...torneoUi.card, padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          background: '#fef9c3', color: '#a16207', padding: '2px 10px', borderRadius: 20,
          fontSize: 12, fontWeight: 700, border: '1px solid #fcd34d',
        }}>
          Sin programar ({items.length})
        </span>
        <span style={{ fontSize: 11, color: torneoUi.hint }}>Partidos con jugadores pero sin mesa/horario</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map(p => {
          const dc = colorFase(p.eventoNombre || p.faseLabel)
          return (
            <div key={p.id} style={{
              borderRadius: 10, border: '1px solid #e2e8f0', borderLeft: `4px solid ${dc}`,
              background: '#f8fafc', padding: '8px 12px', minWidth: 170,
            }}>
              <div style={{ fontSize: 10, color: dc, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>
                {p.eventoNombre ? `${p.eventoNombre} · ${p.faseLabel}` : p.faseLabel}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: torneoUi.text }}>
                {p.jugadorA} vs {p.jugadorB}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const cardPad = torneoUi.card

const headerStyle: CSSProperties = {
  background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
  borderRadius: 16,
  padding: '16px 20px',
  marginBottom: 14,
  boxShadow: '0 8px 24px rgba(49,46,129,0.25)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 12,
}

const thSticky: CSSProperties = {
  position: 'sticky',
  left: 0,
  background: '#1e1b4b',
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 11,
  color: 'rgba(255,255,255,0.7)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1,
  zIndex: 1,
}

const thMesa: CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 11,
  color: 'rgba(255,255,255,0.7)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 1,
  minWidth: 170,
}

const tdHora: CSSProperties = {
  position: 'sticky',
  left: 0,
  padding: '10px 16px',
  fontSize: 12,
  fontWeight: 700,
  color: torneoUi.text,
  fontFamily: 'monospace',
  borderRight: '1px solid #f1f5f9',
  whiteSpace: 'nowrap',
  zIndex: 1,
}

const tdCelda: CSSProperties = {
  padding: 8,
  borderRight: '1px solid #f1f5f9',
  verticalAlign: 'top',
  minWidth: 170,
}

const celdaVacia: CSSProperties = {
  height: 52,
  borderRadius: 12,
  border: '1.5px dashed #e2e8f0',
  background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)',
}
