'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function EstadoCuentaPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [mensualidad, setMensualidad] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const mesActual = new Date().getMonth() + 1
  const anioActual = new Date().getFullYear()

  const cargar = useCallback(async () => {
    if (!perfil?.jugador_id) return
    const [{ data: m }, { data: h }] = await Promise.all([
      supabase.from('mensualidades').select('*').eq('jugador_id', perfil.jugador_id).eq('mes', mesActual).eq('anio', anioActual).maybeSingle(),
      supabase.from('mensualidades').select('*').eq('jugador_id', perfil.jugador_id).order('anio', { ascending: false }).order('mes', { ascending: false }).limit(12),
    ])
    setMensualidad(m)
    setHistorial(h || [])
    setLoading(false)
  }, [anioActual, mesActual, perfil])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    const carga = window.setTimeout(() => { void cargar() }, 0)
    return () => window.clearTimeout(carga)
  }, [authLoading, cargar, perfil, router])

  useEffect(() => {
    if (!perfil?.jugador_id) return
    const canal = supabase
      .channel(`estado-cuenta-${perfil.id}-${perfil.jugador_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'mensualidades',
        filter: `jugador_id=eq.${perfil.jugador_id}`,
      }, () => { void cargar() })
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [cargar, perfil?.id, perfil?.jugador_id])

  const estado = mensualidad?.estado || 'pendiente'
  const estadoConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
    pagado:   { color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0', label:'Al día' },
    pendiente:{ color:'#d97706', bg:'#fffbeb', border:'#fde68a', label:'Pendiente' },
    atrasado: { color:'#dc2626', bg:'#fef2f2', border:'#fecaca', label:'Atrasado' },
  }
  const cfg = estadoConfig[estado] || estadoConfig.pendiente

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:20 }}>Mi Estado de Cuenta</h1>

      {/* Estado mes actual */}
      <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius:14, padding:24, marginBottom:16, textAlign:'center', boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
        <div style={{ fontSize:24, fontWeight:700, color: cfg.color, marginBottom:6 }}>{cfg.label}</div>
        <div style={{ fontSize:14, color: muted, marginBottom:8 }}>{mesesN[mesActual-1]} {anioActual}</div>
        {mensualidad?.monto && (
          <div style={{ fontSize:28, fontWeight:700, color: cfg.color, fontFamily:'monospace' }}>
            ${mensualidad.monto.toLocaleString('es-CL')}
          </div>
        )}
      </div>

      {estado !== 'pagado' && (
        <div style={{ ...card, padding:16, marginBottom:16, color:muted, fontSize:12, lineHeight:1.5 }}>
          El administrador marcará esta mensualidad como pagada cuando confirme la recepción del pago.
        </div>
      )}

      {/* Historial */}
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', fontSize:13, fontWeight:600, color: text }}>
          Historial de pagos
        </div>
        {historial.length === 0 ? (
          <div style={{ padding:30, textAlign:'center', color: hint, fontSize:13 }}>Sin historial</div>
        ) : historial.map(h => {
          const col = h.estado === 'pagado' ? '#16a34a' : h.estado === 'atrasado' ? '#dc2626' : '#d97706'
          const colBg = h.estado === 'pagado' ? '#f0fdf4' : h.estado === 'atrasado' ? '#fef2f2' : '#fffbeb'
          return (
            <div key={h.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontSize:13, color: text }}>{mesesN[h.mes-1]} {h.anio}</div>
                {h.fecha_pago && <div style={{ fontSize:11, color: muted, marginTop:2 }}>Pagado el {h.fecha_pago}</div>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {h.monto && <span style={{ fontSize:14, fontWeight:700, color:'#3730a3', fontFamily:'monospace' }}>${h.monto.toLocaleString('es-CL')}</span>}
                <span style={{ background: colBg, color: col, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>{h.estado}</span>
              </div>
            </div>
          )
        })}
      </div>
    </AppLayout>
  )
}
