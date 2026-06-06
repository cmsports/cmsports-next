'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ELO_TABLA: Record<string, Record<string, number>> = {
  sub19:      { fase_grupos:5,  octavos:10, cuartos:15, semifinal:20, subcampeon:25, campeon:35 },
  aficionados:{ fase_grupos:8,  octavos:15, cuartos:22, semifinal:30, subcampeon:40, campeon:55 },
  intermedia: { fase_grupos:12, octavos:20, cuartos:30, semifinal:42, subcampeon:55, campeon:75 },
  tc:         { fase_grupos:20, octavos:32, cuartos:45, semifinal:60, subcampeon:80, campeon:110 }
}

const POSICION_LABEL: Record<string, string> = {
  fase_grupos:'Fase de grupos', octavos:'Octavos de final', cuartos:'Cuartos de final',
  semifinal:'Semifinal', subcampeon:'Subcampeón', campeon:'Campeón 🏆'
}

const CAT_LABEL: Record<string, string> = {
  sub19:'Sub 19', aficionados:'Aficionados', intermedia:'Intermedia', tc:'TC'
}

const CLUBES = ['Club Nuevo Olimpo','Valentín Ramos','Club Deportivo La Florida','Club San Miguel','Club Maipú','Club Providencia','Otro']

export default function TorneosExternosPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clubId, setClubId] = useState<string | null>(null)
  const [externos, setExternos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ club:'', clubNombre:'', categoria:'sub19', posicion:'fase_grupos', fecha:'' })
  const [guardando, setGuardando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      setClubId(p?.club_id)
      if (p?.jugador_id) {
        const { data: e } = await supabase.from('torneos_externos').select('*').eq('jugador_id', p.jugador_id).order('fecha', { ascending: false })
        setExternos(e || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const puntosPreview = ELO_TABLA[form.categoria]?.[form.posicion] || 0

  async function guardar() {
    const clubNombre = form.club === 'Otro' ? form.clubNombre : form.club
    if (!clubNombre || !form.fecha) return
    setGuardando(true)

    const puntos = ELO_TABLA[form.categoria]?.[form.posicion] || 0
    await supabase.from('torneos_externos').insert({
      club_id: clubId, jugador_id: perfil.jugador_id,
      nombre_club: clubNombre, categoria: form.categoria,
      posicion: form.posicion, fecha: form.fecha, puntos_elo: puntos
    })

    // Actualizar ELO
    const { data: jug } = await supabase.from('jugadores').select('elo').eq('id', perfil.jugador_id).single()
    const nuevoElo = (jug?.elo || 1200) + puntos
    await supabase.from('jugadores').update({ elo: nuevoElo }).eq('id', perfil.jugador_id)
    await supabase.from('historial_elo').insert({
      jugador_id: perfil.jugador_id, club_id: clubId,
      elo_antes: jug?.elo || 1200, elo_despues: nuevoElo,
      posicion: POSICION_LABEL[form.posicion], fecha: form.fecha
    })

    const { data: e } = await supabase.from('torneos_externos').select('*').eq('jugador_id', perfil.jugador_id).order('fecha', { ascending: false })
    setExternos(e || [])
    setModalOpen(false)
    setForm({ club:'', clubNombre:'', categoria:'sub19', posicion:'fase_grupos', fecha:'' })
    setGuardando(false)
  }

  const totalElo = externos.reduce((s, t) => s + t.puntos_elo, 0)

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:4 }}>Torneos externos</h1>
          <p style={{ fontSize:13, color:'#6c7280' }}>Registra torneos fuera del club y suma ELO</p>
        </div>
        {perfil?.jugador_id && (
          <button onClick={() => { setModalOpen(true); setForm(f => ({ ...f, fecha: new Date().toISOString().slice(0,10) })) }}
            style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            + Registrar
          </button>
        )}
      </div>

      {/* Total ELO */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, marginBottom:16, textAlign:'center' }}>
        <div style={{ fontSize:12, color:'#6c7280', marginBottom:4 }}>ELO ganado en torneos externos</div>
        <div style={{ fontSize:36, fontWeight:800, color:'#a78bfa', fontFamily:'monospace' }}>+{totalElo}</div>
      </div>

      {/* Lista */}
      {externos.length === 0 ? (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:40, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🌎</div>
          <div style={{ fontSize:14, color:'#c8cfe0', marginBottom:8 }}>Sin torneos externos aún</div>
          <div style={{ fontSize:13, color:'#6c7280' }}>Registra tus torneos fuera del club para sumar puntos ELO</div>
        </div>
      ) : externos.map(t => (
        <div key={t.id} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, padding:16, marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:600, color:'#c8cfe0', marginBottom:4 }}>{t.nombre_club}</div>
              <div style={{ fontSize:12, color:'#6c7280', marginBottom:6 }}>{t.fecha} · {CAT_LABEL[t.categoria] || t.categoria}</div>
              <span style={{ background:'#a78bfa22', color:'#a78bfa', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                {POSICION_LABEL[t.posicion] || t.posicion}
              </span>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:24, fontWeight:800, color:'#a78bfa', fontFamily:'monospace' }}>+{t.puntos_elo}</div>
              <div style={{ fontSize:10, color:'#6c7280' }}>ELO</div>
            </div>
          </div>
        </div>
      ))}

      {/* Modal */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:17, fontWeight:600, color:'#fff', marginBottom:20 }}>Registrar torneo externo</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Club / Lugar</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={form.club} onChange={e => setForm(f => ({ ...f, club: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {CLUBES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {form.club === 'Otro' && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Nombre del club</label>
                <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                  placeholder="Nombre del club" value={form.clubNombre} onChange={e => setForm(f => ({ ...f, clubNombre: e.target.value }))} />
              </div>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Categoría</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="sub19">Sub 19</option>
                <option value="aficionados">Aficionados</option>
                <option value="intermedia">Intermedia</option>
                <option value="tc">TC (Top Competencia)</option>
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Posición alcanzada</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={form.posicion} onChange={e => setForm(f => ({ ...f, posicion: e.target.value }))}>
                {Object.entries(POSICION_LABEL).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Fecha</label>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>

            <div style={{ background:'#0a0c12', borderRadius:10, padding:14, marginBottom:20, textAlign:'center' }}>
              <div style={{ fontSize:12, color:'#6c7280', marginBottom:4 }}>Puntos ELO a ganar</div>
              <div style={{ fontSize:28, fontWeight:800, color:'#a78bfa', fontFamily:'monospace' }}>+{puntosPreview}</div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #1e2030', borderRadius:8, color:'#6c7280', fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ flex:1, padding:11, background:'#6c63ff', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {guardando ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
