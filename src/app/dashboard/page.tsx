'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { CONFIG } from '@/lib/config'
import { formatCLP, calcularCOA, calcularTasaMorosidad } from '@/lib/domain/finanzas'
import { aprobarSolicitud, rechazarSolicitud } from '@/app/actions/dashboard'
import type { Jugador, Mensualidad, Movimiento, SolicitudJugador, Torneo } from '@/types'

export default function DashboardPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [kpis, setKpis] = useState<any>({})
  const [kpisAnt, setKpisAnt] = useState<any>({})
  const [ultimasAsist, setUltimasAsist] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<SolicitudJugador[]>([])
  const [deudores, setDeudores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ddOpen, setDdOpen] = useState(false)
  const [aprobando, setAprobando] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      setPerfil(p)
      if (p?.rol === 'jugador') { router.push('/perfil'); return }
      if (p?.rol === 'profesor') { router.push('/dashboard-profesor'); return }
      if (p?.club_id) await cargarDatos(p.club_id)
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarDatos(cid: string) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const mesActual = new Date().getMonth() + 1
    const anioActual = new Date().getFullYear()
    const mesAnterior = mesActual === 1 ? 12 : mesActual - 1
    const anioAnterior = mesActual === 1 ? anioActual - 1 : anioActual
    const mesInicio = `${anioActual}-${String(mesActual).padStart(2, '0')}-01`
    const mesInicioAnt = `${anioAnterior}-${String(mesAnterior).padStart(2, '0')}-01`

    const [
      { data: jugsData },
      { data: torneos },
      { data: mensualidades },
      { data: mensualidadesAnt },
      { data: movimientos },
      { data: movimientosAnt },
      { data: solicitudesData },
      { data: asistMes },
    ] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', cid).neq('es_externo', true),
      supabase.from('torneos').select('*').eq('club_id', cid).eq('estado', 'en_curso'),
      supabase.from('mensualidades').select('*').eq('club_id', cid).eq('mes', mesActual).eq('anio', anioActual),
      supabase.from('mensualidades').select('*').eq('club_id', cid).eq('mes', mesAnterior).eq('anio', anioAnterior),
      supabase.from('movimientos').select('*').eq('club_id', cid).gte('fecha', mesInicio),
      supabase.from('movimientos').select('*').eq('club_id', cid).gte('fecha', mesInicioAnt).lt('fecha', mesInicio),
      supabase.from('solicitudes_jugador').select('*').eq('club_id', cid).eq('estado', 'pendiente').order('creado_en', { ascending: false }),
      supabase.from('asistencia').select('*,jugadores(nombre)').eq('club_id', cid).gte('fecha', mesInicio).order('fecha', { ascending: false }).limit(5),
    ])

    const jugadores = (jugsData || []) as Jugador[]
    const activos = jugadores.filter(j => j.estado === 'activo')
    const morosos = ((mensualidades || []) as Mensualidad[]).filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
    const morososAnt = ((mensualidadesAnt || []) as Mensualidad[]).filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
    const movs = (movimientos || []) as Movimiento[]
    const movsAnt = (movimientosAnt || []) as Movimiento[]
    const gastos = movs.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    const ingresos = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastosAnt = movsAnt.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    const ingresosAnt = movsAnt.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const coa = calcularCOA(gastos, activos.length)
    const tm = calcularTasaMorosidad(morosos.length, activos.length)

    setKpis({ activos: activos.length, tm, coa, ingresos, gastos, torneos: torneos?.length || 0 })
    setKpisAnt({ ingresos: ingresosAnt, gastos: gastosAnt, tm: calcularTasaMorosidad(morososAnt.length, activos.length) })
    setSolicitudes((solicitudesData || []) as SolicitudJugador[])
    setUltimasAsist(asistMes || [])

    setDeudores(morosos.map(m => {
      const jug = jugadores.find(j => j.id === m.jugador_id)
      return {
        id: m.id, jugador_id: m.jugador_id, nombre: jug?.nombre ?? '—',
        telefono: jug?.telefono ?? null, estado: m.estado ?? 'pendiente',
        mes: m.mes, anio: m.anio, monto: m.monto,
      }
    }))
  }

  function trendPct(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  function trendColor(pct: number, invertDanger = false): string {
    if (pct === 0) return '#6c7280'
    if (invertDanger) return pct > 0 ? '#f87171' : '#34d399'
    return pct >= 0 ? '#34d399' : '#f87171'
  }

  function generarWhatsApp(nombre: string, telefono: string, mes: number, anio: number, monto: number): string {
    const mesNombre = CONFIG.MESES[mes - 1] || `mes ${mes}`
    const digits = telefono.replace(/[^0-9]/g, '')
    const tel = digits.startsWith('56') ? digits : digits.startsWith('9') && digits.length === 9 ? '56' + digits : digits
    const msg = encodeURIComponent(`Hola ${nombre}, te recordamos que tu mensualidad de ${mesNombre} ${anio} ($${monto.toLocaleString('es-CL')}) se encuentra pendiente de pago. ¡Cualquier consulta estamos a tu disposición! - Club Union San Bernardo`)
    return `https://wa.me/${tel}?text=${msg}`
  }

  async function handleAprobar(sol: SolicitudJugador) {
    setAprobando(sol.id)
    await aprobarSolicitud(sol.id, perfil?.club_id)
    setSolicitudes(prev => prev.filter(s => s.id !== sol.id))
    setKpis((prev: any) => ({ ...prev, activos: (prev.activos || 0) + 1 }))
    setAprobando(null)
  }

  async function handleRechazar(id: string) {
    setAprobando(id)
    await rechazarSolicitud(id, perfil?.club_id)
    setSolicitudes(prev => prev.filter(s => s.id !== id))
    setAprobando(null)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117' }}>
      <div style={{ color: '#6c7280' }}>Cargando...</div>
    </div>
  )

  const trendIngresos = trendPct(kpis.ingresos || 0, kpisAnt.ingresos || 0)
  const trendGastos = trendPct(kpis.gastos || 0, kpisAnt.gastos || 0)

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 20 }}>Dashboard</h1>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 22 }}>🏓</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#a78bfa', fontVariantNumeric: 'tabular-nums', margin: '8px 0 4px' }}>{kpis.activos || 0}</div>
          <div style={{ fontSize: 12, color: '#6c7280' }}>Jugadores activos</div>
        </div>
        <div style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 22 }}>🎯</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#fbbf24', fontVariantNumeric: 'tabular-nums', margin: '8px 0 4px' }}>{kpis.torneos || 0}</div>
          <div style={{ fontSize: 12, color: '#6c7280' }}>Torneos activos</div>
        </div>
        <div onClick={() => setDdOpen(true)}
          style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 14, padding: 18, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <span style={{ fontSize: 10, color: '#4b5063' }}>↗ ver deudores</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: (kpis.tm || 0) > 25 ? '#f87171' : (kpis.tm || 0) > 10 ? '#fbbf24' : '#34d399', fontVariantNumeric: 'tabular-nums', margin: '8px 0 4px' }}>{kpis.tm || 0}%</div>
          <div style={{ fontSize: 12, color: '#6c7280' }}>Tasa de morosidad</div>
        </div>
        <div style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 22 }}>📈</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#34d399', fontVariantNumeric: 'tabular-nums', margin: '8px 0 4px' }}>{formatCLP(kpis.ingresos || 0)}</div>
          <div style={{ fontSize: 12, color: '#6c7280' }}>Ingresos este mes</div>
          {trendIngresos !== 0 && (
            <div style={{ fontSize: 11, marginTop: 4, color: trendColor(trendIngresos) }}>
              {trendIngresos > 0 ? '+' : ''}{trendIngresos}% vs mes anterior
            </div>
          )}
        </div>
      </div>

      {/* Link inscripción + Solicitudes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>🔗 Link de inscripción</div>
          <div style={{ fontSize: 12, color: '#6c7280', marginBottom: 12 }}>Comparte este link para que los jugadores soliciten unirse al club</div>
          <LinkInvitacion clubId={perfil?.club_id} />
        </div>

        <div style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>📨 Solicitudes pendientes</div>
            {solicitudes.length > 0 && (
              <span style={{ background: '#6c63ff22', color: '#a78bfa', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{solicitudes.length} nuevas</span>
            )}
          </div>
          {solicitudes.length === 0
            ? <p style={{ fontSize: 13, color: '#4b5063', textAlign: 'center', padding: '20px 0' }}>Sin solicitudes pendientes</p>
            : solicitudes.slice(0, 3).map(sol => (
              <div key={sol.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1a1d2e' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#c8cfe0', fontWeight: 500 }}>{sol.nombre}</div>
                  <div style={{ fontSize: 11, color: '#6c7280' }}>{sol.creado_en ? new Date(sol.creado_en).toLocaleDateString('es-CL') : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => handleRechazar(sol.id)} disabled={aprobando === sol.id}
                    style={{ background: '#f8717122', color: '#f87171', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>✕</button>
                  <button onClick={() => handleAprobar(sol)} disabled={aprobando === sol.id}
                    style={{ background: '#6c63ff', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                    {aprobando === sol.id ? '...' : '✓ Aprobar'}
                  </button>
                </div>
              </div>
            ))
          }
          {solicitudes.length > 3 && (
            <a href="/solicitudes" style={{ display: 'block', marginTop: 10, background: 'transparent', border: '1px solid #1e2030', borderRadius: 8, padding: '7px', color: '#6c7280', fontSize: 12, textAlign: 'center', textDecoration: 'none' }}>
              Ver todas en Solicitudes →
            </a>
          )}
        </div>
      </div>

      {/* Últimas asistencias + COA/Gastos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>📅 Últimas asistencias</div>
          {ultimasAsist.length === 0
            ? <p style={{ fontSize: 13, color: '#6c7280', textAlign: 'center', padding: '20px 0' }}>Sin asistencias</p>
            : ultimasAsist.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #1a1d2e', fontSize: 13 }}>
                <span style={{ color: '#c8cfe0' }}>{(a as any).jugadores?.nombre || '—'}</span>
                <span style={{ color: '#6c7280', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{a.fecha}</span>
              </div>
            ))
          }
        </div>
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 14 }}>
          <div style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 22 }}>💰</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: (kpis.coa || 0) > CONFIG.MENSUALIDAD_BASE ? '#f87171' : '#34d399', fontVariantNumeric: 'tabular-nums', margin: '6px 0 4px' }}>{formatCLP(kpis.coa || 0)}</div>
            <div style={{ fontSize: 12, color: '#6c7280' }}>COA — Costo por alumno</div>
            <div style={{ fontSize: 11, marginTop: 4, color: (kpis.coa || 0) > CONFIG.MENSUALIDAD_BASE ? '#f87171' : '#34d399' }}>
              {(kpis.coa || 0) > CONFIG.MENSUALIDAD_BASE ? '🔴 Pérdida por alumno' : '✓ Margen saludable'}
            </div>
          </div>
          <div style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 22 }}>📉</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#f87171', fontVariantNumeric: 'tabular-nums', margin: '6px 0 4px' }}>{formatCLP(kpis.gastos || 0)}</div>
            <div style={{ fontSize: 12, color: '#6c7280' }}>Gastos este mes</div>
            {trendGastos !== 0 && (
              <div style={{ fontSize: 11, marginTop: 4, color: trendColor(trendGastos, true) }}>
                {trendGastos > 0 ? '+' : ''}{trendGastos}% vs mes anterior
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal deudores con WhatsApp */}
      {ddOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#14161f', border: '1px solid #1e2030', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>⚠️ Deudores ({deudores.length})</div>
              <button onClick={() => setDdOpen(false)} style={{ background: 'transparent', border: 'none', color: '#6c7280', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            {deudores.length === 0
              ? <p style={{ color: '#34d399', textAlign: 'center', padding: 20 }}>✓ Sin deudores</p>
              : deudores.map((d: any) => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2030' }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#c8cfe0', fontWeight: 500 }}>{d.nombre}</div>
                    <div style={{ fontSize: 11, color: '#6c7280', marginTop: 2 }}>
                      <span style={{ background: d.estado === 'atrasado' ? '#f8717122' : '#fbbf2422', color: d.estado === 'atrasado' ? '#f87171' : '#fbbf24', padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>{d.estado}</span>
                      {' '}{CONFIG.MESES[d.mes - 1]} {d.anio}
                    </div>
                  </div>
                  {d.telefono && (
                    <a href={generarWhatsApp(d.nombre, d.telefono, d.mes, d.anio, d.monto ?? CONFIG.MENSUALIDAD_BASE)} target="_blank" rel="noopener noreferrer"
                      style={{ background: '#0a2d1a', color: '#34d399', padding: '5px 10px', borderRadius: 8, fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
                      💬 WhatsApp
                    </a>
                  )}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </AppLayout>
  )
}

function LinkInvitacion({ clubId }: { clubId: string }) {
  const [link, setLink] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!clubId) return
    async function cargar() {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      let { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
      if (!inv?.length) {
        await supabase.from('invitaciones').insert({ club_id: clubId })
        const { data: newInv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
        inv = newInv
      }
      const codigo = inv?.[0]?.codigo || ''
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://cmsports-next.vercel.app'
      setLink(`${origin}/registro?club=${clubId}&code=${codigo}`)
    }
    cargar()
  }, [clubId])

  function copiar() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div>
      <div style={{ background: '#0a0c12', border: '1px solid #1e2030', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: '#a78bfa', wordBreak: 'break-all', marginBottom: 8 }}>
        {link || 'Cargando...'}
      </div>
      <button onClick={copiar} style={{ width: '100%', background: copiado ? '#34d39922' : '#1e1b4b', color: copiado ? '#34d399' : '#a78bfa', border: '1px solid #1e2030', borderRadius: 8, padding: '9px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
        {copiado ? '✓ Copiado!' : '📋 Copiar link'}
      </button>
    </div>
  )
}
