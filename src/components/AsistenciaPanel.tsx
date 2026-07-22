'use client'

// ponytail: extraído tal cual desde src/app/asistencia/page.tsx para poder
// embeberlo como tab dentro de Jugadores. El wrapper AppLayout ahora vive
// afuera (en la página que lo usa).

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import GraficoAsistencia from '@/components/GraficoAsistencia'
import { eliminarAsistencia, registrarAsistenciaAction, registrarBloqueAction } from '@/app/actions/asistencia'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'
import {
  guardarJugadoresCache,
  obtenerJugadoresCache,
  encolarAsistencia,
  obtenerCola,
  quitarDeCola,
  type AsistenciaPendiente,
} from '@/lib/offline/db'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
function formatFechaLarga(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function marcaTiempoActual() {
  return Date.now()
}

export default function AsistenciaPanel({ perfil }: { perfil: any }) {
  const [jugadores, setJugadores] = useState<any[]>([])
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [registrando, setRegistrando] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [jugadorPropio, setJugadorPropio] = useState<any>(null)
  const [yaRegistroHoy, setYaRegistroHoy] = useState(false)
  const [mostrarConfirm, setMostrarConfirm] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const [pendientesCount, setPendientesCount] = useState(0)

  const [bloquesFecha,      setBloquesFecha]      = useState(() => fechaChile())
  const [bloqueHorario,     setBloqueHorario]     = useState('')
  const [presenciaMap,      setPresenciaMap]      = useState<Record<string, boolean>>({})
  const [registrandoBloque, setRegistrandoBloque] = useState(false)
  const [mensajeBloque,     setMensajeBloque]     = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const [fechaVista, setFechaVista] = useState(() => fechaChile())
  const [asistenciasDia, setAsistenciasDia] = useState<any[]>([])
  const [cargandoDia, setCargandoDia] = useState(false)

  const router = useRouter()
  const online = useOnlineStatus()
  const hoy = fechaChile()
  const hora = horaChile()
  const clubId = perfil?.club_id ?? null

  const sincronizarCola = useCallback(async (cid?: string) => {
    const id = cid || clubId
    if (!id) return
    const cola = await obtenerCola()
    const pendientes = cola.filter(c => c.clubId === id)
    for (const item of pendientes) {
      const result = await registrarAsistenciaAction(item.clubId, item.jugadorId, item.fecha, item.hora)
      if (!result.error) await quitarDeCola(item.id)
    }
  }, [clubId])

  const cargarDatos = useCallback(async (cid?: string) => {
    const id = cid || clubId
    if (!id) return
    const cola = await obtenerCola()
    const pendientesHoy: AsistenciaPendiente[] = cola.filter(c => c.clubId === id && c.fecha === hoy)
    setPendientesCount(cola.filter(c => c.clubId === id).length)

    if (!navigator.onLine) {
      const cached = await obtenerJugadoresCache(id)
      setJugadores((cached as any[]) || [])
      setAsistencias(pendientesHoy.map(p => ({ id: p.id, jugador_id: p.jugadorId, hora: p.hora, pendienteSync: true })))
      if (perfil?.jugador_id) {
        setYaRegistroHoy(pendientesHoy.some(p => p.jugadorId === perfil.jugador_id))
      }
      return
    }

    let consultaJugadores = supabase.from('jugadores')
      .select('id,nombre,categoria,sesiones_usadas,sesiones_limite,horario,entrena_lun,entrena_mar,entrena_mie,entrena_jue,entrena_vie')
      .eq('club_id', id).eq('estado', 'activo').order('nombre')
    if (perfil?.rol === 'jugador' && perfil.jugador_id) {
      consultaJugadores = consultaJugadores.eq('id', perfil.jugador_id)
    }

    const [{ data: j, error: jugadoresError }, { data: a, error: asistenciasError }] = await Promise.all([
      consultaJugadores,
      supabase.from('asistencia').select('id,jugador_id,hora,fecha').eq('club_id', id).eq('fecha', hoy).order('hora', { ascending: false })
    ])
    if (jugadoresError || asistenciasError) {
      setMensaje({ tipo: 'error', texto: jugadoresError?.message || asistenciasError?.message || 'No fue posible cargar la asistencia' })
      return
    }
    setJugadores(j || [])
    await guardarJugadoresCache(id, j || [])

    const yaSincronizadas = new Set((a || []).map((x: any) => x.jugador_id))
    const pendientesSinSincronizar = pendientesHoy
      .filter(p => !yaSincronizadas.has(p.jugadorId))
      .map(p => ({ id: p.id, jugador_id: p.jugadorId, hora: p.hora, pendienteSync: true }))
    const asistenciasHoy = [...(a || []), ...pendientesSinSincronizar]
    setAsistencias(asistenciasHoy)

    if (perfil?.jugador_id) {
      setYaRegistroHoy((a || []).some((as: any) => as.jugador_id === perfil.jugador_id) || pendientesHoy.some(p => p.jugadorId === perfil.jugador_id))
    }
  }, [clubId, hoy, perfil])

  const cargarAsistenciasDia = useCallback(async (fecha: string) => {
    if (!clubId) return
    setCargandoDia(true)
    const { data, error } = await supabase.from('asistencia').select('id,jugador_id,hora,fecha').eq('club_id', clubId).eq('fecha', fecha).order('hora', { ascending: false })
    if (error) setMensaje({ tipo: 'error', texto: error.message })
    setAsistenciasDia(data || [])
    setCargandoDia(false)
  }, [clubId])

  useEffect(() => {
    async function cargar() {
      if (!perfil) { router.push('/login'); return }
      if (perfil.rol === 'jugador' && perfil.jugador_id) {
        const cliente = createClient()
        const { data: j } = await cliente.from('jugadores').select('*').eq('id', perfil.jugador_id).single()
        setJugadorPropio(j)
      }
      if (perfil.club_id) {
        if (navigator.onLine) await sincronizarCola(perfil.club_id)
        await cargarDatos(perfil.club_id)
      }
      setLoading(false)
    }
    void cargar()
  }, [cargarDatos, perfil, router, sincronizarCola])

  useEffect(() => {
    if (online && clubId) {
      void sincronizarCola(clubId).then(() => cargarDatos(clubId))
    }
  }, [cargarDatos, clubId, online, sincronizarCola])

  useEffect(() => {
    if (!clubId || !fechaVista || fechaVista === hoy) return
    const carga = window.setTimeout(() => { void cargarAsistenciasDia(fechaVista) }, 0)
    return () => window.clearTimeout(carga)
  }, [cargarAsistenciasDia, clubId, fechaVista, hoy])

  useEffect(() => {
    if (!clubId) return
    const canal = supabase
      .channel(`asistencia-panel-${clubId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'asistencia',
      }, () => {
        void cargarDatos(clubId)
        if (fechaVista !== hoy) void cargarAsistenciasDia(fechaVista)
      })
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [cargarAsistenciasDia, cargarDatos, clubId, fechaVista, hoy])

  async function registrarAsistencia(jugadorId: string) {
    if (asistencias.find(a => a.jugador_id === jugadorId)) return
    setRegistrando(jugadorId)

    if (!navigator.onLine) {
      const jug = jugadores.find(j => j.id === jugadorId)
      const item: AsistenciaPendiente = {
        id: `pending-${jugadorId}-${hoy}`,
        clubId: clubId!,
        jugadorId,
        fecha: hoy,
        hora,
        jugadorNombre: jug?.nombre || '',
        creadoEn: marcaTiempoActual(),
      }
      await encolarAsistencia(item)
      setAsistencias(prev => [...prev, { id: item.id, jugador_id: jugadorId, hora, pendienteSync: true }])
      setPendientesCount(prev => prev + 1)
      setRegistrando(null)
      setBusqueda('')
      return
    }

    const result = await registrarAsistenciaAction(clubId!, jugadorId, hoy, hora)
    if (result.error) {
      setMensaje({ tipo: 'error', texto: result.error })
      setRegistrando(null)
      return
    }
    await cargarDatos()
    setRegistrando(null)
    setBusqueda('')
  }

  async function handleMarcarPropia() {
    if (!jugadorPropio || !clubId) return
    setMostrarConfirm(false)
    setRegistrando('propio')
    if (asistencias.find(a => a.jugador_id === jugadorPropio.id)) {
      setMensaje({ tipo: 'error', texto: 'Ya registraste asistencia hoy' })
      setRegistrando(null)
      setTimeout(() => setMensaje(null), 4000)
      return
    }

    if (!navigator.onLine) {
      const item: AsistenciaPendiente = {
        id: `pending-${jugadorPropio.id}-${hoy}`,
        clubId,
        jugadorId: jugadorPropio.id,
        fecha: hoy,
        hora,
        jugadorNombre: jugadorPropio.nombre || '',
        creadoEn: marcaTiempoActual(),
      }
      await encolarAsistencia(item)
      setAsistencias(prev => [...prev, { id: item.id, jugador_id: jugadorPropio.id, hora, pendienteSync: true }])
      setPendientesCount(prev => prev + 1)
      setMensaje({ tipo: 'ok', texto: 'Sin conexión — se sincronizará al recuperar internet' })
      setYaRegistroHoy(true)
      setRegistrando(null)
      setTimeout(() => setMensaje(null), 5000)
      return
    }

    const result = await registrarAsistenciaAction(clubId!, jugadorPropio.id, hoy, hora)
    if (result.error) {
      setMensaje({ tipo: 'error', texto: result.error })
      setRegistrando(null)
      setTimeout(() => setMensaje(null), 6000)
      return
    }
    setMensaje({ tipo: 'ok', texto: '¡Asistencia registrada!' })
    setYaRegistroHoy(true)
    await cargarDatos()
    setRegistrando(null)
    setTimeout(() => setMensaje(null), 4000)
  }

  async function handleEliminar(asistenciaId: string, nombreJugador: string) {
    if (!confirm(`¿Eliminar asistencia de ${nombreJugador}?`)) return
    setEliminando(asistenciaId)
    const result = await eliminarAsistencia(asistenciaId)
    if (result.error) {
      setMensaje({ tipo: 'error', texto: result.error })
    } else if (fechaVista === hoy) {
      await cargarDatos()
    } else {
      await cargarAsistenciasDia(fechaVista)
    }
    setEliminando(null)
  }

  async function handleCerrarBloque() {
    if (!clubId || !bloqueHorario || jugadoresBloque.length === 0) return
    setRegistrandoBloque(true)
    setMensajeBloque(null)
    const presentes = jugadoresBloque.filter(j => presenciaMap[j.id] !== false).map(j => j.id)
    const ausentes  = jugadoresBloque.filter(j => presenciaMap[j.id] === false).map(j => j.id)
    const result = await registrarBloqueAction({ clubId, fecha: bloquesFecha, hora: bloqueHorario.split('-')[0] + ':00', presentes, ausentes })
    if (result.error) {
      setMensajeBloque({ tipo: 'error', texto: result.error })
    } else {
      setMensajeBloque({ tipo: 'ok', texto: `Bloque cerrado: ${presentes.length} presentes, ${ausentes.length} inasistentes` })
      await cargarDatos()
      setBloqueHorario('')
      setPresenciaMap({})
    }
    setRegistrandoBloque(false)
    setTimeout(() => setMensajeBloque(null), 6000)
  }

  const dowBloque = new Date(bloquesFecha + 'T12:00:00').getDay()
  const jugadoresBloque = jugadores.filter(j =>
    j.horario === bloqueHorario &&
    (
      (dowBloque === 1 && j.entrena_lun) ||
      (dowBloque === 2 && j.entrena_mar) ||
      (dowBloque === 3 && j.entrena_mie) ||
      (dowBloque === 4 && j.entrena_jue) ||
      (dowBloque === 5 && j.entrena_vie)
    )
  )
  const horariosDisponibles = [...new Set(jugadores.map(j => j.horario).filter(Boolean))].sort() as string[]

  function togglePresencia(id: string) {
    setPresenciaMap(prev => ({ ...prev, [id]: prev[id] === false ? true : false }))
  }

  const esJugador = perfil?.rol === 'jugador'
  const esAdminOProfesor = perfil?.rol === 'admin' || perfil?.rol === 'profesor'
  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
  const registradosHoy = new Set(asistencias.map(a => a.jugador_id))

  const asistenciasMostradas = fechaVista === hoy ? asistencias : asistenciasDia

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: hint }}>Cargando...</div>
  )

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: text, marginBottom: 4 }}>📋 Asistencia</h2>
        <p style={{ fontSize: 13, color: muted }}>Hoy {hoy} · ✅ {asistencias.length} registros</p>
      </div>

      {!online && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
          📡 Sin conexión — los registros se guardan localmente y se sincronizan automáticamente al recuperar internet
        </div>
      )}
      {online && pendientesCount > 0 && (
        <div style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#3730a3', fontWeight: 600 }}>
          🔄 Sincronizando {pendientesCount} {pendientesCount === 1 ? 'registro pendiente' : 'registros pendientes'}...
        </div>
      )}

      {mensaje && (
        <div style={{
          background: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 12, padding: '14px 18px', marginBottom: 16, textAlign: 'center',
          fontSize: 14, fontWeight: 600, color: mensaje.tipo === 'ok' ? '#16a34a' : '#dc2626',
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* BOTÓN JUGADOR */}
      {esJugador && jugadorPropio && (
        <div style={{ ...card, padding: 24, marginBottom: 20, textAlign: 'center' }}>
          {yaRegistroHoy ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginBottom: 6 }}>Asistencia registrada</div>
              <div style={{ fontSize: 13, color: muted }}>Ya marcaste tu asistencia hoy. ¡Buen entrenamiento!</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏓</div>
              <div style={{ fontSize: 16, color: text, marginBottom: 6 }}>Hola, {jugadorPropio.nombre?.split(' ')[0]}</div>
              <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>Marca tu asistencia al llegar al club</div>
              {!mostrarConfirm ? (
                <button onClick={() => setMostrarConfirm(true)} style={{ width: '100%', maxWidth: 320, padding: '16px 24px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 14, fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
                  Marcar asistencia
                </button>
              ) : (
                <div style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 14, padding: 20, maxWidth: 320, margin: '0 auto' }}>
                  <div style={{ fontSize: 14, color: text, marginBottom: 16 }}>¿Confirmar asistencia para hoy?</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setMostrarConfirm(false)} style={{ flex: 1, padding: '12px 16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, color: muted, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={handleMarcarPropia} disabled={registrando === 'propio'} style={{ flex: 1, padding: '12px 16px', background: registrando === 'propio' ? '#94a3b8' : '#4f46e5', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 600, cursor: registrando === 'propio' ? 'not-allowed' : 'pointer' }}>
                      {registrando === 'propio' ? 'Registrando...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ASISTENCIAS DEL DÍA */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: text, textTransform: 'capitalize' }}>
          Asistencias {fechaVista === hoy ? 'de hoy' : `del ${formatFechaLarga(fechaVista)}`} ({asistenciasMostradas.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            {cargandoDia ? (
              <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>
            ) : asistenciasMostradas.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Sin asistencias registradas este día</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Jugador</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Hora</th>
                    {esAdminOProfesor && <th style={{ padding: '10px 16px', width: 60 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {asistenciasMostradas.map(a => {
                    const jug = jugadores.find(j => j.id === a.jugador_id)
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: text }}>{jug?.nombre || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: muted, fontVariantNumeric: 'tabular-nums' }}>{a.hora?.slice(0, 5)}</td>
                        {esAdminOProfesor && (
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            {a.pendienteSync ? (
                              <span style={{ background: '#ede9fe', color: '#3730a3', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>⏳ pendiente</span>
                            ) : (
                              <button onClick={() => handleEliminar(a.id, jug?.nombre || '')} disabled={eliminando === a.id} style={{ background: 'none', border: 'none', color: '#dc262688', cursor: eliminando === a.id ? 'not-allowed' : 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 6, opacity: eliminando === a.id ? 0.4 : 1 }} title="Eliminar asistencia">✕</button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {esAdminOProfesor && clubId && (
            <div style={{ borderLeft: '1px solid #e2e8f0', padding: 16 }}>
              <MiniCalendarioAsistencia clubId={clubId} fechaSeleccionada={fechaVista} onSeleccionar={setFechaVista} hoy={hoy} />
            </div>
          )}
        </div>
      </div>

      {/* GRÁFICO DE ASISTENCIA (Admin/Profesor) */}
      {esAdminOProfesor && clubId && (
        <div style={{ marginBottom: 24 }}>
          <GraficoAsistencia clubId={clubId} modo="completo" />
        </div>
      )}

      {/* REGISTRO MANUAL (Admin/Profesor) */}
      {esAdminOProfesor && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 12 }}>✏️ Registro manual</div>
          <input
            style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none', marginBottom: 10 }}
            placeholder="Buscar jugador para registrar..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
          />
          {busqueda && (
            <div style={{ background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {filtrados.slice(0, 5).map(j => {
                const ya = registradosHoy.has(j.id)
                return (
                  <div key={j.id} onClick={() => !ya && registrarAsistencia(j.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', cursor: ya ? 'default' : 'pointer', opacity: ya ? 0.6 : 1 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: text }}>{j.nombre}</div>
                      <div style={{ fontSize: 11, color: muted }}>{j.sesiones_usadas}/{j.sesiones_limite} sesiones · {j.categoria}</div>
                    </div>
                    {ya
                      ? <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>✅ Registrado</span>
                      : registrando === j.id
                        ? <span style={{ color: muted, fontSize: 12 }}>Registrando...</span>
                        : <button style={{ background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✅ Registrar</button>
                    }
                  </div>
                )
              })}
              {filtrados.length === 0 && <div style={{ padding: 16, color: muted, fontSize: 13, textAlign: 'center' }}>Sin resultados</div>}
            </div>
          )}
        </div>
      )}

      {/* REGISTRO POR BLOQUE (Admin/Profesor) */}
      {esAdminOProfesor && (
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 4 }}>🗂️ Cerrar bloque</div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 14 }}>Registra asistencia e inasistencias para todos los jugadores de un bloque de una vez.</div>

          {mensajeBloque && (
            <div style={{ background: mensajeBloque.tipo==='ok'?'#f0fdf4':'#fef2f2', border:`1px solid ${mensajeBloque.tipo==='ok'?'#bbf7d0':'#fecaca'}`, borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, fontWeight:600, color:mensajeBloque.tipo==='ok'?'#16a34a':'#dc2626' }}>
              {mensajeBloque.texto}
            </div>
          )}

          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4, flex:'1 1 140px' }}>
              <label style={{ fontSize:11, color:muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' }}>Fecha</label>
              <input type="date" value={bloquesFecha} max={hoy}
                onChange={e => { setBloquesFecha(e.target.value); setBloqueHorario(''); setPresenciaMap({}) }}
                style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, color:text, outline:'none' }}
              />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, flex:'1 1 160px' }}>
              <label style={{ fontSize:11, color:muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' }}>Bloque horario</label>
              <select value={bloqueHorario}
                onChange={e => { setBloqueHorario(e.target.value); setPresenciaMap({}) }}
                style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:13, color:text, outline:'none', cursor:'pointer' }}>
                <option value="">— Seleccionar —</option>
                {horariosDisponibles.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {bloqueHorario && jugadoresBloque.length === 0 && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'20px', textAlign:'center', color:hint, fontSize:13 }}>
              No hay jugadores con horario {bloqueHorario} para el día seleccionado
            </div>
          )}

          {bloqueHorario && jugadoresBloque.length > 0 && (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:12, color:muted }}>{jugadoresBloque.length} jugadores en este bloque · {jugadoresBloque.filter(j => presenciaMap[j.id] !== false).length} presentes</span>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => { const m: Record<string,boolean>={}; jugadoresBloque.forEach(j => m[j.id]=true); setPresenciaMap(m) }}
                    style={{ padding:'4px 10px', fontSize:11, fontWeight:600, border:'1px solid #e2e8f0', borderRadius:6, background:'#f0fdf4', color:'#16a34a', cursor:'pointer' }}>
                    Todos presentes
                  </button>
                  <button onClick={() => { const m: Record<string,boolean>={}; jugadoresBloque.forEach(j => m[j.id]=false); setPresenciaMap(m) }}
                    style={{ padding:'4px 10px', fontSize:11, fontWeight:600, border:'1px solid #e2e8f0', borderRadius:6, background:'#fef2f2', color:'#dc2626', cursor:'pointer' }}>
                    Todos ausentes
                  </button>
                </div>
              </div>
              <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden', marginBottom:14 }}>
                {jugadoresBloque.map((j, i) => {
                  const presente = presenciaMap[j.id] !== false
                  const ya = registradosHoy.has(j.id) && bloquesFecha === hoy
                  return (
                    <div key={j.id} onClick={() => togglePresencia(j.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderBottom: i < jugadoresBloque.length-1 ? '1px solid #f1f5f9' : 'none', cursor:'pointer', background: presente ? '#ffffff' : '#fef2f2' }}>
                      <div style={{ width:20, height:20, borderRadius:4, border:`2px solid ${presente?'#16a34a':'#dc2626'}`, background:presente?'#16a34a':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {presente && <span style={{ color:'white', fontSize:12, fontWeight:800 }}>✓</span>}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:text }}>{j.nombre}</div>
                        <div style={{ fontSize:11, color:muted }}>{j.categoria}</div>
                      </div>
                      <span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:12, background:presente?'#f0fdf4':'#fef2f2', color:presente?'#16a34a':'#dc2626' }}>
                        {presente ? 'Presente' : 'Ausente'}
                      </span>
                      {ya && <span style={{ fontSize:10, color:'#3730a3', background:'#ede9fe', padding:'2px 6px', borderRadius:8, fontWeight:600 }}>ya reg.</span>}
                    </div>
                  )
                })}
              </div>
              <button onClick={handleCerrarBloque} disabled={registrandoBloque}
                style={{ width:'100%', padding:'12px 16px', background:registrandoBloque?'#94a3b8':'#0f172a', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:registrandoBloque?'not-allowed':'pointer' }}>
                {registrandoBloque ? 'Cerrando bloque...' : `Cerrar bloque ${bloqueHorario} (${bloquesFecha})`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Mini calendario para elegir el día a revisar ── */
function MiniCalendarioAsistencia({ clubId, fechaSeleccionada, onSeleccionar, hoy }: {
  clubId: string
  fechaSeleccionada: string
  onSeleccionar: (fecha: string) => void
  hoy: string
}) {
  const [mes, setMes] = useState(new Date().getMonth())
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [diasConDatos, setDiasConDatos] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      const inicio = new Date(anio, mes, 1).toISOString().slice(0, 10)
      const fin = new Date(anio, mes + 1, 0).toISOString().slice(0, 10)
      const { data } = await supabase.from('asistencia').select('fecha').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).limit(200)
      const dias = new Set((data || []).map((d: any) => d.fecha))
      setDiasConDatos(dias)
    }
    if (clubId) cargar()

    const canal = supabase
      .channel(`asistencia-calendario-${clubId}-${anio}-${mes}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'asistencia',
      }, () => { void cargar() })
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [clubId, mes, anio])

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 11) { nuevoMes = 0; nuevoAnio++ }
    if (nuevoMes < 0) { nuevoMes = 11; nuevoAnio-- }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  const primerDia = new Date(anio, mes, 1).getDay()
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const nombresDias = ['Su', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

  return (
    <div style={{ width: 230 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => cambiarMes(-1)} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, color: muted, cursor: 'pointer', width: 22, height: 22 }}>‹</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: text }}>{nombresMes[mes]} {anio}</span>
        <button onClick={() => cambiarMes(1)} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, color: muted, cursor: 'pointer', width: 22, height: 22 }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {nombresDias.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, color: hint, fontWeight: 600, padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', rowGap: 2 }}>
        {Array.from({ length: primerDia }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: diasEnMes }).map((_, i) => {
          const dia = i + 1
          const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
          const esHoy = fecha === hoy
          const esSeleccionado = fecha === fechaSeleccionada
          const tieneDatos = diasConDatos.has(fecha)
          return (
            <div key={dia} onClick={() => onSeleccionar(fecha)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, cursor: 'pointer', padding: '2px 0' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: esSeleccionado || esHoy ? 700 : 400,
                background: esSeleccionado ? '#4f46e5' : esHoy ? '#ede9fe' : 'transparent',
                color: esSeleccionado ? 'white' : esHoy ? '#3730a3' : text,
              }}>
                {dia}
              </div>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: tieneDatos ? '#4f46e5' : 'transparent' }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
