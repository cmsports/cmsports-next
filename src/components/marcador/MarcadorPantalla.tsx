'use client'

import type { CSSProperties } from 'react'
import type { EstadoMarcador, FormatoPartido, Lado } from '@/lib/marcador-oficial'

export default function MarcadorPantalla(props: {
  nombreA: string
  nombreB: string
  estado: EstadoMarcador
  formato: FormatoPartido
  cerrado?: boolean
  cerrando?: boolean
  onPunto: (lado: Lado) => void
  onDeshacer: (lado: Lado) => void
  subtitulo?: string
}) {
  const bloqueado = props.cerrado || props.estado.finalizado || props.cerrando

  return (
    <div>
      {props.subtitulo && (
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, textAlign: 'center' }}>
          {props.subtitulo} · {props.formato.toUpperCase()}
        </p>
      )}

      <div style={marcadorCard}>
        <div style={{ ...filaJugador, background: '#eff6ff' }}>
          <div>
            <div style={nombreStyle}>{props.nombreA}</div>
            <div style={gamesStyle}>{props.estado.games_a} sets</div>
          </div>
          <div style={puntosStyle}>{props.estado.puntos_a}</div>
          {!bloqueado && (
            <div style={botonesLado}>
              <button type="button" onClick={() => props.onPunto('a')} style={btnPunto}>+1</button>
              <button type="button" onClick={() => props.onDeshacer('a')} style={btnDeshacer}>↩</button>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', padding: '8px 0', color: '#94a3b8', fontSize: 12 }}>
          Set {props.estado.juego_actual}
          {props.estado.historial_sets.length > 0 && (
            <span> · {props.estado.historial_sets.map(([a, b]) => `${a}-${b}`).join(' · ')}</span>
          )}
        </div>

        <div style={{ ...filaJugador, background: '#fdf2f8' }}>
          <div>
            <div style={nombreStyle}>{props.nombreB}</div>
            <div style={gamesStyle}>{props.estado.games_b} sets</div>
          </div>
          <div style={puntosStyle}>{props.estado.puntos_b}</div>
          {!bloqueado && (
            <div style={botonesLado}>
              <button type="button" onClick={() => props.onPunto('b')} style={btnPunto}>+1</button>
              <button type="button" onClick={() => props.onDeshacer('b')} style={btnDeshacer}>↩</button>
            </div>
          )}
        </div>
      </div>

      {bloqueado && (
        <p style={{ textAlign: 'center', marginTop: 16, color: '#16a34a', fontWeight: 600 }}>
          {props.cerrando ? 'Guardando resultado…' : props.cerrado ? 'Partido cerrado' : 'Partido finalizado'}
        </p>
      )}
    </div>
  )
}

const marcadorCard: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
}

const filaJugador: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto',
  gap: 12,
  alignItems: 'center',
  padding: '20px 16px',
}

const nombreStyle: CSSProperties = { fontSize: 16, fontWeight: 600, color: '#0f172a' }
const gamesStyle: CSSProperties = { fontSize: 12, color: '#64748b', marginTop: 2 }
const puntosStyle: CSSProperties = { fontSize: 48, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'center' }
const botonesLado: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const btnPunto: CSSProperties = {
  background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8,
  width: 52, height: 44, fontSize: 18, fontWeight: 700, cursor: 'pointer',
}
const btnDeshacer: CSSProperties = {
  background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8,
  width: 52, height: 32, fontSize: 14, cursor: 'pointer',
}
