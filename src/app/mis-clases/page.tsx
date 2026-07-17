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

const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

export default function MisClasesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [clases, setClases] = useState<any[]>([])
  const [profesores, setProfesores] = useState<any[]>([])
  const [reservas, setReservas] = useState<Set<string>>(new Set())
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [reservaLoading, setReservaLoading] = useState<string | null>(null)
  const router = useRouter()

  const hoy = new Date()
  hoy.setHours(0,0,0,0)

  const inicioSemana = new Date(hoy)
  const diaSemana = hoy.getDay()
  const diasDesLunes = diaSemana === 0 ? 6 : diaSemana - 1
  inicioSemana.setDate(hoy.getDate() - diasDesLunes + semanaOffset * 7)
  const finSemana = new Date(inicioSemana)
  finSemana.setDate(inicioSemana.getDate() + 6)

  const formatFecha = (d: Date) => d.toISOString().slice(0,10)
  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
  }, [authLoading, perfil, router])

  const cargarClases = useCallback(async () => {
    if (!perfil?.club_id) return
    const fechaBase = new Date()
    fechaBase.setHours(0, 0, 0, 0)
    const distanciaLunes = fechaBase.getDay() === 0 ? 6 : fechaBase.getDay() - 1
    const inicioCarga = new Date(fechaBase)
    inicioCarga.setDate(fechaBase.getDate() - distanciaLunes + semanaOffset * 7)
    const finCarga = new Date(inicioCarga)
    finCarga.setDate(inicioCarga.getDate() + 6)
    const [{ data: cl, error: clasesError }, { data: pr, error: profesoresError }] = await Promise.all([
      supabase.from('clases').select('*').eq('club_id', perfil?.club_id).eq('publicada', true)
        .gte('fecha', formatFecha(inicioCarga)).lte('fecha', formatFecha(finCarga)).order('fecha').order('hora_inicio'),
      supabase.from('profesores').select('*').eq('club_id', perfil?.club_id)
    ])
    if (clasesError || profesoresError) {
      setMensaje({ tipo: 'error', texto: clasesError?.message || profesoresError?.message || 'No fue posible cargar las clases' })
      return
    }

    const { data: conteosData, error: conteosError } = await supabase.rpc('contar_reservas_clases', {
      p_clase_ids: (cl || []).map(clase => clase.id),
    })
    if (conteosError) {
      setMensaje({ tipo: 'error', texto: conteosError.message })
      return
    }
    const conteos = new Map(
      ((conteosData as Array<{ clase_id: string; total: number }> | null) || [])
        .map(fila => [fila.clase_id, Number(fila.total)])
    )
    const clasesConAsistentes = (cl || []).map(clase => ({
      ...clase,
      _asistentes: conteos.get(clase.id) || 0,
    }))
    setClases(clasesConAsistentes)
    setProfesores(pr || [])

    if (perfil?.jugador_id) {
      const { data: res, error } = await supabase.from('reservas').select('clase_id').eq('jugador_id', perfil.jugador_id).eq('estado', 'confirmado')
      if (error) {
        setMensaje({ tipo: 'error', texto: error.message })
        return
      }
      setReservas(new Set((res || []).map(r => r.clase_id)))
    }
  }, [perfil?.club_id, perfil?.jugador_id, semanaOffset])

  useEffect(() => {
    if (!perfil?.club_id) return
    const carga = window.setTimeout(() => { void cargarClases() }, 0)
    return () => window.clearTimeout(carga)
  }, [cargarClases, perfil?.club_id])

  useEffect(() => {
    if (!perfil?.club_id) return
    const canal = supabase
      .channel(`mis-clases-${perfil.club_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'reservas',
      }, () => { void cargarClases() })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'clases',
      }, () => { void cargarClases() })
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [cargarClases, perfil?.club_id])

  async function toggleReserva(clase: any) {
    if (!perfil?.jugador_id) return
    const yaReservado = reservas.has(clase.id)
    setReservaLoading(clase.id)
    setMensaje(null)
    const { error } = await supabase.rpc('cambiar_reserva_clase', {
      p_clase_id: clase.id,
      p_confirmar: !yaReservado,
    })
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message })
      setReservaLoading(null)
      return
    }
    await cargarClases()
    setMensaje({ tipo: 'ok', texto: yaReservado ? 'Reserva cancelada' : 'Reserva confirmada' })
    setReservaLoading(null)
  }

  const clasesPorDia: Record<string, any[]> = {}
  clases.forEach(c => {
    const f = c.fecha
    if (!clasesPorDia[f]) clasesPorDia[f] = []
    clasesPorDia[f].push(c)
  })

  const diasSemanaFechas = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemana)
    d.setDate(inicioSemana.getDate() + i)
    return d
  })

  const misReservasCount = clases.filter(c => reservas.has(c.id)).length

  if (authLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:4 }}>Mis clases</h1>
          <p style={{ fontSize:13, color: muted }}>
            {misReservasCount > 0 ? `Confirmaste asistencia a ${misReservasCount} clase${misReservasCount>1?'s':''} esta semana` : 'No has confirmado asistencia a ninguna clase esta semana'}
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setSemanaOffset(prev => prev - 1)}
            style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', color:'#4f46e5' }}>◀</button>
          <button onClick={() => setSemanaOffset(0)}
            style={{ background: semanaOffset===0 ? '#4f46e5' : '#ffffff', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: semanaOffset===0 ? 'white' : muted, cursor:'pointer', fontSize:12, fontWeight:600, boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
            Hoy
          </button>
          <button onClick={() => setSemanaOffset(prev => prev + 1)}
            style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', color:'#4f46e5' }}>▶</button>
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

      {/* Fecha de la semana */}
      <div style={{ fontSize:13, color: muted, marginBottom:20, textAlign:'center' }}>
        {inicioSemana.toLocaleDateString('es-CL', { day:'numeric', month:'long' })} — {finSemana.toLocaleDateString('es-CL', { day:'numeric', month:'long', year:'numeric' })}
      </div>

      {/* Días de la semana */}
      {diasSemanaFechas.map(dia => {
        const fecha = formatFecha(dia)
        const esHoy = fecha === formatFecha(new Date())
        const esPasado = dia < hoy
        const clasesDelDia = clasesPorDia[fecha] || []

        if (esPasado && clasesDelDia.length === 0) return null

        return (
          <div key={fecha} style={{ marginBottom:12, opacity: esPasado ? 0.6 : 1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background: esHoy ? '#f43f5e' : esPasado ? '#e2e8f0' : '#f1f5f9', border: esHoy ? 'none' : '1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color: esHoy ? 'white' : text, flexShrink:0 }}>
                {dia.getDate()}
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color: esHoy ? '#4f46e5' : text }}>
                  {diasSemana[dia.getDay()]} {esHoy && '— Hoy'}
                </div>
                {clasesDelDia.length === 0 && <div style={{ fontSize:11, color: hint }}>Sin clases</div>}
              </div>
            </div>

            {clasesDelDia.map(clase => {
              const prof = profesores.find(p => p.id === clase.profesor_id)
              const reservado = reservas.has(clase.id)
              return (
                <div key={clase.id} style={{ background:'#ffffff', border:`1px solid ${reservado ? '#c4b5fd' : '#e2e8f0'}`, borderLeft:`3px solid ${reservado ? '#4f46e5' : '#e2e8f0'}`, borderRadius:10, padding:'12px 16px', marginBottom:8, marginLeft:46, boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:4 }}>{clase.contenido}</div>
                      <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                        <span style={{ fontSize:12, color: muted }}>🕐 {clase.hora_inicio?.slice(0,5)} - {clase.hora_fin?.slice(0,5)}</span>
                        {prof && <span style={{ fontSize:12, color: muted }}>👤 {prof.nombre}</span>}
                        {clase.grupo && <span style={{ fontSize:11, background:'#ede9fe', color:'#3730a3', padding:'2px 8px', borderRadius:10 }}>{clase.grupo}</span>}
                        {clase._asistentes > 0 && <span style={{ fontSize:11, background:'#f0fdf4', color:'#16a34a', padding:'2px 8px', borderRadius:10 }}>👥 {clase._asistentes} confirman</span>}
                      </div>
                      {prof?.especialidad && <div style={{ fontSize:11, color: hint, marginTop:4 }}>{prof.especialidad}</div>}
                    </div>
                    {!esPasado && (
                      <button onClick={() => toggleReserva(clase)} disabled={reservaLoading === clase.id}
                        style={{ background: reservado ? '#f0fdf4' : '#f4f7fa', color: reservado ? '#16a34a' : muted, border: `1px solid ${reservado ? '#bbf7d0' : '#e2e8f0'}`, borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor: reservaLoading === clase.id ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', marginLeft:12, opacity: reservaLoading === clase.id ? 0.6 : 1 }}>
                        {reservaLoading === clase.id ? 'Guardando...' : reservado ? '✓ Asisto' : 'Asisto'}
                      </button>
                    )}
                    {esPasado && reservado && <span style={{ fontSize:11, color:'#16a34a', marginLeft:12 }}>✓ Asistí</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {Object.keys(clasesPorDia).length === 0 && (
        <div style={{ ...card, padding:40, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📚</div>
          <div style={{ fontSize:14, color: text, marginBottom:8 }}>Sin clases esta semana</div>
          <div style={{ fontSize:13, color: muted }}>Navega a la semana siguiente para ver próximas clases</div>
        </div>
      )}
    </AppLayout>
  )
}
