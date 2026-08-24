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

// Un emoji por sección, en el mismo orden de SECCIONES_MANUAL_TORNEOS. Se busca
// por id y no por posición para que agregar una sección no corra todos los demás.
const ICONO: Record<string, string> = {
  'interno-externo': '🔀',
  'permisos-flujo': '🔑',
  crear: '➕',
  inscripcion: '📝',
  cabezas: '⭐',
  grupos: '👥',
  clasificacion: '🏅',
  llaves: '🗂️',
  byes: '⏭️',
  mover: '🔁',
  arrastre: '✋',
  resultados: '✅',
  tardios: '⏰',
  vivo: '📡',
  ranking: '📈',
  finanzas: '💵',
  cierre: '🏁',
  checklist: '📋',
}

export default function ManualTorneos({ tipo, seccionInicial }: Props) {
  const intro = introSegunTipo(tipo)
  const [abierto, setAbierto] = useState(false)
  const [seccion, setSeccion] = useState<string | null>(seccionInicial ?? null)

  const acento = tipo === 'interno' ? '#6d28d9' : '#c2410c'
  const acentoSuave = tipo === 'interno' ? '#f5f3ff' : '#fff7ed'
  const acentoBorde = tipo === 'interno' ? '#ddd6fe' : '#fed7aa'
  const visibles = SECCIONES_MANUAL_TORNEOS.filter(s => !seccion || seccion === s.id)

  return (
    <div style={{ marginBottom: abierto ? 16 : 12 }}>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: abierto ? acento : '#fff',
          color: abierto ? '#fff' : acento,
          border: `1px solid ${abierto ? acento : acentoBorde}`,
          borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          boxShadow: abierto ? 'none' : '0 1px 3px rgba(15,23,42,0.06)',
        }}
      >
        📖 Manual de reglas
        <span style={{ opacity: 0.7, fontSize: 11 }}>{abierto ? '▴' : '▾'}</span>
      </button>

      {abierto && (
        <div style={{
          marginTop: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
          overflow: 'hidden', boxShadow: '0 8px 28px rgba(15,23,42,0.10)',
        }}>
          {/* Portada */}
          <div style={{
            background: acentoSuave, borderBottom: `1px solid ${acentoBorde}`, padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: acento, letterSpacing: '-0.01em' }}>
                {intro.titulo}
              </h1>
              <span style={{
                background: '#fff', border: `1px solid ${acentoBorde}`, color: '#64748b',
                borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 600,
              }}>
                Actualizado {MANUAL_VERSION}
              </span>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: '#334155', maxWidth: '62ch' }}>
              {intro.texto}
            </p>

            {tipo === 'interno' && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Puntos de ranking por puesto
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TABLA_PUNTAJE.map(({ puesto, puntos }) => (
                    <div key={puesto} style={{
                      background: '#fff', border: '1px solid #ddd6fe', borderRadius: 8,
                      padding: '5px 10px', fontSize: 11, color: '#4c1d95', fontWeight: 600,
                    }}>
                      {puesto} <strong style={{ color: '#6d28d9' }}>{puntos}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Índice */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" onClick={() => setSeccion(null)} style={chip(seccion === null, acento)}>
                Ver todo
                <span style={{ opacity: 0.65, marginLeft: 5 }}>{SECCIONES_MANUAL_TORNEOS.length}</span>
              </button>
              {SECCIONES_MANUAL_TORNEOS.map(s => (
                <button key={s.id} type="button" onClick={() => setSeccion(s.id)} style={chip(seccion === s.id, acento)}>
                  <span style={{ marginRight: 5 }}>{ICONO[s.id] ?? '•'}</span>
                  {s.titulo}
                </button>
              ))}
            </div>
          </div>

          {/* Secciones */}
          <div style={{ padding: '16px 20px 20px' }}>
            {visibles.map((s, indice) => (
              <article
                key={s.id}
                id={`manual-${s.id}`}
                style={{
                  borderTop: indice === 0 ? 'none' : '1px solid #f1f5f9',
                  paddingTop: indice === 0 ? 0 : 18,
                  marginTop: indice === 0 ? 0 : 18,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: acentoSuave,
                    border: `1px solid ${acentoBorde}`, display: 'grid', placeItems: 'center', fontSize: 14,
                  }}>
                    {ICONO[s.id] ?? '•'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                      {s.titulo}
                    </h2>
                    <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.5, maxWidth: '68ch' }}>
                      {s.resumen}
                    </p>
                  </div>
                </div>

                {s.bloques.map((b, i) => (
                  <div key={i} style={{
                    marginTop: 12, marginLeft: 40,
                    background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '11px 14px',
                  }}>
                    {b.subtitulo && (
                      <div style={{
                        fontSize: 10.5, fontWeight: 800, color: acento, marginBottom: 7,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {b.subtitulo}
                      </div>
                    )}
                    <ul style={{ margin: 0, paddingLeft: 17, color: '#334155', fontSize: 13, lineHeight: 1.6 }}>
                      {b.items.map(item => (
                        <li key={item} style={{ marginBottom: 5, maxWidth: '76ch' }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            ))}

            {seccion && (
              <button
                type="button"
                onClick={() => setSeccion(null)}
                style={{
                  marginTop: 18, background: 'transparent', border: '1px solid #e2e8f0', color: '#64748b',
                  borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                ← Ver el manual completo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function chip(activo: boolean, acento: string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center',
    border: `1px solid ${activo ? acento : '#e2e8f0'}`,
    background: activo ? acento : '#fff',
    color: activo ? '#fff' : '#475569',
    borderRadius: 20, padding: '5px 11px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}
