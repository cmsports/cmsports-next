'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { registrarMovimiento } from '@/app/actions/finanzas'
import { MensualidadesPanel } from '@/components/MensualidadesPanel'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

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

const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

export default function FinanzasPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}><div style={{ color:'#94a3b8' }}>Cargando...</div></div>}>
      <FinanzasContent />
    </Suspense>
  )
}

function FinanzasContent() {
  const { perfil, loading: authLoading } = usePerfil()
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [profesores, setProfesores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [modalOpen, setModalOpen] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const searchParams = useSearchParams()
  const [tabActivo, setTabActivo] = useState<'movimientos'|'mensualidades'|'reportes'>(
    searchParams.get('tab') === 'mensualidades' ? 'mensualidades' : 'movimientos',
  )
  // Monta Mensualidades solo cuando se abre por primera vez (evita sus consultas al entrar en "Movimientos"); una vez montado queda vivo
  const [mensualidadesVista, setMensualidadesVista] = useState(searchParams.get('tab') === 'mensualidades')
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
  const movimientoOperacionId = useRef<string | null>(null)
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) {
      Promise.all([cargarMovimientos(perfil.club_id), cargarJugadores(perfil.club_id), cargarProfesores(perfil.club_id)]).then(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [authLoading, perfil])

  useEffect(() => {
    if (!clubId) return
    cargarMovimientos()
  }, [mes, anio])

  async function cargarMovimientos(cid?: string) {
    const id = cid || clubId
    const mesStr = String(mes).padStart(2, '0')
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const inicio = `${anio}-${mesStr}-01`
    const fin = `${anio}-${mesStr}-${String(ultimoDia).padStart(2,'0')}`
    // Solo movimientos: la lista de jugadores no cambia por mes, se carga aparte una sola vez
    const { data } = await supabase.from('movimientos').select('*').eq('club_id', id).gte('fecha', inicio).lte('fecha', fin).order('creado_en', { ascending: false })
    setMovimientos(data || [])
  }

  async function cargarJugadores(cid?: string) {
    const id = cid || clubId
    const { data: jugs } = await supabase.from('jugadores').select('id,nombre,telefono').eq('club_id', id).neq('es_externo', true).order('nombre')
    setJugadoresFinanzas(jugs || [])
  }

  async function cargarProfesores(cid?: string) {
    const id = cid || clubId
    const { data } = await supabase.from('profesores').select('*').eq('club_id', id)
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
    movimientoOperacionId.current ??= crypto.randomUUID()

    let descripcion = form.descripcion
    if (esSueldo && !descripcion) {
      const prof = profesores.find(p => p.id === form.profesorId)
      descripcion = `${catLabel[form.categoria]} — ${prof?.nombre || 'Staff'} · ${mesesN[parseInt(form.mesCorr)-1]} ${form.anioCorr}`
    }
    if (!descripcion) descripcion = catLabel[form.categoria] || form.categoria

    const resultado = await registrarMovimiento({
      tipo: form.tipo, categoria: form.categoria,
      descripcion, monto: parseInt(form.monto), fecha: form.fecha,
      ...(esSueldo && form.profesorId ? { profesorId: form.profesorId } : {}),
      ...(esSueldo ? { mesCorrespondiente: parseInt(form.mesCorr), anioCorrespondiente: parseInt(form.anioCorr) } : {}),
      idempotencyKey: movimientoOperacionId.current,
    })

    setGuardando(false)
    if (resultado.error) return
    movimientoOperacionId.current = null
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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => cambiarMes(-1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>◀</button>
          <span style={{ fontSize:16, fontWeight:600, color: text, minWidth:160, textAlign:'center' }}>{mesesN[mes-1]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>▶</button>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={exportarExcel} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>📊 Exportar Excel</button>
          <button onClick={() => setModalOpen(true)} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>➕ Movimiento</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#e2e8f0', borderRadius:10, padding:4, marginBottom:20 }}>
        {[
          { key:'movimientos', label:'📋 Movimientos' },
          { key:'mensualidades', label:'💳 Mensualidades' },
          { key:'reportes', label:'📈 Reportes' },
        ].map(t => (
          <div key={t.key} onClick={() => { setTabActivo(t.key as any); if (t.key === 'mensualidades') setMensualidadesVista(true) }}
            style={{ flex:1, padding:'9px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, background:tabActivo===t.key?'#ffffff':'transparent', color:tabActivo===t.key?'#3730a3': muted, transition:'all 0.15s', boxShadow: tabActivo===t.key ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {t.label}
          </div>
        ))}
      </div>

      <div style={{ display: tabActivo === 'movimientos' ? 'block' : 'none' }}>
      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
        {[
          { label:'💰 Ingresos', value:fmt(ingresos), color:'#16a34a', bg:'#f0fdf4' },
          { label:'💸 Gastos', value:fmt(gastos), color:'#dc2626', bg:'#fef2f2' },
          { label:'📊 Balance neto', value:fmt(ingresos-gastos), color:'#3730a3', bg:'#ede9fe' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding:20, background: s.bg, border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, fontFamily:'monospace', marginBottom:4 }}>{s.value}</div>
            <div style={{ fontSize:12, color: muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Desglose */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        <div style={{ ...card, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>💰 Ingresos por categoría</div>
          {Object.entries(desgloseIngresos).length === 0
            ? <p style={{ fontSize:12, color: hint }}>Sin ingresos</p>
            : Object.entries(desgloseIngresos).map(([cat, total]) => (
              <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
                <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                <span style={{ color:'#16a34a', fontWeight:600, fontFamily:'monospace' }}>{fmt(total)}</span>
              </div>
            ))
          }
        </div>
        <div style={{ ...card, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>💸 Gastos por categoría</div>
          {Object.entries(desgloseGastos).length === 0
            ? <p style={{ fontSize:12, color: hint }}>Sin gastos</p>
            : Object.entries(desgloseGastos).map(([cat, total]) => (
              <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
                <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                <span style={{ color:'#dc2626', fontWeight:600, fontFamily:'monospace' }}>{fmt(total)}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Buscador movimientos */}
      <div style={{ marginBottom:12 }}>
        <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
          placeholder="Buscar por descripción o categoría..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {/* Historial pagos por jugador */}
      <div style={{ ...card, padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:600, color: text }}>Historial de pagos por jugador</div>
        </div>
        <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none', marginBottom: busquedaJugador.length > 1 ? 8 : 0 }}
          placeholder="Buscar jugador para ver su historial..."
          value={busquedaJugador} onChange={e => setBusquedaJugador(e.target.value)} />
        {busquedaJugador.length > 1 && !jugadorSeleccionado && (
          <div style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
            {jugadoresFinanzas.filter(j => j.nombre.toLowerCase().includes(busquedaJugador.toLowerCase())).slice(0,5).map(j => (
              <div key={j.id} onClick={async () => {
                setJugadorSeleccionado(j)
                setBusquedaJugador(j.nombre)
                const { data: mens } = await supabase.from('mensualidades').select('*').eq('jugador_id', j.id).order('anio').order('mes')
                setHistorialJugador(mens || [])
              }} style={{ padding:'10px 14px', borderBottom:'1px solid #e2e8f0', cursor:'pointer', fontSize:13, color: text }}>
                {j.nombre}
              </div>
            ))}
          </div>
        )}
        {jugadorSeleccionado && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:600, color: text }}>{jugadorSeleccionado.nombre}</div>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ color:'#16a34a', fontSize:12 }}>✅ {historialJugador.filter(m=>m.estado==='pagado').length} pagados</span>
                <span style={{ color:'#d97706', fontSize:12 }}>⏳ {historialJugador.filter(m=>m.estado==='pendiente').length} pendientes</span>
                <span style={{ color:'#dc2626', fontSize:12 }}>🔴 {historialJugador.filter(m=>m.estado==='atrasado').length} atrasados</span>
                <button onClick={() => { setJugadorSeleccionado(null); setBusquedaJugador('') }}
                  style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:6, padding:'3px 8px', color: muted, fontSize:11, cursor:'pointer' }}>✕ Cerrar</button>
              </div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:400 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #e2e8f0' }}>
                    {['Mes','Año','Estado','Fecha pago','Monto'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historialJugador.map((m,i) => {
                    const col = m.estado==='pagado'?'#16a34a':m.estado==='atrasado'?'#dc2626':'#d97706'
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'8px 12px', fontSize:13, color: text }}>{mesesN[m.mes-1]}</td>
                        <td style={{ padding:'8px 12px', fontSize:13, color: muted }}>{m.anio}</td>
                        <td style={{ padding:'8px 12px' }}>
                          <span style={{ background:col+'22', color:col, padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                            {m.estado==='pagado'?'Pagado':m.estado==='atrasado'?'Atrasado':'Pendiente'}
                          </span>
                        </td>
                        <td style={{ padding:'8px 12px', fontSize:12, color: muted }}>{m.fecha_pago||'—'}</td>
                        <td style={{ padding:'8px 12px', fontSize:13, color:'#3730a3', fontFamily:'monospace' }}>{m.monto?'$'+m.monto.toLocaleString('es-CL'):'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {jugadorSeleccionado.telefono && (
              <div style={{ marginTop:12 }}>
                <a href={`https://wa.me/${jugadorSeleccionado.telefono.replace(/[^0-9]/g,'')}`} target="_blank"
                  style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, textDecoration:'none' }}>
                  Contactar por WhatsApp
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabla */}
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:600, color: text }}>Todos los movimientos</div>
          <select
            style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 10px', color: text, fontSize:12, outline:'none' }}
            value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">🔍 Todos</option>
            <option value="ingreso">💰 Ingresos</option>
            <option value="gasto">💸 Gastos</option>
          </select>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['Fecha','Categoría','Descripción','Registrado por','Monto'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimientosFiltrados.map(m => (
                <tr key={m.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'12px 16px', fontSize:12, color: muted, whiteSpace:'nowrap' }}>{m.fecha || '—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ background: m.tipo === 'ingreso' ? '#f0fdf4' : '#fef2f2', color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>
                      {m.tipo === 'ingreso' ? '💰' : '💸'} {catLabel[m.categoria] || m.categoria || '—'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:13, color: text }}>{m.descripcion}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color: muted, whiteSpace:'nowrap' }}>{m.registrado_por_nombre || 'Admin'}</td>
                  <td style={{ padding:'12px 16px', fontWeight:700, fontFamily:'monospace', whiteSpace:'nowrap', color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626' }}>
                    {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {movimientosFiltrados.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>Sin movimientos este mes</div>
        )}
      </div>
      </div>

      {/* TAB MENSUALIDADES */}
      <div style={{ display: tabActivo === 'mensualidades' ? 'block' : 'none' }}>
        {mensualidadesVista && <MensualidadesPanel mes={mes} anio={anio} onPagoRegistrado={() => cargarMovimientos()} />}
      </div>

      {/* TAB REPORTES */}
      <div style={{ display: tabActivo === 'reportes' ? 'block' : 'none' }}>
        <ReportesTab clubId={clubId} />
      </div>

      {/* Modal nuevo movimiento */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:20 }}>💳 Nuevo movimiento</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Tipo</label>
                <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, categoria: e.target.value === 'ingreso' ? 'mensualidad' : 'sueldo_profesor' }))}>
                  <option value="ingreso">💰 Ingreso</option>
                  <option value="gasto">💸 Gasto</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Fecha</label>
                <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Categoría</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                {categoriasActuales.map(c => <option key={c} value={c}>{catLabel[c]}</option>)}
              </select>
            </div>

            {esSueldo && (
              <>
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Profesor / Staff</label>
                  <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                    value={form.profesorId} onChange={e => setForm(f => ({ ...f, profesorId: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                  <div>
                    <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Mes correspondiente</label>
                    <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                      value={form.mesCorr} onChange={e => setForm(f => ({ ...f, mesCorr: e.target.value }))}>
                      {mesesN.map((m, i) => <option key={i} value={String(i+1)}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Año</label>
                    <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                      type="number" value={form.anioCorr} onChange={e => setForm(f => ({ ...f, anioCorr: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Descripción</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                placeholder="Descripción del movimiento" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Monto (CLP)</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                type="number" placeholder="25000" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardarMovimiento} disabled={guardando} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

type CategoriaReporte = 'general' | 'jugador' | 'finanzas' | 'asistencia' | 'torneos'

const categoriasReporte: { key: CategoriaReporte; label: string; desc: string }[] = [
  { key: 'general', label: 'General', desc: 'Resumen completo del club' },
  { key: 'jugador', label: 'Jugador', desc: 'Info detallada de un jugador' },
  { key: 'finanzas', label: 'Finanzas', desc: 'Ingresos, gastos y mensualidades' },
  { key: 'asistencia', label: 'Asistencia', desc: 'Asistencia general y tendencias' },
  { key: 'torneos', label: 'Torneos y Ligas', desc: 'Competencias y sus finanzas' },
]

function ReportesTab({ clubId }: { clubId: string | null }) {
  const [categoriaRep, setCategoriaRep] = useState<CategoriaReporte>('general')
  const [tipo, setTipo] = useState<'mensual'|'trimestral'|'semestral'|'anual'>('mensual')
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [trimestre, setTrimestre] = useState(Math.ceil((new Date().getMonth()+1)/3))
  const [semestre, setSemestre] = useState(new Date().getMonth() < 6 ? 1 : 2)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [preview, setPreview] = useState<any>(null)
  const [generando, setGenerando] = useState(false)
  const [jugadores, setJugadores] = useState<any[]>([])
  const [jugadorId, setJugadorId] = useState('')

  useEffect(() => {
    if (!clubId) return
    supabase.from('jugadores').select('id,nombre,categoria,estado').eq('club_id', clubId).order('nombre').then(({ data }) => setJugadores(data || []))
  }, [clubId])

  useEffect(() => { setPreview(null) }, [categoriaRep, tipo, mes, trimestre, semestre, anio, jugadorId])

  function getRango() {
    if (tipo === 'mensual') {
      const ultimoDia = new Date(anio, mes, 0).getDate()
      return { inicio:`${anio}-${String(mes).padStart(2,'0')}-01`, fin:`${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`, titulo:`${mesesN[mes-1]} ${anio}` }
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
    if (categoriaRep === 'jugador' && !jugadorId) return
    setGenerando(true)
    const { inicio, fin } = getRango()
    const sb = createClient()
    let datos: any = null

    if (categoriaRep === 'general') {
      const [{ data: jug }, { data: mov }, { data: asist }, { data: torn }, { data: mens }] = await Promise.all([
        sb.from('jugadores').select('*').eq('club_id', clubId),
        sb.from('movimientos').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
        sb.from('asistencia').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin),
        sb.from('torneos').select('*').eq('club_id', clubId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin),
        sb.from('mensualidades').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin)
      ])
      const activos = (jug || []).filter(j => j.estado === 'activo')
      const ingresos = (mov || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
      const gastos = (mov || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
      const desgloseIngresos: Record<string, number> = {}, desgloseGastos: Record<string, number> = {}
      ;(mov || []).forEach(m => {
        if (m.tipo === 'ingreso') desgloseIngresos[m.categoria] = (desgloseIngresos[m.categoria] || 0) + m.monto
        else desgloseGastos[m.categoria] = (desgloseGastos[m.categoria] || 0) + m.monto
      })
      const asistPorDia: Record<string, number> = {}
      ;(asist || []).forEach(a => { asistPorDia[a.fecha] = (asistPorDia[a.fecha] || 0) + 1 })
      const diasConAsist = Object.keys(asistPorDia).length
      const promedioAsist = diasConAsist > 0 ? Math.round((asist || []).length / diasConAsist) : 0
      const mensMap = new Map((mens || []).map(m => [m.jugador_id, m]))
      const morosos = activos.filter(j => { const m = mensMap.get(j.id); return m?.estado === 'pendiente' || m?.estado === 'atrasado' })
      datos = { jugadores: jug || [], activos, movimientos: mov || [], ingresos, gastos, desgloseIngresos, desgloseGastos, asistencias: asist || [], promedioAsist, torneos: torn || [], morosos, mensualidades: mens || [] }
    }

    if (categoriaRep === 'jugador') {
      const [{ data: jugador }, { data: mens }, { data: asist }, { data: torneoJug }, { data: ligaJug }] = await Promise.all([
        sb.from('jugadores').select('*').eq('id', jugadorId).single(),
        sb.from('mensualidades').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: false }),
        sb.from('asistencia').select('*').eq('jugador_id', jugadorId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
        sb.from('torneo_jugadores').select('*, torneos(*)').eq('jugador_id', jugadorId),
        sb.from('liga_division_jugadores').select('*, liga_divisiones(*, ligas(*))').eq('jugador_id', jugadorId),
      ])
      const mensPeriodo = (mens || []).filter(m => m.fecha >= inicio && m.fecha <= fin)
      const pagadas = mensPeriodo.filter(m => m.estado === 'pagado')
      const pendientes = mensPeriodo.filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
      datos = { jugador, mensualidades: mens || [], mensPeriodo, pagadas, pendientes, totalPagado: pagadas.reduce((s, m) => s + (m.monto || 0), 0), totalPendiente: pendientes.reduce((s, m) => s + (m.monto || 0), 0), asistencias: asist || [], torneos: torneoJug || [], ligas: ligaJug || [] }
    }

    if (categoriaRep === 'finanzas') {
      const [{ data: mov }, { data: mens }, { data: jug }] = await Promise.all([
        sb.from('movimientos').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
        sb.from('mensualidades').select('*, jugadores(nombre,categoria)').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin),
        sb.from('jugadores').select('id,nombre,estado').eq('club_id', clubId).eq('estado', 'activo')
      ])
      const ingresos = (mov || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
      const gastos = (mov || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
      const desgloseIngresos: Record<string, number> = {}, desgloseGastos: Record<string, number> = {}
      ;(mov || []).forEach(m => {
        if (m.tipo === 'ingreso') desgloseIngresos[m.categoria] = (desgloseIngresos[m.categoria] || 0) + m.monto
        else desgloseGastos[m.categoria] = (desgloseGastos[m.categoria] || 0) + m.monto
      })
      const pagadas = (mens || []).filter(m => m.estado === 'pagado')
      const pendientes = (mens || []).filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
      const porMes: Record<string, { ingresos: number; gastos: number }> = {}
      ;(mov || []).forEach(m => {
        const mk = m.fecha.slice(0, 7)
        if (!porMes[mk]) porMes[mk] = { ingresos: 0, gastos: 0 }
        if (m.tipo === 'ingreso') porMes[mk].ingresos += m.monto
        else porMes[mk].gastos += m.monto
      })
      datos = { movimientos: mov || [], ingresos, gastos, desgloseIngresos, desgloseGastos, mensualidades: mens || [], pagadas, pendientes, totalMensPagado: pagadas.reduce((s, m) => s + (m.monto || 0), 0), totalMensPendiente: pendientes.reduce((s, m) => s + (m.monto || 0), 0), porMes, activos: jug || [] }
    }

    if (categoriaRep === 'asistencia') {
      const [{ data: asist }, { data: jug }] = await Promise.all([
        sb.from('asistencia').select('*, jugadores(nombre,categoria)').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
        sb.from('jugadores').select('id,nombre,categoria,estado').eq('club_id', clubId).eq('estado', 'activo')
      ])
      const porDia: Record<string, number> = {}, porJugador: Record<string, { nombre: string; count: number }> = {}, porDiaSemana: Record<number, number> = { 0:0,1:0,2:0,3:0,4:0,5:0,6:0 }
      const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
      ;(asist || []).forEach(a => {
        porDia[a.fecha] = (porDia[a.fecha] || 0) + 1
        const jn = (a as any).jugadores?.nombre || a.jugador_id
        if (!porJugador[a.jugador_id]) porJugador[a.jugador_id] = { nombre: jn, count: 0 }
        porJugador[a.jugador_id].count++
        porDiaSemana[new Date(a.fecha + 'T12:00:00').getDay()]++
      })
      const diaMasAsistido = Object.entries(porDia).sort((a, b) => b[1] - a[1])[0] || null
      const diaSemanaMax = Object.entries(porDiaSemana).sort((a, b) => b[1] - a[1])[0]
      datos = { asistencias: asist || [], porDia, porJugador, diaMasAsistido, diaSemanaMax: diaSemanaMax ? { dia: diasSemana[parseInt(diaSemanaMax[0])], count: diaSemanaMax[1] } : null, topJugadores: Object.values(porJugador).sort((a, b) => b.count - a.count).slice(0, 10), sinAsistencia: (jug || []).filter(j => !porJugador[j.id]), totalAsist: (asist || []).length, diasUnicos: Object.keys(porDia).length, promedioDiario: Object.keys(porDia).length > 0 ? Math.round((asist || []).length / Object.keys(porDia).length) : 0, diasSemana, porDiaSemana, activos: jug || [] }
    }

    if (categoriaRep === 'torneos') {
      const [{ data: torn }, { data: ligas }, { data: mov }] = await Promise.all([
        sb.from('torneos').select('*').eq('club_id', clubId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin).order('fecha_inicio'),
        sb.from('ligas').select('*, liga_divisiones(*, liga_division_jugadores(jugador_id)), liga_partidos(count), liga_fechas(count)').eq('club_id', clubId),
        sb.from('movimientos').select('*').eq('club_id', clubId).eq('categoria', 'inscripcion_torneo').gte('fecha', inicio).lte('fecha', fin),
      ])
      const torneosPorEstado: Record<string, number> = {}
      ;(torn || []).forEach(t => { torneosPorEstado[t.estado] = (torneosPorEstado[t.estado] || 0) + 1 })
      datos = { torneos: torn || [], ligas: ligas || [], ingresosInscripcion: (mov || []).reduce((s, m) => s + m.monto, 0), torneosPorEstado, movimientos: mov || [] }
    }

    setPreview(datos)
    setGenerando(false)
  }

  async function exportarPDF() {
    if (!preview) return
    setGenerando(true)
    const { titulo } = getRango()
    const catInfo = categoriasReporte.find(c => c.key === categoriaRep)!
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const W = doc.internal.pageSize.getWidth()

    doc.setFillColor(79, 70, 229); doc.rect(0, 0, W, 32, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold')
    doc.text('CmSports', 14, 14); doc.setFontSize(11); doc.setFont('helvetica', 'normal')
    doc.text(`Reporte ${catInfo.label} — ${titulo}`, 14, 24)
    doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, W - 14, 24, { align: 'right' })
    let y = 42

    if (categoriaRep === 'general') {
      doc.setTextColor(40, 40, 40); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('Resumen Financiero', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Monto']], body: [['Ingresos totales', fmt(preview.ingresos)], ['Gastos totales', fmt(preview.gastos)], ['Balance neto', fmt(preview.ingresos - preview.gastos)], ['COA', preview.activos.length > 0 ? fmt(Math.round(preview.gastos / preview.activos.length)) : '$0']], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Ingresos por Categoría', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Categoría', 'Monto']], body: Object.entries(preview.desgloseIngresos).map(([c, t]) => [catLabel[c] || c, fmt(t as number)]), theme: 'striped', headStyles: { fillColor: [22, 163, 74] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Gastos por Categoría', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Categoría', 'Monto']], body: Object.entries(preview.desgloseGastos).map(([c, t]) => [catLabel[c] || c, fmt(t as number)]), theme: 'striped', headStyles: { fillColor: [220, 38, 38] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.addPage(); y = 20
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Jugadores Activos', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Nombre', 'Categoría', 'Sesiones', 'Estado']], body: preview.activos.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre)).map((j: any) => [j.nombre, j.categoria, `${j.sesiones_usadas}/${j.sesiones_limite}`, j.estado]), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Asistencia y Morosos', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total asistencias', String(preview.asistencias.length)], ['Promedio por día', String(preview.promedioAsist)], ['Morosos', String(preview.morosos.length)], ['Tasa morosidad', preview.activos.length > 0 ? `${Math.round((preview.morosos.length / preview.activos.length) * 100)}%` : '0%']], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      if (preview.torneos.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Torneos', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Nombre', 'Fecha', 'Estado']], body: preview.torneos.map((t: any) => [t.nombre, t.fecha_inicio || '—', t.estado]), theme: 'striped', headStyles: { fillColor: [249, 115, 22] }, margin: { left: 14, right: 14 } })
      }
    }

    if (categoriaRep === 'jugador' && preview.jugador) {
      const j = preview.jugador
      doc.setTextColor(40, 40, 40); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text(`Ficha — ${j.nombre}`, 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Campo', 'Valor']], body: [['Nombre', j.nombre], ['RUT', j.rut || '—'], ['Email', j.email || '—'], ['Teléfono', j.telefono || '—'], ['Categoría', j.categoria || '—'], ['Estado', j.estado || '—'], ['Plan', j.tipo_plan || '—'], ['Sesiones', `${j.sesiones_usadas || 0}/${j.sesiones_limite || 0}`], ['Mensualidad', j.mensualidad ? fmt(j.mensualidad) : '—']], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Mensualidades (período)', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total pagado', fmt(preview.totalPagado)], ['Total pendiente', fmt(preview.totalPendiente)], ['Pagados', String(preview.pagadas.length)], ['Pendientes', String(preview.pendientes.length)]], theme: 'striped', headStyles: { fillColor: [22, 163, 74] }, margin: { left: 14, right: 14 } })
      if (preview.mensualidades.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Historial Completo', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Fecha', 'Monto', 'Estado']], body: preview.mensualidades.map((m: any) => [m.fecha, m.monto ? fmt(m.monto) : '—', m.estado]), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      }
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Asistencia (período)', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total asistencias', String(preview.asistencias.length)]], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      if (preview.torneos.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Torneos', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Torneo', 'Posición', 'Puntos']], body: preview.torneos.map((t: any) => [(t as any).torneos?.nombre || '—', t.posicion ?? '—', t.puntos ?? '—']), theme: 'striped', headStyles: { fillColor: [249, 115, 22] }, margin: { left: 14, right: 14 } })
      }
      if (preview.ligas.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Ligas', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Liga', 'División']], body: preview.ligas.map((l: any) => [(l as any).liga_divisiones?.ligas?.nombre || '—', (l as any).liga_divisiones?.nombre || '—']), theme: 'striped', headStyles: { fillColor: [168, 85, 247] }, margin: { left: 14, right: 14 } })
      }
    }

    if (categoriaRep === 'finanzas') {
      doc.setTextColor(40, 40, 40); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('Resumen Financiero', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Monto']], body: [['Ingresos totales', fmt(preview.ingresos)], ['Gastos totales', fmt(preview.gastos)], ['Balance neto', fmt(preview.ingresos - preview.gastos)], ['COA', preview.activos.length > 0 ? fmt(Math.round(preview.gastos / preview.activos.length)) : '$0']], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Ingresos por Categoría', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Categoría', 'Monto']], body: Object.entries(preview.desgloseIngresos).map(([c, t]) => [catLabel[c] || c, fmt(t as number)]), theme: 'striped', headStyles: { fillColor: [22, 163, 74] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Gastos por Categoría', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Categoría', 'Monto']], body: Object.entries(preview.desgloseGastos).map(([c, t]) => [catLabel[c] || c, fmt(t as number)]), theme: 'striped', headStyles: { fillColor: [220, 38, 38] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Mensualidades', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Recaudado', fmt(preview.totalMensPagado)], ['Pendiente', fmt(preview.totalMensPendiente)], ['Pagadas', String(preview.pagadas.length)], ['Pendientes', String(preview.pendientes.length)]], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      if (Object.keys(preview.porMes).length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Desglose por Mes', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Mes', 'Ingresos', 'Gastos', 'Balance']], body: Object.entries(preview.porMes).sort().map(([mk, v]: any) => [mesesN[parseInt(mk.slice(5, 7)) - 1] + ' ' + mk.slice(0, 4), fmt(v.ingresos), fmt(v.gastos), fmt(v.ingresos - v.gastos)]), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      }
      if (preview.pendientes.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Detalle Pendientes', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Jugador', 'Fecha', 'Monto', 'Estado']], body: preview.pendientes.map((m: any) => [(m as any).jugadores?.nombre || '—', m.fecha, m.monto ? fmt(m.monto) : '—', m.estado]), theme: 'striped', headStyles: { fillColor: [220, 38, 38] }, margin: { left: 14, right: 14 } })
      }
    }

    if (categoriaRep === 'asistencia') {
      doc.setTextColor(40, 40, 40); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('Resumen de Asistencia', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total asistencias', String(preview.totalAsist)], ['Días con registro', String(preview.diasUnicos)], ['Promedio diario', String(preview.promedioDiario)], ['Jugadores activos', String(preview.activos.length)], ...(preview.diaMasAsistido ? [['Día más asistido', `${preview.diaMasAsistido[0]} (${preview.diaMasAsistido[1]})`]] : []), ...(preview.diaSemanaMax ? [['Día favorito', `${preview.diaSemanaMax.dia} (${preview.diaSemanaMax.count})`]] : [])], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Por Día de Semana', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Día', 'Asistencias']], body: preview.diasSemana.map((d: string, i: number) => [d, String(preview.porDiaSemana[i])]), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Top 10 Asistentes', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Jugador', 'Asistencias']], body: preview.topJugadores.map((j: any) => [j.nombre, String(j.count)]), theme: 'striped', headStyles: { fillColor: [22, 163, 74] }, margin: { left: 14, right: 14 } })
      if (preview.sinAsistencia.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Sin Asistencia', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Jugador', 'Categoría']], body: preview.sinAsistencia.map((j: any) => [j.nombre, j.categoria || '—']), theme: 'striped', headStyles: { fillColor: [220, 38, 38] }, margin: { left: 14, right: 14 } })
      }
    }

    if (categoriaRep === 'torneos') {
      doc.setTextColor(40, 40, 40); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('Resumen de Torneos', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total torneos', String(preview.torneos.length)], ['Ingresos inscripción', fmt(preview.ingresosInscripcion)], ...Object.entries(preview.torneosPorEstado).map(([e, c]) => [`Estado: ${e}`, String(c)])], theme: 'striped', headStyles: { fillColor: [249, 115, 22] }, margin: { left: 14, right: 14 } })
      if (preview.torneos.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Detalle', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Nombre', 'Fecha', 'Estado', 'Fase']], body: preview.torneos.map((t: any) => [t.nombre, t.fecha_inicio || '—', t.estado, t.fase || '—']), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      }
      if (preview.ligas.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Ligas', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Liga', 'Estado', 'Divisiones', 'Fechas', 'Partidos']], body: preview.ligas.map((l: any) => [l.nombre, l.estado, (l.liga_divisiones || []).length, (l.liga_fechas || [{ count: 0 }])[0]?.count || 0, (l.liga_partidos || [{ count: 0 }])[0]?.count || 0]), theme: 'striped', headStyles: { fillColor: [168, 85, 247] }, margin: { left: 14, right: 14 } })
      }
    }

    const pc = doc.getNumberOfPages()
    for (let i = 1; i <= pc; i++) { doc.setPage(i); doc.setFontSize(9); doc.setTextColor(150); doc.text(`CmSports — Reporte ${catInfo.label} — ${titulo} — Pág ${i} de ${pc}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' }) }
    const jn = categoriaRep === 'jugador' && preview.jugador ? `_${preview.jugador.nombre.replace(/ /g, '_')}` : ''
    doc.save(`reporte_${categoriaRep}${jn}_${titulo.replace(/ /g, '_')}.pdf`)
    setGenerando(false)
  }

  const { titulo } = getRango()

  return (
    <div>
      {/* Selector de tipo de reporte */}
      <div style={{ ...card, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Tipo de reporte</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:8 }}>
          {categoriasReporte.map(c => (
            <button key={c.key} onClick={() => setCategoriaRep(c.key)}
              style={{ padding:'12px 10px', borderRadius:10, border: categoriaRep === c.key ? '2px solid #4f46e5' : '1px solid #e2e8f0', background: categoriaRep === c.key ? '#ede9fe' : '#f8fafc', cursor:'pointer', textAlign:'left' }}>
              <div style={{ fontSize:13, fontWeight:600, color: categoriaRep === c.key ? '#4f46e5' : text }}>{c.label}</div>
              <div style={{ fontSize:11, color: muted, marginTop:2 }}>{c.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Configuración de período */}
      <div style={{ ...card, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:16 }}>Configurar período</div>
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {(['mensual','trimestral','semestral','anual'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:tipo===t?'#4f46e5':'#f4f7fa', color:tipo===t?'white': muted, fontSize:12, cursor:'pointer', fontWeight: tipo===t ? 600 : 400, textTransform:'capitalize' }}>{t}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom: categoriaRep === 'jugador' ? 0 : 16 }}>
          {tipo==='mensual' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Mes</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }} value={mes} onChange={e=>setMes(parseInt(e.target.value))}>
                {mesesN.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}
          {tipo==='trimestral' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Trimestre</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }} value={trimestre} onChange={e=>setTrimestre(parseInt(e.target.value))}>
                <option value={1}>Q1 — Ene, Feb, Mar</option><option value={2}>Q2 — Abr, May, Jun</option>
                <option value={3}>Q3 — Jul, Ago, Sep</option><option value={4}>Q4 — Oct, Nov, Dic</option>
              </select>
            </div>
          )}
          {tipo==='semestral' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Semestre</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }} value={semestre} onChange={e=>setSemestre(parseInt(e.target.value))}>
                <option value={1}>1er Semestre</option><option value={2}>2do Semestre</option>
              </select>
            </div>
          )}
          <div style={{ flex:1, minWidth:120 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Año</label>
            <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }} value={anio} onChange={e=>setAnio(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        {categoriaRep === 'jugador' && (
          <div style={{ marginTop:14, marginBottom:16 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Jugador</label>
            <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
              value={jugadorId} onChange={e => setJugadorId(e.target.value)}>
              <option value="">— Seleccionar jugador —</option>
              {jugadores.map(j => <option key={j.id} value={j.id}>{j.nombre} ({j.categoria || 'Sin cat.'}) {j.estado !== 'activo' ? `[${j.estado}]` : ''}</option>)}
            </select>
          </div>
        )}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={generarPreview} disabled={generando || (categoriaRep === 'jugador' && !jugadorId)}
            style={{ flex:1, padding:12, background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:8, fontSize:13, fontWeight:600, cursor: (categoriaRep === 'jugador' && !jugadorId) ? 'not-allowed' : 'pointer', opacity: (categoriaRep === 'jugador' && !jugadorId) ? 0.5 : 1 }}>
            {generando ? 'Cargando...' : 'Vista previa'}
          </button>
          <button onClick={exportarPDF} disabled={generando||!preview}
            style={{ flex:1, padding:12, background:preview?'#f43f5e':'#e2e8f0', color:preview?'white': hint, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:preview?'pointer':'not-allowed' }}>
            {generando ? 'Generando...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Vista previa — General */}
      {preview && categoriaRep === 'general' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — General — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Ingresos', value:fmt(preview.ingresos), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' }, { label:'Gastos', value:fmt(preview.gastos), color:'#dc2626', bg:'#fef2f2', border:'#fecaca' }, { label:'Balance', value:fmt(preview.ingresos - preview.gastos), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' }].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16 }}>
                <div style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Activos', value:preview.activos.length, color:text }, { label:'Asistencias', value:preview.asistencias.length, color:'#16a34a' }, { label:'Torneos', value:preview.torneos.length, color:'#d97706' }, { label:'Morosos', value:preview.morosos.length, color:'#dc2626' }].map(s => (
              <div key={s.label} style={{ ...card, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:11, color: muted, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Ingresos por categoría</div>
              {Object.entries(preview.desgloseIngresos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#16a34a', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
              {Object.keys(preview.desgloseIngresos).length === 0 && <p style={{ fontSize:12, color: hint }}>Sin ingresos</p>}
            </div>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Gastos por categoría</div>
              {Object.entries(preview.desgloseGastos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#dc2626', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
              {Object.keys(preview.desgloseGastos).length === 0 && <p style={{ fontSize:12, color: hint }}>Sin gastos</p>}
            </div>
          </div>
        </div>
      )}

      {/* Vista previa — Jugador */}
      {preview && categoriaRep === 'jugador' && preview.jugador && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — {preview.jugador.nombre} — {titulo}</div>
          <div style={{ ...card, padding:20, marginBottom:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:13 }}>
              {([['Categoría', preview.jugador.categoria || '—'], ['Estado', preview.jugador.estado || '—'], ['Plan', preview.jugador.tipo_plan || '—'], ['Sesiones', `${preview.jugador.sesiones_usadas || 0}/${preview.jugador.sesiones_limite || 0}`], ['Mensualidad', preview.jugador.mensualidad ? fmt(preview.jugador.mensualidad) : '—'], ['RUT', preview.jugador.rut || '—'], ['Email', preview.jugador.email || '—']] as [string, any][]).map(([l, v]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9' }}>
                  <span style={{ color: muted }}>{l}</span>
                  <span style={{ color: text, fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Pagado (período)', value:fmt(preview.totalPagado), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' }, { label:'Pendiente', value:fmt(preview.totalPendiente), color:'#dc2626', bg:'#fef2f2', border:'#fecaca' }, { label:'Asistencias', value:String(preview.asistencias.length), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' }].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {preview.mensualidades.length > 0 && (
            <div style={{ ...card, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Historial de mensualidades</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                  <thead><tr style={{ borderBottom:'2px solid #e2e8f0' }}><th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Fecha</th><th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Monto</th><th style={{ textAlign:'center', padding:'8px 6px', color: muted }}>Estado</th></tr></thead>
                  <tbody>{preview.mensualidades.map((m: any, i: number) => (
                    <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'8px 6px', color: text }}>{m.fecha}</td>
                      <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color: text }}>{m.monto ? fmt(m.monto) : '—'}</td>
                      <td style={{ padding:'8px 6px', textAlign:'center' }}>
                        <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background: m.estado === 'pagado' ? '#dcfce7' : m.estado === 'atrasado' ? '#fef2f2' : '#fef9c3', color: m.estado === 'pagado' ? '#16a34a' : m.estado === 'atrasado' ? '#dc2626' : '#d97706' }}>{m.estado}</span>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {preview.torneos.length > 0 && (
            <div style={{ ...card, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Torneos</div>
              {preview.torneos.map((t: any, i: number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: text }}>{(t as any).torneos?.nombre || '—'}</span>
                  <span style={{ color: muted }}>Pos: {t.posicion ?? '—'} · Pts: {t.puntos ?? '—'}</span>
                </div>
              ))}
            </div>
          )}
          {preview.ligas.length > 0 && (
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Ligas</div>
              {preview.ligas.map((l: any, i: number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: text }}>{(l as any).liga_divisiones?.ligas?.nombre || '—'}</span>
                  <span style={{ color: muted }}>{(l as any).liga_divisiones?.nombre || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vista previa — Finanzas */}
      {preview && categoriaRep === 'finanzas' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — Finanzas — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Ingresos', value:fmt(preview.ingresos), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' }, { label:'Gastos', value:fmt(preview.gastos), color:'#dc2626', bg:'#fef2f2', border:'#fecaca' }, { label:'Balance', value:fmt(preview.ingresos - preview.gastos), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' }].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16 }}>
                <div style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:16, textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:700, color:'#16a34a', fontFamily:'monospace' }}>{fmt(preview.totalMensPagado)}</div>
              <div style={{ fontSize:12, color:'#16a34a', marginTop:4 }}>Mensualidades cobradas</div>
            </div>
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:16, textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:700, color:'#dc2626', fontFamily:'monospace' }}>{fmt(preview.totalMensPendiente)}</div>
              <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>Mensualidades pendientes</div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Ingresos por categoría</div>
              {Object.entries(preview.desgloseIngresos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#16a34a', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
              {Object.keys(preview.desgloseIngresos).length === 0 && <p style={{ fontSize:12, color: hint }}>Sin ingresos</p>}
            </div>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Gastos por categoría</div>
              {Object.entries(preview.desgloseGastos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#dc2626', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
              {Object.keys(preview.desgloseGastos).length === 0 && <p style={{ fontSize:12, color: hint }}>Sin gastos</p>}
            </div>
          </div>
          {Object.keys(preview.porMes).length > 0 && (
            <div style={{ ...card, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Desglose por mes</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                  <thead><tr style={{ borderBottom:'2px solid #e2e8f0' }}><th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Mes</th><th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Ingresos</th><th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Gastos</th><th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Balance</th></tr></thead>
                  <tbody>{Object.entries(preview.porMes).sort().map(([mk, v]: any) => (
                    <tr key={mk} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'8px 6px', color: text }}>{mesesN[parseInt(mk.slice(5, 7)) - 1]} {mk.slice(0, 4)}</td>
                      <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color:'#16a34a' }}>{fmt(v.ingresos)}</td>
                      <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color:'#dc2626' }}>{fmt(v.gastos)}</td>
                      <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color: v.ingresos - v.gastos >= 0 ? '#16a34a' : '#dc2626', fontWeight:600 }}>{fmt(v.ingresos - v.gastos)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {preview.pendientes.length > 0 && (
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#dc2626', marginBottom:12 }}>Mensualidades pendientes ({preview.pendientes.length})</div>
              {preview.pendientes.map((m: any, i: number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: text }}>{(m as any).jugadores?.nombre || '—'}</span>
                  <span><span style={{ color: muted, marginRight:8 }}>{m.fecha}</span><span style={{ fontFamily:'monospace', color:'#dc2626' }}>{m.monto ? fmt(m.monto) : '—'}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vista previa — Asistencia */}
      {preview && categoriaRep === 'asistencia' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — Asistencia — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Total asistencias', value:String(preview.totalAsist), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' }, { label:'Días con registro', value:String(preview.diasUnicos), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' }, { label:'Promedio diario', value:String(preview.promedioDiario), color:'#d97706', bg:'#fffbeb', border:'#fde68a' }].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {(preview.diaMasAsistido || preview.diaSemanaMax) && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
              {preview.diaMasAsistido && (
                <div style={{ ...card, padding:16, textAlign:'center' }}>
                  <div style={{ fontSize:11, color: muted, marginBottom:4 }}>Día más asistido</div>
                  <div style={{ fontSize:16, fontWeight:700, color: text }}>{preview.diaMasAsistido[0]}</div>
                  <div style={{ fontSize:13, color:'#16a34a', fontWeight:600 }}>{preview.diaMasAsistido[1]} asistencias</div>
                </div>
              )}
              {preview.diaSemanaMax && (
                <div style={{ ...card, padding:16, textAlign:'center' }}>
                  <div style={{ fontSize:11, color: muted, marginBottom:4 }}>Día de semana favorito</div>
                  <div style={{ fontSize:16, fontWeight:700, color: text }}>{preview.diaSemanaMax.dia}</div>
                  <div style={{ fontSize:13, color:'#16a34a', fontWeight:600 }}>{preview.diaSemanaMax.count} asistencias</div>
                </div>
              )}
            </div>
          )}
          <div style={{ ...card, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Por día de semana</div>
            {preview.diasSemana.map((d: string, i: number) => {
              const max = Math.max(...Object.values(preview.porDiaSemana) as number[]) || 1
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                  <span style={{ width:80, fontSize:12, color: muted }}>{d}</span>
                  <div style={{ flex:1, background:'#f1f5f9', borderRadius:4, height:20, overflow:'hidden' }}>
                    <div style={{ width:`${(preview.porDiaSemana[i] / max) * 100}%`, height:'100%', background:'#4f46e5', borderRadius:4 }} />
                  </div>
                  <span style={{ fontSize:12, fontFamily:'monospace', color: text, width:30, textAlign:'right' }}>{preview.porDiaSemana[i]}</span>
                </div>
              )
            })}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Top 10 asistentes</div>
              {preview.topJugadores.map((j: any, i: number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: text }}>{i + 1}. {j.nombre}</span>
                  <span style={{ fontFamily:'monospace', color:'#16a34a', fontWeight:600 }}>{j.count}</span>
                </div>
              ))}
              {preview.topJugadores.length === 0 && <p style={{ fontSize:12, color: hint }}>Sin datos</p>}
            </div>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#dc2626', marginBottom:12 }}>Sin asistencia ({preview.sinAsistencia.length})</div>
              {preview.sinAsistencia.map((j: any, i: number) => (
                <div key={i} style={{ padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12, color: muted }}>{j.nombre} — {j.categoria || '—'}</div>
              ))}
              {preview.sinAsistencia.length === 0 && <p style={{ fontSize:12, color:'#16a34a' }}>Todos asistieron</p>}
            </div>
          </div>
        </div>
      )}

      {/* Vista previa — Torneos y Ligas */}
      {preview && categoriaRep === 'torneos' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — Torneos y Ligas — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Torneos', value:String(preview.torneos.length), color:'#d97706', bg:'#fffbeb', border:'#fde68a' }, { label:'Ligas', value:String(preview.ligas.length), color:'#7c3aed', bg:'#f5f3ff', border:'#ddd6fe' }, { label:'Ingresos inscripción', value:fmt(preview.ingresosInscripcion), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' }].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {preview.torneos.length > 0 && (
            <div style={{ ...card, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Torneos del período</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                  <thead><tr style={{ borderBottom:'2px solid #e2e8f0' }}><th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Nombre</th><th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Fecha</th><th style={{ textAlign:'center', padding:'8px 6px', color: muted }}>Estado</th><th style={{ textAlign:'center', padding:'8px 6px', color: muted }}>Fase</th></tr></thead>
                  <tbody>{preview.torneos.map((t: any, i: number) => (
                    <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'8px 6px', color: text, fontWeight:500 }}>{t.nombre}</td>
                      <td style={{ padding:'8px 6px', color: muted }}>{t.fecha_inicio || '—'}</td>
                      <td style={{ padding:'8px 6px', textAlign:'center' }}>
                        <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background: t.estado === 'finalizado' ? '#dcfce7' : t.estado === 'en_curso' ? '#dbeafe' : '#fef9c3', color: t.estado === 'finalizado' ? '#16a34a' : t.estado === 'en_curso' ? '#2563eb' : '#d97706' }}>{t.estado}</span>
                      </td>
                      <td style={{ padding:'8px 6px', textAlign:'center', color: muted }}>{t.fase || '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {preview.ligas.length > 0 && (
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Ligas</div>
              {preview.ligas.map((l: any, i: number) => (
                <div key={i} style={{ padding:12, borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontWeight:600, color: text, fontSize:13 }}>{l.nombre}</span>
                    <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background: l.estado === 'finalizada' ? '#dcfce7' : l.estado === 'en_curso' ? '#dbeafe' : '#fef9c3', color: l.estado === 'finalizada' ? '#16a34a' : l.estado === 'en_curso' ? '#2563eb' : '#d97706' }}>{l.estado}</span>
                  </div>
                  <div style={{ display:'flex', gap:16, fontSize:12, color: muted }}>
                    <span>{(l.liga_divisiones || []).length} divisiones</span>
                    <span>{(l.liga_divisiones || []).reduce((s: number, d: any) => s + (d.liga_division_jugadores || []).length, 0)} jugadores</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
