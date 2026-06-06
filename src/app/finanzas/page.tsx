'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const catLabel: Record<string, string> = {
  mensualidad:'Mensualidad', inscripcion_torneo:'Inscripción torneo',
  arriendo_cancha:'Arriendo cancha', donacion:'Donación', otro_ingreso:'Otro ingreso',
  sueldo_profesor:'Sueldo profesor', sueldo_staff:'Sueldo staff',
  material_deportivo:'Material deportivo', servicios_basicos:'Servicios básicos',
  mantenimiento:'Mantenimiento', otro_gasto:'Otro gasto'
}

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function FinanzasPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [movimientos, setMovimientos] = useState<any[]>([])
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
    cargarMovimientos()
  }, [clubId, mes, anio])

  async function cargarMovimientos() {
    const mesStr = String(mes).padStart(2, '0')
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const inicio = `${anio}-${mesStr}-01`
    const fin = `${anio}-${mesStr}-${String(ultimoDia).padStart(2,'0')}`
    const { data } = await supabase.from('movimientos').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha', { ascending: false })
    setMovimientos(data || [])
  }

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 12) { nuevoMes = 1; nuevoAnio++ }
    if (nuevoMes < 1) { nuevoMes = 12; nuevoAnio-- }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
  const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const gastos = movimientos.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)

  // Desglose por categoría
  const desgloseIngresos: Record<string, number> = {}
  const desgloseGastos: Record<string, number> = {}
  movimientos.forEach(m => {
    if (m.tipo === 'ingreso') desgloseIngresos[m.categoria] = (desgloseIngresos[m.categoria] || 0) + m.monto
    else desgloseGastos[m.categoria] = (desgloseGastos[m.categoria] || 0) + m.monto
  })

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header con navegación de mes */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => cambiarMes(-1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer', fontSize:14 }}>◀</button>
          <span style={{ fontSize:16, fontWeight:600, color:'#fff', minWidth:160, textAlign:'center' }}>{mesesN[mes-1]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:8, padding:'6px 12px', color:'#c8cfe0', cursor:'pointer', fontSize:14 }}>▶</button>
        </div>
        <button style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          + Movimiento
        </button>
      </div>

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

      {/* Tabla movimientos */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>
          Todos los movimientos
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #1e2030' }}>
              {['Fecha','Categoría','Descripción','Registrado por','Monto'].map(h => (
                <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movimientos.map(m => (
              <tr key={m.id} style={{ borderBottom:'1px solid #1e2030' }}>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{m.fecha || '—'}</td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ background: m.tipo === 'ingreso' ? '#34d39922' : '#f8717122', color: m.tipo === 'ingreso' ? '#34d399' : '#f87171', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                    {catLabel[m.categoria] || m.categoria || '—'}
                  </span>
                </td>
                <td style={{ padding:'12px 16px', fontSize:13, color:'#c8cfe0' }}>{m.descripcion}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{m.registrado_por_nombre || 'Admin'}</td>
                <td style={{ padding:'12px 16px', fontWeight:700, fontFamily:'monospace', color: m.tipo === 'ingreso' ? '#34d399' : '#f87171' }}>
                  {m.tipo === 'ingreso' ? '+' : '-'}${m.monto?.toLocaleString('es-CL')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {movimientos.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin movimientos este mes</div>
        )}
      </div>
    </AppLayout>
  )
}
