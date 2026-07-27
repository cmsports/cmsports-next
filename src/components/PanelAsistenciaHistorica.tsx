'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { corregirAsistencia } from '@/app/actions/asistencia'
import { fechaChile } from '@/lib/domain/fechaChile'
import { cargarHistorialJugador } from '@/lib/supabase/historial'
import { diaLabel } from '@/lib/domain/horario'
import {
  calendarioJugador, indicadores,
  type DatosHistorial, type DiaCalendario, type EstadoDia,
} from '@/lib/domain/historialAsistencia'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

const COLOR: Record<EstadoDia, { bg: string; fg: string; label: string }> = {
  presente:  { bg: '#16a34a', fg: '#ffffff', label: 'Asistió' },
  ausente:   { bg: '#dc2626', fg: '#ffffff', label: 'Faltó' },
  pendiente: { bg: '#3b82f6', fg: '#ffffff', label: 'Sin registrar' },
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

type Jugador = { id: string; nombre: string; categoria: string | null }

export default function PanelAsistenciaHistorica({ clubId }: { clubId: string }) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [busqueda, setBusqueda]   = useState('')
  const [elegido, setElegido]     = useState<Jugador | null>(null)
  const [anio, setAnio]           = useState(() => Number(fechaChile().slice(0, 4)))
  const [datos, setDatos]         = useState<DatosHistorial | null>(null)
  const [cargando, setCargando]   = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [mensaje, setMensaje]     = useState('')
  const [abierto, setAbierto]     = useState<DiaCalendario | null>(null)

  const hoy = fechaChile()

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.from('jugadores')
        .select('id,nombre,categoria')
        .eq('club_id', clubId).eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false')
        .order('nombre')
      if (vivo) setJugadores((data ?? []) as Jugador[])
    })()
    return () => { vivo = false }
  }, [clubId])

  const cargarHistorial = useCallback(async (jugadorId: string, anioSel: number) => {
    setCargando(true)
    const desde = `${anioSel}-01-01`
    const hasta = `${anioSel}-12-31`

    setDatos(await cargarHistorialJugador(clubId, jugadorId, desde, hasta))
    setCargando(false)
  }, [clubId])

  useEffect(() => {
    if (elegido) void cargarHistorial(elegido.id, anio)
  }, [elegido, anio, cargarHistorial])

  const dias = useMemo(() => {
    if (!elegido || !datos) return []
    return calendarioJugador(elegido.id, `${anio}-01-01`, `${anio}-12-31`, datos)
  }, [elegido, datos, anio])

  const porFecha = useMemo(() => new Map(dias.map(d => [d.fecha, d])), [dias])
  const ind = useMemo(() => indicadores(dias), [dias])

  async function cambiar(dia: DiaCalendario, estado: 'presente' | 'ausente' | 'sin_registro') {
    if (!elegido) return
    setGuardando(dia.fecha)
    setMensaje('')
    const res = await corregirAsistencia({ jugadorId: elegido.id, fecha: dia.fecha, estado })
    setGuardando(null)
    if (res?.error) { setMensaje(res.error); return }
    setAbierto(null)
    await cargarHistorial(elegido.id, anio)
  }

  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))

  // ── Lista de jugadores ──────────────────────────────────────────────────
  if (!elegido) {
    return (
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 4 }}>Elegí un jugador</div>
        <div style={{ fontSize: 12, color: hint, marginBottom: 12 }}>
          Cada uno tiene su propio calendario, según los días que entrena.
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
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '11px 14px', cursor: 'pointer',
                borderBottom: i < filtrados.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{j.nombre}</span>
              <span style={{ fontSize: 11, color: muted }}>{j.categoria ?? ''}</span>
            </div>
          ))}
          {filtrados.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: hint, fontSize: 13 }}>Sin resultados</div>
          )}
        </div>
      </div>
    )
  }

  // ── Calendario del jugador ──────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => { setElegido(null); setDatos(null) }}
          style={{ padding: '7px 13px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
            border: '1px solid #e2e8f0', background: '#fff', color: muted }}>
          ← Jugadores
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{elegido.nombre}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setAnio(a => a - 1)}
            style={{ padding: '6px 11px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: muted }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'center' }}>{anio}</span>
          <button onClick={() => setAnio(a => a + 1)}
            style={{ padding: '6px 11px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: muted }}>›</button>
        </div>
      </div>

      {mensaje && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
          {mensaje}
        </div>
      )}

      {/* Resumen del año */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        {([
          ['Asistencia', ind.porcentaje === null ? '—' : `${ind.porcentaje}%`, ind.porcentaje === null ? muted : COLOR.presente.bg],
          ['Programados', String(ind.programados), text],
          ['Asistió',     String(ind.presentes),  COLOR.presente.bg],
          ['Faltó',       String(ind.ausentes),   COLOR.ausente.bg],
          ['Sin registrar', String(ind.pendientes), COLOR.pendiente.bg],
        ] as const).map(([label, valor, color]) => (
          <div key={label} style={{ ...card, padding: 12 }}>
            <div style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
          </div>
        ))}
      </div>

      {/* Rachas y detalle */}
      <div style={{ ...card, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px 22px', fontSize: 12, color: muted }}>
        <span>Racha actual: <strong style={{ color: ind.rachaPresentes > 0 ? COLOR.presente.bg : text }}>{ind.rachaPresentes}</strong> seguidas</span>
        {ind.rachaAusentes > 0 && <span>Faltas seguidas: <strong style={{ color: COLOR.ausente.bg }}>{ind.rachaAusentes}</strong></span>}
        <span>Mejor racha: <strong style={{ color: text }}>{ind.mejorRacha}</strong></span>
        {ind.mejorDia && <span>Mejor día: <strong style={{ color: text }}>{diaLabel(ind.mejorDia.dia)}</strong> ({ind.mejorDia.porcentaje}%)</span>}
        {ind.ultimaAsistencia && <span>Última asistencia: <strong style={{ color: text }}>{ind.ultimaAsistencia}</strong></span>}
        {ind.ultimaAusencia && <span>Última falta: <strong style={{ color: text }}>{ind.ultimaAusencia}</strong></span>}
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: muted }}>
        {(['presente', 'ausente', 'pendiente'] as const).map(e => (
          <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COLOR[e].bg, display: 'inline-block' }} />
            {COLOR[e].label}
          </span>
        ))}
        <span style={{ color: hint }}>Los días sin entrenamiento no aparecen.</span>
      </div>

      {cargando ? (
        <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando el año...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {MESES.map((nombreMes, m) => (
            <Mes key={m} anio={anio} mes={m} nombre={nombreMes} porFecha={porFecha} hoy={hoy}
              onDia={d => setAbierto(d)} />
          ))}
        </div>
      )}

      {/* Corregir un día */}
      {abierto && (
        <div onClick={e => { if (e.target === e.currentTarget) setAbierto(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
          <div style={{ ...card, padding: 20, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{abierto.fecha}</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2, marginBottom: 16 }}>
              {diaLabel(abierto.dia)} · {abierto.bloques.join(' · ')}
            </div>
            {/* El error va acá adentro y no arriba de la página: con el modal
                abierto, un mensaje de fondo no se ve y parece que el botón no
                hiciera nada. */}
            {mensaje && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                {mensaje}
              </div>
            )}

            {([
              ['presente', 'Asistió'],
              ['ausente', 'Faltó'],
              ['sin_registro', 'Dejar sin registrar'],
            ] as const).map(([estado, label]) => {
              const actual = estado === 'sin_registro' ? abierto.estado === 'pendiente' : abierto.estado === estado
              const c = estado === 'sin_registro' ? COLOR.pendiente : COLOR[estado]
              return (
                <button key={estado} onClick={() => cambiar(abierto, estado)} disabled={guardando === abierto.fecha}
                  style={{ width: '100%', padding: '11px 14px', marginBottom: 8, borderRadius: 9, fontSize: 13, fontWeight: 600,
                    cursor: guardando ? 'wait' : 'pointer', textAlign: 'left',
                    border: `1px solid ${actual ? c.bg : '#e2e8f0'}`,
                    background: actual ? c.bg : '#fff',
                    color: actual ? '#fff' : text }}>
                  {label}{actual ? '  ·  actual' : ''}
                </button>
              )
            })}
            <button onClick={() => setAbierto(null)}
              style={{ width: '100%', padding: '9px 14px', marginTop: 4, borderRadius: 9, fontSize: 13,
                border: 'none', background: 'transparent', color: muted, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Un mes del calendario ── */
function Mes({ anio, mes, nombre, porFecha, hoy, onDia }: {
  anio: number
  mes: number
  nombre: string
  porFecha: Map<string, DiaCalendario>
  hoy: string
  onDia: (d: DiaCalendario) => void
}) {
  const primero = new Date(anio, mes, 1)
  const dias = new Date(anio, mes + 1, 0).getDate()
  // Lunes primero: getDay() da 0 para domingo.
  const offset = (primero.getDay() + 6) % 7

  const celdas: (DiaCalendario | number | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= dias; d++) {
    const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    celdas.push(porFecha.get(fecha) ?? d)
  }

  const conEntreno = celdas.filter(c => typeof c === 'object' && c !== null).length

  return (
    <div style={{ ...card, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{nombre}</span>
        <span style={{ fontSize: 10, color: hint }}>{conEntreno || '—'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} style={{ fontSize: 9, color: hint, textAlign: 'center', fontWeight: 600 }}>{d}</div>
        ))}
        {celdas.map((c, i) => {
          if (c === null) return <div key={i} />
          if (typeof c === 'number') {
            return <div key={i} style={{ fontSize: 10, color: '#cbd5e1', textAlign: 'center', padding: '4px 0' }}>{c}</div>
          }
          const col = COLOR[c.estado]
          const esHoy = c.fecha === hoy
          return (
            <div key={i} onClick={() => onDia(c)} title={`${c.fecha} · ${col.label} · ${c.bloques.join(', ')}`}
              style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '4px 0', borderRadius: 4,
                background: col.bg, color: col.fg, cursor: 'pointer',
                outline: esHoy ? '2px solid #0f172a' : 'none', outlineOffset: 1 }}>
              {Number(c.fecha.slice(-2))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
