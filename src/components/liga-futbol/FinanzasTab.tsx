'use client'

// Pestaña "⚽ Liga" dentro de Finanzas — pagos de inscripción por equipo.
// Vive aparte del resto de Finanzas (2000+ líneas de lógica de mensualidades
// de TDM) a propósito, igual que el widget del dashboard: fetch, estado y
// mutaciones propias, así una liga de fútbol nunca puede romper nada de lo
// que ya funciona para los clubes de tenis de mesa.
// registrarPagoEquipo ya deja el ingreso en el módulo de Finanzas (RPC
// registrar_movimiento_financiero_atomico) cuando el club lo tiene activo —
// pagar un equipo acá es lo mismo que cargarlo a mano en "Movimientos".

import { useEffect, useState } from 'react'
import { Wallet, CheckCircle2, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { registrarPagoEquipo } from '@/app/actions/liga-futbol'

const supabase = createClient()

const C = {
  card: '#ffffff', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', hint: '#94a3b8',
  green: '#059669', greenL: '#f0fdf4', amber: '#d97706', amberL: '#fffbeb', red: '#dc2626', redL: '#fef2f2',
}
const ESTADO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pagado: { label: 'Pagado', color: C.green, bg: C.greenL },
  abonado: { label: 'Parcial', color: C.amber, bg: C.amberL },
  pendiente: { label: 'Pendiente', color: C.red, bg: C.redL },
}

interface LigaResumen { id: string; nombre: string; monto_inscripcion: number }
interface Equipo {
  id: string; nombre: string; monto_pagado: number; estado_inscripcion: string
  delegado_nombre: string | null; delegado_telefono: string | null
}

export default function LigaFutbolFinanzasTab({ clubId }: { clubId: string | null }) {
  const [ligas, setLigas] = useState<LigaResumen[]>([])
  const [ligaId, setLigaId] = useState<string | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [loading, setLoading] = useState(true)
  const [pagoAbierto, setPagoAbierto] = useState<Equipo | null>(null)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('transferencia')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clubId) { setLoading(false); return }
    let vigente = true
    supabase.from('lf_ligas').select('id, nombre, monto_inscripcion')
      .eq('club_id', clubId).order('creado_en', { ascending: false })
      .then(({ data }) => {
        if (!vigente) return
        const lista = (data as any) || []
        setLigas(lista)
        setLigaId(prev => prev ?? lista[0]?.id ?? null)
        setLoading(false)
      })
    return () => { vigente = false }
  }, [clubId])

  function cargarEquipos() {
    if (!ligaId) { setEquipos([]); return }
    supabase.from('lf_equipos')
      .select('id, nombre, monto_pagado, estado_inscripcion, delegado_nombre, delegado_telefono')
      .eq('liga_id', ligaId).order('nombre')
      .then(({ data }) => setEquipos((data as any) || []))
  }
  useEffect(cargarEquipos, [ligaId])

  const liga = ligas.find(l => l.id === ligaId)

  async function confirmarPago() {
    if (!pagoAbierto) return
    const m = Number(monto)
    if (!m || m <= 0) { setError('Ingresá un monto válido'); return }
    setGuardando(true)
    setError('')
    const res = await registrarPagoEquipo(pagoAbierto.id, m, metodo)
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setPagoAbierto(null)
    setMonto('')
    cargarEquipos()
  }

  if (loading) return null
  if (ligas.length === 0) {
    return <p style={{ fontSize: 13, color: C.hint, textAlign: 'center', padding: '40px 0' }}>Todavía no hay ninguna liga de fútbol creada.</p>
  }

  const totalEsperado = liga ? equipos.length * liga.monto_inscripcion : 0
  const totalPagado = equipos.reduce((s, e) => s + (e.monto_pagado || 0), 0)
  const totalPendiente = Math.max(0, totalEsperado - totalPagado)

  return (
    <div>
      {ligas.length > 1 && (
        <select value={ligaId ?? ''} onChange={e => setLigaId(e.target.value)}
          style={{ marginBottom: 16, fontSize: 13, fontWeight: 600, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', background: '#fff' }}>
          {ligas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
      )}

      <div className="grid-responsive-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.green, fontFamily: 'monospace', marginBottom: 4 }}>${totalPagado.toLocaleString('es-CL')}</div>
          <div style={{ fontSize: 12, color: C.muted }}>💰 Recaudado</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: totalPendiente > 0 ? C.red : C.green, fontFamily: 'monospace', marginBottom: 4 }}>${totalPendiente.toLocaleString('es-CL')}</div>
          <div style={{ fontSize: 12, color: C.muted }}>⏳ Falta por cobrar</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: 'monospace', marginBottom: 4 }}>${totalEsperado.toLocaleString('es-CL')}</div>
          <div style={{ fontSize: 12, color: C.muted }}>📊 Total esperado ({equipos.length} equipos × ${liga?.monto_inscripcion.toLocaleString('es-CL')})</div>
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: C.muted, fontWeight: 600 }}>Equipo</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: C.muted, fontWeight: 600 }}>Delegado</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', color: C.muted, fontWeight: 600 }}>Pagado</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', color: C.muted, fontWeight: 600 }}>Falta</th>
                <th style={{ textAlign: 'center', padding: '10px 14px', color: C.muted, fontWeight: 600 }}>Estado</th>
                <th style={{ padding: '10px 14px' }} />
              </tr>
            </thead>
            <tbody>
              {equipos.map(e => {
                const falta = Math.max(0, (liga?.monto_inscripcion || 0) - (e.monto_pagado || 0))
                const est = ESTADO_LABEL[e.estado_inscripcion] || ESTADO_LABEL.pendiente
                return (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text }}>{e.nombre}</td>
                    <td style={{ padding: '10px 14px', color: C.muted }}>
                      {e.delegado_nombre || '—'}{e.delegado_telefono ? ` · ${e.delegado_telefono}` : ''}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: C.text, fontFamily: 'monospace' }}>${(e.monto_pagado || 0).toLocaleString('es-CL')}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: falta > 0 ? C.red : C.green, fontFamily: 'monospace', fontWeight: 600 }}>
                      {falta > 0 ? `$${falta.toLocaleString('es-CL')}` : '✓'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ background: est.bg, color: est.color, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{est.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {falta > 0 && (
                        <button onClick={() => { setPagoAbierto(e); setMonto(String(falta)); setError('') }}
                          style={{ background: C.greenL, color: C.green, border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                          Registrar pago
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pagoAbierto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setPagoAbierto(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Registrar pago</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{pagoAbierto.nombre}</div>
            <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Monto</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
              style={{ width: '100%', background: '#f4f7fa', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Método</label>
            <select value={metodo} onChange={e => setMetodo(e.target.value)}
              style={{ width: '100%', background: '#f4f7fa', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 16 }}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="otro">Otro</option>
            </select>
            {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPagoAbierto(null)} style={{ flex: 1, padding: 10, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarPago} disabled={guardando} style={{ flex: 1, padding: 10, background: C.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                {guardando ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
