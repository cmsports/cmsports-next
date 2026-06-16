'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

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
      'Nombre': t.nombre, 'Estado': t.estado, 'Fase': t.fase,
      'Fecha inicio': t.fecha_inicio || '', 'Inscritos': t.inscritos || 0,
      'Campeón': t.campeon || '', 'Cuota': t.cuota_inscripcion ? '$'+t.cuota_inscripcion.toLocaleString('es-CL') : '',
    }))
    const ws = utils.json_to_sheet(datos)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Torneos')
    writeFile(wb, 'torneos.xlsx')
  }

  async function cargarTorneos() {
    // Query 1: todos los torneos del club
    const { data: torneosData } = await supabase
      .from('torneos').select('*').eq('club_id', clubId).order('creado_en', { ascending: false })
    if (!torneosData?.length) { setTorneos([]); return }

    const ids = torneosData.map(t => t.id)

    // Queries 2-5 en paralelo
    const idsFinalizados = torneosData.filter(t => t.fase === 'finalizado' || t.estado === 'finalizado').map(t => t.id)

    const [
      { data: todosGrupos },
      { data: finales },
    ] = await Promise.all([
      // Query 2: grupos de todos los torneos de una vez
      supabase.from('torneo_grupos').select('id, torneo_id').in('torneo_id', ids),
      // Query 3: partido final de todos los torneos finalizados de una vez
      idsFinalizados.length > 0
        ? supabase.from('torneo_partidos').select('torneo_id, ganador').in('torneo_id', idsFinalizados).eq('fase', 'final').not('ganador', 'is', null)
        : Promise.resolve({ data: [] }),
    ])

    const grupoIds = (todosGrupos || []).map(g => g.id)
    const ganadorIds = [...new Set((finales || []).map(f => f.ganador).filter(Boolean))]

    const [
      { data: inscripciones },
      { data: jugadores },
    ] = await Promise.all([
      // Query 4: todas las inscripciones de todos los grupos de una vez
      grupoIds.length > 0
        ? supabase.from('grupo_jugadores').select('grupo_id').in('grupo_id', grupoIds)
        : Promise.resolve({ data: [] }),
      // Query 5: nombres de todos los ganadores de una vez
      ganadorIds.length > 0
        ? supabase.from('jugadores').select('id, nombre').in('id', ganadorIds)
        : Promise.resolve({ data: [] }),
    ])

    // Mapas para lookup O(1)
    const grupoATorneo: Record<string, string> = {}
    for (const g of (todosGrupos || [])) grupoATorneo[g.id] = g.torneo_id

    const inscritosPorTorneo: Record<string, number> = {}
    for (const i of (inscripciones || [])) {
      const tid = grupoATorneo[i.grupo_id]
      if (tid) inscritosPorTorneo[tid] = (inscritosPorTorneo[tid] || 0) + 1
    }

    const jugadorNombre: Record<string, string> = {}
    for (const j of (jugadores || [])) jugadorNombre[j.id] = j.nombre

    const campeonPorTorneo: Record<string, string> = {}
    for (const f of (finales || [])) {
      if (f.ganador && jugadorNombre[f.ganador]) campeonPorTorneo[f.torneo_id] = jugadorNombre[f.ganador]
    }

    setTorneos(torneosData.map(t => ({
      ...t,
      inscritos: inscritosPorTorneo[t.id] || 0,
      campeon:   campeonPorTorneo[t.id] || null,
    })))
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

  const estadoConfig: Record<string, { color: string; bg: string }> = {
    en_curso: { color: '#16a34a', bg: '#f0fdf4' },
    finalizado: { color: '#64748b', bg: '#f8fafc' },
    cancelado: { color: '#dc2626', bg: '#fef2f2' }
  }
  const faseLabel: Record<string, string> = {
    inscripcion: 'Inscripción', grupos: 'Fase de grupos',
    llaves: 'Playoffs', semis: 'Semifinal', final: 'Final', finalizado: 'Finalizado'
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color: text }}>Torneos</h1>
        {puedeCrear && (
          <button
            onClick={() => setModalOpen(true)}
            style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}
          >
            + Nuevo torneo
          </button>
        )}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {torneos.map(t => {
          const est = estadoConfig[t.estado] || { color: muted, bg: '#f4f7fa' }
          return (
            <div
              key={t.id}
              onClick={() => router.push(`/torneos/${t.id}`)}
              style={{ ...card, padding:20, cursor:'pointer' }}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div style={{ fontSize:16, fontWeight:600, color: text }}>{t.nombre}</div>
                <div style={{ fontSize:11, color: muted }}>Ver detalle →</div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
                <span style={{ background: est.bg, color: est.color, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                  {t.estado}
                </span>
                <span style={{ background:'#ede9fe', color:'#3730a3', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                  {faseLabel[t.fase] || t.fase}
                </span>
                {t.fecha_inicio && <span style={{ fontSize:12, color: muted }}>{t.fecha_inicio}</span>}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                  <span style={{ fontSize:13, color: muted }}><strong style={{ color: text }}>{t.inscritos || 0}</strong> inscritos</span>
                  {t.cuota_inscripcion > 0 && (
                    <span style={{ fontSize:13, color: muted }}>Cuota: <strong style={{ color:'#16a34a' }}>${t.cuota_inscripcion?.toLocaleString('es-CL')}</strong></span>
                  )}
                </div>
                {t.campeon && (
                  <div style={{ display:'flex', alignItems:'center', gap:6, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:20, padding:'4px 12px' }}>
                    <span style={{ fontSize:14 }}>🏆</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#d97706' }}>{t.campeon}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {torneos.length === 0 && (
          <div style={{ ...card, padding:40, textAlign:'center', color: hint, fontSize:13 }}>
            Sin torneos registrados
          </div>
        )}
      </div>

      {/* Modal nuevo torneo */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:6 }}>Nuevo torneo</div>
            <div style={{ fontSize:12, color: muted, marginBottom:20 }}>Los jugadores se inscriben el día del torneo en la mesa de inscripción</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Nombre del torneo</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                placeholder="Ej: Torneo Junio 2026" value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Fecha</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Cuota de inscripción (CLP)</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                type="number" placeholder="5000" value={cuota} onChange={e => setCuota(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={crearTorneo} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                Crear torneo
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
