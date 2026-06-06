'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const cols = ['#f59e0b','#6c63ff','#059669','#0891b2','#7c3aed']

export default function DashboardPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [kpis, setKpis] = useState<any>({})
  const [topRanking, setTopRanking] = useState<any[]>([])
  const [ultimasAsist, setUltimasAsist] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ddOpen, setDdOpen] = useState<string | null>(null)
  const [ddData, setDdData] = useState<any[]>([])
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.club_id) await cargarKpis(p.club_id)
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarKpis(cid: string) {
    const mesActual = new Date().getMonth() + 1
    const anioActual = new Date().getFullYear()
    const mesInicio = `${anioActual}-${String(mesActual).padStart(2,'0')}-01`

    const [
      { data: jugadores },
      { data: asistencias },
      { data: torneos },
      { data: mensualidades },
      { data: movimientos },
      { data: solicitudes }
    ] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', cid),
      supabase.from('asistencia').select('*').eq('club_id', cid).gte('fecha', mesInicio),
      supabase.from('torneos').select('*').eq('club_id', cid).eq('estado', 'en_curso'),
      supabase.from('mensualidades').select('*').eq('club_id', cid).eq('mes', mesActual).eq('anio', anioActual),
      supabase.from('movimientos').select('*').eq('club_id', cid).gte('fecha', mesInicio),
      supabase.from('solicitudes_jugador').select('*').eq('club_id', cid).gte('creado_en', mesInicio)
    ])

    const activos = jugadores?.filter(j => j.estado === 'activo') || []
    const morosos = mensualidades?.filter(m => m.estado === 'pendiente' || m.estado === 'atrasado') || []
    const gastos = movimientos?.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0) || 0
    const ingresos = movimientos?.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0) || 0
    const coa = activos.length > 0 ? Math.round(gastos / activos.length) : 0
    const tm = activos.length > 0 ? Math.round((morosos.length / activos.length) * 100) : 0
    const solAprobadas = solicitudes?.filter(s => s.estado === 'aprobado').length || 0
    const captacion = (solicitudes?.length ?? 0) > 0 ? Math.round((solAprobadas / (solicitudes?.length ?? 1)) * 100) : 0

    setKpis({ activos: activos.length, tm, coa, ingresos, gastos, torneos: torneos?.length || 0, captacion, mensualidadBase: 25000, morosos, jugadores: activos })

    // Top ranking
    const top = [...(jugadores || [])].filter(j => j.estado === 'activo').sort((a,b) => b.elo - a.elo).slice(0,5)
    setTopRanking(top)

    // Últimas asistencias
    const ultimas = (asistencias || []).sort((a,b) => b.fecha > a.fecha ? 1 : -1).slice(0,6)
    const ids = [...new Set(ultimas.map(a => a.jugador_id))]
    if (ids.length) {
      const { data: jugsAsist } = await supabase.from('jugadores').select('id,nombre').in('id', ids)
      setUltimasAsist(ultimas.map(a => ({ ...a, nombre: jugsAsist?.find(j => j.id === a.jugador_id)?.nombre || '—' })))
    }
  }

  async function abrirDrilldown(tipo: string) {
    setDdOpen(tipo)
    if (tipo === 'morosidad') setDdData(kpis.morosos || [])
    if (tipo === 'captacion') {
      const mesInicio = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`
      const { data } = await supabase.from('solicitudes_jugador').select('*').eq('club_id', perfil?.club_id).gte('creado_en', mesInicio)
      setDdData(data || [])
    }
  }

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:20 }}>Dashboard</h1>

      {/* ASISTENCIA */}
      <div style={{ fontSize:12, color:'#6c7280', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>Asistencia</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:24 }}>🏓</div>
          <div style={{ fontSize:28, fontWeight:700, color:'#a78bfa', fontFamily:'monospace', margin:'8px 0 4px' }}>{kpis.activos || 0}</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Jugadores activos</div>
        </div>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:24 }}>🎯</div>
          <div style={{ fontSize:28, fontWeight:700, color:'#fbbf24', fontFamily:'monospace', margin:'8px 0 4px' }}>{kpis.torneos || 0}</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Torneos activos</div>
        </div>
        <div onClick={() => abrirDrilldown('captacion')} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18, cursor:'pointer' }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:24 }}>📨</span>
            <span style={{ fontSize:10, color:'#4b5063' }}>↗</span>
          </div>
          <div style={{ fontSize:28, fontWeight:700, color:'#34d399', fontFamily:'monospace', margin:'8px 0 4px' }}>{kpis.captacion || 0}%</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Conversión solicitudes</div>
        </div>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:24 }}>📈</div>
          <div style={{ fontSize:28, fontWeight:700, color:'#34d399', fontFamily:'monospace', margin:'8px 0 4px' }}>{fmt(kpis.ingresos || 0)}</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Ingresos este mes</div>
        </div>
      </div>

      {/* FINANZAS */}
      <div style={{ fontSize:12, color:'#6c7280', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>Finanzas</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
        <div onClick={() => abrirDrilldown('morosidad')} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18, cursor:'pointer' }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:24 }}>⚠️</span>
            <span style={{ fontSize:10, color:'#4b5063' }}>↗</span>
          </div>
          <div style={{ fontSize:28, fontWeight:700, color: (kpis.tm||0) > 25 ? '#f87171' : (kpis.tm||0) > 10 ? '#fbbf24' : '#34d399', fontFamily:'monospace', margin:'8px 0 4px' }}>{kpis.tm || 0}%</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Tasa de morosidad</div>
        </div>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:24 }}>💰</div>
          <div style={{ fontSize:28, fontWeight:700, color: kpis.coa > kpis.mensualidadBase ? '#f87171' : '#34d399', fontFamily:'monospace', margin:'8px 0 4px' }}>{fmt(kpis.coa || 0)}</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>COA — Costo por alumno</div>
          <div style={{ fontSize:11, marginTop:4, color: kpis.coa > kpis.mensualidadBase ? '#f87171' : '#34d399' }}>
            {kpis.coa > kpis.mensualidadBase ? '🔴 Pérdida por alumno' : '✓ Margen saludable'}
          </div>
        </div>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:24 }}>📉</div>
          <div style={{ fontSize:28, fontWeight:700, color:'#f87171', fontFamily:'monospace', margin:'8px 0 4px' }}>{fmt(kpis.gastos || 0)}</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Gastos este mes</div>
        </div>
      </div>

      {/* ÚLTIMAS ASISTENCIAS Y TOP ELO */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Últimas asistencias</div>
          {ultimasAsist.length === 0
            ? <p style={{ fontSize:13, color:'#6c7280', textAlign:'center', padding:'20px 0' }}>Sin asistencias</p>
            : <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr><th style={{ fontSize:11, color:'#6c7280', padding:'4px 0', textAlign:'left' }}>Jugador</th><th style={{ fontSize:11, color:'#6c7280', padding:'4px 0', textAlign:'left' }}>Fecha</th></tr></thead>
                <tbody>{ultimasAsist.map(a => (
                  <tr key={a.id}><td style={{ fontSize:13, color:'#c8cfe0', padding:'6px 0', borderBottom:'1px solid #1a1d2e' }}>{a.nombre}</td><td style={{ fontSize:12, color:'#6c7280', padding:'6px 0', borderBottom:'1px solid #1a1d2e' }}>{a.fecha}</td></tr>
                ))}</tbody>
              </table>
          }
        </div>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Top ELO</div>
          {topRanking.map((j, i) => (
            <div key={j.id} onClick={() => router.push(`/jugadores/${j.id}`)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #1a1d2e', cursor:'pointer' }}>
              <div style={{ fontSize:16 }}>{i < 3 ? ['🥇','🥈','🥉'][i] : i+1}</div>
              <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg,${cols[i]},${cols[i]}88)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'white', flexShrink:0 }}>
                {j.nombre?.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
              </div>
              <div style={{ flex:1, fontSize:13, color:'#c8cfe0' }}>{j.nombre}</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#a78bfa', fontFamily:'monospace' }}>{j.elo}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL DRILLDOWN */}
      {ddOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:24, width:'100%', maxWidth:520, maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:600, color:'#fff' }}>
                {ddOpen === 'morosidad' ? '⚠️ Deudores' : '📨 Solicitudes del mes'}
              </div>
              <button onClick={() => setDdOpen(null)} style={{ background:'transparent', border:'none', color:'#6c7280', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            {ddData.length === 0
              ? <p style={{ color:'#34d399', textAlign:'center', padding:20 }}>✓ Sin registros</p>
              : ddData.map((item: any) => (
                <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #1e2030' }}>
                  <div>
                    <div style={{ fontSize:13, color:'#c8cfe0', fontWeight:500 }}>
                      {ddOpen === 'morosidad' ? kpis.jugadores?.find((j:any) => j.id === item.jugador_id)?.nombre || '—' : item.nombre}
                    </div>
                    <div style={{ fontSize:11, color:'#6c7280', marginTop:2 }}>{item.estado}</div>
                  </div>
                  {item.telefono && (
                    <a href={`https://wa.me/${item.telefono.replace(/[^0-9]/g,'')}`} target="_blank" style={{ background:'#0a2d1a', color:'#34d399', padding:'5px 10px', borderRadius:8, fontSize:11, textDecoration:'none' }}>💬 WA</a>
                  )}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </AppLayout>
  )
}
