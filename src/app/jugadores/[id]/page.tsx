'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  RadialLinearScale, Filler, Tooltip, Legend, BarElement
} from 'chart.js'
import { Line, Radar, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, RadialLinearScale, Filler, Tooltip, Legend, BarElement)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const POSICION_LABEL: Record<string, string> = {
  fase_grupos:'Fase de grupos', octavos:'Octavos de final', cuartos:'Cuartos de final',
  semifinal:'Semifinal', subcampeon:'Subcampeón', campeon:'Campeón 🏆'
}

const CAT_LABEL: Record<string, string> = {
  sub19:'Sub 19', aficionados:'Aficionados', intermedia:'Intermedia', tc:'TC'
}

export default function JugadorDetallePage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [jugador, setJugador] = useState<any>(null)
  const [historialElo, setHistorialElo] = useState<any[]>([])
  const [mensualidadActual, setMensualidadActual] = useState<any>(null)
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [partidos, setPartidos] = useState<any[]>([])
  const [externos, setExternos] = useState<any[]>([])
  const [evaluaciones, setEvaluaciones] = useState<any[]>([])
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mostrarAsistencia, setMostrarAsistencia] = useState(false)
  const [guardandoFeedback, setGuardandoFeedback] = useState(false)
  const [feedbackForm, setFeedbackForm] = useState({ feedback:'', meta:'' })
  const router = useRouter()
  const params = useParams()
  const jugadorId = params.id as string

  const trimestre = `Q${Math.ceil((new Date().getMonth()+1)/3)}-${new Date().getFullYear()}`

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)

      const [{ data: j }, { data: h }, { data: e }, { data: ext }, { data: evs }, { data: asist }] = await Promise.all([
        supabase.from('jugadores').select('*').eq('id', jugadorId).single(),
        supabase.from('historial_elo').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: true }),
        supabase.from('torneo_partidos').select('*,torneos(nombre)').or(`jugador_a.eq.${jugadorId},jugador_b.eq.${jugadorId}`).not('ganador', 'is', null),
        supabase.from('torneos_externos').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: false }),
        supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', jugadorId).order('creado_en', { ascending: false }).limit(2),
        supabase.from('asistencia').select('fecha').eq('jugador_id', jugadorId).order('fecha', { ascending: true })
      ])

      setJugador(j)
      setHistorialElo(h || [])
      setPartidos(e || [])
      setExternos(ext || [])
      setEvaluaciones(evs || [])
      setAsistencias(asist || [])

      // Mensualidad actual
      const mesActual = new Date().getMonth() + 1
      const anioActual = new Date().getFullYear()
      const { data: mens } = await supabase.from('mensualidades').select('*').eq('jugador_id', jugadorId).eq('mes', mesActual).eq('anio', anioActual).maybeSingle()
      setMensualidadActual(mens)

      // Pre-llenar formulario feedback
      const evalActual = evs?.find((ev: any) => ev.periodo_trimestre === trimestre)
      if (evalActual) setFeedbackForm({ feedback: evalActual.feedback_profesor || '', meta: evalActual.meta_proximo_periodo || '' })

      setLoading(false)
    }
    cargar()
  }, [jugadorId])

  const esAdmin = perfil?.rol === 'admin'
  const esProfesor = perfil?.rol === 'profesor'
  const esPropio = perfil?.jugador_id === jugadorId
  const puedeVerTodo = esAdmin || esProfesor || esPropio
  const puedeEditar = esAdmin || esProfesor

  const victorias = partidos.filter(p => p.ganador === jugadorId).length
  const derrotas = partidos.filter(p => p.ganador !== jugadorId).length

  const evalActual = evaluaciones.find(ev => ev.periodo_trimestre === trimestre)
  const evalAnterior = evaluaciones.find(ev => ev.periodo_trimestre !== trimestre)

  // Datos gráfico ELO
  const eloLabels = [...historialElo.map(h => h.fecha?.slice(0,10) || ''), 'Hoy']
  const eloData = [...historialElo.map(h => h.elo_despues), jugador?.elo || 1200]
  const eloTooltips = [...historialElo.map(h => h.posicion || '—'), 'ELO actual']

  // Datos asistencia por mes para superposición
  const asistPorMes: Record<string, number> = {}
  asistencias.forEach((a: any) => {
    const m = a.fecha?.slice(0,7)
    if (m) asistPorMes[m] = (asistPorMes[m] || 0) + 1
  })
  const asistData = eloLabels.map(l => asistPorMes[l?.slice(0,7)] || 0)

  // Datos radar
  const campos = ['fuerza','resistencia','velocidad','tecnica','tactica']
  const camposLabel = ['Fuerza','Resistencia','Velocidad','Técnica','Táctica']

  async function guardarFeedback() {
    if (!feedbackForm.feedback) return
    setGuardandoFeedback(true)
    if (evalActual) {
      await supabase.from('evaluaciones_trimestrales').update({
        feedback_profesor: feedbackForm.feedback,
        meta_proximo_periodo: feedbackForm.meta || null
      }).eq('id', evalActual.id)
    } else {
      await supabase.from('evaluaciones_trimestrales').insert({
        club_id: jugador?.club_id, jugador_id: jugadorId,
        periodo_trimestre: trimestre,
        feedback_profesor: feedbackForm.feedback,
        meta_proximo_periodo: feedbackForm.meta || null
      })
    }
    const { data: evs } = await supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', jugadorId).order('creado_en', { ascending: false }).limit(2)
    setEvaluaciones(evs || [])
    setGuardandoFeedback(false)
  }

  async function aceptarCompromiso() {
    if (!evalActual) return
    await supabase.from('evaluaciones_trimestrales').update({ firmado_alumno: true }).eq('id', evalActual.id)
    const { data: evs } = await supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', jugadorId).order('creado_en', { ascending: false }).limit(2)
    setEvaluaciones(evs || [])
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  if (!jugador) return (
    <AppLayout perfil={perfil}>
      <div style={{ padding:40, textAlign:'center', color:'#6c7280' }}>Jugador no encontrado</div>
    </AppLayout>
  )

  const iniciales = jugador.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()

  return (
    <AppLayout perfil={perfil}>
      <button onClick={() => router.back()} style={{ background:'transparent', border:'1px solid #1e2030', borderRadius:8, padding:'6px 14px', color:'#8890a4', fontSize:13, cursor:'pointer', marginBottom:20 }}>
        ← Volver
      </button>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1e1b4b,#14161f)', border:'1px solid #1e2030', borderRadius:16, padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#6c63ff,#a78bfa)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'white', flexShrink:0 }}>
            {iniciales}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:20, fontWeight:700, color:'#fff' }}>{jugador.nombre}</div>
            <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:2 }}>
              <div style={{ fontSize:12, color:'#6c7280' }}>{jugador.categoria}</div>
              {jugador.es_externo && <span style={{ background:'#fbbf2422', color:'#fbbf24', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600 }}>Participante externo</span>}
            </div>
          </div>
          {esAdmin && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {jugador.es_externo && (
                <button onClick={async () => {
                  if (!confirm('¿Agregar este jugador al club? Aparecerá en la lista de jugadores, ranking y mensualidades.')) return
                  await supabase.from('jugadores').update({ es_externo: false, sesiones_limite: 12, estado: 'activo' }).eq('id', jugadorId)
                  setJugador({ ...jugador, es_externo: false })
                }} style={{ background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                  ✅ Agregar al club
                </button>
              )}
              <button onClick={async () => {
                const nuevoEstado = jugador.estado === 'activo' ? 'bloqueado' : 'activo'
                await supabase.from('jugadores').update({ estado: nuevoEstado }).eq('id', jugadorId)
                setJugador({ ...jugador, estado: nuevoEstado })
              }} style={{ background: jugador.estado==='activo'?'#f8717122':'#34d39922', color: jugador.estado==='activo'?'#f87171':'#34d399', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>
                {jugador.estado==='activo'?'🔒 Bloquear':'✅ Activar'}
              </button>
            </div>
          )}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[
            { label:'ELO', value:jugador.elo, color:'#a78bfa' },
            { label:'Victorias', value:victorias, color:'#34d399' },
            { label:'Derrotas', value:derrotas, color:'#f87171' },
          ].map(s => (
            <div key={s.label} style={{ background:'#1e1b4b', borderRadius:10, padding:'10px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
              <div style={{ fontSize:11, color:'#6c7280' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Info contacto + Plan */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
          {/* Contacto */}
          <div style={{ background:'#0a0c12', borderRadius:10, padding:12 }}>
            <div style={{ fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Contacto</div>
            {jugador.rut && <div style={{ fontSize:12, color:'#c8cfe0', marginBottom:4 }}>🪪 {jugador.rut}</div>}
            {jugador.email && <div style={{ fontSize:12, color:'#c8cfe0', marginBottom:4 }}>✉️ {jugador.email}</div>}
            {jugador.telefono
              ? <a href={`https://wa.me/${jugador.telefono.replace(/[^0-9]/g,'')}`} target="_blank"
                  style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:'#34d399', textDecoration:'none', marginTop:4 }}>
                  💬 {jugador.telefono}
                </a>
              : <div style={{ fontSize:12, color:'#4b5063' }}>Sin teléfono</div>
            }
          </div>

          {/* Plan */}
          <div style={{ background:'#0a0c12', borderRadius:10, padding:12 }}>
            <div style={{ fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Plan</div>
            <div style={{ fontSize:13, color:'#a78bfa', fontWeight:700, marginBottom:4 }}>
              {jugador.sesiones_limite === 16 ? '$40.000/mes — 16 sesiones' :
               jugador.sesiones_limite === 12 ? '$30.000/mes — 12 sesiones' :
               jugador.sesiones_limite === 8  ? '$25.000/mes — 8 sesiones' :
               jugador.sesiones_limite === 4  ? '$15.000/mes — 4 sesiones' :
               `${jugador.sesiones_limite} sesiones`}
            </div>
            <div style={{ fontSize:12, color:'#6c7280', marginBottom:6 }}>
              Usadas: <strong style={{ color:'#c8cfe0' }}>{jugador.sesiones_usadas}/{jugador.sesiones_limite}</strong>
            </div>
            <div style={{ background:'#1e2030', borderRadius:4, height:6 }}>
              <div style={{ width:`${Math.min((jugador.sesiones_usadas/jugador.sesiones_limite)*100,100)}%`, background: jugador.sesiones_usadas >= jugador.sesiones_limite ? '#f87171' : '#6c63ff', borderRadius:4, height:'100%', transition:'width 0.3s' }} />
            </div>
            {mensualidadActual && (
              <div style={{ marginTop:8 }}>
                <span style={{ background: mensualidadActual.estado==='pagado'?'#34d39922':mensualidadActual.estado==='atrasado'?'#f8717122':'#fbbf2422', color: mensualidadActual.estado==='pagado'?'#34d399':mensualidadActual.estado==='atrasado'?'#f87171':'#fbbf24', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                  {mensualidadActual.estado==='pagado'?'✅ Mes pagado':mensualidadActual.estado==='atrasado'?'🔴 Mes atrasado':'⏳ Mes pendiente'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#0a0c12', borderRadius:10, padding:4, marginBottom:16 }}>
        {['📊 Competencia', ...(puedeVerTodo ? ['🕸️ Capacidades', '📝 Feedback'] : [])].map((t, i) => (
          <div key={i} onClick={() => setTab(i)} style={{ flex:1, padding:'8px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:500, background: tab===i?'#14161f':'transparent', color: tab===i?'#a78bfa':'#6c7280', transition:'all 0.15s' }}>
            {t}
          </div>
        ))}
      </div>

      {/* Tab 0 — Competencia */}
      {tab === 0 && (
        <div>
          {/* Gráfico ELO */}
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>Curva de ELO</div>
              {puedeEditar && eloLabels.length > 1 && (
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, color:'#8890a4' }}>
                  <input type="checkbox" checked={mostrarAsistencia} onChange={e => setMostrarAsistencia(e.target.checked)} style={{ accentColor:'#6c63ff' }} />
                  Ver asistencia
                </label>
              )}
            </div>
            {eloLabels.length > 1 ? (
              <Line
                data={{
                  labels: eloLabels,
                  datasets: (() => {
                    const ds: any[] = [{
                      label: 'ELO',
                      data: eloData,
                      borderColor: '#6c63ff',
                      backgroundColor: '#6c63ff22',
                      tension: 0.4,
                      pointBackgroundColor: '#a78bfa',
                      pointRadius: 5,
                      pointHoverRadius: 8,
                      yAxisID: 'y'
                    }]
                    if (mostrarAsistencia) ds.push({
                      label: 'Asistencias',
                      data: asistData,
                      type: 'bar',
                      backgroundColor: '#34d39944',
                      borderColor: '#34d399',
                      borderWidth: 1,
                      yAxisID: 'y2'
                    })
                    return ds
                  })()
                }}
                options={{
                  responsive: true,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { display: mostrarAsistencia, labels: { color: '#8890a4', font: { size: 11 } } },
                    tooltip: {
                      backgroundColor: '#1e2030',
                      titleColor: '#a78bfa',
                      bodyColor: '#c8cfe0',
                      callbacks: {
                        title: (items) => eloTooltips[items[0].dataIndex] || '',
                        label: (item) => item.dataset.label === 'ELO' ? `ELO: ${item.raw}` : `Asistencias: ${item.raw}`
                      }
                    }
                  },
                  scales: {
                    x: { ticks: { color: '#6c7280', maxTicksLimit: 6 }, grid: { color: '#1e203022' } },
                    y: { ticks: { color: '#6c7280' }, grid: { color: '#1e203022' } },
                    ...(mostrarAsistencia ? { y2: { position: 'right' as const, ticks: { color: '#34d399' }, grid: { display: false } } } : {})
                  }
                }}
              />
            ) : (
              <div style={{ textAlign:'center', padding:20 }}>
                <div style={{ fontSize:13, color:'#6c7280' }}>ELO inicial: <strong style={{ color:'#a78bfa' }}>{jugador.elo}</strong></div>
                <div style={{ fontSize:12, color:'#4b5063', marginTop:6 }}>El gráfico se completará con los torneos</div>
              </div>
            )}
          </div>

          {/* Partidos */}
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>Historial de partidos</div>
            {partidos.length === 0
              ? <div style={{ padding:30, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin partidos registrados</div>
              : partidos.slice(0,10).map(p => {
                const gane = p.ganador === jugadorId
                return (
                  <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #1e2030' }}>
                    <div>
                      <div style={{ fontSize:13, color:'#c8cfe0' }}>{(p as any).torneos?.nombre || '—'}</div>
                      <div style={{ fontSize:11, color:'#6c7280' }}>{p.fase}</div>
                    </div>
                    <span style={{ background: gane?'#34d39922':'#f8717122', color: gane?'#34d399':'#f87171', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                      {gane ? 'Victoria' : 'Derrota'}
                    </span>
                  </div>
                )
              })
            }
          </div>

          {/* Torneos externos */}
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>Torneos externos</div>
            {externos.length === 0
              ? <div style={{ padding:30, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin torneos externos</div>
              : externos.map(t => (
                <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #1e2030' }}>
                  <div>
                    <div style={{ fontSize:13, color:'#c8cfe0' }}>{t.nombre_club}</div>
                    <div style={{ fontSize:11, color:'#6c7280' }}>{t.fecha} · {CAT_LABEL[t.categoria] || t.categoria}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:16, fontWeight:700, color:'#a78bfa', fontFamily:'monospace' }}>+{t.puntos_elo}</div>
                    <div style={{ fontSize:10, color:'#6c7280' }}>{POSICION_LABEL[t.posicion] || t.posicion}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Tab 1 — Capacidades — OCULTO */}
      {false && tab === 1 && puedeVerTodo && (
        <div>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>Radar de capacidades</div>
              {evalActual && <span style={{ fontSize:11, color:'#6c7280' }}>{evalActual.periodo_trimestre}</span>}
            </div>
            {evalActual ? (
              <Radar
                data={{
                  labels: camposLabel,
                  datasets: [
                    {
                      label: evalActual.periodo_trimestre,
                      data: campos.map(c => evalActual[c] || 0),
                      borderColor: '#6c63ff',
                      backgroundColor: '#6c63ff33',
                      pointBackgroundColor: '#a78bfa'
                    },
                    ...(evalAnterior ? [{
                      label: evalAnterior.periodo_trimestre,
                      data: campos.map(c => evalAnterior[c] || 0),
                      borderColor: '#6c728066',
                      backgroundColor: 'transparent',
                      borderDash: [5, 5],
                      pointBackgroundColor: '#6c7280'
                    }] : [])
                  ]
                }}
                options={{
                  responsive: true,
                  scales: {
                    r: {
                      min: 0, max: 10,
                      ticks: { color: '#6c7280', stepSize: 2 },
                      grid: { color: '#1e2030' },
                      pointLabels: { color: '#c8cfe0', font: { size: 12 } }
                    }
                  },
                  plugins: { legend: { labels: { color: '#8890a4' } } }
                }}
              />
            ) : (
              <div style={{ textAlign:'center', padding:30 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:13, color:'#6c7280' }}>Sin evaluación trimestral aún</div>
              </div>
            )}
          </div>

          {/* Diferencial */}
          {evalActual && evalAnterior && (
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Diferencial vs trimestre anterior</div>
              {campos.map((c, i) => {
                const diff = (evalActual[c]||0) - (evalAnterior[c]||0)
                return (
                  <div key={c} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #1a1d2e' }}>
                    <span style={{ fontSize:13, color:'#8890a4' }}>{camposLabel[i]}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:13, color:'#c8cfe0', fontWeight:600 }}>{evalActual[c]}/10</span>
                      <span style={{ fontSize:12, color: diff>0?'#34d399':diff<0?'#f87171':'#6c7280' }}>{diff>0?'+':''}{diff}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Formulario evaluación */}
          {puedeEditar && (
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Evaluar — {trimestre}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                {campos.map((c, i) => (
                  <div key={c}>
                    <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>{camposLabel[i]} (1-10)</label>
                    <input
                      style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'8px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                      type="number" min="1" max="10" id={`eval-${c}`}
                      defaultValue={evalActual?.[c] || ''}
                    />
                  </div>
                ))}
              </div>
              <button onClick={async () => {
                const datos: any = {}
                let valido = true
                campos.forEach(c => {
                  const val = parseInt((document.getElementById(`eval-${c}`) as HTMLInputElement)?.value)
                  if (!val || val < 1 || val > 10) { valido = false; return }
                  datos[c] = val
                })
                if (!valido) { alert('Todos los valores deben ser entre 1 y 10'); return }
                if (evalActual) {
                  await supabase.from('evaluaciones_trimestrales').update(datos).eq('id', evalActual.id)
                } else {
                  await supabase.from('evaluaciones_trimestrales').insert({ club_id: jugador.club_id, jugador_id: jugadorId, periodo_trimestre: trimestre, ...datos })
                }
                const { data: evs } = await supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', jugadorId).order('creado_en', { ascending: false }).limit(2)
                setEvaluaciones(evs || [])
              }} style={{ width:'100%', padding:11, background:'#6c63ff', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Guardar evaluación
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 1 — Feedback */}
      {tab === 1 && puedeVerTodo && (
        <div>
          {evalActual?.feedback_profesor ? (
            <>
              <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:8 }}>Informe del entrenador</div>
                <div style={{ fontSize:13, color:'#c8cfe0', lineHeight:1.6, marginBottom:16 }}>{evalActual.feedback_profesor}</div>
                {evalActual.meta_proximo_periodo && (
                  <div style={{ background:'#1e1b4b', borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:'#a78bfa', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>Meta del próximo período</div>
                    <div style={{ fontSize:13, color:'#c8cfe0', lineHeight:1.6 }}>{evalActual.meta_proximo_periodo}</div>
                  </div>
                )}
              </div>
              {esPropio && (
                <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, marginBottom:16 }}>
                  {evalActual.firmado_alumno
                    ? <div style={{ background:'#052e16', color:'#34d399', padding:'12px 16px', borderRadius:10, fontSize:13, textAlign:'center' }}>✅ Compromiso aceptado</div>
                    : <>
                        <div style={{ fontSize:13, color:'#c8cfe0', marginBottom:12 }}>He leído el informe de mi entrenador y acepto mis metas para el próximo período.</div>
                        <button onClick={aceptarCompromiso} style={{ width:'100%', padding:14, background:'linear-gradient(135deg,#6c63ff,#a78bfa)', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
                          ✍️ Aceptar compromiso del trimestre
                        </button>
                      </>
                  }
                </div>
              )}
              {!esPropio && (
                <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:8 }}>Estado del compromiso</div>
                  {evalActual.firmado_alumno
                    ? <div style={{ background:'#052e16', color:'#34d399', padding:'10px 16px', borderRadius:10, fontSize:13 }}>✅ Compromiso aceptado por el alumno</div>
                    : <div style={{ background:'#2d1f00', color:'#fbbf24', padding:'10px 16px', borderRadius:10, fontSize:13 }}>⏳ Pendiente de aceptación</div>
                  }
                </div>
              )}
            </>
          ) : (
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:30, textAlign:'center', marginBottom:16 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📝</div>
              <div style={{ fontSize:13, color:'#6c7280' }}>Sin feedback registrado aún</div>
            </div>
          )}

          {puedeEditar && (
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>
                {evalActual?.feedback_profesor ? 'Editar feedback' : 'Agregar feedback'} — {trimestre}
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Diagnóstico técnico y desarrollo</label>
                <textarea
                  style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none', resize:'vertical', minHeight:80 }}
                  placeholder="Diagnóstico del alumno este trimestre..."
                  value={feedbackForm.feedback}
                  onChange={e => setFeedbackForm(f => ({ ...f, feedback: e.target.value }))}
                />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Metas para el próximo período</label>
                <textarea
                  style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none', resize:'vertical', minHeight:60 }}
                  placeholder="Objetivos para el siguiente trimestre..."
                  value={feedbackForm.meta}
                  onChange={e => setFeedbackForm(f => ({ ...f, meta: e.target.value }))}
                />
              </div>
              <button onClick={guardarFeedback} disabled={guardandoFeedback} style={{ width:'100%', padding:11, background:'#6c63ff', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {guardandoFeedback ? 'Guardando...' : 'Guardar feedback'}
              </button>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
