'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { eliminarAsistencia, registrarAsistenciaAction } from '@/app/actions/asistencia'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

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

export default function AsistenciaPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clubId, setClubId] = useState<string | null>(null)
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
  const [statsJugadores, setStatsJugadores] = useState<any[]>([])
  const [busquedaStats, setBusquedaStats] = useState('')

  const router = useRouter()
  const hoy = new Date().toISOString().slice(0, 10)
  const hora = new Date().toTimeString().slice(0, 5)

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      setClubId(p?.club_id)
      if (p?.rol === 'jugador' && p?.jugador_id) {
        const { data: j } = await supabase.from('jugadores').select('*').eq('id', p.jugador_id).single()
        setJugadorPropio(j)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (!clubId) return
    cargarDatos()
  }, [clubId])

  useEffect(() => {
    if (!clubId) return
    cargarStats()
  }, [clubId, semanaOffset])

  async function cargarDatos() {
    const [{ data: j }, { data: a }] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', clubId).eq('estado', 'activo').order('nombre'),
      supabase.from('asistencia').select('*').eq('club_id', clubId).eq('fecha', hoy).order('hora', { ascending: false })
    ])
    setJugadores(j || [])
    setAsistencias(a || [])
    if (perfil?.jugador_id) {
      setYaRegistroHoy((a || []).some((as: any) => as.jugador_id === perfil.jugador_id))
    }
  }

  async function cargarStats() {
    const lunes = getLunesDeSemana(semanaOffset)
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    const inicio = formatFecha(lunes)
    const fin = formatFecha(domingo)

    const [{ data: asist }, { data: jugs }] = await Promise.all([
      supabase.from('asistencia').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin),
      supabase.from('jugadores').select('id,nombre,categoria,estado').eq('club_id', clubId).eq('estado', 'activo').order('nombre')
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

    setStatsJugadores(j.map(jug => ({ ...jug, asistencias: porJugador[jug.id] || 0 })).sort((a, b) => b.asistencias - a.asistencias))
    setSinAsistencia(j.filter(jug => !porJugador[jug.id]))
  }

  async function registrarAsistencia(jugadorId: string) {
    if (asistencias.find(a => a.jugador_id === jugadorId)) return
    setRegistrando(jugadorId)
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
    await cargarDatos()
    await cargarStats()
    setEliminando(null)
  }

  const esJugador = perfil?.rol === 'jugador'
  const esAdminOProfesor = perfil?.rol === 'admin' || perfil?.rol === 'profesor'
  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
  const registradosHoy = new Set(asistencias.map(a => a.jugador_id))
  const filtradosStats = statsJugadores.filter(j => j.nombre.toLowerCase().includes(busquedaStats.toLowerCase()))

  const lunes = getLunesDeSemana(semanaOffset)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  const esEstaSemana = semanaOffset === 0

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

      {/* ASISTENCIAS DE HOY */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: text }}>
          Asistencias de hoy ({asistencias.length})
        </div>
        {asistencias.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Sin asistencias registradas hoy</div>
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
              {asistencias.map(a => {
                const jug = jugadores.find(j => j.id === a.jugador_id)
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: text }}>{jug?.nombre || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: muted, fontVariantNumeric: 'tabular-nums' }}>{a.hora?.slice(0, 5)}</td>
                    {esAdminOProfesor && (
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button onClick={() => handleEliminar(a.id, jug?.nombre || '')} disabled={eliminando === a.id} style={{ background: 'none', border: 'none', color: '#dc262688', cursor: eliminando === a.id ? 'not-allowed' : 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 6, opacity: eliminando === a.id ? 0.4 : 1 }} title="Eliminar asistencia">✕</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

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
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: 16, marginBottom: 16 }}>
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

          {/* Tabla por jugador */}
          <div style={{ marginBottom: 12 }}>
            <input
              style={{ width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 13, outline: 'none' }}
              placeholder="Buscar jugador en estadísticas..."
              value={busquedaStats} onChange={e => setBusquedaStats(e.target.value)}
            />
          </div>
          <div style={{ ...card, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['#', 'Jugador', 'Categoría', 'Asistencias'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradosStats.map((j, i) => {
                  const col = j.asistencias >= 4 ? '#16a34a' : j.asistencias >= 2 ? '#d97706' : '#dc2626'
                  const colBg = j.asistencias >= 4 ? '#f0fdf4' : j.asistencias >= 2 ? '#fffbeb' : '#fef2f2'
                  return (
                    <tr key={j.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: muted }}>{i + 1}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: text, fontWeight: 500 }}>{j.nombre}</td>
                      <td style={{ padding: '10px 16px' }}><span style={{ background: '#ede9fe', color: '#3730a3', padding: '2px 8px', borderRadius: 20, fontSize: 11 }}>{j.categoria}</span></td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ background: colBg, color: col, padding: '3px 8px', borderRadius: 20, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{j.asistencias}</span>
                        <span style={{ fontSize: 11, color: muted, marginLeft: 4 }}>días</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtradosStats.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Sin resultados</div>}
          </div>
        </>
      )}
    </AppLayout>
  )
}
