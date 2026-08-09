'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { fechaChile } from '@/lib/domain/fechaChile'
import { cuentaDelJugador, tieneExtrasPendientes, type ClaseExtraJugador } from '@/lib/domain/estadoCuenta'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function EstadoCuentaPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [mensualidad, setMensualidad] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [extras, setExtras] = useState<ClaseExtraJugador[]>([])
  const [matriculaPagada, setMatriculaPagada] = useState(true)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // El mes en hora de Chile. `new Date().getMonth()` es la del navegador, y el
  // día 1 a las 00:30 en Chile todavía es el mes anterior en UTC: la pantalla
  // buscaba la mensualidad del mes equivocado y mostraba "Sin historial".
  const [anioActual, mesActual] = useMemo(() => {
    const [a, m] = fechaChile().split('-')
    return [Number(a), Number(m)]
  }, [])

  const cargar = useCallback(async () => {
    if (!perfil?.jugador_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: m }, { data: h }, { data: ex }, { data: jug }] = await Promise.all([
      supabase.from('mensualidades').select('id,mes,anio,monto,estado,fecha_pago,notas').eq('jugador_id', perfil.jugador_id).eq('mes', mesActual).eq('anio', anioActual).maybeSingle(),
      supabase.from('mensualidades').select('id,mes,anio,monto,estado,fecha_pago,notas').eq('jugador_id', perfil.jugador_id).order('anio', { ascending: false }).order('mes', { ascending: false }).limit(12),
      // La RLS ya lo limita a las suyas (política `clases_extra_propias`, 098),
      // pero el filtro va igual: la pantalla pide lo que muestra.
      db.from('clases_extraordinarias').select('id,fecha,monto,pagada_en').eq('jugador_id', perfil.jugador_id).order('fecha', { ascending: false }).limit(60),
      db.from('jugadores').select('matricula_pagada').eq('id', perfil.jugador_id).maybeSingle(),
    ])
    setMensualidad(m)
    setHistorial(h || [])
    setExtras((ex ?? []) as ClaseExtraJugador[])
    // Ante la duda no se le inventa una deuda: si la ficha no llegó, se asume
    // pagada y no se muestra el aviso.
    setMatriculaPagada(jug?.matricula_pagada !== false)
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
      // Ponerle precio a una clase extra pasa desde Finanzas, en otra pantalla y
      // otra sesión. Sin esto el jugador seguía viendo su total viejo hasta que
      // recargara. La tabla está publicada desde la migración 121.
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'clases_extraordinarias',
        filter: `jugador_id=eq.${perfil.jugador_id}`,
      }, () => { void cargar() })
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [cargar, perfil?.id, perfil?.jugador_id])

  const cuenta = cuentaDelJugador(mensualidad, extras)
  const conExtras = tieneExtrasPendientes(cuenta)

  const estadoConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
    pagado:   { color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0', label:'Al día' },
    pendiente:{ color:'#d97706', bg:'#fffbeb', border:'#fde68a', label:'Pendiente' },
    atrasado: { color:'#dc2626', bg:'#fef2f2', border:'#fecaca', label:'Atrasado' },
  }

  // El titular es de la cuenta entera, no de la mensualidad. Antes decía "Al
  // día" con una clase extra sin pagar: la cuota estaba pagada y la deuda no.
  const estadoMens = mensualidad?.estado || 'pendiente'
  const estado = cuenta.total === 0 ? 'pagado'
    : estadoMens === 'atrasado' ? 'atrasado'
    : 'pendiente'
  const cfg = estadoConfig[estado]

  const plata = (n: number) => `$${n.toLocaleString('es-CL')}`
  const fechaCorta = (f: string) => {
    const [, mes, dia] = f.split('-')
    return `${dia} ${mesesN[Number(mes) - 1]?.slice(0, 3).toLowerCase() ?? ''}`
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:20 }}>Mi Estado de Cuenta</h1>

      {/* Estado mes actual. El monto grande es el total que debe, no solo la
          cuota: con una clase extra impaga los dos números no coinciden, y el
          que importa es el que le van a cobrar. */}
      <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius:14, padding:24, marginBottom:16, textAlign:'center', boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
        <div style={{ fontSize:24, fontWeight:700, color: cfg.color, marginBottom:6 }}>{cfg.label}</div>
        <div style={{ fontSize:14, color: muted, marginBottom:8 }}>{mesesN[mesActual-1]} {anioActual}</div>
        {cuenta.total > 0 && (
          <div style={{ fontSize:28, fontWeight:700, color: cfg.color, fontFamily:'monospace' }}>
            {plata(cuenta.total)}
          </div>
        )}
        {conExtras && (
          <div style={{ fontSize:12, color: muted, marginTop:8, lineHeight:1.6 }}>
            {cuenta.mensualidad > 0
              ? <>Mensualidad {plata(cuenta.mensualidad)} + clases extra {plata(cuenta.extras)}</>
              : <>Mensualidad al día · clases extra {plata(cuenta.extras)}</>}
          </div>
        )}
      </div>

      {/* Las clases extra, una por una. Sin el detalle el total de arriba es
          un número que aparece de la nada. */}
      {(cuenta.porCobrar.length > 0 || cuenta.sinCargo.length > 0 || cuenta.sinMonto.length > 0) && (
        <div style={{ ...card, overflow:'hidden', marginBottom:16 }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', display:'flex',
            justifyContent:'space-between', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color: text }}>🟡 Clases extraordinarias</div>
              <div style={{ fontSize:11, color: hint, marginTop:2 }}>
                Días que viniste de más. Se cobran aparte de la mensualidad.
              </div>
            </div>
            {cuenta.extras > 0 && (
              <div style={{ fontSize:14, fontWeight:700, color:'#a16207', fontFamily:'monospace' }}>
                {plata(cuenta.extras)}
              </div>
            )}
          </div>

          {cuenta.porCobrar.map(e => (
            <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
              <span style={{ fontSize:13, color: text }}>{fechaCorta(e.fecha)}</span>
              <span style={{ fontSize:14, fontWeight:700, color:'#a16207', fontFamily:'monospace' }}>
                {plata(e.monto ?? 0)}
              </span>
            </div>
          ))}

          {cuenta.sinCargo.map(e => (
            <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
              <span style={{ fontSize:13, color: muted }}>{fechaCorta(e.fecha)}</span>
              <span style={{ fontSize:12, fontWeight:600, color:'#15803d' }}>Sin cargo</span>
            </div>
          ))}

          {cuenta.sinMonto.map(e => (
            <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
              <span style={{ fontSize:13, color: muted }}>{fechaCorta(e.fecha)}</span>
              <span style={{ fontSize:12, color: hint }}>Monto por definir</span>
            </div>
          ))}
        </div>
      )}

      {!matriculaPagada && (
        <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:14, padding:16, marginBottom:16, fontSize:12, color:'#c2410c', lineHeight:1.5 }}>
          ⚠️ Tu matrícula figura como pendiente. Consultá con el administrador del club.
        </div>
      )}

      {estado !== 'pagado' && (
        <div style={{ ...card, padding:16, marginBottom:16, color:muted, fontSize:12, lineHeight:1.5 }}>
          El administrador marcará {conExtras ? 'estos cobros' : 'esta mensualidad'} como pagados cuando confirme la recepción del pago.
        </div>
      )}

      {/* Historial */}
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', fontSize:13, fontWeight:600, color: text }}>
          Historial de pagos
        </div>
        {historial.length === 0 && cuenta.pagadas.length === 0 ? (
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

        {/* Las extras ya cobradas. Van en el mismo historial porque para él es
            la misma pregunta: qué pagó. */}
        {cuenta.pagadas.map(e => (
          <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
            <div>
              <div style={{ fontSize:13, color: text }}>Clase extra</div>
              <div style={{ fontSize:11, color: muted, marginTop:2 }}>{e.fecha}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {e.monto != null && e.monto > 0 && (
                <span style={{ fontSize:14, fontWeight:700, color:'#3730a3', fontFamily:'monospace' }}>{plata(e.monto)}</span>
              )}
              <span style={{ background:'#f0fdf4', color:'#16a34a', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>pagado</span>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}
