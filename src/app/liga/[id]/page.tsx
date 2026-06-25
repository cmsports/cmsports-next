'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import {
  crearDivision, crearMesa, eliminarMesa,
  asignarJugadoresDivision, generarFixtureDivisionAction,
  generarProgramacionLiga, iniciarFecha, crearJugadorExternoLiga,
} from '@/app/actions/liga'
import { TableroFecha } from '@/components/liga/TableroFecha'
import { RankingDivision } from '@/components/liga/RankingDivision'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const inputStyle = { background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' } as const

interface Division { id: string; nombre: string; orden: number; fixture_generado: boolean; capacidad_max: number | null }
interface Mesa { id: string; numero: number }
interface Fecha { id: string; numero: number; es_ajuste: boolean; estado: string }
interface Jugador { id: string; nombre: string; es_externo: boolean | null }

type SubTab = 'jugadores' | 'programacion' | 'ranking'

export default function LigaDetallePage() {
  const params = useParams<{ id: string }>()
  const ligaId = params.id
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()

  const [liga, setLiga] = useState<{ nombre: string } | null>(null)
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [fechas, setFechas] = useState<Fecha[]>([])
  const [jugadoresClub, setJugadoresClub] = useState<Jugador[]>([])
  const [divisionJugadores, setDivisionJugadores] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [mensaje, setMensaje] = useState('')

  const [nombreDivision, setNombreDivision] = useState('')
  const [numeroMesa, setNumeroMesa] = useState('')
  const [configAbierta, setConfigAbierta] = useState(false)

  const [divisionActiva, setDivisionActiva] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('jugadores')
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string | null>(null)
  const [formExternoAbierto, setFormExternoAbierto] = useState(false)
  const [nombreExterno, setNombreExterno] = useState('')
  const [rutExterno, setRutExterno] = useState('')
  const [telefonoExterno, setTelefonoExterno] = useState('')
  const [creandoExterno, setCreandoExterno] = useState(false)

  const cargar = useCallback(async () => {
    const { data: ligaData } = await supabase.from('ligas').select('nombre, club_id').eq('id', ligaId).single()
    if (!ligaData) { setLoading(false); return }
    setLiga({ nombre: ligaData.nombre })

    const [{ data: divs }, { data: ms }, { data: fch }, { data: jugs }, { data: dj }] = await Promise.all([
      supabase.from('liga_divisiones').select('id, nombre, orden, fixture_generado, capacidad_max').eq('liga_id', ligaId).order('orden'),
      supabase.from('liga_mesas').select('id, numero').eq('liga_id', ligaId).order('numero'),
      supabase.from('liga_fechas').select('id, numero, es_ajuste, estado').eq('liga_id', ligaId).order('numero'),
      supabase.from('jugadores').select('id, nombre, es_externo').eq('club_id', ligaData.club_id).eq('estado', 'activo').order('nombre'),
      supabase.from('liga_division_jugadores').select('division_id, jugador_id'),
    ])
    setDivisiones(divs || [])
    setMesas(ms || [])
    setFechas(fch || [])
    setJugadoresClub(jugs || [])

    const mapa: Record<string, string[]> = {}
    for (const row of dj || []) {
      if (!(divs || []).find(d => d.id === row.division_id)) continue
      mapa[row.division_id] = [...(mapa[row.division_id] || []), row.jugador_id]
    }
    setDivisionJugadores(mapa)

    setDivisionActiva(prev => prev ?? (divs && divs[0] ? divs[0].id : null))
    setFechaSeleccionada(prev => prev ?? (fch && fch[0] ? fch[0].id : null))
    setLoading(false)
  }, [ligaId])

  useEffect(() => { cargar() }, [cargar])

  async function handleCrearDivision() {
    if (!nombreDivision.trim()) return
    const res = await crearDivision({ ligaId, nombre: nombreDivision, orden: divisiones.length })
    if (res.error) { setMensaje(res.error); return }
    setNombreDivision('')
    cargar()
  }

  async function handleCrearMesa() {
    const numero = parseInt(numeroMesa)
    if (!numero) return
    const res = await crearMesa({ ligaId, numero })
    if (res.error) { setMensaje(res.error); return }
    setNumeroMesa('')
    cargar()
  }

  async function handleEliminarMesa(mesaId: string) {
    await eliminarMesa({ mesaId })
    cargar()
  }

  function toggleJugadorDivision(division: Division, jugadorId: string) {
    setDivisionJugadores(prev => {
      const actuales = prev[division.id] || []
      const yaIncluido = actuales.includes(jugadorId)
      if (!yaIncluido && division.capacidad_max && actuales.length >= division.capacidad_max) {
        setMensaje(`Esta división ya alcanzó su cupo máximo (${division.capacidad_max} jugadores)`)
        return prev
      }
      const nuevos = yaIncluido ? actuales.filter(id => id !== jugadorId) : [...actuales, jugadorId]
      return { ...prev, [division.id]: nuevos }
    })
  }

  async function handleGuardarJugadores(division: Division) {
    if (division.fixture_generado) {
      const confirmado = window.confirm(
        `La división "${division.nombre}" ya tiene fixture generado. Si cambias la lista de jugadores se borrará el fixture y los resultados actuales, y deberás generarlo de nuevo. ¿Confirmas?`
      )
      if (!confirmado) return
    }
    const ids = divisionJugadores[division.id] || []
    const res = await asignarJugadoresDivision({ divisionId: division.id, jugadorIds: ids, regenerarFixture: division.fixture_generado })
    if (res.error) { setMensaje(res.error); return }
    setMensaje('')
    cargar()
  }

  async function handleCrearExterno(division: Division) {
    if (!nombreExterno.trim()) return
    setCreandoExterno(true)
    const res = await crearJugadorExternoLiga({ nombre: nombreExterno, rut: rutExterno || undefined, telefono: telefonoExterno || undefined })
    setCreandoExterno(false)
    if (res.error || !res.jugadorId) { setMensaje(res.error || 'No se pudo crear el jugador externo'); return }
    setNombreExterno('')
    setRutExterno('')
    setTelefonoExterno('')
    setFormExternoAbierto(false)
    setJugadoresClub(prev => [...prev, { id: res.jugadorId!, nombre: res.jugadorNombre!, es_externo: true }].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    toggleJugadorDivision(division, res.jugadorId)
  }

  async function handleGenerarFixture(divisionId: string) {
    const res = await generarFixtureDivisionAction({ divisionId })
    setMensaje(res.error || `Fixture generado: ${res.totalPartidos} partidos`)
    cargar()
  }

  async function handleGenerarProgramacion() {
    const res = await generarProgramacionLiga({ ligaId })
    if (res.error) { setMensaje(res.error); return }
    setMensaje(`Programados: ${res.totalProgramados}. Sin programar (van a Fecha 5): ${res.totalSinProgramar}`)
    cargar()
  }

  async function handleIniciarFecha(fechaId: string) {
    const res = await iniciarFecha({ fechaId })
    if (res.error) { setMensaje(res.error); return }
    cargar()
  }

  if (authLoading || loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )
  if (!liga) return <AppLayout perfil={perfil}><div style={{ padding:24, color: muted, fontSize:13 }}>Liga no encontrada</div></AppLayout>

  const division = divisiones.find(d => d.id === divisionActiva) || null
  const jugadoresDeDivision = division ? (divisionJugadores[division.id] || []) : []

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:18 }}>{liga.nombre}</h1>

      {mensaje && (
        <div style={{ background:'#ede9fe', color:'#3730a3', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:18 }}>
          {mensaje}
        </div>
      )}

      {/* Configuración de liga: recursos compartidos entre divisiones */}
      <div style={{ ...card, padding:20, marginBottom:18 }}>
        <div onClick={() => setConfigAbierta(!configAbierta)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
          <div style={{ fontSize:14, fontWeight:600, color: text }}>⚙️ Configuración de liga (mesas, fechas, divisiones)</div>
          <span style={{ fontSize:12, color: muted }}>{configAbierta ? '▲ Ocultar' : '▼ Mostrar'}</span>
        </div>

        {configAbierta && (
          <div style={{ marginTop:18, display:'flex', flexDirection:'column', gap:18 }}>
            {/* Divisiones */}
            <div>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:8 }}>Divisiones</div>
              <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                <input style={{ ...inputStyle, flex:1 }} placeholder="Ej: División 6" value={nombreDivision} onChange={e => setNombreDivision(e.target.value)} />
                <button onClick={handleCrearDivision} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'0 18px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  + Agregar
                </button>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {divisiones.map(d => (
                  <span key={d.id} style={{ fontSize:12, color: muted, background:'#f4f7fa', borderRadius:20, padding:'5px 12px' }}>
                    {d.nombre} — {(divisionJugadores[d.id] || []).length}{d.capacidad_max ? `/${d.capacidad_max}` : ''} jugadores
                  </span>
                ))}
                {divisiones.length === 0 && <p style={{ fontSize:12, color: hint }}>Aún no hay divisiones</p>}
              </div>
            </div>

            {/* Mesas */}
            <div>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:8 }}>Mesas</div>
              <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                <input type="number" style={{ ...inputStyle, width:160 }} placeholder="Número de mesa" value={numeroMesa} onChange={e => setNumeroMesa(e.target.value)} />
                <button onClick={handleCrearMesa} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'0 18px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  + Agregar
                </button>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {mesas.map(mesa => (
                  <span key={mesa.id} style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:20, padding:'6px 14px', fontSize:12, color: text }}>
                    🏓 Mesa {mesa.numero}
                    <button onClick={() => handleEliminarMesa(mesa.id)} style={{ background:'transparent', border:'none', color: hint, cursor:'pointer', fontSize:13, lineHeight:1 }} title="Eliminar mesa">✕</button>
                  </span>
                ))}
                {mesas.length === 0 && <p style={{ fontSize:12, color: hint }}>Aún no hay mesas</p>}
              </div>
            </div>

            {/* Fechas */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:10 }}>
                <div style={{ fontSize:13, fontWeight:600, color: text }}>Fechas — 1-4 regulares, 5 es de ajuste</div>
                <button onClick={handleGenerarProgramacion} style={{ background:'#4f46e5', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  📅 Generar programación
                </button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {fechas.map(fecha => {
                  const estLabel = fecha.estado === 'programada' ? 'Programada' : fecha.estado === 'en_juego' ? 'En juego' : 'Finalizada'
                  const estColor = fecha.estado === 'en_juego' ? '#16a34a' : muted
                  const estBg = fecha.estado === 'en_juego' ? '#f0fdf4' : '#f4f7fa'
                  return (
                    <div key={fecha.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 16px', flexWrap:'wrap', gap:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:14, fontWeight:600, color: text }}>Fecha {fecha.numero}</span>
                        {fecha.es_ajuste && (
                          <span style={{ background:'#fffbeb', color:'#d97706', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>Ajuste</span>
                        )}
                        <span style={{ background: estBg, color: estColor, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>{estLabel}</span>
                      </div>
                      {fecha.estado === 'programada' && !fecha.es_ajuste && (
                        <button onClick={() => handleIniciarFecha(fecha.id)} style={{ background:'#16a34a', color:'white', border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                          Iniciar Fecha
                        </button>
                      )}
                    </div>
                  )
                })}
                {fechas.length === 0 && <p style={{ fontSize:12, color: hint }}>Sin fechas</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selector de división */}
      <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
        {divisiones.map(d => (
          <button key={d.id} onClick={() => setDivisionActiva(d.id)}
            style={{
              padding:'8px 16px', borderRadius:8, border:'1px solid #e2e8f0', cursor:'pointer', fontSize:13, fontWeight:600,
              background: divisionActiva === d.id ? '#3730a3' : '#ffffff',
              color: divisionActiva === d.id ? '#ffffff' : muted,
            }}>
            {d.nombre}
          </button>
        ))}
        {divisiones.length === 0 && (
          <div style={{ fontSize:13, color: hint }}>Crea una división en "Configuración de liga" para empezar</div>
        )}
      </div>

      {division && (
        <div>
          {/* Sub-pestañas: Jugadores / Programación / Ranking */}
          <div style={{ display:'flex', background:'#e2e8f0', borderRadius:10, padding:4, marginBottom:18, maxWidth:420 }}>
            {([
              { key:'jugadores', label:'👥 Jugadores' },
              { key:'programacion', label:'📅 Programación' },
              { key:'ranking', label:'🏆 Ranking' },
            ] as { key: SubTab; label: string }[]).map(t => (
              <div key={t.key} onClick={() => setSubTab(t.key)}
                style={{ flex:1, padding:'9px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, background: subTab===t.key?'#ffffff':'transparent', color: subTab===t.key?'#3730a3':muted, transition:'all 0.15s' }}>
                {t.label}
              </div>
            ))}
          </div>

          <div style={{ display: subTab === 'jugadores' ? 'block' : 'none' }}>
            <div style={{ ...card, padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10 }}>
                <div>
                  <div style={{ fontSize:13, color: muted }}>
                    {jugadoresDeDivision.length}{division.capacidad_max ? ` / ${division.capacidad_max}` : ''} inscritos
                  </div>
                </div>
                <span style={{
                  background: division.fixture_generado ? '#f0fdf4' : '#f4f7fa',
                  color: division.fixture_generado ? '#16a34a' : muted,
                  padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:'nowrap',
                }}>
                  {division.fixture_generado ? '✅ Fixture generado' : 'Sin fixture'}
                </span>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8, maxHeight:280, overflow:'auto', padding:12, background:'#f4f7fa', borderRadius:10, marginBottom:10 }}>
                {jugadoresClub.map(j => (
                  <label key={j.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color: text, cursor:'pointer' }}>
                    <input
                      type="checkbox"
                      checked={jugadoresDeDivision.includes(j.id)}
                      onChange={() => toggleJugadorDivision(division, j.id)}
                    />
                    {j.nombre}{j.es_externo && <span style={{ color: hint, fontSize:10 }}> (externo)</span>}
                  </label>
                ))}
                {jugadoresClub.length === 0 && <span style={{ fontSize:12, color: hint }}>No hay jugadores activos en el club</span>}
                <button onClick={() => setFormExternoAbierto(!formExternoAbierto)} style={{ background:'transparent', border:'1px dashed #c7d2e0', borderRadius:6, padding:'4px 8px', color:'#4f46e5', fontSize:11, fontWeight:600, cursor:'pointer', textAlign:'left' }}>
                  + Externo
                </button>
              </div>

              {formExternoAbierto && (
                <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center', background:'#f4f7fa', borderRadius:10, padding:12 }}>
                  <input style={{ ...inputStyle, flex:1, minWidth:140 }} placeholder="Nombre" value={nombreExterno} onChange={e => setNombreExterno(e.target.value)} />
                  <input style={{ ...inputStyle, width:130 }} placeholder="RUT (opcional)" value={rutExterno} onChange={e => setRutExterno(e.target.value)} />
                  <input style={{ ...inputStyle, width:130 }} placeholder="Teléfono (opcional)" value={telefonoExterno} onChange={e => setTelefonoExterno(e.target.value)} />
                  <button onClick={() => handleCrearExterno(division)} disabled={creandoExterno || !nombreExterno.trim()} style={{ background:'#4f46e5', color:'white', border:'none', borderRadius:8, padding:'10px 16px', fontSize:12, fontWeight:600, cursor: creandoExterno ? 'default' : 'pointer', opacity: creandoExterno ? 0.6 : 1 }}>
                    Agregar
                  </button>
                </div>
              )}

              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={() => handleGuardarJugadores(division)} style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 14px', color: muted, fontSize:12, cursor:'pointer' }}>
                  {division.fixture_generado ? 'Guardar y regenerar fixture' : 'Guardar jugadores'}
                </button>
                {!division.fixture_generado && (
                  <button
                    onClick={() => handleGenerarFixture(division.id)}
                    disabled={jugadoresDeDivision.length < 2}
                    style={{
                      background: jugadoresDeDivision.length < 2 ? '#e2e8f0' : '#4f46e5',
                      color: jugadoresDeDivision.length < 2 ? hint : 'white',
                      border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600,
                      cursor: jugadoresDeDivision.length < 2 ? 'not-allowed' : 'pointer',
                    }}>
                    Generar fixture
                  </button>
                )}
              </div>
              {jugadoresDeDivision.length < 2 && !division.fixture_generado && (
                <div style={{ fontSize:11, color: hint, marginTop:8 }}>Se necesitan al menos 2 jugadores inscritos para generar el fixture</div>
              )}
            </div>
          </div>

          <div style={{ display: subTab === 'programacion' ? 'block' : 'none' }}>
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:12, color: muted }}>Fecha:</span>
              {fechas.map(f => (
                <button key={f.id} onClick={() => setFechaSeleccionada(f.id)}
                  style={{
                    padding:'5px 12px', borderRadius:8, border:'1px solid #e2e8f0', cursor:'pointer', fontSize:12, fontWeight:600,
                    background: fechaSeleccionada === f.id ? '#ede9fe' : '#ffffff',
                    color: fechaSeleccionada === f.id ? '#3730a3' : muted,
                  }}>
                  {f.numero}{f.es_ajuste ? ' (ajuste)' : ''}
                </button>
              ))}
              {fechaSeleccionada && (
                <a href={`/liga/fecha/${fechaSeleccionada}`} style={{ marginLeft:'auto', fontSize:12, color:'#4f46e5', textDecoration:'none' }}>
                  🔍 Ver vista completa de la fecha (todas las divisiones)
                </a>
              )}
            </div>
            {fechaSeleccionada ? (
              <TableroFecha fechaId={fechaSeleccionada} divisionId={division.id} />
            ) : (
              <div style={{ fontSize:13, color: hint }}>Sin fechas disponibles</div>
            )}
          </div>

          <div style={{ display: subTab === 'ranking' ? 'block' : 'none' }}>
            <RankingDivision divisionId={division.id} nombreDivision={division.nombre} />
          </div>
        </div>
      )}
    </AppLayout>
  )
}
