'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { crearLiga } from '@/app/actions/liga'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const estadoConfig: Record<string, { color: string; bg: string; label: string }> = {
  planificacion: { color: '#3730a3', bg: '#ede9fe', label: '📋 Planificación' },
  en_curso:      { color: '#16a34a', bg: '#f0fdf4', label: '🟢 En curso' },
  finalizada:    { color: muted,     bg: '#f8fafc', label: '✅ Finalizada' },
}

interface Liga {
  id: string
  nombre: string
  estado: string
  creado_en: string
}

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

  async function cargar(clubId: string) {
    const { data } = await supabase.from('ligas').select('id, nombre, estado, creado_en').eq('club_id', clubId).order('creado_en', { ascending: false })
    setLigas(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) cargar(perfil.club_id)
    else setLoading(false)
  }, [authLoading, perfil])

  async function handleCrear() {
    if (!nombre.trim()) return
    setCreando(true)
    setError('')
    const res = await crearLiga({
      nombre,
      numDivisiones: numDivisiones ? parseInt(numDivisiones) : undefined,
      jugadoresPorDivision: jugadoresPorDivision ? parseInt(jugadoresPorDivision) : undefined,
      totalFechas: totalFechas ? parseInt(totalFechas) : 5,
      montoInscripcionDefault: montoInscripcion ? parseInt(montoInscripcion) : undefined,
    })
    setCreando(false)
    if (res.error) { setError(res.error); return }
    setModalOpen(false)
    setNombre('')
    setNumDivisiones('')
    setJugadoresPorDivision('')
    setTotalFechas('5')
    setMontoInscripcion('')
    if (res.ligaId) router.push(`/liga/${res.ligaId}`)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color: text }}>Liga</h1>
        <button
          onClick={() => setModalOpen(true)}
          style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}
        >
          + Nueva liga
        </button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {ligas.map(liga => {
          const est = estadoConfig[liga.estado] || { color: muted, bg: '#f4f7fa', label: liga.estado }
          return (
            <div
              key={liga.id}
              onClick={() => router.push(`/liga/${liga.id}`)}
              style={{ ...card, padding:20, cursor:'pointer' }}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:600, color: text, marginBottom:4 }}>{liga.nombre}</div>
                  <div style={{ fontSize:12, color: muted }}>Creada el {new Date(liga.creado_en).toLocaleDateString('es-CL')}</div>
                </div>
                <span style={{ background: est.bg, color: est.color, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>
                  {est.label}
                </span>
              </div>
            </div>
          )
        })}
        {ligas.length === 0 && (
          <div style={{ ...card, padding:40, textAlign:'center', color: hint, fontSize:13 }}>
            Sin ligas todavía — crea la primera para empezar a armar divisiones y fixture
          </div>
        )}
      </div>

      {/* Modal nueva liga */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:20 }}>Nueva liga</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Nombre de la liga</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                placeholder="Ej: Liga Invierno 2026" value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:10, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Fechas de temporada</label>
                <input type="number" min={2} style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  placeholder="5" value={totalFechas} onChange={e => setTotalFechas(e.target.value)} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Inscripción por jugador ($)</label>
                <input type="number" min={0} style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  placeholder="Ej: 10000" value={montoInscripcion} onChange={e => setMontoInscripcion(e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize:11, color: hint, marginBottom:8 }}>La última fecha siempre es de ajuste. Mínimo 2 fechas.</div>
            <div style={{ display:'flex', gap:10, marginBottom:6 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Cantidad de divisiones</label>
                <input type="number" min={1} style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  placeholder="Ej: 5" value={numDivisiones} onChange={e => setNumDivisiones(e.target.value)} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Jugadores por división</label>
                <input type="number" min={2} style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  placeholder="Ej: 12" value={jugadoresPorDivision} onChange={e => setJugadoresPorDivision(e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize:11, color: hint, marginBottom:20 }}>Divisiones y jugadores son opcionales — puedes configurarlos después</div>
            {error && <p style={{ fontSize:12, color:'#dc2626', marginBottom:14 }}>{error}</p>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleCrear} disabled={creando} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer', opacity: creando ? 0.6 : 1 }}>
                {creando ? 'Creando...' : 'Crear liga'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
