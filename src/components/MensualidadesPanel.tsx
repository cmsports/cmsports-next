'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { registrarPago, generarMensualidadesPendientes, marcarAtrasado as marcarAtrasadoAction, revertirPago } from '@/app/actions/mensualidades'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export function MensualidadesPanel({ onPagoRegistrado, mes: mesProp, anio: anioProp }: { onPagoRegistrado?: () => void; mes?: number; anio?: number } = {}) {
  const { perfil } = usePerfil()
  const [jugadores, setJugadores] = useState<any[]>([])
  const [mensualidades, setMensualidades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mesLocal, setMesLocal] = useState(new Date().getMonth() + 1)
  const [anioLocal, setAnioLocal] = useState(new Date().getFullYear())
  const mes = mesProp ?? mesLocal
  const anio = anioProp ?? anioLocal
  const tienePropsExternos = mesProp !== undefined
  const [modalPago, setModalPago] = useState<any>(null)
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [montoPago, setMontoPago] = useState('25000')
  const [filtroEstado, setFiltroEstado] = useState<'todos'|'pagado'|'pendiente'|'atrasado'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    if (!clubId) return
    cargarMensualidades(clubId).then(() => setLoading(false))
  }, [clubId, mes, anio])

  useEffect(() => {
    if (!clubId) return
    supabase.from('clubs').select('mensualidad_base').eq('id', clubId).single()
      .then(({ data }) => { if (data?.mensualidad_base) setMontoPago(String(data.mensualidad_base)) })
  }, [clubId])

  async function cargarMensualidades(cid?: string) {
    const id = cid || clubId
    const [{ data: j }, { data: m }] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', id).eq('estado', 'activo').neq('es_externo', true).order('nombre'),
      supabase.from('mensualidades').select('*').eq('club_id', id).eq('mes', mes).eq('anio', anio)
    ])
    setJugadores(j || [])
    setMensualidades(m || [])

    // Auto-generar registros pendientes solo para el mes actual para no crear
    // filas históricas al navegar a meses anteriores
    const mesActual = new Date().getMonth() + 1
    const anioActual = new Date().getFullYear()
    const esMesActual = mes === mesActual && anio === anioActual
    if (esMesActual) {
      const sinMens = (j || []).filter(jug => !(m || []).find((mens: any) => mens.jugador_id === jug.id))
      if (sinMens.length > 0) {
        await generarMensualidadesPendientes({ jugadorIds: sinMens.map(jug => jug.id), mes, anio })
        const { data: mActual2 } = await supabase.from('mensualidades').select('*').eq('club_id', id).eq('mes', mes).eq('anio', anio)
        setMensualidades(mActual2 || [])
      }
    }
  }

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 12) { nuevoMes = 1; nuevoAnio++ }
    if (nuevoMes < 1) { nuevoMes = 12; nuevoAnio-- }
    setMesLocal(nuevoMes)
    setAnioLocal(nuevoAnio)
  }

  async function marcarPagado(jugadorId: string, mensId: string) {
    const jugador = jugadores.find(j => j.id === jugadorId)
    const monto = parseInt(montoPago) || 25000
    await registrarPago({
      jugadorId, jugadorNombre: jugador?.nombre || '', mensualidadId: mensId || null,
      mes, anio, monto, metodo: metodoPago, registradoPor: perfil?.nombre || 'Admin',
    })
    setModalPago(null)
    cargarMensualidades()
    onPagoRegistrado?.()
  }

  async function marcarAtrasado(mensId: string) {
    await marcarAtrasadoAction({ mensualidadId: mensId })
    cargarMensualidades()
  }

  async function marcarPendiente(mensId: string, jugadorId: string) {
    await revertirPago({ mensualidadId: mensId, jugadorId, mes, anio })
    cargarMensualidades()
    onPagoRegistrado?.()
  }

  async function exportarExcel() {
    const { utils, writeFile } = await import('xlsx')
    const { data: historial } = await supabase.from('mensualidades').select('*').eq('club_id', clubId).order('anio').order('mes')
    const wb = utils.book_new()

    const mensualidadPorJugador = new Map(mensualidades.map(m => [m.jugador_id, m]))
    const datosMes = jugadores.map(j => {
      const mens = mensualidadPorJugador.get(j.id)
      const estado = mens?.estado || 'pendiente'
      return {
        'Nombre': j.nombre, 'RUT': j.rut || '', 'Plan': `${j.sesiones_limite} sesiones`,
        'Estado': estado === 'pagado' ? 'Pagado' : estado === 'atrasado' ? 'Atrasado' : 'Pendiente',
        'Fecha pago': mens?.fecha_pago || '', 'Monto': mens?.monto || '', 'Método': mens?.metodo_pago || '',
      }
    })
    const ws1 = utils.json_to_sheet(datosMes)
    ws1['!cols'] = [{ wch:30 },{ wch:15 },{ wch:15 },{ wch:12 },{ wch:14 },{ wch:12 },{ wch:12 }]
    const range = utils.decode_range(ws1['!ref'] || 'A1')
    for (let r = 1; r <= range.e.r; r++) {
      const cell = ws1[utils.encode_cell({ r, c: 3 })]
      if (cell) {
        if (!cell.s) cell.s = {}
        if (cell.v === 'Atrasado') cell.s.fill = { fgColor: { rgb: 'FFE0E0' } }
        else if (cell.v === 'Pendiente') cell.s.fill = { fgColor: { rgb: 'FFF8E0' } }
        else if (cell.v === 'Pagado') cell.s.fill = { fgColor: { rgb: 'E0FFE8' } }
      }
    }
    utils.book_append_sheet(wb, ws1, `${mesesN[mes-1]} ${anio}`)

    const jugadorPorId = new Map(jugadores.map(j => [j.id, j]))
    const datosHistorial = (historial || []).map(h => {
      const jug = jugadorPorId.get(h.jugador_id)
      return { 'Nombre': jug?.nombre || '', 'Mes': mesesN[h.mes-1], 'Año': h.anio, 'Estado': h.estado === 'atrasado' ? 'Atrasado' : h.estado === 'pendiente' ? 'Pendiente' : 'Pagado', 'Fecha pago': h.fecha_pago || '', 'Monto': h.monto || '' }
    })
    const ws2 = utils.json_to_sheet(datosHistorial)
    ws2['!cols'] = [{ wch:30 },{ wch:14 },{ wch:8 },{ wch:12 },{ wch:14 },{ wch:12 }]
    utils.book_append_sheet(wb, ws2, 'Historial completo')

    const historialPorJugador = new Map<string, typeof historial>()
    ;(historial || []).forEach(h => {
      const lista = historialPorJugador.get(h.jugador_id) || []
      lista.push(h)
      historialPorJugador.set(h.jugador_id, lista)
    })
    const resumen = jugadores.map(j => {
      const histJug = historialPorJugador.get(j.id) || []
      return { 'Nombre': j.nombre, 'RUT': j.rut || '', 'Categoría': j.categoria, 'Plan (sesiones)': j.sesiones_limite, 'Cuotas pagadas': histJug.filter(h => h.estado === 'pagado').length, 'Cuotas atrasadas': histJug.filter(h => h.estado === 'atrasado').length, 'Cuotas pendientes': histJug.filter(h => h.estado === 'pendiente').length, 'Total pagado': histJug.filter(h => h.estado === 'pagado').reduce((s, h) => s + (h.monto || 0), 0) }
    })
    const ws3 = utils.json_to_sheet(resumen)
    ws3['!cols'] = [{ wch:30 },{ wch:14 },{ wch:14 },{ wch:16 },{ wch:16 },{ wch:17 },{ wch:17 },{ wch:14 }]
    utils.book_append_sheet(wb, ws3, 'Resumen por jugador')

    writeFile(wb, `mensualidades_${mesesN[mes-1]}_${anio}.xlsx`)
  }

  const pagados = mensualidades.filter(m => m.estado === 'pagado').length
  const pendientes = mensualidades.filter(m => m.estado === 'pendiente').length
  const atrasados = mensualidades.filter(m => m.estado === 'atrasado').length
  const totalRecaudado = mensualidades.filter(m => m.estado === 'pagado').reduce((s,m) => s + (m.monto||0), 0)
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  const jugadoresFiltrados = jugadores.filter(j => {
    const mens = mensualidades.find(m => m.jugador_id === j.id)
    const estado = mens?.estado || 'pendiente'
    const coincideEstado = filtroEstado === 'todos' || estado === filtroEstado
    const coincideBusqueda = !busqueda || j.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return coincideEstado && coincideBusqueda
  })

  if (loading) return <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>Cargando mensualidades...</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        {!tienePropsExternos && (
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={() => cambiarMes(-1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>◀</button>
            <span style={{ fontSize:16, fontWeight:600, color: text, minWidth:160, textAlign:'center' }}>{mesesN[mes-1]} {anio}</span>
            <button onClick={() => cambiarMes(1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>▶</button>
          </div>
        )}
        <button onClick={exportarExcel} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>📊 Exportar Excel</button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:16 }}>
        {[
          { label:'✅ Pagados', value:pagados, color:'#16a34a', bg:'#f0fdf4' },
          { label:'⏳ Pendientes', value:pendientes, color:'#d97706', bg:'#fffbeb' },
          { label:'⚠️ Atrasados', value:atrasados, color:'#dc2626', bg:'#fef2f2' },
          { label:'💰 Recaudado', value:fmt(totalRecaudado), color:'#3730a3', bg:'#ede9fe' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border:`1px solid ${s.color}33`, borderRadius:14, padding:16, boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
            <div style={{ fontSize:12, color: muted, marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <input style={{ flex:1, minWidth:200, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'9px 12px', color: text, fontSize:13, outline:'none' }}
          placeholder="Buscar jugador..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        {(['todos','pagado','pendiente','atrasado'] as const).map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #e2e8f0', background: filtroEstado===e?'#ede9fe':'#ffffff', color: filtroEstado===e?'#3730a3': muted, fontSize:12, cursor:'pointer', textTransform:'capitalize', boxShadow: filtroEstado===e ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {e === 'todos' ? '🔍 Todos' : e === 'pagado' ? '✅ Pagados' : e === 'pendiente' ? '⏳ Pendientes' : '⚠️ Atrasados'}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['Nombre','Plan','Estado','Fecha pago','Monto','Acciones'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jugadoresFiltrados.map(j => {
                const mens = mensualidades.find(m => m.jugador_id === j.id)
                const estado = mens?.estado || 'pendiente'
                const col = estado === 'pagado' ? '#16a34a' : estado === 'atrasado' ? '#dc2626' : '#d97706'
                const colBg = estado === 'pagado' ? '#f0fdf4' : estado === 'atrasado' ? '#fef2f2' : '#fffbeb'
                return (
                  <tr key={j.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'12px 16px', fontWeight:600, color: text, whiteSpace:'nowrap' }}>
                      {j.nombre}
                      {j.telefono && (
                        <a href={`https://wa.me/${j.telefono.replace(/[^0-9]/g,'')}`} target="_blank"
                          style={{ marginLeft:8, fontSize:11, color:'#16a34a', textDecoration:'none' }} title="WhatsApp">💬</a>
                      )}
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted, whiteSpace:'nowrap' }}>{j.sesiones_limite} ses.</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: colBg, color: col, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                        {estado === 'pagado' ? '✅ Pagado' : estado === 'atrasado' ? '⚠️ Atrasado' : '⏳ Pendiente'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>{mens?.fecha_pago || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:'#3730a3', fontFamily:'monospace' }}>
                      {mens?.monto ? fmt(mens.monto) : '—'}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {estado !== 'pagado' && (
                          <button onClick={() => { setModalPago({ jugadorId: j.id, mensId: mens?.id, nombre: j.nombre }); setMontoPago(String(j.sesiones_limite === 16 ? 40000 : j.sesiones_limite === 12 ? 30000 : j.sesiones_limite === 8 ? 25000 : 15000)) }}
                            style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
                            ✅ Marcar pagado
                          </button>
                        )}
                        {estado === 'pendiente' && mens?.id && (
                          <button onClick={() => marcarAtrasado(mens.id)}
                            style={{ background:'#fef2f2', color:'#dc2626', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                            ⚠️ Atrasar
                          </button>
                        )}
                        {estado === 'pagado' && mens?.id && (
                          <button onClick={() => marcarPendiente(mens.id, j.id)}
                            style={{ background:'#fffbeb', color:'#d97706', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                            ↩️ Revertir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {jugadoresFiltrados.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>
            {busqueda || filtroEstado !== 'todos' ? 'No hay jugadores con ese filtro' : 'Sin jugadores activos'}
          </div>
        )}
      </div>

      {/* Modal pago */}
      {modalPago && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:16, fontWeight:600, color: text, marginBottom:6 }}>💳 Confirmar pago</div>
            <div style={{ fontSize:13, color: muted, marginBottom:20 }}>{modalPago.nombre}</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Monto (CLP)</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                type="number" value={montoPago} onChange={e => setMontoPago(e.target.value)} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Método de pago</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalPago(null)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={() => marcarPagado(modalPago.jugadorId, modalPago.mensId)} style={{ flex:1, padding:11, background:'#16a34a', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
