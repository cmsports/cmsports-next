'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const POSICION_LABEL: Record<string, string> = {
  fase_grupos:'Fase de grupos', octavos:'Octavos de final', cuartos:'Cuartos de final',
  semifinal:'Semifinal', subcampeon:'Subcampeón', campeon:'Campeón 🏆'
}

export default function JugadorDetallePage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [jugador, setJugador] = useState<any>(null)
  const [historialElo, setHistorialElo] = useState<any[]>([])
  const [partidos, setPartidos] = useState<any[]>([])
  const [externos, setExternos] = useState<any[]>([])
  const [evaluacion, setEvaluacion] = useState<any>(null)
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useParams()
  const jugadorId = params.id as string

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)

      const [{ data: j }, { data: h }, { data: e }] = await Promise.all([
        supabase.from('jugadores').select('*').eq('id', jugadorId).single(),
        supabase.from('historial_elo').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: true }),
        supabase.from('torneos_externos').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: false })
      ])
      setJugador(j)
      setHistorialElo(h || [])
      setExternos(e || [])

      // Partidos
      const [{ data: pa }, { data: pb }] = await Promise.all([
        supabase.from('torneo_partidos').select('*,torneos(nombre)').eq('jugador_a', jugadorId).not('ganador', 'is', null),
        supabase.from('torneo_partidos').select('*,torneos(nombre)').eq('jugador_b', jugadorId).not('ganador', 'is', null)
      ])
      setPartidos([...(pa||[]), ...(pb||[])])

      // Evaluación trimestral
      const trimestre = `Q${Math.ceil((new Date().getMonth()+1)/3)}-${new Date().getFullYear()}`
      const { data: ev } = await supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', jugadorId).eq('periodo_trimestre', trimestre).single()
      setEvaluacion(ev)

      setLoading(false)
    }
    cargar()
  }, [jugadorId])

  const esAdmin = perfil?.rol === 'admin'
  const esProfesor = perfil?.rol === 'profesor'
  const esPropio = perfil?.jugador_id === jugadorId
  const puedeVerTodo = esAdmin || esProfesor || esPropio

  const victorias = partidos.filter(p => p.ganador === jugadorId).length
  const derrotas = partidos.filter(p => p.ganador !== jugadorId).length

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
      {/* Botón volver */}
      <button onClick={() => router.back()} style={{ background:'transparent', border:'1px solid #1e2030', borderRadius:8, padding:'6px 14px', color:'#8890a4', fontSize:13, cursor:'pointer', marginBottom:20 }}>
        ← Volver
      </button>

      {/* Header jugador */}
      <div style={{ background:'linear-gradient(135deg,#1e1b4b,#14161f)', border:'1px solid #1e2030', borderRadius:16, padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#6c63ff,#a78bfa)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'white', flexShrink:0 }}>
            {iniciales}
          </div>
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:'#fff' }}>{jugador.nombre}</div>
            <div style={{ fontSize:12, color:'#6c7280', marginTop:2 }}>{jugador.categoria}</div>
          </div>
          {esAdmin && (
            <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
              <button style={{ background:'#1e1b4b', color:'#a78bfa', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>✏️ Editar</button>
              <button style={{ background: jugador.estado==='activo'?'#f8717122':'#34d39922', color: jugador.estado==='activo'?'#f87171':'#34d399', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>
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
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#0a0c12', borderRadius:10, padding:4, marginBottom:16 }}>
        {['📊 Competencia', ...(puedeVerTodo ? ['📝 Feedback'] : [])].map((t, i) => (
          <div key={i} onClick={() => setTab(i)} style={{ flex:1, padding:'8px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:500, background: tab===i?'#14161f':'transparent', color: tab===i?'#a78bfa':'#6c7280', transition:'all 0.15s' }}>
            {t}
          </div>
        ))}
      </div>

      {/* Tab Competencia */}
      {tab === 0 && (
        <div>
          {/* Historial ELO */}
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Curva de ELO</div>
            {historialElo.length === 0 ? (
              <div style={{ textAlign:'center', padding:20 }}>
                <div style={{ fontSize:13, color:'#6c7280' }}>ELO inicial: <strong style={{ color:'#a78bfa' }}>{jugador.elo}</strong></div>
                <div style={{ fontSize:12, color:'#4b5063', marginTop:6 }}>El gráfico se completará con los torneos jugados</div>
              </div>
            ) : historialElo.map((h, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #1a1d2e' }}>
                <div>
                  <div style={{ fontSize:12, color:'#c8cfe0' }}>{h.fecha}</div>
                  <div style={{ fontSize:11, color:'#6c7280' }}>{h.posicion || '—'}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#a78bfa', fontFamily:'monospace' }}>{h.elo_despues}</div>
                  <div style={{ fontSize:11, color: (h.elo_despues - h.elo_antes) >= 0 ? '#34d399' : '#f87171' }}>
                    {(h.elo_despues - h.elo_antes) >= 0 ? '+' : ''}{h.elo_despues - h.elo_antes}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Partidos */}
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>Historial de partidos</div>
            {partidos.length === 0 ? (
              <div style={{ padding:30, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin partidos registrados</div>
            ) : partidos.slice(0,10).map(p => {
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
            })}
          </div>

          {/* Torneos externos */}
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>Torneos externos</div>
            {externos.length === 0 ? (
              <div style={{ padding:30, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin torneos externos</div>
            ) : externos.map(t => (
              <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #1e2030' }}>
                <div>
                  <div style={{ fontSize:13, color:'#c8cfe0' }}>{t.nombre_club}</div>
                  <div style={{ fontSize:11, color:'#6c7280' }}>{t.fecha} · {t.categoria}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#a78bfa', fontFamily:'monospace' }}>+{t.puntos_elo}</div>
                  <div style={{ fontSize:10, color:'#6c7280' }}>{POSICION_LABEL[t.posicion] || t.posicion}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Feedback */}
      {tab === 1 && puedeVerTodo && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20 }}>
          {evaluacion?.feedback_profesor ? (
            <>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:8 }}>Informe del entrenador</div>
              <div style={{ fontSize:13, color:'#c8cfe0', lineHeight:1.6, marginBottom:16 }}>{evaluacion.feedback_profesor}</div>
              {evaluacion.meta_proximo_periodo && (
                <div style={{ background:'#1e1b4b', borderRadius:10, padding:14, marginBottom:16 }}>
                  <div style={{ fontSize:11, color:'#a78bfa', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>Meta del próximo período</div>
                  <div style={{ fontSize:13, color:'#c8cfe0', lineHeight:1.6 }}>{evaluacion.meta_proximo_periodo}</div>
                </div>
              )}
              {esPropio && (
                evaluacion.firmado_alumno
                  ? <div style={{ background:'#052e16', color:'#34d399', padding:'10px 16px', borderRadius:10, fontSize:13, textAlign:'center' }}>✅ Compromiso aceptado</div>
                  : <button onClick={async () => {
                      await supabase.from('evaluaciones_trimestrales').update({ firmado_alumno: true }).eq('id', evaluacion.id)
                      setEvaluacion({ ...evaluacion, firmado_alumno: true })
                    }} style={{ width:'100%', padding:14, background:'linear-gradient(135deg,#6c63ff,#a78bfa)', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
                      ✍️ Aceptar compromiso del trimestre
                    </button>
              )}
            </>
          ) : (
            <div style={{ textAlign:'center', padding:30 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📝</div>
              <div style={{ fontSize:13, color:'#6c7280' }}>Sin feedback registrado aún</div>
            </div>
          )}

          {/* Formulario para profesor/admin */}
          {(esAdmin || esProfesor) && (
            <div style={{ marginTop:20, borderTop:'1px solid #1e2030', paddingTop:20 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Agregar feedback</div>
              <textarea
                defaultValue={evaluacion?.feedback_profesor || ''}
                id="fb-feedback"
                style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none', resize:'vertical', minHeight:80, marginBottom:10 }}
                placeholder="Diagnóstico técnico y desarrollo del alumno..."
              />
              <textarea
                defaultValue={evaluacion?.meta_proximo_periodo || ''}
                id="fb-meta"
                style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none', resize:'vertical', minHeight:60, marginBottom:12 }}
                placeholder="Metas para el próximo período..."
              />
              <button style={{ width:'100%', padding:11, background:'#6c63ff', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Guardar feedback
              </button>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
