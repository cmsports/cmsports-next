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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

const DIAS_TOTAL = 30
const OFFSETS = [1, 5, 10, 15, 20, 25, 30]
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

function formatFechaCorta(d: Date) {
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function GraficoAsistencia({ clubId }: { clubId: string }) {
  const [loading, setLoading] = useState(true)
  const [activosCount, setActivosCount] = useState(0)
  const [filas, setFilas] = useState<{ fecha: string; date: Date; jugador_id: string }[]>([])

  useEffect(() => {
    let activo = true
    async function cargar() {
      const supabase = createClient()
      const hoy = new Date()
      const desde = new Date(hoy)
      desde.setDate(hoy.getDate() - (DIAS_TOTAL - 1))
      const desdeStr = desde.toISOString().slice(0, 10)

      const [{ data: jugs }, { data: asist }] = await Promise.all([
        supabase.from('jugadores').select('id').eq('club_id', clubId).eq('estado', 'activo'),
        supabase.from('asistencia').select('fecha,jugador_id').eq('club_id', clubId).gte('fecha', desdeStr),
      ])

      if (!activo) return
      setActivosCount((jugs || []).length)
      setFilas((asist || []).map((a: any) => ({ fecha: a.fecha, date: new Date(a.fecha + 'T12:00:00'), jugador_id: a.jugador_id })))
      setLoading(false)
    }
    if (clubId) cargar()
    return () => { activo = false }
  }, [clubId])

  const dias = useMemo(() => {
    const hoy = new Date()
    const desde = new Date(hoy)
    desde.setDate(hoy.getDate() - (DIAS_TOTAL - 1))
    const lista: { fecha: string; date: Date; count: number }[] = []
    for (let i = 0; i < DIAS_TOTAL; i++) {
      const d = new Date(desde)
      d.setDate(desde.getDate() + i)
      const fecha = d.toISOString().slice(0, 10)
      lista.push({ fecha, date: d, count: filas.filter(f => f.fecha === fecha).length })
    }
    return lista
  }, [filas])

  const puntos = useMemo(() => {
    return OFFSETS.map(offset => {
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
    const porDiaSemana: Record<number, number> = {}
    filas.forEach(f => { const ds = f.date.getDay(); porDiaSemana[ds] = (porDiaSemana[ds] || 0) + 1 })
    let maxDia = -1, maxCount = 0
    Object.entries(porDiaSemana).forEach(([ds, count]) => { if (count > maxCount) { maxCount = count; maxDia = Number(ds) } })
    return { nombre: maxDia >= 0 ? diasSemanaLargo[maxDia] : '—', count: maxCount }
  }, [filas])

  const retencion = useMemo(() => {
    if (activosCount === 0) return 0
    const hace14 = new Date()
    hace14.setDate(hace14.getDate() - 14)
    const distintos = new Set(filas.filter(f => f.date >= hace14).map(f => f.jugador_id)).size
    return Math.round((distintos / activosCount) * 1000) / 10
  }, [filas, activosCount])

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
    <div style={{ ...card, padding: 20, height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 190px', gap: 16 }}>
        {/* Chart + header */}
        <div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Asistencia promedio</div>
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
            <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>{diaMasVisitado.count} asistencias</div>
          </div>
          <div style={{ background: '#ffffff', border: `1px solid ${border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>Retención</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>{retencion}%</div>
            <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>jugadores activos en 14 días</div>
          </div>
        </div>
      </div>
    </div>
  )
}
