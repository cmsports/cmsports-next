'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { crearEventoOficial } from '@/app/actions/torneo-oficial'

const supabase = createClient()

type Evento = { id: string; nombre: string; categoria: string; genero: string; fase: string; formato_partido: string }
type Campeonato = { id: string; nombre: string; sede: string | null; zona: string | null; fecha_inicio: string; fecha_fin: string | null; estado: string }

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.08)' } as const

export default function CampeonatoOficialDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [camp, setCamp] = useState<Campeonato | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [categoria, setCategoria] = useState('Juvenil')
  const [genero, setGenero] = useState<'varones' | 'damas' | 'mixto'>('varones')
  const [formato, setFormato] = useState<'bo3' | 'bo5' | 'bo7'>('bo5')
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function cargar() {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: c } = await db.from('oficial_campeonatos').select('id,nombre,sede,zona,fecha_inicio,fecha_fin,estado')
      .eq('id', id).eq('club_id', perfil!.club_id).maybeSingle()
    setCamp(c)
    const { data: ev } = await db.from('oficial_eventos').select('id,nombre,categoria,genero,fase,formato_partido')
      .eq('campeonato_id', id).order('creado_en')
    setEventos(ev || [])
    setLoading(false)
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) cargar()
  }, [authLoading, perfil, id])

  useEnVivo(['oficial_campeonatos', 'oficial_eventos'], perfil?.club_id ?? null, () => { void cargar() },
    { conClub: ['oficial_campeonatos', 'oficial_eventos'] })

  async function crearEvento() {
    setErrorMsg('')
    setGuardando(true)
    const res = await crearEventoOficial({
      campeonatoId: id,
      nombre: nombre || `${categoria} ${genero === 'varones' ? 'Varones' : genero === 'damas' ? 'Damas' : 'Mixto'}`,
      categoria, genero, formatoPartido: formato,
    })
    setGuardando(false)
    if (res.error) { setErrorMsg(res.error); return }
    setModal(false)
    if (res.id) router.push(`/torneo-oficial/evento/${res.id}`)
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 80px' }}>
        <button onClick={() => router.push('/torneo-oficial')} style={btnBack}>← Volver</button>
        {loading || !camp ? (
          <p style={{ color: '#94a3b8' }}>{loading ? 'Cargando…' : 'Campeonato no encontrado'}</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22 }}>{camp.nombre}</h1>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
                  {camp.fecha_inicio}{camp.fecha_fin ? ` → ${camp.fecha_fin}` : ''}
                  {camp.sede ? ` · ${camp.sede}` : ''}{camp.zona ? ` · ${camp.zona}` : ''} · {camp.estado}
                </p>
              </div>
              <button onClick={() => setModal(true)} style={btnPrimary}>+ Evento / categoría</button>
            </div>
            {eventos.length === 0 ? (
              <div style={{ ...card, padding: 24, color: '#64748b' }}>Agrega un evento (ej. Juvenil Varones).</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {eventos.map(e => (
                  <button key={e.id} onClick={() => router.push(`/torneo-oficial/evento/${e.id}`)}
                    style={{ ...card, padding: 14, textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                    <strong>{e.nombre}</strong>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                      {e.categoria} · {e.genero} · {e.formato_partido.toUpperCase()} · fase {e.fase}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {modal && (
          <div style={overlayStyle}>
            <div style={{ ...card, width: '100%', maxWidth: 420, padding: 20 }}>
              <h2 style={{ margin: '0 0 12px' }}>Nuevo evento</h2>
              <label style={labelStyle}>Categoría</label>
              <input value={categoria} onChange={e => setCategoria(e.target.value)} style={inputStyle} />
              <label style={labelStyle}>Género</label>
              <select value={genero} onChange={e => setGenero(e.target.value as typeof genero)} style={inputStyle}>
                <option value="varones">Varones</option><option value="damas">Damas</option><option value="mixto">Mixto</option>
              </select>
              <label style={labelStyle}>Formato</label>
              <select value={formato} onChange={e => setFormato(e.target.value as typeof formato)} style={inputStyle}>
                <option value="bo3">Al mejor de 3</option><option value="bo5">Al mejor de 5</option><option value="bo7">Al mejor de 7</option>
              </select>
              <label style={labelStyle}>Nombre visible (opc.)</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} />
              {errorMsg && <p style={{ color: '#e11d48', fontSize: 13 }}>{errorMsg}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={() => setModal(false)} style={btnGhost}>Cancelar</button>
                <button onClick={crearEvento} disabled={guardando || !categoria} style={{ ...btnPrimary, flex: 1 }}>Crear evento</button>
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
const btnPrimary: CSSProperties = { background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer' }
const btnBack: CSSProperties = { background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', marginBottom: 14, cursor: 'pointer' }
const overlayStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }
