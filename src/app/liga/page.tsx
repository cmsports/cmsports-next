'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { crearLiga, eliminarLiga } from '@/app/actions/liga'

const supabase = createClient()

const ink   = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

const inp = {
  width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '10px 12px', color: ink, fontSize: 14, outline: 'none',
} as const

const ESTADO: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  planificacion: { label: 'Planificación', color: '#6366f1', bg: '#eef2ff', dot: '📋' },
  en_curso:      { label: 'En curso',      color: '#059669', bg: '#d1fae5', dot: '🟢' },
  finalizada:    { label: 'Finalizada',    color: '#64748b', bg: '#f1f5f9', dot: '✅' },
}

// Color de acento por estado (borde superior de la card)
const ACCENT: Record<string, string> = {
  planificacion: '#6366f1',
  en_curso:      '#10b981',
  finalizada:    '#94a3b8',
}

interface Liga { id: string; nombre: string; estado: string; creado_en: string }

export default function LigaPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [ligas, setLigas] = useState<Liga[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [numDivisiones, setNumDivisiones] = useState('')
  const [jugadoresPorDivision, setJugadoresPorDivision] = useState('')
  const [totalFechas, setTotalFechas] = useState('5')
  const [montoInscripcion, setMontoInscripcion] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (!perfil.club_id) return

    let vigente = true
    supabase.from('ligas').select('id, nombre, estado, creado_en')
      .eq('club_id', perfil.club_id)
      .order('creado_en', { ascending: false })
      .then(({ data }) => {
        if (!vigente) return
        setLigas(data || [])
        setLoading(false)
      })
    return () => { vigente = false }
  }, [authLoading, perfil, router])

  async function handleCrear() {
    if (!nombre.trim()) return
    setCreando(true); setError('')
    const res = await crearLiga({
      nombre,
      numDivisiones: numDivisiones ? parseInt(numDivisiones) : undefined,
      jugadoresPorDivision: jugadoresPorDivision ? parseInt(jugadoresPorDivision) : undefined,
      totalFechas: totalFechas ? parseInt(totalFechas) : 5,
      montoInscripcionDefault: montoInscripcion ? parseInt(montoInscripcion) : undefined,
    })
    setCreando(false)
    if (res.error) { setError(res.error); return }
    setModalOpen(false); setNombre(''); setNumDivisiones(''); setJugadoresPorDivision(''); setTotalFechas('5'); setMontoInscripcion('')
    if (res.ligaId) router.push(`/liga/${res.ligaId}`)
  }

  async function handleEliminar(ligaId: string) {
    setEliminandoId(ligaId)
    const res = await eliminarLiga({ ligaId })
    setEliminandoId(null); setConfirmandoId(null)
    if (res.error) { setError(res.error); return }
    setLigas(prev => prev.filter(l => l.id !== ligaId))
  }

  if (authLoading || (Boolean(perfil?.club_id) && loading)) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: ink, letterSpacing: '-0.5px' }}>🏓 Ligas</h1>
          <p style={{ fontSize: 12, color: hint, marginTop: 2 }}>{ligas.length} liga{ligas.length !== 1 ? 's' : ''} registrada{ligas.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: 'white', border: 'none', borderRadius: 10,
            padding: '10px 18px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          ＋ Nueva liga
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          onClick={() => setError('')}
          style={{
            background: '#fef2f2', color: '#dc2626', borderRadius: 10,
            padding: '10px 14px', fontSize: 13, marginBottom: 16,
            cursor: 'pointer', border: '1px solid #fecaca',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
          ⚠️ {error}
        </div>
      )}

      {/* Lista de ligas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ligas.map(liga => {
          const est = ESTADO[liga.estado] || { label: liga.estado, color: muted, bg: '#f4f7fa', dot: '⚪' }
          const accent = ACCENT[liga.estado] || '#e2e8f0'
          const confirmando = confirmandoId === liga.id
          const eliminando = eliminandoId === liga.id

          return (
            <div
              key={liga.id}
              onClick={() => { if (!confirmando) router.push(`/liga/${liga.id}`) }}
              style={{
                background: '#ffffff',
                borderRadius: 14,
                boxShadow: '0 2px 12px rgba(15,23,42,0.09)',
                border: '1px solid #e2e8f0',
                borderTop: `3px solid ${accent}`,
                padding: '18px 20px',
                cursor: confirmando ? 'default' : 'pointer',
                transition: 'box-shadow 0.15s, transform 0.1s',
              }}
              onMouseEnter={e => { if (!confirmando) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(15,23,42,0.14)' }}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(15,23,42,0.09)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ink, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {liga.nombre}
                  </div>
                  <div style={{ fontSize: 12, color: hint }}>
                    Creada el {new Date(liga.creado_en).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    background: est.bg, color: est.color,
                    padding: '4px 12px', borderRadius: 20,
                    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    border: `1px solid ${est.color}33`,
                  }}>
                    {est.dot} {est.label}
                  </span>

                  {confirmando ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>¿Eliminar?</span>
                      <button
                        onClick={() => handleEliminar(liga.id)}
                        disabled={eliminando}
                        style={{
                          background: '#dc2626', color: 'white', border: 'none',
                          borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700,
                          cursor: eliminando ? 'default' : 'pointer', opacity: eliminando ? 0.6 : 1,
                          whiteSpace: 'nowrap',
                        }}>
                        {eliminando ? '...' : 'Sí, borrar'}
                      </button>
                      <button
                        onClick={() => setConfirmandoId(null)}
                        style={{
                          background: 'transparent', border: '1px solid #e2e8f0',
                          borderRadius: 8, padding: '5px 10px', fontSize: 12, color: muted, cursor: 'pointer',
                        }}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmandoId(liga.id) }}
                      title="Eliminar liga"
                      style={{
                        background: 'transparent', border: '1px solid #fecaca',
                        borderRadius: 8, padding: '5px 9px', fontSize: 14, color: '#dc2626',
                        cursor: 'pointer', lineHeight: 1,
                      }}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {ligas.length === 0 && (
          <div style={{
            background: '#ffffff', border: '2px dashed #e2e8f0',
            borderRadius: 16, padding: '48px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: muted, marginBottom: 6 }}>Sin ligas todavía</div>
            <div style={{ fontSize: 13, color: hint }}>Creá la primera para empezar a armar divisiones y fixture</div>
          </div>
        )}
      </div>

      {/* Modal nueva liga */}
      {modalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div style={{
            background: '#ffffff', borderRadius: 20, padding: 0,
            width: '100%', maxWidth: 440,
            boxShadow: '0 20px 60px rgba(15,23,42,0.25)', overflow: 'hidden',
          }}>
            {/* Header del modal */}
            <div style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '20px 24px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>🏆 Nueva liga</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Configurá los parámetros iniciales</div>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Nombre de la liga</label>
                <input style={inp} placeholder="Ej: Liga Invierno 2026" value={nombre} onChange={e => setNombre(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCrear()} />
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Fechas de temporada</label>
                  <input type="number" min={2} style={inp} placeholder="5" value={totalFechas} onChange={e => setTotalFechas(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Inscripción ($)</label>
                  <input type="number" min={0} style={inp} placeholder="Ej: 10000" value={montoInscripcion} onChange={e => setMontoInscripcion(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Divisiones</label>
                  <input type="number" min={1} style={inp} placeholder="Ej: 5" value={numDivisiones} onChange={e => setNumDivisiones(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Jugadores / división</label>
                  <input type="number" min={2} style={inp} placeholder="Ej: 12" value={jugadoresPorDivision} onChange={e => setJugadoresPorDivision(e.target.value)} />
                </div>
              </div>

              <div style={{ fontSize: 11, color: hint, marginBottom: 20 }}>
                💡 La última fecha es siempre de ajuste · Divisiones y jugadores son opcionales
              </div>

              {error && (
                <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '9px 12px', fontSize: 12, marginBottom: 14, border: '1px solid #fecaca' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setModalOpen(false)}
                  style={{ flex: 1, padding: 12, background: '#f4f7fa', border: 'none', borderRadius: 10, color: muted, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>
                  Cancelar
                </button>
                <button
                  onClick={handleCrear}
                  disabled={creando || !nombre.trim()}
                  style={{
                    flex: 2, padding: 12,
                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    border: 'none', borderRadius: 10, color: 'white',
                    fontSize: 14, fontWeight: 700, cursor: creando ? 'default' : 'pointer',
                    opacity: creando || !nombre.trim() ? 0.6 : 1,
                    boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                  }}>
                  {creando ? 'Creando...' : '🏆 Crear liga'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
