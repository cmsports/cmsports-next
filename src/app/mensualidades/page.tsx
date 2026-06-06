'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

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
      supabase.from('jugadores').select('*').eq('club_id', clubId).eq('estado', 'activo').order('nombre'),
      supabase.from('mensualidades').select('*').eq('club_id', clubId).eq('mes', mes).eq('anio', anio)
    ])
    setJugadores(j || [])
    setMensualidades(m || [])

    // Crear registros pendientes para jugadores sin mensualidad
    const sinMens = (j || []).filter(jug => !(m || []).find(mens => mens.jugador_id === jug.id))
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

  async function marcarPagado(jugadorId: string) {
    const mens = mensualidades.find(m => m.jugador_id === jugadorId)
    if (!mens) return
    await supabase.from('mensualidades').update({ estado: 'pagado', fecha_pago: new Date().toISOString().slice(0,10) }).eq('id', mens.id)
    await supabase.from('movimientos').insert({
      club_id: clubId, tipo: 'ingreso', categoria: 'mensualidad',
      descripcion: `Mensualidad ${jugadores.find(j => j.id === jugadorId)?.nombre} — ${mesesN[mes-1]} ${anio}`,
      monto: mens.monto || 25000, fecha: new Date().toISOString().slice(0,10),
      registrado_por_nombre: perfil?.nombre || 'Admin'
    })
    cargarMensualidades()
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
        <div style={{ display:'flex', gap:8 }}>
          <span style={{ background:'#34d39922', color:'#34d399', padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600 }}>{pagados} pagados</span>
          <span style={{ background:'#fbbf2422', color:'#fbbf24', padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600 }}>{pendientes} pendientes</span>
          <span style={{ background:'#f8717122', color:'#f87171', padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600 }}>{atrasados} atrasados</span>
        </div>
      </div>

      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:12, color:'#6c7280', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600 }}>
          Jugadores
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #1e2030' }}>
              {['Nombre','Estado','Fecha pago','Acción'].map(h => (
                <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jugadores.map(j => {
              const mens = mensualidades.find(m => m.jugador_id === j.id)
              const estado = mens?.estado || 'pendiente'
              const estadoColor = estado === 'pagado' ? '#34d399' : estado === 'atrasado' ? '#f87171' : '#fbbf24'
              return (
                <tr key={j.id} style={{ borderBottom:'1px solid #1e2030' }}>
                  <td style={{ padding:'12px 16px', fontWeight:600, color:'#c8cfe0' }}>{j.nombre}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ background: estadoColor + '22', color: estadoColor, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                      {estado}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{mens?.fecha_pago || '—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    {estado !== 'pagado' && (
                      <button
                        onClick={() => marcarPagado(j.id)}
                        style={{ background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:600 }}
                      >
                        ✓ Marcar pagado
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {jugadores.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin jugadores activos</div>
        )}
      </div>
    </AppLayout>
  )
}
