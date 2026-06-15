'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient()

const catLabel: Record<string, string> = {
  mensualidad:'Mensualidad', inscripcion_torneo:'Inscripción torneo',
  arriendo_cancha:'Arriendo cancha', donacion:'Donación', otro_ingreso:'Otro ingreso',
  sueldo_profesor:'Sueldo profesor', sueldo_staff:'Sueldo staff',
  material_deportivo:'Material deportivo', servicios_basicos:'Servicios básicos',
  mantenimiento:'Mantenimiento', otro_gasto:'Otro gasto'
}

const categoriasIngreso = ['mensualidad','inscripcion_torneo','arriendo_cancha','donacion','otro_ingreso']
const categoriasGasto = ['sueldo_profesor','sueldo_staff','arriendo_cancha','material_deportivo','servicios_basicos','mantenimiento','otro_gasto']

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function FinanzasPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [profesores, setProfesores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [clubId, setClubId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [tabActivo, setTabActivo] = useState<'movimientos'|'reportes'|'historial'>('movimientos')
  const [jugadoresFinanzas, setJugadoresFinanzas] = useState<any[]>([])
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState<any>(null)
  const [historialJugador, setHistorialJugador] = useState<any[]>([])
  const [busquedaJugador, setBusquedaJugador] = useState('')
  const [form, setForm] = useState({
    tipo: 'ingreso', categoria: 'mensualidad', descripcion: '',
    monto: '', fecha: new Date().toISOString().slice(0,10),
    profesorId: '', mesCorr: String(new Date().getMonth()+1), anioCorr: String(new Date().getFullYear())
  })
  const [guardando, setGuardando] = useState(false)
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
    cargarMovimientos()
    cargarProfesores()
  }, [clubId, mes, anio])

  async function cargarMovimientos() {
    const mesStr = String(mes).padStart(2, '0')
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const inicio = `${anio}-${mesStr}-01`
    const fin = `${anio}-${mesStr}-${String(ultimoDia).padStart(2,'0')}`
    const { data: jugs } = await supabase.from('jugadores').select('id,nombre,telefono').eq('club_id', clubId).neq('es_externo', true).order('nombre')
    setJugadoresFinanzas(jugs || [])
    const { data } = await supabase.from('movimientos').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha', { ascending: false })
    setMovimientos(data || [])
  }

  async function cargarProfesores() {
    const { data } = await supabase.from('profesores').select('*').eq('club_id', clubId)
    setProfesores(data || [])
  }

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 12) { nuevoMes = 1; nuevoAnio++ }
    if (nuevoMes < 1) { nuevoMes = 12; nuevoAnio-- }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  const categoriasActuales = form.tipo === 'ingreso' ? categoriasIngreso : categoriasGasto
  const esSueldo = form.categoria === 'sueldo_profesor' || form.categoria === 'sueldo_staff'

  async function guardarMovimiento() {
    if (!form.monto || !form.fecha) return
    setGuardando(true)

    let descripcion = form.descripcion
    if (esSueldo && !descripcion) {
      const prof = profesores.find(p => p.id === form.profesorId)
      descripcion = `${catLabel[form.categoria]} — ${prof?.nombre || 'Staff'} · ${mesesN[parseInt(form.mesCorr)-1]} ${form.anioCorr}`
    }
    if (!descripcion) descripcion = catLabel[form.categoria] || form.categoria

    await supabase.from('movimientos').insert({
      club_id: clubId, tipo: form.tipo, categoria: form.categoria,
      descripcion, monto: parseInt(form.monto), fecha: form.fecha,
      registrado_por_nombre: perfil?.nombre || 'Admin',
      ...(esSueldo && form.profesorId ? { profesor_id: form.profesorId } : {}),
      ...(esSueldo ? { mes_correspondiente: parseInt(form.mesCorr), anio_correspondiente: parseInt(form.anioCorr) } : {})
    })

    setGuardando(false)
    setModalOpen(false)
    setForm({ tipo:'ingreso', categoria:'mensualidad', descripcion:'', monto:'', fecha:new Date().toISOString().slice(0,10), profesorId:'', mesCorr:String(new Date().getMonth()+1), anioCorr:String(new Date().getFullYear()) })
    cargarMovimientos()
  }

  async function exportarExcel() {
    const { utils, writeFile } = await import('xlsx')
    const datos = movimientosFiltrados.map(m => ({
      'Fecha': m.fecha,
      'Tipo': m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
      'Categoría': catLabel[m.categoria] || m.categoria,
      'Descripción': m.descripcion,
      'Monto': m.monto,
      'Registrado por': m.registrado_por_nombre || 'Admin',
      'Mes correspondiente': m.mes_correspondiente || '',
      'Año correspondiente': m.anio_correspondiente || ''
    }))
    const ws = utils.json_to_sheet(datos)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Finanzas')
    writeFile(wb, `finanzas_${mesesN[mes-1]}_${anio}.xlsx`)
  }

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
  const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const gastos = movimientos.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)

  const desgloseIngresos: Record<string, number> = {}
  const desgloseGastos: Record<string, number> = {}
  movimientos.forEach(m => {
    if (m.tipo === 'ingreso') desgloseIngresos[m.categoria] = (desgloseIngresos[m.categoria] || 0) + m.monto
    else desgloseGastos[m.categoria] = (desgloseGastos[m.categoria] || 0) + m.monto
  })

  const movimientosFiltrados = movimientos.filter(m =>
    (!filtroTipo || m.tipo === filtroTipo) &&
    (!busqueda || m.descripcion?.toLowerCase().includes(busqueda.toLowerCase()) || m.categoria?.toLowerCase().includes(busqueda.toLowerCase()))
  )

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => cambiarMes(-1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>◀</button>
          <span style={{ fontSize:16, fontWeight:600, color:'#fff', minWidth:160, textAlign:'center' }}>{mesesN[mes-1]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>▶</button>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportarExcel} style={{ background:'#14161f', color:'#34d399', border:'1px solid #1e2030', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>📥 Excel</button>
          <button onClick={() => setModalOpen(true)} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>+ Movimiento</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#0a0c12', borderRadius:10, padding:4, marginBottom:20 }}>
        {[
          { key:'movimientos', label:'💰 Movimientos' },
          { key:'reportes', label:'📄 Reportes' },
        ].map(t => (
          <div key={t.key} onClick={() => setTabActivo(t.key as any)}
            style={{ flex:1, padding:'9px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, background:tabActivo===t.key?'#14161f':'transparent', color:tabActivo===t.key?'#a78bfa':'#6c7280', transition:'all 0.15s' }}>
            {t.label}
          </div>
        ))}
      </div>



      {tabActivo === 'movimientos' && (<>
      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
        {[
          { label:'Ingresos', value:fmt(ingresos), color:'#34d399' },
          { label:'Gastos', value:fmt(gastos), color:'#f87171' },
          { label:'Balance neto', value:fmt(ingresos-gastos), color:'#a78bfa' },
        ].map(s => (
          <div key={s.label} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20 }}>
            <div style={{ fontSize:24, fontWeight:700, color:s.color, fontFamily:'monospace', marginBottom:4 }}>{s.value}</div>
            <div style={{ fontSize:12, color:'#6c7280' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Desglose */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Ingresos por categoría</div>
          {Object.entries(desgloseIngresos).length === 0
            ? <p style={{ fontSize:12, color:'#4b5063' }}>Sin ingresos</p>
            : Object.entries(desgloseIngresos).map(([cat, total]) => (
              <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #1a1d2e', fontSize:13 }}>
                <span style={{ color:'#8890a4' }}>{catLabel[cat] || cat}</span>
                <span style={{ color:'#34d399', fontWeight:600, fontFamily:'monospace' }}>{fmt(total)}</span>
              </div>
            ))
          }
        </div>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Gastos por categoría</div>
          {Object.entries(desgloseGastos).length === 0
            ? <p style={{ fontSize:12, color:'#4b5063' }}>Sin gastos</p>
            : Object.entries(desgloseGastos).map(([cat, total]) => (
              <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #1a1d2e', fontSize:13 }}>
                <span style={{ color:'#8890a4' }}>{catLabel[cat] || cat}</span>
                <span style={{ color:'#f87171', fontWeight:600, fontFamily:'monospace' }}>{fmt(total)}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Buscador movimientos */}
      <div style={{ marginBottom:12 }}>
        <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
          placeholder="🔍 Buscar por descripción o categoría..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {/* Tab historial pagos */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>📋 Historial de pagos por jugador</div>
        </div>
        <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none', marginBottom: busquedaJugador.length > 1 ? 8 : 0 }}
          placeholder="Buscar jugador para ver su historial..."
          value={busquedaJugador} onChange={e => setBusquedaJugador(e.target.value)} />
        {busquedaJugador.length > 1 && !jugadorSeleccionado && (
          <div style={{ background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, overflow:'hidden' }}>
            {jugadoresFinanzas.filter(j => j.nombre.toLowerCase().includes(busquedaJugador.toLowerCase())).slice(0,5).map(j => (
              <div key={j.id} onClick={async () => {
                setJugadorSeleccionado(j)
                setBusquedaJugador(j.nombre)
                const { data: mens } = await supabase.from('mensualidades').select('*').eq('jugador_id', j.id).order('anio').order('mes')
                setHistorialJugador(mens || [])
              }} style={{ padding:'10px 14px', borderBottom:'1px solid #1e2030', cursor:'pointer', fontSize:13, color:'#c8cfe0' }}>
                {j.nombre}
              </div>
            ))}
          </div>
        )}
        {jugadorSeleccionado && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>{jugadorSeleccionado.nombre}</div>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ color:'#34d399', fontSize:12 }}>✅ {historialJugador.filter(m=>m.estado==='pagado').length} pagados</span>
                <span style={{ color:'#fbbf24', fontSize:12 }}>⏳ {historialJugador.filter(m=>m.estado==='pendiente').length} pendientes</span>
                <span style={{ color:'#f87171', fontSize:12 }}>🔴 {historialJugador.filter(m=>m.estado==='atrasado').length} atrasados</span>
                <button onClick={() => { setJugadorSeleccionado(null); setBusquedaJugador('') }}
                  style={{ background:'transparent', border:'1px solid #1e2030', borderRadius:6, padding:'3px 8px', color:'#6c7280', fontSize:11, cursor:'pointer' }}>✕ Cerrar</button>
              </div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:400 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #1e2030' }}>
                    {['Mes','Año','Estado','Fecha pago','Monto'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historialJugador.map((m,i) => {
                    const col = m.estado==='pagado'?'#34d399':m.estado==='atrasado'?'#f87171':'#fbbf24'
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid #1e2030' }}>
                        <td style={{ padding:'8px 12px', fontSize:13, color:'#c8cfe0' }}>{mesesN[m.mes-1]}</td>
                        <td style={{ padding:'8px 12px', fontSize:13, color:'#6c7280' }}>{m.anio}</td>
                        <td style={{ padding:'8px 12px' }}>
                          <span style={{ background:col+'22', color:col, padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                            {m.estado==='pagado'?'✅ Pagado':m.estado==='atrasado'?'🔴 Atrasado':'⏳ Pendiente'}
                          </span>
                        </td>
                        <td style={{ padding:'8px 12px', fontSize:12, color:'#6c7280' }}>{m.fecha_pago||'—'}</td>
                        <td style={{ padding:'8px 12px', fontSize:13, color:'#a78bfa', fontFamily:'monospace' }}>{m.monto?'$'+m.monto.toLocaleString('es-CL'):'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {jugadorSeleccionado.telefono && (
              <div style={{ marginTop:12 }}>
                <a href={`https://wa.me/${jugadorSeleccionado.telefono.replace(/[^0-9]/g,'')}`} target="_blank"
                  style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, textDecoration:'none' }}>
                  💬 Contactar por WhatsApp
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabla */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>Todos los movimientos</div>
          <select
            style={{ background:'#0a0c12', border:'1px solid #1e2030', borderRadius:6, padding:'5px 10px', color:'#c8cfe0', fontSize:12, outline:'none' }}
            value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="gasto">Gastos</option>
          </select>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e2030' }}>
                {['Fecha','Categoría','Descripción','Registrado por','Monto'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimientosFiltrados.map(m => (
                <tr key={m.id} style={{ borderBottom:'1px solid #1e2030' }}>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280', whiteSpace:'nowrap' }}>{m.fecha || '—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ background: m.tipo === 'ingreso' ? '#34d39922' : '#f8717122', color: m.tipo === 'ingreso' ? '#34d399' : '#f87171', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>
                      {catLabel[m.categoria] || m.categoria || '—'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:13, color:'#c8cfe0' }}>{m.descripcion}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280', whiteSpace:'nowrap' }}>{m.registrado_por_nombre || 'Admin'}</td>
                  <td style={{ padding:'12px 16px', fontWeight:700, fontFamily:'monospace', whiteSpace:'nowrap', color: m.tipo === 'ingreso' ? '#34d399' : '#f87171' }}>
                    {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {movimientosFiltrados.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin movimientos este mes</div>
        )}
      </div>
      </>)}

      {/* TAB REPORTES */}
      {tabActivo === 'reportes' && <ReportesTab clubId={clubId} />}

      {/* Modal nuevo movimiento */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:17, fontWeight:600, color:'#fff', marginBottom:20 }}>Nuevo movimiento</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Tipo</label>
                <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                  value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, categoria: e.target.value === 'ingreso' ? 'mensualidad' : 'sueldo_profesor' }))}>
                  <option value="ingreso">Ingreso</option>
                  <option value="gasto">Gasto</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Fecha</label>
                <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                  type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Categoría</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                {categoriasActuales.map(c => <option key={c} value={c}>{catLabel[c]}</option>)}
              </select>
            </div>

            {esSueldo && (
              <>
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Profesor / Staff</label>
                  <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                    value={form.profesorId} onChange={e => setForm(f => ({ ...f, profesorId: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                  <div>
                    <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Mes correspondiente</label>
                    <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                      value={form.mesCorr} onChange={e => setForm(f => ({ ...f, mesCorr: e.target.value }))}>
                      {mesesN.map((m, i) => <option key={i} value={String(i+1)}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Año</label>
                    <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                      type="number" value={form.anioCorr} onChange={e => setForm(f => ({ ...f, anioCorr: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Descripción</label>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                placeholder="Descripción del movimiento" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Monto (CLP)</label>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                type="number" placeholder="25000" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #1e2030', borderRadius:8, color:'#6c7280', fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardarMovimiento} disabled={guardando} style={{ flex:1, padding:11, background:'#6c63ff', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

function ReportesTab({ clubId }: { clubId: string | null }) {
  const [tipo, setTipo] = useState<'mensual'|'trimestral'|'semestral'|'anual'>('mensual')
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [trimestre, setTrimestre] = useState(Math.ceil((new Date().getMonth()+1)/3))
  const [semestre, setSemestre] = useState(new Date().getMonth() < 6 ? 1 : 2)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [preview, setPreview] = useState<any>(null)
  const [generando, setGenerando] = useState(false)

  const mesesNR = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const catLabelR: Record<string,string> = {
    mensualidad:'Mensualidad', inscripcion_torneo:'Inscripción torneo', arriendo_cancha:'Arriendo cancha',
    donacion:'Donación', otro_ingreso:'Otro ingreso', sueldo_profesor:'Sueldo profesor',
    sueldo_staff:'Sueldo staff', material_deportivo:'Material deportivo',
    servicios_basicos:'Servicios básicos', mantenimiento:'Mantenimiento', otro_gasto:'Otro gasto'
  }
  const fmt = (n: number) => '$'+n.toLocaleString('es-CL')

  function getRango() {
    if (tipo === 'mensual') {
      const ultimoDia = new Date(anio, mes, 0).getDate()
      return { inicio:`${anio}-${String(mes).padStart(2,'0')}-01`, fin:`${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`, titulo:`${mesesNR[mes-1]} ${anio}` }
    }
    if (tipo === 'trimestral') {
      const mi=(trimestre-1)*3+1, mf=trimestre*3
      return { inicio:`${anio}-${String(mi).padStart(2,'0')}-01`, fin:`${anio}-${String(mf).padStart(2,'0')}-${new Date(anio,mf,0).getDate()}`, titulo:`Q${trimestre} ${anio}` }
    }
    if (tipo === 'semestral') {
      const mi=semestre===1?1:7, mf=semestre===1?6:12
      return { inicio:`${anio}-${String(mi).padStart(2,'0')}-01`, fin:`${anio}-${String(mf).padStart(2,'0')}-${new Date(anio,mf,0).getDate()}`, titulo:`${semestre===1?'1er':'2do'} Semestre ${anio}` }
    }
    return { inicio:`${anio}-01-01`, fin:`${anio}-12-31`, titulo:`Año ${anio}` }
  }

  async function generarPreview() {
    if (!clubId) return
    setGenerando(true)
    const { inicio, fin } = getRango()
    const supabaseR = createClient()
    const [{ data: jugadores }, { data: movimientos }] = await Promise.all([
      supabaseR.from('jugadores').select('*').eq('club_id', clubId).neq('es_externo', true),
      supabaseR.from('movimientos').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin)
    ])
    const activos = (jugadores||[]).filter(j => j.estado==='activo')
    const ingresos = (movimientos||[]).filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+m.monto,0)
    const gastos = (movimientos||[]).filter(m=>m.tipo==='gasto').reduce((s,m)=>s+m.monto,0)
    const desgloseI: Record<string,number> = {}
    const desgloseG: Record<string,number> = {}
    ;(movimientos||[]).forEach(m => {
      if (m.tipo==='ingreso') desgloseI[m.categoria]=(desgloseI[m.categoria]||0)+m.monto
      else desgloseG[m.categoria]=(desgloseG[m.categoria]||0)+m.monto
    })
    setPreview({ activos, ingresos, gastos, desgloseI, desgloseG })
    setGenerando(false)
  }

  async function exportarPDF() {
    if (!preview) return
    setGenerando(true)
    const { titulo } = getRango()
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const W = doc.internal.pageSize.getWidth()
    doc.setFillColor(108,99,255); doc.rect(0,0,W,32,'F')
    doc.setTextColor(255,255,255); doc.setFontSize(20); doc.setFont('helvetica','bold')
    doc.text('CmSports',14,14); doc.setFontSize(11); doc.setFont('helvetica','normal')
    doc.text(`Informe ${tipo} — ${titulo}`,14,24)
    doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')}`,W-14,24,{align:'right'})
    let y = 42
    doc.setTextColor(40,40,40); doc.setFontSize(13); doc.setFont('helvetica','bold')
    doc.text('Resumen Financiero',14,y); y+=8
    autoTable(doc,{ startY:y, head:[['Concepto','Monto']], body:[['Ingresos',fmt(preview.ingresos)],['Gastos',fmt(preview.gastos)],['Balance',fmt(preview.ingresos-preview.gastos)]], theme:'striped', headStyles:{fillColor:[108,99,255]}, margin:{left:14,right:14} })
    y=(doc as any).lastAutoTable.finalY+10
    autoTable(doc,{ startY:y, head:[['Categoría Ingreso','Monto']], body:Object.entries(preview.desgloseI).map(([c,t])=>[catLabelR[c]||c,fmt(t as number)]), theme:'striped', headStyles:{fillColor:[52,211,153]}, margin:{left:14,right:14} })
    y=(doc as any).lastAutoTable.finalY+10
    autoTable(doc,{ startY:y, head:[['Categoría Gasto','Monto']], body:Object.entries(preview.desgloseG).map(([c,t])=>[catLabelR[c]||c,fmt(t as number)]), theme:'striped', headStyles:{fillColor:[248,113,113]}, margin:{left:14,right:14} })
    const pc=doc.getNumberOfPages()
    for(let i=1;i<=pc;i++){doc.setPage(i);doc.setFontSize(9);doc.setTextColor(150);doc.text(`CmSports — ${titulo} — Pág ${i} de ${pc}`,W/2,doc.internal.pageSize.getHeight()-8,{align:'center'})}
    doc.save(`reporte_${titulo.replace(/ /g,'_')}.pdf`)
    setGenerando(false)
  }

  const { titulo } = getRango()

  return (
    <div>
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:16 }}>Configurar reporte</div>
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {(['mensual','trimestral','semestral','anual'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #1e2030', background:tipo===t?'#6c63ff':'#0a0c12', color:tipo===t?'white':'#8890a4', fontSize:12, cursor:'pointer', textTransform:'capitalize' }}>{t}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
          {tipo==='mensual' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color:'#6c7280', display:'block', marginBottom:5 }}>Mes</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }} value={mes} onChange={e=>setMes(parseInt(e.target.value))}>
                {mesesNR.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}
          {tipo==='trimestral' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color:'#6c7280', display:'block', marginBottom:5 }}>Trimestre</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }} value={trimestre} onChange={e=>setTrimestre(parseInt(e.target.value))}>
                <option value={1}>Q1 — Ene, Feb, Mar</option><option value={2}>Q2 — Abr, May, Jun</option>
                <option value={3}>Q3 — Jul, Ago, Sep</option><option value={4}>Q4 — Oct, Nov, Dic</option>
              </select>
            </div>
          )}
          {tipo==='semestral' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color:'#6c7280', display:'block', marginBottom:5 }}>Semestre</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }} value={semestre} onChange={e=>setSemestre(parseInt(e.target.value))}>
                <option value={1}>1er Semestre</option><option value={2}>2do Semestre</option>
              </select>
            </div>
          )}
          <div style={{ flex:1, minWidth:120 }}>
            <label style={{ fontSize:12, color:'#6c7280', display:'block', marginBottom:5 }}>Año</label>
            <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }} value={anio} onChange={e=>setAnio(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={generarPreview} disabled={generando} style={{ flex:1, padding:12, background:'#1e1b4b', color:'#a78bfa', border:'1px solid #6c63ff44', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            {generando?'Cargando...':'👁 Vista previa'}
          </button>
          <button onClick={exportarPDF} disabled={generando||!preview} style={{ flex:1, padding:12, background:preview?'#6c63ff':'#1e2030', color:preview?'white':'#4b5063', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:preview?'pointer':'not-allowed' }}>
            {generando?'Generando...':'📄 Exportar PDF'}
          </button>
        </div>
      </div>
      {preview && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:'#fff', marginBottom:12 }}>Vista previa — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{label:'Ingresos',value:fmt(preview.ingresos),color:'#34d399'},{label:'Gastos',value:fmt(preview.gastos),color:'#f87171'},{label:'Balance',value:fmt(preview.ingresos-preview.gastos),color:'#a78bfa'}].map(s=>(
              <div key={s.label} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, padding:16 }}>
                <div style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:'#6c7280', marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Ingresos por categoría</div>
              {Object.entries(preview.desgloseI).map(([cat,total])=>(
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #1a1d2e', fontSize:12 }}>
                  <span style={{ color:'#8890a4' }}>{catLabelR[cat]||cat}</span>
                  <span style={{ color:'#34d399', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
            </div>
            <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Gastos por categoría</div>
              {Object.entries(preview.desgloseG).map(([cat,total])=>(
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #1a1d2e', fontSize:12 }}>
                  <span style={{ color:'#8890a4' }}>{catLabelR[cat]||cat}</span>
                  <span style={{ color:'#f87171', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
