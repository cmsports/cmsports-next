'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import {
  Users, TrendingUp, AlertTriangle, DollarSign,
  Link2, Mail, Calendar, Wallet, X, HelpCircle, Copy, Check,
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

export default function DashboardPage() {
  const [perfil, setPerfil]             = useState<any>(null)
  const [kpis, setKpis]                 = useState<any>({})
  const [ultimasAsist, setUltimasAsist] = useState<any[]>([])
  const [solicitudes, setSolicitudes]   = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [ddOpen, setDdOpen]         = useState(false)
  const [tooltip, setTooltip]       = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.rol === 'jugador')  { router.push('/perfil'); return }
      if (p?.rol === 'profesor') { router.push('/dashboard-profesor'); return }
      if (p?.club_id) await cargarDatos(p.club_id)
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarDatos(cid: string) {
    const { data, error } = await supabase.rpc('dashboard_kpis', { p_club_id: cid })
    if (error || !data) return

    const activos    = data.jugadores_activos  || 0
    const ingresos   = data.ingresos           || 0
    const gastos     = data.gastos             || 0
    const ingresosPrev = data.ingresos_anterior || 0
    const gastosPrev   = data.gastos_anterior  || 0

    const utilidadPorAlumno     = activos > 0 ? Math.round((ingresos - gastos)       / activos) : 0
    const ingresoPorAlumno      = activos > 0 ? Math.round(ingresos                  / activos) : 0
    const costoPorAlumno        = activos > 0 ? Math.round(gastos                    / activos) : 0
    const utilidadPrevPorAlumno = activos > 0 ? Math.round((ingresosPrev - gastosPrev) / activos) : 0
    const variacionUtilidad     = utilidadPrevPorAlumno !== 0
      ? Math.round(((utilidadPorAlumno - utilidadPrevPorAlumno) / Math.abs(utilidadPrevPorAlumno)) * 100)
      : null

    setKpis({
      activos,
      tm:              data.tasa_morosidad || 0,
      coa:             data.coa            || 0,
      ingresos,
      gastos,
      morosos:         data.morosos_lista  || [],
      mensualidadBase: 25000,
      utilidadPorAlumno,
      ingresoPorAlumno,
      costoPorAlumno,
      variacionUtilidad,
    })
    setSolicitudes(data.solicitudes_lista || [])
    setUltimasAsist(
      (data.ultimas_asistencias || []).map((a: any) => ({
        id:       a.id,
        fecha:    a.fecha,
        jugadores: { nombre: a.jugador_nombre },
      }))
    )
  }

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ color: C.hint, fontSize: 14 }}>Cargando...</div>
    </div>
  )

  const tmColor = (kpis.tm || 0) > 25 ? C.red : (kpis.tm || 0) > 10 ? C.yellow : C.green
  const tmBg    = (kpis.tm || 0) > 25 ? C.redL : (kpis.tm || 0) > 10 ? C.yellowL : C.greenL
  const coaOk   = (kpis.coa || 0) <= (kpis.mensualidadBase || 25000)

  return (
    <AppLayout perfil={perfil}>
      {/* ── Cabecera ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 2 }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: C.hint }}>
            {new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })} — Club Unión San Bernardo
          </p>
        </div>
        <a href="/solicitudes" style={{
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
        </a>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>

        {/* Jugadores activos */}
        <KpiCard
          icon={<Users size={18} color={C.sky} />}
          iconBg={C.skyL}
          label="Jugadores activos"
          value={kpis.activos || 0}
          valueColor={C.text}
          tooltip={tooltip} tooltipId="activos" setTooltip={setTooltip}
          tooltipText="Jugadores con estado activo en el club. No incluye externos ni suspendidos."
        />

        {/* Utilidad por alumno */}
        <KpiCard
          icon={<TrendingUp size={18} color={(kpis.utilidadPorAlumno || 0) >= 0 ? C.green : C.red} />}
          iconBg={(kpis.utilidadPorAlumno || 0) >= 0 ? C.greenL : C.redL}
          label="Utilidad por alumno"
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

        {/* Morosidad */}
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
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Tasa de morosidad</div>
          <div style={{ marginTop: 6, fontSize: 11, color: tmColor, fontWeight: 500 }}>
            {(kpis.morosos?.length || 0)} deudores · ver lista →
          </div>
        </div>

        {/* Ingresos */}
        <KpiCard
          icon={<DollarSign size={18} color={C.green} />}
          iconBg={C.greenL}
          label="Ingresos este mes"
          value={fmt(kpis.ingresos || 0)}
          valueColor={C.green}
          tooltip={tooltip} tooltipId="ingresos" setTooltip={setTooltip}
          tooltipText="Suma de todos los movimientos de tipo ingreso del mes actual."
        />
      </div>

      {/* ── Fila 2 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Link de inscripción */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Link2 size={15} color={C.sky} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Link de inscripción</span>
          </div>
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
            Comparte este link para que los jugadores soliciten unirse al club
          </p>
          <LinkInvitacion clubId={perfil?.club_id} />
        </div>

        {/* Solicitudes pendientes */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={15} color={C.orange} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Solicitudes pendientes</span>
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
                <a href="/solicitudes" style={{ background: C.skyL, color: C.skyD, borderRadius: 6, padding: '4px 10px', fontSize: 11, textDecoration: 'none', fontWeight: 500 }}>Ver →</a>
              </div>
            ))
          }
          {solicitudes.length > 0 && (
            <a href="/solicitudes" style={{ display: 'block', marginTop: 12, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px', color: C.muted, fontSize: 12, textAlign: 'center', textDecoration: 'none' }}>
              Ver todas →
            </a>
          )}
        </div>
      </div>

      {/* ── Fila 3 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Últimas asistencias */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Calendar size={15} color={C.sky} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Últimas asistencias</span>
          </div>
          {ultimasAsist.length === 0
            ? <p style={{ fontSize: 13, color: C.hint, textAlign: 'center', padding: '20px 0' }}>Sin asistencias este mes</p>
            : ultimasAsist.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: C.text }}>{(a as any).jugadores?.nombre || '—'}</span>
                <span style={{ color: C.hint, fontSize: 12 }}>{a.fecha}</span>
              </div>
            ))
          }
        </div>

        {/* COA + Gastos */}
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 14 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: coaOk ? C.greenL : C.redL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={16} color={coaOk ? C.green : C.red} />
              </div>
              <span style={{ fontSize: 12, color: C.muted }}>COA — Costo por alumno</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: coaOk ? C.green : C.red, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(kpis.coa || 0)}
            </div>
            <div style={{ fontSize: 11, marginTop: 4, color: coaOk ? C.green : C.red, fontWeight: 500 }}>
              {coaOk ? '✓ Margen saludable' : '⚠ Pérdida por alumno'}
            </div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: C.redL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={16} color={C.red} />
              </div>
              <span style={{ fontSize: 12, color: C.muted }}>Gastos este mes</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: C.red, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(kpis.gastos || 0)}
            </div>
          </div>
        </div>
      </div>

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
  const [link, setLink]     = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!clubId) return
    async function cargar() {
      let { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
      if (!inv?.length) {
        await supabase.from('invitaciones').insert({ club_id: clubId })
        const { data: newInv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
        inv = newInv
      }
      const codigo = inv?.[0]?.codigo || ''
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
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
