'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import {
  crearDivision, crearMesa, eliminarMesa,
  asignarJugadoresDivision, generarFixtureDivisionAction,
  generarProgramacionLiga, iniciarFecha,
} from '@/app/actions/liga'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const inputStyle = { background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' } as const

interface Division { id: string; nombre: string; fixture_generado: boolean }
interface Mesa { id: string; numero: number }
interface Fecha { id: string; numero: number; es_ajuste: boolean; estado: string }
interface Jugador { id: string; nombre: string }

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
  const [divisionExpandida, setDivisionExpandida] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data: ligaData } = await supabase.from('ligas').select('nombre, club_id').eq('id', ligaId).single()
    if (!ligaData) { setLoading(false); return }
    setLiga({ nombre: ligaData.nombre })

    const [{ data: divs }, { data: ms }, { data: fch }, { data: jugs }, { data: dj }] = await Promise.all([
      supabase.from('liga_divisiones').select('id, nombre, fixture_generado').eq('liga_id', ligaId).order('orden'),
      supabase.from('liga_mesas').select('id, numero').eq('liga_id', ligaId).order('numero'),
      supabase.from('liga_fechas').select('id, numero, es_ajuste, estado').eq('liga_id', ligaId).order('numero'),
      supabase.from('jugadores').select('id, nombre').eq('club_id', ligaData.club_id).eq('estado', 'activo').neq('es_externo', true).order('nombre'),
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

  function toggleJugadorDivision(divisionId: string, jugadorId: string) {
    setDivisionJugadores(prev => {
      const actuales = prev[divisionId] || []
      const nuevos = actuales.includes(jugadorId) ? actuales.filter(id => id !== jugadorId) : [...actuales, jugadorId]
      return { ...prev, [divisionId]: nuevos }
    })
  }

  async function handleGuardarJugadores(division: Division) {
    const ids = divisionJugadores[division.id] || []
    const res = await asignarJugadoresDivision({ divisionId: division.id, jugadorIds: ids, regenerarFixture: division.fixture_generado })
    if (res.error) { setMensaje(res.error); return }
    setMensaje('')
    cargar()
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

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:18 }}>{liga.nombre}</h1>

      {mensaje && (
        <div style={{ background:'#ede9fe', color:'#3730a3', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:18 }}>
          {mensaje}
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
        {/* Divisiones */}
        <div style={{ ...card, padding:20 }}>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:16, fontWeight:600, color: text }}>Divisiones</div>
            <div style={{ fontSize:12, color: muted, marginTop:2 }}>Cada división juega round robin solo contra sí misma</div>
          </div>

          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <input style={{ ...inputStyle, flex:1 }} placeholder="Ej: División 1" value={nombreDivision} onChange={e => setNombreDivision(e.target.value)} />
            <button onClick={handleCrearDivision} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'0 18px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              + Agregar
            </button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {divisiones.map(division => (
              <div key={division.id} style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:14 }}>
                <div
                  onClick={() => setDivisionExpandida(divisionExpandida === division.id ? null : division.id)}
                  style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}
                >
                  <div style={{ fontSize:14, fontWeight:600, color: text }}>{division.nombre}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:12, color: muted }}>{(divisionJugadores[division.id] || []).length} jugadores</span>
                    <span style={{
                      background: division.fixture_generado ? '#f0fdf4' : '#f4f7fa',
                      color: division.fixture_generado ? '#16a34a' : muted,
                      padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:'nowrap',
                    }}>
                      {division.fixture_generado ? '✅ Fixture generado' : 'Sin fixture'}
                    </span>
                  </div>
                </div>

                {divisionExpandida === division.id && (
                  <div style={{ marginTop:14 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8, maxHeight:200, overflow:'auto', padding:12, background:'#f4f7fa', borderRadius:10, marginBottom:12 }}>
                      {jugadoresClub.map(j => (
                        <label key={j.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color: text, cursor:'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(divisionJugadores[division.id] || []).includes(j.id)}
                            onChange={() => toggleJugadorDivision(division.id, j.id)}
                          />
                          {j.nombre}
                        </label>
                      ))}
                      {jugadoresClub.length === 0 && <span style={{ fontSize:12, color: hint }}>No hay jugadores activos en el club</span>}
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <button onClick={() => handleGuardarJugadores(division)} style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 14px', color: muted, fontSize:12, cursor:'pointer' }}>
                        {division.fixture_generado ? 'Guardar y regenerar fixture' : 'Guardar jugadores'}
                      </button>
                      {!division.fixture_generado && (
                        <button onClick={() => handleGenerarFixture(division.id)} style={{ background:'#4f46e5', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                          Generar fixture
                        </button>
                      )}
                      {division.fixture_generado && (
                        <button onClick={() => router.push(`/liga/division/${division.id}`)} style={{ background:'#fffbeb', color:'#d97706', border:'1px solid #fde68a', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                          🏆 Ver ranking
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {divisiones.length === 0 && <p style={{ fontSize:12, color: hint }}>Aún no hay divisiones</p>}
          </div>
        </div>

        {/* Mesas */}
        <div style={{ ...card, padding:20 }}>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:16, fontWeight:600, color: text }}>Mesas</div>
            <div style={{ fontSize:12, color: muted, marginTop:2 }}>Recurso físico compartido entre todas las divisiones</div>
          </div>

          <div style={{ display:'flex', gap:10, marginBottom:14 }}>
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
        <div style={{ ...card, padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:600, color: text }}>Fechas</div>
              <div style={{ fontSize:12, color: muted, marginTop:2 }}>Fechas 1-4 son regulares; Fecha 5 es de ajuste</div>
            </div>
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
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => router.push(`/liga/fecha/${fecha.id}`)} style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, fontSize:12, cursor:'pointer' }}>
                      Ver tablero
                    </button>
                    {fecha.estado === 'programada' && !fecha.es_ajuste && (
                      <button onClick={() => handleIniciarFecha(fecha.id)} style={{ background:'#16a34a', color:'white', border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                        Iniciar Fecha
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {fechas.length === 0 && <p style={{ fontSize:12, color: hint }}>Sin fechas</p>}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
