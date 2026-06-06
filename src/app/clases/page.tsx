'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const diasLabel: Record<string, string> = {
  lunes:'Lunes', martes:'Martes', miercoles:'Miércoles',
  jueves:'Jueves', viernes:'Viernes', sabado:'Sábado', domingo:'Domingo'
}

export default function ClasesPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clubId, setClubId] = useState<string | null>(null)
  const [clases, setClases] = useState<any[]>([])
  const [profesores, setProfesores] = useState<any[]>([])
  const [reservas, setReservas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ fecha:'', profesorId:'', inicio:'', fin:'', contenido:'', grupo:'' })
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
    cargarClases()
  }, [clubId])

  async function cargarClases() {
    const [{ data: cl }, { data: pr }, { data: res }] = await Promise.all([
      supabase.from('clases').select('*').eq('club_id', clubId).order('fecha', { ascending: true }).order('hora_inicio', { ascending: true }),
      supabase.from('profesores').select('*').eq('club_id', clubId).eq('activo', true),
      supabase.from('reservas').select('clase_id,estado')
    ])
    setClases(cl || [])
    setProfesores(pr || [])
    setReservas(res || [])
  }

  async function guardarClase(publicar: boolean) {
    if (!form.fecha || !form.inicio || !form.contenido) return
    const diasMap: Record<number,string> = { 0:'domingo',1:'lunes',2:'martes',3:'miercoles',4:'jueves',5:'viernes',6:'sabado' }
    const diaSemana = diasMap[new Date(form.fecha+'T12:00:00').getDay()]
    await supabase.from('clases').insert({
      club_id: clubId, fecha: form.fecha, dia_semana: diaSemana,
      profesor_id: form.profesorId || null, hora_inicio: form.inicio,
      hora_fin: form.fin || null, contenido: form.contenido,
      grupo: form.grupo || null, publicada: publicar
    })
    setModalOpen(false)
    setForm({ fecha:'', profesorId:'', inicio:'', fin:'', contenido:'', grupo:'' })
    cargarClases()
  }

  async function publicarClase(id: string) {
    await supabase.from('clases').update({ publicada: true }).eq('id', id)
    cargarClases()
  }

  async function eliminarClase(id: string) {
    if (!confirm('¿Eliminar esta clase?')) return
    await supabase.from('clases').delete().eq('id', id)
    cargarClases()
  }

  const esProfesor = perfil?.rol === 'profesor'
  const esAdmin = perfil?.rol === 'admin'
  const puedeCrear = esProfesor || esAdmin

  // Agrupar por fecha
  const porFecha: Record<string, any[]> = {}
  clases.forEach(c => {
    const f = c.fecha || 'Sin fecha'
    if (!porFecha[f]) porFecha[f] = []
    porFecha[f].push(c)
  })

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff' }}>Programación de clases</h1>
        {puedeCrear && (
          <button onClick={() => { setModalOpen(true); setForm(f => ({ ...f, fecha: new Date().toISOString().slice(0,10) })) }}
            style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            + Nueva clase
          </button>
        )}
      </div>

      {Object.keys(porFecha).length === 0 ? (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>
          Sin clases programadas
        </div>
      ) : Object.entries(porFecha).map(([fecha, clasesF]) => {
        let fechaLabel = fecha
        try { if (fecha.includes('-')) fechaLabel = new Date(fecha+'T12:00:00').toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' }) } catch(e) {}
        const todasPublicadas = clasesF.every(c => c.publicada)
        return (
          <div key={fecha} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, marginBottom:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#fff', textTransform:'capitalize' }}>{fechaLabel}</div>
              {puedeCrear && !todasPublicadas && (
                <button onClick={async () => {
                  await supabase.from('clases').update({ publicada: true }).eq('club_id', clubId!).eq('fecha', fecha).eq('publicada', false)
                  cargarClases()
                }} style={{ background:'#6c63ff22', color:'#a78bfa', border:'1px solid #6c63ff44', borderRadius:6, padding:'5px 12px', fontSize:11, cursor:'pointer', fontWeight:600 }}>
                  📢 Publicar día
                </button>
              )}
              {todasPublicadas && <span style={{ background:'#34d39922', color:'#34d399', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>✓ Publicado</span>}
            </div>
            {clasesF.map(c => {
              const prof = profesores.find(p => p.id === c.profesor_id)
              const confirmados = reservas.filter(r => r.clase_id === c.id && r.estado === 'confirmado').length
              return (
                <div key={c.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 20px', borderBottom:'1px solid #1e2030', borderLeft:`3px solid ${c.publicada ? '#34d399' : '#1e2030'}` }}>
                  <div style={{ background:'#1e1b4b', color:'#a78bfa', padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:600, minWidth:90, textAlign:'center', flexShrink:0 }}>
                    {c.hora_inicio?.slice(0,5) || '—'}<br />
                    <span style={{ fontSize:10, color:'#6c7280', fontWeight:400 }}>{c.hora_fin?.slice(0,5) || ''}</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#c8cfe0' }}>{c.contenido}</div>
                    <div style={{ fontSize:11, color:'#6c7280', marginTop:3 }}>
                      {prof ? `👤 ${prof.nombre}` : ''}{c.grupo ? ` · ${c.grupo}` : ''}
                      {' · '}<span style={{ color:'#34d399' }}>✓ {confirmados} van</span>
                    </div>
                  </div>
                  {puedeCrear && (
                    <div style={{ display:'flex', gap:6 }}>
                      {!c.publicada && (
                        <button onClick={() => publicarClase(c.id)} style={{ background:'#34d39922', color:'#34d399', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Publicar</button>
                      )}
                      <button onClick={() => eliminarClase(c.id)} style={{ background:'#f8717122', color:'#f87171', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>✕</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Modal nueva clase */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:28, width:'100%', maxWidth:440 }}>
            <div style={{ fontSize:17, fontWeight:600, color:'#fff', marginBottom:20 }}>Nueva clase</div>
            {[
              { label:'Fecha', type:'date', key:'fecha' },
              { label:'Hora inicio', type:'time', key:'inicio' },
              { label:'Hora fin', type:'time', key:'fin' },
              { label:'Tipo de entrenamiento', type:'text', key:'contenido', placeholder:'Ej: Técnica de saque' },
              { label:'Descripción (opcional)', type:'text', key:'grupo', placeholder:'Detalles del entrenamiento' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>{f.label}</label>
                <input
                  style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                  type={f.type} placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Profesor</label>
              <select
                style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={form.profesorId} onChange={e => setForm(prev => ({ ...prev, profesorId: e.target.value }))}
              >
                <option value="">— Seleccionar —</option>
                {profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #1e2030', borderRadius:8, color:'#6c7280', fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={() => guardarClase(false)} style={{ flex:1, padding:11, background:'#1e1b4b', border:'none', borderRadius:8, color:'#a78bfa', fontSize:13, cursor:'pointer' }}>Borrador</button>
              <button onClick={() => guardarClase(true)} style={{ flex:1, padding:11, background:'#6c63ff', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>Publicar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
