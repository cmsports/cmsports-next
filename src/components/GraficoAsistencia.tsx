'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { Download } from 'lucide-react'
import { fechaChile } from '@/lib/domain/fechaChile'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

const VENTANA = 5

const AZUL = '#3b82f6'
const VERDE = '#16a34a'
const ROJO = '#dc2626'

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const border = '#e2e8f0'
const card = { background: '#ffffff', border: `1px solid ${border}`, borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const

const diasSemanaLargo = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function formatFechaCorta(d: Date) {
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

function lunesDeEstaSemana() {
  const hoy = new Date()
  const dia = hoy.getDay()
  const diffLunes = dia === 0 ? -6 : 1 - dia
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() + diffLunes)
  lunes.setHours(0, 0, 0, 0)
  return lunes
}

function generarOffsets(total: number) {
  if (total <= 1) return [1]
  const paso = 5
  const offs = [1]
  for (let d = paso; d < total; d += paso) offs.push(d)
  if (offs[offs.length - 1] !== total) offs.push(total)
  return offs
}

type BloqueGrafico = { id: string; nombre: string; hora_inicio: string }
type Jugador = { id: string; nombre: string }
type Fila = { fecha: string; date: Date; jugador_id: string }

/* Cache en memoria del módulo: persiste entre navegaciones de la SPA para
   que el gráfico aparezca al instante al volver a una página ya visitada. */
export default function GraficoAsistencia({ clubId, modo = 'dashboard', fechaSeleccionada, bloquesDelDia, inscritosDe }: {
  clubId: string
  modo?: 'dashboard' | 'completo'
  fechaSeleccionada?: string
  bloquesDelDia?: BloqueGrafico[]
  inscritosDe?: Record<string, string[]>
}) {
  const [loading, setLoading] = useState(true)
  const [jugadoresActivos, setJugadoresActivos] = useState<Jugador[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [diasEntrenamiento, setDiasEntrenamiento] = useState<string[]>([])
  const [mostrarSinAsistencia, setMostrarSinAsistencia] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [registrosTodos, setRegistrosTodos] = useState<{ fecha: string; jugador_id: string; estado: string }[]>([])
  const [bloqueSelGrafico, setBloqueSelGrafico] = useState('')

  useEffect(() => {
    let activo = true
    async function cargar() {
      const supabase = createClient()
      const hoy = new Date()
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      const lunes = lunesDeEstaSemana()
      const desde = inicioMes < lunes ? inicioMes : lunes
      const desdeStr = desde.toISOString().slice(0, 10)

      // Una sola consulta con estado: las presencias alimentan el numerador y
      // CUALQUIER registro (presente o ausente) marca que ese día se pasó
      // lista — es el denominador. Antes los días salían de la tabla `clases`,
      // que se eliminó junto con su módulo; un día con todos ausentes tiene
      // que seguir contando como día de 0%, no desaparecer.
      const [{ data: jugs }, { data: asist }] = await Promise.all([
        supabase.from('jugadores').select('id,nombre').eq('club_id', clubId).eq('estado', 'activo'),
        supabase.from('asistencia').select('fecha,jugador_id,estado').eq('club_id', clubId).gte('fecha', desdeStr),
      ])

      if (!activo) return
      const jugadoresData = jugs || []
      const registros = asist || []
      const filasData = registros
        .filter((a: any) => a.estado === 'presente')
        .map((a: any) => ({ fecha: a.fecha, date: new Date(a.fecha + 'T12:00:00'), jugador_id: a.jugador_id }))
      setJugadoresActivos(jugadoresData)
      setFilas(filasData)
      setRegistrosTodos(registros || [])
      setDiasEntrenamiento([...new Set(registros.map((a: any) => a.fecha as string))])
      setLoading(false)
    }
    if (clubId) void cargar()

    const supabase = createClient()
    // Pasar lista son veinte clics seguidos y cada uno llegaba acá como un
    // recálculo entero del gráfico: veinte consultas al club completo para
    // dibujar veinte veces lo mismo. Se espera a que la ráfaga termine.
    let pendiente: ReturnType<typeof setTimeout> | null = null
    const refrescar = () => {
      if (pendiente) clearTimeout(pendiente)
      pendiente = setTimeout(() => { pendiente = null; void cargar() }, 1200)
    }
    const canal = supabase
      .channel(`grafico-asistencia-${clubId}`)
      .on('postgres_changes', {
        // Con el filtro por club: sin él llegaban también los cambios de
        // asistencia de los demás clubes, y cada uno recargaba este gráfico.
        event: '*', schema: 'public', table: 'asistencia', filter: `club_id=eq.${clubId}`,
      }, refrescar)
      .subscribe()

    return () => {
      activo = false
      if (pendiente) clearTimeout(pendiente)
      void supabase.removeChannel(canal)
    }
  }, [clubId])

  useEffect(() => { setBloqueSelGrafico('') }, [fechaSeleccionada])

  const activosCount = jugadoresActivos.length

  // Todos los jugadores con bloque ese día (union de todos los bloques)
  const inscritosDelDia = useMemo(() => {
    if (!inscritosDe) return new Set<string>()
    return new Set(Object.values(inscritosDe).flat())
  }, [inscritosDe])

  const asistenciaDia = useMemo(() => {
    if (!fechaSeleccionada) return null
    const presentesIds = filas.filter(f => f.fecha === fechaSeleccionada).map(f => f.jugador_id)
    const total = inscritosDelDia.size > 0 ? inscritosDelDia.size : activosCount
    // Solo cuentan los que tenían bloque ese día; extras no entran al denominador
    const count = inscritosDelDia.size > 0
      ? presentesIds.filter(id => inscritosDelDia.has(id)).length
      : presentesIds.length
    const extras = inscritosDelDia.size > 0
      ? presentesIds.filter(id => !inscritosDelDia.has(id)).length
      : 0
    return { count, total, extras, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }
  }, [filas, fechaSeleccionada, inscritosDelDia, activosCount])

  const bloqueStats = useMemo(() => {
    if (!bloqueSelGrafico || !fechaSeleccionada || !inscritosDe) return null
    const inscritos = inscritosDe[bloqueSelGrafico] ?? []
    const inscritosSet = new Set(inscritos)
    const presentesDia = filas.filter(f => f.fecha === fechaSeleccionada).map(f => f.jugador_id)
    const presentesDiaSet = new Set(presentesDia)
    const ausentesDiaSet = new Set(
      registrosTodos.filter(r => r.fecha === fechaSeleccionada && r.estado === 'ausente').map(r => r.jugador_id)
    )
    const nombre = (id: string) => jugadoresActivos.find(j => j.id === id)?.nombre ?? '—'
    // Extras: vinieron ese día pero NO están en ningún bloque → clase extraordinaria
    const extras = presentesDia.filter(id => !inscritosDelDia.has(id)).map(id => ({ id, nombre: nombre(id) }))
    return {
      total: inscritos.length,
      presentes: inscritos.filter(id => presentesDiaSet.has(id)).map(id => ({ id, nombre: nombre(id) })),
      ausentes: inscritos.filter(id => ausentesDiaSet.has(id) && !presentesDiaSet.has(id)).map(id => ({ id, nombre: nombre(id) })),
      sinRegistro: inscritos.filter(id => !presentesDiaSet.has(id) && !ausentesDiaSet.has(id)).map(id => ({ id, nombre: nombre(id) })),
      extras,
    }
  }, [bloqueSelGrafico, fechaSeleccionada, inscritosDe, inscritosDelDia, filas, registrosTodos, jugadoresActivos])

  const dias = useMemo(() => {
    const hoy = fechaChile()
    const inicioMes = `${hoy.slice(0, 7)}-01`
    const fechas = new Set([
      ...diasEntrenamiento.filter(fecha => fecha >= inicioMes && fecha <= hoy),
      ...filas.filter(f => f.fecha >= inicioMes && f.fecha <= hoy).map(f => f.fecha),
    ])
    return [...fechas].sort().map(fecha => ({
      fecha,
      date: new Date(fecha + 'T12:00:00'),
      count: filas.filter(f => f.fecha === fecha).length,
    }))
  }, [filas, diasEntrenamiento])

  const puntos = useMemo(() => {
    const offsets = generarOffsets(dias.length)
    return offsets.map(offset => {
      const fin = offset - 1
      const ini = Math.max(0, fin - VENTANA + 1)
      const tramo = dias.slice(ini, fin + 1)
      const tasa = activosCount > 0 && tramo.length > 0
        ? (tramo.reduce((s, d) => s + d.count, 0) / (activosCount * tramo.length)) * 100
        : 0
      return { offset, fecha: tramo[tramo.length - 1]?.date ?? dias[0]?.date ?? new Date(), valor: Math.round(tasa * 10) / 10 }
    })
  }, [dias, activosCount])

  const asistenciaPromedio = puntos.length > 0 ? puntos[puntos.length - 1].valor : 0
  const deltaPromedio = puntos.length > 1 ? Math.round((puntos[puntos.length - 1].valor - puntos[puntos.length - 2].valor) * 10) / 10 : 0

  const diaMasVisitado = useMemo(() => {
    const inicioMesStr = `${fechaChile().slice(0, 7)}-01`
    const porDiaSemana: Record<number, number> = {}
    filas.filter(f => f.fecha >= inicioMesStr).forEach(f => { const ds = f.date.getDay(); porDiaSemana[ds] = (porDiaSemana[ds] || 0) + 1 })
    let maxDia = -1, maxCount = 0
    Object.entries(porDiaSemana).forEach(([ds, count]) => { if (count > maxCount) { maxCount = count; maxDia = Number(ds) } })
    return { nombre: maxDia >= 0 ? diasSemanaLargo[maxDia] : '—', count: maxCount }
  }, [filas])

  const sinAsistenciaSemana = useMemo(() => {
    const lunesStr = lunesDeEstaSemana().toISOString().slice(0, 10)
    const presentes = new Set(filas.filter(f => f.fecha >= lunesStr).map(f => f.jugador_id))
    return jugadoresActivos.filter(j => !presentes.has(j.id))
  }, [filas, jugadoresActivos])

  const sinAsistenciaMes = useMemo(() => {
    const inicioMesStr = `${fechaChile().slice(0, 7)}-01`
    const presentes = new Set(filas.filter(f => f.fecha >= inicioMesStr).map(f => f.jugador_id))
    return jugadoresActivos.filter(j => !presentes.has(j.id))
  }, [filas, jugadoresActivos])

  const sinAsistencia = modo === 'completo' ? sinAsistenciaSemana : sinAsistenciaMes

  async function exportarExcel() {
    if (!clubId) return
    setExportando(true)
    try {
      const supabase = createClient()
      const [{ data: asistAll }, { data: jugsAll }] = await Promise.all([
        supabase.from('asistencia').select('fecha,jugador_id,estado').eq('club_id', clubId).order('fecha', { ascending: true }),
        supabase.from('jugadores').select('id').eq('club_id', clubId).eq('estado', 'activo'),
      ])

      const activos = (jugsAll || []).length || 1
      const porMes: Record<string, { jugadores: Set<string>; dias: Set<string>; total: number; porDiaSemana: Record<number, number> }> = {}

      // Todo registro marca el día como "con lista pasada" (denominador); solo
      // las presencias suman al total y a los jugadores que vinieron.
      ;(asistAll || []).forEach((a: any) => {
        const mesKey = a.fecha.slice(0, 7)
        if (!porMes[mesKey]) porMes[mesKey] = { jugadores: new Set(), dias: new Set(), total: 0, porDiaSemana: {} }
        porMes[mesKey].dias.add(a.fecha)
        if (a.estado !== 'presente') return
        porMes[mesKey].jugadores.add(a.jugador_id)
        porMes[mesKey].total += 1
        const ds = new Date(a.fecha + 'T12:00:00').getDay()
        porMes[mesKey].porDiaSemana[ds] = (porMes[mesKey].porDiaSemana[ds] || 0) + 1
      })

      const filasExport = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([mesKey, d]) => {
        const [anio, mes] = mesKey.split('-').map(Number)
        const diasActividad = d.dias.size || 1
        const promedio = Math.round((d.total / (activos * diasActividad)) * 1000) / 10
        let maxDia = -1, maxCount = 0
        Object.entries(d.porDiaSemana).forEach(([ds, count]) => { if (count > maxCount) { maxCount = count; maxDia = Number(ds) } })
        return {
          'Mes': `${nombresMes[mes - 1]} ${anio}`,
          'Asistencia promedio (%)': promedio,
          'Día más visitado': maxDia >= 0 ? diasSemanaLargo[maxDia] : '—',
          'Total asistencias': d.total,
          'Jugadores sin asistencia ese mes': Math.max(activos - d.jugadores.size, 0),
        }
      })

      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(filasExport)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Asistencia')
      XLSX.writeFile(wb, `asistencia_mensual_${clubId.slice(0, 8)}.xlsx`)
    } finally {
      setExportando(false)
    }
  }

  if (loading) {
    return (
      <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
        Cargando gráfico de asistencia...
      </div>
    )
  }

  const data = {
    labels: puntos.map(p => formatFechaCorta(p.fecha)),
    datasets: [
      {
        data: puntos.map(p => p.valor),
        borderColor: AZUL,
        borderWidth: 2.5,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: AZUL,
        pointBorderWidth: 2,
        fill: true,
        backgroundColor: (ctx: any) => {
          const chart = ctx.chart
          const { ctx: c, chartArea } = chart
          if (!chartArea) return 'rgba(59,130,246,0.15)'
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, 'rgba(59,130,246,0.35)')
          gradient.addColorStop(1, 'rgba(59,130,246,0)')
          return gradient
        },
      },
    ],
  }

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: text,
        bodyColor: muted,
        borderColor: border,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        displayColors: false,
        callbacks: {
          title: (items: any[]) => `${items[0]?.raw}%`,
          label: (item: any) => formatFechaCorta(puntos[item.dataIndex].fecha),
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: hint, font: { size: 11 } } },
      y: { grid: { color: '#f1f5f9' }, ticks: { color: hint, font: { size: 11 }, callback: (v: any) => `${v}%` } },
    },
  }

  return (
    <div>
      <div style={{ ...card, padding: 20, height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: muted }}>Asistencia promedio</div>
          {modo === 'dashboard' && (
            <button onClick={exportarExcel} disabled={exportando} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: `1px solid ${border}`, borderRadius: 8, padding: '5px 10px', color: muted, fontSize: 11, cursor: exportando ? 'not-allowed' : 'pointer' }}>
              <Download size={12} />
              {exportando ? 'Generando...' : 'Excel'}
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px', gap: 16 }}>
          {/* Chart + número grande */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>{asistenciaPromedio}%</span>
              {deltaPromedio !== 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: deltaPromedio > 0 ? VERDE : ROJO }}>
                  {deltaPromedio > 0 ? '+' : ''}{deltaPromedio}%
                </span>
              )}
            </div>
            <div style={{ height: 170 }}>
              <Line data={data} options={options} />
            </div>
          </div>

          {/* 2 tarjetas: % del día | cuenta absoluta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: '#eff6ff', border: `2px solid ${AZUL}`, borderRadius: 12, padding: '12px 14px' }}>
              {asistenciaDia ? (
                <div style={{ fontSize: 22, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>
                  {asistenciaDia.pct}%
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>Asistencia promedio</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>{asistenciaPromedio}%</div>
                </>
              )}
            </div>
            <div style={{ background: '#ffffff', border: `1px solid ${border}`, borderRadius: 12, padding: '12px 14px' }}>
              {asistenciaDia ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>
                    {asistenciaDia.count} de {asistenciaDia.total}
                  </div>
                  {asistenciaDia.extras > 0 && (
                    <div style={{ fontSize: 11, color: '#a16207', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                      +{asistenciaDia.extras} extra{asistenciaDia.extras > 1 ? 's' : ''}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>Día más visitado</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{diaMasVisitado.nombre}</div>
                  <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: text, fontVariantNumeric: 'tabular-nums' }}>{diaMasVisitado.count}</span> este mes
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Filtro de bloque: fila horizontal compacta */}
        {(bloquesDelDia?.length ?? 0) > 0 && (
          <div style={{ borderTop: `1px solid ${border}`, marginTop: 16, paddingTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: hint, flexShrink: 0 }}>Bloque</span>
            {bloquesDelDia!.map(b => {
              const activo = bloqueSelGrafico === b.id
              return (
                <button key={b.id} onClick={() => setBloqueSelGrafico(activo ? '' : b.id)}
                  style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${activo ? '#4f46e5' : '#e2e8f0'}`,
                    background: activo ? '#ede9fe' : '#fff', color: activo ? '#4f46e5' : muted,
                    display: 'flex', alignItems: 'center', gap: 5 }}>
                  {b.hora_inicio.slice(0, 5)} · {b.nombre}
                  {activo && bloqueStats && (
                    <span style={{ background: '#4f46e5', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                      {bloqueStats.presentes.length}/{bloqueStats.total}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Sin asistencia (solo dashboard / sin bloques) */}
        {(bloquesDelDia?.length ?? 0) === 0 && (
          <div style={{ borderTop: `1px solid ${border}`, marginTop: 16, paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: muted }}>Sin asistencia {modo === 'completo' ? 'esta semana' : 'este mes'}</span>
            <div
              onClick={() => modo === 'completo' && sinAsistencia.length > 0 && setMostrarSinAsistencia(!mostrarSinAsistencia)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: modo === 'completo' && sinAsistencia.length > 0 ? 'pointer' : 'default' }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, color: sinAsistencia.length > 0 ? ROJO : VERDE, fontVariantNumeric: 'tabular-nums' }}>{sinAsistencia.length}</span>
              {modo === 'completo' && sinAsistencia.length > 0 && (
                <span style={{ fontSize: 11, color: hint, display: 'inline-block', transform: mostrarSinAsistencia ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lista expandida del bloque seleccionado */}
      {bloqueStats && (
        <div style={{ background: '#f8fafc', border: `1px solid ${border}`, borderRadius: 14, padding: '14px 16px', marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {bloqueStats.presentes.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: VERDE, marginBottom: 6 }}>
                  ✓ Presentes ({bloqueStats.presentes.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {bloqueStats.presentes.map(j => (
                    <div key={j.id} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: VERDE }}>{j.nombre}</div>
                  ))}
                </div>
              </div>
            )}
            {bloqueStats.ausentes.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: ROJO, marginBottom: 6 }}>
                  ✗ Ausentes ({bloqueStats.ausentes.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {bloqueStats.ausentes.map(j => (
                    <div key={j.id} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: ROJO }}>{j.nombre}</div>
                  ))}
                </div>
              </div>
            )}
            {bloqueStats.sinRegistro.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: hint, marginBottom: 6 }}>
                  — Sin registrar ({bloqueStats.sinRegistro.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {bloqueStats.sinRegistro.map(j => (
                    <div key={j.id} style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: muted }}>{j.nombre}</div>
                  ))}
                </div>
              </div>
            )}
            {bloqueStats.extras.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a16207', marginBottom: 6 }}>
                  ★ Extras ({bloqueStats.extras.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {bloqueStats.extras.map(j => (
                    <div key={j.id} style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#a16207' }}>{j.nombre}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {!bloqueStats && modo === 'completo' && mostrarSinAsistencia && sinAsistencia.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: 16, marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: ROJO, marginBottom: 12 }}>
            Jugadores sin asistencia esta semana ({sinAsistencia.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sinAsistencia.map(j => (
              <div key={j.id} style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: ROJO }}>{j.nombre}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
