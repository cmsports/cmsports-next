'use client'

import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { copiarTexto } from '@/lib/clipboard'

// El cronómetro del plan de rendimiento, con botón. Llama a
// /api/diagnostico-rendimiento dos veces seguidas: la primera puede pillar
// al servidor recién despierto (arranque en frío); la segunda es el tiempo
// normal. Muestra las dos y deja copiar el JSON crudo para pegarlo.

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12 } as const
const text = '#0f172a', muted = '#64748b', hint = '#94a3b8'

type Medicion = {
  servidor: { region: string; entorno: string; node: string }
  instancia: { viva_segundos: number; arranque_en_frio_probable: boolean; uptime_proceso_segundos: number }
  sesion_con_viaje_ms: number
  sesion_sin_viaje_ms: number
  perfil_ms: number
  consulta_base: { muestras_ms: number[]; minima_ms: number; mediana_ms: number }
  base: { host: string }
}

type Toma = { desdeNavegadorMs: number; datos: Medicion }

export default function RendimientoPage() {
  const [tomas, setTomas] = useState<Toma[]>([])
  const [midiendo, setMidiendo] = useState(false)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)

  async function medirUna(): Promise<Toma> {
    const t0 = performance.now()
    const res = await fetch('/api/diagnostico-rendimiento', { cache: 'no-store' })
    const ms = Math.round(performance.now() - t0)
    if (!res.ok) {
      const cuerpo = await res.json().catch(() => null)
      throw new Error(cuerpo?.error || `El servidor respondió ${res.status}`)
    }
    return { desdeNavegadorMs: ms, datos: (await res.json()) as Medicion }
  }

  async function medir() {
    if (midiendo) return
    setMidiendo(true)
    setError('')
    setCopiado(false)
    try {
      const primera = await medirUna()
      await new Promise(r => setTimeout(r, 800))
      const segunda = await medirUna()
      setTomas([primera, segunda])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMidiendo(false)
    }
  }

  const Fila = ({ nombre, valores, nota }: { nombre: string; valores: (string | number)[]; nota?: string }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8, padding: '9px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, alignItems: 'baseline' }}>
      <div>
        <div style={{ color: text }}>{nombre}</div>
        {nota && <div style={{ fontSize: 11, color: hint }}>{nota}</div>}
      </div>
      {valores.map((v, i) => (
        <div key={i} style={{ fontFamily: 'monospace', fontWeight: 700, color: text, textAlign: 'right' }}>{v}</div>
      ))}
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Gauge size={20} color="#4f46e5" />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: text, margin: 0 }}>Cronómetro del servidor</h1>
      </div>
      <p style={{ fontSize: 13, color: muted, marginBottom: 16, lineHeight: 1.5 }}>
        Mide cuánto tarda cada pieza de una petición desde el servidor. Se toman dos medidas seguidas:
        la primera puede pillar al servidor recién despierto; la segunda es el tiempo normal.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={medir} disabled={midiendo}
          style={{ background: midiendo ? '#94a3b8' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: midiendo ? 'wait' : 'pointer' }}>
          {midiendo ? 'Midiendo…' : tomas.length ? '⟳ Medir de nuevo' : '▶ Medir'}
        </button>
        {tomas.length > 0 && (
          <button onClick={async () => { await copiarTexto(JSON.stringify(tomas, null, 2)); setCopiado(true) }}
            style={{ background: '#fff', color: muted, border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 13, cursor: 'pointer' }}>
            {copiado ? '✓ Copiado' : 'Copiar resultado'}
          </button>
        )}
        {error && <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>}
      </div>

      {tomas.length === 2 && (() => {
        const [a, b] = tomas
        return (
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8, padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <div>Milisegundos</div>
              <div style={{ textAlign: 'right' }}>1ª toma</div>
              <div style={{ textAlign: 'right' }}>2ª toma</div>
            </div>
            <Fila nombre="Ida y vuelta desde este navegador" nota="lo que ve el usuario para esta petición completa"
              valores={[a.desdeNavegadorMs, b.desdeNavegadorMs]} />
            <Fila nombre="Servidor despierto hace" nota="segundos; pocos = arranque en frío"
              valores={[`${a.datos.instancia.viva_segundos} s${a.datos.instancia.arranque_en_frio_probable ? ' ❄️' : ''}`, `${b.datos.instancia.viva_segundos} s${b.datos.instancia.arranque_en_frio_probable ? ' ❄️' : ''}`]} />
            <Fila nombre="Verificar sesión CON viaje (getUser)" nota="lo que pagan hoy las acciones en cada clic"
              valores={[a.datos.sesion_con_viaje_ms, b.datos.sesion_con_viaje_ms]} />
            <Fila nombre="Verificar sesión SIN viaje (getClaims)" nota="lo que pagarían con el punto 2 del plan"
              valores={[a.datos.sesion_sin_viaje_ms, b.datos.sesion_sin_viaje_ms]} />
            <Fila nombre="Consulta a perfiles" valores={[a.datos.perfil_ms, b.datos.perfil_ms]} />
            <Fila nombre="Una consulta a la base (mediana de 5)" nota="~15 = al lado; ~130 = en otra región"
              valores={[a.datos.consulta_base.mediana_ms, b.datos.consulta_base.mediana_ms]} />
            <Fila nombre="Consulta más rápida de las 5" valores={[a.datos.consulta_base.minima_ms, b.datos.consulta_base.minima_ms]} />
            <div style={{ padding: '10px 14px', fontSize: 11, color: hint }}>
              Servidor en <strong>{b.datos.servidor.region}</strong> · base en <strong>{b.datos.base.host}</strong> · {b.datos.servidor.entorno} · Node {b.datos.servidor.node}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
