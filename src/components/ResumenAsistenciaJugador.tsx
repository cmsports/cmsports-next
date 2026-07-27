'use client'

import { useEffect, useState } from 'react'
import { fechaChile } from '@/lib/domain/fechaChile'
import { diaLabel } from '@/lib/domain/horario'
import { cargarHistorialJugador } from '@/lib/supabase/historial'
import { calendarioJugador, indicadores, type Indicadores } from '@/lib/domain/historialAsistencia'

const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'
const verde = '#16a34a'
const rojo  = '#dc2626'
const azul  = '#3b82f6'

const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/**
 * El resumen de asistencia del año en la ficha del jugador.
 *
 * Sale del mismo motor que el calendario histórico y los rankings: si acá
 * dijera un porcentaje y allá otro, nadie sabría a cuál creerle.
 */
export default function ResumenAsistenciaJugador({ clubId, jugadorId }: { clubId: string; jugadorId: string }) {
  const [ind, setInd] = useState<Indicadores | null>(null)
  const [cargando, setCargando] = useState(true)
  const anio = Number(fechaChile().slice(0, 4))

  useEffect(() => {
    let vivo = true
    void (async () => {
      const datos = await cargarHistorialJugador(clubId, jugadorId, `${anio}-01-01`, `${anio}-12-31`)
      if (!vivo) return
      setInd(indicadores(calendarioJugador(jugadorId, `${anio}-01-01`, `${anio}-12-31`, datos)))
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [clubId, jugadorId, anio])

  if (cargando) {
    return <div style={{ padding: '16px 20px', fontSize: 12, color: hint }}>Cargando asistencia...</div>
  }
  if (!ind || ind.programados === 0) {
    return (
      <div style={{ padding: '16px 20px', fontSize: 12, color: hint }}>
        Sin entrenamientos programados este año. Se le asignan grupos desde <strong>Días de entrenamiento</strong>.
      </div>
    )
  }

  const color = ind.porcentaje === null ? muted
    : ind.porcentaje >= 75 ? verde : ind.porcentaje >= 50 ? '#d97706' : rojo

  const maxMes = Math.max(...ind.porMes.map(m => m.presentes + m.ausentes + m.pendientes), 1)

  return (
    <div style={{ padding: '4px 20px 16px' }}>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {ind.porcentaje === null ? '—' : `${ind.porcentaje}%`}
        </span>
        <span style={{ fontSize: 12, color: muted }}>de asistencia en {anio}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(74px, 1fr))', gap: 8, marginBottom: 14 }}>
        {([
          ['Programados', ind.programados, text],
          ['Asistió',     ind.presentes,   verde],
          ['Faltó',       ind.ausentes,    rojo],
          ['Sin marcar',  ind.pendientes,  azul],
        ] as const).map(([label, valor, c]) => (
          <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
          </div>
        ))}
      </div>

      {/* Evolución mensual */}
      <div style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
        Mes a mes
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64, marginBottom: 4 }}>
        {ind.porMes.map(m => {
          const total = m.presentes + m.ausentes + m.pendientes
          const alto = Math.max(4, Math.round((total / maxMes) * 56))
          const mes = Number(m.mes.slice(5)) - 1
          return (
            <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
              title={`${MES_CORTO[mes]}: ${m.presentes} asistió, ${m.ausentes} faltó, ${m.pendientes} sin marcar`}>
              <div style={{ width: '100%', height: alto, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse' }}>
                {m.presentes > 0 && <div style={{ background: verde, flex: m.presentes }} />}
                {m.ausentes > 0  && <div style={{ background: rojo,  flex: m.ausentes }} />}
                {m.pendientes > 0 && <div style={{ background: azul, flex: m.pendientes }} />}
              </div>
              <span style={{ fontSize: 8, color: hint }}>{MES_CORTO[mes]}</span>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: muted, marginTop: 10 }}>
        <span>Racha: <strong style={{ color: ind.rachaPresentes > 0 ? verde : text }}>{ind.rachaPresentes}</strong></span>
        <span>Mejor racha: <strong style={{ color: text }}>{ind.mejorRacha}</strong></span>
        {ind.rachaAusentes > 0 && <span>Faltas seguidas: <strong style={{ color: rojo }}>{ind.rachaAusentes}</strong></span>}
        {ind.mejorDia && <span>Mejor día: <strong style={{ color: text }}>{diaLabel(ind.mejorDia.dia)}</strong></span>}
        {ind.ultimaAsistencia && <span>Última: <strong style={{ color: text }}>{ind.ultimaAsistencia}</strong></span>}
      </div>
    </div>
  )
}
