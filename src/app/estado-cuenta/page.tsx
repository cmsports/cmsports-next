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

export default function EstadoCuentaPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [mensualidad, setMensualidad] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const mesActual = new Date().getMonth() + 1
  const anioActual = new Date().getFullYear()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.jugador_id) {
        const [{ data: m }, { data: h }] = await Promise.all([
          supabase.from('mensualidades').select('*').eq('jugador_id', p.jugador_id).eq('mes', mesActual).eq('anio', anioActual).single(),
          supabase.from('mensualidades').select('*').eq('jugador_id', p.jugador_id).order('anio', { ascending: false }).order('mes', { ascending: false }).limit(12)
        ])
        setMensualidad(m)
        setHistorial(h || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const estado = mensualidad?.estado || 'pendiente'
  const iconos: Record<string, string> = { pagado:'✅', pendiente:'⏳', atrasado:'🔴' }
  const textos: Record<string, string> = { pagado:'Al día', pendiente:'Pendiente', atrasado:'Atrasado' }
  const colores: Record<string, string> = { pagado:'#34d399', pendiente:'#fbbf24', atrasado:'#f87171' }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:20 }}>Mi Estado de Cuenta</h1>

      {/* Estado mes actual */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:24, marginBottom:16, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>{iconos[estado]}</div>
        <div style={{ fontSize:24, fontWeight:700, color: colores[estado], marginBottom:6 }}>{textos[estado]}</div>
        <div style={{ fontSize:14, color:'#6c7280', marginBottom:8 }}>{mesesN[mesActual-1]} {anioActual}</div>
        {mensualidad?.monto && (
          <div style={{ fontSize:22, fontWeight:700, color:'#a78bfa', fontFamily:'monospace' }}>
            ${mensualidad.monto.toLocaleString('es-CL')}
          </div>
        )}
      </div>

      {/* Subir comprobante */}
      {estado !== 'pagado' && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:8 }}>Subir comprobante de pago</div>
          <div style={{ fontSize:12, color:'#6c7280', marginBottom:12 }}>Si pagaste por transferencia, adjunta el comprobante aquí</div>
          <button style={{ width:'100%', padding:12, background:'#6c63ff', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' }}>
            📎 Adjuntar comprobante
          </button>
        </div>
      )}

      {/* Historial */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>
          Historial de pagos
        </div>
        {historial.length === 0 ? (
          <div style={{ padding:30, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin historial</div>
        ) : historial.map(h => {
          const col = h.estado === 'pagado' ? '#34d399' : h.estado === 'atrasado' ? '#f87171' : '#fbbf24'
          return (
            <div key={h.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #1e2030' }}>
              <div>
                <div style={{ fontSize:13, color:'#c8cfe0' }}>{mesesN[h.mes-1]} {h.anio}</div>
                {h.fecha_pago && <div style={{ fontSize:11, color:'#6c7280', marginTop:2 }}>Pagado el {h.fecha_pago}</div>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {h.monto && <span style={{ fontSize:14, fontWeight:700, color:'#a78bfa', fontFamily:'monospace' }}>${h.monto.toLocaleString('es-CL')}</span>}
                <span style={{ background: col+'22', color: col, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>{h.estado}</span>
              </div>
            </div>
          )
        })}
      </div>
    </AppLayout>
  )
}
