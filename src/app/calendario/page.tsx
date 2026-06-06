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
const tiposEvento = ['entrenamiento','torneo','feriado','pago','otro']
const coloresEvento: Record<string, string> = {
  entrenamiento:'#34d399', torneo:'#a78bfa', feriado:'#f87171', pago:'#fbbf24', otro:'#8890a4', clase:'#6c63ff'
}

export default function CalendarioPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clubId, setClubId] = useState<string | null>(null)
  const [mes, setMes] = useState(new Date().getMonth())
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [eventos, setEventos] = useState<any[]>([])
  const [clases, setClases] = useState<any[]>([])
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalEvento, setModalEvento] = useState(false)
  const [reservasJugador, setReservasJugador] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({ titulo:'', tipo:'entrenamiento', horaInicio:'', horaFin:'', descripcion:'' })
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

  async function cargarReservasJugador(jugadorId: string) {
    const { data } = await supabase.from('reservas').select('clase_id').eq('jugador_id', jugadorId).eq('estado', 'confirmado')
    setReservasJugador(new Set((data || []).map((r: any) => r.clase_id)))
  }

  useEffect(() => {
    if (perfil?.jugador_id) cargarReservasJugador(perfil.jugador_id)
  }, [perfil])

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 11) { nuevoMes = 0; nuevoAnio++ }
    if (nuevoMes < 0) { nuevoMes = 11; nuevoAnio-- }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  async function agregarEvento() {
    if (!form.titulo || !diaSeleccionado) return
    await supabase.from('eventos').insert({
      club_id: clubId, titulo: form.titulo, tipo: form.tipo,
      fecha_inicio: diaSeleccionado, hora_inicio: form.horaInicio || null,
      hora_fin: form.horaFin || null, descripcion: form.descripcion || null
    })
    setModalEvento(false)
    setForm({ titulo:'', tipo:'entrenamiento', horaInicio:'', horaFin:'', descripcion:'' })
    cargarMes()
  }

  async function eliminarEvento(id: string) {
    if (!confirm('¿Eliminar este evento?')) return
    await supabase.from('eventos').delete().eq('id', id)
    cargarMes()
  }

  async function reservarClase(claseId: string) {
    if (!perfil?.jugador_id) return
    const { data: jug } = await supabase.from('jugadores').select('sesiones_usadas,sesiones_limite').eq('id', perfil.jugador_id).single()
    if (jug && jug.sesiones_usadas >= jug.sesiones_limite) { alert('No tienes sesiones disponibles este mes'); return }
    await supabase.from('reservas').insert({ clase_id: claseId, jugador_id: perfil.jugador_id })
    cargarReservasJugador(perfil.jugador_id)
  }

  async function cancelarReserva(claseId: string) {
    if (!perfil?.jugador_id) return
    await supabase.from('reservas').update({ estado:'cancelado' }).eq('clase_id', claseId).eq('jugador_id', perfil.jugador_id)
    cargarReservasJugador(perfil.jugador_id)
  }

  const primerDia = new Date(anio, mes, 1).getDay()
  const diasEnMes = new Date(anio, mes+1, 0).getDate()
  const hoy = new Date().toISOString().slice(0,10)
  const esAdmin = perfil?.rol === 'admin'
  const esJugador = perfil?.rol === 'jugador'

  const diasConItems: Record<string, any[]> = {}
  eventos.forEach(e => {
    const f = e.fecha_inicio?.slice(0,10)
    if (f) { if (!diasConItems[f]) diasConItems[f] = []; diasConItems[f].push({ ...e, tipo_item:'evento' }) }
  })
  clases.forEach(c => {
    const f = c.fecha?.slice(0,10)
    if (f) { if (!diasConItems[f]) diasConItems[f] = []; diasConItems[f].push({ ...c, tipo_item:'clase' }) }
  })

  const itemsDelDia = diaSeleccionado ? (diasConItems[diaSeleccionado] || []) : []

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
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #1e2030' }}>
            {diasSemana.map(d => (
              <div key={d} style={{ padding:'10px', textAlign:'center', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase' }}>{d}</div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
            {Array.from({ length: primerDia }).map((_, i) => (
              <div key={`e-${i}`} style={{ minHeight:70, borderRight:'1px solid #1e2030', borderBottom:'1px solid #1e2030' }} />
            ))}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const dia = i + 1
              const fecha = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
              const esHoy = fecha === hoy
              const items = diasConItems[fecha] || []
              const seleccionado = diaSeleccionado === fecha
              return (
                <div key={dia} onClick={() => setDiaSeleccionado(seleccionado ? null : fecha)}
                  style={{ minHeight:70, padding:6, borderRight:'1px solid #1e2030', borderBottom:'1px solid #1e2030', cursor:'pointer', background: seleccionado ? '#1e1b4b' : 'transparent' }}>
                  <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight: esHoy ? 700 : 400, background: esHoy ? '#6c63ff' : 'transparent', color: esHoy ? 'white' : seleccionado ? '#a78bfa' : '#c8cfe0', marginBottom:4 }}>
                    {dia}
                  </div>
                  {items.slice(0,2).map((item, idx) => (
                    <div key={idx} style={{ fontSize:9, padding:'1px 4px', borderRadius:3, marginBottom:2, background: (coloresEvento[item.tipo_item === 'clase' ? 'clase' : item.tipo] || '#8890a4') + '44', color: coloresEvento[item.tipo_item === 'clase' ? 'clase' : item.tipo] || '#8890a4', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
                      {item.tipo_item === 'clase' ? '🏓 ' + item.contenido : item.titulo}
                    </div>
                  ))}
                  {items.length > 2 && <div style={{ fontSize:9, color:'#6c7280' }}>+{items.length-2}</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Panel día */}
        {diaSeleccionado && (
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, alignSelf:'start' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>
                {new Date(diaSeleccionado+'T12:00:00').toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' })}
              </div>
              <button onClick={() => setDiaSeleccionado(null)} style={{ background:'transparent', border:'none', color:'#6c7280', cursor:'pointer', fontSize:18 }}>✕</button>
            </div>

            {/* Clases publicadas */}
            {itemsDelDia.filter(i => i.tipo_item === 'clase').map((c, i) => (
              <div key={i} style={{ background:'#0a0c12', borderRadius:10, padding:12, marginBottom:10, borderLeft:'3px solid #6c63ff' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#c8cfe0', marginBottom:4 }}>🏓 {c.contenido}</div>
                <div style={{ fontSize:11, color:'#6c7280', marginBottom:8 }}>
                  {c.hora_inicio?.slice(0,5)}{c.hora_fin ? ' - '+c.hora_fin.slice(0,5) : ''}
                </div>
                {esJugador && (
                  reservasJugador.has(c.id)
                    ? <button onClick={() => cancelarReserva(c.id)} style={{ background:'#2d0a0a', color:'#f87171', border:'none', borderRadius:6, padding:'5px 12px', fontSize:11, cursor:'pointer', width:'100%' }}>✕ Cancelar reserva</button>
                    : <button onClick={() => reservarClase(c.id)} style={{ background:'#1e1b4b', color:'#a78bfa', border:'none', borderRadius:6, padding:'5px 12px', fontSize:11, cursor:'pointer', width:'100%' }}>✓ Voy a ir</button>
                )}
              </div>
            ))}

            {/* Eventos */}
            {itemsDelDia.filter(i => i.tipo_item === 'evento').map((ev, i) => (
              <div key={i} style={{ background:'#0a0c12', borderRadius:10, padding:12, marginBottom:10, borderLeft:`3px solid ${coloresEvento[ev.tipo] || '#8890a4'}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#c8cfe0' }}>{ev.titulo}</div>
                    <div style={{ fontSize:11, color:'#6c7280', marginTop:2 }}>
                      {ev.hora_inicio?.slice(0,5)}{ev.hora_fin ? ' - '+ev.hora_fin.slice(0,5) : ''}{ev.hora_inicio ? ' · ' : ''}{ev.tipo}
                    </div>
                    {ev.descripcion && <div style={{ fontSize:11, color:'#8890a4', marginTop:4 }}>{ev.descripcion}</div>}
                  </div>
                  {esAdmin && <button onClick={() => eliminarEvento(ev.id)} style={{ background:'transparent', border:'none', color:'#f87171', cursor:'pointer', fontSize:14 }}>✕</button>}
                </div>
              </div>
            ))}

            {itemsDelDia.length === 0 && (
              <p style={{ fontSize:13, color:'#6c7280', textAlign:'center', padding:'20px 0' }}>Sin eventos este día</p>
            )}

            {esAdmin && (
              <button onClick={() => setModalEvento(true)} style={{ width:'100%', padding:10, background:'#6c63ff', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', marginTop:8 }}>
                + Agregar evento
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal nuevo evento */}
      {modalEvento && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:28, width:'100%', maxWidth:400 }}>
            <div style={{ fontSize:17, fontWeight:600, color:'#fff', marginBottom:20 }}>
              Nuevo evento — {diaSeleccionado && new Date(diaSeleccionado+'T12:00:00').toLocaleDateString('es-CL')}
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Título</label>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                placeholder="Nombre del evento" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Tipo</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {tiposEvento.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Hora inicio</label>
                <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                  type="time" value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Hora fin</label>
                <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                  type="time" value={form.horaFin} onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Descripción (opcional)</label>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                placeholder="Detalles del evento" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalEvento(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #1e2030', borderRadius:8, color:'#6c7280', fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={agregarEvento} style={{ flex:1, padding:11, background:'#6c63ff', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
