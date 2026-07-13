'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wallet, TrendingUp, AlertTriangle, CheckCircle2, Pencil, Receipt } from 'lucide-react'
import { actualizarPlanClub, registrarPagoClub, actualizarEstadoPagoClub } from '@/app/actions/superadmin'
import { useClubesSuperadmin } from '../layout'
import { formatCLP } from '@/lib/domain/finanzas'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12 } as const

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  pagado: { bg: '#dcfce7', fg: '#16a34a' },
  pendiente: { bg: '#fef3c7', fg: '#d97706' },
  atrasado: { bg: '#fee2e2', fg: '#dc2626' },
}

export default function FinanzasSuperadminPage() {
  const { clubes, loading: loadingClubes, recargar: recargarClubes } = useClubesSuperadmin()
  const [pagos, setPagos] = useState<any[]>([])
  const [loadingPagos, setLoadingPagos] = useState(true)
  const [editandoPlan, setEditandoPlan] = useState<string | null>(null)
  const [planValor, setPlanValor] = useState('')
  const [modalPago, setModalPago] = useState<{ clubId: string; nombre: string } | null>(null)
  const [pagoForm, setPagoForm] = useState({ monto: '', mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), metodo: 'transferencia', notas: '' })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargarPagos() }, [])

  async function cargarPagos() {
    setLoadingPagos(true)
    const { data: p } = await supabase.from('pagos_clubes').select('*, clubes(nombre)').order('fecha_pago', { ascending: false }).limit(10)
    setPagos(p || [])
    setLoadingPagos(false)
  }

  async function guardarPlan(clubId: string) {
    const monto = Number(planValor) || 0
    await actualizarPlanClub({ clubId, planMensual: monto })
    setEditandoPlan(null)
    await recargarClubes()
  }

  async function cambiarEstado(clubId: string, estado: 'pagado' | 'pendiente' | 'atrasado') {
    await actualizarEstadoPagoClub({ clubId, estado })
    await recargarClubes()
  }

  async function confirmarPago() {
    if (!modalPago || !pagoForm.monto) return
    setGuardando(true)
    await registrarPagoClub({
      clubId: modalPago.clubId,
      monto: Number(pagoForm.monto),
      periodoMes: pagoForm.mes,
      periodoAnio: pagoForm.anio,
      metodo: pagoForm.metodo,
      notas: pagoForm.notas,
    })
    setGuardando(false)
    setModalPago(null)
    setPagoForm({ monto: '', mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), metodo: 'transferencia', notas: '' })
    await Promise.all([cargarPagos(), recargarClubes()])
  }

  const loading = loadingClubes || loadingPagos
  if (loading) return <div style={{ color: '#94a3b8', fontSize: 14, padding: 24 }}>Cargando...</div>

  const mrr = clubes.reduce((a, c) => a + (c.plan_mensual || 0), 0)
  const cobradoEsteMes = pagos
    .filter(p => p.periodo_mes === new Date().getMonth() + 1 && p.periodo_anio === new Date().getFullYear())
    .reduce((a, p) => a + p.monto, 0)
  const atrasados = clubes.filter(c => c.estado_pago === 'atrasado').length
  const alDia = clubes.filter(c => c.estado_pago === 'pagado').length

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Finanzas</h1>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Ingresos de CmSports por suscripción de cada club</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'MRR total', value: formatCLP(mrr), icon: Wallet, color: '#4f46e5' },
          { label: 'Cobrado este mes', value: formatCLP(cobradoEsteMes), icon: TrendingUp, color: '#16a34a' },
          { label: 'Clubes al día', value: `${alDia}/${clubes.length}`, icon: CheckCircle2, color: '#0891b2' },
          { label: 'Clubes atrasados', value: atrasados, icon: AlertTriangle, color: '#dc2626' },
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
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: 11, color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '8px 18px' }}>Club</th>
              <th style={{ padding: '8px 18px' }}>Plan mensual</th>
              <th style={{ padding: '8px 18px' }}>Estado</th>
              <th style={{ padding: '8px 18px' }}></th>
            </tr>
          </thead>
          <tbody>
            {clubes.map(c => {
              const estadoStyle = ESTADO_COLOR[c.estado_pago] || ESTADO_COLOR.pendiente
              return (
                <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9', fontSize: 13 }}>
                  <td style={{ padding: '10px 18px', color: '#0f172a', fontWeight: 500 }}>{c.nombre}</td>
                  <td style={{ padding: '10px 18px' }}>
                    {editandoPlan === c.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input autoFocus type="number" value={planValor} onChange={e => setPlanValor(e.target.value)}
                          style={{ width: 100, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} />
                        <button onClick={() => guardarPlan(c.id)} style={{ fontSize: 12, color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer' }}>Guardar</button>
                      </div>
                    ) : (
                      <span onClick={() => { setEditandoPlan(c.id); setPlanValor(String(c.plan_mensual || 0)) }} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {c.plan_mensual > 0 ? formatCLP(c.plan_mensual) : 'Por definir'} <Pencil size={11} color="#94a3b8" />
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 18px' }}>
                    <select value={c.estado_pago} onChange={e => cambiarEstado(c.id, e.target.value as any)} style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: 'none',
                      background: estadoStyle.bg, color: estadoStyle.fg, cursor: 'pointer',
                    }}>
                      <option value="pagado">Pagado</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="atrasado">Atrasado</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                    <button onClick={() => setModalPago({ clubId: c.id, nombre: c.nombre })} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 12, color: '#4f46e5', background: 'none', border: '1px solid #e2e8f0',
                      borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                    }}>
                      <Receipt size={12} /> Registrar pago
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
