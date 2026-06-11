'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function DashboardPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [kpis, setKpis] = useState<any>({})
  const [ultimasAsist, setUltimasAsist] = useState<any[]>([])
  const [jugadores, setJugadores] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ddOpen, setDdOpen] = useState<string | null>(null)
  const [ddData, setDdData] = useState<any[]>([])
  const [busquedaAsist, setBusquedaAsist] = useState('')
  const [registrando, setRegistrando] = useState<string | null>(null)
  const [asistenciasHoy, setAsistenciasHoy] = useState<any[]>([])
  const router = useRouter()

  const hoy = new Date().toISOString().slice(0,10)
  const hora = new Date().toTimeString().slice(0,5)

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.rol === 'jugador') { router.push('/perfil'); return }
      if (p?.rol === 'profesor') { router.push('/dashboard-profesor'); return }
      if (p?.club_id) await cargarDatos(p.club_id)
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarDatos(cid: string) {
    const mesActual = new Date().getMonth() + 1
    const anioActual = new Date().getFullYear()
    const mesInicio = `${anioActual}-${String(mesActual).padStart(2,'0')}-01`

    const [
      { data: jugsData },
      { data: asistencias },
      { data: torneos },
      { data: mensualidades },
      { data: movimientos },
      { data: solicitudesData },
      { data: asistHoy }
    ] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', cid).neq('es_externo', true),
      supabase.from('asistencia').select('*').eq('club_id', cid).gte('fecha', mesInicio),
      supabase.from('torneos').select('*').eq('club_id', cid).eq('estado', 'en_curso'),
      supabase.from('mensualidades').select('*').eq('club_id', cid).eq('mes', mesActual).eq('anio', anioActual),
      supabase.from('movimientos').select('*').eq('club_id', cid).gte('fecha', mesInicio),
      supabase.from('solicitudes_jugador').select('*').eq('club_id', cid).eq('estado', 'pendiente'),
      supabase.from('asistencia').select('*,jugadores(nombre)').eq('club_id', cid).eq('fecha', hoy).order('hora', { ascending: false })
    ])

    const activos = (jugsData || []).filter(j => j.estado === 'activo')
    const morosos = (mensualidades || []).filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
    const gastos = (movimientos || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0) || 0
    const ingresos = (movimientos || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0) || 0
    const coa = activos.length > 0 ? Math.round(gastos / activos.length) : 0
    const tm = activos.length > 0 ? Math.round((morosos.length / activos.length) * 100) : 0

    setKpis({ activos: activos.length, tm, coa, ingresos, gastos, torneos: torneos?.length || 0, morosos, jugadores: activos, mensualidadBase: 25000 })
    setJugadores(activos)
    setSolicitudes(solicitudesData || [])
    setAsistenciasHoy(asistHoy || [])

    const { data: asistMes } = await supabase.from('asistencia').select('*,jugadores(nombre)').eq('club_id', cid).gte('fecha', mesInicio).order('fecha', { ascending: false }).limit(5)
    setUltimasAsist(asistMes || [])
  }

  async function registrarAsistencia(jugador: any) {
    const yaRegistro = asistenciasHoy.find(a => a.jugador_id === jugador.id)
    if (yaRegistro) { alert(`${jugador.nombre} ya registró hoy`); return }
    setRegistrando(jugador.id)
    await supabase.from('asistencia').insert({ club_id: perfil?.club_id, jugador_id: jugador.id, fecha: hoy, hora })
    setRegistrando(null)
    setBusquedaAsist('')
    await cargarDatos(perfil?.club_id)
  }

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
  const jugadoresFiltrados = busquedaAsist.length > 1
    ? jugadores.filter(j => j.nombre?.toLowerCase().includes(busquedaAsist.toLowerCase())).slice(0, 5)
    : []
  const registradosHoy = new Set(asistenciasHoy.map(a => a.jugador_id))

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff' }}>Dashboard</h1>
      </div>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:16 }}>
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
              <div style={{ fontSize:22 }}>🏓</div>
              <div style={{ fontSize:26, fontWeight:700, color:'#a78bfa', fontFamily:'monospace', margin:'8px 0 4px' }}>{kpis.activos || 0}</div>
              <div style={{ fontSize:12, color:'#6c7280' }}>Jugadores activos</div>
            </div>
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
              <div style={{ fontSize:22 }}>🎯</div>
              <div style={{ fontSize:26, fontWeight:700, color:'#fbbf24', fontFamily:'monospace', margin:'8px 0 4px' }}>{kpis.torneos || 0}</div>
              <div style={{ fontSize:12, color:'#6c7280' }}>Torneos activos</div>
            </div>
            <div onClick={() => { setDdOpen('morosidad'); setDdData(kpis.morosos || []) }}
              style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18, cursor:'pointer' }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ fontSize:22 }}>⚠️</span><span style={{ fontSize:10, color:'#4b5063' }}>↗</span></div>
              <div style={{ fontSize:26, fontWeight:700, color:(kpis.tm||0) > 25 ? '#f87171' : (kpis.tm||0) > 10 ? '#fbbf24' : '#34d399', fontFamily:'monospace', margin:'8px 0 4px' }}>{kpis.tm || 0}%</div>
              <div style={{ fontSize:12, color:'#6c7280' }}>Tasa de morosidad</div>
            </div>
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
              <div style={{ fontSize:22 }}>📈</div>
              <div style={{ fontSize:26, fontWeight:700, color:'#34d399', fontFamily:'monospace', margin:'8px 0 4px' }}>{fmt(kpis.ingresos || 0)}</div>
              <div style={{ fontSize:12, color:'#6c7280' }}>Ingresos este mes</div>
            </div>
          </div>

          {/* Asistencia + Solicitudes */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            {/* Asistencia hoy */}
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>📱 Asistencia hoy</div>
                <span style={{ background:'#34d39922', color:'#34d399', padding:'2px 8px', borderRadius:20, fontSize:11 }}>{asistenciasHoy.length} registros</span>
              </div>
              <div style={{ position:'relative' }}>
                <input
                  style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'9px 12px', color:'#e8e8f0', fontSize:13, outline:'none', boxSizing:'border-box' }}
                  placeholder="Buscar jugador para registrar..."
                  value={busquedaAsist}
                  onChange={e => setBusquedaAsist(e.target.value)}
                />
                {jugadoresFiltrados.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, zIndex:10, marginTop:4, overflow:'hidden' }}>
                    {jugadoresFiltrados.map(j => {
                      const yaRegistro = registradosHoy.has(j.id)
                      return (
                        <div key={j.id} onClick={() => !yaRegistro && registrarAsistencia(j)}
                          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid #1e2030', cursor: yaRegistro ? 'default' : 'pointer', opacity: yaRegistro ? 0.6 : 1 }}>
                          <div>
                            <div style={{ fontSize:13, color:'#c8cfe0' }}>{j.nombre}</div>
                            <div style={{ fontSize:10, color:'#6c7280' }}>{j.sesiones_usadas}/{j.sesiones_limite} sesiones</div>
                          </div>
                          {yaRegistro
                            ? <span style={{ background:'#34d39922', color:'#34d399', padding:'3px 8px', borderRadius:20, fontSize:10 }}>✓ Ya registrado</span>
                            : registrando === j.id
                            ? <span style={{ color:'#6c7280', fontSize:11 }}>...</span>
                            : <button style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>✓</button>
                          }
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ marginTop:12, maxHeight:120, overflowY:'auto' }}>
                {asistenciasHoy.slice(0,4).map(a => (
                  <div key={a.id} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #1a1d2e', fontSize:12 }}>
                    <span style={{ color:'#c8cfe0' }}>{(a as any).jugadores?.nombre || '—'}</span>
                    <span style={{ color:'#6c7280' }}>{a.hora?.slice(0,5)}</span>
                  </div>
                ))}
                {asistenciasHoy.length === 0 && <p style={{ fontSize:12, color:'#4b5063', marginTop:8 }}>Sin registros hoy</p>}
              </div>
            </div>

            {/* Solicitudes pendientes */}
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>📨 Solicitudes pendientes</div>
                {solicitudes.length > 0 && (
                  <span style={{ background:'#6c63ff22', color:'#a78bfa', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>{solicitudes.length} nuevas</span>
                )}
              </div>
              {solicitudes.length === 0
                ? <p style={{ fontSize:13, color:'#4b5063', textAlign:'center', padding:'20px 0' }}>Sin solicitudes pendientes</p>
                : solicitudes.slice(0,3).map(sol => (
                  <div key={sol.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #1a1d2e' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color:'#c8cfe0', fontWeight:500 }}>{sol.nombre}</div>
                      <div style={{ fontSize:11, color:'#6c7280' }}>{new Date(sol.creado_en).toLocaleDateString('es-CL')}</div>
                    </div>
                    <button onClick={() => router.push('/solicitudes')}
                      style={{ background:'#6c63ff22', color:'#a78bfa', border:'none', borderRadius:6, padding:'4px 8px', fontSize:11, cursor:'pointer' }}>
                      Ver →
                    </button>
                  </div>
                ))
              }
              {solicitudes.length > 3 && (
                <button onClick={() => router.push('/solicitudes')}
                  style={{ width:'100%', marginTop:10, background:'transparent', border:'1px solid #1e2030', borderRadius:8, padding:'7px', color:'#6c7280', fontSize:12, cursor:'pointer' }}>
                  Ver todas ({solicitudes.length}) →
                </button>
              )}
            </div>
          </div>

          {/* Últimas asistencias + COA */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>📅 Últimas asistencias</div>
              {ultimasAsist.length === 0
                ? <p style={{ fontSize:13, color:'#6c7280', textAlign:'center', padding:'20px 0' }}>Sin asistencias</p>
                : ultimasAsist.map(a => (
                  <div key={a.id} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #1a1d2e', fontSize:13 }}>
                    <span style={{ color:'#c8cfe0' }}>{(a as any).jugadores?.nombre || '—'}</span>
                    <span style={{ color:'#6c7280', fontSize:12 }}>{a.fecha}</span>
                  </div>
                ))
              }
            </div>

            <div style={{ display:'grid', gridTemplateRows:'1fr 1fr', gap:14 }}>
              <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
                <div style={{ fontSize:22 }}>💰</div>
                <div style={{ fontSize:24, fontWeight:700, color: (kpis.coa||0) > (kpis.mensualidadBase||25000) ? '#f87171' : '#34d399', fontFamily:'monospace', margin:'6px 0 4px' }}>{fmt(kpis.coa || 0)}</div>
                <div style={{ fontSize:12, color:'#6c7280' }}>COA — Costo por alumno</div>
                <div style={{ fontSize:11, marginTop:4, color: (kpis.coa||0) > (kpis.mensualidadBase||25000) ? '#f87171' : '#34d399' }}>
                  {(kpis.coa||0) > (kpis.mensualidadBase||25000) ? '🔴 Pérdida por alumno' : '✓ Margen saludable'}
                </div>
              </div>
              <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
                <div style={{ fontSize:22 }}>📉</div>
                <div style={{ fontSize:24, fontWeight:700, color:'#f87171', fontFamily:'monospace', margin:'6px 0 4px' }}>{fmt(kpis.gastos || 0)}</div>
                <div style={{ fontSize:12, color:'#6c7280' }}>Gastos este mes</div>
              </div>
            </div>
          </div>
      {/* Modal drilldown morosidad */}
      {ddOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:24, width:'100%', maxWidth:520, maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:600, color:'#fff' }}>⚠️ Deudores</div>
              <button onClick={() => setDdOpen(null)} style={{ background:'transparent', border:'none', color:'#6c7280', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            {ddData.length === 0
              ? <p style={{ color:'#34d399', textAlign:'center', padding:20 }}>✓ Sin deudores</p>
              : ddData.map((item: any) => (
                <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #1e2030' }}>
                  <div>
                    <div style={{ fontSize:13, color:'#c8cfe0', fontWeight:500 }}>
                      {kpis.jugadores?.find((j:any) => j.id === item.jugador_id)?.nombre || '—'}
                    </div>
                    <div style={{ fontSize:11, color:'#6c7280', marginTop:2 }}>{item.estado}</div>
                  </div>
                  {kpis.jugadores?.find((j:any) => j.id === item.jugador_id)?.telefono && (
                    <a href={`https://wa.me/${kpis.jugadores.find((j:any) => j.id === item.jugador_id).telefono.replace(/[^0-9]/g,'')}`} target="_blank"
                      style={{ background:'#0a2d1a', color:'#34d399', padding:'5px 10px', borderRadius:8, fontSize:11, textDecoration:'none' }}>
                      💬 WA
                    </a>
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

function SolicitudesInline({ clubId, onUpdate }: { clubId: string, onUpdate: () => void }) {
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (clubId) cargar()
  }, [clubId])

  async function cargar() {
    const { data } = await supabase.from('solicitudes_jugador').select('*').eq('club_id', clubId).order('creado_en', { ascending: false })
    setSolicitudes(data || [])
    setLoading(false)
  }

  async function aprobar(sol: any) {
    await supabase.from('jugadores').insert({
      club_id: clubId, nombre: sol.nombre, rut: sol.rut, email: sol.email,
      telefono: sol.telefono, categoria: 'principiante', sesiones_limite: 12,
      elo: 1200, estado: 'activo', es_externo: false
    })
    await supabase.from('solicitudes_jugador').update({ estado: 'aprobado' }).eq('id', sol.id)
    await cargar()
    onUpdate()
  }

  async function rechazar(id: string) {
    await supabase.from('solicitudes_jugador').update({ estado: 'rechazado' }).eq('id', id)
    await cargar()
    onUpdate()
  }

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente')
  const historial = solicitudes.filter(s => s.estado !== 'pendiente')

  if (loading) return <div style={{ padding:30, textAlign:'center', color:'#6c7280' }}>Cargando...</div>

  return (
    <div>
      {pendientes.length === 0
        ? (
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:40, textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📨</div>
            <div style={{ fontSize:14, color:'#c8cfe0' }}>Sin solicitudes pendientes</div>
          </div>
        )
        : pendientes.map(sol => (
          <div key={sol.id} style={{ background:'#14161f', border:'1px solid #6c63ff44', borderRadius:14, padding:20, marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:6 }}>{sol.nombre}</div>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                  {sol.rut && <span style={{ fontSize:12, color:'#6c7280' }}>RUT: {sol.rut}</span>}
                  {sol.email && <span style={{ fontSize:12, color:'#6c7280' }}>{sol.email}</span>}
                  {sol.telefono && <span style={{ fontSize:12, color:'#6c7280' }}>{sol.telefono}</span>}
                </div>
                <div style={{ fontSize:11, color:'#4b5063', marginTop:6 }}>
                  {new Date(sol.creado_en).toLocaleDateString('es-CL', { day:'numeric', month:'long', year:'numeric' })}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {sol.telefono && (
                  <a href={`https://wa.me/${sol.telefono.replace(/[^0-9]/g,'')}`} target="_blank"
                    style={{ background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, textDecoration:'none' }}>
                    💬 WhatsApp
                  </a>
                )}
                <button onClick={() => rechazar(sol.id)}
                  style={{ background:'#f8717122', color:'#f87171', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  ✕ Rechazar
                </button>
                <button onClick={() => aprobar(sol)}
                  style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  ✓ Aprobar
                </button>
              </div>
            </div>
          </div>
        ))
      }
      {historial.length > 0 && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginTop:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Historial</div>
          {historial.slice(0,5).map(sol => (
            <div key={sol.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #1e2030', fontSize:13 }}>
              <span style={{ color:'#c8cfe0' }}>{sol.nombre}</span>
              <span style={{ background: sol.estado==='aprobado'?'#34d39922':'#f8717122', color: sol.estado==='aprobado'?'#34d399':'#f87171', padding:'2px 8px', borderRadius:20, fontSize:11 }}>
                {sol.estado === 'aprobado' ? '✓ Aprobado' : '✕ Rechazado'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
