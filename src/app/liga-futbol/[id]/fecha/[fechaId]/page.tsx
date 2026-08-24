'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { useEnVivo } from '@/lib/useEnVivo'
import {
  iniciarPartido, registrarResultado, registrarGol, eliminarGol,
  registrarTarjeta, eliminarTarjeta, registrarWO, suspenderPartido,
  finalizarPartido, terminarFecha,
} from '@/app/actions/liga-futbol'

const supabase = createClient()

const ink = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const green = '#059669'

const btn: React.CSSProperties = {
  border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12,
  fontWeight: 600, cursor: 'pointer',
}

const ESTADO_PARTIDO: Record<string, { label: string; color: string; bg: string }> = {
  programado:    { label: 'Programado',   color: '#6366f1', bg: '#eef2ff' },
  en_curso:      { label: 'En curso',     color: '#059669', bg: '#d1fae5' },
  finalizado:    { label: 'Finalizado',   color: '#64748b', bg: '#f1f5f9' },
  wo:            { label: 'W.O.',         color: '#dc2626', bg: '#fef2f2' },
  suspendido:    { label: 'Suspendido',   color: '#d97706', bg: '#fef3c7' },
  reprogramado:  { label: 'Reprogramado', color: '#d97706', bg: '#fef3c7' },
}

interface Fecha { id: string; numero: number; nombre: string | null; fecha: string | null; estado: string; es_playoff: boolean }
interface Equipo { id: string; nombre: string; color_principal: string | null }
interface Jugador { id: string; equipo_id: string; nombre: string; numero: number | null }
interface Partido {
  id: string; equipo_local_id: string; equipo_visita_id: string
  goles_local: number | null; goles_visita: number | null
  hora: string | null; estado: string; equipo_wo_id: string | null; observaciones: string | null
}
interface Gol { id: string; partido_id: string; jugador_id: string; equipo_id: string; minuto: number | null; tipo: string }
interface Tarjeta { id: string; partido_id: string; jugador_id: string; equipo_id: string; tipo: string; minuto: number | null; motivo: string | null }

export default function FechaLigaFutbol() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const params = useParams()
  const ligaId = params.id as string
  const fechaId = params.fechaId as string

  const [ligaNombre, setLigaNombre] = useState('')
  const [fecha, setFecha] = useState<Fecha | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [goles, setGoles] = useState<Gol[]>([])
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [terminandoFecha, setTerminandoFecha] = useState(false)

  // form state por partido
  const [scoreLocal, setScoreLocal] = useState<Record<string, string>>({})
  const [scoreVisita, setScoreVisita] = useState<Record<string, string>>({})
  const [golForm, setGolForm] = useState<Record<string, { jugadorId: string; minuto: string; tipo: string }>>({})
  const [tarjetaForm, setTarjetaForm] = useState<Record<string, { jugadorId: string; tipo: string; minuto: string; motivo: string }>>({})
  const [woEquipo, setWoEquipo] = useState<Record<string, string>>({})

  useEnVivo(['lf_partidos', 'lf_goles', 'lf_tarjetas', 'lf_fechas'], perfil?.club_id ?? null, () => cargar())

  function cargar() {
    if (!fechaId) return
    Promise.all([
      supabase.from('lf_ligas').select('nombre').eq('id', ligaId).single(),
      supabase.from('lf_fechas').select('*').eq('id', fechaId).single(),
      supabase.from('lf_equipos').select('id, nombre, color_principal').eq('liga_id', ligaId),
      supabase.from('lf_partidos').select('*').eq('fecha_id', fechaId),
    ]).then(([ligaRes, fechaRes, eqRes, partRes]) => {
      setLigaNombre(ligaRes.data?.nombre || '')
      setFecha(fechaRes.data as any)
      setEquipos(eqRes.data as any || [])
      const parts = (partRes.data as any) || []
      setPartidos(parts)
      setLoading(false)

      const partidoIds = parts.map((p: Partido) => p.id)
      if (partidoIds.length > 0) {
        supabase.from('lf_goles').select('*').in('partido_id', partidoIds).then(({ data }) => setGoles((data as any) || []))
        supabase.from('lf_tarjetas').select('*').in('partido_id', partidoIds).then(({ data }) => setTarjetas((data as any) || []))
      }
    })
    supabase.from('lf_jugadores').select('*, lf_equipos!inner(liga_id)').eq('lf_equipos.liga_id', ligaId)
      .then(({ data }) => setJugadores((data as any) || []))
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, perfil, fechaId])

  const equipoPorId = (id: string) => equipos.find(e => e.id === id)
  const jugadoresDeEquipo = (id: string) => jugadores.filter(j => j.equipo_id === id)
  const jugadorPorId = (id: string) => jugadores.find(j => j.id === id)
  const golesDePartido = (id: string) => goles.filter(g => g.partido_id === id)
  const tarjetasDePartido = (id: string) => tarjetas.filter(t => t.partido_id === id)

  async function handleIniciar(p: Partido) {
    setError('')
    const res = await iniciarPartido(p.id)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  async function handleGuardarResultado(p: Partido) {
    const sl = parseInt(scoreLocal[p.id] ?? String(p.goles_local ?? 0))
    const sv = parseInt(scoreVisita[p.id] ?? String(p.goles_visita ?? 0))
    if (isNaN(sl) || isNaN(sv)) { setError('Marcador inválido'); return }
    setError('')
    const res = await registrarResultado(p.id, sl, sv)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  async function handleAgregarGol(p: Partido, equipoId: string) {
    const form = golForm[p.id]
    if (!form?.jugadorId) { setError('Elegí el jugador que anotó'); return }
    setError('')
    const res = await registrarGol({
      partido_id: p.id, jugador_id: form.jugadorId, equipo_id: equipoId,
      minuto: form.minuto ? parseInt(form.minuto) : undefined,
      tipo: (form.tipo || 'normal') as any,
    })
    if (res.error) { setError(res.error); return }
    setGolForm(prev => ({ ...prev, [p.id]: { jugadorId: '', minuto: '', tipo: 'normal' } }))
    cargar()
  }

  async function handleEliminarGol(golId: string) {
    const res = await eliminarGol(golId)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  async function handleAgregarTarjeta(p: Partido, equipoId: string) {
    const form = tarjetaForm[p.id]
    if (!form?.jugadorId || !form?.tipo) { setError('Elegí jugador y tipo de tarjeta'); return }
    setError('')
    const res = await registrarTarjeta({
      partido_id: p.id, jugador_id: form.jugadorId, equipo_id: equipoId,
      tipo: form.tipo as any,
      minuto: form.minuto ? parseInt(form.minuto) : undefined,
      motivo: form.motivo || undefined,
    })
    if (res.error) { setError(res.error); return }
    setTarjetaForm(prev => ({ ...prev, [p.id]: { jugadorId: '', tipo: 'amarilla', minuto: '', motivo: '' } }))
    cargar()
  }

  async function handleEliminarTarjeta(tarjetaId: string) {
    const res = await eliminarTarjeta(tarjetaId)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  async function handleWO(p: Partido) {
    const equipoId = woEquipo[p.id]
    if (!equipoId) { setError('Elegí qué equipo no se presentó'); return }
    setError('')
    const res = await registrarWO(p.id, equipoId)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  async function handleSuspender(p: Partido) {
    setError('')
    const res = await suspenderPartido(p.id, 'Suspendido por el organizador')
    if (res.error) { setError(res.error); return }
    cargar()
  }

  async function handleFinalizar(p: Partido) {
    setError('')
    const res = await finalizarPartido(p.id)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  async function handleTerminarFecha() {
    setTerminandoFecha(true); setError('')
    const res = await terminarFecha(fechaId)
    setTerminandoFecha(false)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  if (authLoading || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (!fecha) return (
    <AppLayout perfil={perfil}>
      <div style={{ textAlign: 'center', padding: 60, color: muted }}>Fecha no encontrada</div>
    </AppLayout>
  )

  const todosCerrados = partidos.length > 0 && partidos.every(p => ['finalizado', 'wo', 'suspendido'].includes(p.estado))

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push(`/liga-futbol/${ligaId}/fixture`)}
          style={{ background: 'none', border: 'none', color: muted, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Volver al fixture
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: ink, letterSpacing: '-0.5px' }}>
              {fecha.es_playoff ? '🏆' : '📆'} {fecha.nombre || `Fecha ${fecha.numero}`}
            </h1>
            <div style={{ fontSize: 13, color: hint, marginTop: 4 }}>{ligaNombre}</div>
          </div>

          {fecha.estado !== 'finalizada' && (
            <button
              onClick={handleTerminarFecha}
              disabled={terminandoFecha || !todosCerrados}
              title={!todosCerrados ? 'Todos los partidos deben tener resultado' : ''}
              style={{
                ...btn, padding: '9px 18px', fontSize: 13,
                background: todosCerrados ? 'linear-gradient(135deg, #059669, #10b981)' : '#94a3b8',
                color: 'white', cursor: todosCerrados ? 'pointer' : 'default',
              }}>
              {terminandoFecha ? 'Cerrando...' : '✅ Terminar fecha'}
            </button>
          )}
          {fecha.estado === 'finalizada' && (
            <span style={{ background: '#f1f5f9', color: muted, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              ✅ Fecha finalizada
            </span>
          )}
        </div>
      </div>

      {error && (
        <div onClick={() => setError('')} style={{
          background: '#fef2f2', color: '#dc2626', borderRadius: 10,
          padding: '10px 14px', fontSize: 13, marginBottom: 16,
          cursor: 'pointer', border: '1px solid #fecaca',
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {partidos.map(p => {
          const local = equipoPorId(p.equipo_local_id)
          const visita = equipoPorId(p.equipo_visita_id)
          const est = ESTADO_PARTIDO[p.estado] || ESTADO_PARTIDO.programado
          const exp = expandido === p.id
          const jugsLocal = jugadoresDeEquipo(p.equipo_local_id)
          const jugsVisita = jugadoresDeEquipo(p.equipo_visita_id)
          const golesP = golesDePartido(p.id)
          const tarjetasP = tarjetasDePartido(p.id)
          const editable = !['finalizado', 'wo', 'suspendido'].includes(p.estado)

          return (
            <div key={p.id} style={{
              background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
              boxShadow: '0 2px 10px rgba(15,23,42,0.06)', overflow: 'hidden',
            }}>
              <div onClick={() => setExpandido(exp ? null : p.id)} style={{
                padding: '14px 20px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                  <span style={{ fontSize: 12, color: hint, width: 50 }}>{p.hora ? p.hora.slice(0, 5) : '—'}</span>
                  <span style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: 700, color: ink }}>{local?.nombre}</span>
                  <span style={{
                    fontSize: 15, fontWeight: 800, minWidth: 50, textAlign: 'center',
                    color: p.goles_local !== null ? ink : hint,
                  }}>
                    {p.goles_local !== null ? `${p.goles_local} - ${p.goles_visita}` : 'vs'}
                  </span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: ink }}>{visita?.nombre}</span>
                </div>
                <span style={{ background: est.bg, color: est.color, padding: '3px 10px', borderRadius: 16, fontSize: 11, fontWeight: 700 }}>
                  {est.label}
                </span>
              </div>

              {exp && (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Acciones de estado */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {p.estado === 'programado' && (
                      <button onClick={() => handleIniciar(p)} style={{ ...btn, background: green, color: 'white' }}>▶ Iniciar partido</button>
                    )}
                    {editable && (
                      <button onClick={() => handleFinalizar(p)} style={{ ...btn, background: '#334155', color: 'white' }}>🏁 Finalizar</button>
                    )}
                    {editable && (
                      <button onClick={() => handleSuspender(p)} style={{ ...btn, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>⏸ Suspender</button>
                    )}
                  </div>

                  {/* Marcador rápido */}
                  {editable && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: muted, marginBottom: 8 }}>Marcador</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, color: ink, width: 100, textAlign: 'right' }}>{local?.nombre}</span>
                        <input type="number" min={0} style={{ width: 56, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center' }}
                          value={scoreLocal[p.id] ?? p.goles_local ?? ''}
                          onChange={e => setScoreLocal(prev => ({ ...prev, [p.id]: e.target.value }))} />
                        <span style={{ color: hint }}>—</span>
                        <input type="number" min={0} style={{ width: 56, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center' }}
                          value={scoreVisita[p.id] ?? p.goles_visita ?? ''}
                          onChange={e => setScoreVisita(prev => ({ ...prev, [p.id]: e.target.value }))} />
                        <span style={{ fontSize: 13, color: ink, width: 100 }}>{visita?.nombre}</span>
                        <button onClick={() => handleGuardarResultado(p)} style={{ ...btn, background: green, color: 'white' }}>Guardar</button>
                      </div>
                    </div>
                  )}

                  {/* Goles */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: muted, marginBottom: 8 }}>⚽ Goles</div>
                    {golesP.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                        {golesP.map(g => (
                          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ink }}>
                            <span style={{ color: hint, width: 30 }}>{g.minuto ? `${g.minuto}'` : ''}</span>
                            <span>{jugadorPorId(g.jugador_id)?.nombre || '—'}</span>
                            {g.tipo !== 'normal' && <span style={{ fontSize: 11, color: hint }}>({g.tipo === 'penal' ? 'penal' : 'autogol'})</span>}
                            <span style={{ fontSize: 11, color: hint }}>· {equipoPorId(g.equipo_id)?.nombre}</span>
                            {editable && <button onClick={() => handleEliminarGol(g.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}>×</button>}
                          </div>
                        ))}
                      </div>
                    )}
                    {editable && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, minWidth: 160 }}
                          value={golForm[p.id]?.jugadorId || ''}
                          onChange={e => setGolForm(prev => ({ ...prev, [p.id]: { ...prev[p.id], jugadorId: e.target.value, minuto: prev[p.id]?.minuto || '', tipo: prev[p.id]?.tipo || 'normal' } }))}>
                          <option value="">Jugador...</option>
                          <optgroup label={local?.nombre}>{jugsLocal.map(j => <option key={j.id} value={j.id}>{j.numero ? `#${j.numero} ` : ''}{j.nombre}</option>)}</optgroup>
                          <optgroup label={visita?.nombre}>{jugsVisita.map(j => <option key={j.id} value={j.id}>{j.numero ? `#${j.numero} ` : ''}{j.nombre}</option>)}</optgroup>
                        </select>
                        <input type="number" min={0} max={120} placeholder="Min" style={{ width: 56, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                          value={golForm[p.id]?.minuto || ''}
                          onChange={e => setGolForm(prev => ({ ...prev, [p.id]: { ...prev[p.id], jugadorId: prev[p.id]?.jugadorId || '', minuto: e.target.value, tipo: prev[p.id]?.tipo || 'normal' } }))} />
                        <select style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                          value={golForm[p.id]?.tipo || 'normal'}
                          onChange={e => setGolForm(prev => ({ ...prev, [p.id]: { ...prev[p.id], jugadorId: prev[p.id]?.jugadorId || '', minuto: prev[p.id]?.minuto || '', tipo: e.target.value } }))}>
                          <option value="normal">Normal</option>
                          <option value="penal">Penal</option>
                          <option value="autogol">Autogol</option>
                        </select>
                        <button
                          onClick={() => {
                            const jugId = golForm[p.id]?.jugadorId
                            const equipoId = jugId ? jugadorPorId(jugId)?.equipo_id : null
                            if (equipoId) handleAgregarGol(p, equipoId)
                            else setError('Elegí el jugador que anotó')
                          }}
                          style={{ ...btn, background: green, color: 'white' }}>+ Gol</button>
                      </div>
                    )}
                  </div>

                  {/* Tarjetas */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: muted, marginBottom: 8 }}>🟨🟥 Tarjetas</div>
                    {tarjetasP.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                        {tarjetasP.map(t => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ink }}>
                            <span>{t.tipo === 'roja' ? '🟥' : t.tipo === 'doble_amarilla' ? '🟨🟥' : '🟨'}</span>
                            <span style={{ color: hint, width: 30 }}>{t.minuto ? `${t.minuto}'` : ''}</span>
                            <span>{jugadorPorId(t.jugador_id)?.nombre || '—'}</span>
                            <span style={{ fontSize: 11, color: hint }}>· {equipoPorId(t.equipo_id)?.nombre}</span>
                            {editable && <button onClick={() => handleEliminarTarjeta(t.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}>×</button>}
                          </div>
                        ))}
                      </div>
                    )}
                    {editable && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, minWidth: 160 }}
                          value={tarjetaForm[p.id]?.jugadorId || ''}
                          onChange={e => setTarjetaForm(prev => ({ ...prev, [p.id]: { jugadorId: e.target.value, tipo: prev[p.id]?.tipo || 'amarilla', minuto: prev[p.id]?.minuto || '', motivo: prev[p.id]?.motivo || '' } }))}>
                          <option value="">Jugador...</option>
                          <optgroup label={local?.nombre}>{jugsLocal.map(j => <option key={j.id} value={j.id}>{j.numero ? `#${j.numero} ` : ''}{j.nombre}</option>)}</optgroup>
                          <optgroup label={visita?.nombre}>{jugsVisita.map(j => <option key={j.id} value={j.id}>{j.numero ? `#${j.numero} ` : ''}{j.nombre}</option>)}</optgroup>
                        </select>
                        <select style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                          value={tarjetaForm[p.id]?.tipo || 'amarilla'}
                          onChange={e => setTarjetaForm(prev => ({ ...prev, [p.id]: { jugadorId: prev[p.id]?.jugadorId || '', tipo: e.target.value, minuto: prev[p.id]?.minuto || '', motivo: prev[p.id]?.motivo || '' } }))}>
                          <option value="amarilla">Amarilla</option>
                          <option value="roja">Roja directa</option>
                          <option value="doble_amarilla">Doble amarilla</option>
                        </select>
                        <input type="number" min={0} max={120} placeholder="Min" style={{ width: 56, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                          value={tarjetaForm[p.id]?.minuto || ''}
                          onChange={e => setTarjetaForm(prev => ({ ...prev, [p.id]: { jugadorId: prev[p.id]?.jugadorId || '', tipo: prev[p.id]?.tipo || 'amarilla', minuto: e.target.value, motivo: prev[p.id]?.motivo || '' } }))} />
                        <button
                          onClick={() => {
                            const jugId = tarjetaForm[p.id]?.jugadorId
                            const equipoId = jugId ? jugadorPorId(jugId)?.equipo_id : null
                            if (equipoId) handleAgregarTarjeta(p, equipoId)
                            else setError('Elegí el jugador')
                          }}
                          style={{ ...btn, background: '#d97706', color: 'white' }}>+ Tarjeta</button>
                      </div>
                    )}
                  </div>

                  {/* W.O. */}
                  {editable && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: muted, marginBottom: 8 }}>W.O. — Equipo que no se presenta</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                          value={woEquipo[p.id] || ''}
                          onChange={e => setWoEquipo(prev => ({ ...prev, [p.id]: e.target.value }))}>
                          <option value="">Elegir equipo...</option>
                          <option value={p.equipo_local_id}>{local?.nombre}</option>
                          <option value={p.equipo_visita_id}>{visita?.nombre}</option>
                        </select>
                        <button onClick={() => handleWO(p)} style={{ ...btn, background: '#dc2626', color: 'white' }}>Registrar W.O.</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {partidos.length === 0 && (
          <div style={{ background: '#ffffff', border: '2px dashed #d1d5db', borderRadius: 16, padding: '40px 24px', textAlign: 'center', color: muted }}>
            Sin partidos en esta fecha
          </div>
        )}
      </div>
    </AppLayout>
  )
}
