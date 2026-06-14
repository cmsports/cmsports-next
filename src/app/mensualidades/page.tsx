'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { registrarPago, revertirPago } from '@/app/actions/mensualidades'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function MensualidadesPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [jugadores, setJugadores] = useState<any[]>([])
  const [mensualidades, setMensualidades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [clubId, setClubId] = useState<string | null>(null)
  const [modalPago, setModalPago] = useState<any>(null)
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [montoPago, setMontoPago] = useState('25000')
  const [filtroEstado, setFiltroEstado] = useState<'todos'|'pagado'|'pendiente'|'atrasado'>('todos')
  const [busqueda, setBusqueda] = useState('')
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
    cargarMensualidades()
  }, [clubId, mes, anio])

  async function cargarMensualidades() {
    const [{ data: j }, { data: m }] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', clubId).eq('estado', 'activo').neq('es_externo', true).order('nombre'),
      supabase.from('mensualidades').select('*').eq('club_id', clubId).eq('mes', mes).eq('anio', anio)
    ])
    setJugadores(j || [])
    setMensualidades(m || [])

    // Crear mensualidades faltantes
    const sinMens = (j || []).filter(jug => !(m || []).find((mens: any) => mens.jugador_id === jug.id))
    if (sinMens.length > 0) {
      await supabase.from('mensualidades').insert(sinMens.map(jug => ({
        club_id: clubId, jugador_id: jug.id, mes, anio, estado: 'pendiente'
      })))
      const { data: mActual } = await supabase.from('mensualidades').select('*').eq('club_id', clubId).eq('mes', mes).eq('anio', anio)
      setMensualidades(mActual || [])
    }
  }

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 12) { nuevoMes = 1; nuevoAnio++ }
    if (nuevoMes < 1) { nuevoMes = 12; nuevoAnio-- }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  async function marcarPagado(jugadorId: string, mensId: string) {
    const jugador = jugadores.find(j => j.id === jugadorId)
    const monto = parseInt(montoPago) || 25000
    const result = await registrarPago({
      clubId: clubId!,
      jugadorId,
      jugadorNombre: jugador?.nombre || '',
      mensualidadId: mensId || null,
      mes,
      anio,
      monto,
      metodo: metodoPago,
      registradoPor: perfil?.nombre || 'Admin',
    })
    if (result.error) { alert(result.error); return }
    setModalPago(null)
    cargarMensualidades()
  }

  async function marcarAtrasado(mensId: string) {
    await supabase.from('mensualidades').update({ estado: 'atrasado' }).eq('id', mensId)
    cargarMensualidades()
  }

  async function marcarPendiente(mensId: string, jugadorId: string) {
    const result = await revertirPago({
      clubId: clubId!,
      mensualidadId: mensId,
      jugadorId,
      mes,
      anio,
    })
    if (result.error) { alert(result.error); return }
    cargarMensualidades()
  }

  async function exportarExcel() {
    const { utils, writeFile } = await import('xlsx')
    const { data: historial } = await supabase.from('mensualidades')
      .select('*').eq('club_id', clubId).order('anio').order('mes')
    const wb = utils.book_new()

    // Hoja 1: Mes actual con colores
    const datosMes = jugadores.map(j => {
      const mens = mensualidades.find(m => m.jugador_id === j.id)
      const estado = mens?.estado || 'pendiente'
      return {
        'Nombre': j.nombre,
        'RUT': j.rut || '',
        'Plan': `${j.sesiones_limite} sesiones`,
        'Estado': estado === 'pagado' ? 'Pagado' : estado === 'atrasado' ? 'Atrasado' : 'Pendiente',
        'Fecha pago': mens?.fecha_pago || '',
        'Monto': mens?.monto || '',
        'Método': mens?.metodo_pago || '',
      }
    })
    const ws1 = utils.json_to_sheet(datosMes)

    // Estilos — ancho columnas
    ws1['!cols'] = [{ wch:30 },{ wch:15 },{ wch:15 },{ wch:12 },{ wch:14 },{ wch:12 },{ wch:12 }]

    // Colorear celdas de estado
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

    // Hoja 2: Historial completo
    const datosHistorial = (historial || []).map(h => {
      const jug = jugadores.find(j => j.id === h.jugador_id)
      return {
        'Nombre': jug?.nombre || '',
        'Mes': mesesN[h.mes-1],
        'Año': h.anio,
        'Estado': h.estado === 'atrasado' ? 'Atrasado' : h.estado === 'pendiente' ? 'Pendiente' : 'Pagado',
        'Fecha pago': h.fecha_pago || '',
        'Monto': h.monto || '',
      }
    })
    const ws2 = utils.json_to_sheet(datosHistorial)
    ws2['!cols'] = [{ wch:30 },{ wch:14 },{ wch:8 },{ wch:12 },{ wch:14 },{ wch:12 }]
    utils.book_append_sheet(wb, ws2, 'Historial completo')

    // Hoja 3: Resumen por jugador
    const resumen = jugadores.map(j => {
      const histJug = (historial || []).filter(h => h.jugador_id === j.id)
      const pagadas = histJug.filter(h => h.estado === 'pagado').length
      const atrasadas = histJug.filter(h => h.estado === 'atrasado').length
      const pendientes = histJug.filter(h => h.estado === 'pendiente').length
      const totalPagado = histJug.filter(h => h.estado === 'pagado').reduce((s, h) => s + (h.monto || 0), 0)
      return {
        'Nombre': j.nombre,
        'RUT': j.rut || '',
        'Categoría': j.categoria,
        'Plan (sesiones)': j.sesiones_limite,
        'Cuotas pagadas': pagadas,
        'Cuotas atrasadas': atrasadas,
        'Cuotas pendientes': pendientes,
        'Total pagado': totalPagado,
      }
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

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => cambiarMes(-1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>◀</button>
          <span style={{ fontSize:16, fontWeight:600, color:'#fff', minWidth:160, textAlign:'center' }}>{mesesN[mes-1]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>▶</button>
        </div>
        <button onClick={exportarExcel} style={{ background:'#14161f', color:'#34d399', border:'1px solid #1e2030', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>📥 Excel</button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:16 }}>
        {[
          { label:'Pagados', value:pagados, color:'#34d399', bg:'#34d39922' },
          { label:'Pendientes', value:pendientes, color:'#fbbf24', bg:'#fbbf2422' },
          { label:'Atrasados', value:atrasados, color:'#f87171', bg:'#f8717122' },
          { label:'Recaudado', value:fmt(totalRecaudado), color:'#a78bfa', bg:'#a78bfa22' },
        ].map(s => (
          <div key={s.label} onClick={() => setFiltroEstado(s.label.toLowerCase() as any)}
            style={{ background:'#14161f', border:`1px solid ${s.bg}`, borderRadius:14, padding:16, cursor:'pointer', transition:'all 0.15s' }}>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
            <div style={{ fontSize:12, color:'#6c7280', marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <input style={{ flex:1, minWidth:200, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'9px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
          placeholder="🔍 Buscar jugador..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        {(['todos','pagado','pendiente','atrasado'] as const).map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #1e2030', background: filtroEstado===e?'#6c63ff':'#14161f', color: filtroEstado===e?'white':'#8890a4', fontSize:12, cursor:'pointer', textTransform:'capitalize' }}>
            {e === 'todos' ? 'Todos' : e === 'pagado' ? '✅ Pagados' : e === 'pendiente' ? '⏳ Pendientes' : '🔴 Atrasados'}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e2030' }}>
                {['Nombre','Plan','Estado','Fecha pago','Monto','Acciones'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jugadoresFiltrados.map(j => {
                const mens = mensualidades.find(m => m.jugador_id === j.id)
                const estado = mens?.estado || 'pendiente'
                const col = estado === 'pagado' ? '#34d399' : estado === 'atrasado' ? '#f87171' : '#fbbf24'
                return (
                  <tr key={j.id} style={{ borderBottom:'1px solid #1e2030' }}>
                    <td style={{ padding:'12px 16px', fontWeight:600, color:'#c8cfe0', whiteSpace:'nowrap' }}>
                      {j.nombre}
                      {j.telefono && (
                        <a href={`https://wa.me/${j.telefono.replace(/[^0-9]/g,'')}`} target="_blank"
                          style={{ marginLeft:8, fontSize:11, color:'#34d399', textDecoration:'none' }} title="WhatsApp">💬</a>
                      )}
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280', whiteSpace:'nowrap' }}>{j.sesiones_limite} ses.</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background:col+'22', color:col, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                        {estado === 'pagado' ? '✅ Pagado' : estado === 'atrasado' ? '🔴 Atrasado' : '⏳ Pendiente'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{mens?.fecha_pago || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:'#a78bfa', fontFamily:'monospace' }}>
                      {mens?.monto ? fmt(mens.monto) : '—'}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {estado !== 'pagado' && (
                          <button onClick={() => { setModalPago({ jugadorId: j.id, mensId: mens?.id, nombre: j.nombre }); setMontoPago(String(j.sesiones_limite === 16 ? 40000 : j.sesiones_limite === 12 ? 30000 : j.sesiones_limite === 8 ? 25000 : 15000)) }}
                            style={{ background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
                            ✓ Marcar pagado
                          </button>
                        )}
                        {estado === 'pendiente' && mens?.id && (
                          <button onClick={() => marcarAtrasado(mens.id)}
                            style={{ background:'#f8717122', color:'#f87171', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                            Atrasar
                          </button>
                        )}
                        {estado === 'pagado' && mens?.id && (
                          <button onClick={() => marcarPendiente(mens.id, j.id)}
                            style={{ background:'#fbbf2422', color:'#fbbf24', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                            Revertir
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
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>
            {busqueda || filtroEstado !== 'todos' ? 'No hay jugadores con ese filtro' : 'Sin jugadores activos'}
          </div>
        )}
      </div>

      {/* Modal pago */}
      {modalPago && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:28, width:'100%', maxWidth:360 }}>
            <div style={{ fontSize:16, fontWeight:600, color:'#fff', marginBottom:6 }}>Confirmar pago</div>
            <div style={{ fontSize:13, color:'#6c7280', marginBottom:20 }}>{modalPago.nombre}</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Monto (CLP)</label>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                type="number" value={montoPago} onChange={e => setMontoPago(e.target.value)} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Método de pago</label>
              <select style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
                value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                <option value="efectivo">💵 Efectivo</option>
                <option value="transferencia">💳 Transferencia</option>
              </select>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModalPago(null)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #1e2030', borderRadius:8, color:'#6c7280', fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={() => marcarPagado(modalPago.jugadorId, modalPago.mensId)} style={{ flex:1, padding:11, background:'#34d399', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>✓ Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
