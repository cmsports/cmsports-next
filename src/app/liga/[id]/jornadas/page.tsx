'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import {
  guardarPieProgramacion,
  importarProgramacionJornada,
  leerJornada,
  proyectarJornada,
  type PrevisualizacionImportacion,
} from '@/app/actions/ligaJornadas'
import { bloquesNecesarios, horaDeBloque } from '@/lib/domain/ligaJornadas'
import { etiquetaDia } from '@/lib/liga-jornada-pdf'
import { BotonesPdfJornada } from '@/components/liga/BotonesPdfJornada'
import { useEnVivo } from '@/lib/useEnVivo'

// La pantalla de una liga por jornadas (modo `jornadas`, migración 272):
//   · ver cada jornada como se imprime (día → división → hora → mesa);
//   · pegar la programación ya publicada y cargarla tal cual;
//   · proyectar la siguiente con el motor, eligiendo por división el día y
//     las mesas de ESA jornada;
//   · bajar el PDF "Programación oficial — Jornada N".

const supabase = createClient()
const ink = '#0f172a', muted = '#64748b', hint = '#94a3b8', azul = '#2563eb'
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.10)' } as const
const inp = { width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', color: ink, fontSize: 13, outline: 'none' } as const
const boton = (primario = false) => ({
  background: primario ? azul : '#fff', color: primario ? '#fff' : ink,
  border: primario ? 'none' : '1px solid #e2e8f0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}) as const

type Jornada = NonNullable<Awaited<ReturnType<typeof leerJornada>>['jornada']>
type Division = { id: string; nombre: string; orden: number; jugadores: number; pendientes: number }
type FechaResumen = { id: string; numero: number; fecha: string | null; estado: string }

const ESTADO_FECHA: Record<string, string> = { programada: 'Programada', en_juego: 'En juego', finalizada: 'Terminada' }

function parsearMesas(texto: string): number[] {
  // "1-3" → [1,2,3]; "4,5,6" → [4,5,6]; "1 a 3" → [1,2,3]
  const rango = texto.match(/^\s*(\d+)\s*(?:-|–|a)\s*(\d+)\s*$/i)
  if (rango) {
    const a = Number(rango[1]), b = Number(rango[2])
    return a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : []
  }
  return [...new Set(texto.split(/[,\s]+/).map(Number).filter(n => Number.isInteger(n) && n > 0))]
}

export default function JornadasLigaPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const params = useParams()
  const router = useRouter()
  const ligaId = String(params.id)

  const [liga, setLiga] = useState<{ nombre: string; modo: string; horaInicio: string; porJugador: number; pie: string | null; club: string; logoUrl: string | null } | null>(null)
  const [fechas, setFechas] = useState<FechaResumen[]>([])
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [numeroActivo, setNumeroActivo] = useState<number | null>(null)
  const [jornada, setJornada] = useState<Jornada | null>(null)
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // Importar
  const [importarAbierto, setImportarAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState<PrevisualizacionImportacion | null>(null)
  const [importando, setImportando] = useState(false)

  // Proyectar
  const [proyectarAbierto, setProyectarAbierto] = useState(false)
  const [numeroNuevo, setNumeroNuevo] = useState(1)
  const [fechaNueva, setFechaNueva] = useState('')
  const [horaNueva, setHoraNueva] = useState('15:00')
  const [sesiones, setSesiones] = useState<Record<string, { activa: boolean; dia: number; mesas: string }>>({})
  const [proyectando, setProyectando] = useState(false)

  // Pie del PDF
  const [pie, setPie] = useState('')
  const [guardandoPie, setGuardandoPie] = useState(false)

  const esAdmin = perfil?.rol === 'admin'

  const cargarBase = useCallback(async () => {
    if (!perfil?.club_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const [{ data: l }, { data: fs }, { data: divs }, { data: club }] = await Promise.all([
      sb.from('ligas').select('nombre, modo_programacion, hora_inicio, partidos_por_jugador_por_fecha, pie_programacion').eq('id', ligaId).single(),
      sb.from('liga_fechas').select('id, numero, fecha, estado').eq('liga_id', ligaId).eq('es_ajuste', false).order('numero'),
      sb.from('liga_divisiones').select('id, nombre, orden').eq('liga_id', ligaId).order('orden'),
      sb.from('clubes').select('nombre, logo_url').eq('id', perfil.club_id).single(),
    ])
    if (!l) { router.replace('/liga'); return }
    setLiga({
      nombre: l.nombre, modo: l.modo_programacion ?? 'mesa_unica',
      horaInicio: String(l.hora_inicio ?? '15:00').slice(0, 5), porJugador: l.partidos_por_jugador_por_fecha ?? 3,
      pie: l.pie_programacion ?? null, club: club?.nombre ?? '', logoUrl: club?.logo_url ?? null,
    })
    setPie(l.pie_programacion ?? '')
    const lista: FechaResumen[] = fs ?? []
    setFechas(lista)
    // Cuántos jugadores y pendientes tiene cada división, para proyectar.
    const divIds = (divs ?? []).map((d: { id: string }) => d.id)
    const [{ data: miembros }, { data: pendientes }] = divIds.length
      ? await Promise.all([
          sb.from('liga_division_jugadores').select('division_id').in('division_id', divIds),
          sb.from('liga_partidos').select('division_id').in('division_id', divIds).is('fecha_id', null).is('deleted_at', null)
            .not('estado', 'in', '("finalizado","walkover")'),
        ])
      : [{ data: [] }, { data: [] }]
    const cuenta = (filas: Array<{ division_id: string }> | null, id: string) => (filas ?? []).filter(f => f.division_id === id).length
    setDivisiones((divs ?? []).map((d: { id: string; nombre: string; orden: number }) => ({
      ...d, jugadores: cuenta(miembros, d.id), pendientes: cuenta(pendientes, d.id),
    })))
    const ultima = lista[lista.length - 1]
    setNumeroActivo(prev => prev ?? ultima?.numero ?? null)
    setNumeroNuevo((ultima?.numero ?? 0) + 1)
    setCargando(false)
  }, [ligaId, perfil?.club_id, router])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    void cargarBase()
  }, [authLoading, perfil, cargarBase, router])

  useEffect(() => {
    if (numeroActivo === null) { setJornada(null); return }
    let vivo = true
    leerJornada({ ligaId, numero: numeroActivo }).then(res => {
      if (!vivo) return
      setJornada(res.jornada ?? null)
      if (res.error) setMensaje({ tipo: 'error', texto: res.error })
    })
    return () => { vivo = false }
  }, [ligaId, numeroActivo])

  useEnVivo(['liga_partidos'], perfil?.club_id ?? null, () => {
    if (numeroActivo !== null) leerJornada({ ligaId, numero: numeroActivo }).then(res => setJornada(res.jornada ?? null))
  }, { filtro: `liga_id=eq.${ligaId}` })

  // Sesiones por defecto al abrir "proyectar": reparte las divisiones en dos
  // días y en las seis mesas de a tres, como la Jornada 1. El admin lo cambia.
  function abrirProyectar() {
    setImportarAbierto(false)
    setProyectarAbierto(v => !v)
    setSesiones(prev => {
      if (Object.keys(prev).length) return prev
      const conJugadores = divisiones.filter(d => d.jugadores >= 2)
      const porDia = 2
      const mesasPorDivision = conJugadores.length <= porDia * 2 ? 3 : 2
      const nuevo: typeof prev = {}
      conJugadores.forEach((d, i) => {
        const dia = Math.floor(i / porDia) % 2
        const posEnDia = i % porDia
        const desde = posEnDia * mesasPorDivision + 1
        nuevo[d.id] = { activa: true, dia, mesas: `${desde}-${desde + mesasPorDivision - 1}` }
      })
      return nuevo
    })
  }

  async function revisarImportacion() {
    setMensaje(null)
    setImportando(true)
    const res = await importarProgramacionJornada({ ligaId, texto, soloPrevisualizar: true })
    setImportando(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); setPrevia(res.previsualizacion ?? null); return }
    setPrevia(res.previsualizacion ?? null)
  }

  async function confirmarImportacion() {
    if (!previa) return
    if (!confirm(`¿Cargar la Jornada ${previa.jornada} tal cual? Se crean ${previa.jugadores.nuevos.length} jugador(es) nuevo(s) y ${previa.dias.reduce((s, d) => s + d.divisiones.filter(x => !x.existe).length, 0)} división(es).`)) return
    setImportando(true)
    const res = await importarProgramacionJornada({ ligaId, texto })
    setImportando(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    const r = res.resumen!
    setMensaje({ tipo: 'ok', texto: `Jornada ${r.jornada} cargada: ${r.partidosProgramados} partidos, ${r.jugadoresCreados} jugadores nuevos, ${r.divisionesCreadas} divisiones nuevas.${r.noEncontrados.length ? ` Sin ubicar: ${r.noEncontrados.join('; ')}` : ''}` })
    setImportarAbierto(false); setTexto(''); setPrevia(null)
    await cargarBase()
    setNumeroActivo(r.jornada)
  }

  async function proyectar() {
    setMensaje(null)
    const elegidas = Object.entries(sesiones).filter(([, s]) => s.activa).map(([divisionId, s]) => ({ divisionId, diaOffset: s.dia, mesas: parsearMesas(s.mesas) }))
    if (!elegidas.length) { setMensaje({ tipo: 'error', texto: 'Elige al menos una división.' }); return }
    if (elegidas.some(s => !s.mesas.length)) { setMensaje({ tipo: 'error', texto: 'Cada división necesita sus mesas (por ejemplo "1-3").' }); return }
    if (!fechaNueva) { setMensaje({ tipo: 'error', texto: 'Falta el día (sábado) de la fecha.' }); return }
    const yaExiste = fechas.find(f => f.numero === numeroNuevo)
    if (yaExiste && !confirm(`La fecha ${numeroNuevo} ya existe. Se vuelve a repartir lo que no se haya jugado. ¿Seguir?`)) return
    setProyectando(true)
    const res = await proyectarJornada({ ligaId, numero: numeroNuevo, fecha: fechaNueva, horaInicio: horaNueva, sesiones: elegidas })
    setProyectando(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    const detalle = (res.resumen ?? []).map(r => {
      const d = divisiones.find(x => x.id === r.divisionId)
      return `${d?.nombre ?? ''}: ${r.partidos} partidos en ${r.bloques} bloques (hasta ${r.horaFin})${r.sinArbitro ? `, ${r.sinArbitro} sin árbitro` : ''}${r.huecoRespetado ? '' : ', con esperas de hasta 1 hora'}${r.pendientesRestantes ? `, quedan ${r.pendientesRestantes} por jugar` : ', ¡división completa!'}`
    })
    setMensaje({ tipo: 'ok', texto: `Fecha ${numeroNuevo} proyectada. ${detalle.join(' · ')}` })
    setProyectarAbierto(false)
    await cargarBase()
    setNumeroActivo(numeroNuevo)
  }

  async function guardarPie() {
    setGuardandoPie(true)
    const res = await guardarPieProgramacion({ ligaId, pie })
    setGuardandoPie(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    setLiga(l => (l ? { ...l, pie: pie.trim() || null } : l))
  }

  const estimacion = useMemo(() => {
    return divisiones.map(d => {
      const s = sesiones[d.id]
      const mesas = s ? parsearMesas(s.mesas).length : 0
      const partidos = Math.min(d.pendientes, Math.floor((d.jugadores * (liga?.porJugador ?? 3)) / 2))
      const bloques = mesas ? bloquesNecesarios(partidos, mesas) : 0
      return { id: d.id, partidos, bloques, horaFin: bloques ? horaDeBloque(bloques, horaNueva || '15:00') : null }
    })
  }, [divisiones, sesiones, liga?.porJugador, horaNueva])

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}><div style={{ color: hint }}>Cargando...</div></div>
  }

  if (liga && liga.modo !== 'jornadas') {
    return (
      <AppLayout perfil={perfil}>
        <div style={{ ...card, padding: 24, maxWidth: 560, margin: '40px auto', textAlign: 'center', color: muted, fontSize: 14 }}>
          Esta liga se programa con el modo de siempre (una mesa por división). Las jornadas son para las ligas creadas &ldquo;por jornadas&rdquo;.
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <button onClick={() => router.push(`/liga/${ligaId}`)} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', color: muted, fontSize: 13, cursor: 'pointer' }}>← Liga</button>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: ink, margin: 0, flex: 1 }}>{liga?.nombre} · Fechas</h1>
          {esAdmin && (
            <>
              <button onClick={() => { setImportarAbierto(v => !v); setProyectarAbierto(false) }} style={boton()}>📋 Pegar programación publicada</button>
              <button onClick={abrirProyectar} style={boton(true)}>✨ Proyectar fecha {numeroNuevo}</button>
            </>
          )}
        </div>
        <p style={{ fontSize: 12, color: hint, marginBottom: 16 }}>
          Cada fecha es un fin de semana: cada división juega una tarde, {liga?.porJugador} partidos por jugador, bloques de 30 min desde las {liga?.horaInicio}, árbitros de la misma división.
        </p>

        {mensaje && (
          <div style={{ background: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`, color: mensaje.tipo === 'ok' ? '#166534' : '#991b1b', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            {mensaje.texto}
          </div>
        )}

        {/* ── Importar ── */}
        {importarAbierto && esAdmin && (
          <div style={{ ...card, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: ink, marginBottom: 6 }}>Pegar la programación tal cual la publicaron</div>
            <p style={{ fontSize: 12, color: muted, marginBottom: 10, lineHeight: 1.5 }}>
              Copia el texto del PDF y pégalo entero: el título con &ldquo;Jornada N&rdquo;, cada día (&ldquo;Sábado 12 de septiembre&rdquo;), cada división
              (&ldquo;División de Honor — mesas 1 a 3&rdquo;) y sus filas (&ldquo;15:00 1 Jugador A vs Jugador B Árbitro&rdquo;). Los jugadores que no existan se crean.
            </p>
            <textarea value={texto} onChange={e => { setTexto(e.target.value); setPrevia(null) }} rows={12}
              placeholder={'Programación oficial — Jornada 1\nSábado 12 de septiembre · desde las 15:00 hrs\nDivisión de Honor — mesas 1 a 3\n15:00 1 Javier Cabrera vs Santiago Rojas María Ignacia Valenzuela\n…'}
              style={{ ...inp, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={revisarImportacion} disabled={importando || !texto.trim()} style={boton()}>{importando ? 'Revisando…' : 'Revisar'}</button>
              {previa && previa.filasAmbiguas.length === 0 && (
                <button onClick={confirmarImportacion} disabled={importando} style={boton(true)}>{importando ? 'Cargando…' : `Cargar Jornada ${previa.jornada}`}</button>
              )}
              <button onClick={() => { setImportarAbierto(false); setPrevia(null) }} style={{ ...boton(), color: muted }}>Cancelar</button>
            </div>
            {previa && (
              <div style={{ marginTop: 14, fontSize: 13, color: ink, lineHeight: 1.6 }}>
                <div><strong>Jornada {previa.jornada}</strong> · {previa.totalPartidos} partidos</div>
                {previa.dias.map(d => (
                  <div key={d.etiqueta} style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 700 }}>{d.etiqueta}{d.fecha ? ` (${d.fecha})` : ' — sin fecha legible'}</div>
                    {d.divisiones.map(x => (
                      <div key={x.nombre} style={{ color: muted, paddingLeft: 12 }}>
                        {x.nombre} · mesas {x.mesas.join(', ')} · {x.partidos} partidos {x.existe ? '' : <span style={{ color: '#7c3aed' }}>· división nueva</span>}
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  Jugadores: <strong>{previa.jugadores.encontrados.length}</strong> ya existen
                  {previa.jugadores.nuevos.length > 0 && <>, <strong style={{ color: '#7c3aed' }}>{previa.jugadores.nuevos.length}</strong> se crean: <span style={{ color: muted }}>{previa.jugadores.nuevos.join(', ')}</span></>}
                </div>
                {previa.filasAmbiguas.length > 0 && (
                  <div style={{ marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', color: '#92400e' }}>
                    No pude separar rival y árbitro en {previa.filasAmbiguas.length} fila(s). Pon dos espacios o un tabulador entre ellos:
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {previa.filasAmbiguas.map((f, i) => <li key={i}>{f.division} · {f.hora} · mesa {f.mesa}: {f.texto}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Proyectar ── */}
        {proyectarAbierto && esAdmin && (
          <div style={{ ...card, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: ink, marginBottom: 6 }}>Proyectar una fecha</div>
            <p style={{ fontSize: 12, color: muted, marginBottom: 12, lineHeight: 1.5 }}>
              Por división: qué día del fin de semana juega y con qué mesas. El motor elige {liga?.porJugador} partidos por jugador de los que faltan,
              los reparte en bloques desde la hora de inicio y asigna árbitros de la misma división.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Fecha N°</label>
                <input type="number" min={1} value={numeroNuevo} onChange={e => setNumeroNuevo(Number(e.target.value))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Primer día (sábado)</label>
                <input type="date" value={fechaNueva} onChange={e => setFechaNueva(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Hora de inicio</label>
                <input type="time" value={horaNueva} onChange={e => setHoraNueva(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{ ...card, boxShadow: 'none', overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '28px 1.6fr 1fr 1fr 1.4fr', gap: 8, padding: '8px 12px', background: '#f8fafc', fontSize: 11, color: muted, fontWeight: 700, textTransform: 'uppercase' }}>
                <div /><div>División</div><div>Día</div><div>Mesas</div><div>Estimado</div>
              </div>
              {divisiones.map(d => {
                const s = sesiones[d.id] ?? { activa: false, dia: 0, mesas: '' }
                const est = estimacion.find(e => e.id === d.id)
                return (
                  <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '28px 1.6fr 1fr 1fr 1.4fr', gap: 8, padding: '8px 12px', borderTop: '1px solid #f1f5f9', alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={s.activa} onChange={e => setSesiones(p => ({ ...p, [d.id]: { ...s, activa: e.target.checked } }))} />
                    <div>
                      <div style={{ color: ink, fontWeight: 600 }}>{d.nombre}</div>
                      <div style={{ fontSize: 11, color: hint }}>{d.jugadores} jugadores · {d.pendientes} partidos por jugar</div>
                    </div>
                    <select value={s.dia} onChange={e => setSesiones(p => ({ ...p, [d.id]: { ...s, dia: Number(e.target.value) } }))} style={inp}>
                      <option value={0}>Sábado (día 1)</option>
                      <option value={1}>Domingo (día 2)</option>
                    </select>
                    <input value={s.mesas} placeholder="1-3" onChange={e => setSesiones(p => ({ ...p, [d.id]: { ...s, mesas: e.target.value } }))} style={inp} />
                    <div style={{ fontSize: 12, color: muted }}>
                      {s.activa && est && est.bloques > 0 ? `${est.partidos} partidos · ${est.bloques} bloques · hasta ${est.horaFin}` : d.pendientes === 0 ? 'división completa' : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={proyectar} disabled={proyectando} style={boton(true)}>{proyectando ? 'Proyectando…' : `Proyectar Fecha ${numeroNuevo}`}</button>
              <button onClick={() => setProyectarAbierto(false)} style={{ ...boton(), color: muted }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* ── Selector de jornada ── */}
        {fechas.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            {fechas.map(f => (
              <button key={f.id} onClick={() => setNumeroActivo(f.numero)}
                style={{ padding: '7px 12px', borderRadius: 20, border: numeroActivo === f.numero ? `2px solid ${azul}` : '1px solid #e2e8f0', background: numeroActivo === f.numero ? '#eff6ff' : '#fff', color: numeroActivo === f.numero ? azul : muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Fecha {f.numero}{f.fecha ? ` · ${f.fecha.slice(8, 10)}/${f.fecha.slice(5, 7)}` : ''} <span style={{ fontWeight: 500, opacity: 0.7 }}>· {ESTADO_FECHA[f.estado] ?? f.estado}</span>
              </button>
            ))}
            <span style={{ flex: 1 }} />
            {jornada && liga && <BotonesPdfJornada ligaId={ligaId} numero={jornada.numero} clubNombre={liga.club} ligaNombre={liga.nombre} pie={liga.pie} logoUrl={liga.logoUrl} compacto />}
          </div>
        ) : (
          <div style={{ ...card, padding: 24, textAlign: 'center', color: muted, fontSize: 13, marginBottom: 16 }}>
            Todavía no hay fechas. Pega la programación publicada o proyecta la primera.
          </div>
        )}

        {/* ── La jornada, como se imprime ── */}
        {jornada && jornada.dias.map(dia => (
          <div key={dia.diaOffset} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: azul, marginBottom: 8 }}>{etiquetaDia(dia.fecha)}</div>
            {dia.divisiones.map(div => (
              <div key={div.divisionId} style={{ ...card, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{div.nombre} <span style={{ color: hint, fontWeight: 500, fontSize: 12 }}>— {div.mesas.length ? `mesas ${div.mesas.join(', ')}` : 'sin mesas'}</span></div>
                  <div style={{ fontSize: 11, color: hint }}>{div.partidos.length} partidos</div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: muted, fontSize: 11, textTransform: 'uppercase' }}>
                        <th style={{ textAlign: 'left', padding: '7px 14px', width: 60 }}>Hora</th>
                        <th style={{ textAlign: 'center', padding: '7px 8px', width: 50 }}>Mesa</th>
                        <th style={{ textAlign: 'left', padding: '7px 8px' }}>Partido</th>
                        <th style={{ textAlign: 'left', padding: '7px 8px', width: 190 }}>Árbitro</th>
                        <th style={{ textAlign: 'right', padding: '7px 14px', width: 90 }}>Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {div.partidos.map(p => (
                        <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: ink }}>{p.hora}</td>
                          <td style={{ padding: '8px 8px', textAlign: 'center', color: ink }}>{p.mesa || '—'}</td>
                          <td style={{ padding: '8px 8px', color: ink }}>{p.jugadorA} <span style={{ color: hint }}>vs</span> {p.jugadorB}</td>
                          <td style={{ padding: '8px 8px', color: p.arbitro ? muted : '#b45309' }}>{p.arbitro ?? 'sin árbitro'}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', color: p.estado === 'finalizado' ? '#16a34a' : p.estado === 'walkover' ? '#b45309' : hint }}>
                            {p.estado === 'finalizado' ? `${p.setsA ?? ''}-${p.setsB ?? ''}` : p.estado === 'walkover' ? 'W.O.' : '·'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* ── Pie del PDF ── */}
        {esAdmin && (
          <div style={{ ...card, padding: 16, marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: ink, marginBottom: 6 }}>Pie de la hoja impresa</div>
            <p style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Reglas, contacto, dirección. Sale al pie de cada página del PDF.</p>
            <textarea value={pie} onChange={e => setPie(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }}
              placeholder="Presentarse 15 minutos antes del primer compromiso (partido o arbitraje) · Sugerencias de horario: lunes y martes al WhatsApp … · Espera máxima 15 min → W.O. 3-0 · Reglamento ITTF" />
            <div style={{ marginTop: 8 }}>
              <button onClick={guardarPie} disabled={guardandoPie || pie.trim() === (liga?.pie ?? '')} style={boton()}>{guardandoPie ? 'Guardando…' : 'Guardar pie'}</button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
