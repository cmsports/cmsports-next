'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const POSICION_LABEL: Record<string, string> = {
  fase_grupos:'Fase de grupos', octavos:'Octavos de final', cuartos:'Cuartos de final',
  semifinal:'Semifinal', subcampeon:'Subcampeón', campeon:'Campeón 🏆'
}

const CAT_LABEL: Record<string, string> = {
  sub19:'Sub 19', aficionados:'Aficionados', intermedia:'Intermedia', tc:'TC'
}

const CLUBES = ['Club Nuevo Olimpo','Valentín Ramos','Club Deportivo La Florida','Club San Miguel','Club Maipú','Club Providencia','Otro']

export default function TorneosExternosPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [externos, setExternos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ club:'', clubNombre:'', categoria:'sub19', posicion:'fase_grupos', fecha:'' })
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState('')
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      if (perfil.jugador_id) {
        const { data: e } = await supabase.from('torneos_externos').select('id,nombre_club,fecha,categoria,posicion').eq('jugador_id', perfil.jugador_id).order('fecha', { ascending: false })
        setExternos(e || [])
      }
      setLoading(false)
    }
    cargar()
  }, [authLoading, perfil, router])

  async function guardar() {
    const clubNombre = form.club === 'Otro' ? form.clubNombre : form.club
    if (!clubNombre) { setFormError('Seleccioná un club o ingresá el nombre'); return }
    if (!form.fecha) { setFormError('Ingresá la fecha del torneo'); return }
    setFormError('')
    setGuardando(true)

    const { error } = await supabase.from('torneos_externos').insert({
      club_id: clubId, jugador_id: perfil?.jugador_id,
      nombre_club: clubNombre, categoria: form.categoria,
      posicion: form.posicion, fecha: form.fecha,
    })
    if (error) {
      alert(`No se pudo registrar: ${error.message}`)
      setGuardando(false)
      return
    }

    const { data: e } = await supabase.from('torneos_externos').select('id,nombre_club,fecha,categoria,posicion').eq('jugador_id', perfil?.jugador_id).order('fecha', { ascending: false })
    setExternos(e || [])
    setModalOpen(false)
    setForm({ club:'', clubNombre:'', categoria:'sub19', posicion:'fase_grupos', fecha:'' })
    setGuardando(false)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:4 }}>Torneos externos</h1>
          <p style={{ fontSize:13, color: muted }}>Registra torneos fuera del club</p>
        </div>
        {perfil?.jugador_id && (
          <button onClick={() => { setModalOpen(true); setForm(f => ({ ...f, fecha: new Date().toISOString().slice(0,10) })) }}
            style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            + Registrar
          </button>
        )}
      </div>

      {/* Lista */}
      {externos.length === 0 ? (
        <div style={{ ...card, padding:40, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🌎</div>
          <div style={{ fontSize:14, color: text, marginBottom:8 }}>Sin torneos externos aún</div>
          <div style={{ fontSize:13, color: muted }}>Registra tus torneos fuera del club</div>
        </div>
      ) : externos.map(t => (
        <div key={t.id} style={{ ...card, padding:16, marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:600, color: text, marginBottom:4 }}>{t.nombre_club}</div>
              <div style={{ fontSize:12, color: muted, marginBottom:6 }}>{t.fecha} · {CAT_LABEL[t.categoria] || t.categoria}</div>
              <span style={{ background:'#ede9fe', color:'#3730a3', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                {POSICION_LABEL[t.posicion] || t.posicion}
              </span>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:12, color: muted }}>{t.fecha}</div>
            </div>
          </div>
        </div>
      ))}

      {/* Modal */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:20 }}>Registrar torneo externo</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Club / Lugar</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={form.club} onChange={e => setForm(f => ({ ...f, club: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {CLUBES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {form.club === 'Otro' && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Nombre del club</label>
                <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  placeholder="Nombre del club" value={form.clubNombre} onChange={e => setForm(f => ({ ...f, clubNombre: e.target.value }))} />
              </div>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Categoría</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="sub19">Sub 19</option>
                <option value="aficionados">Aficionados</option>
                <option value="intermedia">Intermedia</option>
                <option value="tc">TC (Top Competencia)</option>
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Posición alcanzada</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={form.posicion} onChange={e => setForm(f => ({ ...f, posicion: e.target.value }))}>
                {Object.entries(POSICION_LABEL).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Fecha</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>

            {formError && <div style={{ color:'#dc2626', fontSize:12, marginBottom:10, padding:'8px 10px', background:'#fef2f2', borderRadius:7, border:'1px solid #fecaca' }}>{formError}</div>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setModalOpen(false); setFormError('') }} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {guardando ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
