'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const tiposEvento = ['entrenamiento','torneo','feriado','pago','otro']
const coloresEvento: Record<string, string> = {
  entrenamiento:'#16a34a', torneo:'#4f46e5', feriado:'#dc2626', pago:'#d97706', otro:'#64748b', clase:'#f43f5e'
}

export default function CalendarioPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [mes, setMes] = useState(new Date().getMonth())
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [eventos, setEventos] = useState<any[]>([])
  const [clases, setClases] = useState<any[]>([])
  const [torneos, setTorneos] = useState<any[]>([])
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)
  const [modalEvento, setModalEvento] = useState(false)
  const [reservasJugador, setReservasJugador] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({ titulo:'', tipo:'entrenamiento', horaInicio:'', horaFin:'', descripcion:'' })
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [reservaLoading, setReservaLoading] = useState<string | null>(null)
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  const cargarMes = useCallback(async () => {
    if (!clubId) return
    const inicio = new Date(anio, mes, 1).toISOString().slice(0,10)
    const fin = new Date(anio, mes+1, 0).toISOString().slice(0,10)
    const [{ data: ev, error: evError }, { data: cl, error: clError }, { data: tr, error: trError }] = await Promise.all([
      supabase.from('eventos').select('*').eq('club_id', clubId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin),
      supabase.from('clases').select('*,profesores(nombre,especialidad)').eq('club_id', clubId).eq('publicada', true).gte('fecha', inicio).lte('fecha', fin),
      supabase.from('torneos').select('id,nombre,estado,fase,fecha_inicio').eq('club_id', clubId).neq('estado', 'archivado').gte('fecha_inicio', inicio).lte('fecha_inicio', fin)
    ])
    if (evError || clError || trError) {
      setMensaje({ tipo: 'error', texto: evError?.message || clError?.message || trError?.message || 'No fue posible cargar el calendario' })
      return
    }
    setEventos(ev || [])
    setClases(cl || [])
    setTorneos(tr || [])
  }, [anio, clubId, mes])

  const cargarReservasJugador = useCallback(async (jugadorId: string) => {
    const { data, error } = await supabase.from('reservas').select('clase_id').eq('jugador_id', jugadorId).eq('estado', 'confirmado')
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    setReservasJugador(new Set((data || []).map(r => r.clase_id)))
  }, [])
  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
  }, [authLoading, perfil, router])

  useEffect(() => {
    if (!clubId) return
    let activo = true
    const inicio = new Date(anio, mes, 1).toISOString().slice(0,10)
    const fin = new Date(anio, mes+1, 0).toISOString().slice(0,10)

    async function cargar() {
      const [{ data: ev, error: evError }, { data: cl, error: clError }, { data: tr, error: trError }] = await Promise.all([
        supabase.from('eventos').select('*').eq('club_id', clubId!).gte('fecha_inicio', inicio).lte('fecha_inicio', fin),
        supabase.from('clases').select('*,profesores(nombre,especialidad)').eq('club_id', clubId!).eq('publicada', true).gte('fecha', inicio).lte('fecha', fin),
        supabase.from('torneos').select('id,nombre,estado,fase,fecha_inicio').eq('club_id', clubId!).neq('estado', 'archivado').gte('fecha_inicio', inicio).lte('fecha_inicio', fin)
      ])
      if (!activo) return
      if (evError || clError || trError) {
        setMensaje({ tipo: 'error', texto: evError?.message || clError?.message || trError?.message || 'No fue posible cargar el calendario' })
        return
      }
      setEventos(ev || [])
      setClases(cl || [])
      setTorneos(tr || [])
    }

    void cargar()
    return () => { activo = false }
  }, [anio, clubId, mes])

  useEffect(() => {
    if (!clubId) return
    const recargar = () => {
      void cargarMes()
      if (perfil?.jugador_id) void cargarReservasJugador(perfil.jugador_id)
    }
    const canal = supabase
      .channel(`calendario-${clubId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clases' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneos' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, recargar)
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [cargarMes, cargarReservasJugador, clubId, perfil?.jugador_id])

  useEffect(() => {
    const jugadorId = perfil?.jugador_id
    if (!jugadorId) return
    let activo = true

    async function cargar() {
      const { data, error } = await supabase.from('reservas').select('clase_id').eq('jugador_id', jugadorId!).eq('estado', 'confirmado')
      if (!activo) return
      if (error) {
        setMensaje({ tipo: 'error', texto: error.message })
        return
      }
      setReservasJugador(new Set((data || []).map(r => r.clase_id)))
    }

    void cargar()
    return () => { activo = false }
  }, [perfil?.jugador_id])

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
    const { error } = await supabase.from('eventos').insert({
      club_id: clubId, titulo: form.titulo, tipo: form.tipo,
      fecha_inicio: diaSeleccionado, hora_inicio: form.horaInicio || null,
      hora_fin: form.horaFin || null, descripcion: form.descripcion || null
    })
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    setModalEvento(false)
    setForm({ titulo:'', tipo:'entrenamiento', horaInicio:'', horaFin:'', descripcion:'' })
    cargarMes()
  }

  async function eliminarEvento(id: string) {
    if (!confirm('¿Eliminar este evento?')) return
    const { error } = await supabase.from('eventos').delete().eq('id', id)
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      return
    }
    cargarMes()
  }

  async function reservarClase(claseId: string) {
    if (!perfil?.jugador_id) return
    setReservaLoading(claseId)
    setMensaje(null)
    const { error } = await supabase.rpc('cambiar_reserva_clase', { p_clase_id: claseId, p_confirmar: true })
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      setReservaLoading(null)
      return
    }
    cargarReservasJugador(perfil.jugador_id)
    setMensaje({ tipo: 'ok', texto: 'Reserva confirmada' })
    setReservaLoading(null)
  }

  async function cancelarReserva(claseId: string) {
    if (!perfil?.jugador_id) return
    setReservaLoading(claseId)
    setMensaje(null)
    const { error } = await supabase.rpc('cambiar_reserva_clase', { p_clase_id: claseId, p_confirmar: false })
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      setReservaLoading(null)
      return
    }
    cargarReservasJugador(perfil.jugador_id)
    setMensaje({ tipo: 'ok', texto: 'Reserva cancelada' })
    setReservaLoading(null)
  }

  const primerDia = new Date(anio, mes, 1).getDay()
  const diasEnMes = new Date(anio, mes+1, 0).getDate()
  const hoy = new Date().toISOString().slice(0,10)
  const esAdmin = perfil?.rol === 'admin'
  const esJugador = perfil?.rol === 'jugador'
  const puedeEditarEventos = esAdmin || perfil?.rol === 'profesor'

  const diasConItems: Record<string, any[]> = {}
  eventos.forEach(e => {
    const f = e.fecha_inicio?.slice(0,10)
    if (f) { if (!diasConItems[f]) diasConItems[f] = []; diasConItems[f].push({ ...e, tipo_item:'evento' }) }
  })
  clases.forEach(c => {
    const f = c.fecha?.slice(0,10)
    if (f) { if (!diasConItems[f]) diasConItems[f] = []; diasConItems[f].push({ ...c, tipo_item:'clase' }) }
  })
  torneos.forEach(t => {
    const f = t.fecha_inicio?.slice(0,10)
    if (f) { if (!diasConItems[f]) diasConItems[f] = []; diasConItems[f].push({ ...t, tipo_item:'torneo', tipo:'torneo', titulo: t.nombre }) }
  })

  const itemsDelDia = diaSeleccionado ? (diasConItems[diaSeleccionado] || []) : []

  if (authLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => cambiarMes(-1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>◀</button>
          <span style={{ fontSize:18, fontWeight:600, color: text, minWidth:180, textAlign:'center' }}>{mesesN[mes]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>▶</button>
        </div>
      </div>

      {mensaje && (
        <div style={{
          background: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 14,
          color: mensaje.tipo === 'ok' ? '#16a34a' : '#dc2626', fontSize: 13,
        }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns: diaSeleccionado ? '1fr 320px' : '1fr', gap:20 }}>
        {/* Calendario */}
        <div style={{ ...card, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #e2e8f0' }}>
            {diasSemana.map(d => (
              <div key={d} style={{ padding:'10px', textAlign:'center', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase' }}>{d}</div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
            {Array.from({ length: primerDia }).map((_, i) => (
              <div key={`e-${i}`} style={{ minHeight:70, borderRight:'1px solid #f1f5f9', borderBottom:'1px solid #f1f5f9' }} />
            ))}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const dia = i + 1
              const fecha = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
              const esHoy = fecha === hoy
              const items = diasConItems[fecha] || []
              const seleccionado = diaSeleccionado === fecha
              return (
                <div key={dia} onClick={() => setDiaSeleccionado(seleccionado ? null : fecha)}
                  style={{ minHeight:70, padding:6, borderRight:'1px solid #f1f5f9', borderBottom:'1px solid #f1f5f9', cursor:'pointer', background: seleccionado ? '#ede9fe' : 'transparent' }}>
                  <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight: esHoy ? 700 : 400, background: esHoy ? '#4f46e5' : 'transparent', color: esHoy ? 'white' : seleccionado ? '#3730a3' : text, marginBottom:4 }}>
                    {dia}
                  </div>
                  {items.slice(0,2).map((item, idx) => (
                    <div key={idx} style={{ fontSize:9, padding:'1px 4px', borderRadius:3, marginBottom:2, background: (coloresEvento[item.tipo_item === 'clase' ? 'clase' : item.tipo] || '#64748b') + '22', color: coloresEvento[item.tipo_item === 'clase' ? 'clase' : item.tipo] || '#64748b', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
                      {item.tipo_item === 'clase' ? item.contenido : item.titulo}
                    </div>
                  ))}
                  {items.length > 2 && <div style={{ fontSize:9, color: hint }}>+{items.length-2}</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Panel día */}
        {diaSeleccionado && (
          <div style={{ ...card, padding:16, alignSelf:'start' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text }}>
                {new Date(diaSeleccionado+'T12:00:00').toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' })}
              </div>
              <button onClick={() => setDiaSeleccionado(null)} style={{ background:'transparent', border:'none', color: muted, cursor:'pointer', fontSize:18 }}>✕</button>
            </div>

            {itemsDelDia.filter(i => i.tipo_item === 'clase').map((c, i) => (
              <div key={i} style={{ background:'#f4f7fa', borderRadius:10, padding:12, marginBottom:10, borderLeft:'3px solid #f43f5e' }}>
                <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:4 }}>🏓 {c.contenido}</div>
                <div style={{ fontSize:11, color: muted, marginBottom:8 }}>
                  {c.hora_inicio?.slice(0,5)}{c.hora_fin ? ' - '+c.hora_fin.slice(0,5) : ''}
                </div>
                {esJugador && (
                  reservasJugador.has(c.id)
                    ? <button onClick={() => cancelarReserva(c.id)} disabled={reservaLoading === c.id} style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:6, padding:'5px 12px', fontSize:11, cursor: reservaLoading === c.id ? 'not-allowed' : 'pointer', width:'100%', opacity: reservaLoading === c.id ? 0.6 : 1 }}>{reservaLoading === c.id ? 'Guardando...' : '✕ Cancelar reserva'}</button>
                    : <button onClick={() => reservarClase(c.id)} disabled={reservaLoading === c.id} style={{ background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:6, padding:'5px 12px', fontSize:11, cursor: reservaLoading === c.id ? 'not-allowed' : 'pointer', width:'100%', opacity: reservaLoading === c.id ? 0.6 : 1 }}>{reservaLoading === c.id ? 'Guardando...' : '✓ Voy a ir'}</button>
                )}
              </div>
            ))}

            {itemsDelDia.filter(i => i.tipo_item === 'evento').map((ev, i) => (
              <div key={i} style={{ background:'#f4f7fa', borderRadius:10, padding:12, marginBottom:10, borderLeft:`3px solid ${coloresEvento[ev.tipo] || '#64748b'}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color: text }}>{ev.titulo}</div>
                    <div style={{ fontSize:11, color: muted, marginTop:2 }}>
                      {ev.hora_inicio?.slice(0,5)}{ev.hora_fin ? ' - '+ev.hora_fin.slice(0,5) : ''}{ev.hora_inicio ? ' · ' : ''}{ev.tipo}
                    </div>
                    {ev.descripcion && <div style={{ fontSize:11, color: muted, marginTop:4 }}>{ev.descripcion}</div>}
                  </div>
                  {puedeEditarEventos && <button onClick={() => eliminarEvento(ev.id)} style={{ background:'transparent', border:'none', color:'#dc2626', cursor:'pointer', fontSize:14 }}>✕</button>}
                </div>
              </div>
            ))}

            {itemsDelDia.filter(i => i.tipo_item === 'torneo').map((t, i) => (
              <div key={i} onClick={() => router.push(`/torneos/${t.id}`)} style={{ background:'#f4f7fa', borderRadius:10, padding:12, marginBottom:10, borderLeft:'3px solid #4f46e5', cursor:'pointer' }}>
                <div style={{ fontSize:13, fontWeight:600, color: text }}>🏆 {t.nombre}</div>
                <div style={{ fontSize:11, color: muted, marginTop:2 }}>
                  Torneo · {t.fase || t.estado || 'programado'}
                </div>
                <div style={{ fontSize:11, color:'#4f46e5', marginTop:6, fontWeight:600 }}>Ver torneo →</div>
              </div>
            ))}

            {itemsDelDia.length === 0 && (
              <p style={{ fontSize:13, color: hint, textAlign:'center', padding:'20px 0' }}>Sin eventos este día</p>
            )}

            {puedeEditarEventos && (
              <button onClick={() => setModalEvento(true)} style={{ width:'100%', padding:10, background:'#f43f5e', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', marginTop:8 }}>
                + Agregar evento
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal nuevo evento */}
      {modalEvento && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:400, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:20 }}>
              Nuevo evento — {diaSeleccionado && new Date(diaSeleccionado+'T12:00:00').toLocaleDateString('es-CL')}
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Título</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                placeholder="Nombre del evento" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Tipo</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {tiposEvento.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Hora inicio</label>
                <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="time" value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Hora fin</label>
                <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="time" value={form.horaFin} onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Descripción (opcional)</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                placeholder="Detalles del evento" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalEvento(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={agregarEvento} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
