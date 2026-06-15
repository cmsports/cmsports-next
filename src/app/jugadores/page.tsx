'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient()

const badgeCategoria: Record<string, string> = {
  principiante: '#fbbf24',
  intermedio: '#60a5fa',
  avanzado: '#a78bfa'
}

const categorias = ['principiante', 'intermedio', 'avanzado']

export default function JugadoresPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [jugadores, setJugadores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [clubId, setClubId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [form, setForm] = useState({
    nombre:'', rut:'', email:'', telefono:'',
    categoria:'principiante',
    tipo_plan:'mensual',
    entrenamientos_por_semana:'3',
    mensualidad:'30000'
  })
  const [guardando, setGuardando] = useState(false)
  const [toast, setToast] = useState('')
  const [tabJug, setTabJug] = useState<'jugadores'|'ranking'>('jugadores')
  const [busquedaRanking, setBusquedaRanking] = useState('')
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
    cargarJugadores()
  }, [clubId])

  async function cargarJugadores() {
    const { data, error } = await supabase.from('jugadores').select('*').eq('club_id', clubId).neq('es_externo', true).order('elo', { ascending: false })
    if (error) { mostrarToast('Error al cargar jugadores'); return }
    setJugadores(data || [])
  }

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function abrirNuevo() {
    setEditando(null)
    setForm({
      nombre:'', rut:'', email:'', telefono:'',
      categoria:'principiante',
      tipo_plan:'mensual',
      entrenamientos_por_semana:'3',
      mensualidad:'30000'
    })
    setModalOpen(true)
  }

  function abrirEditar(j: any) {
    setEditando(j)
    setForm({
      nombre:j.nombre||'',
      rut:j.rut||'',
      email:j.email||'',
      telefono:j.telefono||'',
      categoria:j.categoria||'principiante',
      tipo_plan:j.tipo_plan||'mensual',
      entrenamientos_por_semana:String(j.entrenamientos_por_semana||3),
      mensualidad:String(j.mensualidad||30000)
    })
    setModalOpen(true)
  }

  async function guardar() {
    if (!form.nombre.trim()) { mostrarToast('El nombre es obligatorio'); return }
    if (!clubId) { mostrarToast('Error: no hay club activo'); return }
    setGuardando(true)

    const esLibre = form.tipo_plan === 'libre'
    const entSemana = esLibre ? null : (parseInt(form.entrenamientos_por_semana) || 3)
    const mensualidad = parseInt(form.mensualidad) || 25000
    // sesiones_limite se mantiene derivado del plan para que las vistas legacy
    // ("X/Y sesiones" en perfil, lista y mensualidades viejas) sigan funcionando.
    const sesionesLimite = esLibre ? 99 : (entSemana || 3) * 4

    const planFields = {
      categoria: form.categoria,
      tipo_plan: form.tipo_plan,
      entrenamientos_por_semana: entSemana,
      mensualidad: mensualidad,
      sesiones_limite: sesionesLimite
    }

    if (editando) {
      const { error } = await supabase.from('jugadores').update({
        nombre: form.nombre.trim(),
        rut: form.rut || null,
        email: form.email || null,
        telefono: form.telefono || null,
        ...planFields
      }).eq('id', editando.id)
      if (error) { mostrarToast('Error al editar: ' + error.message); setGuardando(false); return }
      mostrarToast('Jugador actualizado')
    } else {
      const { error } = await supabase.from('jugadores').insert({
        club_id: clubId,
        nombre: form.nombre.trim(),
        rut: form.rut || null,
        email: form.email || null,
        telefono: form.telefono || null,
        ...planFields,
        elo: 1200,
        sesiones_usadas: 0,
        estado: 'activo',
        es_externo: false
      })
      if (error) { mostrarToast('Error al crear: ' + error.message); setGuardando(false); return }
      mostrarToast('Jugador creado exitosamente')
    }

    setGuardando(false)
    setModalOpen(false)
    setForm({
      nombre:'', rut:'', email:'', telefono:'',
      categoria:'principiante',
      tipo_plan:'mensual',
      entrenamientos_por_semana:'3',
      mensualidad:'30000'
    })
    await cargarJugadores()
  }

  async function toggleEstado(j: any) {
    const nuevoEstado = j.estado === 'activo' ? 'bloqueado' : 'activo'
    await supabase.from('jugadores').update({ estado: nuevoEstado }).eq('id', j.id)
    mostrarToast(`Jugador ${nuevoEstado === 'activo' ? 'activado' : 'bloqueado'}`)
    cargarJugadores()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este jugador? Esta acción no se puede deshacer.')) return
    await supabase.from('jugadores').delete().eq('id', id)
    mostrarToast('Jugador eliminado')
    cargarJugadores()
  }

  async function exportarExcel() {
    const { utils, writeFile } = await import('xlsx')
    const datos = filtrados.map(j => ({
      'Nombre': j.nombre,
      'RUT': j.rut || '',
      'Email': j.email || '',
      'Teléfono': j.telefono || '',
      'Categoría': j.categoria,
      'Ranking': j.elo,
      'Sesiones usadas': j.sesiones_usadas,
      'Sesiones límite': j.sesiones_limite,
      'Estado': j.estado
    }))
    const ws = utils.json_to_sheet(datos)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Jugadores')
    writeFile(wb, 'jugadores.xlsx')
  }

  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
  const esAdmin = perfil?.rol === 'admin'

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff' }}>Jugadores</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportarExcel} style={{ background:'#14161f', color:'#34d399', border:'1px solid #1e2030', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>
            📥 Excel
          </button>
          {esAdmin && tabJug === 'jugadores' && (
            <button onClick={abrirNuevo} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              + Nuevo jugador
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#0a0c12', borderRadius:10, padding:4, marginBottom:16 }}>
        {[{key:'jugadores',label:'👥 Jugadores'},{key:'ranking',label:'🏆 Ranking'}].map(t => (
          <div key={t.key} onClick={() => setTabJug(t.key as any)}
            style={{ flex:1, padding:'9px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, background:tabJug===t.key?'#14161f':'transparent', color:tabJug===t.key?'#a78bfa':'#6c7280', transition:'all 0.15s' }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* TAB RANKING */}
      {tabJug === 'ranking' && (
        <div>
          <div style={{ marginBottom:12 }}>
            <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
              placeholder="🔍 Buscar jugador en el ranking..."
              value={busquedaRanking} onChange={e => setBusquedaRanking(e.target.value)} />
          </div>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
            {jugadores.filter(j => !busquedaRanking || j.nombre.toLowerCase().includes(busquedaRanking.toLowerCase()))
              .sort((a,b) => b.elo - a.elo)
              .map((j, i) => {
                const cols = ['#f59e0b','#6c63ff','#059669','#0891b2','#7c3aed','#ec4899','#14b8a6','#f97316']
                const posicion = jugadores.sort((a,b) => b.elo-a.elo).findIndex(x => x.id === j.id) + 1
                return (
                  <div key={j.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderBottom:'1px solid #1e2030' }}>
                    <div style={{ width:32, textAlign:'center', fontSize:14, fontWeight:700, color: posicion===1?'#fbbf24':posicion===2?'#94a3b8':posicion===3?'#f97316':'#6c7280' }}>
                      {posicion<=3 ? ['🥇','🥈','🥉'][posicion-1] : posicion}
                    </div>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:`linear-gradient(135deg,${cols[i%cols.length]},${cols[i%cols.length]}88)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'white', flexShrink:0 }}>
                      {j.nombre.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color:'#c8cfe0', fontWeight:500 }}>{j.nombre}</div>
                      <div style={{ fontSize:11, color:'#6c7280' }}>{j.categoria}</div>
                    </div>
                    <div style={{ fontSize:18, fontWeight:700, color:'#a78bfa', fontFamily:'monospace' }}>{j.elo}</div>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}

      {/* TAB JUGADORES */}
      {tabJug === 'jugadores' && <>
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, padding:12, marginBottom:16 }}>
        <input
          style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
          placeholder="Buscar jugador..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e2030' }}>
                {['#','Nombre','RUT','Categoría','Sesiones','Ranking','Estado',''].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((j, i) => (
                <tr key={j.id} style={{ borderBottom:'1px solid #1e2030' }}>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{String(i+1).padStart(3,'0')}</td>
                  <td style={{ padding:'12px 16px', fontWeight:600, color:'#c8cfe0', whiteSpace:'nowrap' }}>{j.nombre}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{j.rut || '—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ background: badgeCategoria[j.categoria] + '22', color: badgeCategoria[j.categoria], padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                      {j.categoria}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:13, color:'#c8cfe0' }}>{j.sesiones_usadas}/{j.sesiones_limite}</td>
                  <td style={{ padding:'12px 16px', fontWeight:700, color:'#a78bfa', fontFamily:'monospace' }}>{j.elo}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ background: j.estado === 'activo' ? '#34d39922' : '#f8717122', color: j.estado === 'activo' ? '#34d399' : '#f87171', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                      {j.estado}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:6, whiteSpace:'nowrap' }}>
                      <button onClick={() => router.push(`/jugadores/${j.id}`)} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Ver perfil</button>
                      {esAdmin && <>
                        <button onClick={() => abrirEditar(j)} style={{ background:'#1e1b4b', color:'#a78bfa', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>✏️</button>
                        <button onClick={() => toggleEstado(j)} style={{ background: j.estado==='activo'?'#f8717122':'#34d39922', color: j.estado==='activo'?'#f87171':'#34d399', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>
                          {j.estado==='activo'?'🔒':'✅'}
                        </button>
                        <button onClick={() => eliminar(j.id)} style={{ background:'#f8717122', color:'#f87171', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>✕</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtrados.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>
            {busqueda ? 'No se encontraron jugadores' : 'Sin jugadores registrados'}
          </div>
        )}
      </div>
      </>}

      {/* Modal crear/editar */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:17, fontWeight:600, color:'#fff', marginBottom:20 }}>
              {editando ? 'Editar jugador' : 'Nuevo jugador'}
            </div>
            {[
              { label:'Nombre completo *', key:'nombre', type:'text', placeholder:'Ej: Carlos Muñoz' },
              { label:'RUT', key:'rut', type:'text', placeholder:'12345678K' },
              { label:'Email', key:'email', type:'email', placeholder:'tu@email.com' },
              { label:'Teléfono', key:'telefono', type:'tel', placeholder:'+56 9 1234 5678' },
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

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Categoría</label>
              <select
                style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={form.categoria} onChange={e => setForm(prev => ({ ...prev, categoria: e.target.value }))}>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Plan */}
            <div style={{ background:'#0a0c12', border:'1px solid #1e2030', borderRadius:10, padding:14, marginBottom:20 }}>
              <div style={{ fontSize:11, color:'#a78bfa', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>Plan del jugador</div>

              {/* Tipo de plan */}
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Tipo de plan</label>
                <div style={{ display:'flex', background:'#14161f', borderRadius:8, padding:3 }}>
                  {[
                    {key:'mensual', label:'Mensual'},
                    {key:'semanal', label:'Semanal'},
                    {key:'libre', label:'Libre acceso'}
                  ].map(t => (
                    <div key={t.key} onClick={() => setForm(prev => ({ ...prev, tipo_plan: t.key }))}
                      style={{ flex:1, padding:'7px', textAlign:'center', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:500, background: form.tipo_plan===t.key ? '#1e1b4b':'transparent', color: form.tipo_plan===t.key ? '#a78bfa':'#6c7280', transition:'all 0.15s' }}>
                      {t.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Entrenamientos por semana — oculto en libre */}
              {form.tipo_plan !== 'libre' && (
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Entrenamientos por semana</label>
                  <input
                    style={{ width:'100%', background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                    type="number" min="1" max="7" placeholder="3"
                    value={form.entrenamientos_por_semana}
                    onChange={e => setForm(prev => ({ ...prev, entrenamientos_por_semana: e.target.value }))}
                  />
                </div>
              )}

              {/* Mensualidad: presets + custom */}
              <div>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Mensualidad (CLP)</label>
                <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                  {[
                    {monto:15000, ent:1, label:'$15.000'},
                    {monto:25000, ent:2, label:'$25.000'},
                    {monto:30000, ent:3, label:'$30.000'},
                    {monto:40000, ent:4, label:'$40.000'}
                  ].map(p => {
                    const seleccionado = parseInt(form.mensualidad) === p.monto
                    return (
                      <button key={p.monto} type="button"
                        onClick={() => setForm(prev => ({
                          ...prev,
                          mensualidad: String(p.monto),
                          entrenamientos_por_semana: prev.tipo_plan === 'libre' ? prev.entrenamientos_por_semana : String(p.ent)
                        }))}
                        style={{ flex:'1 1 calc(50% - 3px)', padding:'8px 10px', background: seleccionado ? '#1e1b4b':'#14161f', border: `1px solid ${seleccionado ? '#a78bfa':'#1e2030'}`, borderRadius:8, color: seleccionado ? '#a78bfa':'#8890a4', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                        {p.label}
                      </button>
                    )
                  })}
                </div>
                <input
                  style={{ width:'100%', background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                  type="number" placeholder="Monto personalizado"
                  value={form.mensualidad}
                  onChange={e => setForm(prev => ({ ...prev, mensualidad: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #1e2030', borderRadius:8, color:'#6c7280', fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ flex:1, padding:11, background:'#6c63ff', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear jugador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:'#1e2030', border:'1px solid #34d39944', borderRadius:10, padding:'12px 18px', fontSize:13, color:'#34d399', zIndex:200 }}>
          {toast}
        </div>
      )}
    </AppLayout>
  )
}
