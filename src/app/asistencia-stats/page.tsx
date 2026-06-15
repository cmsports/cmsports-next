'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient()

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function AsistenciaStatsPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [statsGeneral, setStatsGeneral] = useState<any[]>([])
  const [statsJugadores, setStatsJugadores] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState<'general'|'jugadores'>('general')
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.rol !== 'admin') { router.push('/dashboard'); return }
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!perfil?.club_id) return
    cargarStats()
  }, [perfil, mes, anio])

  function getDiasDelMes(m: number, a: number) {
    return new Date(a, m, 0).getDate()
  }

  async function cargarStats() {
    const mesStr = String(mes).padStart(2,'0')
    const inicio = `${anio}-${String(mes).padStart(2,'0')}-01`
    const fin = `${anio}-${String(mes).padStart(2,'0')}-${String(getDiasDelMes(mes,anio)).padStart(2,'0')}`

    const [{ data: asistencias }, { data: jugadores }] = await Promise.all([
      supabase.from('asistencia').select('*').eq('club_id', perfil.club_id).gte('fecha', inicio).lte('fecha', fin),
      supabase.from('jugadores').select('id,nombre,categoria,estado').eq('club_id', perfil.club_id).eq('estado','activo').neq('es_externo',true).order('nombre')
    ])

    const asist = asistencias || []
    const jugs = jugadores || []

    // Stats generales por día
    const porDia: Record<string, number> = {}
    asist.forEach(a => {
      porDia[a.fecha] = (porDia[a.fecha] || 0) + 1
    })

    const diasConAsistencia = Object.keys(porDia).sort()
    const generalData = diasConAsistencia.map(fecha => ({
      fecha,
      dia: new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday:'short', day:'numeric' }),
      total: porDia[fecha]
    }))
    setStatsGeneral(generalData)

    // Stats por jugador
    const porJugador: Record<string, number> = {}
    asist.forEach(a => {
      porJugador[a.jugador_id] = (porJugador[a.jugador_id] || 0) + 1
    })

    const diasHabiles = diasConAsistencia.length || 1
    const jugadorStats = jugs.map(j => ({
      ...j,
      asistencias: porJugador[j.id] || 0,
      porcentaje: Math.round(((porJugador[j.id] || 0) / diasHabiles) * 100)
    })).sort((a,b) => b.asistencias - a.asistencias)

    setStatsJugadores(jugadorStats)
  }

  function cambiarMes(dir: number) {
    let nm = mes + dir, na = anio
    if (nm > 12) { nm = 1; na++ }
    if (nm < 1) { nm = 12; na-- }
    setMes(nm); setAnio(na)
  }

  const fmt = (n: number) => n.toLocaleString('es-CL')
  const totalAsistencias = statsGeneral.reduce((s,d) => s + d.total, 0)
  const promDiario = statsGeneral.length > 0 ? Math.round(totalAsistencias / statsGeneral.length) : 0
  const maxDia = statsGeneral.length > 0 ? Math.max(...statsGeneral.map(d => d.total)) : 0
  const filtrados = statsJugadores.filter(j => j.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  const sinAsistencia = statsJugadores.filter(j => j.asistencias === 0).length

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => cambiarMes(-1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>◀</button>
          <span style={{ fontSize:16, fontWeight:600, color:'#fff', minWidth:160, textAlign:'center' }}>{mesesN[mes-1]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>▶</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        {[
          { label:'Total asistencias', value:fmt(totalAsistencias), color:'#a78bfa', icon:'📊' },
          { label:'Promedio diario', value:fmt(promDiario), color:'#60a5fa', icon:'📅' },
          { label:'Día más activo', value:fmt(maxDia), color:'#34d399', icon:'🔥' },
          { label:'Sin asistencia', value:fmt(sinAsistencia), color:'#f87171', icon:'⚠️' },
        ].map(s => (
          <div key={s.label} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
            <div style={{ fontSize:20 }}>{s.icon}</div>
            <div style={{ fontSize:24, fontWeight:700, color:s.color, fontFamily:'monospace', margin:'8px 0 4px' }}>{s.value}</div>
            <div style={{ fontSize:12, color:'#6c7280' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#0a0c12', borderRadius:10, padding:4, marginBottom:20 }}>
        {[{key:'general',label:'📈 Asistencia diaria'},{key:'jugadores',label:'👥 Por jugador'}].map(t => (
          <div key={t.key} onClick={() => setVista(t.key as any)}
            style={{ flex:1, padding:'9px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, background:vista===t.key?'#14161f':'transparent', color:vista===t.key?'#a78bfa':'#6c7280' }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Vista general — gráfico de barras */}
      {vista === 'general' && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:16 }}>Asistencias por día</div>
          {statsGeneral.length === 0
            ? <p style={{ color:'#6c7280', textAlign:'center', padding:30 }}>Sin datos este mes</p>
            : (
              <div style={{ overflowX:'auto' }}>
                <div style={{ display:'flex', alignItems:'flex-end', gap:4, minWidth: statsGeneral.length * 28, height:160, paddingBottom:24, position:'relative' }}>
                  {statsGeneral.map((d, i) => (
                    <div key={d.fecha} style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1, minWidth:20 }}>
                      <div style={{ fontSize:9, color:'#6c7280', marginBottom:2 }}>{d.total}</div>
                      <div style={{ width:'100%', background: d.total > promDiario ? '#6c63ff' : '#1e1b4b', borderRadius:'4px 4px 0 0', height: maxDia > 0 ? `${(d.total/maxDia)*120}px` : '4px', transition:'height 0.3s', minHeight:4 }} />
                      <div style={{ fontSize:8, color:'#4b5063', marginTop:4, whiteSpace:'nowrap' }}>{d.dia}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
          <div style={{ marginTop:12, display:'flex', gap:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#6c7280' }}>
              <div style={{ width:12, height:12, borderRadius:2, background:'#6c63ff' }} /> Sobre promedio
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#6c7280' }}>
              <div style={{ width:12, height:12, borderRadius:2, background:'#1e1b4b' }} /> Bajo promedio
            </div>
          </div>
        </div>
      )}

      {/* Vista por jugador */}
      {vista === 'jugadores' && (
        <div>
          <div style={{ marginBottom:12 }}>
            <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
              placeholder="🔍 Buscar jugador..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #1e2030' }}>
                  {['#','Jugador','Categoría','Asistencias','% Asistencia'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((j,i) => {
                  const col = j.porcentaje >= 70 ? '#34d399' : j.porcentaje >= 40 ? '#fbbf24' : '#f87171'
                  return (
                    <tr key={j.id} style={{ borderBottom:'1px solid #1e2030' }}>
                      <td style={{ padding:'10px 16px', fontSize:12, color:'#6c7280' }}>{i+1}</td>
                      <td style={{ padding:'10px 16px', fontSize:13, color:'#c8cfe0', fontWeight:500 }}>{j.nombre}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ background:'#1e1b4b', color:'#a78bfa', padding:'2px 8px', borderRadius:20, fontSize:11 }}>{j.categoria}</span>
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:13, color:'#c8cfe0', fontFamily:'monospace' }}>{j.asistencias}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, background:'#1e2030', borderRadius:4, height:6, maxWidth:80 }}>
                            <div style={{ width:`${Math.min(j.porcentaje,100)}%`, background:col, borderRadius:4, height:'100%' }} />
                          </div>
                          <span style={{ fontSize:12, color:col, fontWeight:600, minWidth:35 }}>{j.porcentaje}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtrados.length === 0 && (
              <div style={{ padding:30, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
