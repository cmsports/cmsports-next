'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { copiarTexto } from '@/lib/clipboard'
import { obtenerLinkInvitacion } from '../actions/dashboard'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import GraficoAsistencia from '@/components/GraficoAsistencia'
import { useModulos } from '@/lib/hooks/useModulos'
import {
  Users, TrendingUp, AlertTriangle, DollarSign,
  Link2, Mail, X, HelpCircle, Copy, Check, UserX,
} from 'lucide-react'

const supabase = createClient()

/* ── colores del nuevo tema ── */
const C = {
  bg:      '#f1f5f9',
  card:    '#ffffff',
  border:  '#e2e8f0',
  text:    '#0f172a',
  muted:   '#64748b',
  hint:    '#94a3b8',
  sky:     '#4f46e5',
  skyL:    '#ede9fe',
  skyD:    '#3730a3',
  orange:  '#f43f5e',
  orangeL: '#fff7ed',
  orangeD: '#c2410c',
  green:   '#16a34a',
  greenL:  '#f0fdf4',
  red:     '#dc2626',
  redL:    '#fef2f2',
  yellow:  '#d97706',
  yellowL: '#fffbeb',
  divider: '#1e2030',
}

const catLabelGasto: Record<string, string> = {
  sueldo_profesor: 'Sueldo profesor', sueldo_staff: 'Sueldo staff',
  arriendo_cancha: 'Arriendo cancha', material_deportivo: 'Material deportivo',
  servicios_basicos: 'Servicios básicos', mantenimiento: 'Mantenimiento', otro_gasto: 'Otro gasto',
}

const dashboardCache: Record<string, {
  kpis?: any
  solicitudes?: any[]
  desgloseGastos?: { categoria: string; monto: number }[]
  jugadoresInactivos?: any[]
}> = {}

const linkCache: Record<string, string> = {}

function scheduleIdle(cb: () => void) {
  if (typeof window === 'undefined') return cb()
  const ric = (window as any).requestIdleCallback
  if (typeof ric === 'function') {
    const id = ric(cb, { timeout: 1200 })
    return () => (window as any).cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(cb, 200)
  return () => window.clearTimeout(id)
}

export default function DashboardPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const { tiene } = useModulos()
  const [kpis, setKpis]                           = useState<any>({})
  const [solicitudes, setSolicitudes]             = useState<any[]>([])
  const [jugadoresInactivos, setJugadoresInactivos] = useState<any[]>([])
  const [desgloseGastos, setDesgloseGastos]       = useState<{ categoria: string; monto: number }[]>([])
  const [loading, setLoading]       = useState(true)
  const [ddOpen, setDdOpen]         = useState(false)
  const [retencionOpen, setRetencionOpen] = useState(false)
  const [tooltip, setTooltip]       = useState<string | null>(null)
  const router = useRouter()

  async function cargarDesgloseGastos(cid: string) {
    const mesActual  = new Date().getMonth() + 1
    const anioActual = new Date().getFullYear()
    const mesInicio  = `${anioActual}-${String(mesActual).padStart(2, '0')}-01`
    const ultimoDia  = new Date(anioActual, mesActual, 0).getDate()
    const mesFin     = `${anioActual}-${String(mesActual).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`

    const { data } = await supabase.from('movimientos').select('categoria,monto').eq('club_id', cid).eq('tipo', 'gasto').gte('fecha', mesInicio).lte('fecha', mesFin)

    const agrupado: Record<string, number> = {}
    ;(data || []).forEach((m: any) => { agrupado[m.categoria] = (agrupado[m.categoria] || 0) + m.monto })
    const desglose = Object.entries(agrupado).map(([categoria, monto]) => ({ categoria, monto })).sort((a, b) => b.monto - a.monto)
    dashboardCache[cid] = { ...dashboardCache[cid], desgloseGastos: desglose }
    setDesgloseGastos(desglose)
  }

  async function cargarDatos(cid: string) {
    const [{ data: clubData }, { data: rpc, error: rpcError }] = await Promise.all([
      supabase.from('clubes').select('mensualidad_base').eq('id', cid).single(),
      supabase.rpc('dashboard_kpis', { p_club_id: cid }),
    ])
    const mensualidadBase = clubData?.mensualidad_base ?? 25000

    if (!rpcError && rpc) {
      const activos      = rpc.jugadores_activos   || 0
      const ingresos     = rpc.ingresos            || 0
      const gastos       = rpc.gastos              || 0
      const ingresosPrev = rpc.ingresos_anterior   || 0
      const gastosPrev   = rpc.gastos_anterior     || 0

      const utilidadPorAlumno     = activos > 0 ? Math.round((ingresos - gastos)         / activos) : 0
      const ingresoPorAlumno      = activos > 0 ? Math.round(ingresos                    / activos) : 0
      const costoPorAlumno        = activos > 0 ? Math.round(gastos                      / activos) : 0
      const utilidadPrevPorAlumno = activos > 0 ? Math.round((ingresosPrev - gastosPrev) / activos) : 0
      const variacionUtilidad     = utilidadPrevPorAlumno !== 0
        ? Math.round(((utilidadPorAlumno - utilidadPrevPorAlumno) / Math.abs(utilidadPrevPorAlumno)) * 100)
        : null

      const kpisData = { activos, tm: rpc.tasa_morosidad || 0, coa: rpc.coa || 0, ingresos, gastos, morosos: rpc.morosos_lista || [], mensualidadBase, utilidadPorAlumno, ingresoPorAlumno, costoPorAlumno, variacionUtilidad }
      const solicitudesData = rpc.solicitudes_lista || []
      dashboardCache[cid] = { ...dashboardCache[cid], kpis: kpisData, solicitudes: solicitudesData }
      setKpis(kpisData)
      setSolicitudes(solicitudesData)
      return
    }

    // Fallback: queries directos si el RPC no está disponible
    const mesActual     = new Date().getMonth() + 1
    const anioActual    = new Date().getFullYear()
    const mesInicio     = `${anioActual}-${String(mesActual).padStart(2,'0')}-01`
    const mesPrev       = mesActual === 1 ? 12 : mesActual - 1
    const anioPrev      = mesActual === 1 ? anioActual - 1 : anioActual
    const mesInicioPrev = `${anioPrev}-${String(mesPrev).padStart(2,'0')}-01`

    const [
      { data: jugsData },
      { data: mensualidades },
      { data: movimientos },
      { data: solicitudesData },
      { data: movimientosPrev },
    ] = await Promise.all([
      supabase.from('jugadores').select('id,nombre,telefono,estado').eq('club_id', cid).neq('es_externo', true),
      supabase.from('mensualidades').select('id,jugador_id,estado').eq('club_id', cid).eq('mes', mesActual).eq('anio', anioActual),
      supabase.from('movimientos').select('tipo,monto').eq('club_id', cid).gte('fecha', mesInicio),
      supabase.from('solicitudes_jugador').select('id,nombre,creado_en').eq('club_id', cid).eq('estado', 'pendiente'),
      supabase.from('movimientos').select('tipo,monto').eq('club_id', cid).gte('fecha', mesInicioPrev).lt('fecha', mesInicio),
    ])

    const activos      = (jugsData || []).filter(j => j.estado === 'activo')
    const morosos      = (mensualidades || []).filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
    const gastos       = (movimientos || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0) || 0
    const ingresos     = (movimientos || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0) || 0
    const gastosPrev   = (movimientosPrev || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0) || 0
    const ingresosPrev = (movimientosPrev || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0) || 0

    const coa                = activos.length > 0 ? Math.round(gastos / activos.length) : 0
    const tm                 = activos.length > 0 ? Math.round((morosos.length / activos.length) * 100) : 0
    const utilidadPorAlumno  = activos.length > 0 ? Math.round((ingresos - gastos) / activos.length) : 0
    const ingresoPorAlumno   = activos.length > 0 ? Math.round(ingresos / activos.length) : 0
    const costoPorAlumno     = activos.length > 0 ? Math.round(gastos / activos.length) : 0
    const utilidadPrevPorAlumno = activos.length > 0 ? Math.round((ingresosPrev - gastosPrev) / activos.length) : 0
    const variacionUtilidad  = utilidadPrevPorAlumno !== 0
      ? Math.round(((utilidadPorAlumno - utilidadPrevPorAlumno) / Math.abs(utilidadPrevPorAlumno)) * 100)
      : null

    const activosPorId = new Map(activos.map(j => [j.id, j]))
    const morosasConNombre = morosos.map(m => ({ ...m, nombre: activosPorId.get(m.jugador_id)?.nombre || '—', telefono: activosPorId.get(m.jugador_id)?.telefono || '' }))
    const kpisData = { activos: activos.length, tm, coa, ingresos, gastos, morosos: morosasConNombre, mensualidadBase, utilidadPorAlumno, ingresoPorAlumno, costoPorAlumno, variacionUtilidad }
    dashboardCache[cid] = { ...dashboardCache[cid], kpis: kpisData, solicitudes: solicitudesData || [] }
    setKpis(kpisData)
    setSolicitudes(solicitudesData || [])
  }

  async function cargarInactivos(cid: string) {
    const hoy   = new Date()
    const limite = new Date(hoy)
    limite.setDate(limite.getDate() - 14)
    const limiteFecha = limite.toISOString().split('T')[0]

    const hace30 = new Date()
    hace30.setDate(hace30.getDate() - 30)
    const desde30 = hace30.toISOString().split('T')[0]

    const [{ data: jugsActivos }, { data: asistencias }] = await Promise.all([
      supabase.from('jugadores').select('id, nombre, telefono').eq('club_id', cid).eq('estado', 'activo').neq('es_externo', true),
      supabase.from('asistencia').select('jugador_id, fecha').eq('club_id', cid).gte('fecha', desde30).order('fecha', { ascending: false }),
    ])

    // última asistencia por jugador
    const ultimaPor = new Map<string, string>()
    for (const a of (asistencias || [])) {
      if (!ultimaPor.has(a.jugador_id)) ultimaPor.set(a.jugador_id, a.fecha)
    }

    const inactivos = (jugsActivos || [])
      .filter(j => {
        const ultima = ultimaPor.get(j.id)
        if (!ultima) return true                    // nunca asistió
        return ultima < limiteFecha                 // última asistencia hace 14+ días
      })
      .map(j => {
        const ultima = ultimaPor.get(j.id) || null
        const dias   = ultima
          ? Math.floor((hoy.getTime() - new Date(ultima).getTime()) / (1000 * 60 * 60 * 24))
          : null
        return { ...j, ultimaAsistencia: ultima, diasSinVenir: dias }
      })
      .sort((a, b) => {
        if (a.diasSinVenir === null) return -1
        if (b.diasSinVenir === null) return 1
        return (b.diasSinVenir ?? 0) - (a.diasSinVenir ?? 0)
      })

    dashboardCache[cid] = { ...dashboardCache[cid], jugadoresInactivos: inactivos }
    setJugadoresInactivos(inactivos)
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.rol === 'jugador')  { router.push('/perfil'); return }
    if (perfil.rol === 'profesor') { router.push('/dashboard-profesor'); return }
    if (!perfil.club_id) return

    const clubId = perfil.club_id
    const cached = dashboardCache[clubId]
    if (cached) {
      scheduleIdle(() => {
        if (cached.kpis) setKpis(cached.kpis)
        if (cached.solicitudes) setSolicitudes(cached.solicitudes)
        if (cached.desgloseGastos) setDesgloseGastos(cached.desgloseGastos)
        if (cached.jugadoresInactivos) setJugadoresInactivos(cached.jugadoresInactivos)
        setLoading(false)
      })
    }

    let cancelado = false
    const cancelarCarga = scheduleIdle(() => {
      void cargarDatos(clubId).then(() => {
        if (!cancelado) setLoading(false)
        scheduleIdle(() => {
          if (!cancelado) {
            void cargarDesgloseGastos(clubId)
            void cargarInactivos(clubId)
          }
        })
      })
    })
    return () => {
      cancelado = true
      if (typeof cancelarCarga === 'function') cancelarCarga()
    }
  }, [authLoading, perfil, router])

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  if (authLoading || (Boolean(perfil?.club_id) && loading)) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ color: C.hint, fontSize: 14 }}>Cargando...</div>
    </div>
  )

  const tmColor = (kpis.tm || 0) > 25 ? C.red : (kpis.tm || 0) > 10 ? C.yellow : C.green
  const tmBg    = (kpis.tm || 0) > 25 ? C.redL : (kpis.tm || 0) > 10 ? C.yellowL : C.greenL

  const initials = perfil?.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'U'
  const rolLabel = perfil?.rol === 'superadmin' ? 'Superadmin' : perfil?.rol === 'admin' ? 'Administrador' : perfil?.rol === 'profesor' ? 'Profesor' : 'Jugador'

  return (
    <AppLayout perfil={perfil}>
      {/* ── Cabecera ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 2 }}>Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <p style={{ fontSize: 12, color: C.hint }}>
              {new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
            </p>
            <a href="https://wa.me/56975235780" target="_blank" rel="noopener noreferrer" style={{
              fontSize: 11, color: C.hint, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              · Soporte: +569 7523 5780
            </a>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {tiene('asistencia') && jugadoresInactivos.length > 0 && (
            <button onClick={() => setRetencionOpen(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: C.yellow, color: 'white', borderRadius: 8,
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              border: 'none', cursor: 'pointer',
            }}>
              <UserX size={14} />
              Retención
              <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '1px 7px', fontSize: 11 }}>
                {jugadoresInactivos.length}
              </span>
            </button>
          )}
          <Link href="/solicitudes" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: C.orange, color: 'white', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, fontWeight: 500,
            textDecoration: 'none',
          }}>
            <Mail size={14} />
            Solicitudes
            {solicitudes.length > 0 && (
              <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '1px 7px', fontSize: 11 }}>
                {solicitudes.length}
              </span>
            )}
          </Link>
          <div style={{ width: 1, height: 24, background: C.border }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', background: C.skyL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, color: C.skyD, flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{perfil?.nombre || perfil?.email}</div>
              <div style={{ fontSize: 10, color: C.hint }}>{rolLabel}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${1 + (tiene('finanzas') ? 3 : 0)},1fr)`, gap: 14, marginBottom: 16 }}>

        {/* Jugadores activos */}
        <KpiCard
          icon={<Users size={18} color={C.sky} />}
          iconBg={C.skyL}
          label="👥 Jugadores activos"
          value={kpis.activos || 0}
          valueColor={C.text}
          tooltip={tooltip} tooltipId="activos" setTooltip={setTooltip}
          tooltipText="Jugadores con estado activo en el club. No incluye externos ni suspendidos."
        />

        {/* Utilidad por alumno — requiere finanzas */}
        {tiene('finanzas') && (
          <KpiCard
            icon={<TrendingUp size={18} color={(kpis.utilidadPorAlumno || 0) >= 0 ? C.green : C.red} />}
            iconBg={(kpis.utilidadPorAlumno || 0) >= 0 ? C.greenL : C.redL}
            label="📈 Utilidad por alumno"
            value={fmt(kpis.utilidadPorAlumno || 0)}
            valueColor={(kpis.utilidadPorAlumno || 0) >= 0 ? C.green : C.red}
            tooltip={tooltip} tooltipId="utilidad" setTooltip={setTooltip}
            tooltipText={'(Ingresos − Gastos) ÷ Alumnos activos\n\n↑ Sube cuando los ingresos crecen sin aumento proporcional de gastos.\n↓ Baja cuando los gastos aumentan o ingresan alumnos sin generar ingresos.'}
            sub={kpis.variacionUtilidad !== null && kpis.variacionUtilidad !== undefined ? (
              <span style={{ fontSize: 11, color: kpis.variacionUtilidad >= 0 ? C.green : C.red, fontWeight: 500 }}>
                {kpis.variacionUtilidad >= 0 ? '▲' : '▼'} {Math.abs(kpis.variacionUtilidad)}% vs mes anterior
              </span>
            ) : null}
            footer={
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 11, color: C.hint }}>
                  Ingreso prom: <span style={{ color: C.sky, fontWeight: 500 }}>{fmt(kpis.ingresoPorAlumno || 0)}</span>
                </div>
                <div style={{ fontSize: 11, color: C.hint }}>
                  Costo prom: <span style={{ color: C.red, fontWeight: 500 }}>{fmt(kpis.costoPorAlumno || 0)}</span>
                </div>
              </div>
            }
          />
        )}

        {/* Morosidad — requiere mensualidades */}
        {tiene('mensualidades') && (
          <div onClick={() => setDdOpen(true)} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 18, cursor: 'pointer', position: 'relative',
            boxShadow: '0 4px 16px rgba(15,23,42,0.18)', transition: 'box-shadow 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: tmBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={18} color={tmColor} />
              </div>
              <TooltipBtn id="morosidad" tooltip={tooltip} setTooltip={setTooltip}
                texto="% de alumnos activos con mensualidad pendiente o atrasada. <10% saludable, 10–25% atención, >25% crítico. Haz clic para ver deudores." />
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, color: tmColor, fontVariantNumeric: 'tabular-nums' }}>
              {kpis.tm || 0}%
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>⚠️ Tasa de morosidad</div>
            <div style={{ marginTop: 6, fontSize: 11, color: tmColor, fontWeight: 500 }}>
              {(kpis.morosos?.length || 0)} deudores · ver lista →
            </div>
          </div>
        )}

        {/* Ingresos — requiere finanzas */}
        {tiene('finanzas') && (
          <KpiCard
            icon={<DollarSign size={18} color={C.green} />}
            iconBg={C.greenL}
            label="💰 Ingresos este mes"
            value={fmt(kpis.ingresos || 0)}
            valueColor={C.green}
            tooltip={tooltip} tooltipId="ingresos" setTooltip={setTooltip}
            tooltipText="Suma de todos los movimientos de tipo ingreso del mes actual."
          />
        )}
      </div>

      {/* ── Gráfico de asistencia + Gastos ── */}
      {(tiene('asistencia') || tiene('finanzas')) && (
        <div style={{ display: 'grid', gridTemplateColumns: tiene('asistencia') && tiene('finanzas') ? 'repeat(4,1fr)' : '1fr', gap: 14, marginBottom: 16 }}>
          {tiene('asistencia') && (
            <div style={{ gridColumn: tiene('finanzas') ? 'span 3' : 'span 1' }}>
              {perfil?.club_id && <GraficoAsistencia clubId={perfil.club_id} />}
            </div>
          )}
          {tiene('finanzas') && (
            <div style={{ gridColumn: 'span 1', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: C.redL, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <DollarSign size={16} color={C.red} />
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>💸 Gastos este mes</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.red, fontVariantNumeric: 'tabular-nums', marginBottom: 12 }}>
                {fmt(kpis.gastos || 0)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                {desgloseGastos.length === 0 ? (
                  <div style={{ fontSize: 11, color: C.hint }}>Sin gastos registrados este mes</div>
                ) : desgloseGastos.slice(0, 4).map(d => {
                  const pct = (kpis.gastos || 0) > 0 ? Math.round((d.monto / kpis.gastos) * 100) : 0
                  return (
                    <div key={d.categoria}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 3 }}>
                        <span>{catLabelGasto[d.categoria] || d.categoria}</span>
                        <span style={{ fontWeight: 600, color: C.text }}>{fmt(d.monto)}</span>
                      </div>
                      <div style={{ height: 4, background: C.redL, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: C.red, borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Fila 2 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Link de inscripción */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Link2 size={15} color={C.sky} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>🔗 Link de inscripción</span>
          </div>
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
            Comparte este link para que los jugadores soliciten unirse al club
          </p>
          <LinkInvitacion clubId={perfil?.club_id || ''} />
        </div>

        {/* Solicitudes pendientes */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={15} color={C.orange} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>📬 Solicitudes pendientes</span>
            </div>
            {solicitudes.length > 0 && (
              <span style={{ background: C.orangeL, color: C.orangeD, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                {solicitudes.length} nuevas
              </span>
            )}
          </div>
          {solicitudes.length === 0
            ? <p style={{ fontSize: 13, color: C.hint, textAlign: 'center', padding: '20px 0' }}>Sin solicitudes pendientes</p>
            : solicitudes.slice(0, 3).map(sol => (
              <div key={sol.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.skyL, color: C.skyD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  {sol.nombre?.charAt(0) || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{sol.nombre}</div>
                  <div style={{ fontSize: 11, color: C.hint }}>{new Date(sol.creado_en).toLocaleDateString('es-CL')}</div>
                </div>
                <Link href="/solicitudes" style={{ background: C.skyL, color: C.skyD, borderRadius: 6, padding: '4px 10px', fontSize: 11, textDecoration: 'none', fontWeight: 500 }}>Ver →</Link>
              </div>
            ))
          }
          {solicitudes.length > 0 && (
            <Link href="/solicitudes" style={{ display: 'block', marginTop: 12, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px', color: C.muted, fontSize: 12, textAlign: 'center', textDecoration: 'none' }}>
              Ver todas →
            </Link>
          )}
        </div>
      </div>

      {/* ── Modal retención ── */}
      {retencionOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 500, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserX size={16} color={C.yellow} />
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Alerta de retención</span>
                <span style={{ background: C.yellowL, color: C.yellow, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                  {jugadoresInactivos.length} jugadores
                </span>
              </div>
              <button onClick={() => setRetencionOpen(false)} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, borderRadius: 6 }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: C.hint, marginBottom: 14 }}>
              Jugadores activos sin asistencia en los últimos 14 días.
            </p>
            {jugadoresInactivos.map((j: any) => (
              <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.yellowL, color: C.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    {j.nombre?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{j.nombre}</div>
                    <div style={{ fontSize: 11, color: C.hint, marginTop: 1 }}>
                      {j.ultimaAsistencia
                        ? `Última: ${new Date(j.ultimaAsistencia + 'T12:00:00').toLocaleDateString('es-CL')}`
                        : 'Sin asistencias registradas'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: C.yellow, fontWeight: 600, background: C.yellowL, borderRadius: 8, padding: '3px 8px' }}>
                    {j.diasSinVenir !== null ? `${j.diasSinVenir}d` : 'nunca'}
                  </span>
                  {j.telefono && (
                    <a href={`https://wa.me/${j.telefono.replace(/[^0-9]/g, '')}`} target="_blank"
                      style={{ background: C.greenL, color: C.green, padding: '5px 10px', borderRadius: 8, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}>
                      WA →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal deudores ── */}
      {ddOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 500, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} color={tmColor} />
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Deudores</span>
              </div>
              <button onClick={() => setDdOpen(false)} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, borderRadius: 6 }}>
                <X size={18} />
              </button>
            </div>
            {(kpis.morosos?.length || 0) === 0
              ? <p style={{ color: C.green, textAlign: 'center', padding: 20, fontSize: 14 }}>✓ Sin deudores este mes</p>
              : kpis.morosos.map((item: any) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.redL, color: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                        {item.nombre?.charAt(0) || '?'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{item.nombre || '—'}</div>
                        <div style={{ fontSize: 11, color: C.hint, marginTop: 1 }}>{item.estado}</div>
                      </div>
                    </div>
                    {item.telefono && (
                      <a href={`https://wa.me/${item.telefono.replace(/[^0-9]/g, '')}`} target="_blank"
                        style={{ background: C.greenL, color: C.green, padding: '5px 10px', borderRadius: 8, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}>
                        WA →
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

/* ── KpiCard ── */
function KpiCard({ icon, iconBg, label, value, valueColor, tooltip, tooltipId, setTooltip, tooltipText, sub, footer }: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string | number
  valueColor: string
  tooltip: string | null
  tooltipId: string
  setTooltip: (v: string | null) => void
  tooltipText: string
  sub?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, position: 'relative', boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <TooltipBtn id={tooltipId} tooltip={tooltip} setTooltip={setTooltip} texto={tooltipText} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, color: valueColor, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ marginTop: 4 }}>{sub}</div>}
      {footer && <div style={{ marginTop: 8 }}>{footer}</div>}
    </div>
  )
}

/* ── TooltipBtn ── */
function TooltipBtn({ id, texto, tooltip, setTooltip }: {
  id: string
  texto: string
  tooltip: string | null
  setTooltip: (v: string | null) => void
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <button
        onClick={e => e.stopPropagation()}
        onMouseEnter={() => setTooltip(id)}
        onMouseLeave={() => setTooltip(null)}
        style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '50%', color: '#94a3b8', cursor: 'help', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
      >
        <HelpCircle size={12} />
      </button>
      {tooltip === id && (
        <div style={{ position: 'absolute', top: 24, right: 0, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#e2e8f0', zIndex: 50, width: 230, lineHeight: 1.6, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', whiteSpace: 'pre-line' }}>
          {texto}
        </div>
      )}
    </div>
  )
}

/* ── LinkInvitacion ── */
function LinkInvitacion({ clubId }: { clubId: string }) {
  const [linkCargado, setLinkCargado] = useState<{ clubId: string; valor: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const link = linkCache[clubId] || (linkCargado?.clubId === clubId ? linkCargado.valor : '')

  useEffect(() => {
    if (!clubId) return
    if (linkCache[clubId]) return
    async function cargar() {
      const { codigo } = await obtenerLinkInvitacion()
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const invitacion = `${origin}/registro?club=${clubId}&code=${codigo || ''}`
      linkCache[clubId] = invitacion
      setLinkCargado({ clubId, valor: invitacion })
    }
    scheduleIdle(cargar)
  }, [clubId])

  async function copiar() {
    if (!link) return
    const ok = await copiarTexto(link)
    if (!ok) return
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div>
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: '#3730a3', wordBreak: 'break-all', marginBottom: 10 }}>
        {link || 'Generando enlace...'}
      </div>
      <button onClick={copiar} style={{
        width: '100%',
        background: copiado ? '#f0fdf4' : '#ede9fe',
        color: copiado ? '#16a34a' : '#3730a3',
        border: `1px solid ${copiado ? '#bbf7d0' : '#c4b5fd'}`,
        borderRadius: 8, padding: '9px',
        fontSize: 12, cursor: 'pointer', fontWeight: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'all 0.2s',
      }}>
        {copiado ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar link</>}
      </button>
    </div>
  )
}
