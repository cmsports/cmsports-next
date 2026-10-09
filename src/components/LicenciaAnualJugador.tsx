'use client'

// La licencia anual del jugador: el botón "Pago confirmado licencia 2027" y,
// una vez pagada, cuánto y cuándo.
//
// El año no se calcula de la fecha: lo fija el admin en `licencia.anio`
// (Configuración). Cuando lo sube a 2028, nadie aparece pagado y el botón
// vuelve a estar disponible solo; la de 2027 queda guardada en la base.
//
// Cobrar va por `registrar_pago_licencia_atomico` (migración 301), que marca
// la licencia y registra el ingreso en Finanzas en una sola transacción.

import { useCallback, useEffect, useRef, useState } from 'react'
import { configDelClub } from '@/lib/supabase/clubConfig'
import { licenciasDelClub, type LicenciaPagada } from '@/lib/supabase/licencias'
import { registrarLicencia, desmarcarLicencia } from '@/app/actions/jugadores'
import { montoIngresado } from '@/lib/domain/mensualidades'
import { useTextoMonto } from '@/components/Monto'
import { useEnVivo } from '@/lib/useEnVivo'
import { invalidarPorTabla } from '@/lib/query-cache'

const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

export default function LicenciaAnualJugador({ clubId, jugadorId, jugadorNombre, puedeCobrar, veMonto }: {
  clubId: string
  jugadorId: string
  jugadorNombre: string
  /** Solo el admin: el RPC exige admin igual que la matrícula. */
  puedeCobrar: boolean
  /** Si el monto se muestra. Sigue a `profe.ve_mensualidad`, como la matrícula. */
  veMonto: boolean
}) {
  const [anio, setAnio]           = useState<number | null>(null)
  const [pagada, setPagada]       = useState<LicenciaPagada | null>(null)
  const [cargando, setCargando]   = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [modal, setModal]         = useState(false)
  const [monto, setMonto]         = useState('')
  const [error, setError]         = useState('')
  const [guardando, setGuardando] = useState(false)
  // Se fija al abrir el modal y se reusa si el guardado falla y se reintenta:
  // así un reintento no crea un segundo ingreso por la misma licencia.
  const clave = useRef<string | null>(null)
  const fmtMonto = useTextoMonto()

  const cargar = useCallback(async () => {
    try {
      const config = await configDelClub(clubId)
      const a = config('licencia.anio')
      const licencias = await licenciasDelClub(clubId, a)
      setAnio(a)
      setPagada(licencias.get(jugadorId) ?? null)
      setErrorCarga('')
    } catch (e) {
      setErrorCarga('No se pudo leer la licencia: ' + (e instanceof Error ? e.message : String(e)))
    }
    setCargando(false)
  }, [clubId, jugadorId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['licencias_pagadas', 'club_config'], clubId, () => { void cargar() })

  function cerrar() {
    setModal(false); setMonto(''); setError(''); clave.current = null
  }

  async function guardar() {
    if (anio == null) return
    const valor = montoIngresado(monto)
    if (valor == null) { setError('Escribe un monto. Si no le cobras nada, pon 0.'); return }
    clave.current ??= crypto.randomUUID()
    setGuardando(true)
    setError('')
    const res = await registrarLicencia({ jugadorId, anio, monto: valor, idempotencyKey: clave.current })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    clave.current = null
    cerrar()
    // El aviso en vivo puede llegar después de esta recarga: sin esto, la
    // tarjeta seguiría mostrando "pendiente" con el pago ya registrado.
    invalidarPorTabla('licencias_pagadas')
    await cargar()
  }

  async function desmarcar() {
    if (anio == null) return
    if (!confirm(`¿Desmarcar la licencia ${anio} de ${jugadorNombre}?\n\nEl ingreso que se registró queda en Finanzas: esto solo cambia la ficha.`)) return
    setGuardando(true)
    const res = await desmarcarLicencia({ jugadorId, anio })
    setGuardando(false)
    if (res.error) { setErrorCarga(res.error); return }
    invalidarPorTabla('licencias_pagadas')
    await cargar()
  }

  if (cargando) return <div style={{ padding:'16px 20px', fontSize:12, color: hint }}>Cargando…</div>

  return (
    <div style={{ padding:'16px 20px' }}>
      {errorCarga && (
        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'9px 12px',
          marginBottom:12, fontSize:12, color:'#dc2626', fontWeight:600 }}>
          {errorCarga}
        </div>
      )}

      {anio != null && (pagada ? (
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'#15803d' }}>✅ Licencia {anio} pagada</div>
          <div style={{ fontSize:12, color: muted, marginTop:2 }}>
            {pagada.monto === 0
              ? `Sin cobro · ${pagada.fecha}`
              : veMonto ? `${fmtMonto(pagada.monto)} · ${pagada.fecha}` : pagada.fecha}
          </div>
          {puedeCobrar && (
            <button onClick={desmarcar} disabled={guardando}
              style={{ marginTop:12, padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:600,
                cursor: guardando ? 'default' : 'pointer', border:'1px solid #bbf7d0',
                background:'#f0fdf4', color:'#15803d' }}>
              {guardando ? '...' : 'Desmarcar'}
            </button>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:'#c2410c', marginBottom:10 }}>
            ⚠️ Licencia {anio} pendiente
          </div>
          {puedeCobrar ? (
            <button onClick={() => setModal(true)}
              style={{ width:'100%', padding:'12px 14px', borderRadius:10, fontSize:13, fontWeight:700,
                cursor:'pointer', border:'none', background:'#16a34a', color:'#fff' }}>
              Pago confirmado licencia {anio}
            </button>
          ) : (
            <div style={{ fontSize:12, color: hint }}>Todavía no se registra el pago.</div>
          )}
        </div>
      ))}

      {modal && anio != null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:22, width:'100%', maxWidth:400 }}>
            <div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:4 }}>¿Cuánto pagó de licencia este jugador?</div>
            <div style={{ fontSize:12, color:muted, marginBottom:16 }}>
              {jugadorNombre} · licencia {anio}. Se registra en Finanzas como
              “Pago licencia año {anio} — {jugadorNombre}”.
            </div>

            {error && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'9px 12px',
                marginBottom:12, fontSize:12, color:'#dc2626', fontWeight:600 }}>
                {error}
              </div>
            )}

            <label htmlFor="monto-licencia" style={{ fontSize:11, color:muted, display:'block', marginBottom:4 }}>Monto de la licencia</label>
            <input
              id="monto-licencia" type="number" min={0} inputMode="numeric" autoFocus
              placeholder="Ej: 25000"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !guardando) void guardar() }}
              style={{ width:'100%', boxSizing:'border-box', background:'#f4f7fa', border:'1px solid #e2e8f0',
                borderRadius:8, padding:'10px 12px', color:text, fontSize:14, outline:'none' }}
            />
            <div style={{ fontSize:11, color:hint, marginTop:6, marginBottom:16 }}>
              Pon <strong>0</strong> si se la eximes: queda confirmada y no se genera ingreso.
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={cerrar}
                style={{ flex:1, padding:11, background:'#f4f7fa', color:muted, border:'none', borderRadius:8, fontSize:13, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                style={{ flex:2, padding:11, background:'#16a34a', color:'#fff', border:'none', borderRadius:8,
                  fontSize:13, fontWeight:600, cursor: guardando ? 'default' : 'pointer',
                  opacity: guardando ? 0.6 : 1 }}>
                {guardando ? 'Guardando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
