'use client'

import { useState } from 'react'
import { leerJornada } from '@/app/actions/ligaJornadas'

// Los papeles de una jornada (liga por jornadas):
//   · Programación: la hoja oficial que se publica (PDF).
//   · Planillas: una por mesa, con casillas para sets, ganador y firma (PDF).
//   · Resultados: cada partido con su marcador, para imprimir (PDF).
//   · WhatsApp: los resultados como texto corto, copiado al portapapeles.
// Todos los PDF llevan el logo del club en el encabezado.

const ink = '#0f172a', hint = '#94a3b8'

export function BotonesPdfJornada({ ligaId, numero, clubNombre, ligaNombre, pie, logoUrl, compacto = false }: {
  ligaId: string
  numero: number
  clubNombre: string
  ligaNombre: string
  pie?: string | null
  logoUrl?: string | null
  compacto?: boolean
}) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  async function bajar(tipo: 'programacion' | 'planillas' | 'resultados' | 'whatsapp') {
    setOcupado(tipo); setAviso(null)
    try {
      const res = await leerJornada({ ligaId, numero })
      if (res.error || !res.jornada) { setAviso({ tipo: 'error', texto: res.error ?? 'No se pudo leer la fecha' }); return }
      const pdf = await import('@/lib/liga-jornada-pdf')
      if (tipo === 'whatsapp') {
        const texto = pdf.textoResultadosWhatsapp(res.jornada, { ligaNombre })
        try {
          await navigator.clipboard.writeText(texto)
          setAviso({ tipo: 'ok', texto: 'Copiado: pégalo en el grupo de WhatsApp.' })
        } catch {
          setAviso({ tipo: 'error', texto: 'El navegador no dejó copiar; prueba de nuevo o usa el PDF.' })
        }
        return
      }
      const { cargarLogoPdf } = await import('@/lib/pdf/estilo')
      const logo = await cargarLogoPdf(logoUrl)
      const meta = { clubNombre, ligaNombre, pie: pie ?? undefined, logo }
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
      <button onClick={() => bajar('programacion')} disabled={!!ocupado} style={estilo} title="La hoja oficial de la fecha, para publicar">
        {ocupado === 'programacion' ? '…' : `⬇ Programación F${numero}`}
      </button>
      <button onClick={() => bajar('planillas')} disabled={!!ocupado} style={estilo} title="Una hoja por mesa con casillas para los sets y la firma del árbitro">
        {ocupado === 'planillas' ? '…' : '🗒 Planillas por mesa'}
      </button>
      <button onClick={() => bajar('resultados')} disabled={!!ocupado} style={estilo} title="Los marcadores de la fecha, para imprimir">
        {ocupado === 'resultados' ? '…' : '📊 Resultados PDF'}
      </button>
      <button onClick={() => bajar('whatsapp')} disabled={!!ocupado} style={{ ...estilo, borderColor: '#bbf7d0', background: '#f0fdf4', color: '#166534' }} title="Copia los resultados como texto para pegar en WhatsApp">
        {ocupado === 'whatsapp' ? '…' : '💬 Copiar para WhatsApp'}
      </button>
      {aviso && <span style={{ fontSize: 12, color: aviso.tipo === 'ok' ? '#166534' : '#b91c1c' }}>{aviso.texto}</span>}
      {!aviso && !compacto && <span style={{ fontSize: 11, color: hint }}>con el logo del club</span>}
    </div>
  )
}
