'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

interface Notificacion {
  id: string
  tipo: 'clase' | 'torneo' | 'mensualidad' | 'solicitud' | 'aviso'
  titulo: string
  mensaje: string
  fecha: string
  leida: boolean
  color: string
  icono: string
}

export default function CampanaNotificaciones({ perfil }: { perfil: any }) {
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notificacion[]>([])

  const hoy = new Date().toISOString().slice(0,10)
  const en7dias = new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10)
  const hace3dias = new Date(Date.now() - 3*24*60*60*1000).toISOString().slice(0,10)

  useEffect(() => {
    if (!perfil?.club_id) return
    cargarNotificaciones()
  }, [perfil])

  async function cargarNotificaciones() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const notificaciones: Notificacion[] = []
    const rol = perfil?.rol

    if (rol === 'jugador' && perfil?.jugador_id) {
      // 1. Mensualidad pendiente o atrasada
      const mesActual = new Date().getMonth() + 1
      const anioActual = new Date().getFullYear()
      const { data: mens } = await supabase.from('mensualidades')
        .select('*').eq('jugador_id', perfil.jugador_id)
        .eq('mes', mesActual).eq('anio', anioActual).maybeSingle()

      if (mens?.estado === 'pendiente') {
        notificaciones.push({
          id: 'mens-pendiente',
          tipo: 'mensualidad',
          titulo: '💳 Mensualidad pendiente',
          mensaje: `Tu mensualidad de ${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mesActual-1]} está pendiente de pago.`,
          fecha: hoy,
          leida: false,
          color: '#fbbf24',
          icono: '💳'
        })
      } else if (mens?.estado === 'atrasado') {
        notificaciones.push({
          id: 'mens-atrasada',
          tipo: 'mensualidad',
          titulo: '⚠️ Mensualidad atrasada',
          mensaje: `Tienes una mensualidad atrasada. Contáctate con el administrador.`,
          fecha: hoy,
          leida: false,
          color: '#f87171',
          icono: '⚠️'
        })
      }

      // 2. Clases próximas esta semana
      const { data: clases } = await supabase.from('clases')
        .select('*,profesores(nombre)').eq('club_id', perfil.club_id)
        .eq('publicada', true).gte('fecha', hoy).lte('fecha', en7dias)
        .order('fecha').limit(3)

      if (clases?.length) {
        clases.forEach((c: any) => {
          notificaciones.push({
            id: `clase-${c.id}`,
            tipo: 'clase',
            titulo: '📚 Clase próxima',
            mensaje: `${c.contenido} — ${new Date(c.fecha).toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'short' })} ${c.hora_inicio?.slice(0,5)} · ${(c as any).profesores?.nombre || ''}`,
            fecha: c.fecha,
            leida: false,
            color: '#60a5fa',
            icono: '📚'
          })
        })
      }

      // 3. Torneos próximos
      const { data: torneos } = await supabase.from('torneos')
        .select('*').eq('club_id', perfil.club_id)
        .in('estado', ['programado','en_curso']).gte('fecha_inicio', hoy).limit(2)

      if (torneos?.length) {
        torneos.forEach((t: any) => {
          notificaciones.push({
            id: `torneo-${t.id}`,
            tipo: 'torneo',
            titulo: '🎯 Torneo próximo',
            mensaje: `${t.nombre} — ${t.fecha_inicio ? new Date(t.fecha_inicio).toLocaleDateString('es-CL') : 'Fecha por confirmar'}`,
            fecha: t.fecha_inicio || hoy,
            leida: false,
            color: '#a78bfa',
            icono: '🎯'
          })
        })
      }
    }

    if (rol === 'profesor') {
      // 1. Clases del día
      const { data: clasesHoy } = await supabase.from('clases')
        .select('*').eq('club_id', perfil.club_id)
        .eq('publicada', true).eq('fecha', hoy)
        .order('hora_inicio')

      if (clasesHoy?.length) {
        notificaciones.push({
          id: 'clases-hoy',
          tipo: 'clase',
          titulo: `📚 Tienes ${clasesHoy.length} clase${clasesHoy.length>1?'s':''} hoy`,
          mensaje: clasesHoy.map((c:any) => `${c.hora_inicio?.slice(0,5)} ${c.contenido}`).join(' · '),
          fecha: hoy,
          leida: false,
          color: '#60a5fa',
          icono: '📚'
        })
      }

      // 2. Alumnos sin evaluar este trimestre
      const trimestre = Math.ceil((new Date().getMonth()+1)/3)
      const periodo = `Q${trimestre}-${new Date().getFullYear()}`
      const { data: jugadores } = await supabase.from('jugadores')
        .select('id').eq('club_id', perfil.club_id).eq('estado','activo').neq('es_externo',true)
      const { data: evaluados } = await supabase.from('evaluaciones_trimestrales')
        .select('jugador_id').eq('club_id', perfil.club_id).eq('periodo_trimestre', periodo)

      const sinEvaluar = (jugadores?.length || 0) - (evaluados?.length || 0)
      if (sinEvaluar > 0) {
        notificaciones.push({
          id: 'sin-evaluar',
          tipo: 'aviso',
          titulo: '📋 Evaluaciones pendientes',
          mensaje: `${sinEvaluar} alumno${sinEvaluar>1?'s':''} sin evaluación ${periodo}.`,
          fecha: hoy,
          leida: false,
          color: '#fbbf24',
          icono: '📋'
        })
      }

      // 3. Alumnos que confirmaron asistencia hoy
      const { data: clasesConConfirm } = await supabase.from('clases')
        .select('id,contenido,hora_inicio').eq('club_id', perfil.club_id).eq('fecha', hoy)
      
      if (clasesConConfirm?.length) {
        for (const c of clasesConConfirm) {
          const { count } = await supabase.from('reservas')
            .select('*', { count:'exact', head:true }).eq('clase_id', c.id).eq('estado','confirmado')
          if (count && count > 0) {
            notificaciones.push({
              id: `confirm-${c.id}`,
              tipo: 'clase',
              titulo: `👥 ${count} alumno${count>1?'s':''} confirman asistencia`,
              mensaje: `${c.contenido} — ${c.hora_inicio?.slice(0,5)}`,
              fecha: hoy,
              leida: false,
              color: '#34d399',
              icono: '👥'
            })
          }
        }
      }

      // 4. Torneos próximos
      const { data: torneos } = await supabase.from('torneos')
        .select('*').eq('club_id', perfil.club_id)
        .in('estado', ['programado','en_curso']).gte('fecha_inicio', hoy).limit(2)

      if (torneos?.length) {
        torneos.forEach((t: any) => {
          notificaciones.push({
            id: `torneo-${t.id}`,
            tipo: 'torneo',
            titulo: '🎯 Torneo próximo',
            mensaje: `${t.nombre} — ${t.fecha_inicio ? new Date(t.fecha_inicio).toLocaleDateString('es-CL') : 'Fecha por confirmar'}`,
            fecha: t.fecha_inicio || hoy,
            leida: false,
            color: '#a78bfa',
            icono: '🎯'
          })
        })
      }
    }

    // Ordenar por fecha
    notificaciones.sort((a,b) => a.fecha > b.fecha ? 1 : -1)
    setNotifs(notificaciones)
  }

  const sinLeer = notifs.filter(n => !n.leida).length

  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(!open)}
        style={{ position:'relative', background:'#14161f', border:'1px solid #1e2030', borderRadius:10, padding:'7px 12px', color:'#c8cfe0', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:18 }}>
        🔔
        {sinLeer > 0 && (
          <span style={{ position:'absolute', top:-4, right:-4, background:'#f87171', color:'white', borderRadius:'50%', width:18, height:18, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700 }}>
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:98 }} />
          <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, background:'#14161f', border:'1px solid #1e2030', borderRadius:14, width:340, maxHeight:'70vh', overflowY:'auto', zIndex:99, boxShadow:'0 8px 32px #00000088' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid #1e2030' }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>Notificaciones</div>
              {sinLeer > 0 && (
                <button onClick={() => setNotifs(prev => prev.map(n => ({ ...n, leida:true })))}
                  style={{ background:'transparent', border:'none', color:'#6c7280', fontSize:11, cursor:'pointer' }}>
                  Marcar todo leído
                </button>
              )}
            </div>
            {notifs.length === 0
              ? <div style={{ padding:30, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin notificaciones</div>
              : notifs.map(n => (
                <div key={n.id} onClick={() => setNotifs(prev => prev.map(x => x.id===n.id ? {...x,leida:true} : x))}
                  style={{ padding:'12px 18px', borderBottom:'1px solid #1e2030', cursor:'pointer', background: n.leida ? 'transparent' : '#1a1d2e', display:'flex', gap:10, alignItems:'flex-start' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: n.leida ? 'transparent' : n.color, marginTop:5, flexShrink:0 }} />
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color: n.leida ? '#6c7280' : '#c8cfe0', marginBottom:3 }}>{n.titulo}</div>
                    <div style={{ fontSize:11, color:'#6c7280', lineHeight:1.4 }}>{n.mensaje}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </>
      )}
    </div>
  )
}
