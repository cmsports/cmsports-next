'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wallet, TrendingUp, AlertTriangle, CheckCircle2, Pencil, Receipt } from 'lucide-react'
import { actualizarPlanClub, registrarPagoClub } from '@/app/actions/superadmin'
import { useClubesSuperadmin } from '../layout'
import { formatCLP } from '@/lib/domain/finanzas'
import { planVencido, type EstadoPlan } from '@/lib/domain/suscripciones'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12 } as const

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  pagado: { bg: '#dcfce7', fg: '#16a34a' },
  pendiente: { bg: '#fef3c7', fg: '#d97706' },
  atrasado: { bg: '#fee2e2', fg: '#dc2626' },
}

const PLAN_COLOR: Record<EstadoPlan, { bg: string; fg: string; label: string }> = {
  prueba: { bg: '#e0e7ff', fg: '#4338ca', label: 'Prueba' },
  activo: { bg: '#dcfce7', fg: '#15803d', label: 'Activo' },
  suspendido: { bg: '#fef3c7', fg: '#b45309', label: 'Suspendido' },
  cancelado: { bg: '#fee2e2', fg: '#b91c1c', label: 'Cancelado' },
}

export default function FinanzasSuperadminPage() {
  const { clubes, loading: loadingClubes, recargar: recargarClubes } = useClubesSuperadmin()
  const [pagos, setPagos] = useState<any[]>([])
  const [loadingPagos, setLoadingPagos] = useState(true)
  const [editandoPlan, setEditandoPlan] = useState<string | null>(null)
  const [planForm, setPlanForm] = useState<{ monto: string; estado: EstadoPlan; fechaInicio: string }>({ monto: '', estado: 'prueba', fechaInicio: '' })
  const [modalPago, setModalPago] = useState<{ clubId: string; nombre: string } | null>(null)
  const [pagoForm, setPagoForm] = useState({ monto: '', mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), metodo: 'transferencia', notas: '' })
  const [guardando, setGuardando] = useState(false)
  const [cobradoEsteMes, setCobradoEsteMes] = useState(0)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { cargarPagos() }, [])

  async function cargarPagos() {
    setLoadingPagos(true)
    const ahora = new Date()
    const [{ data: p }, { data: pagosMes }] = await Promise.all([
      supabase.from('pagos_clubes').select('*, clubes(nombre)').order('fecha_pago', { ascending: false }).limit(10),
      supabase.from('pagos_clubes').select('monto').eq('periodo_mes', ahora.getMonth() + 1).eq('periodo_anio', ahora.getFullYear()),
    ])
    setPagos(p || [])
    setCobradoEsteMes((pagosMes || []).reduce((total, pago) => total + Number(pago.monto || 0), 0))
    setLoadingPagos(false)
  }

  async function guardarPlan(clubId: string) {
    setGuardando(true)
    setError('')
    setMensaje('')
    const res = await actualizarPlanClub({
      clubId,
      planMensual: Number(planForm.monto) || 0,
      estadoPlan: planForm.estado,
      fechaInicioPlan: planForm.fechaInicio || null,
    })
    setGuardando(false)
    if (res?.error) { setError(res.error); return }
    setEditandoPlan(null)
    await recargarClubes()
    setMensaje('Plan actualizado correctamente.')
  }

  function abrirPago(club: any) {
    const fecha = club.proximo_vencimiento ? new Date(`${club.proximo_vencimiento}T12:00:00`) : new Date()
    setPagoForm({
      monto: String(club.plan_mensual || ''),
      mes: fecha.getMonth() + 1,
      anio: fecha.getFullYear(),
      metodo: 'transferencia',
      notas: '',
    })
    setError('')
    setModalPago({ clubId: club.id, nombre: club.nombre })
  }

  async function confirmarPago() {
    if (!modalPago || !pagoForm.monto) return
    setGuardando(true)
    setError('')
    setMensaje('')
    const res = await registrarPagoClub({
      clubId: modalPago.clubId,
      monto: Number(pagoForm.monto),
      periodoMes: pagoForm.mes,
      periodoAnio: pagoForm.anio,
      metodo: pagoForm.metodo,
      notas: pagoForm.notas,
    })
    setGuardando(false)
    if (res?.error) { setError(res.error); return }
    setModalPago(null)
    setPagoForm({ monto: '', mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), metodo: 'transferencia', notas: '' })
    await Promise.all([cargarPagos(), recargarClubes()])
    setMensaje('Pago confirmado. El próximo vencimiento fue actualizado.')
  }

  const loading = loadingClubes || loadingPagos
  if (loading) return <div style={{ color: '#94a3b8', fontSize: 14, padding: 24 }}>Cargando...</div>

  const mrr = clubes.reduce((a, c) => a + (c.plan_mensual || 0), 0)
  const vencidos = clubes.filter(c => planVencido(c.estado_plan, c.proximo_vencimiento)).length
  const activos = clubes.filter(c => c.estado_plan === 'activo').length

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Finanzas</h1>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Ingresos de CmSports por suscripción de cada club</p>
      </div>

      {mensaje && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#dcfce7', color: '#15803d', fontSize: 13 }}>{mensaje}</div>}
      {error && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'MRR total', value: formatCLP(mrr), icon: Wallet, color: '#4f46e5' },
          { label: 'Cobrado este mes', value: formatCLP(cobradoEsteMes), icon: TrendingUp, color: '#16a34a' },
          { label: 'Planes activos', value: `${activos}/${clubes.length}`, icon: CheckCircle2, color: '#0891b2' },
          { label: 'Pagos vencidos', value: vencidos, icon: AlertTriangle, color: '#dc2626' },
        ].map(m => (
          <div key={m.label} style={{ ...card, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <m.icon size={15} color={m.color} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{m.label}</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#0f172a' }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
          Suscripción por club
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr style={{ fontSize: 11, color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '8px 18px' }}>Club</th><th style={{ padding: '8px 18px' }}>Plan mensual</th>
              <th style={{ padding: '8px 18px' }}>Plan e inicio</th><th style={{ padding: '8px 18px' }}>Próximo vencimiento</th>
              <th style={{ padding: '8px 18px' }}>Cobro</th><th style={{ padding: '8px 18px' }}></th>
            </tr></thead>
            <tbody>{clubes.map(c => {
              const vencido = planVencido(c.estado_plan, c.proximo_vencimiento)
              const estadoPlan = (c.estado_plan || 'prueba') as EstadoPlan
              const planStyle = PLAN_COLOR[estadoPlan] || PLAN_COLOR.prueba
              const cobroStyle = vencido ? ESTADO_COLOR.atrasado : ESTADO_COLOR.pagado
              const editando = editandoPlan === c.id
              return <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9', fontSize: 13, background: vencido ? '#fff7ed' : '#fff' }}>
                <td style={{ padding: '10px 18px', color: '#0f172a', fontWeight: 500 }}>{c.nombre}</td>
                <td style={{ padding: '10px 18px' }}>{editando ?
                  <input autoFocus type="number" min="0" value={planForm.monto} onChange={e => setPlanForm({ ...planForm, monto: e.target.value })} style={{ width: 105, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} /> :
                  <button onClick={() => { setError(''); setEditandoPlan(c.id); setPlanForm({ monto: String(c.plan_mensual || 0), estado: estadoPlan, fechaInicio: c.fecha_inicio_plan || '' }) }} style={{ border: 0, background: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {c.plan_mensual > 0 ? formatCLP(c.plan_mensual) : 'Por definir'} <Pencil size={11} color="#94a3b8" />
                  </button>}
                </td>
                <td style={{ padding: '10px 18px' }}>{editando ? <div style={{ display: 'grid', gap: 5 }}>
                  <select value={planForm.estado} onChange={e => setPlanForm({ ...planForm, estado: e.target.value as EstadoPlan })} style={{ padding: '5px 7px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11 }}>
                    <option value="prueba">Prueba</option><option value="activo">Activo</option><option value="suspendido">Suspendido</option><option value="cancelado">Cancelado</option>
                  </select>
                  <input type="date" value={planForm.fechaInicio} onChange={e => setPlanForm({ ...planForm, fechaInicio: e.target.value })} disabled={planForm.estado !== 'activo'} style={{ padding: '5px 7px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11 }} />
                </div> : <div><span style={{ background: planStyle.bg, color: planStyle.fg, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{planStyle.label}</span>
                  {c.fecha_inicio_plan && <div style={{ marginTop: 5, color: '#64748b', fontSize: 11 }}>Desde {new Date(`${c.fecha_inicio_plan}T12:00:00`).toLocaleDateString('es-CL')}</div>}</div>}
                </td>
                <td style={{ padding: '10px 18px', color: vencido ? '#b91c1c' : '#64748b', fontWeight: vencido ? 700 : 400 }}>{c.proximo_vencimiento ? new Date(`${c.proximo_vencimiento}T12:00:00`).toLocaleDateString('es-CL') : '—'}</td>
                <td style={{ padding: '10px 18px' }}><span style={{ background: cobroStyle.bg, color: cobroStyle.fg, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{vencido ? 'Pago pendiente' : estadoPlan === 'activo' ? 'Al día' : 'Sin cobro'}</span></td>
                <td style={{ padding: '10px 18px', textAlign: 'right' }}>{editando ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button onClick={() => setEditandoPlan(null)} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={() => guardarPlan(c.id)} disabled={guardando} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: 0, background: '#4f46e5', color: '#fff', cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Guardar'}</button>
                </div> : <button onClick={() => abrirPago(c)} disabled={estadoPlan !== 'activo'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#4f46e5', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', cursor: estadoPlan === 'activo' ? 'pointer' : 'not-allowed', opacity: estadoPlan === 'activo' ? 1 : 0.45 }}><Receipt size={12} /> Registrar pago</button>}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
          Últimos pagos recibidos
        </div>
        {pagos.length === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: '#94a3b8' }}>Aún no hay pagos registrados.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {pagos.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9', fontSize: 13 }}>
                  <td style={{ padding: '10px 18px', color: '#0f172a', fontWeight: 500 }}>{p.clubes?.nombre || '—'}</td>
                  <td style={{ padding: '10px 18px', color: '#64748b' }}>{MESES[p.periodo_mes - 1]} {p.periodo_anio}</td>
                  <td style={{ padding: '10px 18px', color: '#64748b' }}>{p.metodo || '—'}</td>
                  <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{formatCLP(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalPago && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => setModalPago(null)}>
          <div style={{ ...card, padding: 20, width: 360 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Registrar pago</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>{modalPago.nombre}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Monto (CLP)" type="number" value={pagoForm.monto}
                onChange={e => setPagoForm({ ...pagoForm, monto: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={pagoForm.mes} onChange={e => setPagoForm({ ...pagoForm, mes: Number(e.target.value) })}
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }}>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <input type="number" value={pagoForm.anio} onChange={e => setPagoForm({ ...pagoForm, anio: Number(e.target.value) })}
                  style={{ width: 90, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              </div>
              <select value={pagoForm.metodo} onChange={e => setPagoForm({ ...pagoForm, metodo: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }}>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="otro">Otro</option>
              </select>
              <input placeholder="Notas (opcional)" value={pagoForm.notas}
                onChange={e => setPagoForm({ ...pagoForm, notas: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModalPago(null)} style={{
                flex: 1, padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 7, fontSize: 12, color: '#64748b', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={confirmarPago} disabled={guardando} style={{
                flex: 1, padding: '8px', background: '#4f46e5', border: 'none',
                borderRadius: 7, fontSize: 12, color: '#fff', cursor: 'pointer', opacity: guardando ? 0.6 : 1,
              }}>{guardando ? 'Guardando...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
