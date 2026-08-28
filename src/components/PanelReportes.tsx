'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { DIAS, diaLabel, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel, sedesDe } from '@/lib/domain/sedeGrupo'
import { fechaChile } from '@/lib/domain/fechaChile'
import {
  calcularReporteMes, diaDe, horas, porDia, semanasDelMes,
  type AsignacionProfesor, type BloqueMes, type ClaseOmitida,
  type DiaSuspendido, type InscripcionMes, type ReporteMes,
} from '@/lib/domain/reportesMes'
import { descargarExcelReporteMes } from '@/lib/reportesMes-excel'
import { descargarPdfReporteMes } from '@/lib/reportesMes-pdf'
import { cargarHistorialClub } from '@/lib/supabase/historial'
import { calendarioJugador, indexar } from '@/lib/domain/historialAsistencia'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'
const aviso = '#c2410c'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** El número del día, que es lo único que cambia dentro de un mismo grupo. */
function nDia(fecha: string) { return Number(fecha.slice(8, 10)) }
/** Para fechas sueltas, donde el día de la semana sí aporta. */
function diaYN(fecha: string) { return `${diaLabel(diaDe(fecha)).toLowerCase()} ${nDia(fecha)}` }

function ordenDia(dia: string): number {
  const i = DIAS.findIndex(d => d.value === dia)
  return i === -1 ? 99 : i
}

/** Una fila que se abre. El título es el resumen; adentro va de dónde salió. */
function Desplegable({ abierto, onToggle, cabecera, children }: {
  abierto: boolean
  onToggle: () => void
  cabecera: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: '1px solid #f1f5f9' }}>
      <button onClick={onToggle}
        style={{ width: '100%', display: 'block', textAlign: 'left', padding: '12px 16px',
          background: abierto ? '#f8fafc' : 'transparent', border: 'none', cursor: 'pointer' }}>
        {cabecera}
      </button>
      {abierto && <div style={{ padding: '4px 16px 16px' }}>{children}</div>}
    </div>
  )
}

function Omitidas({ items, color }: { items: ClaseOmitida[]; color: string }) {
  if (items.length === 0) return null
  // Se agrupan por motivo: "jue 16, 23, 30 — el grupo cerró" se lee de una;
  // tres líneas iguales con distinta fecha, no.
  const porMotivo = new Map<string, string[]>()
  for (const o of items) porMotivo.set(o.motivo, [...(porMotivo.get(o.motivo) ?? []), o.fecha])
  return (
    <>
      {[...porMotivo.entries()].map(([motivo, fechas]) => (
        <div key={motivo} style={{ fontSize: 12, color, marginTop: 3 }}>
          ✕ {fechas.map(diaYN).join(', ')} — {motivo}
        </div>
      ))}
    </>
  )
}

export default function PanelReportes({ clubId }: { clubId: string }) {
  const hoy = fechaChile()
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)))
  const [mes, setMes]   = useState(Number(hoy.slice(5, 7)))
  const [abierto, setAbierto] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null)
  const [sedeGrupos, setSedeGrupos] = useState('buin')

  const [bloques, setBloques]           = useState<BloqueMes[]>([])
  const [asignaciones, setAsignaciones] = useState<AsignacionProfesor[]>([])
  const [inscripciones, setInscrip]     = useState<InscripcionMes[]>([])
  const [suspensiones, setSuspen]       = useState<DiaSuspendido[]>([])
  const [profesores, setProfesores]     = useState<{ id: string; nombre: string }[]>([])
  const [jugadores, setJugadores]       = useState<{ id: string; nombre: string }[]>([])

  const toggle = (k: string) => setAbierto(s => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })

  const cargar = useCallback(async () => {
    // Sin filtrar por `activo`: la vigencia es la que manda. Un grupo dado de
    // baja tiene que seguir contando en los meses en que sí funcionó, y dejar
    // de contar en los siguientes.
    const { data: bl } = await supabase.from('bloques_horario')
      .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,vigente_desde,vigente_hasta')
      .eq('club_id', clubId)
    const ids = (bl ?? []).map((b: { id: string }) => b.id)

    const [{ data: ap }, { data: ins }, { data: exc }, { data: pr }, { data: jg }] = await Promise.all([
      supabase.from('bloque_profesores').select('bloque_id,profesor_id,vigente_desde,vigente_hasta').in('bloque_id', ids),
      supabase.from('bloque_jugadores').select('bloque_id,jugador_id,vigente_desde,vigente_hasta').in('bloque_id', ids),
      supabase.from('bloque_excepciones').select('bloque_id,fecha,motivo').in('bloque_id', ids),
      supabase.from('profesores').select('id,nombre').eq('club_id', clubId),
      supabase.from('jugadores').select('id,nombre').eq('club_id', clubId),
    ])

    setBloques((bl ?? []) as BloqueMes[])
    setAsignaciones((ap ?? []) as AsignacionProfesor[])
    setInscrip((ins ?? []) as InscripcionMes[])
    setSuspen((exc ?? []) as DiaSuspendido[])
    setProfesores((pr ?? []) as { id: string; nombre: string }[])
    setJugadores((jg ?? []) as { id: string; nombre: string }[])
    setCargando(false)
  }, [clubId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['bloque_jugadores', 'bloques_horario', 'bloque_excepciones'], clubId, cargar, { conClub: ['bloques_horario'] })

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Calculando...</div>

  const r: ReporteMes = calcularReporteMes({ anio, mes, hoy, bloques, asignaciones, inscripciones, suspensiones })
  const nombreProf = (id: string) => profesores.find(p => p.id === id)?.nombre ?? 'Profesor dado de baja'
  const nombreJug  = (id: string) => jugadores.find(j => j.id === id)?.nombre ?? '—'
  const semanas = semanasDelMes(r.fechas)
  const dias = porDia(r, asignaciones)
  const tituloMes = `${MESES[mes - 1]} ${anio}`

  // Cuánto le llevó asistir a cada jugador a cada grupo, dentro del mismo mes
  // del reporte. Mismo motor que Asistencia → Ranking (cargarHistorialClub +
  // calendarioJugador): se recalcula al momento de exportar, no en cada
  // render, porque solo se necesita para el Excel.
  async function calcularAsistenciaPorGrupo(desde: string, hasta: string) {
    const datosClub = await cargarHistorialClub(clubId, desde, hasta)
    const indice = indexar(datosClub)
    const bloquePorNombre = new Map(datosClub.bloques.map(b => [b.nombre, b]))
    const idsInscritos = new Set(inscripciones.filter(i => !i.vigente_hasta).map(i => i.jugador_id))

    const conteo = new Map<string, Map<string, { presentes: number; ausentes: number }>>()
    for (const jugadorId of idsInscritos) {
      for (const dia of calendarioJugador(jugadorId, desde, hasta, datosClub, indice)) {
        if (dia.estado === 'extraordinaria' || dia.estado === 'pendiente') continue
        for (const nombreBloque of dia.bloques) {
          const bloque = bloquePorNombre.get(nombreBloque)
          if (!bloque) continue
          let porJugador = conteo.get(bloque.id)
          if (!porJugador) { porJugador = new Map(); conteo.set(bloque.id, porJugador) }
          const c = porJugador.get(jugadorId) ?? { presentes: 0, ausentes: 0 }
          if (dia.estado === 'presente') c.presentes++; else c.ausentes++
          porJugador.set(jugadorId, c)
        }
      }
    }

    const pct = new Map<string, Map<string, number | null>>()
    for (const [bloqueId, porJugador] of conteo) {
      const m = new Map<string, number | null>()
      for (const [jugadorId, c] of porJugador) {
        const total = c.presentes + c.ausentes
        m.set(jugadorId, total > 0 ? Math.round((c.presentes / total) * 100) : null)
      }
      pct.set(bloqueId, m)
    }
    return pct
  }

  async function exportar(formato: 'excel' | 'pdf') {
    setExportando(formato)
    try {
      if (formato === 'excel') {
        const desde = r.fechas[0] ?? hoy
        const hasta = r.fechas[r.fechas.length - 1] ?? hoy
        const pctAsistencia = await calcularAsistenciaPorGrupo(desde, hasta)
        await descargarExcelReporteMes({ clubNombre: 'CmSports', tituloMes, r, asignaciones, nombreProf, inscripciones, nombreJug, pctAsistencia })
      } else {
        await descargarPdfReporteMes({ clubNombre: 'CmSports', tituloMes, r, dias, asignaciones, nombreProf })
      }
    } finally {
      setExportando(null)
    }
  }

  const mover = (n: number) => {
    const d = new Date(Date.UTC(anio, mes - 1 + n, 1))
    setAnio(d.getUTCFullYear()); setMes(d.getUTCMonth() + 1); setAbierto(new Set())
  }
  const esMesActual = anio === Number(hoy.slice(0, 4)) && mes === Number(hoy.slice(5, 7))

  // Grupos que en este mes no llegaron a existir nunca: ensucian la tabla y no
  // dicen nada. Se cuentan aparte.
  const gruposDelMes = r.grupos.filter(g => g.dictadas.length + g.suspendidas.length > 0)
  const gruposFuera  = r.grupos.length - gruposDelMes.length

  // La sección "Grupos" se mira de a una sede a la vez, agrupada por día:
  // las dos sedes mezcladas en una sola lista larga no se entendían de un
  // vistazo. Igual que el filtro de sede de Cupos.
  // Las sedes salen de los grupos del mes, no del catálogo de Buin: Spinhouse
  // no figuraba en ninguna pestaña. Y si la elegida no existe acá, se cae a la
  // primera que sí.
  const sedesDelMes = sedesDe(gruposDelMes.map(g => g.bloque))
  const sedeVista = sedesDelMes.includes(sedeGrupos) ? sedeGrupos : (sedesDelMes[0] ?? sedeGrupos)

  const gruposSede = gruposDelMes
    .filter(g => g.bloque.sede === sedeVista)
    .sort((a, b) => ordenDia(a.bloque.dia_semana) - ordenDia(b.bloque.dia_semana) || a.bloque.hora_inicio.localeCompare(b.bloque.hora_inicio))

  // Un grupo con dos profesores le suma horas a los dos, pero se dicta una sola
  // vez. Por eso la suma por profesor puede pasar el total del club, y hay que
  // decirlo: si no, el desglose parece contradecir el número de arriba.
  const minutosProfesores = r.profesores.reduce((s, p) => s + p.minutos, 0)
  const gruposCompartidos = gruposDelMes.filter(g =>
    new Set(asignaciones.filter(a => a.bloque_id === g.bloque.id).map(a => a.profesor_id)).size > 1
  ).length

  const flecha = { padding: '5px 11px', fontSize: 14, borderRadius: 8, border: '1px solid #e2e8f0',
    background: '#fff', color: muted, cursor: 'pointer' } as const
  const tituloSec = { fontSize: 14, fontWeight: 700, color: text } as const
  const comoSe = { fontSize: 11, color: hint, marginTop: 3, lineHeight: 1.5 } as const
  const chip = { fontSize: 11, background: '#eef2ff', color: '#4338ca', padding: '3px 8px',
    borderRadius: 6, fontWeight: 600 } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => mover(-1)} style={flecha}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: text, textTransform: 'capitalize', minWidth: 130, textAlign: 'center' }}>
          {MESES[mes - 1]} {anio}
        </span>
        <button onClick={() => mover(1)} style={flecha} disabled={esMesActual}>›</button>
        <span style={{ fontSize: 11, color: hint }}>
          {r.fechas.length} días hábiles
          {esMesActual && ' · el mes va corriendo, los números crecen hasta fin de mes'}
        </span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button onClick={() => exportar('excel')} disabled={exportando !== null}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid #bbf7d0',
              background: '#f0fdf4', color: '#16a34a', cursor: exportando ? 'default' : 'pointer', opacity: exportando ? 0.6 : 1 }}>
            {exportando === 'excel' ? 'Generando...' : 'Exportar Excel'}
          </button>
          <button onClick={() => exportar('pdf')} disabled={exportando !== null}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid #fecaca',
              background: '#fef2f2', color: '#dc2626', cursor: exportando ? 'default' : 'pointer', opacity: exportando ? 0.6 : 1 }}>
            {exportando === 'pdf' ? 'Generando...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {([
          ['Horas dictadas', horas(r.minutosTotales) + ' h', 'resumen-horas'],
          ['Clases dictadas', String(r.clasesDictadas), 'resumen-clases'],
          ['Grupos del mes', String(gruposDelMes.length), 'resumen-grupos'],
        ] as const).map(([label, valor, clave]) => (
          <div key={clave} style={{ ...card, padding: 14, cursor: 'pointer' }} onClick={() => toggle(clave)}>
            <div style={{ fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: text, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, marginTop: 4 }}>
              {abierto.has(clave) ? 'ocultar' : 'cómo se calcula'}
            </div>
            {abierto.has(clave) && (
              <div style={{ fontSize: 12, color: muted, marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 8, lineHeight: 1.6 }}>
                {clave === 'resumen-horas' && (
                  <>
                    Horas de clase dictadas: cada clase cuenta una vez, sin importar cuántos profesores la tomen.
                    {r.clasesSuspendidas > 0 && <> No cuenta {r.clasesSuspendidas} clase{r.clasesSuspendidas === 1 ? '' : 's'} marcada{r.clasesSuspendidas === 1 ? '' : 's'} sin clase.</>}
                    <div style={{ marginTop: 6 }}>
                      {r.profesores.map(p => (
                        <div key={p.profesorId}>{nombreProf(p.profesorId)}: {horas(p.minutos)} h</div>
                      ))}
                      {r.profesores.length === 0 && <>Ningún grupo tiene profesor asignado.</>}
                    </div>
                    {minutosProfesores !== r.minutosTotales && (
                      <div style={{ marginTop: 6, color: aviso }}>
                        Sumadas dan {horas(minutosProfesores)} h, más que las {horas(r.minutosTotales)} h de arriba:
                        {' '}{gruposCompartidos} grupo{gruposCompartidos === 1 ? '' : 's'} tiene{gruposCompartidos === 1 ? '' : 'n'} dos profesores,
                        así que esa clase le suma horas a cada uno pero se dicta una sola vez.
                      </div>
                    )}
                  </>
                )}
                {clave === 'resumen-clases' && (
                  <>
                    Cada vez que un grupo vigente cayó en su día de la semana.
                    {r.clasesSuspendidas > 0
                      ? <> Otras {r.clasesSuspendidas} tocaban pero están marcadas sin clase.</>
                      : <> Ninguna quedó marcada sin clase este mes.</>}
                  </>
                )}
                {clave === 'resumen-grupos' && (
                  <>
                    Grupos que funcionaron al menos un día de este mes.
                    {gruposFuera > 0 && <> Hay {gruposFuera} más en el horario que este mes no existían todavía o ya habían cerrado.</>}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detalle por día: el mes en orden cronológico, agrupado por sede
          dentro de cada día — la forma en que conviene revisarlo. */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={tituloSec}>Detalle por día</div>
          <div style={comoSe}>Cada día del mes, con lo que se dictó por sede y lo que quedó sin clase.</div>
        </div>

        {dias.map(d => {
          const clave = 'dia-' + d.fecha
          const totalDia = d.sedes.reduce((s, sede) => s + sede.clases.length, 0)
          const suspendidasDia = d.sedes.reduce((s, sede) => s + sede.suspendidas.length, 0)
          return (
            <Desplegable key={d.fecha} abierto={abierto.has(clave)} onToggle={() => toggle(clave)}
              cabecera={
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: text, textTransform: 'capitalize' }}>{diaYN(d.fecha)}</span>
                  <span style={{ fontSize: 11, color: hint }}>{d.fecha}</span>
                  <span style={{ fontSize: 12, color: muted, marginLeft: 'auto' }}>
                    {totalDia} clase{totalDia === 1 ? '' : 's'}
                    {suspendidasDia > 0 && ` · ${suspendidasDia} sin clase`}
                  </span>
                </div>
              }>
              {d.sedes.map(s => (
                <div key={s.sede} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: hint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {sedeLabel(s.sede)}
                  </div>
                  {s.clases.map(c => (
                    <div key={c.bloque.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: text, padding: '2px 0', flexWrap: 'wrap' }}>
                      <span style={{ color: muted, minWidth: 92 }}>{rangoHorario(c.bloque.hora_inicio, c.bloque.hora_fin)}</span>
                      <span style={{ fontWeight: 600 }}>{c.bloque.nombre}</span>
                      {c.profesorIds.length > 0 && <span style={{ color: muted }}>{c.profesorIds.map(nombreProf).filter(Boolean).join(' + ')}</span>}
                      <span style={{ color: hint, marginLeft: 'auto' }}>{c.inscritos} inscritos</span>
                    </div>
                  ))}
                  {s.suspendidas.map(sus => (
                    <div key={sus.bloque.id} style={{ fontSize: 12, color: aviso, padding: '2px 0' }}>
                      ✕ {rangoHorario(sus.bloque.hora_inicio, sus.bloque.hora_fin)} {sus.bloque.nombre} — {sus.motivo}
                    </div>
                  ))}
                </div>
              ))}
            </Desplegable>
          )
        })}

        {dias.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: hint, fontSize: 12 }}>
            Ningún día con clases o suspensiones en {MESES[mes - 1]} {anio}.
          </div>
        )}
      </div>

      {/* Horas por profesor */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={tituloSec}>Horas por profesor</div>
          <div style={comoSe}>
            Se recorre el mes día por día: cada clase que le tocó dictar suma su duración.
            No suman los días marcados sin clase, ni los grupos antes de que se los asignaran o después de que se los sacaran.
            Tocá un profesor para ver de qué clases salió el número.
          </div>
        </div>

        {r.profesores.map(p => {
          const clave = 'prof-' + p.profesorId
          const dias = p.diasTrabajados.length
          return (
            <Desplegable key={p.profesorId} abierto={abierto.has(clave)} onToggle={() => toggle(clave)}
              cabecera={
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: text }}>{nombreProf(p.profesorId)}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: text, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                      {horas(p.minutos)} h
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: muted, marginTop: 4 }}>
                    <span>{horas(semanas > 0 ? p.minutos / semanas : 0)} h por semana</span>
                    <span>{horas(dias > 0 ? p.minutos / dias : 0)} h por día</span>
                    <span>{dias} día{dias === 1 ? '' : 's'}</span>
                    <span>{p.porGrupo.length} grupo{p.porGrupo.length === 1 ? '' : 's'}</span>
                  </div>
                </>
              }>
              <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
                {horas(p.minutos)} h ÷ {semanas.toFixed(1).replace('.', ',')} semanas del mes = {horas(semanas > 0 ? p.minutos / semanas : 0)} h por semana.
                {' '}÷ {dias} día{dias === 1 ? '' : 's'} trabajado{dias === 1 ? '' : 's'} = {horas(dias > 0 ? p.minutos / dias : 0)} h por día.
              </div>

              {p.porGrupo.map(g => (
                <div key={g.bloque.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{g.bloque.nombre}</span>
                    <span style={{ fontSize: 11, color: hint }}>
                      {diaLabel(g.bloque.dia_semana)} {rangoHorario(g.bloque.hora_inicio, g.bloque.hora_fin)} · {sedeLabel(g.bloque.sede)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: text, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                      {horas(g.minutos)} h
                    </span>
                  </div>
                  {g.dictadas.length > 0 && (
                    <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                      {g.dictadas.length} × {horas(g.dictadas[0].minutos)} h — {diaLabel(g.bloque.dia_semana).toLowerCase()} {g.dictadas.map(d => nDia(d.fecha)).join(', ')}
                    </div>
                  )}
                  <Omitidas items={g.omitidas} color={aviso} />
                </div>
              ))}

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: muted }}>Total</span>
                <span style={{ fontSize: 11, color: hint }}>{p.porGrupo.map(g => horas(g.minutos)).join(' + ')}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: text, marginLeft: 'auto' }}>{horas(p.minutos)} h</span>
              </div>
            </Desplegable>
          )
        })}

        {r.profesores.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: hint, fontSize: 12 }}>
            Este mes no hay clases con profesor asignado.
          </div>
        )}
      </div>

      {/* Grupos */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={tituloSec}>Grupos</div>
          <div style={comoSe}>
            Cuántas veces se dictó cada grupo este mes y cuánta gente tiene hoy.
            Tocá uno para ver las fechas, lo que no se dictó y quiénes están inscritos.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {sedesDelMes.map(v => {
              const activa = sedeVista === v
              return (
                <button key={v} onClick={() => setSedeGrupos(v)}
                  style={{ background: activa ? '#4f46e5' : '#f4f7fa', color: activa ? '#fff' : muted,
                    border: `1px solid ${activa ? '#4f46e5' : '#e2e8f0'}`, borderRadius: 8, padding: '6px 12px',
                    fontSize: 12, fontWeight: activa ? 600 : 400, cursor: 'pointer' }}>
                  {sedeLabel(v).split(' ')[0]}
                </button>
              )
            })}
          </div>
        </div>

        {DIAS.filter(d => gruposSede.some(g => g.bloque.dia_semana === d.value)).map(d => (
          <div key={d.value}>
            <div style={{ padding: '8px 16px', background: '#f8fafc', fontSize: 11, fontWeight: 700, color: muted,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {d.label}
            </div>
            {gruposSede.filter(g => g.bloque.dia_semana === d.value).map(g => {
              const clave = 'grupo-' + g.bloque.id
              const tocaban = g.dictadas.length + g.suspendidas.length
              const libres = g.bloque.cupo_maximo - g.inscritos
              const suyos = inscripciones
                .filter(i => i.bloque_id === g.bloque.id && !i.vigente_hasta)
                .sort((a, b) => nombreJug(a.jugador_id).localeCompare(nombreJug(b.jugador_id), 'es'))
              const profes = [...new Set(asignaciones.filter(a => a.bloque_id === g.bloque.id).map(a => a.profesor_id))]
              return (
                <Desplegable key={g.bloque.id} abierto={abierto.has(clave)} onToggle={() => toggle(clave)}
                  cabecera={
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: text }}>{g.bloque.nombre}</span>
                        <span style={{ fontSize: 11, color: hint }}>
                          {rangoHorario(g.bloque.hora_inicio, g.bloque.hora_fin)}
                          {profes.length > 0 && ' · ' + profes.map(nombreProf).join(', ')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, marginTop: 4 }}>
                        <span style={{ color: g.suspendidas.length > 0 ? aviso : muted }}>
                          {g.dictadas.length} de {tocaban} clase{tocaban === 1 ? '' : 's'}
                          {g.suspendidas.length > 0 && ` · ${g.suspendidas.length} sin clase`}
                        </span>
                        <span style={{ color: muted }}>{horas(g.minutos)} h</span>
                        <span style={{ color: muted }}>
                          {g.inscritos} de {g.bloque.cupo_maximo}
                          {libres > 0 ? ` · ${libres} libre${libres === 1 ? '' : 's'}` : libres === 0 ? ' · lleno' : ` · ${-libres} de más`}
                        </span>
                      </div>
                    </>
                  }>
                  <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
                    {g.dictadas.length > 0
                      ? <>Se dictó {diaLabel(g.bloque.dia_semana).toLowerCase()} {g.dictadas.map(d2 => nDia(d2.fecha)).join(', ')} — {g.dictadas.length} × {horas(g.dictadas[0].minutos)} h = {horas(g.minutos)} h.</>
                      : <>No se dictó ninguna vez este mes.</>}
                  </div>
                  <Omitidas items={g.suspendidas} color={aviso} />
                  <Omitidas items={g.fueraDeVigencia} color={hint} />

                  <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                    <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>
                      Inscritos hoy: {g.inscritos} de {g.bloque.cupo_maximo} cupos.
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {suyos.map(i => <span key={i.jugador_id} style={chip}>{nombreJug(i.jugador_id)}</span>)}
                      {suyos.length === 0 && <span style={{ fontSize: 12, color: hint }}>Sin nadie inscrito.</span>}
                    </div>
                  </div>
                </Desplegable>
              )
            })}
          </div>
        ))}

        {gruposSede.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: hint, fontSize: 12 }}>
            Ningún grupo en {sedeLabel(sedeVista).split(' ')[0]} funcionaba en {MESES[mes - 1]} {anio}.
          </div>
        )}
      </div>

      {gruposFuera > 0 && (
        <div style={{ fontSize: 11, color: hint, lineHeight: 1.6 }}>
          Hay {gruposFuera} grupo{gruposFuera === 1 ? '' : 's'} más en el horario que este mes no aparece{gruposFuera === 1 ? '' : 'n'}:
          se creó después o ya había cerrado. La asistencia y los porcentajes viven en Asistencia → Panorama.
        </div>
      )}
    </div>
  )
}
