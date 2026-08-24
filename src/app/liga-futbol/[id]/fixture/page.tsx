'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { useEnVivo } from '@/lib/useEnVivo'
import LigaFutbolNav from '@/components/liga-futbol/LigaFutbolNav'
import { reprogramarPartido, intercambiarLocalVisita } from '@/app/actions/liga-futbol'

const supabase = createClient()

const ink = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const indigo = '#6366f1'

const ESTADO_PARTIDO: Record<string, { label: string; color: string; bg: string }> = {
  programado:    { label: 'Programado',   color: '#6366f1', bg: '#eef2ff' },
  en_curso:      { label: 'En curso',     color: '#059669', bg: '#d1fae5' },
  finalizado:    { label: 'Finalizado',   color: '#64748b', bg: '#f1f5f9' },
  wo:            { label: 'W.O.',         color: '#dc2626', bg: '#fef2f2' },
  suspendido:    { label: 'Suspendido',   color: '#d97706', bg: '#fef3c7' },
  reprogramado:  { label: 'Reprogramado', color: '#d97706', bg: '#fef3c7' },
}

interface Fecha {
  id: string; numero: number; nombre: string | null; fecha: string | null
  es_playoff: boolean; estado: string
}

interface Equipo { id: string; nombre: string; color_principal: string | null }

interface Partido {
  id: string; fecha_id: string | null; grupo_id: string | null
  equipo_local_id: string; equipo_visita_id: string
  goles_local: number | null; goles_visita: number | null
  hora: string | null; cancha: string | null; estado: string
  nueva_fecha: string | null; nueva_hora: string | null
}

interface Grupo { id: string; nombre: string }

export default function FixtureLigaFutbol() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const params = useParams()
  const ligaId = params.id as string

  const [ligaNombre, setLigaNombre] = useState('')
  const [fechas, setFechas] = useState<Fecha[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalReprogramar, setModalReprogramar] = useState<Partido | null>(null)
  const [nuevaFecha, setNuevaFecha] = useState('')
  const [nuevaHora, setNuevaHora] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEnVivo(['lf_partidos', 'lf_fechas'], perfil?.club_id ?? null, () => cargar())

  function cargar() {
    if (!ligaId) return
    Promise.all([
      supabase.from('lf_ligas').select('nombre').eq('id', ligaId).single(),
      supabase.from('lf_fechas').select('*').eq('liga_id', ligaId).order('numero'),
      supabase.from('lf_equipos').select('id, nombre, color_principal').eq('liga_id', ligaId),
      supabase.from('lf_partidos').select('*').eq('liga_id', ligaId),
      supabase.from('lf_grupos').select('id, nombre').eq('liga_id', ligaId).order('orden'),
    ]).then(([ligaRes, fechasRes, eqRes, partRes, gruposRes]) => {
      setLigaNombre(ligaRes.data?.nombre || '')
      setFechas(fechasRes.data as any || [])
      setEquipos(eqRes.data as any || [])
      setPartidos(partRes.data as any || [])
      setGrupos(gruposRes.data as any || [])
      setLoading(false)
    })
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, perfil, ligaId])

  const equipoPorId = (id: string) => equipos.find(e => e.id === id)
  const grupoPorId = (id: string | null) => grupos.find(g => g.id === id)

  async function handleIntercambiar(partidoId: string) {
    setError('')
    const res = await intercambiarLocalVisita(partidoId)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  function abrirReprogramar(p: Partido) {
    setModalReprogramar(p)
    setNuevaFecha(p.nueva_fecha || '')
    setNuevaHora(p.nueva_hora || p.hora || '')
  }

  async function handleReprogramar() {
    if (!modalReprogramar) return
    setGuardando(true); setError('')
    const res = await reprogramarPartido(modalReprogramar.id, {
      nueva_fecha: nuevaFecha || null,
      nueva_hora: nuevaHora || null,
    })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setModalReprogramar(null)
    cargar()
  }

  if (authLoading || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push(`/liga-futbol/${ligaId}`)}
          style={{ background: 'none', border: 'none', color: muted, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Volver a {ligaNombre || 'la liga'}
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: ink, letterSpacing: '-0.5px' }}>📅 Fixture</h1>
      </div>

      <LigaFutbolNav ligaId={ligaId} />

      {error && (
        <div onClick={() => setError('')} style={{
          background: '#fef2f2', color: '#dc2626', borderRadius: 10,
          padding: '10px 14px', fontSize: 13, marginBottom: 16,
          cursor: 'pointer', border: '1px solid #fecaca',
        }}>
          ⚠️ {error}
        </div>
      )}

      {fechas.length === 0 ? (
        <div style={{
          background: '#ffffff', border: '2px dashed #d1d5db',
          borderRadius: 16, padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: muted }}>Fixture no generado todavía</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {fechas.map(fecha => {
            const partidosDeFecha = partidos.filter(p => p.fecha_id === fecha.id)
            if (partidosDeFecha.length === 0) return null

            return (
              <div key={fecha.id} style={{
                background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
                boxShadow: '0 2px 10px rgba(15,23,42,0.06)', overflow: 'hidden',
              }}>
                <div style={{
                  background: fecha.es_playoff ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>
                    {fecha.es_playoff ? '🏆' : '📆'} {fecha.nombre || `Fecha ${fecha.numero}`}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {fecha.fecha && (
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                        {new Date(fecha.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </span>
                    )}
                    <button
                      onClick={() => router.push(`/liga-futbol/${ligaId}/fecha/${fecha.id}`)}
                      style={{
                        background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
                        borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700,
                        color: 'white', cursor: 'pointer',
                      }}>
                      Cargar resultados →
                    </button>
                  </div>
                </div>

                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {partidosDeFecha.map(p => {
                    const local = equipoPorId(p.equipo_local_id)
                    const visita = equipoPorId(p.equipo_visita_id)
                    const grupo = grupoPorId(p.grupo_id)
                    const est = ESTADO_PARTIDO[p.estado] || ESTADO_PARTIDO.programado
                    const jugado = p.estado === 'finalizado' || p.estado === 'wo'

                    return (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px',
                        background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9', flexWrap: 'wrap',
                      }}>
                        <div style={{ width: 62, fontSize: 12, color: muted, fontWeight: 600 }}>
                          {p.hora ? p.hora.slice(0, 5) : '—'}
                        </div>

                        <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                          <span style={{
                            flex: 1, textAlign: 'right', fontSize: 14, fontWeight: 700, color: ink,
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
                          }}>
                            {local?.nombre || '—'}
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: local?.color_principal || '#e2e8f0', flexShrink: 0 }} />
                          </span>

                          <span style={{
                            fontSize: 14, fontWeight: 800, color: jugado ? ink : hint,
                            background: jugado ? '#f1f5f9' : 'transparent',
                            padding: jugado ? '2px 10px' : 0, borderRadius: 8, minWidth: 50, textAlign: 'center',
                          }}>
                            {jugado ? `${p.goles_local ?? 0} - ${p.goles_visita ?? 0}` : 'vs'}
                          </span>

                          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: visita?.color_principal || '#e2e8f0', flexShrink: 0 }} />
                            {visita?.nombre || '—'}
                          </span>
                        </div>

                        {grupo && (
                          <span style={{ fontSize: 10, color: hint, background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>
                            {grupo.nombre}
                          </span>
                        )}

                        <span style={{
                          background: est.bg, color: est.color, padding: '3px 10px',
                          borderRadius: 16, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                        }}>
                          {est.label}
                        </span>

                        {p.estado === 'programado' && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => handleIntercambiar(p.id)}
                              title="Intercambiar local/visita"
                              style={{
                                background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
                                padding: '4px 8px', fontSize: 12, color: muted, cursor: 'pointer',
                              }}>
                              ⇄
                            </button>
                            <button
                              onClick={() => abrirReprogramar(p)}
                              title="Reprogramar"
                              style={{
                                background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
                                padding: '4px 8px', fontSize: 12, color: muted, cursor: 'pointer',
                              }}>
                              🕐
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal reprogramar */}
      {modalReprogramar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalReprogramar(null) }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ background: `linear-gradient(135deg, ${indigo}, #8b5cf6)`, padding: '18px 24px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>🕐 Reprogramar partido</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                {equipoPorId(modalReprogramar.equipo_local_id)?.nombre} vs {equipoPorId(modalReprogramar.equipo_visita_id)?.nombre}
              </div>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 6, fontWeight: 600 }}>Nueva fecha</label>
                <input type="date" style={{ width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}
                  value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 6, fontWeight: 600 }}>Nueva hora</label>
                <input type="time" style={{ width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}
                  value={nuevaHora} onChange={e => setNuevaHora(e.target.value)} />
              </div>
              {error && <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setModalReprogramar(null)} style={{ flex: 1, padding: 12, background: '#f1f5f9', border: 'none', borderRadius: 10, color: muted, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={handleReprogramar} disabled={guardando} style={{
                  flex: 2, padding: 12, background: `linear-gradient(135deg, ${indigo}, #8b5cf6)`,
                  border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700,
                  cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1,
                }}>{guardando ? 'Guardando...' : 'Reprogramar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
