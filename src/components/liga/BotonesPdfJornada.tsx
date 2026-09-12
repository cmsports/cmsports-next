'use client'

import { useState } from 'react'
import { leerJornada } from '@/app/actions/ligaJornadas'

// Los papeles de una jornada (liga por jornadas):
//   · Programación: la hoja oficial que se publica.
//   · Planillas: una por mesa, con casillas para sets, ganador y firma.
//   · Resultados: cada partido con su marcador, para mandar al grupo.

const ink = '#0f172a', hint = '#94a3b8'

export function BotonesPdfJornada({ ligaId, numero, clubNombre, ligaNombre, pie, compacto = false }: {
  ligaId: string
  numero: number
  clubNombre: string
  ligaNombre: string
  pie?: string | null
  compacto?: boolean
}) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function bajar(tipo: 'programacion' | 'planillas' | 'resultados') {
    setOcupado(tipo); setError(null)
    try {
      const res = await leerJornada({ ligaId, numero })
      if (res.error || !res.jornada) { setError(res.error ?? 'No se pudo leer la jornada'); return }
      const pdf = await import('@/lib/liga-jornada-pdf')
      const meta = { clubNombre, ligaNombre, pie: pie ?? undefined }
      if (tipo === 'programacion') await pdf.descargarJornadaPdf(res.jornada, meta)
      else if (tipo === 'planillas') await pdf.descargarPlanillasJornadaPdf(res.jornada, meta)
      else await pdf.descargarResultadosJornadaPdf(res.jornada, meta)
    } finally {
      setOcupado(null)
    }
  }

  const estilo = {
    border: '1px solid #e2e8f0', borderRadius: 10, padding: compacto ? '6px 10px' : '7px 12px', fontSize: 12, fontWeight: 700,
    color: ink, background: '#fff', cursor: ocupado ? 'default' : 'pointer', whiteSpace: 'nowrap' as const,
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={() => bajar('programacion')} disabled={!!ocupado} style={estilo} title="La hoja oficial de la jornada, para publicar">
        {ocupado === 'programacion' ? '…' : `⬇ Programación J${numero}`}
      </button>
      <button onClick={() => bajar('planillas')} disabled={!!ocupado} style={estilo} title="Una hoja por mesa con casillas para los sets y la firma del árbitro">
        {ocupado === 'planillas' ? '…' : '🗒 Planillas por mesa'}
      </button>
      <button onClick={() => bajar('resultados')} disabled={!!ocupado} style={estilo} title="Los marcadores de la jornada, para mandar al grupo">
        {ocupado === 'resultados' ? '…' : '📊 Resultados'}
      </button>
      {error && <span style={{ fontSize: 12, color: '#b91c1c' }}>{error}</span>}
      {!error && !compacto && <span style={{ fontSize: 11, color: hint }}>PDF</span>}
    </div>
  )
}
