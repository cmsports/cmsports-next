'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function CalendarioPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clubId, setClubId] = useState<string | null>(null)
  const [mes, setMes] = useState(new Date().getMonth())
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [eventos, setEventos] = useState<any[]>([])
  const [clases, setClases] = useState<any[]>([])
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      setClubId(p?.club_id)
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (!clubId) return
    cargarMes()
  }, [clubId, mes, anio])

  async function cargarMes() {
    const inicio = new Date(anio, mes, 1).toISOString().slice(0,10)
    const fin = new Date(anio, mes+1, 0).toISOString().slice(0,10)
    const [{ data: ev }, { data: cl }] = await Promise.all([
      supabase.from('eventos').select('*').eq('club_id', clubId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin),
      supabase.from('clases').select('*').eq('club_id', clubId).eq('publicada', true).gte('fecha', inicio).lte('fecha', fin)
    ])
    setEventos(ev || [])
    setClases(cl || [])
  }

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 11) { nuevoMes = 0; nuevoAnio++ }
    if (nuevoMes < 0) { nuevoMes = 11; nuevoAnio-- }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  // Generar días del mes
  const primerDia = new Date(anio, mes, 1).getDay()
  const diasEnMes = new Date(anio, mes+1, 0).getDate()
  const hoy = new Date().toISOString().slice(0,10)

  const diasConEventos: Record<string, any[]> = {}
  eventos.forEach(e => {
    const f = e.fecha_inicio?.slice(0,10)
    if (f) { if (!diasConEventos[f]) diasConEventos[f] = []; diasConEventos[f].push({ ...e, tipo_item:'evento' }) }
  })
  clases.forEach(c => {
    const f = c.fecha?.slice(0,10)
    if (f) { if (!diasConEventos[f]) diasConEventos[f] = []; diasConEventos[f].push({ ...c, tipo_item:'clase' }) }
  })

  const eventosDelDia = diaSeleccionado ? (diasConEventos[diaSeleccionado] || []) : []

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => cambiarMes(-1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>◀</button>
          <span style={{ fontSize:18, fontWeight:700, color:'#fff', minWidth:180, textAlign:'center' }}>{mesesN[mes]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>▶</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: diaSeleccionado ? '1fr 320px' : '1fr', gap:20 }}>
        {/* Calendario */}
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
          {/* Cabecera días */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #1e2030' }}>
            {diasSemana.map(d => (
              <div key={d} style={{ padding:'10px', textAlign:'center', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase' }}>{d}</div>
            ))}
          </div>
          {/* Días */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
            {Array.from({ length: primerDia }).map((_, i) => (
              <div key={`empty-${i}`} style={{ minHeight:70, borderRight:'1px solid #1e2030', borderBottom:'1px solid #1e2030' }} />
            ))}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const dia = i + 1
              const fecha = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
              const esHoy = fecha === hoy
              const items = diasConEventos[fecha] || []
              const seleccionado = diaSeleccionado === fecha
              return (
                <div
                  key={dia}
                  onClick={() => setDiaSeleccionado(seleccionado ? null : fecha)}
                  style={{
                    minHeight:70, padding:6, borderRight:'1px solid #1e2030', borderBottom:'1px solid #1e2030',
                    cursor:'pointer', background: seleccionado ? '#1e1b4b' : 'transparent',
                    transition:'background 0.15s'
                  }}
                >
                  <div style={{
                    width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:13, fontWeight: esHoy ? 700 : 400,
                    background: esHoy ? '#6c63ff' : 'transparent',
                    color: esHoy ? 'white' : seleccionado ? '#a78bfa' : '#c8cfe0',
                    marginBottom:4
                  }}>{dia}</div>
                  {items.slice(0,2).map((item, idx) => (
                    <div key={idx} style={{
                      fontSize:9, padding:'1px 4px', borderRadius:3, marginBottom:2,
                      background: item.tipo_item === 'clase' ? '#6c63ff44' : '#34d39944',
                      color: item.tipo_item === 'clase' ? '#a78bfa' : '#34d399',
                      overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis'
                    }}>
                      {item.tipo_item === 'clase' ? '🏓 ' + item.contenido : item.titulo}
                    </div>
                  ))}
                  {items.length > 2 && <div style={{ fontSize:9, color:'#6c7280' }}>+{items.length-2} más</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Panel detalle día */}
        {diaSeleccionado && (
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, alignSelf:'start' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>
                {new Date(diaSeleccionado+'T12:00:00').toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' })}
              </div>
              <button onClick={() => setDiaSeleccionado(null)} style={{ background:'transparent', border:'none', color:'#6c7280', cursor:'pointer', fontSize:18 }}>✕</button>
            </div>
            {eventosDelDia.length === 0 ? (
              <p style={{ fontSize:13, color:'#6c7280', textAlign:'center', padding:'20px 0' }}>Sin eventos este día</p>
            ) : eventosDelDia.map((item, i) => (
              <div key={i} style={{ background:'#0a0c12', borderRadius:10, padding:12, marginBottom:10, borderLeft:`3px solid ${item.tipo_item==='clase'?'#6c63ff':'#34d399'}` }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#c8cfe0' }}>
                  {item.tipo_item === 'clase' ? '🏓 ' + item.contenido : item.titulo}
                </div>
                {(item.hora_inicio || item.hora_inicio) && (
                  <div style={{ fontSize:11, color:'#6c7280', marginTop:3 }}>
                    🕐 {item.hora_inicio?.slice(0,5)}{item.hora_fin ? ' - ' + item.hora_fin.slice(0,5) : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
