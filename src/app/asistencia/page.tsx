'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import GraficoAsistencia from '@/components/GraficoAsistencia'
import { eliminarAsistencia, registrarAsistenciaAction } from '@/app/actions/asistencia'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
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

const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function getLunesDeSemana(offset: number) {
  const hoy = new Date()
  const dia = hoy.getDay()
  const diffLunes = dia === 0 ? -6 : 1 - dia
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() + diffLunes + (offset * 7))
  lunes.setHours(0, 0, 0, 0)
  return lunes
}

function formatFecha(d: Date) { return d.toISOString().slice(0, 10) }
function formatFechaCorta(d: Date) { return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) }
function formatFechaLarga(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function AsistenciaPage() {
  const { perfil, loading: authLoading } = usePerfil()
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

  const [semanaOffset, setSemanaOffset] = useState(0)
  const [promDiario, setPromDiario] = useState(0)
  const [diaMasActivo, setDiaMasActivo] = useState('')
  const [diaMasActivoCount, setDiaMasActivoCount] = useState(0)
  const [sinAsistencia, setSinAsistencia] = useState<any[]>([])
  const [mostrarInasistentes, setMostrarInasistentes] = useState(false)
  const [pendientesCount, setPendientesCount] = useState(0)

  const [fechaVista, setFechaVista] = useState(() => new Date().toISOString().slice(0, 10))
  const [asistenciasDia, setAsistenciasDia] = useState<any[]>([])
  const [cargandoDia, setCargandoDia] = useState(false)

  const router = useRouter()
  const online = useOnlineStatus()
  const hoy = new Date().toISOString().slice(0, 10)
  const hora = new Date().toTimeString().slice(0, 5)
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      if (perfil.rol === 'jugador' && perfil.jugador_id) {
        const supabase = createClient()
        const { data: j } = await supabase.from('jugadores').select('*').eq('id', perfil.jugador_id).single()
        setJugadorPropio(j)
      }
      if (perfil.club_id) {
        if (navigator.onLine) await sincronizarCola(perfil.club_id)
        await Promise.all([cargarDatos(perfil.club_id), cargarStats(perfil.club_id, 0)])
      }
      setLoading(false)
    }
    cargar()
  }, [authLoading, perfil])

  useEffect(() => {
    if (!clubId) return
    cargarStats(clubId, semanaOffset)
  }, [semanaOffset])

  useEffect(() => {
    if (online && clubId) {
      sincronizarCola(clubId).then(() => { cargarDatos(); cargarStats() })
    }
  }, [online])

  useEffect(() => {
    if (!clubId || !fechaVista || fechaVista === hoy) return
    cargarAsistenciasDia(fechaVista)
  }, [fechaVista, clubId])

  async function sincronizarCola(cid?: string) {
    const id = cid || clubId
    if (!id) return
    const cola = await obtenerCola()
    const pendientes = cola.filter(c => c.clubId === id)
    for (const item of pendientes) {
      const result = await registrarAsistenciaAction(item.clubId, item.jugadorId, item.fecha, item.hora)
      if (!result.error) await quitarDeCola(item.id)
    }
  }

  async function cargarDatos(cid?: string) {
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

    const [{ data: j }, { data: a }] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', id).eq('estado', 'activo').order('nombre'),
      supabase.from('asistencia').select('*').eq('club_id', id).eq('fecha', hoy).order('hora', { ascending: false })
    ])
    setJugadores(j || [])
    await guardarJugadoresCache(id, j || [])

    const yaSincronizadas = new Set((a || []).map((x: any) => x.jugador_id))
    const pendientesSinSincronizar = pendientesHoy
      .filter(p => !yaSincronizadas.has(p.jugadorId))
      .map(p => ({ id: p.id, jugador_id: p.jugadorId, hora: p.hora, pendienteSync: true }))
    setAsistencias([...(a || []), ...pendientesSinSincronizar])

    if (perfil?.jugador_id) {
      setYaRegistroHoy((a || []).some((as: any) => as.jugador_id === perfil.jugador_id) || pendientesHoy.some(p => p.jugadorId === perfil.jugador_id))
    }
  }

  async function cargarAsistenciasDia(fecha: string) {
    if (!clubId) return
    setCargandoDia(true)
    const { data } = await supabase.from('asistencia').select('*').eq('club_id', clubId).eq('fecha', fecha).order('hora', { ascending: false })
    setAsistenciasDia(data || [])
    setCargandoDia(false)
  }

  async function cargarStats(cid?: string, offset?: number) {
    const id = cid || clubId
    const off = offset !== undefined ? offset : semanaOffset
    const lunes = getLunesDeSemana(off)
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    const inicio = formatFecha(lunes)
    const fin = formatFecha(domingo)

    const [{ data: asist }, { data: jugs }] = await Promise.all([
      supabase.from('asistencia').select('*').eq('club_id', id).gte('fecha', inicio).lte('fecha', fin),
      supabase.from('jugadores').select('id,nombre,categoria,estado').eq('club_id', id).eq('estado', 'activo').order('nombre')
    ])

    const a = asist || []
    const j = jugs || []

    const porDia: Record<string, number> = {}
    const porDiaSemana: Record<number, number> = {}
    a.forEach(r => {
      porDia[r.fecha] = (porDia[r.fecha] || 0) + 1
      const ds = new Date(r.fecha + 'T12:00:00').getDay()
      porDiaSemana[ds] = (porDiaSemana[ds] || 0) + 1
    })

    const diasConDatos = Object.keys(porDia).length
    setPromDiario(diasConDatos > 0 ? Math.round(a.length / diasConDatos) : 0)

    let maxCount = 0, maxIdx = -1
    Object.entries(porDiaSemana).forEach(([dia, count]) => {
      if (count > maxCount) { maxCount = count; maxIdx = Number(dia) }
    })
    setDiaMasActivo(maxIdx >= 0 ? diasSemana[maxIdx] : '—')
    setDiaMasActivoCount(maxCount)

    const porJugador: Record<string, number> = {}
    a.forEach(r => { porJugador[r.jugador_id] = (porJugador[r.jugador_id] || 0) + 1 })

    setSinAsistencia(j.filter(jug => !porJugador[jug.id]))
  }

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
        creadoEn: Date.now(),
      }
      await encolarAsistencia(item)
      setAsistencias(prev => [...prev, { id: item.id, jugador_id: jugadorId, hora, pendienteSync: true }])
      setPendientesCount(prev => prev + 1)
      setRegistrando(null)
      setBusqueda('')
      return
    }

    const result = await registrarAsistenciaAction(clubId!, jugadorId, hoy, hora)
    if (result.error) { setRegistrando(null); return }
    await cargarDatos()
    await cargarStats()
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
        creadoEn: Date.now(),
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
    await cargarStats()
    setRegistrando(null)
    setTimeout(() => setMensaje(null), 4000)
  }

  async function handleEliminar(asistenciaId: string, nombreJugador: string) {
    if (!confirm(`¿Eliminar asistencia de ${nombreJugador}?`)) return
    setEliminando(asistenciaId)
    const result = await eliminarAsistencia(asistenciaId, perfil?.rol || '')
    if (result.error) alert(result.error)
    if (fechaVista === hoy) { await cargarDatos() } else { await cargarAsistenciasDia(fechaVista) }
    await cargarStats()
    setEliminando(null)
  }

  const esJugador = perfil?.rol === 'jugador'
  const esAdminOProfesor = perfil?.rol === 'admin' || perfil?.rol === 'profesor'
  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
  const registradosHoy = new Set(asistencias.map(a => a.jugador_id))

  const lunes = getLunesDeSemana(semanaOffset)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  const esEstaSemana = semanaOffset === 0

  const asistenciasMostradas = fechaVista === hoy ? asistencias : asistenciasDia

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: text, marginBottom: 4 }}>📋 Asistencia</h1>
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

      {/* ESTADÍSTICAS SEMANALES (Admin/Profesor) */}
      {esAdminOProfesor && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: text }}>Estadísticas semanales</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setSemanaOffset(semanaOffset - 1)} style={{ ...card, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', color: muted, cursor: 'pointer', fontSize: 14 }}>◀</button>
              <span style={{ fontSize: 13, fontWeight: 600, color: text, minWidth: 170, textAlign: 'center' }}>
                {formatFechaCorta(lunes)} — {formatFechaCorta(domingo)}
                {esEstaSemana && <span style={{ color: '#4f46e5', marginLeft: 6, fontSize: 11 }}>esta semana</span>}
              </span>
              <button onClick={() => setSemanaOffset(semanaOffset + 1)} disabled={esEstaSemana} style={{ ...card, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', color: esEstaSemana ? hint : muted, cursor: esEstaSemana ? 'not-allowed' : 'pointer', fontSize: 14 }}>▶</button>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
            <div style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 14, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
              <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Promedio diario</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#3730a3', fontVariantNumeric: 'tabular-nums' }}>{promDiario}</div>
              <div style={{ fontSize: 11, color: hint, marginTop: 4 }}>jugadores/día</div>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
              <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Día más activo</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{diaMasActivo}</div>
              <div style={{ fontSize: 11, color: hint, marginTop: 4 }}>{diaMasActivoCount > 0 ? `${diaMasActivoCount} asistencias` : ''}</div>
            </div>
            <div onClick={() => sinAsistencia.length > 0 && setMostrarInasistentes(!mostrarInasistentes)} style={{ background: sinAsistencia.length > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${sinAsistencia.length > 0 ? '#fecaca' : '#bbf7d0'}`, borderRadius: 14, padding: 18, cursor: sinAsistencia.length > 0 ? 'pointer' : 'default', boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
              <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Sin asistencia</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: sinAsistencia.length > 0 ? '#dc2626' : '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{sinAsistencia.length}</div>
                {sinAsistencia.length > 0 && <div style={{ fontSize: 16, color: '#dc262688', transform: mostrarInasistentes ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</div>}
              </div>
              <div style={{ fontSize: 11, color: hint, marginTop: 4 }}>{sinAsistencia.length === 0 ? 'todos asistieron' : 'sin venir esta semana'}</div>
            </div>
          </div>

          {/* Panel inasistentes */}
          {mostrarInasistentes && sinAsistencia.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 12 }}>
                Jugadores sin asistencia esta semana ({sinAsistencia.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {sinAsistencia.map(j => (
                  <div key={j.id} style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#dc2626' }}>{j.nombre}</div>
                ))}
              </div>
            </div>
          )}

          {/* GRÁFICO DE ASISTENCIA */}
          {clubId && (
            <div style={{ marginBottom: 24 }}>
              <GraficoAsistencia clubId={clubId} />
            </div>
          )}
        </>
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

      {/* REGISTRO MANUAL (Admin/Profesor) */}
      {esAdminOProfesor && (
        <div style={{ ...card, padding: 16 }}>
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
    </AppLayout>
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
      const { data } = await supabase.from('asistencia').select('fecha').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin)
      setDiasConDatos(new Set((data || []).map((d: any) => d.fecha)))
    }
    if (clubId) cargar()
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
