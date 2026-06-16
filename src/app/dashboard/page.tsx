'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient()

export default function DashboardPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [kpis, setKpis] = useState<any>({})
  const [ultimasAsist, setUltimasAsist] = useState<any[]>([])
  const [jugadores, setJugadores] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ddOpen, setDdOpen] = useState<string | null>(null)
  const [ddData, setDdData] = useState<any[]>([])
  const [tooltip, setTooltip] = useState<string | null>(null)
  const router = useRouter()

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
    const mesPrev = mesActual === 1 ? 12 : mesActual - 1
    const anioPrev = mesActual === 1 ? anioActual - 1 : anioActual
    const mesInicioPrev = `${anioPrev}-${String(mesPrev).padStart(2,'0')}-01`

    const [
      { data: jugsData },
      { data: mensualidades },
      { data: movimientos },
      { data: solicitudesData },
      { data: movimientosPrev },
      { data: asistMes },
    ] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', cid).neq('es_externo', true),
      supabase.from('mensualidades').select('*').eq('club_id', cid).eq('mes', mesActual).eq('anio', anioActual),
      supabase.from('movimientos').select('*').eq('club_id', cid).gte('fecha', mesInicio),
      supabase.from('solicitudes_jugador').select('*').eq('club_id', cid).eq('estado', 'pendiente'),
      supabase.from('movimientos').select('*').eq('club_id', cid).gte('fecha', mesInicioPrev).lt('fecha', mesInicio),
      supabase.from('asistencia').select('*,jugadores(nombre)').eq('club_id', cid).gte('fecha', mesInicio).order('fecha', { ascending: false }).limit(5),
    ])

    const activos = (jugsData || []).filter(j => j.estado === 'activo')
    const morosos = (mensualidades || []).filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
    const gastos = (movimientos || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0) || 0
    const ingresos = (movimientos || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0) || 0
    const coa = activos.length > 0 ? Math.round(gastos / activos.length) : 0
    const tm = activos.length > 0 ? Math.round((morosos.length / activos.length) * 100) : 0

    const gastosPrev = (movimientosPrev || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0) || 0
    const ingresosPrev = (movimientosPrev || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0) || 0
    const utilidadPorAlumno = activos.length > 0 ? Math.round((ingresos - gastos) / activos.length) : 0
    const ingresoPorAlumno = activos.length > 0 ? Math.round(ingresos / activos.length) : 0
    const costoPorAlumno = activos.length > 0 ? Math.round(gastos / activos.length) : 0
    const utilidadPrevPorAlumno = activos.length > 0 ? Math.round((ingresosPrev - gastosPrev) / activos.length) : 0
    const variacionUtilidad = utilidadPrevPorAlumno !== 0
      ? Math.round(((utilidadPorAlumno - utilidadPrevPorAlumno) / Math.abs(utilidadPrevPorAlumno)) * 100)
      : null

    setKpis({ activos: activos.length, tm, coa, ingresos, gastos, morosos, jugadores: activos, mensualidadBase: 25000, utilidadPorAlumno, ingresoPorAlumno, costoPorAlumno, variacionUtilidad })
    setJugadores(activos)
    setSolicitudes(solicitudesData || [])
    setUltimasAsist(asistMes || [])
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

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:16 }}>
        {/* Jugadores activos */}
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18, position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ fontSize:22 }}>🏓</div>
            <TooltipBtn id="activos" tooltip={tooltip} setTooltip={setTooltip}
              texto="Jugadores con estado activo en el club. No incluye externos ni suspendidos. Es la base de cálculo para todos los demás indicadores por alumno." />
          </div>
          <div style={{ fontSize:26, fontWeight:700, color:'#a78bfa', fontFamily:'monospace', margin:'8px 0 4px' }}>{kpis.activos || 0}</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Jugadores activos</div>
        </div>

        {/* Utilidad por alumno */}
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18, position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ fontSize:22 }}>💡</div>
            <TooltipBtn id="utilidad" tooltip={tooltip} setTooltip={setTooltip}
              texto={'Beneficio económico promedio por alumno activo este mes.\n\nFórmula: (Ingresos − Gastos) ÷ Alumnos Activos\n\n↑ Sube cuando los ingresos crecen sin aumento proporcional de gastos, o cuando los gastos disminuyen.\n\n↓ Baja cuando los gastos aumentan sin respaldo en ingresos, o cuando ingresan nuevos alumnos sin generar ingresos adicionales.'} />
          </div>
          <div style={{ fontSize:26, fontWeight:700, color:(kpis.utilidadPorAlumno||0) >= 0 ? '#34d399' : '#f87171', fontFamily:'monospace', margin:'8px 0 2px' }}>
            {fmt(kpis.utilidadPorAlumno || 0)}
          </div>
          {kpis.variacionUtilidad !== null && kpis.variacionUtilidad !== undefined && (
            <div style={{ fontSize:11, color: kpis.variacionUtilidad >= 0 ? '#34d399' : '#f87171', marginBottom:4 }}>
              {kpis.variacionUtilidad >= 0 ? '▲' : '▼'} {Math.abs(kpis.variacionUtilidad)}% vs mes anterior
            </div>
          )}
          <div style={{ fontSize:12, color:'#6c7280', marginBottom:8 }}>Utilidad por alumno</div>
          <div style={{ borderTop:'1px solid #1e2030', paddingTop:6, display:'flex', flexDirection:'column', gap:3 }}>
            <div style={{ fontSize:10, color:'#4b5063' }}>Ingreso prom: <span style={{ color:'#a78bfa', fontFamily:'monospace' }}>{fmt(kpis.ingresoPorAlumno || 0)}</span></div>
            <div style={{ fontSize:10, color:'#4b5063' }}>Costo prom: <span style={{ color:'#f87171', fontFamily:'monospace' }}>{fmt(kpis.costoPorAlumno || 0)}</span></div>
          </div>
        </div>

        {/* Tasa de morosidad */}
        <div onClick={() => { setDdOpen('morosidad'); setDdData(kpis.morosos || []) }}
          style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18, cursor:'pointer', position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <span style={{ fontSize:22 }}>⚠️</span>
            <TooltipBtn id="morosidad" tooltip={tooltip} setTooltip={setTooltip}
              texto="% de alumnos activos con mensualidad pendiente o atrasada este mes. Bajo 10% = saludable (verde). Entre 10-25% = requiere atención (amarillo). Sobre 25% = crítico (rojo). Haz clic para ver el listado de deudores." />
          </div>
          <div style={{ fontSize:26, fontWeight:700, color:(kpis.tm||0) > 25 ? '#f87171' : (kpis.tm||0) > 10 ? '#fbbf24' : '#34d399', fontFamily:'monospace', margin:'8px 0 4px' }}>{kpis.tm || 0}%</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Tasa de morosidad</div>
        </div>

        {/* Ingresos este mes */}
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18, position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ fontSize:22 }}>📈</div>
            <TooltipBtn id="ingresos" tooltip={tooltip} setTooltip={setTooltip}
              texto="Suma de todos los movimientos de tipo ingreso registrados en el mes actual. Incluye mensualidades, inscripciones y cualquier otro ingreso manual. No incluye meses anteriores." />
          </div>
          <div style={{ fontSize:26, fontWeight:700, color:'#34d399', fontFamily:'monospace', margin:'8px 0 4px' }}>{fmt(kpis.ingresos || 0)}</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Ingresos este mes</div>
        </div>
      </div>

      {/* Link inscripción + Solicitudes */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        {/* Link invitación */}
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:8 }}>🔗 Link de inscripción</div>
          <div style={{ fontSize:12, color:'#6c7280', marginBottom:12 }}>Comparte este link para que los jugadores soliciten unirse al club</div>
          <LinkInvitacion clubId={perfil?.club_id} />
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
                <a href="/solicitudes" style={{ background:'#6c63ff22', color:'#a78bfa', border:'none', borderRadius:6, padding:'4px 8px', fontSize:11, textDecoration:'none' }}>Ver →</a>
              </div>
            ))
          }
          {solicitudes.length > 0 && (
            <a href="/solicitudes" style={{ display:'block', marginTop:10, background:'transparent', border:'1px solid #1e2030', borderRadius:8, padding:'7px', color:'#6c7280', fontSize:12, textAlign:'center', textDecoration:'none' }}>
              Ver todas en Solicitudes →
            </a>
          )}
        </div>
      </div>

      {/* Últimas asistencias + COA/Gastos */}
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
            <div style={{ fontSize:24, fontWeight:700, color:(kpis.coa||0) > (kpis.mensualidadBase||25000) ? '#f87171' : '#34d399', fontFamily:'monospace', margin:'6px 0 4px' }}>{fmt(kpis.coa || 0)}</div>
            <div style={{ fontSize:12, color:'#6c7280' }}>COA — Costo por alumno</div>
            <div style={{ fontSize:11, marginTop:4, color:(kpis.coa||0) > (kpis.mensualidadBase||25000) ? '#f87171' : '#34d399' }}>
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

      {/* Modal morosidad */}
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

function TooltipBtn({ id, texto, tooltip, setTooltip }: {
  id: string
  texto: string
  tooltip: string | null
  setTooltip: (v: string | null) => void
}) {
  return (
    <div style={{ position:'relative', display:'inline-block', flexShrink:0 }}>
      <button
        onClick={e => e.stopPropagation()}
        onMouseEnter={() => setTooltip(id)}
        onMouseLeave={() => setTooltip(null)}
        style={{ background:'transparent', border:'1px solid #2a2d3e', borderRadius:'50%', color:'#4b5063', cursor:'help', fontSize:10, width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, padding:0 }}
      >?</button>
      {tooltip === id && (
        <div style={{ position:'absolute', top:22, right:0, background:'#1a1d2e', border:'1px solid #2a2d3e', borderRadius:8, padding:'10px 12px', fontSize:11, color:'#c8cfe0', zIndex:50, width:230, lineHeight:1.6, boxShadow:'0 4px 20px #00000099', whiteSpace:'pre-line' }}>
          {texto}
        </div>
      )}
    </div>
  )
}

function LinkInvitacion({ clubId }: { clubId: string }) {
  const [link, setLink] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!clubId) return
    async function cargar() {
      let { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
      if (!inv?.length) {
        await supabase.from('invitaciones').insert({ club_id: clubId })
        const { data: newInv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
        inv = newInv
      }
      const codigo = inv?.[0]?.codigo || ''
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://cmsports-next.vercel.app'
      setLink(`${origin}/registro?club=${clubId}&code=${codigo}`)
    }
    cargar()
  }, [clubId])

  function copiar() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div>
      <div style={{ background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 14px', fontSize:11, color:'#a78bfa', wordBreak:'break-all', marginBottom:8 }}>
        {link || 'Cargando...'}
      </div>
      <button onClick={copiar} style={{ width:'100%', background: copiado ? '#34d39922' : '#1e1b4b', color: copiado ? '#34d399' : '#a78bfa', border:'1px solid #1e2030', borderRadius:8, padding:'9px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
        {copiado ? '✓ Copiado!' : '📋 Copiar link'}
      </button>
    </div>
  )
}

function SolicitudesInline({ clubId, onUpdate }: { clubId: string, onUpdate: () => void }) {
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (clubId) cargar() }, [clubId])

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

  if (loading) return <div style={{ padding:30, textAlign:'center', color:'#6c7280' }}>Cargando...</div>

  return (
    <div>
      {solicitudes.filter(s => s.estado === 'pendiente').map(sol => (
        <div key={sol.id} style={{ background:'#14161f', border:'1px solid #6c63ff44', borderRadius:14, padding:20, marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:6 }}>{sol.nombre}</div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                {sol.rut && <span style={{ fontSize:12, color:'#6c7280' }}>RUT: {sol.rut}</span>}
                {sol.email && <span style={{ fontSize:12, color:'#6c7280' }}>{sol.email}</span>}
                {sol.telefono && <span style={{ fontSize:12, color:'#6c7280' }}>{sol.telefono}</span>}
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => rechazar(sol.id)} style={{ background:'#f8717122', color:'#f87171', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>✕ Rechazar</button>
              <button onClick={() => aprobar(sol)} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>✓ Aprobar</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
