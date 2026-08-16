'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { TABLA_PUNTAJE } from '@/lib/domain/puntajeTorneo'
import {
  introSegunTipo,
  MANUAL_VERSION,
  SECCIONES_MANUAL_TORNEOS,
  type TipoManualTorneo,
} from '@/lib/torneos/manual-contenido'

const STORAGE = 'cmsports:manual-torneos'

type Props = {
  tipo: TipoManualTorneo
  /** En el listado va abierto. En el torneo en curso, cerrado en una barra. */
  compacto?: boolean
  /** Filtra esta sección al montar (fase actual). */
  seccionInicial?: string
}

export default function ManualTorneos({ tipo, compacto = false, seccionInicial }: Props) {
  const intro = introSegunTipo(tipo)
  const [abierto, setAbierto] = useState(!compacto)
  const [seccion, setSeccion] = useState<string | null>(seccionInicial ?? null)

  useEffect(() => {
    if (compacto) return
    try {
      const v = sessionStorage.getItem(`${STORAGE}:${tipo}`)
      if (v === 'cerrado') setAbierto(false)
      if (v === 'abierto') setAbierto(true)
    } catch { /* noop */ }
  }, [compacto, tipo])

  function togglePanel() {
    const siguiente = !abierto
    setAbierto(siguiente)
    if (!compacto) {
      try { sessionStorage.setItem(`${STORAGE}:${tipo}`, siguiente ? 'abierto' : 'cerrado') } catch { /* noop */ }
    }
  }

  return (
    <div style={{
      background: abierto ? '#fff' : '#f8fafc',
      border: `1px solid ${abierto ? '#c4b5fd' : '#e2e8f0'}`,
      borderRadius: 14,
      marginBottom: 16,
      overflow: 'hidden',
      boxShadow: abierto ? '0 4px 16px rgba(76,29,149,0.08)' : 'none',
    }}>
      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={abierto}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          background: abierto ? 'linear-gradient(135deg,#4c1d95,#6d28d9)' : '#fff',
          color: abierto ? '#fff' : '#0f172a', border: 0, padding: '12px 16px', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 16 }} aria-hidden>📖</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>
            Manual de torneos · reglas y uso
          </span>
          <span style={{ display: 'block', fontSize: 11, opacity: abierto ? 0.85 : 0.65, marginTop: 2 }}>
            {intro.titulo} · {abierto ? 'Cómo se arma, BYEs, ranking, plata y en vivo' : 'Toca para ver todas las reglas'}
          </span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{abierto ? 'Cerrar' : 'Abrir'}</span>
      </button>

      {abierto && (
        <div style={{ padding: '14px 16px 18px' }}>
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
