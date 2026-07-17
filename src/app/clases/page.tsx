'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

function getInicioSemana(offset: number): Date {
  const hoy = new Date()
  const dia = hoy.getDay()
  const diff = dia === 0 ? 6 : dia - 1
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - diff + offset * 7)
  lunes.setHours(0, 0, 0, 0)
  return lunes
}

function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function obtenerProgramacion(offset: number, clubId: string) {
  const lunes = getInicioSemana(offset)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  const [{ data: clases }, { data: profesores }] = await Promise.all([
    supabase.from('clases').select('*').eq('club_id', clubId)
      .gte('fecha', fmtISO(lunes)).lte('fecha', fmtISO(domingo))
      .order('fecha', { ascending: true }).order('hora_inicio', { ascending: true }),
    supabase.from('profesores').select('*').eq('club_id', clubId).eq('activo', true),
  ])
  const claseIds = (clases || []).map(clase => clase.id)
  const { data: reservas } = claseIds.length > 0
    ? await supabase.from('reservas').select('clase_id,estado').in('clase_id', claseIds)
    : { data: [] }
  return { clases: clases || [], profesores: profesores || [], reservas: reservas || [] }
}

export default function ClasesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [clases, setClases] = useState<any[]>([])
  const [profesores, setProfesores] = useState<any[]>([])
  const [reservas, setReservas] = useState<any[]>([])
  const [cargaInicialCompleta, setCargaInicialCompleta] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ fecha:'', profesorId:'', inicio:'', fin:'', contenido:'', grupo:'' })
  const [semanaOffset, setSemanaOffset] = useState(0)
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  const mesesLargo = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const mesesCorto = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

  const cargarClases = useCallback(async (offset: number, cid?: string) => {
    const id = cid || clubId
    if (!id) return
    const programacion = await obtenerProgramacion(offset, id)
    setClases(programacion.clases)
    setProfesores(programacion.profesores)
    setReservas(programacion.reservas)
  }, [clubId])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (!perfil.club_id) return
    let activo = true

    async function cargarInicial() {
      const programacion = await obtenerProgramacion(semanaOffset, perfil!.club_id!)
      if (!activo) return
      setClases(programacion.clases)
      setProfesores(programacion.profesores)
      setReservas(programacion.reservas)
      setCargaInicialCompleta(true)
    }

    void cargarInicial()
    return () => { activo = false }
  }, [authLoading, perfil, router, semanaOffset])

  const lunes = getInicioSemana(semanaOffset)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  const esMismoMes = lunes.getMonth() === domingo.getMonth()
  const labelSemana = esMismoMes
    ? `${lunes.getDate()} – ${domingo.getDate()} ${mesesLargo[domingo.getMonth()]}`
    : `${lunes.getDate()} ${mesesCorto[lunes.getMonth()]} – ${domingo.getDate()} ${mesesCorto[domingo.getMonth()]}`

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
    cargarClases(semanaOffset)
  }

  async function publicarClase(id: string) {
    await supabase.from('clases').update({ publicada: true }).eq('id', id)
    cargarClases(semanaOffset)
  }

  async function eliminarClase(id: string) {
    if (!confirm('¿Eliminar esta clase?')) return
    await supabase.from('clases').delete().eq('id', id)
    cargarClases(semanaOffset)
  }

  const esProfesor = perfil?.rol === 'profesor'
  const esAdmin = perfil?.rol === 'admin'
  const puedeCrear = esProfesor || esAdmin

  const porFecha: Record<string, any[]> = {}
  clases.forEach(c => {
    const f = c.fecha || 'Sin fecha'
    if (!porFecha[f]) porFecha[f] = []
    porFecha[f].push(c)
  })

  if (authLoading || (!!clubId && !cargaInicialCompleta)) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color: text }}>Programación de clases</h1>
        {puedeCrear && (
          <button onClick={() => { setModalOpen(true); setForm(f => ({ ...f, fecha: new Date().toISOString().slice(0,10) })) }}
            style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            + Nueva clase
          </button>
        )}
      </div>

      {/* Navegación semanal */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:20 }}>
        <button onClick={() => setSemanaOffset(o => o - 1)}
          style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, color:'#4f46e5', width:32, height:32, cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
        <span style={{ fontSize:14, color: text, fontWeight:600, minWidth:180, textAlign:'center' }}>{labelSemana}</span>
        <button onClick={() => setSemanaOffset(o => o + 1)}
          style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, color:'#4f46e5', width:32, height:32, cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
        {semanaOffset !== 0 && (
          <button onClick={() => setSemanaOffset(0)}
            style={{ background:'transparent', border:'none', color: muted, fontSize:12, cursor:'pointer', textDecoration:'underline' }}>
            Hoy
          </button>
        )}
      </div>

      {Object.keys(porFecha).length === 0 ? (
        <div style={{ ...card, padding:40, textAlign:'center', color: hint, fontSize:13 }}>
          Sin clases programadas
        </div>
      ) : Object.entries(porFecha).map(([fecha, clasesF]) => {
        let fechaLabel = fecha
        try { if (fecha.includes('-')) fechaLabel = new Date(fecha+'T12:00:00').toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' }) } catch {}
        const todasPublicadas = clasesF.every(c => c.publicada)
        return (
          <div key={fecha} style={{ ...card, marginBottom:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:14, fontWeight:600, color: text, textTransform:'capitalize' }}>{fechaLabel}</div>
              {puedeCrear && !todasPublicadas && (
                <button onClick={async () => {
                  await supabase.from('clases').update({ publicada: true }).eq('club_id', clubId!).eq('fecha', fecha).eq('publicada', false)
                  cargarClases(semanaOffset)
                }} style={{ background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:6, padding:'5px 12px', fontSize:11, cursor:'pointer', fontWeight:600 }}>
                  Publicar día
                </button>
              )}
              {todasPublicadas && <span style={{ background:'#f0fdf4', color:'#16a34a', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>✓ Publicado</span>}
            </div>
            {clasesF.map(c => {
              const prof = profesores.find(p => p.id === c.profesor_id)
              const confirmados = reservas.filter(r => r.clase_id === c.id && r.estado === 'confirmado').length
              return (
                <div key={c.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 20px', borderBottom:'1px solid #f1f5f9', borderLeft:`3px solid ${c.publicada ? '#16a34a' : '#e2e8f0'}` }}>
                  <div style={{ background: c.publicada ? '#f0fdf4' : '#f4f7fa', color: c.publicada ? '#16a34a' : muted, padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:600, minWidth:90, textAlign:'center', flexShrink:0, border:`1px solid ${c.publicada ? '#bbf7d0' : '#e2e8f0'}` }}>
                    {c.hora_inicio?.slice(0,5) || '—'}<br />
                    <span style={{ fontSize:10, color: hint, fontWeight:400 }}>{c.hora_fin?.slice(0,5) || ''}</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color: text }}>{c.contenido}</div>
                    <div style={{ fontSize:11, color: muted, marginTop:3 }}>
                      {prof ? `${prof.nombre}` : ''}{c.grupo ? ` · ${c.grupo}` : ''}
                      {' · '}<span style={{ color:'#16a34a' }}>✓ {confirmados} van</span>
                    </div>
                  </div>
                  {puedeCrear && (
                    <div style={{ display:'flex', gap:6 }}>
                      {!c.publicada && (
                        <button onClick={() => publicarClase(c.id)} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Publicar</button>
                      )}
                      <button onClick={() => eliminarClase(c.id)} style={{ background:'#fef2f2', color:'#dc2626', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>✕</button>
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
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:440, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:20 }}>Nueva clase</div>
            {[
              { label:'Fecha', type:'date', key:'fecha' },
              { label:'Hora inicio', type:'time', key:'inicio' },
              { label:'Hora fin', type:'time', key:'fin' },
              { label:'Tipo de entrenamiento', type:'text', key:'contenido', placeholder:'Ej: Técnica de saque' },
              { label:'Descripción (opcional)', type:'text', key:'grupo', placeholder:'Detalles del entrenamiento' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>{f.label}</label>
                <input
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type={f.type} placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Profesor</label>
              <select
                style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={form.profesorId} onChange={e => setForm(prev => ({ ...prev, profesorId: e.target.value }))}
              >
                <option value="">— Seleccionar —</option>
                {profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={() => guardarClase(false)} style={{ flex:1, padding:11, background:'#ede9fe', border:'none', borderRadius:8, color:'#3730a3', fontSize:13, cursor:'pointer', fontWeight:500 }}>Borrador</button>
              <button onClick={() => guardarClase(true)} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>Publicar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
