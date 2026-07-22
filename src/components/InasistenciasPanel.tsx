'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'
const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 4px rgba(15,23,42,0.08)' } as const

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function sesionesEnRango(j: any, desde: Date, hasta: Date): number {
  let count = 0
  const d = new Date(desde); d.setHours(0,0,0,0)
  const fin = new Date(hasta); fin.setHours(0,0,0,0)
  while (d <= fin) {
    const dow = d.getDay()
    if (
      (dow === 1 && j.entrena_lun) ||
      (dow === 2 && j.entrena_mar) ||
      (dow === 3 && j.entrena_mie) ||
      (dow === 4 && j.entrena_jue) ||
      (dow === 5 && j.entrena_vie)
    ) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

export default function InasistenciasPanel({ clubId }: { clubId: string }) {
  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [jugadores,   setJugadores]   = useState<any[]>([])
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [orden,   setOrden]   = useState<'inasistencias'|'nombre'|'pct'>('inasistencias')
  const [soloCon, setSoloCon] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`
    const lastDay = new Date(anio, mes, 0).getDate()
    const hasta   = `${anio}-${String(mes).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`

    const [{ data: jugs }, { data: asist }] = await Promise.all([
      supabase.from('jugadores')
        .select('id,nombre,categoria,horario,entrena_lun,entrena_mar,entrena_mie,entrena_jue,entrena_vie')
        .eq('club_id', clubId)
        .eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false')
        .order('nombre'),
      supabase.from('asistencia')
        .select('jugador_id,fecha')
        .eq('club_id', clubId)
        .gte('fecha', desde)
        .lte('fecha', hasta),
    ])
    setJugadores(jugs || [])
    setAsistencias(asist || [])
    setLoading(false)
  }, [clubId, mes, anio])

  useEffect(() => { void cargar() }, [cargar])

  const hoyDate = new Date(); hoyDate.setHours(0,0,0,0)
  const desdeDate = new Date(anio, mes - 1, 1)
  const hastaDate = new Date(Math.min(new Date(anio, mes, 0).getTime(), hoyDate.getTime()))
  const periodoFuturo = desdeDate > hoyDate

  // Set rápido de asistencias para lookup O(1)
  const asistSet = new Set(asistencias.map(a => `${a.jugador_id}|${a.fecha}`))

  const filas = jugadores
    .map(j => {
      const tieneDias = j.entrena_lun || j.entrena_mar || j.entrena_mie || j.entrena_jue || j.entrena_vie
      if (!tieneDias) return null

      const programadas = periodoFuturo ? 0 : sesionesEnRango(j, desdeDate, hastaDate)

      let asistidas = 0
      if (programadas > 0) {
        const d = new Date(desdeDate)
        while (d <= hastaDate) {
          const dow = d.getDay()
          const esdia = (dow===1&&j.entrena_lun)||(dow===2&&j.entrena_mar)||(dow===3&&j.entrena_mie)||(dow===4&&j.entrena_jue)||(dow===5&&j.entrena_vie)
          if (esdia) {
            const iso = d.toISOString().split('T')[0]
            if (asistSet.has(`${j.id}|${iso}`)) asistidas++
          }
          d.setDate(d.getDate() + 1)
        }
      }

      const inasistencias = Math.max(0, programadas - asistidas)
      const pct = programadas > 0 ? Math.round((asistidas / programadas) * 100) : 100
      const dias = [j.entrena_lun?'Lu':'',j.entrena_mar?'Ma':'',j.entrena_mie?'Mi':'',j.entrena_jue?'Ju':'',j.entrena_vie?'Vi':''].filter(Boolean)

      return { ...j, programadas, asistidas, inasistencias, pct, dias }
    })
    .filter(Boolean) as any[]

  const visibles = soloCon ? filas.filter(j => j.inasistencias > 0) : filas

  const ordenadas = [...visibles].sort((a, b) => {
    if (orden === 'nombre') return (a.nombre||'').localeCompare(b.nombre||'', 'es')
    if (orden === 'pct')    return (a.pct ?? 100) - (b.pct ?? 100)
    return (b.inasistencias ?? 0) - (a.inasistencias ?? 0)
  })

  const total     = filas.length
  const conInas   = filas.filter(j => j.inasistencias > 0).length
  const promPct   = total > 0 ? Math.round(filas.reduce((s,j) => s + j.pct, 0) / total) : 0
  const totalInas = filas.reduce((s,j) => s + j.inasistencias, 0)

  if (loading) return <div style={{ padding:40, textAlign:'center', color: hint }}>Cargando...</div>

  return (
    <div>
      {/* Selector período */}
      <div style={{ ...card, padding:'12px 16px', marginBottom:16, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:13, color: muted, fontWeight:600 }}>Período:</span>
        <select value={mes} onChange={e => setMes(Number(e.target.value))}
          style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13, color: text, outline:'none' }}>
          {MESES.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={anio} onChange={e => setAnio(Number(e.target.value))}
          style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13, color: text, outline:'none' }}>
          {[2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {!periodoFuturo && (
          <span style={{ fontSize:12, color: hint }}>
            {desdeDate.toLocaleDateString('es-CL',{day:'2-digit',month:'short'})} — {hastaDate.toLocaleDateString('es-CL',{day:'2-digit',month:'short'})}
          </span>
        )}
        <label style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, fontSize:13, color: muted, cursor:'pointer' }}>
          <input type="checkbox" checked={soloCon} onChange={e => setSoloCon(e.target.checked)}
            style={{ accentColor:'#dc2626', width:15, height:15 }} />
          Solo con inasistencias
        </label>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Con horario',         value: String(total),      color:'#4f46e5', bg:'#ede9fe', border:'#c4b5fd' },
          { label:'Con inasistencias',   value: String(conInas),    color: conInas>0 ? '#dc2626':'#16a34a', bg: conInas>0 ? '#fef2f2':'#f0fdf4', border: conInas>0 ? '#fecaca':'#bbf7d0' },
          { label:'Total inasistencias', value: String(totalInas),  color: totalInas>0 ? '#dc2626':'#16a34a', bg: totalInas>0 ? '#fef2f2':'#f0fdf4', border: totalInas>0 ? '#fecaca':'#bbf7d0' },
          { label:'Asistencia promedio', value: periodoFuturo ? '—' : `${promPct}%`, color: promPct>=80?'#16a34a':promPct>=60?'#d97706':'#dc2626', bg:'#f8fafc', border:'#e2e8f0' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, border:`1px solid ${k.border}`, borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
            <div style={{ fontSize:22, fontWeight:800, color:k.color, fontFamily:'monospace' }}>{k.value}</div>
            <div style={{ fontSize:11, color:k.color, marginTop:3, lineHeight:1.3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:13, fontWeight:600, color: text }}>Detalle por jugador</span>
          <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
            {([
              { key:'inasistencias', label:'Inasistencias' },
              { key:'pct',           label:'% Asistencia'  },
              { key:'nombre',        label:'Nombre'         },
            ] as const).map(o => (
              <button key={o.key} onClick={() => setOrden(o.key)}
                style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:11, cursor:'pointer', fontWeight: orden===o.key ? 700:400, background: orden===o.key ? '#ede9fe':'#f8fafc', color: orden===o.key ? '#3730a3': muted }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:520 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['Jugador','Horario','Program.','Asistidas','Inasistencias','% Asistencia'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodoFuturo ? (
                <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>El período seleccionado aún no ha comenzado</td></tr>
              ) : ordenadas.length === 0 ? (
                <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>Sin datos para este período</td></tr>
              ) : ordenadas.map(j => {
                const inas   = j.inasistencias ?? 0
                const pct    = j.pct ?? 100
                const cInas  = inas === 0 ? '#16a34a' : inas <= 2 ? '#d97706' : '#dc2626'
                const bgInas = inas === 0 ? '#f0fdf4'  : inas <= 2 ? '#fffbeb'  : '#fef2f2'
                const cPct   = pct  >= 80 ? '#16a34a' : pct  >= 60 ? '#d97706' : '#dc2626'
                return (
                  <tr key={j.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:600, color: text, fontSize:13 }}>{j.nombre}</div>
                      {j.categoria && <div style={{ fontSize:11, color: muted, marginTop:2 }}>{j.categoria}</div>}
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:12 }}>
                      {j.horario && <div style={{ color: text }}>{j.horario}</div>}
                      <div style={{ color: muted, fontSize:11 }}>{j.dias.join(' · ')}</div>
                    </td>
                    <td style={{ padding:'10px 14px', textAlign:'center', fontSize:13, fontWeight:600, color: text, fontFamily:'monospace' }}>
                      {j.programadas}
                    </td>
                    <td style={{ padding:'10px 14px', textAlign:'center', fontSize:13, fontWeight:600, color:'#16a34a', fontFamily:'monospace' }}>
                      {j.asistidas}
                    </td>
                    <td style={{ padding:'10px 14px', textAlign:'center' }}>
                      <span style={{ background:bgInas, color:cInas, padding:'4px 12px', borderRadius:20, fontSize:13, fontWeight:700, fontFamily:'monospace' }}>
                        {inas === 0 ? '✓' : inas}
                      </span>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1, background:'#e2e8f0', borderRadius:4, height:6, minWidth:60 }}>
                          <div style={{ width:`${pct}%`, background:cPct, borderRadius:4, height:6, transition:'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:cPct, fontFamily:'monospace', minWidth:36 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop:12, fontSize:11, color: hint, textAlign:'center' }}>
        Basado en el horario actual de cada jugador. Los cambios de horario aplicarán desde el mes siguiente.
      </div>
    </div>
  )
}
