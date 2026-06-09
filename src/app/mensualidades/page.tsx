'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

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

    // Crear registros pendientes
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
    await supabase.from('mensualidades').update({
      estado: 'pagado',
      fecha_pago: new Date().toISOString().slice(0,10),
      monto
    }).eq('id', mensId)
    await supabase.from('movimientos').insert({
      club_id: clubId, tipo: 'ingreso', categoria: 'mensualidad',
      descripcion: `Mensualidad ${jugador?.nombre} — ${mesesN[mes-1]} ${anio}`,
      monto, fecha: new Date().toISOString().slice(0,10),
      registrado_por_nombre: perfil?.nombre || 'Admin'
    })
    setModalPago(null)
    cargarMensualidades()
  }

  async function marcarAtrasado(mensId: string) {
    await supabase.from('mensualidades').update({ estado: 'atrasado' }).eq('id', mensId)
    cargarMensualidades()
  }

  async function marcarPendiente(mensId: string) {
    await supabase.from('mensualidades').update({ estado: 'pendiente' }).eq('id', mensId)
    cargarMensualidades()
  }

  async function exportarExcel() {
    const { utils, writeFile } = await import('xlsx')
    const datos = jugadores.map(j => {
      const mens = mensualidades.find(m => m.jugador_id === j.id)
      return {
        'Nombre': j.nombre,
        'Estado': mens?.estado || 'pendiente',
        'Fecha pago': mens?.fecha_pago || '',
        'Monto': mens?.monto || '',
        'Mes': mesesN[mes-1],
        'Año': anio
      }
    })
    const ws = utils.json_to_sheet(datos)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Mensualidades')
    writeFile(wb, `mensualidades_${mesesN[mes-1]}_${anio}.xlsx`)
  }

  const pagados = mensualidades.filter(m => m.estado === 'pagado').length
  const pendientes = mensualidades.filter(m => m.estado === 'pendiente').length
  const atrasados = mensualidades.filter(m => m.estado === 'atrasado').length

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => cambiarMes(-1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>◀</button>
          <span style={{ fontSize:16, fontWeight:600, color:'#fff', minWidth:160, textAlign:'center' }}>{mesesN[mes-1]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer' }}>▶</button>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ background:'#34d39922', color:'#34d399', padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600 }}>{pagados} pagados</span>
          <span style={{ background:'#fbbf2422', color:'#fbbf24', padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600 }}>{pendientes} pendientes</span>
          <span style={{ background:'#f8717122', color:'#f87171', padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600 }}>{atrasados} atrasados</span>
          <button onClick={exportarExcel} style={{ background:'#14161f', color:'#34d399', border:'1px solid #1e2030', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>📥 Excel</button>
        </div>
      </div>

      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e2030' }}>
                {['Nombre','Estado','Fecha pago','Monto','Acciones'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jugadores.map(j => {
                const mens = mensualidades.find(m => m.jugador_id === j.id)
                const estado = mens?.estado || 'pendiente'
                const col = estado === 'pagado' ? '#34d399' : estado === 'atrasado' ? '#f87171' : '#fbbf24'
                return (
                  <tr key={j.id} style={{ borderBottom:'1px solid #1e2030' }}>
                    <td style={{ padding:'12px 16px', fontWeight:600, color:'#c8cfe0', whiteSpace:'nowrap' }}>{j.nombre}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: col+'22', color: col, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>{estado}</span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{mens?.fecha_pago || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:'#a78bfa', fontFamily:'monospace' }}>
                      {mens?.monto ? '$'+mens.monto.toLocaleString('es-CL') : '—'}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {estado !== 'pagado' && (
                          <button onClick={() => { setModalPago({ jugadorId: j.id, mensId: mens?.id, nombre: j.nombre }); setMontoPago('25000') }}
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
                          <button onClick={() => marcarPendiente(mens.id)}
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
        {jugadores.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin jugadores activos</div>
        )}
      </div>

      {/* Modal confirmar pago */}
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
