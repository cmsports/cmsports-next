'use client'

import { useEffect, useState } from 'react'
import {
  CAMPOS_JUGADOR, CAMPOS_JUGADOR_POR_DEFECTO, GRUPOS_CAMPOS_JUGADOR,
  type ContextoExportJugadores,
} from '@/lib/domain/jugadorExport'
import { exportarJugadoresExcel } from '@/lib/jugadores-listado-excel'
import { exportarJugadoresPdf } from '@/lib/jugadores-listado-pdf'

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const CLAVE_STORAGE = 'cmsports:jugadores:exportCampos:v1'

function leerSeleccionGuardada(): Set<string> {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE)
    if (!crudo) return new Set(CAMPOS_JUGADOR_POR_DEFECTO)
    const ids: string[] = JSON.parse(crudo)
    const validos = new Set(CAMPOS_JUGADOR.map(c => c.id))
    const filtrados = ids.filter(id => validos.has(id))
    return new Set(filtrados.length > 0 ? filtrados : CAMPOS_JUGADOR_POR_DEFECTO)
  } catch {
    return new Set(CAMPOS_JUGADOR_POR_DEFECTO)
  }
}

export default function ModalExportarJugadores({ jugadores, ctx, clubNombre, onClose, onExportado }: {
  jugadores: any[]
  ctx: ContextoExportJugadores
  clubNombre: string
  onClose: () => void
  onExportado: (mensaje: string) => void
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(() => leerSeleccionGuardada())
  const [formato, setFormato] = useState<'excel' | 'pdf'>('excel')
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(CLAVE_STORAGE, JSON.stringify([...seleccion])) } catch {}
  }, [seleccion])

  function alternar(id: string) {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function exportar() {
    if (seleccion.size === 0 || jugadores.length === 0) return
    setExportando(true)
    try {
      const ids = [...seleccion]
      if (formato === 'excel') await exportarJugadoresExcel(jugadores, ids, ctx)
      else await exportarJugadoresPdf(jugadores, ids, ctx, { clubNombre })
      onExportado(`Exportado a ${formato === 'excel' ? 'Excel' : 'PDF'}: ${jugadores.length} jugadores, ${seleccion.size} campos`)
      onClose()
    } catch (e) {
      console.error('exportarJugadores falló', e)
      onExportado('Error al generar el archivo')
    } finally {
      setExportando(false)
    }
  }

  const sinNada = jugadores.length === 0

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22,
        width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>

        <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 2 }}>Exportar jugadores</div>
        <div style={{ fontSize: 12, color: muted, marginBottom: 16 }}>
          {sinNada ? 'No hay jugadores con los filtros activos.' : `${jugadores.length} jugadores según los filtros activos`}
        </div>

        {/* Formato */}
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {(['excel', 'pdf'] as const).map(f => (
            <button key={f} onClick={() => setFormato(f)}
              style={{ flex: 1, padding: '9px 0', background: formato === f ? '#4f46e5' : '#f8fafc',
                color: formato === f ? '#fff' : muted, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s' }}>
              {f === 'excel' ? 'Excel' : 'PDF'}
            </button>
          ))}
        </div>

        {/* Acciones rápidas */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
          <button onClick={() => setSeleccion(new Set(CAMPOS_JUGADOR.map(c => c.id)))}
            style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            Marcar todos
          </button>
          <button onClick={() => setSeleccion(new Set(CAMPOS_JUGADOR_POR_DEFECTO))}
            style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            Solo básicos
          </button>
          <button onClick={() => setSeleccion(new Set())}
            style={{ background: 'transparent', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            Ninguno
          </button>
        </div>

        {/* Campos agrupados */}
        {GRUPOS_CAMPOS_JUGADOR.map(g => {
          const campos = CAMPOS_JUGADOR.filter(c => c.grupo === g.id)
          return (
            <div key={g.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: hint, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                {g.etiqueta}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {campos.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: text, cursor: 'pointer' }}>
                    <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => alternar(c.id)} />
                    {c.etiqueta}
                  </label>
                ))}
              </div>
            </div>
          )
        })}

        {seleccion.size > 15 && formato === 'pdf' && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '9px 12px',
            marginBottom: 12, fontSize: 12, color: '#c2410c' }}>
            Con tantos campos el PDF puede verse apretado — considera Excel para un detalle tan completo.
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 12, color: muted }}>{seleccion.size} campos seleccionados</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ padding: '9px 16px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
                color: muted, fontSize: 13, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={exportar} disabled={exportando || seleccion.size === 0 || sinNada}
              style={{ padding: '9px 16px', background: (seleccion.size === 0 || sinNada) ? '#e2e8f0' : '#4f46e5', border: 'none',
                borderRadius: 8, color: (seleccion.size === 0 || sinNada) ? '#94a3b8' : '#fff', fontSize: 13, fontWeight: 600,
                cursor: (exportando || seleccion.size === 0 || sinNada) ? 'default' : 'pointer' }}>
              {exportando ? 'Generando...' : 'Exportar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
