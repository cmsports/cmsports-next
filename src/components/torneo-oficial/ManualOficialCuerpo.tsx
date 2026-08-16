'use client'

import { useEffect, useState } from 'react'
import { MANUAL_REGLAS, MANUAL_USO, type BloqueManual } from '@/lib/torneo-oficial/manual-contenido'
import { torneoUi } from '@/lib/torneos/ui-tokens'

export type TabManualOficial = 'uso' | 'reglas'

const card = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
} as const

export default function ManualOficialCuerpo(props: {
  tab: TabManualOficial
  onTab: (t: TabManualOficial) => void
  ocultarTabs?: boolean
}) {
  const bloques = props.tab === 'uso' ? MANUAL_USO : MANUAL_REGLAS

  return (
    <div>
      {!props.ocultarTabs && (
        <div style={{ display: 'flex', gap: 8, margin: '0 0 16px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => props.onTab('uso')} style={props.tab === 'uso' ? tabActivo : tabInactivo}>
            Cómo usar la app
          </button>
          <button type="button" onClick={() => props.onTab('reglas')} style={props.tab === 'reglas' ? tabActivo : tabInactivo}>
            Reglas / bases
          </button>
        </div>
      )}

      <p style={{ margin: '0 0 12px', color: torneoUi.muted, fontSize: 13, lineHeight: 1.5 }}>
        {props.tab === 'uso'
          ? 'Paso a paso, con los nombres de los botones que ves en la pantalla. Pensado para armar el zonal el mismo día.'
          : 'Las bases con las que la app decide grupos, puntos, W.O. y llaves. Es lo que un juez tiene que tener claro antes de discutir un resultado.'}
      </p>

      <nav style={{
        ...card,
        padding: 12,
        marginBottom: 14,
        background: '#f8fafc',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: torneoUi.muted, marginBottom: 6, letterSpacing: 0.4 }}>
          EN ESTA PESTAÑA
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {bloques.map(b => (
            <a
              key={b.id}
              href={`#${b.id}`}
              style={{
                fontSize: 12,
                color: '#4338ca',
                background: '#eef2ff',
                borderRadius: 999,
                padding: '4px 10px',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {b.titulo}
            </a>
          ))}
        </div>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {bloques.map((b, i) => (
          <Bloque key={b.id} bloque={b} numero={i + 1} />
        ))}
      </div>
    </div>
  )
}

function Bloque({ bloque, numero }: { bloque: BloqueManual; numero: number }) {
  return (
    <article id={bloque.id} style={card}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 8,
          background: '#eef2ff',
          color: '#3730a3',
          fontSize: 13,
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {numero}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, color: torneoUi.text, fontSize: 16 }}>{bloque.titulo}</h2>
          {bloque.resumen && (
            <p style={{ margin: '4px 0 0', color: '#4338ca', fontSize: 12, fontWeight: 600 }}>{bloque.resumen}</p>
          )}
          {bloque.parrafos.map(p => (
            <p key={p.slice(0, 40)} style={{ margin: '8px 0 0', color: '#334155', fontSize: 13, lineHeight: 1.55 }}>{p}</p>
          ))}
          {bloque.pasos && bloque.pasos.length > 0 && (
            <ol style={{ margin: '10px 0 0', paddingLeft: 18, color: '#0f172a', fontSize: 13, lineHeight: 1.55 }}>
              {bloque.pasos.map(s => <li key={s.slice(0, 48)} style={{ marginBottom: 6 }}>{s}</li>)}
            </ol>
          )}
          {bloque.notas && bloque.notas.length > 0 && (
            <div style={{
              marginTop: 12,
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 10,
              padding: '8px 12px',
            }}>
              {bloque.notas.map(n => (
                <p key={n.slice(0, 40)} style={{ margin: '0 0 4px', color: '#92400e', fontSize: 12, lineHeight: 1.5 }}>
                  {n}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

const tabActivo = {
  border: 0,
  borderRadius: 8,
  padding: '9px 14px',
  background: '#4f46e5',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
} as const

const tabInactivo = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '9px 14px',
  background: '#fff',
  color: '#475569',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
} as const

/** Lee ?vista= o #reglas / #uso */
export function tabDesdeUrl(): TabManualOficial {
  if (typeof window === 'undefined') return 'uso'
  const q = new URLSearchParams(window.location.search).get('vista')
  if (q === 'reglas' || q === 'uso') return q
  if (window.location.hash === '#reglas') return 'reglas'
  if (window.location.hash === '#uso') return 'uso'
  return 'uso'
}

export function ManualOficialConUrl() {
  const [tab, setTab] = useState<TabManualOficial>('uso')

  useEffect(() => {
    setTab(tabDesdeUrl())
  }, [])

  function onTab(t: TabManualOficial) {
    setTab(t)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('vista', t)
    url.hash = ''
    window.history.replaceState(null, '', url.pathname + url.search)
  }

  return <ManualOficialCuerpo tab={tab} onTab={onTab} />
}
