'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient()

export default function DashboardProfesorPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clases, setClases] = useState<any[]>([])
  const [alertas, setAlertas] = useState<any[]>([])
  const [totalAlumnos, setTotalAlumnos] = useState(0)
  const [evalPendientes, setEvalPendientes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [ddOpen, setDdOpen] = useState<string | null>(null)
  const [ddData, setDdData] = useState<any[]>([])
  const router = useRouter()

  const hoy = new Date()
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

  // Rango: hoy → domingo de esta semana
  const hoyISO = hoy.toISOString().slice(0, 10)
  const diaSemana = hoy.getDay() // 0=dom, 1=lun...
  const diasHastaDom = diaSemana === 0 ? 0 : 7 - diaSemana
  const domingo = new Date(hoy)
  domingo.setDate(hoy.getDate() + diasHastaDom)
  const domingoISO = domingo.toISOString().slice(0, 10)

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.club_id) await cargarDatos(p)
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarDatos(p: any) {
    const trimestre = `Q${Math.ceil((hoy.getMonth()+1)/3)}-${hoy.getFullYear()}`

    const [{ data: jugadores }, { data: clasesHoy }, { data: evals }, { data: asist5 }] = await Promise.all([
      supabase.from('jugadores').select('id,nombre,telefono,categoria').eq('club_id', p.club_id).eq('estado', 'activo').neq('es_externo', true),
      supabase.from('clases').select('*').eq('club_id', p.club_id)
        .gte('fecha', hoyISO).lte('fecha', domingoISO)
        .order('fecha').order('hora_inicio'),
      supabase.from('evaluaciones_trimestrales').select('jugador_id').eq('club_id', p.club_id).eq('periodo_trimestre', trimestre),
      supabase.from('asistencia').select('jugador_id').eq('club_id', p.club_id).gte('fecha', new Date(Date.now()-5*24*60*60*1000).toISOString().slice(0,10))
    ])

    setTotalAlumnos(jugadores?.length || 0)
    setClases(clasesHoy || [])

    const evalIds = new Set((evals || []).map(e => e.jugador_id))
    const sinEval = (jugadores || []).filter(j => !evalIds.has(j.id))
    setEvalPendientes(sinEval.length)

    const asistIds = new Set((asist5 || []).map(a => a.jugador_id))
    const ausentes = (jugadores || []).filter(j => !asistIds.has(j.id))

    const nuevasAlertas = []
    if (sinEval.length > 0) nuevasAlertas.push({ tipo:'warning', msg:`${sinEval.length} alumno${sinEval.length>1?'s':''} sin evaluación trimestral (${trimestre})`, data: sinEval, key:'eval' })
    if (ausentes.length > 0) nuevasAlertas.push({ tipo:'error', msg:`${ausentes.length} alumno${ausentes.length>1?'s':''} sin asistir en los últimos 5 días`, data: ausentes, key:'ausentes' })
    setAlertas(nuevasAlertas)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:20, fontWeight:700, color:'#fff', marginBottom:4 }}>
          Buen día, {perfil?.nombre?.split(' ')[0] || 'Profesor'}
        </div>
        <div style={{ fontSize:13, color:'#6c7280' }}>
          {diasSemana[hoy.getDay()]} {hoy.getDate()} de {meses[hoy.getMonth()]} {hoy.getFullYear()}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14, marginBottom:16 }}>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:24 }}>👥</div>
          <div style={{ fontSize:28, fontWeight:700, color:'#c8cfe0', fontFamily:'monospace', margin:'8px 0 4px' }}>{totalAlumnos}</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Mis alumnos</div>
        </div>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:24 }}>📋</div>
          <div style={{ fontSize:28, fontWeight:700, color: evalPendientes > 0 ? '#fbbf24' : '#34d399', fontFamily:'monospace', margin:'8px 0 4px' }}>{evalPendientes}</div>
          <div style={{ fontSize:12, color:'#6c7280' }}>Eval. pendientes</div>
        </div>
      </div>

      {/* Clases de la semana (desde hoy) */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.5px' }}>Clases esta semana</div>
        {clases.length === 0
          ? <p style={{ fontSize:13, color:'#6c7280', textAlign:'center', padding:'16px 0' }}>Sin clases programadas</p>
          : (() => {
              const porFecha: Record<string, any[]> = {}
              clases.forEach(c => { const f = c.fecha || ''; if (!porFecha[f]) porFecha[f] = []; porFecha[f].push(c) })
              return Object.keys(porFecha).sort().map(fecha => {
                const d = new Date(fecha + 'T00:00:00')
                const esHoy = fecha === hoyISO
                return (
                  <div key={fecha} style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color: esHoy ? '#a78bfa' : '#6c7280', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                      {diasSemana[d.getDay()]} {d.getDate()}
                      {esHoy && <span style={{ background:'#1e1b4b', color:'#a78bfa', padding:'1px 6px', borderRadius:10, fontSize:9, fontWeight:700 }}>HOY</span>}
                    </div>
                    {porFecha[fecha].map(c => (
                      <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'#0a0c12', borderRadius:10, marginBottom:6 }}>
                        <div style={{ background:'#1e1b4b', color:'#a78bfa', padding:'6px 10px', borderRadius:8, fontSize:11, fontWeight:600, minWidth:80, textAlign:'center', flexShrink:0 }}>
                          {c.hora_inicio?.slice(0,5) || '—'}<br/>
                          <span style={{ fontSize:10, color:'#6c7280', fontWeight:400 }}>{c.hora_fin?.slice(0,5) || ''}</span>
                        </div>
                        <div>
                          <div style={{ fontSize:13, color:'#c8cfe0', fontWeight:600 }}>{c.contenido || 'Clase'}</div>
                          <div style={{ fontSize:11, color:'#6c7280' }}>{c.grupo || 'Grupo general'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            })()
        }
      </div>

      {/* Alertas */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.5px' }}>Alertas</div>
        {alertas.length === 0
          ? <p style={{ fontSize:13, color:'#34d399', padding:'8px 0' }}>✓ Sin alertas pendientes</p>
          : alertas.map(a => (
            <div key={a.key} onClick={() => { setDdOpen(a.key); setDdData(a.data) }}
              style={{ display:'flex', gap:10, padding:12, background: a.tipo==='warning'?'#2d1f00':'#2d0a0a', borderRadius:10, marginBottom:8, cursor:'pointer', border:`1px solid ${a.tipo==='warning'?'#fbbf2433':'#f8717133'}` }}>
              <span style={{ fontSize:18 }}>{a.tipo==='warning'?'⚠️':'🔴'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color: a.tipo==='warning'?'#fbbf24':'#f87171' }}>{a.msg}</div>
                <div style={{ fontSize:11, color:'#6c7280', marginTop:2 }}>Toca para ver detalle →</div>
              </div>
            </div>
          ))
        }
      </div>

      {/* Modal detalle alerta */}
      {ddOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:24, width:'100%', maxWidth:480, maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:15, fontWeight:600, color:'#fff' }}>
                {ddOpen === 'eval' ? '⚠️ Sin evaluación trimestral' : '🔴 Sin asistir (últimos 5 días)'}
              </div>
              <button onClick={() => setDdOpen(null)} style={{ background:'transparent', border:'none', color:'#6c7280', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            {ddData.map((j: any) => (
              <div key={j.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #1e2030' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#6c63ff,#a78bfa)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'white', flexShrink:0 }}>
                  {j.nombre?.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:'#c8cfe0', fontWeight:500 }}>{j.nombre}</div>
                  <div style={{ fontSize:11, color:'#6c7280' }}>{j.categoria}</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {j.telefono && <a href={`https://wa.me/${j.telefono.replace(/[^0-9]/g,'')}`} target="_blank" style={{ background:'#0a2d1a', color:'#34d399', padding:'5px 10px', borderRadius:8, fontSize:11, textDecoration:'none' }}>💬 WA</a>}
                  {ddOpen === 'eval' && <button onClick={() => { setDdOpen(null); router.push(`/jugadores/${j.id}`) }} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Evaluar</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
