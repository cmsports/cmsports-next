'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { crearCampeonatoOficial } from '@/app/actions/torneo-oficial'
import { fechaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

type Campeonato = {
  id: string
  nombre: string
  sede: string | null
  zona: string | null
  fecha_inicio: string
  fecha_fin: string | null
  estado: string
  eventos_count?: number
}

const card = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
} as const

export default function TorneoOficialPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [lista, setLista] = useState<Campeonato[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [nombre, setNombre] = useState('')
  const [sede, setSede] = useState('')
  const [zona, setZona] = useState('')
  const [fechaInicio, setFechaInicio] = useState(fechaChile())
  const [fechaFin, setFechaFin] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function cargar(clubId: string) {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db.from('oficial_campeonatos')
      .select('id,nombre,sede,zona,fecha_inicio,fecha_fin,estado')
      .eq('club_id', clubId).neq('estado', 'archivado').order('creado_en', { ascending: false })

    const rows = (data || []) as Campeonato[]
    if (!rows.length) { setLista([]); setLoading(false); return }

    const ids = rows.map(r => r.id)
    const { data: eventos } = await db.from('oficial_eventos').select('id, campeonato_id').in('campeonato_id', ids)
    const count: Record<string, number> = {}
    for (const e of eventos || []) count[e.campeonato_id] = (count[e.campeonato_id] || 0) + 1
    setLista(rows.map(r => ({ ...r, eventos_count: count[r.id] || 0 })))
    setLoading(false)
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) cargar(perfil.club_id)
    else setLoading(false)
  }, [authLoading, perfil])

  useEnVivo(
    ['oficial_campeonatos', 'oficial_eventos'],
    perfil?.club_id ?? null,
    () => { if (perfil?.club_id) void cargar(perfil.club_id) },
    { conClub: ['oficial_campeonatos', 'oficial_eventos'] },
  )

  async function crear() {
    setErrorMsg('')
    setGuardando(true)
    const res = await crearCampeonatoOficial({ nombre, sede, zona, fechaInicio, fechaFin: fechaFin || undefined })
    setGuardando(false)
    if (res.error) { setErrorMsg(res.error); return }
    setModal(false)
    setNombre(''); setSede(''); setZona('')
    if (res.id) {
      if (perfil?.club_id) await cargar(perfil.club_id)
      router.push(`/torneo-oficial/${res.id}`)
    }
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>Torneo oficial</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
              Reglas ITTF / Juez General. Separado de torneos de club.
            </p>
          </div>
          <button onClick={() => setModal(true)} style={btnPrimary}>+ Nuevo campeonato</button>
        </div>

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Cargando…</p>
        ) : lista.length === 0 ? (
          <div style={{ ...card, padding: 28, textAlign: 'center', color: '#64748b' }}>
            Crea el primer campeonato oficial para armar categorías, grupos y resultados con sets.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {lista.map(c => (
              <button key={c.id} onClick={() => router.push(`/torneo-oficial/${c.id}`)}
                style={{ ...card, padding: 16, textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 16 }}>{c.nombre}</strong>
                  <span style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>{c.estado}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
                  {c.fecha_inicio}{c.fecha_fin ? ` → ${c.fecha_fin}` : ''}
                  {c.sede ? ` · ${c.sede}` : ''}{c.zona ? ` · ${c.zona}` : ''}
                  {` · ${c.eventos_count || 0} evento(s)`}
                </div>
              </button>
            ))}
          </div>
        )}

        {modal && (
          <div style={overlayStyle}>
            <div style={{ ...card, width: '100%', maxWidth: 440, padding: 20 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Nuevo campeonato oficial</h2>
              <label style={labelStyle}>Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} placeholder="2do Zonal Individual MET2" />
              <label style={labelStyle}>Sede</label>
              <input value={sede} onChange={e => setSede(e.target.value)} style={inputStyle} />
              <label style={labelStyle}>Zona</label>
              <input value={zona} onChange={e => setZona(e.target.value)} style={inputStyle} placeholder="Metropolitana 2 - Costa" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>Inicio</label>
                  <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Fin (opc.)</label>
                  <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={inputStyle} /></div>
              </div>
              {errorMsg && <p style={{ color: '#e11d48', fontSize: 13 }}>{errorMsg}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={() => setModal(false)} style={btnGhost}>Cancelar</button>
                <button onClick={crear} disabled={guardando || !nombre} style={{ ...btnPrimary, flex: 1, opacity: guardando ? 0.6 : 1 }}>
                  {guardando ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

const labelStyle: CSSProperties = { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, marginTop: 10 }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }
const btnGhost: CSSProperties = { flex: 1, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, cursor: 'pointer' }
const btnPrimary: CSSProperties = { background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }
const overlayStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }
