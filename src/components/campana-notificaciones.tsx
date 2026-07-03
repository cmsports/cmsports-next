'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell } from 'lucide-react'

interface Notificacion {
  id: string
  tipo: 'clase' | 'torneo' | 'mensualidad' | 'solicitud' | 'aviso'
  titulo: string
  mensaje: string
  fecha: string
  leida: boolean
  color: string
}

export default function CampanaNotificaciones({ perfil, placement = 'bottom' }: { perfil: any; placement?: 'bottom' | 'top' }) {
  const [open, setOpen]   = useState(false)
  const [notifs, setNotifs] = useState<Notificacion[]>([])

  async function cargarNotificaciones() {
    const supabase = createClient()
    const notificaciones: Notificacion[] = []
    const rol = perfil?.rol
    const hoy      = new Date().toISOString().slice(0, 10)
    const en14dias = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    if (rol === 'jugador' && perfil?.jugador_id) {
      const mesActual  = new Date().getMonth() + 1
      const anioActual = new Date().getFullYear()
      const { data: mens } = await supabase.from('mensualidades')
        .select('*').eq('jugador_id', perfil.jugador_id)
        .eq('mes', mesActual).eq('anio', anioActual).maybeSingle()

      if (mens?.estado === 'pendiente') {
        notificaciones.push({ id: 'mens-pendiente', tipo: 'mensualidad', titulo: 'Mensualidad pendiente', mensaje: `Tu mensualidad de este mes está pendiente de pago.`, fecha: hoy, leida: false, color: '#d97706' })
      } else if (mens?.estado === 'atrasado') {
        notificaciones.push({ id: 'mens-atrasada', tipo: 'mensualidad', titulo: 'Mensualidad atrasada', mensaje: 'Tienes una mensualidad atrasada. Contacta al administrador.', fecha: hoy, leida: false, color: '#dc2626' })
      }

      const trimestreActual = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}-${new Date().getFullYear()}`
      const { data: evaluacion } = await supabase.from('evaluaciones_trimestrales')
        .select('*').eq('jugador_id', perfil.jugador_id).eq('periodo_trimestre', trimestreActual).maybeSingle()
      if (evaluacion?.feedback_profesor) {
        const texto = evaluacion.feedback_profesor
        notificaciones.push({ id: `feedback-${trimestreActual}`, tipo: 'aviso', titulo: 'Tienes feedback nuevo', mensaje: texto.length > 90 ? texto.slice(0, 90) + '…' : texto, fecha: hoy, leida: false, color: '#4f46e5' })
      }

      const { data: eventosProximos } = await supabase.from('eventos')
        .select('*').eq('club_id', perfil.club_id).gte('fecha_inicio', hoy).lte('fecha_inicio', en14dias).order('fecha_inicio').limit(4)
      eventosProximos?.forEach((ev: any) => {
        notificaciones.push({ id: `evento-${ev.id}`, tipo: 'aviso', titulo: ev.titulo, mensaje: `${new Date(ev.fecha_inicio).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}${ev.hora_inicio ? ' · ' + ev.hora_inicio.slice(0, 5) : ''}`, fecha: ev.fecha_inicio, leida: false, color: '#16a34a' })
      })

      const { data: torneos } = await supabase.from('torneos')
        .select('*').eq('club_id', perfil.club_id).in('estado', ['programado', 'en_curso']).gte('fecha_inicio', hoy).limit(2)
      torneos?.forEach((t: any) => {
        notificaciones.push({ id: `torneo-${t.id}`, tipo: 'torneo', titulo: 'Torneo próximo', mensaje: `${t.nombre} — ${t.fecha_inicio ? new Date(t.fecha_inicio).toLocaleDateString('es-CL') : 'Fecha por confirmar'}`, fecha: t.fecha_inicio || hoy, leida: false, color: '#f43f5e' })
      })

      // Torneos ganados — premio + felicitaciones recibidas
      const { data: torneosGanados } = await supabase
        .from('historial_elo')
        .select('torneo_id, torneos(nombre)')
        .eq('jugador_id', perfil.jugador_id)
        .eq('posicion', 'campeon')
        .limit(3)
      await Promise.all((torneosGanados || []).map(async (tg: any) => {
        const nombre = tg.torneos?.nombre || 'un torneo'
        const { count: fCount } = await supabase
          .from('torneo_felicitaciones')
          .select('id', { count: 'exact', head: true })
          .eq('torneo_id', tg.torneo_id)
        const msg = fCount && fCount > 0
          ? `${fCount} jugador${fCount !== 1 ? 'es' : ''} te felicitaron. ¡Disfruta tu premio! Te esperamos en el siguiente torneo.`
          : '¡Disfruta tu premio! Te esperamos en el siguiente torneo.'
        notificaciones.push({ id: `campeon-${tg.torneo_id}`, tipo: 'torneo', titulo: `🏆 ¡Campeón de ${nombre}!`, mensaje: msg, fecha: hoy, leida: false, color: '#d97706' })
      }))
    }

    if (rol === 'profesor') {
      const { data: clasesHoy } = await supabase.from('clases')
        .select('*').eq('club_id', perfil.club_id).eq('publicada', true).eq('fecha', hoy).order('hora_inicio')
      if (clasesHoy?.length) {
        notificaciones.push({ id: 'clases-hoy', tipo: 'clase', titulo: `${clasesHoy.length} clase${clasesHoy.length > 1 ? 's' : ''} hoy`, mensaje: clasesHoy.map((c: any) => `${c.hora_inicio?.slice(0, 5)} ${c.contenido}`).join(' · '), fecha: hoy, leida: false, color: '#4f46e5' })
      }

      const trimestre = Math.ceil((new Date().getMonth() + 1) / 3)
      const periodo   = `Q${trimestre}-${new Date().getFullYear()}`
      const { data: jugadores } = await supabase.from('jugadores').select('id').eq('club_id', perfil.club_id).eq('estado', 'activo').neq('es_externo', true)
      const { data: evaluados }  = await supabase.from('evaluaciones_trimestrales').select('jugador_id').eq('club_id', perfil.club_id).eq('periodo_trimestre', periodo)
      const sinEvaluar = (jugadores?.length || 0) - (evaluados?.length || 0)
      if (sinEvaluar > 0) {
        notificaciones.push({ id: 'sin-evaluar', tipo: 'aviso', titulo: 'Evaluaciones pendientes', mensaje: `${sinEvaluar} alumno${sinEvaluar > 1 ? 's' : ''} sin evaluación ${periodo}.`, fecha: hoy, leida: false, color: '#d97706' })
      }

      // Compromisos aceptados y pendientes
      const { data: evsConFeedback } = await supabase.from('evaluaciones_trimestrales')
        .select('*, jugadores(nombre)').eq('club_id', perfil.club_id).eq('periodo_trimestre', periodo).not('feedback_profesor', 'is', null)
      const aceptados = (evsConFeedback || []).filter((ev: any) => ev.firmado_alumno)
      const pendientesAceptar = (evsConFeedback || []).filter((ev: any) => !ev.firmado_alumno)
      if (aceptados.length > 0) {
        notificaciones.push({ id: `compromisos-aceptados-${periodo}`, tipo: 'aviso', titulo: `${aceptados.length} compromiso${aceptados.length > 1 ? 's' : ''} aceptado${aceptados.length > 1 ? 's' : ''}`, mensaje: aceptados.map((ev: any) => ev.jugadores?.nombre || '').filter(Boolean).join(', '), fecha: hoy, leida: false, color: '#16a34a' })
      }
      if (pendientesAceptar.length > 0) {
        notificaciones.push({ id: `compromisos-pendientes-${periodo}`, tipo: 'aviso', titulo: `${pendientesAceptar.length} compromiso${pendientesAceptar.length > 1 ? 's' : ''} pendiente${pendientesAceptar.length > 1 ? 's' : ''} de firmar`, mensaje: pendientesAceptar.map((ev: any) => ev.jugadores?.nombre || '').filter(Boolean).join(', '), fecha: hoy, leida: false, color: '#d97706' })
      }

      const { data: torneos } = await supabase.from('torneos')
        .select('*').eq('club_id', perfil.club_id).in('estado', ['programado', 'en_curso']).gte('fecha_inicio', hoy).limit(2)
      torneos?.forEach((t: any) => {
        notificaciones.push({ id: `torneo-${t.id}`, tipo: 'torneo', titulo: 'Torneo próximo', mensaje: `${t.nombre} — ${t.fecha_inicio ? new Date(t.fecha_inicio).toLocaleDateString('es-CL') : 'Fecha por confirmar'}`, fecha: t.fecha_inicio || hoy, leida: false, color: '#f43f5e' })
      })
    }

    if (rol === 'admin') {
      const trimestre = Math.ceil((new Date().getMonth() + 1) / 3)
      const periodo   = `Q${trimestre}-${new Date().getFullYear()}`
      const { data: evsConFeedback } = await supabase.from('evaluaciones_trimestrales')
        .select('*, jugadores(nombre)').eq('club_id', perfil.club_id).eq('periodo_trimestre', periodo).not('feedback_profesor', 'is', null)
      const aceptados = (evsConFeedback || []).filter((ev: any) => ev.firmado_alumno)
      const pendientesAceptar = (evsConFeedback || []).filter((ev: any) => !ev.firmado_alumno)
      if (aceptados.length > 0) {
        notificaciones.push({ id: `compromisos-aceptados-admin-${periodo}`, tipo: 'aviso', titulo: `${aceptados.length} compromiso${aceptados.length > 1 ? 's' : ''} aceptado${aceptados.length > 1 ? 's' : ''}`, mensaje: aceptados.map((ev: any) => ev.jugadores?.nombre || '').filter(Boolean).join(', '), fecha: hoy, leida: false, color: '#16a34a' })
      }
      if (pendientesAceptar.length > 0) {
        notificaciones.push({ id: `compromisos-pendientes-admin-${periodo}`, tipo: 'aviso', titulo: `${pendientesAceptar.length} compromiso${pendientesAceptar.length > 1 ? 's' : ''} pendiente${pendientesAceptar.length > 1 ? 's' : ''} de firmar`, mensaje: pendientesAceptar.map((ev: any) => ev.jugadores?.nombre || '').filter(Boolean).join(', '), fecha: hoy, leida: false, color: '#d97706' })
      }
    }

    notificaciones.sort((a, b) => (a.fecha > b.fecha ? 1 : -1))
    setNotifs(notificaciones)
  }

  useEffect(() => {
    if (!perfil?.club_id) return
    cargarNotificaciones()
  }, [perfil])

  const sinLeer = notifs.filter(n => !n.leida).length

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'relative',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '7px 10px',
          color: '#64748b',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
        }}
      >
        <Bell size={16} />
        {sinLeer > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#f43f5e', color: 'white',
            borderRadius: '50%', width: 17, height: 17,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, border: '2px solid white',
          }}>
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
          <div style={{
            position: 'absolute',
            ...(placement === 'top' ? { bottom: 'calc(100% + 8px)', left: 0 } : { top: 'calc(100% + 8px)', right: 0 }),
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            width: 300,
            maxHeight: '70vh',
            overflowY: 'auto',
            zIndex: 99,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Notificaciones</div>
              {sinLeer > 0 && (
                <button
                  onClick={() => setNotifs(prev => prev.map(n => ({ ...n, leida: true })))}
                  style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}
                >
                  Marcar todo leído
                </button>
              )}
            </div>
            {notifs.length === 0
              ? <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Sin notificaciones</div>
              : notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x))}
                  style={{
                    padding: '11px 16px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    background: n.leida ? '#ffffff' : '#f8fafc',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: n.leida ? '#e2e8f0' : n.color, marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: n.leida ? '#94a3b8' : '#0f172a', marginBottom: 2 }}>{n.titulo}</div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{n.mensaje}</div>
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
