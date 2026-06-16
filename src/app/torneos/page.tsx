'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient()

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

  async function exportarTorneos() {
    const { utils, writeFile } = await import('xlsx')
    const datos = torneos.map(t => ({
      'Nombre': t.nombre,
      'Estado': t.estado,
      'Fase': t.fase,
      'Fecha inicio': t.fecha_inicio || '',
      'Inscritos': t.inscritos || 0,
      'Campeón': t.campeon || '',
      'Cuota': t.cuota_inscripcion ? '$'+t.cuota_inscripcion.toLocaleString('es-CL') : '',
    }))
    const ws = utils.json_to_sheet(datos)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Torneos')
    writeFile(wb, 'torneos.xlsx')
  }

  async function cargarTorneos() {
    const { data } = await supabase.from('torneos').select('*').eq('club_id', clubId).order('creado_en', { ascending: false })
    if (!data?.length) { setTorneos([]); return }

    // Cargar inscritos y campeón para cada torneo
    const torneosConDatos = await Promise.all(data.map(async t => {
      // Contar inscritos
      const { data: grupos } = await supabase.from('torneo_grupos').select('id').eq('torneo_id', t.id)
      let inscritos = 0
      if (grupos?.length) {
        const { count } = await supabase.from('grupo_jugadores').select('*', { count:'exact', head:true }).in('grupo_id', grupos.map((g:any) => g.id))
        inscritos = count || 0
      }

      // Campeón si está finalizado
      let campeon = null
      if (t.fase === 'finalizado' || t.estado === 'finalizado') {
        const { data: pFinal } = await supabase.from('torneo_partidos').select('ganador,ja:jugador_a(nombre),jb:jugador_b(nombre)').eq('torneo_id', t.id).eq('fase','final').not('ganador','is',null).maybeSingle()
        if (pFinal) {
          const esA = pFinal.ganador === (pFinal as any).ja?.id
          campeon = (pFinal as any).ja?.nombre || (pFinal as any).jb?.nombre
          // Buscar nombre del ganador directamente
          const { data: jGanador } = await supabase.from('jugadores').select('nombre').eq('id', pFinal.ganador).single()
          if (jGanador) campeon = jGanador.nombre
        }
      }

      return { ...t, inscritos, campeon }
    }))

    setTorneos(torneosConDatos)
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
  const puedeCrear = esAdmin || perfil?.rol === 'profesor'
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
        {puedeCrear && (
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
            style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, cursor:'pointer' }}
          >
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{t.nombre}</div>
              <div style={{ fontSize:11, color:'#6c7280' }}>Ver detalle →</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
              <span style={{ background: (estadoColor[t.estado] || '#6c7280') + '22', color: estadoColor[t.estado] || '#6c7280', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                {t.estado}
              </span>
              <span style={{ background:'#a78bfa22', color:'#a78bfa', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                {faseLabel[t.fase] || t.fase}
              </span>
              {t.fecha_inicio && <span style={{ fontSize:12, color:'#6c7280' }}>📅 {t.fecha_inicio}</span>}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                <span style={{ fontSize:13, color:'#8890a4' }}>👥 <strong style={{ color:'#c8cfe0' }}>{t.inscritos || 0}</strong> inscritos</span>
                {t.cuota_inscripcion > 0 && (
                  <span style={{ fontSize:13, color:'#8890a4' }}>💰 <strong style={{ color:'#34d399' }}>${t.cuota_inscripcion?.toLocaleString('es-CL')}</strong></span>
                )}
              </div>
              {t.campeon && (
                <div style={{ display:'flex', alignItems:'center', gap:6, background:'#fbbf2422', border:'1px solid #fbbf2444', borderRadius:20, padding:'4px 12px' }}>
                  <span style={{ fontSize:14 }}>🏆</span>
                  <span style={{ fontSize:12, fontWeight:700, color:'#fbbf24' }}>{t.campeon}</span>
                </div>
              )}
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
