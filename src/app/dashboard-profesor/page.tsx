'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { trimestreActual } from '@/lib/domain/trimestre'
import WhatsAppBtn from '@/components/WhatsAppBtn'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

export default function DashboardProfesorPage() {
  const { perfil, loading: authLoading } = usePerfil()
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

  const hoyISO = hoy.toISOString().slice(0, 10)
  const diaSemana = hoy.getDay()
  const diasHastaDom = diaSemana === 0 ? 0 : 7 - diaSemana
  const domingo = new Date(hoy)
  domingo.setDate(hoy.getDate() + diasHastaDom)
  const domingoISO = domingo.toISOString().slice(0, 10)
  const cincoDiasAtras = new Date(hoy)
  cincoDiasAtras.setDate(hoy.getDate() - 5)
  const cincoDiasAtrasISO = cincoDiasAtras.toISOString().slice(0, 10)

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      if (perfil.rol !== 'admin' && perfil.rol !== 'profesor') { router.push('/dashboard'); return }
      if (perfil.club_id) {
        const trimestre = trimestreActual(hoy)
        const [{ data: jugadores }, { data: clasesHoy }, { data: evals }, { data: asist5 }] = await Promise.all([
          supabase.from('jugadores').select('id,nombre,telefono,categoria').eq('club_id', perfil.club_id).eq('estado', 'activo').or('es_externo.is.null,es_externo.eq.false'),
          supabase.from('clases').select('id,contenido,fecha,hora_inicio,hora_fin,grupo,publicada,profesor_id').eq('club_id', perfil.club_id).gte('fecha', hoyISO).lte('fecha', domingoISO).order('fecha').order('hora_inicio'),
          supabase.from('evaluaciones_trimestrales').select('jugador_id').eq('club_id', perfil.club_id).eq('periodo_trimestre', trimestre),
          supabase.from('asistencia').select('jugador_id').eq('club_id', perfil.club_id).gte('fecha', cincoDiasAtrasISO),
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
      setLoading(false)
    }
    void cargar()
  }, [authLoading, cincoDiasAtrasISO, domingoISO, hoyISO, perfil, router])

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:20, fontWeight:600, color: text, marginBottom:4 }}>
          {hoy.getHours() < 12 ? 'Buenos días' : hoy.getHours() < 20 ? 'Buenas tardes' : 'Buenas noches'}, {perfil?.nombre?.split(' ')[0] || 'Profesor'}
        </div>
        <div style={{ fontSize:13, color: muted }}>
          {diasSemana[hoy.getDay()]} {hoy.getDate()} de {meses[hoy.getMonth()]} {hoy.getFullYear()}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14, marginBottom:16 }}>
        <div style={{ background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:24 }}>👥</div>
          <div style={{ fontSize:28, fontWeight:700, color:'#3730a3', fontFamily:'monospace', margin:'8px 0 4px' }}>{totalAlumnos}</div>
          <div style={{ fontSize:12, color:'#3730a3' }}>Mis alumnos</div>
        </div>
        <div style={{ background: evalPendientes > 0 ? '#fffbeb' : '#f0fdf4', border:`1px solid ${evalPendientes > 0 ? '#fde68a' : '#bbf7d0'}`, borderRadius:14, padding:18 }}>
          <div style={{ fontSize:24 }}>📋</div>
          <div style={{ fontSize:28, fontWeight:700, color: evalPendientes > 0 ? '#d97706' : '#16a34a', fontFamily:'monospace', margin:'8px 0 4px' }}>{evalPendientes}</div>
          <div style={{ fontSize:12, color: evalPendientes > 0 ? '#d97706' : '#16a34a' }}>Eval. pendientes</div>
        </div>
      </div>

      {/* Clases de la semana */}
      <div style={{ ...card, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.5px' }}>Clases esta semana</div>
        {clases.length === 0
          ? <p style={{ fontSize:13, color: muted, textAlign:'center', padding:'16px 0' }}>Sin clases programadas</p>
          : (() => {
              const porFecha: Record<string, any[]> = {}
              clases.forEach(c => { const f = c.fecha || ''; if (!porFecha[f]) porFecha[f] = []; porFecha[f].push(c) })
              return Object.keys(porFecha).sort().map(fecha => {
                const d = new Date(fecha + 'T00:00:00')
                const esHoy = fecha === hoyISO
                return (
                  <div key={fecha} style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color: esHoy ? '#4f46e5' : muted, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                      {diasSemana[d.getDay()]} {d.getDate()}
                      {esHoy && <span style={{ background:'#ede9fe', color:'#3730a3', padding:'1px 6px', borderRadius:10, fontSize:9, fontWeight:700 }}>HOY</span>}
                    </div>
                    {porFecha[fecha].map(c => (
                      <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'#f4f7fa', borderRadius:10, marginBottom:6 }}>
                        <div style={{ background:'#ede9fe', color:'#3730a3', padding:'6px 10px', borderRadius:8, fontSize:11, fontWeight:600, minWidth:80, textAlign:'center', flexShrink:0 }}>
                          {c.hora_inicio?.slice(0,5) || '—'}<br/>
                          <span style={{ fontSize:10, color: muted, fontWeight:400 }}>{c.hora_fin?.slice(0,5) || ''}</span>
                        </div>
                        <div>
                          <div style={{ fontSize:13, color: text, fontWeight:600 }}>{c.contenido || 'Clase'}</div>
                          <div style={{ fontSize:11, color: muted }}>{c.grupo || 'Grupo general'}</div>
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
      <div style={{ ...card, padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.5px' }}>Alertas</div>
        {alertas.length === 0
          ? <p style={{ fontSize:13, color:'#16a34a', padding:'8px 0' }}>✓ Sin alertas pendientes</p>
          : alertas.map(a => (
            <div key={a.key} onClick={() => { setDdOpen(a.key); setDdData(a.data) }}
              style={{ display:'flex', gap:10, padding:12, background: a.tipo==='warning' ? '#fffbeb' : '#fef2f2', borderRadius:10, marginBottom:8, cursor:'pointer', border:`1px solid ${a.tipo==='warning' ? '#fde68a' : '#fecaca'}` }}>
              <span style={{ fontSize:18 }}>{a.tipo==='warning' ? '⚠️' : '🔴'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color: a.tipo==='warning' ? '#d97706' : '#dc2626' }}>{a.msg}</div>
                <div style={{ fontSize:11, color: muted, marginTop:2 }}>Toca para ver detalle →</div>
              </div>
            </div>
          ))
        }
      </div>

      {/* Modal detalle alerta */}
      {ddOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:24, width:'100%', maxWidth:480, maxHeight:'80vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:15, fontWeight:600, color: text }}>
                {ddOpen === 'eval' ? '⚠️ Sin evaluación trimestral' : '🔴 Sin asistir (últimos 5 días)'}
              </div>
              <button onClick={() => setDdOpen(null)} style={{ background:'transparent', border:'none', color: muted, cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            {ddData.map((j: any) => (
              <div key={j.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#3730a3,#4f46e5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'white', flexShrink:0 }}>
                  {j.nombre?.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color: text, fontWeight:500 }}>{j.nombre}</div>
                  <div style={{ fontSize:11, color: muted }}>{j.categoria}</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {j.telefono && <WhatsAppBtn href={`https://wa.me/${j.telefono.replace(/[^0-9]/g,'')}`} variant="compact" />}
                  {ddOpen === 'eval' && <button onClick={() => { setDdOpen(null); router.push(`/jugadores/${j.id}`) }} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Evaluar</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
