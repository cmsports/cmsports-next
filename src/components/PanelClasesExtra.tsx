'use client'

// Cobrar las clases a las que el jugador vino de más.
//
// Se agrupa por jugador y no por clase porque así se cobra: el profe le dice
// "me debés dos clases extra", no le cobra una el martes y otra el viernes. Un
// cobro es un movimiento con todas las del mismo jugador adentro.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import {
  enviarClasesExtraACobro, pagarClasesExtra, revertirPagoClasesExtra,
} from '@/app/actions/clasesExtra'
import { SIN_CUOTA } from '@/lib/domain/mensualidades'
import { rangoHorario } from '@/lib/domain/horario'
import { linkWhatsApp } from '@/lib/whatsapp'
import WhatsAppBtn from '@/components/WhatsAppBtn'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Extra = {
  id: string
  jugador_id: string
  fecha: string
  monto: number | null
  cobrada_en: string | null
  pagada_en: string | null
  movimiento_id: string | null
  bloque_id: string | null
}

type Jugador = { id: string; nombre: string; telefono: string | null }
type Bloque  = { id: string; nombre: string; hora_inicio: string; hora_fin: string }

const fmt = (n: number) => '$' + Number(n).toLocaleString('es-CL')

export default function PanelClasesExtra({ clubId }: { clubId: string | null }) {
  const [extras, setExtras]       = useState<Extra[]>([])
  const [jugadores, setJugadores] = useState<Record<string, Jugador>>({})
  const [bloques, setBloques]     = useState<Record<string, Bloque>>({})
  const [cargando, setCargando]   = useState(true)
  const [verPagadas, setVerPagadas] = useState(false)
  const [mensaje, setMensaje]     = useState('')
  const [ocupado, setOcupado]     = useState<string | null>(null)
  const [cobrando, setCobrando]   = useState<{ jugadorId: string; ids: string[]; total: number } | null>(null)
  const [metodo, setMetodo]       = useState<'efectivo' | 'transferencia'>('efectivo')
  const claveCobro = useRef<string | null>(null)

  const cargar = useCallback(async () => {
    if (!clubId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: ex }, { data: jugs }, { data: bls }] = await Promise.all([
      db.from('clases_extraordinarias')
        .select('id,jugador_id,fecha,monto,cobrada_en,pagada_en,movimiento_id,bloque_id')
        .eq('club_id', clubId).order('fecha', { ascending: false }),
      db.from('jugadores').select('id,nombre,telefono').eq('club_id', clubId),
      db.from('bloques_horario').select('id,nombre,hora_inicio,hora_fin').eq('club_id', clubId),
    ])
    setExtras((ex ?? []) as Extra[])
    setJugadores(Object.fromEntries(((jugs ?? []) as Jugador[]).map(j => [j.id, j])))
    setBloques(Object.fromEntries(((bls ?? []) as Bloque[]).map(b => [b.id, b])))
    setCargando(false)
  }, [clubId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['clases_extraordinarias'], clubId, cargar, { conClub: ['clases_extraordinarias'] })

  async function enviar(ids: string[]) {
    setOcupado(ids[0]); setMensaje('')
    const res = await enviarClasesExtraACobro({ ids })
    setOcupado(null)
    if (res.error) { setMensaje(res.error); return }
    await cargar()
  }

  async function confirmarCobro() {
    if (!cobrando) return
    claveCobro.current ??= crypto.randomUUID()
    setOcupado(cobrando.jugadorId); setMensaje('')
    const res = await pagarClasesExtra({ ids: cobrando.ids, metodo, idempotencyKey: claveCobro.current })
    setOcupado(null)
    if (res.error) { setMensaje(res.error); return }
    claveCobro.current = null
    setCobrando(null)
    await cargar()
  }

  async function revertir(movimientoId: string) {
    if (!confirm('¿Deshacer este cobro? El ingreso se borra del libro y las clases vuelven a quedar por cobrar.')) return
    setOcupado(movimientoId); setMensaje('')
    const res = await revertirPagoClasesExtra({ movimientoId, idempotencyKey: crypto.randomUUID() })
    setOcupado(null)
    if (res.error) { setMensaje(res.error); return }
    await cargar()
  }

  if (!clubId) return null
  if (cargando) {
    return <div style={{ ...card, padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>
  }

  const pendientes = extras.filter(e => !e.pagada_en)
  const pagadas    = extras.filter(e => e.pagada_en)

  // Por jugador, que es como se cobra.
  const porJugador = new Map<string, Extra[]>()
  for (const e of pendientes) {
    const previas = porJugador.get(e.jugador_id)
    if (previas) previas.push(e); else porJugador.set(e.jugador_id, [e])
  }
  const grupos = [...porJugador.entries()]
    .map(([jugadorId, suyas]) => ({
      jugadorId,
      suyas,
      conMonto: suyas.filter(e => e.monto != null),
      sinMonto: suyas.filter(e => e.monto == null),
      total: suyas.reduce((s, e) => s + (e.monto ?? 0), 0),
    }))
    .sort((a, b) => (jugadores[a.jugadorId]?.nombre ?? '').localeCompare(jugadores[b.jugadorId]?.nombre ?? ''))

  const totalPorCobrar = grupos.reduce((s, g) => s + g.total, 0)
  const detalle = (e: Extra) => {
    const b = e.bloque_id ? bloques[e.bloque_id] : null
    return b ? `${e.fecha} · ${rangoHorario(b.hora_inicio, b.hora_fin)}` : e.fecha
  }

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex',
        alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: text }}>🟡 Clases extraordinarias</div>
          <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>
            Las clases a las que vinieron de más. Se cobran aparte de la mensualidad.
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: totalPorCobrar > 0 ? '#a16207' : muted, fontVariantNumeric: 'tabular-nums' }}>
          {totalPorCobrar > 0 ? `${fmt(totalPorCobrar)} por cobrar` : 'Nada por cobrar'}
        </div>
      </div>

      {mensaje && (
        <div style={{ margin: '12px 18px 0', background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
          {mensaje}
        </div>
      )}

      {grupos.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>
          No hay clases extra pendientes.
        </div>
      ) : (
        <div>
          {grupos.map(g => {
            const jug = jugadores[g.jugadorId]
            const enviables = g.conMonto.filter(e => !e.cobrada_en).map(e => e.id)
            const cobrables = g.conMonto.map(e => e.id)
            const totalCobrable = g.conMonto.reduce((s, e) => s + (e.monto ?? 0), 0)
            const wa = linkWhatsApp(jug?.telefono, `Hola ${jug?.nombre?.split(' ')[0] ?? ''}, tenés ${g.conMonto.length} clase${g.conMonto.length === 1 ? '' : 's'} extra por ${fmt(totalCobrable)}. ¡Gracias!`)
            return (
              <div key={g.jugadorId} style={{ borderBottom: '1px solid #f1f5f9', padding: '13px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{jug?.nombre ?? '—'}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#a16207', fontVariantNumeric: 'tabular-nums' }}>
                    {totalCobrable > 0 ? fmt(totalCobrable) : '—'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                  {g.suyas.map(e => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
                      <span style={{ color: muted }}>
                        {detalle(e)}
                        {e.cobrada_en && <span style={{ color: '#a16207', fontWeight: 600 }}> · enviada</span>}
                      </span>
                      <span style={{ color: e.monto == null ? '#c2410c' : text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {e.monto == null ? SIN_CUOTA : fmt(e.monto)}
                      </span>
                    </div>
                  ))}
                </div>

                {g.sinMonto.length > 0 && (
                  <div style={{ fontSize: 11, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa',
                    borderRadius: 8, padding: '7px 10px', marginBottom: 8 }}>
                    {g.sinMonto.length} sin monto. Se les pone precio desde Asistencia, y recién ahí se pueden cobrar.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {enviables.length > 0 && (
                    <button onClick={() => enviar(enviables)} disabled={ocupado !== null}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                        border: '1px solid #e2e8f0', background: '#fff', color: muted, cursor: 'pointer' }}>
                      Enviar a cobro ({enviables.length})
                    </button>
                  )}
                  {cobrables.length > 0 && (
                    <button
                      onClick={() => { claveCobro.current = crypto.randomUUID(); setMensaje(''); setCobrando({ jugadorId: g.jugadorId, ids: cobrables, total: totalCobrable }) }}
                      disabled={ocupado !== null}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer' }}>
                      Marcar pagado
                    </button>
                  )}
                  {wa && cobrables.length > 0 && (
                    <WhatsAppBtn href={wa} variant="compact">Cobrar</WhatsAppBtn>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Las ya cobradas, para poder deshacer una equivocada */}
      {pagadas.length > 0 && (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '11px 18px' }}>
          <button onClick={() => setVerPagadas(v => !v)}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 600,
              color: muted, cursor: 'pointer' }}>
            {verPagadas ? '▾' : '▸'} Ya cobradas ({pagadas.length})
          </button>
          {verPagadas && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pagadas.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12 }}>
                  <span style={{ color: muted }}>
                    {jugadores[e.jugador_id]?.nombre ?? '—'} · {detalle(e)}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#16a34a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {e.monto != null ? fmt(e.monto) : '—'}
                    </span>
                    {e.movimiento_id && (
                      <button onClick={() => revertir(e.movimiento_id!)} disabled={ocupado !== null}
                        style={{ background: 'none', border: 'none', color: '#dc262699', fontSize: 11,
                          cursor: 'pointer', padding: '2px 4px' }} title="Deshacer el cobro">
                        deshacer
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmar el cobro */}
      {cobrando && (
        <div className="anim-fondo" onClick={e => { if (e.target === e.currentTarget) setCobrando(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
          <div className="anim-modal" style={{ ...card, padding: 22, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>Cobrar clases extra</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2, marginBottom: 16 }}>
              {jugadores[cobrando.jugadorId]?.nombre} — {cobrando.ids.length} clase{cobrando.ids.length === 1 ? '' : 's'}
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
              padding: '12px 14px', marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: muted }}>Total</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: text, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(cobrando.total)}
              </div>
            </div>

            <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5 }}>Método de pago</label>
            <select value={metodo} onChange={e => setMetodo(e.target.value as 'efectivo' | 'transferencia')}
              style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '10px 12px', color: text, fontSize: 14, outline: 'none', marginBottom: 16 }}>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>

            {mensaje && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '9px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                {mensaje}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCobrando(null)}
                style={{ flex: 1, padding: 11, background: 'transparent', border: '1px solid #e2e8f0',
                  borderRadius: 8, color: muted, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmarCobro} disabled={ocupado !== null}
                style={{ flex: 1, padding: 11, background: '#16a34a', border: 'none', borderRadius: 8,
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {ocupado ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
