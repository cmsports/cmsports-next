'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatRut } from '@/lib/rut'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { crearJugador, editarJugador, toggleEstadoJugador, eliminarJugador } from '@/app/actions/jugadores'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const badgeCategoria: Record<string, { bg: string; color: string }> = {
  principiante: { bg: '#fffbeb', color: '#d97706' },
  intermedio:   { bg: '#ede9fe', color: '#3730a3' },
  avanzado:     { bg: '#f0fdf4', color: '#16a34a' },
}

const categorias = ['principiante', 'intermedio', 'avanzado']

export default function JugadoresPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [jugadores, setJugadores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [form, setForm] = useState({
    nombre:'', rut:'', email:'', telefono:'', password:'',
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
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) {
      cargarJugadores(perfil.club_id).then(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [authLoading, perfil])

  async function cargarJugadores(cid?: string) {
    const id = cid || clubId
    const { data, error } = await supabase.from('jugadores').select('*').eq('club_id', id).neq('es_externo', true).order('elo', { ascending: false })
    if (error) { mostrarToast('Error al cargar jugadores'); return }
    setJugadores(data || [])
  }

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function abrirNuevo() {
    setEditando(null)
    setForm({ nombre:'', rut:'', email:'', telefono:'', password:'', categoria:'principiante', tipo_plan:'mensual', entrenamientos_por_semana:'3', mensualidad:'30000' })
    setModalOpen(true)
  }

  function abrirEditar(j: any) {
    setEditando(j)
    setForm({
      nombre:j.nombre||'', rut:j.rut||'', email:j.email||'', telefono:j.telefono||'', password:'',
      categoria:j.categoria||'principiante', tipo_plan:j.tipo_plan||'mensual',
      entrenamientos_por_semana:String(j.entrenamientos_por_semana||3),
      mensualidad:String(j.mensualidad||30000)
    })
    setModalOpen(true)
  }

  async function guardar() {
    if (!form.nombre.trim()) { mostrarToast('El nombre es obligatorio'); return }
    if (!clubId) { mostrarToast('Error: no hay club activo'); return }
    if (!editando) {
      if (!form.email.trim()) { mostrarToast('El email es obligatorio'); return }
      if (form.password.length < 6) { mostrarToast('La contraseña debe tener al menos 6 caracteres'); return }
    }
    setGuardando(true)

    const esLibre = form.tipo_plan === 'libre'
    const entSemana = esLibre ? null : (parseInt(form.entrenamientos_por_semana) || 3)
    const mensualidad = parseInt(form.mensualidad) || 25000
    const sesionesLimite = esLibre ? 99 : (entSemana || 3) * 4

    const planFields = {
      categoria: form.categoria, tipo_plan: form.tipo_plan,
      entrenamientos_por_semana: entSemana, mensualidad,
      sesiones_limite: sesionesLimite
    }

    if (editando) {
      const res = await editarJugador({ jugadorId: editando.id, nombre: form.nombre, rut: form.rut, email: form.email, telefono: form.telefono, ...planFields })
      if (res.error) { mostrarToast(res.error); setGuardando(false); return }
      mostrarToast('Jugador actualizado')
    } else {
      const res = await crearJugador({ nombre: form.nombre, rut: form.rut, email: form.email, password: form.password, telefono: form.telefono, ...planFields })
      if (res.error) { mostrarToast(res.error); setGuardando(false); return }
      if (res.cuentaError) mostrarToast('Jugador creado, pero falló la cuenta de acceso: ' + res.cuentaError)
      else mostrarToast('Jugador creado exitosamente, ya puede iniciar sesión')
    }

    setGuardando(false)
    setModalOpen(false)
    setForm({ nombre:'', rut:'', email:'', telefono:'', password:'', categoria:'principiante', tipo_plan:'mensual', entrenamientos_por_semana:'3', mensualidad:'30000' })
    await cargarJugadores()
  }

  async function toggleEstado(j: any) {
    const nuevoEstado = j.estado === 'activo' ? 'bloqueado' : 'activo'
    await toggleEstadoJugador({ jugadorId: j.id, nuevoEstado })
    mostrarToast(`Jugador ${nuevoEstado === 'activo' ? 'activado' : 'bloqueado'}`)
    cargarJugadores()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este jugador? Esta acción no se puede deshacer.')) return
    await eliminarJugador({ jugadorId: id })
    mostrarToast('Jugador eliminado')
    cargarJugadores()
  }

  async function exportarExcel() {
    const { utils, writeFile } = await import('xlsx')
    const datos = filtrados.map(j => ({
      'Nombre': j.nombre, 'RUT': j.rut || '', 'Email': j.email || '', 'Teléfono': j.telefono || '',
      'Categoría': j.categoria, 'Ranking': j.elo, 'Sesiones usadas': j.sesiones_usadas,
      'Sesiones límite': j.sesiones_limite, 'Estado': j.estado
    }))
    const ws = utils.json_to_sheet(datos)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Jugadores')
    writeFile(wb, 'jugadores.xlsx')
  }

  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
  const esAdmin = perfil?.rol === 'admin'

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color: text }}>Jugadores</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportarExcel} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>
            Exportar Excel
          </button>
          {esAdmin && tabJug === 'jugadores' && (
            <button onClick={abrirNuevo} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              + Nuevo jugador
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#e2e8f0', borderRadius:10, padding:4, marginBottom:16 }}>
        {[{key:'jugadores',label:'Jugadores'},{key:'ranking',label:'Ranking'}].map(t => (
          <div key={t.key} onClick={() => setTabJug(t.key as any)}
            style={{ flex:1, padding:'9px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, background:tabJug===t.key?'#ffffff':'transparent', color:tabJug===t.key?'#3730a3': muted, transition:'all 0.15s', boxShadow: tabJug===t.key ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* TAB RANKING */}
      {tabJug === 'ranking' && (
        <div>
          <div style={{ marginBottom:12 }}>
            <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
              placeholder="Buscar jugador en el ranking..."
              value={busquedaRanking} onChange={e => setBusquedaRanking(e.target.value)} />
          </div>
          <div style={{ ...card, overflow:'hidden' }}>
            {jugadores.filter(j => !busquedaRanking || j.nombre.toLowerCase().includes(busquedaRanking.toLowerCase()))
              .sort((a,b) => b.elo - a.elo)
              .map((j) => {
                const posicion = jugadores.sort((a,b) => b.elo-a.elo).findIndex(x => x.id === j.id) + 1
                const esAdmin = perfil?.rol === 'admin'
                const esProfesor = perfil?.rol === 'profesor'
                const esPropio = perfil?.jugador_id === j.id
                const puedeVer = esAdmin || esProfesor || esPropio
                return (
                  <div key={j.id}
                    onClick={() => puedeVer && router.push(`/jugadores/${j.id}`)}
                    style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderBottom:'1px solid #f1f5f9', cursor: puedeVer ? 'pointer' : 'default', transition:'background 0.1s' }}
                    onMouseEnter={e => { if (puedeVer) (e.currentTarget as HTMLDivElement).style.background = '#f8fafc' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <div style={{ width:32, textAlign:'center', fontSize:14, fontWeight:700, color: posicion===1?'#d97706':posicion===2?'#64748b':posicion===3?'#f43f5e': hint }}>
                      {posicion<=3 ? ['🥇','🥈','🥉'][posicion-1] : posicion}
                    </div>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'#ede9fe', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#3730a3', flexShrink:0 }}>
                      {j.nombre.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color: text, fontWeight:500 }}>{j.nombre}</div>
                      <div style={{ fontSize:11, color: muted }}>{j.categoria}</div>
                    </div>
                    <div style={{ fontSize:18, fontWeight:700, color:'#4f46e5', fontFamily:'monospace' }}>{j.elo}</div>
                    {puedeVer && <div style={{ fontSize:14, color: hint }}>›</div>}
                  </div>
                )
              })
            }
          </div>
        </div>
      )}

      {/* TAB JUGADORES */}
      {tabJug === 'jugadores' && <>
      <div style={{ ...card, padding:12, marginBottom:16 }}>
        <input
          style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
          placeholder="Buscar jugador..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      {/* Vista tabla — pantallas medianas y grandes */}
      <div className="hidden sm:block" style={{ ...card, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['#','Nombre','RUT','Categoría','Sesiones','Ranking','Estado',''].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((j, i) => {
                const cat = badgeCategoria[j.categoria] || { bg: '#f4f7fa', color: muted }
                return (
                  <tr key={j.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>{String(i+1).padStart(3,'0')}</td>
                    <td style={{ padding:'12px 16px', fontWeight:600, color: text, whiteSpace:'nowrap' }}>{j.nombre}</td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>{j.rut || '—'}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: cat.bg, color: cat.color, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                        {j.categoria}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:13, color: muted }}>{j.sesiones_usadas}/{j.sesiones_limite}</td>
                    <td style={{ padding:'12px 16px', fontWeight:700, color:'#4f46e5', fontFamily:'monospace' }}>{j.elo}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: j.estado === 'activo' ? '#f0fdf4' : '#fef2f2', color: j.estado === 'activo' ? '#16a34a' : '#dc2626', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                        {j.estado === 'activo' ? '✅ Activo' : '🚫 Bloqueado'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', gap:6, whiteSpace:'nowrap' }}>
                        <button onClick={() => router.push(`/jugadores/${j.id}`)} style={{ background:'#ede9fe', color:'#3730a3', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Ver perfil</button>
                        {esAdmin && <>
                          <button onClick={() => abrirEditar(j)} style={{ background:'#f4f7fa', color: muted, border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Editar</button>
                          <button onClick={() => toggleEstado(j)} style={{ background: j.estado==='activo'?'#fef2f2':'#f0fdf4', color: j.estado==='activo'?'#dc2626':'#16a34a', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>
                            {j.estado==='activo'?'🚫 Bloquear':'✅ Activar'}
                          </button>
                          <button onClick={() => eliminar(j.id)} style={{ background:'#fef2f2', color:'#dc2626', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>✕</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtrados.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>
            {busqueda ? 'No se encontraron jugadores' : 'Sin jugadores registrados'}
          </div>
        )}
      </div>

      {/* Vista tarjetas — celular */}
      <div className="sm:hidden" style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filtrados.map((j, i) => {
          const cat = badgeCategoria[j.categoria] || { bg: '#f4f7fa', color: muted }
          return (
            <div key={j.id} style={{ ...card, padding:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:11, color: hint, marginBottom:2 }}>{String(i+1).padStart(3,'0')}</div>
                  <div style={{ fontSize:15, fontWeight:600, color: text }}>{j.nombre}</div>
                  <div style={{ fontSize:12, color: muted, marginTop:2 }}>{j.rut || '—'}</div>
                </div>
                <div style={{ fontSize:18, fontWeight:700, color:'#4f46e5', fontFamily:'monospace' }}>{j.elo}</div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                <span style={{ background: cat.bg, color: cat.color, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>{j.categoria}</span>
                <span style={{ background: j.estado === 'activo' ? '#f0fdf4' : '#fef2f2', color: j.estado === 'activo' ? '#16a34a' : '#dc2626', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                  {j.estado === 'activo' ? '✅ Activo' : '🚫 Bloqueado'}
                </span>
                <span style={{ background:'#f4f7fa', color: muted, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>{j.sesiones_usadas}/{j.sesiones_limite} sesiones</span>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={() => router.push(`/jugadores/${j.id}`)} style={{ flex:'1 1 auto', background:'#ede9fe', color:'#3730a3', border:'none', borderRadius:8, padding:'8px 10px', fontSize:12, cursor:'pointer' }}>Ver perfil</button>
                {esAdmin && <>
                  <button onClick={() => abrirEditar(j)} style={{ flex:'1 1 auto', background:'#f4f7fa', color: muted, border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:12, cursor:'pointer' }}>Editar</button>
                  <button onClick={() => toggleEstado(j)} style={{ flex:'1 1 auto', background: j.estado==='activo'?'#fef2f2':'#f0fdf4', color: j.estado==='activo'?'#dc2626':'#16a34a', border:'none', borderRadius:8, padding:'8px 10px', fontSize:12, cursor:'pointer' }}>
                    {j.estado==='activo'?'🚫 Bloquear':'✅ Activar'}
                  </button>
                  <button onClick={() => eliminar(j.id)} style={{ background:'#fef2f2', color:'#dc2626', border:'none', borderRadius:8, padding:'8px 10px', fontSize:12, cursor:'pointer' }}>✕</button>
                </>}
              </div>
            </div>
          )
        })}
        {filtrados.length === 0 && (
          <div style={{ ...card, padding:40, textAlign:'center', color: hint, fontSize:13 }}>
            {busqueda ? 'No se encontraron jugadores' : 'Sin jugadores registrados'}
          </div>
        )}
      </div>
      </>}

      {/* Modal crear/editar */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:20 }}>
              {editando ? 'Editar jugador' : 'Nuevo jugador'}
            </div>
            {[
              { label:'Nombre completo *', key:'nombre', type:'text', placeholder:'Ej: Carlos Muñoz' },
              { label:'RUT', key:'rut', type:'text', placeholder:'12345678-9' },
              { label: editando ? 'Email' : 'Email *', key:'email', type:'email', placeholder:'tu@email.com' },
              { label:'Teléfono', key:'telefono', type:'tel', placeholder:'+56 9 1234 5678' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>{f.label}</label>
                <input
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type={f.type} placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: f.key === 'rut' ? formatRut(e.target.value) : e.target.value }))}
                />
              </div>
            ))}

            {!editando && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Contraseña *</label>
                <input
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="text" placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                />
                <div style={{ fontSize:11, color: hint, marginTop:4 }}>
                  El jugador entrará con este email y esta contraseña. Podrá actualizar el resto de sus datos desde su perfil.
                </div>
              </div>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Categoría</label>
              <select
                style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={form.categoria} onChange={e => setForm(prev => ({ ...prev, categoria: e.target.value }))}>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Plan */}
            <div style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:10, padding:14, marginBottom:20 }}>
              <div style={{ fontSize:11, color:'#3730a3', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>Plan del jugador</div>

              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Tipo de plan</label>
                <div style={{ display:'flex', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
                  {[{key:'mensual', label:'Mensual'},{key:'semanal', label:'Semanal'},{key:'libre', label:'Libre acceso'}].map(t => (
                    <div key={t.key} onClick={() => setForm(prev => ({ ...prev, tipo_plan: t.key }))}
                      style={{ flex:1, padding:'8px', textAlign:'center', cursor:'pointer', fontSize:12, fontWeight:500, background: form.tipo_plan===t.key ? '#ede9fe':'transparent', color: form.tipo_plan===t.key ? '#3730a3': muted, transition:'all 0.15s' }}>
                      {t.label}
                    </div>
                  ))}
                </div>
              </div>

              {form.tipo_plan !== 'libre' && (
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Entrenamientos por semana</label>
                  <input
                    style={{ width:'100%', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                    type="number" min="1" max="7" placeholder="3"
                    value={form.entrenamientos_por_semana}
                    onChange={e => setForm(prev => ({ ...prev, entrenamientos_por_semana: e.target.value }))}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Mensualidad (CLP)</label>
                <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                  {[{monto:15000, ent:1, label:'$15.000'},{monto:25000, ent:2, label:'$25.000'},{monto:30000, ent:3, label:'$30.000'},{monto:40000, ent:4, label:'$40.000'}].map(p => {
                    const seleccionado = parseInt(form.mensualidad) === p.monto
                    return (
                      <button key={p.monto} type="button"
                        onClick={() => setForm(prev => ({ ...prev, mensualidad: String(p.monto), entrenamientos_por_semana: prev.tipo_plan === 'libre' ? prev.entrenamientos_por_semana : String(p.ent) }))}
                        style={{ flex:'1 1 calc(50% - 3px)', padding:'8px 10px', background: seleccionado ? '#ede9fe':'#ffffff', border: `1px solid ${seleccionado ? '#4f46e5':'#e2e8f0'}`, borderRadius:8, color: seleccionado ? '#3730a3': muted, fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                        {p.label}
                      </button>
                    )
                  })}
                </div>
                <input
                  style={{ width:'100%', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="number" placeholder="Monto personalizado"
                  value={form.mensualidad}
                  onChange={e => setForm(prev => ({ ...prev, mensualidad: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear jugador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'12px 18px', fontSize:13, color:'#16a34a', zIndex:200, boxShadow:'0 4px 12px rgba(15,23,42,0.12)' }}>
          {toast}
        </div>
      )}
    </AppLayout>
  )
}
