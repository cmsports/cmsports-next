'use client'

import { useState } from 'react'

type Mensaje = { role: 'user' | 'assistant'; content: string }

const SUGERENCIAS = [
  'Resume el estado técnico actual y prioriza 3 focos para las próximas 2 semanas.',
  'Compara el mes actual con el anterior y dime qué mejoró y qué empeoró.',
  '¿Qué ejercicios o situaciones de video conviene trabajar según los errores y el golpe principal?',
]

export default function AsesorTecnicoIA({
  jugadorId,
  jugadorNombre,
  esStaff,
}: {
  jugadorId: string
  jugadorNombre: string
  esStaff: boolean
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [pregunta, setPregunta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  async function enviar(texto: string) {
    const q = texto.trim()
    if (!q || cargando) return
    setError('')
    setAviso('')
    setCargando(true)
    const historial = mensajes
    setMensajes(actuales => [...actuales, { role: 'user', content: q }])
    setPregunta('')
    try {
      const res = await fetch('/api/tecnico/asesor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugadorId, pregunta: q, historial }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo consultar al asesor.')
        setMensajes(actuales => actuales.slice(0, -1))
      } else {
        setMensajes(actuales => [...actuales, { role: 'assistant', content: data.respuesta }])
        setAviso(data.aviso || '')
      }
    } catch {
      setError('Error de red al consultar la IA.')
      setMensajes(actuales => actuales.slice(0, -1))
    }
    setCargando(false)
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: 16 }}>Asesor técnico IA</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>
            Analiza métricas, evaluaciones y planes de {jugadorNombre}. Sugiere, no decide. Límite: 5 cada 5 min / 30 al día.
          </p>
        </div>
        {!esStaff && <span style={badge}>Solo lectura publicada</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {SUGERENCIAS.map(s => (
          <button key={s} onClick={() => void enviar(s)} disabled={cargando} style={chip}>
            {s.length > 58 ? `${s.slice(0, 58)}…` : s}
          </button>
        ))}
      </div>

      <div style={{
        maxHeight: 280,
        overflow: 'auto',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {mensajes.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 12 }}>
            Pide un análisis o un consejo concreto. Ejemplo: “¿en qué falló más en partidos?”
          </div>
        )}
        {mensajes.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '92%',
              background: m.role === 'user' ? '#4f46e5' : '#fff',
              color: m.role === 'user' ? '#fff' : '#0f172a',
              border: m.role === 'user' ? 0 : '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '9px 11px',
              fontSize: 12,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
            }}
          >
            {m.content}
          </div>
        ))}
        {cargando && <div style={{ color: '#64748b', fontSize: 12 }}>Analizando métricas…</div>}
      </div>

      {error && <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 8, fontSize: 12, marginBottom: 10 }}>{error}</div>}
      {aviso && <div style={{ color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8, fontSize: 11, marginBottom: 10 }}>{aviso}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={pregunta}
          onChange={e => setPregunta(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(pregunta) } }}
          placeholder="Escribe tu pregunta o pide un consejo…"
          disabled={cargando}
          style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 11px', fontSize: 13 }}
        />
        <button onClick={() => void enviar(pregunta)} disabled={cargando || !pregunta.trim()} style={primary}>
          {cargando ? '…' : 'Preguntar'}
        </button>
      </div>
    </div>
  )
}

const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: 16,
  boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
} as const
const primary = { border: 0, borderRadius: 8, padding: '10px 14px', background: '#4f46e5', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' } as const
const chip = { border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', borderRadius: 999, padding: '6px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', textAlign: 'left' as const }
const badge = { background: '#f1f5f9', color: '#475569', borderRadius: 999, padding: '4px 8px', fontSize: 10, fontWeight: 700, height: 'fit-content' } as const
