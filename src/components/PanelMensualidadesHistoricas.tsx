'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { corregirMensualidad } from '@/app/actions/mensualidades'
import { fechaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

type EstadoMes = 'pagado' | 'pendiente' | 'sin_registro'

const COLOR: Record<EstadoMes, { bg: string; fg: string; label: string }> = {
  pagado:       { bg: '#16a34a', fg: '#ffffff', label: 'Pagado' },
  pendiente:    { bg: '#dc2626', fg: '#ffffff', label: 'No pagado' },
  sin_registro: { bg: '#3b82f6', fg: '#ffffff', label: 'Sin registro' },
}

type Jugador = { id: string; nombre: string; mensualidad: number | null }
type Cuota   = { mes: number; anio: number; estado: string | null; monto: number | null; fecha_pago: string | null }
type Cambio  = {
  mes: number; anio: number; estado_anterior: string | null; estado_nuevo: string | null
  monto_anterior: number | null; monto_nuevo: number | null; motivo: string | null; creado_en: string
}

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Number(n).toLocaleString('es-CL')

export default function PanelMensualidadesHistoricas({ clubId }: { clubId: string }) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [busqueda, setBusqueda]   = useState('')
  const [elegido, setElegido]     = useState<Jugador | null>(null)
  const [anio, setAnio]           = useState(() => Number(fechaChile().slice(0, 4)))
  const [cuotas, setCuotas]       = useState<Cuota[]>([])
  const [cambios, setCambios]     = useState<Cambio[]>([])
  const [cargando, setCargando]   = useState(false)
  const [abierto, setAbierto]     = useState<number | null>(null)
  const [form, setForm]           = useState({ estado: 'pagado' as EstadoMes, monto: '', fecha: '', motivo: '' })
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje]     = useState('')

  const anioActual = Number(fechaChile().slice(0, 4))
  const mesActual  = Number(fechaChile().slice(5, 7))

  useEffect(() => {
    let vivo = true
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('jugadores')
        .select('id,nombre,mensualidad')
        .eq('club_id', clubId).eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false')
        .order('nombre')
      if (vivo) setJugadores((data ?? []) as Jugador[])
    })()
    return () => { vivo = false }
  }, [clubId])

  const cargar = useCallback(async (jugadorId: string, a: number) => {
    setCargando(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: cs }, { data: au }] = await Promise.all([
      db.from('mensualidades').select('mes,anio,estado,monto,fecha_pago')
        .eq('jugador_id', jugadorId).eq('anio', a),
      db.from('auditoria_mensualidades')
        .select('mes,anio,estado_anterior,estado_nuevo,monto_anterior,monto_nuevo,motivo,creado_en')
        .eq('jugador_id', jugadorId).eq('anio', a).order('creado_en', { ascending: false }),
    ])
    setCuotas((cs ?? []) as Cuota[])
    setCambios((au ?? []) as Cambio[])
    setCargando(false)
  }, [])

  useEffect(() => {
    if (elegido) void cargar(elegido.id, anio)
  }, [elegido, anio, cargar])

  const cuotaDe = (mes: number) => cuotas.find(c => c.mes === mes) ?? null

  function estadoDe(mes: number): EstadoMes {
    const c = cuotaDe(mes)
    if (!c) return 'sin_registro'
    return c.estado === 'pagado' ? 'pagado' : 'pendiente'
  }

  /** Un mes que todavía no llegó no es una deuda. */
  function esFuturo(mes: number) {
    return anio > anioActual || (anio === anioActual && mes > mesActual)
  }

  function abrirMes(mes: number) {
    const c = cuotaDe(mes)
    setForm({
      estado: estadoDe(mes) === 'sin_registro' ? 'pagado' : estadoDe(mes),
      monto: String(c?.monto ?? elegido?.mensualidad ?? ''),
      fecha: c?.fecha_pago ?? '',
      motivo: '',
    })
    setMensaje('')
    setAbierto(mes)
  }

  async function guardar() {
    if (!elegido || abierto === null) return
    setGuardando(true)
    setMensaje('')
    const res = await corregirMensualidad({
      jugadorId: elegido.id,
      mes: abierto,
      anio,
      estado: form.estado,
      monto: form.monto ? Number(form.monto) : null,
      fechaPago: form.fecha || null,
      motivo: form.motivo,
    })
    setGuardando(false)
    if (res?.error) { setMensaje(res.error); return }
    setAbierto(null)
    await cargar(elegido.id, anio)
  }

  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))

  // ── Lista ───────────────────────────────────────────────────────────────
  if (!elegido) {
    return (
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 4 }}>Elegí un jugador</div>
        <div style={{ fontSize: 12, color: hint, marginBottom: 12 }}>
          Desde acá se corrigen meses pasados. Cada cambio deja su rastro y genera un ajuste en el libro.
        </div>
        <input
          style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
            borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none', marginBottom: 10 }}
          placeholder="Buscar por nombre..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
        />
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 520, overflowY: 'auto' }}>
          {filtrados.map((j, i) => (
            <div key={j.id} onClick={() => setElegido(j)}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '11px 14px', cursor: 'pointer',
                borderBottom: i < filtrados.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{j.nombre}</span>
              <span style={{ fontSize: 12, color: muted, fontVariantNumeric: 'tabular-nums' }}>{fmt(j.mensualidad)}</span>
            </div>
          ))}
          {filtrados.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: hint, fontSize: 13 }}>Sin resultados</div>
          )}
        </div>
      </div>
    )
  }

  const pagados = MESES.map((_, m) => estadoDe(m + 1)).filter(e => e === 'pagado').length
  const cobrado = cuotas.filter(c => c.estado === 'pagado').reduce((s, c) => s + Number(c.monto ?? 0), 0)

  // ── Año del jugador ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setElegido(null)}
          style={{ padding: '7px 13px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
            border: '1px solid #e2e8f0', background: '#fff', color: muted }}>
          ← Jugadores
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{elegido.nombre}</div>
        <span style={{ fontSize: 12, color: muted }}>cuota {fmt(elegido.mensualidad)}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setAnio(a => a - 1)}
            style={{ padding: '6px 11px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: muted }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'center' }}>{anio}</span>
          <button onClick={() => setAnio(a => a + 1)}
            style={{ padding: '6px 11px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: muted }}>›</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: muted }}>
        <span>Pagados: <strong style={{ color: COLOR.pagado.bg }}>{pagados}</strong> de 12</span>
        <span>Cobrado en {anio}: <strong style={{ color: text }}>{fmt(cobrado)}</strong></span>
        {(['pagado', 'pendiente', 'sin_registro'] as const).map(e => (
          <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: COLOR[e].bg, display: 'inline-block' }} />
            {COLOR[e].label}
          </span>
        ))}
      </div>

      {cargando ? (
        <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando el año...</div>
      ) : (
        <div className="anim-lista" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {MESES.map((nombre, i) => {
            const mes = i + 1
            const c = cuotaDe(mes)
            const est = estadoDe(mes)
            const futuro = esFuturo(mes) && est === 'sin_registro'
            const col = futuro ? { bg: '#f1f5f9', fg: muted } : COLOR[est]
            return (
              <div key={mes} onClick={() => abrirMes(mes)}
                className="tocable" style={{ ...card, padding: 12, cursor: 'pointer', borderLeft: `4px solid ${col.bg}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{nombre}</span>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.bg }} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: est === 'pagado' ? COLOR.pagado.bg : muted, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {c?.monto != null ? fmt(c.monto) : futuro ? '—' : fmt(elegido.mensualidad)}
                </div>
                <div style={{ fontSize: 10, color: hint, marginTop: 2 }}>
                  {futuro ? 'Aún no corresponde' : c?.fecha_pago ? `Pagó el ${c.fecha_pago}` : COLOR[est].label}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Historial de correcciones */}
      {cambios.length > 0 && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: text }}>
            Correcciones de {anio}
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {cambios.map((c, i) => (
              <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: muted }}>
                <strong style={{ color: text }}>{MESES[c.mes - 1]}</strong>
                {' · '}
                {c.estado_anterior ?? 'sin registro'} → {c.estado_nuevo ?? 'sin registro'}
                {c.monto_anterior !== c.monto_nuevo && ` · ${fmt(c.monto_anterior)} → ${fmt(c.monto_nuevo)}`}
                {c.motivo && <span style={{ fontStyle: 'italic' }}> · {c.motivo}</span>}
                <span style={{ color: hint }}> · {c.creado_en.slice(0, 16).replace('T', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Corregir un mes */}
      {abierto !== null && (
        <div onClick={e => { if (e.target === e.currentTarget) setAbierto(null) }}
          className="anim-fondo"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
          <div className="anim-modal" style={{ ...card, padding: 22, width: '100%', maxWidth: 380, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{MESES[abierto - 1]} {anio}</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2, marginBottom: 16 }}>{elegido.nombre}</div>

            <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>Estado</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['pagado', 'pendiente', 'sin_registro'] as const).map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, estado: e }))}
                  style={{ flex: 1, padding: '9px 6px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${form.estado === e ? COLOR[e].bg : '#e2e8f0'}`,
                    background: form.estado === e ? COLOR[e].bg : '#fff',
                    color: form.estado === e ? '#fff' : muted }}>
                  {COLOR[e].label}
                </button>
              ))}
            </div>

            {form.estado !== 'sin_registro' && (
              <>
                <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>Monto</label>
                <input type="number" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12, outline: 'none', color: text }} />

                {form.estado === 'pagado' && (
                  <>
                    <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>Fecha del pago</label>
                    <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                      style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                        borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 12, outline: 'none', color: text }} />
                  </>
                )}
              </>
            )}

            <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>Motivo del ajuste</label>
            <input value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
              placeholder="Ej: pagó en efectivo y no se registró"
              style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 8, outline: 'none', color: text }} />
            <div style={{ fontSize: 11, color: hint, marginBottom: 16 }}>
              Queda guardado junto al cambio y en el movimiento de ajuste del libro.
            </div>

            {mensaje && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px',
                fontSize: 12, color: '#dc2626', fontWeight: 600, marginBottom: 12 }}>{mensaje}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAbierto(null)}
                style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, color: muted, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                style={{ flex: 1, padding: 10, background: guardando ? '#e2e8f0' : '#4f46e5', border: 'none', borderRadius: 8,
                  color: guardando ? '#94a3b8' : '#fff', fontSize: 13, fontWeight: 700, cursor: guardando ? 'default' : 'pointer' }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
