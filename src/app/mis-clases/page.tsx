'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient()

const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

export default function MisClasesPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clases, setClases] = useState<any[]>([])
  const [profesores, setProfesores] = useState<any[]>([])
  const [reservas, setReservas] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const router = useRouter()

  const hoy = new Date()
  hoy.setHours(0,0,0,0)

  // Calcular inicio y fin de semana
  const inicioSemana = new Date(hoy)
  const diaSemana = hoy.getDay()
  inicioSemana.setDate(hoy.getDate() - diaSemana + semanaOffset * 7)
  const finSemana = new Date(inicioSemana)
  finSemana.setDate(inicioSemana.getDate() + 6)

  const formatFecha = (d: Date) => d.toISOString().slice(0,10)

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (!perfil?.club_id) return
    cargarClases()
  }, [perfil, semanaOffset])

  async function cargarClases() {
    const inicio = formatFecha(inicioSemana)
    const fin = formatFecha(finSemana)

    const [{ data: cl }, { data: pr }] = await Promise.all([
      supabase.from('clases').select('*').eq('club_id', perfil.club_id).eq('publicada', true)
        .gte('fecha', inicio).lte('fecha', fin).order('fecha').order('hora_inicio'),
      supabase.from('profesores').select('*').eq('club_id', perfil.club_id)
    ])

    // Cargar cantidad de confirmaciones por clase
    const clasesConAsistentes = await Promise.all((cl || []).map(async (clase: any) => {
      const { count } = await supabase.from('reservas').select('*', { count:'exact', head:true }).eq('clase_id', clase.id).eq('estado', 'confirmado')
      return { ...clase, _asistentes: count || 0 }
    }))
    setClases(clasesConAsistentes)
    setProfesores(pr || [])

    if (perfil?.jugador_id) {
      const { data: res } = await supabase.from('reservas').select('clase_id').eq('jugador_id', perfil.jugador_id).eq('estado', 'confirmado')
      setReservas(new Set((res || []).map((r: any) => r.clase_id)))
    }
  }

  async function toggleReserva(clase: any) {
    if (!perfil?.jugador_id) return
    const yaReservado = reservas.has(clase.id)

    if (yaReservado) {
      await supabase.from('reservas').update({ estado: 'cancelado' }).eq('clase_id', clase.id).eq('jugador_id', perfil.jugador_id)
      setReservas(prev => { const s = new Set(prev); s.delete(clase.id); return s })
    } else {
      // Verificar sesiones disponibles
      const { data: jug } = await supabase.from('jugadores').select('sesiones_usadas,sesiones_limite').eq('id', perfil.jugador_id).single()
      if (jug && jug.sesiones_usadas >= jug.sesiones_limite) {
        alert('No tienes sesiones disponibles este mes'); return
      }
      await supabase.from('reservas').upsert({ clase_id: clase.id, jugador_id: perfil.jugador_id, estado: 'confirmado' })
      setReservas(prev => new Set([...prev, clase.id]))
    }
  }

  // Agrupar clases por día
  const clasesPorDia: Record<string, any[]> = {}
  clases.forEach(c => {
    const f = c.fecha
    if (!clasesPorDia[f]) clasesPorDia[f] = []
    clasesPorDia[f].push(c)
  })

  // Generar días de la semana
  const diasSemanaFechas = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemana)
    d.setDate(inicioSemana.getDate() + i)
    return d
  })

  const misReservasCount = clases.filter(c => reservas.has(c.id)).length

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:4 }}>Mis clases</h1>
          <p style={{ fontSize:13, color:'#6c7280' }}>
            {misReservasCount > 0 ? `✅ Confirmaste asistencia a ${misReservasCount} clase${misReservasCount>1?'s':''} esta semana` : 'No has confirmado asistencia a ninguna clase esta semana'}
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setSemanaOffset(prev => prev - 1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>◀</button>
          <button onClick={() => setSemanaOffset(0)} style={{ background: semanaOffset===0?'#6c63ff':'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color: semanaOffset===0?'white':'#c8cfe0', cursor:'pointer', fontSize:12 }}>Hoy</button>
          <button onClick={() => setSemanaOffset(prev => prev + 1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>▶</button>
        </div>
      </div>

      {/* Fecha de la semana */}
      <div style={{ fontSize:13, color:'#6c7280', marginBottom:20, textAlign:'center' }}>
        {inicioSemana.toLocaleDateString('es-CL', { day:'numeric', month:'long' })} — {finSemana.toLocaleDateString('es-CL', { day:'numeric', month:'long', year:'numeric' })}
      </div>

      {/* Días de la semana */}
      {diasSemanaFechas.map(dia => {
        const fecha = formatFecha(dia)
        const esHoy = fecha === formatFecha(new Date())
        const esPasado = dia < hoy
        const clasesDelDia = clasesPorDia[fecha] || []

        // Ocultar días pasados sin clases
        if (esPasado && clasesDelDia.length === 0) return null

        return (
          <div key={fecha} style={{ marginBottom:12, opacity: esPasado ? 0.6 : 1 }}>
            {/* Header del día */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background: esHoy ? '#6c63ff' : esPasado ? '#1e2030' : '#14161f', border: esHoy ? 'none' : '1px solid #1e2030', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color: esHoy ? 'white' : '#c8cfe0', flexShrink:0 }}>
                {dia.getDate()}
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color: esHoy ? '#a78bfa' : '#c8cfe0' }}>
                  {diasSemana[dia.getDay()]} {esHoy && '— Hoy'}
                </div>
                {clasesDelDia.length === 0 && <div style={{ fontSize:11, color:'#4b5063' }}>Sin clases</div>}
              </div>
            </div>

            {/* Clases del día */}
            {clasesDelDia.map(clase => {
              const prof = profesores.find(p => p.id === clase.profesor_id)
              const reservado = reservas.has(clase.id)
              return (
                <div key={clase.id} style={{ background:'#14161f', border:`1px solid ${reservado ? '#6c63ff44' : '#1e2030'}`, borderLeft:`3px solid ${reservado ? '#6c63ff' : '#1e2030'}`, borderRadius:10, padding:'12px 16px', marginBottom:8, marginLeft:46 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'#c8cfe0', marginBottom:4 }}>{clase.contenido}</div>
                      <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                        <span style={{ fontSize:12, color:'#6c7280' }}>🕐 {clase.hora_inicio?.slice(0,5)} - {clase.hora_fin?.slice(0,5)}</span>
                        {prof && <span style={{ fontSize:12, color:'#6c7280' }}>👤 {prof.nombre}</span>}
                        {clase.grupo && <span style={{ fontSize:11, background:'#1e1b4b', color:'#a78bfa', padding:'2px 8px', borderRadius:10 }}>{clase.grupo}</span>}
                        {clase._asistentes > 0 && <span style={{ fontSize:11, background:'#34d39922', color:'#34d399', padding:'2px 8px', borderRadius:10 }}>👥 {clase._asistentes} confirman</span>}
                      </div>
                      {prof?.especialidad && <div style={{ fontSize:11, color:'#4b5063', marginTop:4 }}>{prof.especialidad}</div>}
                    </div>
                    {!esPasado && (
                      <button onClick={() => toggleReserva(clase)}
                        style={{ background: reservado ? '#34d39922' : '#0a0c12', color: reservado ? '#34d399' : '#8890a4', border: `1px solid ${reservado ? '#34d39944' : '#1e2030'}`, borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', marginLeft:12 }}>
                        {reservado ? '✓ Asisto' : 'Asisto'}
                      </button>
                    )}
                    {esPasado && reservado && <span style={{ fontSize:11, color:'#34d399', marginLeft:12 }}>✓ Confirmé asistencia</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {Object.keys(clasesPorDia).length === 0 && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:40, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📚</div>
          <div style={{ fontSize:14, color:'#c8cfe0', marginBottom:8 }}>Sin clases esta semana</div>
          <div style={{ fontSize:13, color:'#6c7280' }}>Navega a la semana siguiente para ver próximas clases</div>
        </div>
      )}
    </AppLayout>
  )
}
