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
const card = { background: '#ffffff', border: `1px solid ${border}`, borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const

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

type Jugador = { id: string; nombre: string }
type Fila = { fecha: string; date: Date; jugador_id: string }

/* Cache en memoria del módulo: persiste entre navegaciones de la SPA para
   que el gráfico aparezca al instante al volver a una página ya visitada. */
export default function GraficoAsistencia({ clubId, modo = 'dashboard' }: { clubId: string; modo?: 'dashboard' | 'completo' }) {
  const [loading, setLoading] = useState(true)
  const [jugadoresActivos, setJugadoresActivos] = useState<Jugador[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [diasEntrenamiento, setDiasEntrenamiento] = useState<string[]>([])
  const [mostrarSinAsistencia, setMostrarSinAsistencia] = useState(false)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    let activo = true
    async function cargar() {
      const supabase = createClient()
      const hoy = new Date()
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      const lunes = lunesDeEstaSemana()
      const desde = inicioMes < lunes ? inicioMes : lunes
      const desdeStr = desde.toISOString().slice(0, 10)

      const [{ data: jugs }, { data: asist }, { data: clases }] = await Promise.all([
        supabase.from('jugadores').select('id,nombre').eq('club_id', clubId).eq('estado', 'activo'),
        supabase.from('asistencia').select('fecha,jugador_id').eq('club_id', clubId).gte('fecha', desdeStr),
        supabase.from('clases').select('fecha').eq('club_id', clubId).eq('publicada', true).gte('fecha', desdeStr),
      ])

      if (!activo) return
      const jugadoresData = jugs || []
      const filasData = (asist || []).map((a: any) => ({ fecha: a.fecha, date: new Date(a.fecha + 'T12:00:00'), jugador_id: a.jugador_id }))
      setJugadoresActivos(jugadoresData)
      setFilas(filasData)
      setDiasEntrenamiento((clases || []).flatMap(c => c.fecha ? [c.fecha] : []))
      setLoading(false)
    }
    if (clubId) void cargar()

    const supabase = createClient()
    const canal = supabase
      .channel(`grafico-asistencia-${clubId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'asistencia',
      }, () => { void cargar() })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'clases',
      }, () => { void cargar() })
      .subscribe()

    return () => {
      activo = false
      void supabase.removeChannel(canal)
    }
  }, [clubId])

  const activosCount = jugadoresActivos.length

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
      const [{ data: asistAll }, { data: jugsAll }, { data: clasesAll }] = await Promise.all([
        supabase.from('asistencia').select('fecha,jugador_id').eq('club_id', clubId).order('fecha', { ascending: true }),
        supabase.from('jugadores').select('id').eq('club_id', clubId).eq('estado', 'activo'),
        supabase.from('clases').select('fecha').eq('club_id', clubId).eq('publicada', true),
      ])

      const activos = (jugsAll || []).length || 1
      const porMes: Record<string, { jugadores: Set<string>; dias: Set<string>; total: number; porDiaSemana: Record<number, number> }> = {}

      ;(asistAll || []).forEach((a: any) => {
        const mesKey = a.fecha.slice(0, 7)
        if (!porMes[mesKey]) porMes[mesKey] = { jugadores: new Set(), dias: new Set(), total: 0, porDiaSemana: {} }
        porMes[mesKey].jugadores.add(a.jugador_id)
        porMes[mesKey].dias.add(a.fecha)
        porMes[mesKey].total += 1
        const ds = new Date(a.fecha + 'T12:00:00').getDay()
        porMes[mesKey].porDiaSemana[ds] = (porMes[mesKey].porDiaSemana[ds] || 0) + 1
      })

      ;(clasesAll || []).forEach(c => {
        if (!c.fecha) return
        const mesKey = c.fecha.slice(0, 7)
        if (!porMes[mesKey]) porMes[mesKey] = { jugadores: new Set(), dias: new Set(), total: 0, porDiaSemana: {} }
        porMes[mesKey].dias.add(c.fecha)
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
    labels: puntos.map(p => String(p.offset)),
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 190px', gap: 16 }}>
          {/* Chart + header */}
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

          {/* Métricas laterales */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: '#eff6ff', border: `2px solid ${AZUL}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>Asistencia promedio</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>{asistenciaPromedio}%</div>
            </div>
            <div style={{ background: '#ffffff', border: `1px solid ${border}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>Día más visitado</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{diaMasVisitado.nombre}</div>
              <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>{diaMasVisitado.count} asistencias este mes</div>
            </div>
            <div
              onClick={() => modo === 'completo' && sinAsistencia.length > 0 && setMostrarSinAsistencia(!mostrarSinAsistencia)}
              style={{ background: '#ffffff', border: `1px solid ${border}`, borderRadius: 12, padding: '12px 14px', cursor: modo === 'completo' && sinAsistencia.length > 0 ? 'pointer' : 'default' }}
            >
              <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>Sin asistencia</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: sinAsistencia.length > 0 ? ROJO : VERDE, fontVariantNumeric: 'tabular-nums' }}>{sinAsistencia.length}</div>
                {modo === 'completo' && sinAsistencia.length > 0 && (
                  <span style={{ fontSize: 12, color: hint, transform: mostrarSinAsistencia ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>{modo === 'completo' ? 'esta semana' : 'este mes'}</div>
            </div>
          </div>
        </div>
      </div>

      {modo === 'completo' && mostrarSinAsistencia && sinAsistencia.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: 16, marginTop: 12 }}>
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
