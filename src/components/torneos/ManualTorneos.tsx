'use client'

import { useState, type CSSProperties } from 'react'
import { TABLA_PUNTAJE } from '@/lib/domain/puntajeTorneo'
import {
  introSegunTipo,
  MANUAL_VERSION,
  SECCIONES_MANUAL_TORNEOS,
  type TipoManualTorneo,
} from '@/lib/torneos/manual-contenido'

type Props = {
  tipo: TipoManualTorneo
  /** Filtra esta sección al abrir (fase actual del torneo). */
  seccionInicial?: string
}

export default function ManualTorneos({ tipo, seccionInicial }: Props) {
  const intro = introSegunTipo(tipo)
  const [abierto, setAbierto] = useState(false)
  const [seccion, setSeccion] = useState<string | null>(seccionInicial ?? null)

  return (
    <div style={{ marginBottom: abierto ? 16 : 12 }}>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: abierto ? '#6d28d9' : '#fff',
          color: abierto ? '#fff' : '#5b21b6',
          border: `1px solid ${abierto ? '#6d28d9' : '#c4b5fd'}`,
          borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        📖 Manual de reglas {abierto ? '▴' : '▾'}
      </button>

      {abierto && (
        <div style={{
          marginTop: 10, background: '#fff', border: '1px solid #c4b5fd', borderRadius: 14,
          padding: '14px 16px 18px', boxShadow: '0 4px 16px rgba(76,29,149,0.08)',
        }}>
          <div style={{
            background: tipo === 'interno' ? '#f5f3ff' : '#fff7ed',
            border: `1px solid ${tipo === 'interno' ? '#ddd6fe' : '#fed7aa'}`,
            borderRadius: 12, padding: '12px 14px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: tipo === 'interno' ? '#5b21b6' : '#9a3412' }}>
              {intro.titulo}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: '#334155' }}>{intro.texto}</p>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>Actualizado {MANUAL_VERSION}</div>
          </div>

          {tipo === 'interno' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {TABLA_PUNTAJE.map(({ puesto, puntos }) => (
                <div key={puesto} style={{ background: '#ede9fe', borderRadius: 8, padding: '5px 10px', fontSize: 11, color: '#3730a3', fontWeight: 600 }}>
                  {puesto} = <strong>{puntos} pts</strong>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setSeccion(null)}
              style={chip(seccion === null)}
            >
              Ver todo
            </button>
            {SECCIONES_MANUAL_TORNEOS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSeccion(s.id)}
                style={chip(seccion === s.id)}
              >
                {s.titulo}
              </button>
            ))}
          </div>

          {SECCIONES_MANUAL_TORNEOS.map(s => {
            if (seccion && seccion !== s.id) return null
            return (
              <article key={s.id} id={`manual-${s.id}`} style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10,
              }}>
                <h2 style={{ margin: 0, fontSize: 15, color: '#0f172a' }}>{s.titulo}</h2>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>{s.resumen}</p>
                {s.bloques.map((b, i) => (
                  <div key={i} style={{ marginTop: 10 }}>
                    {b.subtitulo && (
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#4c1d95', marginBottom: 4 }}>{b.subtitulo}</div>
                    )}
                    <ul style={{ margin: 0, paddingLeft: 18, color: '#334155', fontSize: 13, lineHeight: 1.55 }}>
                      {b.items.map(item => <li key={item} style={{ marginBottom: 4 }}>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function chip(activo: boolean): CSSProperties {
  return {
    border: `1px solid ${activo ? '#7c3aed' : '#e2e8f0'}`,
    background: activo ? '#7c3aed' : '#fff',
    color: activo ? '#fff' : '#475569',
    borderRadius: 20, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  }
}
