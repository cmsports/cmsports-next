'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { crearLigaFutbol, eliminarLigaFutbol, clonarLigaFutbol } from '@/app/actions/liga-futbol'
import { useEnVivo } from '@/lib/useEnVivo'

const supabase = createClient()

const FORMATOS: { value: string; label: string; desc: string; icon: string }[] = [
  { value: 'todos_vs_todos', label: 'Todos vs todos', desc: 'Cada equipo juega contra todos', icon: '🔄' },
  { value: 'grupos_playoffs', label: 'Grupos + Playoffs', desc: 'Fase de grupos y luego eliminación', icon: '🏟️' },
  { value: 'liga_playoffs', label: 'Liga + Playoffs', desc: 'Tabla general y luego eliminación', icon: '📊' },
]

const VARIANTES = [
  { value: 'futbol_7', label: 'Fútbol 7' },
  { value: 'futbol_11', label: 'Fútbol 11' },
  { value: 'futsal', label: 'Futsal' },
]

const CATEGORIAS = [
  { value: 'todo_competidor', label: 'Todo competidor' },
  { value: 'senior', label: 'Senior (+35)' },
  { value: 'sub_20', label: 'Sub 20' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'mixto', label: 'Mixto' },
]

const ESTADO: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  inscripcion: { label: 'Inscripción', color: '#6366f1', bg: '#eef2ff', dot: '📋' },
  en_curso:    { label: 'En curso',    color: '#059669', bg: '#d1fae5', dot: '🟢' },
  playoffs:    { label: 'Playoffs',    color: '#d97706', bg: '#fef3c7', dot: '🏆' },
  finalizada:  { label: 'Finalizada',  color: '#64748b', bg: '#f1f5f9', dot: '✅' },
  cancelada:   { label: 'Cancelada',   color: '#dc2626', bg: '#fef2f2', dot: '❌' },
}

const ACCENT: Record<string, string> = {
  inscripcion: '#6366f1',
  en_curso:    '#10b981',
  playoffs:    '#f59e0b',
  finalizada:  '#94a3b8',
  cancelada:   '#ef4444',
}

interface Liga {
  id: string; nombre: string; estado: string; creado_en: string
  deporte_variante: string; categoria: string; formato: string
  max_equipos: number; monto_inscripcion: number; cancha: string | null
  dia_juego: string | null; fecha_inicio: string | null
}

export default function LigaFutbolPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [ligas, setLigas] = useState<Liga[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [paso, setPaso] = useState(1)
  const [nombre, setNombre] = useState('')
  const [variante, setVariante] = useState('futbol_7')
  const [categoria, setCategoria] = useState('todo_competidor')
  const [formato, setFormato] = useState('todos_vs_todos')
  const [maxEquipos, setMaxEquipos] = useState('12')
  const [ruedas, setRuedas] = useState('1')
  const [diaJuego, setDiaJuego] = useState('')
  const [cancha, setCancha] = useState('')
  const [direccionCancha, setDireccionCancha] = useState('')
  const [montoInscripcion, setMontoInscripcion] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [horarios, setHorarios] = useState('')
  const [creando, setCreando] = useState(false)

  // Delete
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  // Clonar
  const [clonandoId, setClonandoId] = useState<string | null>(null)
  const [nombreClon, setNombreClon] = useState('')
  const [guardandoClon, setGuardandoClon] = useState(false)

  // Equipos count per liga
  const [equiposCounts, setEquiposCounts] = useState<Record<string, number>>({})

  useEnVivo(['lf_ligas', 'lf_equipos'], perfil?.club_id ?? null, () => cargar())

  function cargar() {
    if (!perfil?.club_id) return
    supabase.from('lf_ligas')
      .select('id, nombre, estado, creado_en, deporte_variante, categoria, formato, max_equipos, monto_inscripcion, cancha, dia_juego, fecha_inicio')
      .eq('club_id', perfil.club_id!)
      .order('creado_en', { ascending: false })
    .then(({ data }) => {
      setLigas(data || [])
      setLoading(false)
      // Count equipos per liga
      if (data && data.length > 0) {
        data.forEach((liga: Liga) => {
          supabase.from('lf_equipos')
            .select('id', { count: 'exact', head: true })
            .eq('liga_id', liga.id)
            .then(({ count }) => {
              setEquiposCounts(prev => ({ ...prev, [liga.id]: count ?? 0 }))
            })
        })
      }
    })
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (!perfil.club_id) return
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, perfil])

  function resetModal() {
    setPaso(1); setNombre(''); setVariante('futbol_7'); setCategoria('todo_competidor')
    setFormato('todos_vs_todos'); setMaxEquipos('12'); setRuedas('1')
    setDiaJuego(''); setCancha(''); setDireccionCancha('')
    setMontoInscripcion(''); setFechaInicio(''); setFechaFin('')
    setHorarios(''); setError('')
  }

  async function handleCrear() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setCreando(true); setError('')
    const res = await crearLigaFutbol({
      nombre,
      deporte_variante: variante,
      categoria,
      formato,
      max_equipos: parseInt(maxEquipos) || 12,
      ruedas: parseInt(ruedas) || 1,
      dia_juego: diaJuego || undefined,
      horarios: horarios ? horarios.split(',').map(h => h.trim()).filter(Boolean) : undefined,
      cancha: cancha || undefined,
      direccion_cancha: direccionCancha || undefined,
      monto_inscripcion: parseInt(montoInscripcion) || 0,
      fecha_inicio: fechaInicio || undefined,
      fecha_fin: fechaFin || undefined,
    })
    setCreando(false)
    if (res.error) { setError(res.error); return }
    setModalOpen(false); resetModal()
    if (res.ligaId) router.push(`/liga-futbol/${res.ligaId}`)
  }

  async function handleEliminar(ligaId: string) {
    setEliminandoId(ligaId)
    const res = await eliminarLigaFutbol(ligaId)
    setEliminandoId(null); setConfirmandoId(null)
    if (res.error) { setError(res.error); return }
    setLigas(prev => prev.filter(l => l.id !== ligaId))
  }

  async function handleClonar() {
    if (!clonandoId || !nombreClon.trim()) return
    setGuardandoClon(true); setError('')
    const res = await clonarLigaFutbol(clonandoId, nombreClon)
    setGuardandoClon(false)
    if (res.error) { setError(res.error); return }
    setClonandoId(null); setNombreClon('')
    if (res.ligaId) router.push(`/liga-futbol/${res.ligaId}`)
  }

  if (authLoading || (Boolean(perfil?.club_id) && loading)) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: '#94a3b8' }}>Cargando...</div>
    </div>
  )

  const inp: React.CSSProperties = {
    width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: '11px 14px', color: '#0f172a', fontSize: 14,
    outline: 'none', transition: 'border-color 0.2s',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6, fontWeight: 600,
  }

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
            ⚽ Ligas de Fútbol
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            {ligas.length} liga{ligas.length !== 1 ? 's' : ''} registrada{ligas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { resetModal(); setModalOpen(true) }}
          style={{
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: 'white', border: 'none', borderRadius: 12,
            padding: '11px 20px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 14px rgba(5,150,105,0.35)',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'transform 0.1s',
          }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          ＋ Nueva liga
        </button>
      </div>

      {error && (
        <div onClick={() => setError('')} style={{
          background: '#fef2f2', color: '#dc2626', borderRadius: 12,
          padding: '12px 16px', fontSize: 13, marginBottom: 16,
          cursor: 'pointer', border: '1px solid #fecaca',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ligas.map(liga => {
          const est = ESTADO[liga.estado] || { label: liga.estado, color: '#64748b', bg: '#f4f7fa', dot: '⚪' }
          const accent = ACCENT[liga.estado] || '#e2e8f0'
          const confirmando = confirmandoId === liga.id
          const eliminando = eliminandoId === liga.id
          const eqCount = equiposCounts[liga.id] ?? 0
          const varLabel = VARIANTES.find(v => v.value === liga.deporte_variante)?.label || liga.deporte_variante
          const catLabel = CATEGORIAS.find(c => c.value === liga.categoria)?.label || liga.categoria

          return (
            <div
              key={liga.id}
              onClick={() => { if (!confirmando) router.push(`/liga-futbol/${liga.id}`) }}
              style={{
                background: '#ffffff',
                borderRadius: 16,
                boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
                border: '1px solid #e2e8f0',
                borderLeft: `4px solid ${accent}`,
                padding: '20px 22px',
                cursor: confirmando ? 'default' : 'pointer',
                transition: 'box-shadow 0.2s, transform 0.1s',
              }}
              onMouseEnter={e => { if (!confirmando) { (e.currentTarget).style.boxShadow = '0 8px 24px rgba(15,23,42,0.14)'; (e.currentTarget).style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { (e.currentTarget).style.boxShadow = '0 2px 12px rgba(15,23,42,0.08)'; (e.currentTarget).style.transform = 'translateY(0)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {liga.nombre}
                    </span>
                    <span style={{
                      background: est.bg, color: est.color,
                      padding: '3px 10px', borderRadius: 20,
                      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                      border: `1px solid ${est.color}22`,
                    }}>
                      {est.dot} {est.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: '#64748b' }}>
                    <span>⚽ {varLabel}</span>
                    <span>🏷️ {catLabel}</span>
                    <span>👥 {eqCount}/{liga.max_equipos} equipos</span>
                    {liga.monto_inscripcion > 0 && (
                      <span>💰 ${liga.monto_inscripcion.toLocaleString('es-CL')}</span>
                    )}
                    {liga.cancha && <span>📍 {liga.cancha}</span>}
                    {liga.dia_juego && <span>📅 {liga.dia_juego}</span>}
                  </div>

                  {liga.fecha_inicio && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                      Inicio: {new Date(liga.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {confirmando ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>¿Eliminar?</span>
                      <button
                        onClick={() => handleEliminar(liga.id)}
                        disabled={eliminando}
                        style={{
                          background: '#dc2626', color: 'white', border: 'none',
                          borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                          cursor: eliminando ? 'default' : 'pointer', opacity: eliminando ? 0.6 : 1,
                        }}>
                        {eliminando ? '...' : 'Sí'}
                      </button>
                      <button
                        onClick={() => setConfirmandoId(null)}
                        style={{
                          background: 'transparent', border: '1px solid #e2e8f0',
                          borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#64748b', cursor: 'pointer',
                        }}>
                        No
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); setClonandoId(liga.id); setNombreClon(`${liga.nombre} (copia)`) }}
                        title="Clonar liga"
                        style={{
                          background: 'transparent', border: '1px solid #e2e8f0',
                          borderRadius: 8, padding: '5px 9px', fontSize: 14, color: '#64748b',
                          cursor: 'pointer', lineHeight: 1, opacity: 0.7, transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                      >
                        📋
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmandoId(liga.id) }}
                        title="Eliminar liga"
                        style={{
                          background: 'transparent', border: '1px solid #fecaca',
                          borderRadius: 8, padding: '5px 9px', fontSize: 14, color: '#dc2626',
                          cursor: 'pointer', lineHeight: 1, opacity: 0.7, transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {ligas.length === 0 && (
          <div style={{
            background: '#ffffff', border: '2px dashed #d1d5db',
            borderRadius: 20, padding: '56px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚽</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
              Sin ligas todavía
            </div>
            <div style={{ fontSize: 14, color: '#94a3b8', maxWidth: 340, margin: '0 auto' }}>
              Creá la primera liga para empezar a inscribir equipos, armar el fixture y llevar la tabla de posiciones
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal wizard ────────────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) { setModalOpen(false); resetModal() } }}>
          <div style={{
            background: '#ffffff', borderRadius: 24, padding: 0,
            width: '100%', maxWidth: 520,
            boxShadow: '0 24px 64px rgba(15,23,42,0.3)', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #059669, #10b981)',
              padding: '22px 28px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>⚽ Nueva liga</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                  Paso {paso} de 3
                </div>
              </div>
              {/* Step indicator */}
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3].map(s => (
                  <div key={s} style={{
                    width: s === paso ? 24 : 8, height: 8, borderRadius: 4,
                    background: s <= paso ? 'white' : 'rgba(255,255,255,0.35)',
                    transition: 'all 0.3s',
                  }} />
                ))}
              </div>
            </div>

            <div style={{ padding: '24px 28px' }}>
              {/* Paso 1: Datos básicos */}
              {paso === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Nombre de la liga *</label>
                    <input style={inp} placeholder="Ej: Apertura 2026" value={nombre} onChange={e => setNombre(e.target.value)} />
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Deporte</label>
                      <select style={{ ...inp, cursor: 'pointer' }} value={variante} onChange={e => setVariante(e.target.value)}>
                        {VARIANTES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Categoría</label>
                      <select style={{ ...inp, cursor: 'pointer' }} value={categoria} onChange={e => setCategoria(e.target.value)}>
                        {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Formato de competencia</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {FORMATOS.map(f => (
                        <label
                          key={f.value}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 16px', borderRadius: 12,
                            border: `2px solid ${formato === f.value ? '#059669' : '#e2e8f0'}`,
                            background: formato === f.value ? '#f0fdf4' : '#ffffff',
                            cursor: 'pointer', transition: 'all 0.2s',
                          }}
                        >
                          <input type="radio" name="formato" value={f.value} checked={formato === f.value}
                            onChange={() => setFormato(f.value)} style={{ display: 'none' }} />
                          <span style={{ fontSize: 24 }}>{f.icon}</span>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{f.label}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{f.desc}</div>
                          </div>
                          {formato === f.value && (
                            <span style={{ marginLeft: 'auto', color: '#059669', fontSize: 18 }}>✓</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Paso 2: Equipos y cancha */}
              {paso === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Máx. equipos</label>
                      <input type="number" min={2} style={inp} value={maxEquipos} onChange={e => setMaxEquipos(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Ruedas (1=ida, 2=ida+vuelta)</label>
                      <select style={{ ...inp, cursor: 'pointer' }} value={ruedas} onChange={e => setRuedas(e.target.value)}>
                        <option value="1">1 — Solo ida</option>
                        <option value="2">2 — Ida y vuelta</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Día de juego</label>
                      <select style={{ ...inp, cursor: 'pointer' }} value={diaJuego} onChange={e => setDiaJuego(e.target.value)}>
                        <option value="">Sin definir</option>
                        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Inscripción por equipo ($)</label>
                      <input type="number" min={0} style={inp} placeholder="Ej: 650000" value={montoInscripcion} onChange={e => setMontoInscripcion(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Cancha / Complejo</label>
                    <input style={inp} placeholder="Ej: Complejo Deportivo Las Torres" value={cancha} onChange={e => setCancha(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Dirección</label>
                    <input style={inp} placeholder="Ej: Av. Los Leones 1234, Providencia" value={direccionCancha} onChange={e => setDireccionCancha(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Horarios disponibles (separados por coma)</label>
                    <input style={inp} placeholder="Ej: 19:00, 20:00, 21:00" value={horarios} onChange={e => setHorarios(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Paso 3: Fechas y resumen */}
              {paso === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Fecha inicio</label>
                      <input type="date" style={inp} value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Fecha fin</label>
                      <input type="date" style={inp} value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
                    </div>
                  </div>

                  {/* Resumen */}
                  <div style={{
                    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14,
                    padding: '18px 20px',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#166534', marginBottom: 12 }}>
                      📋 Resumen de la liga
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13, color: '#475569' }}>
                      <div><strong>Nombre:</strong> {nombre || '—'}</div>
                      <div><strong>Deporte:</strong> {VARIANTES.find(v => v.value === variante)?.label}</div>
                      <div><strong>Categoría:</strong> {CATEGORIAS.find(c => c.value === categoria)?.label}</div>
                      <div><strong>Formato:</strong> {FORMATOS.find(f => f.value === formato)?.label}</div>
                      <div><strong>Equipos:</strong> {maxEquipos}</div>
                      <div><strong>Ruedas:</strong> {ruedas === '2' ? 'Ida y vuelta' : 'Solo ida'}</div>
                      {cancha && <div><strong>Cancha:</strong> {cancha}</div>}
                      {diaJuego && <div><strong>Día:</strong> {diaJuego}</div>}
                      {montoInscripcion && <div><strong>Inscripción:</strong> ${parseInt(montoInscripcion).toLocaleString('es-CL')}</div>}
                      {fechaInicio && <div><strong>Inicio:</strong> {fechaInicio}</div>}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div style={{
                  background: '#fef2f2', color: '#dc2626', borderRadius: 10,
                  padding: '10px 14px', fontSize: 13, marginTop: 16, border: '1px solid #fecaca',
                }}>
                  {error}
                </div>
              )}

              {/* Navigation buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                {paso > 1 ? (
                  <button
                    onClick={() => setPaso(paso - 1)}
                    style={{
                      flex: 1, padding: 13, background: '#f1f5f9', border: 'none',
                      borderRadius: 12, color: '#475569', fontSize: 14, cursor: 'pointer', fontWeight: 600,
                    }}>
                    ← Atrás
                  </button>
                ) : (
                  <button
                    onClick={() => { setModalOpen(false); resetModal() }}
                    style={{
                      flex: 1, padding: 13, background: '#f1f5f9', border: 'none',
                      borderRadius: 12, color: '#475569', fontSize: 14, cursor: 'pointer', fontWeight: 600,
                    }}>
                    Cancelar
                  </button>
                )}

                {paso < 3 ? (
                  <button
                    onClick={() => {
                      if (paso === 1 && !nombre.trim()) { setError('El nombre es obligatorio'); return }
                      setError(''); setPaso(paso + 1)
                    }}
                    style={{
                      flex: 2, padding: 13,
                      background: 'linear-gradient(135deg, #059669, #10b981)',
                      border: 'none', borderRadius: 12, color: 'white',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(5,150,105,0.3)',
                    }}>
                    Siguiente →
                  </button>
                ) : (
                  <button
                    onClick={handleCrear}
                    disabled={creando || !nombre.trim()}
                    style={{
                      flex: 2, padding: 13,
                      background: creando || !nombre.trim()
                        ? '#94a3b8'
                        : 'linear-gradient(135deg, #059669, #10b981)',
                      border: 'none', borderRadius: 12, color: 'white',
                      fontSize: 14, fontWeight: 700,
                      cursor: creando || !nombre.trim() ? 'default' : 'pointer',
                      boxShadow: '0 4px 14px rgba(5,150,105,0.3)',
                    }}>
                    {creando ? 'Creando...' : '⚽ Crear liga'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal clonar liga ───────────────────────── */}
      {clonandoId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setClonandoId(null) }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '18px 24px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>📋 Clonar liga</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                Copia equipos, plantillas y reglas — sin fixture ni resultados
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6, fontWeight: 600 }}>Nombre de la nueva liga</label>
              <input
                autoFocus
                style={{ width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}
                value={nombreClon} onChange={e => setNombreClon(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleClonar()}
              />
              {error && <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginTop: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button onClick={() => setClonandoId(null)} style={{ flex: 1, padding: 12, background: '#f1f5f9', border: 'none', borderRadius: 10, color: '#64748b', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={handleClonar} disabled={guardandoClon || !nombreClon.trim()} style={{
                  flex: 2, padding: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700,
                  cursor: guardandoClon || !nombreClon.trim() ? 'default' : 'pointer',
                  opacity: guardandoClon || !nombreClon.trim() ? 0.6 : 1,
                }}>{guardandoClon ? 'Clonando...' : '📋 Clonar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
