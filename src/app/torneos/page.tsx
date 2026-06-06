'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function TorneosPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [torneos, setTorneos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [clubId, setClubId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState('')
  const [cuota, setCuota] = useState('0')
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      setClubId(p?.club_id)
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (!clubId) return
    cargarTorneos()
  }, [clubId])

  async function cargarTorneos() {
    const { data } = await supabase.from('torneos').select('*').eq('club_id', clubId).order('creado_en', { ascending: false })
    setTorneos(data || [])
  }

  async function crearTorneo() {
    if (!nombre || !fecha) return
    const { data, error } = await supabase.from('torneos').insert({
      club_id: clubId, nombre, formato: 'grupos', estado: 'en_curso',
      fase: 'inscripcion', fecha_inicio: fecha,
      cuota_inscripcion: parseInt(cuota) || 0,
      precio_entrada: parseInt(cuota) || 0,
      inscripcion_abierta: true
    }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    setModalOpen(false)
    setNombre(''); setFecha(''); setCuota('0')
    router.push(`/torneos/${data.id}`)
  }

  const esAdmin = perfil?.rol === 'admin'
  const estadoColor: Record<string, string> = {
    en_curso: '#34d399', finalizado: '#6c7280', cancelado: '#f87171'
  }
  const faseLabel: Record<string, string> = {
    inscripcion: 'Inscripción', grupos: 'Fase de grupos',
    llaves: 'Playoffs', semis: 'Semifinal', final: 'Final', finalizado: 'Finalizado'
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff' }}>Torneos</h1>
        {esAdmin && (
          <button
            onClick={() => setModalOpen(true)}
            style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}
          >
            + Nuevo torneo
          </button>
        )}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {torneos.map(t => (
          <div
            key={t.id}
            onClick={() => router.push(`/torneos/${t.id}`)}
            style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
          >
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:6 }}>{t.nombre}</div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ background: (estadoColor[t.estado] || '#6c7280') + '22', color: estadoColor[t.estado] || '#6c7280', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                  {t.estado}
                </span>
                <span style={{ background:'#a78bfa22', color:'#a78bfa', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                  {faseLabel[t.fase] || t.fase}
                </span>
                {t.fecha_inicio && (
                  <span style={{ fontSize:12, color:'#6c7280' }}>📅 {t.fecha_inicio}</span>
                )}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              {t.cuota_inscripcion > 0 && (
                <div style={{ fontSize:16, fontWeight:700, color:'#34d399', fontFamily:'monospace' }}>
                  ${t.cuota_inscripcion?.toLocaleString('es-CL')}
                </div>
              )}
              <div style={{ fontSize:11, color:'#6c7280', marginTop:4 }}>Ver detalle →</div>
            </div>
          </div>
        ))}
        {torneos.length === 0 && (
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>
            Sin torneos registrados
          </div>
        )}
      </div>

      {/* Modal nuevo torneo */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:28, width:'100%', maxWidth:420 }}>
            <div style={{ fontSize:17, fontWeight:600, color:'#fff', marginBottom:6 }}>Nuevo torneo</div>
            <div style={{ fontSize:12, color:'#6c7280', marginBottom:20 }}>Los jugadores se inscriben el día del torneo en la mesa de inscripción</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Nombre del torneo</label>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                placeholder="Ej: Torneo Junio 2026" value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Fecha</label>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Cuota de inscripción (CLP)</label>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                type="number" placeholder="5000" value={cuota} onChange={e => setCuota(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #1e2030', borderRadius:8, color:'#6c7280', fontSize:14, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={crearTorneo} style={{ flex:1, padding:11, background:'#6c63ff', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                Crear torneo
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
