'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  asignarBloqueClaseExtraordinaria, asignarMontoClaseExtraordinaria, corregirAsistencia,
  eliminarClaseExtraordinaria, registrarClaseExtraordinaria,
} from '@/app/actions/asistencia'
import { fechaChile } from '@/lib/domain/fechaChile'
import { cargarHistorialJugador } from '@/lib/supabase/historial'
import { diaLabel, rangoHorario } from '@/lib/domain/horario'
import { montoIngresado, SIN_CUOTA } from '@/lib/domain/mensualidades'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import {
  bloquesSinInscripcion, calendarioJugador, indicadores,
  type BloqueVigente, type DatosHistorial, type DiaCalendario, type EstadoDia,
} from '@/lib/domain/historialAsistencia'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

const COLOR: Record<EstadoDia, { bg: string; fg: string; label: string }> = {
  presente:  { bg: '#16a34a', fg: '#ffffff', label: 'Asistió' },
  ausente:   { bg: '#dc2626', fg: '#ffffff', label: 'Faltó' },
  pendiente: { bg: '#3b82f6', fg: '#ffffff', label: 'Sin registrar' },
  // Vino a un grupo que no era el suyo. Ni verde ni rojo: no era su obligación,
  // así que no cuenta como asistencia ni como falta. Se cobra aparte.
  extraordinaria: { bg: '#eab308', fg: '#422006', label: 'Clase extra' },
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

type Jugador = { id: string; nombre: string; categoria: string | null }

export default function PanelAsistenciaHistorica({ clubId, puedeMontos = false }: {
  clubId: string
  /** El profesor registra la clase extra; el precio lo decide un admin. */
  puedeMontos?: boolean
}) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [busqueda, setBusqueda]   = useState('')
  const [elegido, setElegido]     = useState<Jugador | null>(null)
  const [anio, setAnio]           = useState(() => Number(fechaChile().slice(0, 4)))
  const [datos, setDatos]         = useState<DatosHistorial | null>(null)
  const [cargando, setCargando]   = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [mensaje, setMensaje]     = useState('')
  // El modal trabaja sobre una fecha, no sobre un día ya programado: también se
  // abre en días en que no le tocaba entrenar, para registrar que vino igual.
  const [abierto, setAbierto]     = useState<{ fecha: string; dia: string } | null>(null)
  const [bloqueExtra, setBloqueExtra] = useState('')
  const [montoNuevo, setMontoNuevo]   = useState('')
  // Un monto por clase: el mismo día puede tener más de una.
  const [montos, setMontos]           = useState<Record<string, string>>({})
  const [ocupado, setOcupado]         = useState(false)

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

  async function cambiar(fecha: string, estado: 'presente' | 'ausente' | 'sin_registro') {
    if (!elegido) return
    setGuardando(fecha)
    setMensaje('')
    const res = await corregirAsistencia({ jugadorId: elegido.id, fecha, estado })
    setGuardando(null)
    if (res?.error) { setMensaje(res.error); return }
    setAbierto(null)
    await cargarHistorial(elegido.id, anio)
  }

  function bloquesParaExtra(fecha: string, dia: string): BloqueVigente[] {
    if (!datos || !elegido) return []
    return bloquesSinInscripcion(datos, elegido.id, fecha, dia)
  }

  // Todas las de ese día, no la primera: la restricción única es por jugador,
  // fecha Y bloque, así que alguien puede venir a dos grupos distintos el mismo
  // día. Mostrar solo una dejaría la otra invisible y sin poder cobrarla.
  function extrasDe(fecha: string) {
    return (datos?.extraordinarias ?? []).filter(e => e.fecha === fecha)
  }

  async function crearExtra(fecha: string) {
    if (!elegido || !bloqueExtra) return
    setOcupado(true)
    setMensaje('')
    const res = await registrarClaseExtraordinaria({
      jugadorId: elegido.id, fecha, bloqueId: bloqueExtra,
      monto: montoIngresado(montoNuevo),
    })
    setOcupado(false)
    if (res.error) { setMensaje(res.error); return }
    setBloqueExtra('')
    setMontoNuevo('')
    await cargarHistorial(elegido.id, anio)
  }

  async function guardarMontoExtra(id: string) {
    setOcupado(true)
    setMensaje('')
    const res = await asignarMontoClaseExtraordinaria({ id, monto: montoIngresado(montos[id] ?? '') })
    setOcupado(false)
    if (res.error) { setMensaje(res.error); return }
    setAbierto(null)
    if (elegido) await cargarHistorial(elegido.id, anio)
  }

  async function ponerBloque(id: string, bloqueId: string) {
    setOcupado(true)
    setMensaje('')
    const res = await asignarBloqueClaseExtraordinaria({ id, bloqueId })
    setOcupado(false)
    if (res.error) { setMensaje(res.error); return }
    if (elegido) await cargarHistorial(elegido.id, anio)
  }

  async function borrarExtra(id: string) {
    setOcupado(true)
    setMensaje('')
    const res = await eliminarClaseExtraordinaria({ id })
    setOcupado(false)
    if (res.error) { setMensaje(res.error); return }
    setAbierto(null)
    if (elegido) await cargarHistorial(elegido.id, anio)
  }

  function abrirDia(fecha: string, dia: string) {
    setBloqueExtra('')
    setMontoNuevo('')
    setMontos(Object.fromEntries(
      extrasDe(fecha).map(e => [e.id ?? '', e.monto != null ? String(e.monto) : '']),
    ))
    setMensaje('')
    setAbierto({ fecha, dia })
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
          ['Clases extra', String(ind.extraordinarias), ind.extraordinarias > 0 ? '#a16207' : muted],
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
        {(['presente', 'ausente', 'pendiente', 'extraordinaria'] as const).map(e => (
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
        <div className="anim-lista" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {MESES.map((nombreMes, m) => (
            <Mes key={m} anio={anio} mes={m} nombre={nombreMes} porFecha={porFecha} hoy={hoy}
              onDia={abrirDia} />
          ))}
        </div>
      )}

      {/* Corregir un día */}
      {abierto && (
        <div onClick={e => { if (e.target === e.currentTarget) setAbierto(null) }}
          className="anim-fondo"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
          {(() => {
            const dia      = porFecha.get(abierto.fecha) ?? null
            const suyas    = extrasDe(abierto.fecha)
            const programado = !!dia && dia.estado !== 'extraordinaria'
            // Los grupos ya usados ese día no se vuelven a ofrecer: la base
            // rechazaría el duplicado y el profe no sabría por qué.
            const usados    = new Set(suyas.map(e => e.bloque_id).filter(Boolean))
            const candidatos = bloquesParaExtra(abierto.fecha, abierto.dia).filter(b => !usados.has(b.id))
            return (
          <div className="anim-modal" style={{ ...card, padding: 20, width: '100%', maxWidth: 380 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{abierto.fecha}</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2, marginBottom: 16 }}>
              {diaLabel(abierto.dia)}
              {programado ? ` · ${dia!.bloques.join(' · ')}` : ' · no le tocaba entrenar'}
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

            {/* Asistió / faltó solo existe si ese día le tocaba entrenar. En un
                día que no le tocaba, esos botones escribirían una asistencia sin
                clase programada: justo el error que la clase extra vino a
                arreglar. */}
            {programado && ([
              ['presente', 'Asistió'],
              ['ausente', 'Faltó'],
              ['sin_registro', 'Dejar sin registrar'],
            ] as const).map(([estado, label]) => {
              const actual = estado === 'sin_registro' ? dia!.estado === 'pendiente' : dia!.estado === estado
              const c = estado === 'sin_registro' ? COLOR.pendiente : COLOR[estado]
              return (
                <button key={estado} onClick={() => cambiar(abierto.fecha, estado)} disabled={guardando === abierto.fecha}
                  style={{ width: '100%', padding: '11px 14px', marginBottom: 8, borderRadius: 9, fontSize: 13, fontWeight: 600,
                    cursor: guardando ? 'wait' : 'pointer', textAlign: 'left',
                    border: `1px solid ${actual ? c.bg : '#e2e8f0'}`,
                    background: actual ? c.bg : '#fff',
                    color: actual ? '#fff' : text }}>
                  {label}{actual ? '  ·  actual' : ''}
                </button>
              )
            })}

            {/* ── Clase extra ── */}
            <div style={{ marginTop: programado ? 14 : 0, paddingTop: programado ? 14 : 0,
              borderTop: programado ? '1px solid #e2e8f0' : 'none' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#713f12', marginBottom: 8 }}>
                🟡 Clase extra
              </div>

              {suyas.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: hint, marginBottom: 8 }}>
                    Vino a {suyas.length === 1 ? 'un grupo que no es el suyo' : `${suyas.length} grupos que no son el suyo`}.
                    No le descuenta sesiones ni entra en su porcentaje; se cobra aparte.
                  </div>
                  {suyas.map(e => {
                    const id = e.id ?? ''
                    const b = e.bloque_id ? datos?.bloques.find(x => x.id === e.bloque_id) : null
                    return (
                      <div key={id} style={{ background: '#fffbeb', border: '1px solid #fde047',
                        borderRadius: 9, padding: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#713f12', marginBottom: 6 }}>
                          {b
                            ? `${b.hora_inicio && b.hora_fin ? rangoHorario(b.hora_inicio, b.hora_fin) + ' · ' : ''}${b.nombre}`
                            : e.bloque_id ? 'Grupo eliminado' : 'Sin grupo asignado'}
                        </div>
                        {/* Se registró sin decir a qué grupo vino. Se completa
                            acá; el cobro funciona igual sin esto. */}
                        {!e.bloque_id && candidatos.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                            {candidatos.map(c => (
                              <button key={c.id} onClick={() => ponerBloque(id, c.id)} disabled={ocupado}
                                style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                  border: '1px solid #fde047', background: '#fff', color: '#713f12',
                                  cursor: ocupado ? 'wait' : 'pointer' }}>
                                {c.hora_inicio && c.hora_fin ? rangoHorario(c.hora_inicio, c.hora_fin) : c.nombre}
                              </button>
                            ))}
                          </div>
                        )}
                        {puedeMontos ? (
                          <input type="number" value={montos[id] ?? ''}
                            onChange={ev => setMontos(m => ({ ...m, [id]: ev.target.value }))}
                            placeholder={SIN_CUOTA}
                            style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: '1px solid #fde047',
                              borderRadius: 8, padding: '8px 11px', color: text, fontSize: 13, outline: 'none', marginBottom: 8 }} />
                        ) : (
                          // El profesor la ve, pero el precio lo decide un admin.
                          <div style={{ fontSize: 11, color: hint, marginBottom: 8 }}>
                            {e.monto != null
                              ? `Monto: $${Number(e.monto).toLocaleString('es-CL')}`
                              : 'El monto lo asigna un administrador.'}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          {puedeMontos && (
                            <button onClick={() => guardarMontoExtra(id)} disabled={ocupado || !id}
                              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                                cursor: ocupado ? 'wait' : 'pointer' }}>
                              {ocupado ? 'Guardando...' : 'Guardar monto'}
                            </button>
                          )}
                          {/* Sin precio la puede deshacer quien la puso; con precio
                              hay un cobro en camino y lo borra un admin. */}
                          {(puedeMontos || e.monto == null) && (
                            <button onClick={() => borrarExtra(id)} disabled={ocupado || !id}
                              style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12,
                                border: 'none', background: 'transparent', color: '#dc2626',
                                cursor: ocupado ? 'wait' : 'pointer' }}>
                              Borrar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {candidatos.length === 0 ? (
                suyas.length === 0 && (
                  <div style={{ fontSize: 11, color: hint }}>
                    Ese día no había ningún otro grupo al que pudiera venir.
                  </div>
                )
              ) : (
                <>
                  <div style={{ fontSize: 11, color: hint, marginBottom: 8, marginTop: suyas.length > 0 ? 10 : 0 }}>
                    {suyas.length > 0 ? '¿Vino a otro grupo más ese día?' : '¿Vino a otro grupo ese día? Elegí a cuál.'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                    {candidatos.map(b => {
                      const sel = bloqueExtra === b.id
                      return (
                        <button key={b.id} onClick={() => setBloqueExtra(sel ? '' : b.id)}
                          style={{ padding: '8px 11px', borderRadius: 8, fontSize: 12, fontWeight: 600, textAlign: 'left',
                            border: `1px solid ${sel ? '#eab308' : '#e2e8f0'}`,
                            background: sel ? '#fefce8' : '#fff', color: text, cursor: 'pointer' }}>
                          {b.hora_inicio && b.hora_fin ? `${rangoHorario(b.hora_inicio, b.hora_fin)} · ` : ''}
                          {b.nombre}
                          <span style={{ color: hint, fontWeight: 400 }}> — {sedeLabel(b.sede)}</span>
                        </button>
                      )
                    })}
                  </div>
                  {/* Al registrarla el profesor no le pone precio: la deja
                      marcada y el administrador decide cuánto se cobra. */}
                  {puedeMontos && (
                    <input type="number" value={montoNuevo} onChange={e => setMontoNuevo(e.target.value)}
                      placeholder={`Monto — ${SIN_CUOTA.toLowerCase()}`}
                      style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                        borderRadius: 8, padding: '9px 12px', color: text, fontSize: 13, outline: 'none', marginBottom: 10 }} />
                  )}
                  <button onClick={() => crearExtra(abierto.fecha)} disabled={ocupado || !bloqueExtra}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                      border: 'none', color: bloqueExtra ? '#422006' : '#94a3b8',
                      background: bloqueExtra ? '#eab308' : '#e2e8f0',
                      cursor: bloqueExtra && !ocupado ? 'pointer' : 'default' }}>
                    {ocupado ? 'Registrando...' : 'Registrar clase extra'}
                  </button>
                </>
              )}
            </div>

            <button onClick={() => setAbierto(null)}
              style={{ width: '100%', padding: '9px 14px', marginTop: 10, borderRadius: 9, fontSize: 13,
                border: 'none', background: 'transparent', color: muted, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
            )
          })()}
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
  onDia: (fecha: string, dia: string) => void
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

  const diaDeFecha = (f: string) =>
    (['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'])[new Date(f + 'T12:00:00').getDay()]

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
          // Un día en que no le tocaba entrenar. Se puede abrir igual: es donde
          // se registra que vino a otro grupo. El fin de semana no, porque el
          // club no abre y no hay ningún bloque al que pudiera haber venido.
          if (typeof c === 'number') {
            const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(c).padStart(2, '0')}`
            const dia = diaDeFecha(fecha)
            const habil = dia !== 'sab' && dia !== 'dom'
            return (
              <div key={i}
                onClick={habil ? () => onDia(fecha, dia) : undefined}
                title={habil ? `${fecha} · no le tocaba entrenar` : undefined}
                style={{ fontSize: 10, color: '#cbd5e1', textAlign: 'center', padding: '4px 0',
                  borderRadius: 4, cursor: habil ? 'pointer' : 'default' }}>
                {c}
              </div>
            )
          }
          const col = COLOR[c.estado]
          const esHoy = c.fecha === hoy
          // El día que le tocaba entrenar Y además vino a una clase extra
          // conserva su color: la extra se marca con un punto en la esquina.
          const puntoExtra = c.extra && c.estado !== 'extraordinaria'
          const detalle = c.bloques.length > 0 ? ` · ${c.bloques.join(', ')}` : ''
          return (
            <div key={i} onClick={() => onDia(c.fecha, c.dia)}
              title={`${c.fecha} · ${col.label}${detalle}${puntoExtra ? ' · + clase extra' : ''}`}
              style={{ position: 'relative', fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '4px 0', borderRadius: 4,
                background: col.bg, color: col.fg, cursor: 'pointer',
                outline: esHoy ? '2px solid #0f172a' : 'none', outlineOffset: 1 }}>
              {Number(c.fecha.slice(-2))}
              {puntoExtra && (
                <span style={{ position: 'absolute', top: 1, right: 1, width: 5, height: 5,
                  borderRadius: '50%', background: COLOR.extraordinaria.bg,
                  border: '1px solid #ffffff' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
