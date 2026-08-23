'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { useEnVivo } from '@/lib/useEnVivo'
import LigaFutbolNav from '@/components/liga-futbol/LigaFutbolNav'

const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => ({ default: m.QRCodeSVG })), { ssr: false })
import {
  crearEquipo, editarEquipo, eliminarEquipo, registrarPagoEquipo,
  crearJugadorEquipo, editarJugadorEquipo, eliminarJugadorEquipo,
  generarFixtureLiga, editarLigaFutbol,
} from '@/app/actions/liga-futbol'

const supabase = createClient()

const ink = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const green = '#059669'

const inp: React.CSSProperties = {
  width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: 10, padding: '10px 14px', color: ink, fontSize: 14, outline: 'none',
}

const TABS = ['Equipos', 'Pagos', 'Reglamento'] as const
type Tab = typeof TABS[number]

const ESTADO_PAGO: Record<string, { label: string; color: string; bg: string }> = {
  pagado:    { label: 'Pagado',    color: '#059669', bg: '#d1fae5' },
  abonado:   { label: 'Abonado',   color: '#d97706', bg: '#fef3c7' },
  pendiente: { label: 'Pendiente', color: '#dc2626', bg: '#fef2f2' },
}

interface Liga {
  id: string; nombre: string; estado: string; formato: string
  deporte_variante: string; categoria: string; max_equipos: number
  monto_inscripcion: number; cancha: string | null; dia_juego: string | null
  fecha_inicio: string | null; fecha_fin: string | null
  ruedas: number; horarios: string[] | null
  codigo_publico: string | null
  reglamento: string | null
}

interface Equipo {
  id: string; nombre: string; estado_inscripcion: string; monto_pagado: number
  delegado_nombre: string | null; delegado_telefono: string | null; delegado_email: string | null
  color_principal: string | null; observaciones: string | null; grupo_id: string | null
}

interface Jugador {
  id: string; equipo_id: string; nombre: string; rut: string | null
  numero: number | null; posicion: string | null; fecha_nacimiento: string | null
  estado: string
}

export default function LigaFutbolDetalle() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const params = useParams()
  const ligaId = params.id as string

  const [liga, setLiga] = useState<Liga | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Equipos')
  const [error, setError] = useState('')

  // Modals
  const [modalEquipo, setModalEquipo] = useState(false)
  const [editEquipo, setEditEquipo] = useState<Equipo | null>(null)
  const [eqNombre, setEqNombre] = useState('')
  const [eqDelegado, setEqDelegado] = useState('')
  const [eqTelefono, setEqTelefono] = useState('')
  const [eqEmail, setEqEmail] = useState('')
  const [eqColor, setEqColor] = useState('#059669')
  const [guardando, setGuardando] = useState(false)

  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null)

  // Equipo expandido para ver plantilla
  const [expandedEquipo, setExpandedEquipo] = useState<string | null>(null)

  // Modal jugador
  const [modalJugador, setModalJugador] = useState<string | null>(null) // equipo_id
  const [editJugador, setEditJugador] = useState<Jugador | null>(null)
  const [jNombre, setJNombre] = useState('')
  const [jRut, setJRut] = useState('')
  const [jNumero, setJNumero] = useState('')
  const [jPosicion, setJPosicion] = useState('')

  // Modal pago
  const [modalPago, setModalPago] = useState<string | null>(null) // equipo_id
  const [montoPago, setMontoPago] = useState('')
  const [metodoPago, setMetodoPago] = useState('')

  // Generar fixture
  const [generandoFixture, setGenerandoFixture] = useState(false)
  const [fixtureGenerado, setFixtureGenerado] = useState(false)

  // Compartir vista pública
  const [modalCompartir, setModalCompartir] = useState(false)
  const [copiado, setCopiado] = useState(false)

  // Reglamento
  const [reglamentoTexto, setReglamentoTexto] = useState('')
  const [guardandoReglamento, setGuardandoReglamento] = useState(false)
  const [reglamentoGuardado, setReglamentoGuardado] = useState(false)

  useEnVivo(['lf_ligas', 'lf_equipos', 'lf_jugadores'], perfil?.club_id ?? null, () => cargar())

  function cargar() {
    if (!ligaId) return
    Promise.all([
      supabase.from('lf_ligas').select('*').eq('id', ligaId).single(),
      supabase.from('lf_equipos').select('*').eq('liga_id', ligaId).order('creado_en'),
      supabase.from('lf_fechas').select('id', { count: 'exact', head: true }).eq('liga_id', ligaId),
    ]).then(([ligaRes, eqRes, fechasRes]) => {
      if (ligaRes.data) setLiga(ligaRes.data as any)
      setEquipos(eqRes.data as any || [])
      setFixtureGenerado((fechasRes.count ?? 0) > 0)
      setLoading(false)
    })
    // Jugadores vía join, no es directo desde lf_jugadores
    supabase.from('lf_jugadores').select('*, lf_equipos!inner(liga_id)')
      .eq('lf_equipos.liga_id', ligaId)
      .order('numero')
      .then(({ data }) => setJugadores((data as any) || []))
  }

  async function handleGenerarFixture() {
    setGenerandoFixture(true); setError('')
    const res = await generarFixtureLiga(ligaId)
    setGenerandoFixture(false)
    if (res.error) { setError(res.error); return }
    setFixtureGenerado(true)
    router.push(`/liga-futbol/${ligaId}/fixture`)
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, perfil, ligaId])

  // Solo se sincroniza al cambiar de liga, no en cada refresco de cargar() —
  // si no, el polling en vivo borraría lo que el admin está escribiendo.
  useEffect(() => {
    if (liga) setReglamentoTexto(liga.reglamento || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liga?.id])

  async function handleGuardarReglamento() {
    setGuardandoReglamento(true); setError('')
    const res = await editarLigaFutbol(ligaId, { reglamento: reglamentoTexto || null })
    setGuardandoReglamento(false)
    if (res.error) { setError(res.error); return }
    setReglamentoGuardado(true)
    setTimeout(() => setReglamentoGuardado(false), 2000)
  }

  // ─── Equipo handlers ──────────────────────────

  function openEquipoModal(eq?: Equipo) {
    if (eq) {
      setEditEquipo(eq)
      setEqNombre(eq.nombre); setEqDelegado(eq.delegado_nombre || '')
      setEqTelefono(eq.delegado_telefono || ''); setEqEmail(eq.delegado_email || '')
      setEqColor(eq.color_principal || '#059669')
    } else {
      setEditEquipo(null)
      setEqNombre(''); setEqDelegado(''); setEqTelefono(''); setEqEmail(''); setEqColor('#059669')
    }
    setModalEquipo(true)
  }

  async function handleGuardarEquipo() {
    if (!eqNombre.trim()) { setError('El nombre del equipo es obligatorio'); return }
    setGuardando(true); setError('')
    if (editEquipo) {
      const res = await editarEquipo(editEquipo.id, {
        nombre: eqNombre, delegado_nombre: eqDelegado || null,
        delegado_telefono: eqTelefono || null, delegado_email: eqEmail || null,
        color_principal: eqColor,
      })
      if (res.error) { setError(res.error); setGuardando(false); return }
    } else {
      const res = await crearEquipo({
        liga_id: ligaId, nombre: eqNombre,
        delegado_nombre: eqDelegado || undefined,
        delegado_telefono: eqTelefono || undefined,
        delegado_email: eqEmail || undefined,
        color_principal: eqColor,
      })
      if (res.error) { setError(res.error); setGuardando(false); return }
    }
    setGuardando(false); setModalEquipo(false); cargar()
  }

  async function handleEliminarEquipo(id: string) {
    const res = await eliminarEquipo(id)
    setConfirmEliminar(null)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  // ─── Jugador handlers ─────────────────────────

  function openJugadorModal(equipoId: string, jug?: Jugador) {
    if (jug) {
      setEditJugador(jug)
      setJNombre(jug.nombre); setJRut(jug.rut || '')
      setJNumero(jug.numero?.toString() || ''); setJPosicion(jug.posicion || '')
    } else {
      setEditJugador(null)
      setJNombre(''); setJRut(''); setJNumero(''); setJPosicion('')
    }
    setModalJugador(equipoId)
  }

  async function handleGuardarJugador() {
    if (!jNombre.trim()) { setError('El nombre es obligatorio'); return }
    setGuardando(true); setError('')
    if (editJugador) {
      const res = await editarJugadorEquipo(editJugador.id, {
        nombre: jNombre, rut: jRut || null,
        numero: jNumero ? parseInt(jNumero) : null,
        posicion: jPosicion || null,
      })
      if (res.error) { setError(res.error); setGuardando(false); return }
    } else {
      const res = await crearJugadorEquipo({
        equipo_id: modalJugador!,
        nombre: jNombre, rut: jRut || undefined,
        numero: jNumero ? parseInt(jNumero) : undefined,
        posicion: jPosicion || undefined,
      })
      if (res.error) { setError(res.error); setGuardando(false); return }
    }
    setGuardando(false); setModalJugador(null); cargar()
  }

  async function handleEliminarJugador(id: string) {
    const res = await eliminarJugadorEquipo(id)
    if (res.error) { setError(res.error); return }
    cargar()
  }

  // ─── Pago handler ─────────────────────────────

  async function handlePago() {
    if (!modalPago || !montoPago) return
    setGuardando(true); setError('')
    const res = await registrarPagoEquipo(modalPago, parseInt(montoPago), metodoPago || undefined)
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setModalPago(null); setMontoPago(''); setMetodoPago(''); cargar()
  }

  if (authLoading || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (!liga) return (
    <AppLayout perfil={perfil}>
      <div style={{ textAlign: 'center', padding: 60, color: muted }}>Liga no encontrada</div>
    </AppLayout>
  )

  const jugadoresDeEquipo = (eqId: string) => jugadores.filter(j => j.equipo_id === eqId)

  const totalEsperado = equipos.length * liga.monto_inscripcion
  const totalRecaudado = equipos.reduce((sum, eq) => sum + eq.monto_pagado, 0)

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push('/liga-futbol')}
          style={{
            background: 'none', border: 'none', color: muted, fontSize: 13,
            cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4,
          }}>
          ← Volver a ligas
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: ink, letterSpacing: '-0.5px' }}>
              ⚽ {liga.nombre}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 13, color: muted }}>
              <span style={{
                background: '#d1fae5', color: green, padding: '3px 10px',
                borderRadius: 20, fontSize: 11, fontWeight: 700,
              }}>
                {liga.estado === 'inscripcion' ? '📋 Inscripción' :
                 liga.estado === 'en_curso' ? '🟢 En curso' :
                 liga.estado === 'playoffs' ? '🏆 Playoffs' :
                 liga.estado === 'finalizada' ? '✅ Finalizada' : liga.estado}
              </span>
              {liga.cancha && <span>📍 {liga.cancha}</span>}
              {liga.dia_juego && <span>📅 {liga.dia_juego}</span>}
              <span>👥 {equipos.length}/{liga.max_equipos}</span>
              {liga.monto_inscripcion > 0 && <span>💰 ${liga.monto_inscripcion.toLocaleString('es-CL')}</span>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {liga.codigo_publico && (
              <button
                onClick={() => setModalCompartir(true)}
                style={{
                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
                  padding: '10px 16px', fontSize: 12, color: '#166534', cursor: 'pointer', textAlign: 'left',
                }}>
                <div style={{ fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Código público <span style={{ fontSize: 10, opacity: 0.7 }}>· compartir</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>{liga.codigo_publico}</div>
              </button>
            )}

            {fixtureGenerado ? (
              <button
                onClick={() => router.push(`/liga-futbol/${ligaId}/fixture`)}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white',
                  border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 13,
                  fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 10px rgba(99,102,241,0.3)',
                  whiteSpace: 'nowrap', height: 'fit-content',
                }}>
                📅 Ver fixture
              </button>
            ) : (
              <button
                onClick={handleGenerarFixture}
                disabled={generandoFixture || equipos.length < 2}
                title={equipos.length < 2 ? 'Se necesitan al menos 2 equipos' : ''}
                style={{
                  background: equipos.length < 2 ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: 'white', border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 13,
                  fontWeight: 700, cursor: equipos.length < 2 || generandoFixture ? 'default' : 'pointer',
                  boxShadow: '0 3px 10px rgba(99,102,241,0.3)', whiteSpace: 'nowrap', height: 'fit-content',
                }}>
                {generandoFixture ? 'Generando...' : '🎲 Generar fixture'}
              </button>
            )}
          </div>
        </div>
      </div>

      <LigaFutbolNav ligaId={ligaId} />

      {/* Tabs internos: Equipos / Pagos */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px', fontSize: 14, fontWeight: tab === t ? 700 : 500,
              color: tab === t ? green : muted,
              background: 'none', border: 'none',
              borderBottom: tab === t ? `3px solid ${green}` : '3px solid transparent',
              cursor: 'pointer', transition: 'all 0.2s',
              marginBottom: -2,
            }}>
            {t === 'Equipos' ? `⚽ Equipos (${equipos.length})` : t === 'Pagos' ? '💰 Pagos' : '📋 Reglamento'}
          </button>
        ))}
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

      {/* ─── TAB: Equipos ────────────────────────────── */}
      {tab === 'Equipos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button
              onClick={() => openEquipoModal()}
              disabled={equipos.length >= liga.max_equipos}
              style={{
                background: equipos.length >= liga.max_equipos ? '#94a3b8' : 'linear-gradient(135deg, #059669, #10b981)',
                color: 'white', border: 'none', borderRadius: 10,
                padding: '9px 18px', fontSize: 13, fontWeight: 700,
                cursor: equipos.length >= liga.max_equipos ? 'default' : 'pointer',
                boxShadow: '0 3px 10px rgba(5,150,105,0.3)',
              }}>
              ＋ Inscribir equipo
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {equipos.map(eq => {
              const pago = ESTADO_PAGO[eq.estado_inscripcion] || ESTADO_PAGO.pendiente
              const expanded = expandedEquipo === eq.id
              const jugs = jugadoresDeEquipo(eq.id)

              return (
                <div key={eq.id} style={{
                  background: '#ffffff', borderRadius: 16,
                  boxShadow: '0 2px 10px rgba(15,23,42,0.06)',
                  border: '1px solid #e2e8f0', overflow: 'hidden',
                }}>
                  {/* Equipo header */}
                  <div
                    onClick={() => setExpandedEquipo(expanded ? null : eq.id)}
                    style={{
                      padding: '16px 20px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderLeft: `4px solid ${eq.color_principal || '#94a3b8'}`,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: eq.color_principal || '#e2e8f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 800, color: 'white',
                      }}>
                        {eq.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: ink }}>{eq.nombre}</div>
                        <div style={{ fontSize: 12, color: hint }}>
                          {jugs.length} jugador{jugs.length !== 1 ? 'es' : ''}
                          {eq.delegado_nombre && <> · {eq.delegado_nombre}</>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        background: pago.bg, color: pago.color,
                        padding: '3px 10px', borderRadius: 16,
                        fontSize: 11, fontWeight: 700, border: `1px solid ${pago.color}22`,
                      }}>
                        {pago.label}
                      </span>
                      <span style={{ fontSize: 18, color: hint, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                        ▾
                      </span>
                    </div>
                  </div>

                  {/* Expanded: plantilla */}
                  {expanded && (
                    <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: muted }}>Plantilla</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={e => { e.stopPropagation(); openJugadorModal(eq.id) }}
                            style={{
                              background: green, color: 'white', border: 'none', borderRadius: 8,
                              padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>
                            ＋ Jugador
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); openEquipoModal(eq) }}
                            style={{
                              background: '#f1f5f9', color: muted, border: '1px solid #e2e8f0',
                              borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                            }}>
                            Editar
                          </button>
                          {confirmEliminar === eq.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => handleEliminarEquipo(eq.id)} style={{
                                background: '#dc2626', color: 'white', border: 'none', borderRadius: 8,
                                padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              }}>Sí</button>
                              <button onClick={() => setConfirmEliminar(null)} style={{
                                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
                                padding: '5px 8px', fontSize: 12, color: muted, cursor: 'pointer',
                              }}>No</button>
                            </div>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); setConfirmEliminar(eq.id) }}
                              style={{
                                background: 'transparent', border: '1px solid #fecaca', borderRadius: 8,
                                padding: '5px 8px', fontSize: 12, color: '#dc2626', cursor: 'pointer',
                              }}>
                              🗑
                            </button>
                          )}
                        </div>
                      </div>

                      {jugs.length === 0 ? (
                        <div style={{ fontSize: 13, color: hint, textAlign: 'center', padding: '16px 0' }}>
                          Sin jugadores registrados
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ textAlign: 'left', padding: '8px 12px', color: hint, fontWeight: 600, fontSize: 11 }}>#</th>
                                <th style={{ textAlign: 'left', padding: '8px 12px', color: hint, fontWeight: 600, fontSize: 11 }}>Nombre</th>
                                <th style={{ textAlign: 'left', padding: '8px 12px', color: hint, fontWeight: 600, fontSize: 11 }}>RUT</th>
                                <th style={{ textAlign: 'left', padding: '8px 12px', color: hint, fontWeight: 600, fontSize: 11 }}>Posición</th>
                                <th style={{ padding: '8px 12px', width: 80 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {jugs.map(j => (
                                <tr key={j.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: 700, color: ink }}>{j.numero ?? '—'}</td>
                                  <td style={{ padding: '8px 12px', color: ink }}>{j.nombre}</td>
                                  <td style={{ padding: '8px 12px', color: muted }}>{j.rut || '—'}</td>
                                  <td style={{ padding: '8px 12px', color: muted }}>{j.posicion || '—'}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                    <button onClick={() => openJugadorModal(eq.id, j)} style={{
                                      background: 'none', border: 'none', color: '#6366f1', fontSize: 12, cursor: 'pointer', marginRight: 8,
                                    }}>Editar</button>
                                    <button onClick={() => handleEliminarJugador(j.id)} style={{
                                      background: 'none', border: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer',
                                    }}>×</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {equipos.length === 0 && (
              <div style={{
                background: '#ffffff', border: '2px dashed #d1d5db',
                borderRadius: 16, padding: '48px 24px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: muted, marginBottom: 6 }}>Sin equipos inscritos</div>
                <div style={{ fontSize: 13, color: hint }}>Inscribí el primer equipo para empezar a armar la liga</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: Pagos ──────────────────────────────── */}
      {tab === 'Pagos' && (
        <div>
          {/* Resumen financiero */}
          {liga.monto_inscripcion > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12, marginBottom: 20,
            }}>
              {[
                { label: 'Total esperado', value: `$${totalEsperado.toLocaleString('es-CL')}`, color: '#6366f1', bg: '#eef2ff' },
                { label: 'Recaudado', value: `$${totalRecaudado.toLocaleString('es-CL')}`, color: '#059669', bg: '#d1fae5' },
                { label: 'Pendiente', value: `$${(totalEsperado - totalRecaudado).toLocaleString('es-CL')}`, color: '#dc2626', bg: '#fef2f2' },
                { label: 'Cupos', value: `${equipos.length}/${liga.max_equipos}`, color: '#0284c7', bg: '#e0f2fe' },
              ].map(card => (
                <div key={card.label} style={{
                  background: card.bg, borderRadius: 14, padding: '16px 18px',
                  border: `1px solid ${card.color}22`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: card.color, marginBottom: 4 }}>{card.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {equipos.map(eq => {
              const pago = ESTADO_PAGO[eq.estado_inscripcion] || ESTADO_PAGO.pendiente
              const porcentaje = liga.monto_inscripcion > 0
                ? Math.min(100, Math.round((eq.monto_pagado / liga.monto_inscripcion) * 100))
                : 0

              return (
                <div key={eq.id} style={{
                  background: '#ffffff', borderRadius: 14, padding: '16px 20px',
                  border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: eq.color_principal || '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 800, color: 'white',
                    }}>
                      {eq.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{eq.nombre}</div>
                      <div style={{ fontSize: 12, color: hint }}>
                        ${eq.monto_pagado.toLocaleString('es-CL')}
                        {liga.monto_inscripcion > 0 && <> / ${liga.monto_inscripcion.toLocaleString('es-CL')}</>}
                      </div>
                    </div>
                  </div>

                  {liga.monto_inscripcion > 0 && (
                    <div style={{ width: 120 }}>
                      <div style={{
                        height: 6, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${porcentaje}%`, height: '100%', borderRadius: 3,
                          background: pago.color, transition: 'width 0.3s',
                        }} />
                      </div>
                      <div style={{ fontSize: 11, color: hint, marginTop: 3, textAlign: 'right' }}>{porcentaje}%</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      background: pago.bg, color: pago.color,
                      padding: '3px 10px', borderRadius: 16,
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {pago.label}
                    </span>
                    <button
                      onClick={() => { setModalPago(eq.id); setMontoPago(''); setMetodoPago('') }}
                      style={{
                        background: green, color: 'white', border: 'none', borderRadius: 8,
                        padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>
                      + Pago
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── TAB: Reglamento ─────────────────────────── */}
      {tab === 'Reglamento' && (
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20 }}>
          <p style={{ fontSize: 12, color: hint, marginBottom: 12 }}>
            Texto libre visible para el organizador. Definí acá las reglas de la liga: formato, sanciones, horarios, etc.
          </p>
          <textarea
            value={reglamentoTexto}
            onChange={e => setReglamentoTexto(e.target.value)}
            placeholder="Ej: Cada equipo debe presentarse con 5 minutos de anticipación. Tolerancia de espera: 10 minutos, luego se declara W.O..."
            rows={14}
            style={{
              width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
              padding: '12px 14px', fontSize: 14, color: ink, outline: 'none', resize: 'vertical', lineHeight: 1.6,
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              onClick={handleGuardarReglamento}
              disabled={guardandoReglamento}
              style={{
                background: reglamentoGuardado ? '#f0fdf4' : green,
                color: reglamentoGuardado ? '#166534' : 'white',
                border: reglamentoGuardado ? '1px solid #bbf7d0' : 'none',
                borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700,
                cursor: guardandoReglamento ? 'default' : 'pointer',
              }}>
              {guardandoReglamento ? 'Guardando...' : reglamentoGuardado ? '✓ Guardado' : 'Guardar reglamento'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Modal equipo ────────────────────────────── */}
      {modalEquipo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalEquipo(false) }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #059669, #10b981)', padding: '20px 24px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>
                {editEquipo ? '✏️ Editar equipo' : '⚽ Inscribir equipo'}
              </div>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Nombre del equipo *</label>
                <input style={inp} placeholder="Ej: Real United" value={eqNombre} onChange={e => setEqNombre(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Delegado</label>
                  <input style={inp} placeholder="Nombre" value={eqDelegado} onChange={e => setEqDelegado(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Teléfono</label>
                  <input style={inp} placeholder="+56 9..." value={eqTelefono} onChange={e => setEqTelefono(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Email</label>
                  <input style={inp} placeholder="correo@ejemplo.cl" value={eqEmail} onChange={e => setEqEmail(e.target.value)} />
                </div>
                <div style={{ width: 80 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Color</label>
                  <input type="color" value={eqColor} onChange={e => setEqColor(e.target.value)}
                    style={{ width: '100%', height: 42, border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer' }} />
                </div>
              </div>
              {error && <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setModalEquipo(false)} style={{ flex: 1, padding: 12, background: '#f1f5f9', border: 'none', borderRadius: 10, color: muted, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={handleGuardarEquipo} disabled={guardando} style={{
                  flex: 2, padding: 12, background: 'linear-gradient(135deg, #059669, #10b981)',
                  border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700,
                  cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1,
                }}>{guardando ? 'Guardando...' : editEquipo ? 'Guardar' : '⚽ Inscribir'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal jugador ───────────────────────────── */}
      {modalJugador && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalJugador(null) }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '18px 24px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>
                {editJugador ? '✏️ Editar jugador' : '👤 Agregar jugador'}
              </div>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Nombre *</label>
                <input style={inp} placeholder="Nombre completo" value={jNombre} onChange={e => setJNombre(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>RUT</label>
                  <input style={inp} placeholder="12.345.678-9" value={jRut} onChange={e => setJRut(e.target.value)} />
                </div>
                <div style={{ width: 80 }}>
                  <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>#</label>
                  <input type="number" min={0} style={inp} placeholder="10" value={jNumero} onChange={e => setJNumero(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>Posición</label>
                <select style={{ ...inp, cursor: 'pointer' }} value={jPosicion} onChange={e => setJPosicion(e.target.value)}>
                  <option value="">Sin definir</option>
                  <option value="arquero">Arquero</option>
                  <option value="defensa">Defensa</option>
                  <option value="mediocampista">Mediocampista</option>
                  <option value="delantero">Delantero</option>
                </select>
              </div>
              {error && <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setModalJugador(null)} style={{ flex: 1, padding: 12, background: '#f1f5f9', border: 'none', borderRadius: 10, color: muted, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={handleGuardarJugador} disabled={guardando} style={{
                  flex: 2, padding: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700,
                  cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1,
                }}>{guardando ? 'Guardando...' : editJugador ? 'Guardar' : '👤 Agregar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal pago ──────────────────────────────── */}
      {modalPago && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalPago(null) }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #059669, #10b981)', padding: '18px 24px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>💰 Registrar pago</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                {equipos.find(e => e.id === modalPago)?.nombre}
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 6, fontWeight: 600 }}>Monto ($)</label>
              <input type="number" min={1} style={inp} placeholder="Ej: 300000" value={montoPago} onChange={e => setMontoPago(e.target.value)} autoFocus />
              <label style={{ fontSize: 12, color: muted, display: 'block', margin: '14px 0 6px', fontWeight: 600 }}>Método</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                <option value="">Sin especificar</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
              {error && <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginTop: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button onClick={() => setModalPago(null)} style={{ flex: 1, padding: 12, background: '#f1f5f9', border: 'none', borderRadius: 10, color: muted, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={handlePago} disabled={guardando || !montoPago} style={{
                  flex: 2, padding: 12, background: 'linear-gradient(135deg, #059669, #10b981)',
                  border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700,
                  cursor: guardando || !montoPago ? 'default' : 'pointer', opacity: guardando || !montoPago ? 0.6 : 1,
                }}>{guardando ? 'Registrando...' : '💰 Registrar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal compartir ─────────────────────────── */}
      {modalCompartir && liga.codigo_publico && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalCompartir(false) }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #059669, #10b981)', padding: '18px 24px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>📣 Compartir liga</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>Vista pública, sin necesidad de cuenta</div>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ padding: 12, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}/liga-futbol/publica/${liga.codigo_publico}`} size={180} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, color: ink }}>{liga.codigo_publico}</div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/liga-futbol/publica/${liga.codigo_publico}`)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 2000)
                }}
                style={{
                  width: '100%', padding: 12, background: copiado ? '#f0fdf4' : green,
                  color: copiado ? '#166534' : 'white', border: copiado ? '1px solid #bbf7d0' : 'none',
                  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                {copiado ? '✓ Copiado' : '🔗 Copiar link'}
              </button>
              <button onClick={() => setModalCompartir(false)} style={{ background: 'none', border: 'none', color: muted, fontSize: 13, cursor: 'pointer' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
