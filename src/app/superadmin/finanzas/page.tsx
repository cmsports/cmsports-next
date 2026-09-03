'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Scale, Pencil, Receipt, FileDown, Upload, Download, Plus, Trash2 } from 'lucide-react'
import { actualizarPlanClub, registrarPagoClub, registrarGastoCmsports, eliminarGastoCmsports, subirFacturaCmsports, urlFacturaCmsports } from '@/app/actions/superadmin'
import { useClubesSuperadmin } from '../layout'
import { formatCLP } from '@/lib/domain/finanzas'
import { useTextoMonto } from '@/components/Monto'
import { planVencido, metricasPlanes, resumenCmsports, CONCEPTOS, LABEL_CONCEPTO, type EstadoPlan, type ConceptoPago } from '@/lib/domain/suscripciones'
import { fechaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, animation: 'entraTarjeta var(--normal) var(--curva) both' } as const

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Las de siempre, como sugerencia. La columna es texto libre (migración 255):
// esto es un `datalist`, no una lista cerrada.
const CATEGORIAS_GASTO = ['Servidores y hosting', 'Dominio', 'Herramientas y licencias', 'Marketing', 'Contabilidad', 'Equipamiento', 'Traslados', 'Otro']

const ACEPTA_FACTURA = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'

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

const fechaCorta = (iso: string | null) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL') : '—'

type Pago = { id: string; club_id: string; monto: number; periodo_mes: number; periodo_anio: number; fecha_pago: string; metodo: string | null; notas: string | null; concepto: string; factura_path: string | null; factura_nombre: string | null; clubes?: { nombre: string } | null }
type Gasto = { id: string; fecha: string; monto: number; categoria: string; descripcion: string; proveedor: string | null; factura_path: string | null; factura_nombre: string | null }

export default function FinanzasSuperadminPage() {
  // Para lo que se dibuja en pantalla. El PDF sigue usando `formatCLP` directo,
  // más abajo: ahí la cifra va real porque es un documento que se descarga.
  const fmtVista = useTextoMonto()
  const { clubes, loading: loadingClubes, recargar: recargarClubes } = useClubesSuperadmin()
  const [pagos, setPagos] = useState<Pago[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loadingDatos, setLoadingDatos] = useState(true)
  const [editandoPlan, setEditandoPlan] = useState<string | null>(null)
  const [planForm, setPlanForm] = useState<{ monto: string; estado: EstadoPlan; fechaInicio: string }>({ monto: '', estado: 'prueba', fechaInicio: '' })
  const [modalPago, setModalPago] = useState<{ clubId: string; nombre: string } | null>(null)
  const [pagoForm, setPagoForm] = useState({ monto: '', mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), metodo: 'transferencia', notas: '', fecha: fechaChile(), concepto: 'mensualidad' as ConceptoPago })
  const [modalGasto, setModalGasto] = useState(false)
  const [gastoForm, setGastoForm] = useState({ fecha: fechaChile(), monto: '', categoria: '', descripcion: '', proveedor: '' })
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [generandoPDF, setGenerandoPDF] = useState(false)

  // Un solo input de archivo para toda la pantalla: el destino se guarda acá
  // al hacer clic. Uno por fila serían decenas de inputs escondidos.
  const inputArchivo = useRef<HTMLInputElement | null>(null)
  const destinoFactura = useRef<{ tipo: 'pagos' | 'gastos'; id: string } | null>(null)

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    setLoadingDatos(true)
    // Todo el historial, no los últimos diez: el acumulado por club se calcula
    // sobre esto y con una página de pagos daría un total falso. Son unas
    // decenas de filas —cuatro clubes, un pago al mes— y la pantalla la abre
    // una sola persona.
    const [{ data: p }, { data: g }] = await Promise.all([
      supabase.from('pagos_clubes').select('*, clubes(nombre)').order('fecha_pago', { ascending: false }),
      supabase.from('gastos_cmsports').select('*').order('fecha', { ascending: false }),
    ])
    setPagos((p as Pago[]) || [])
    setGastos((g as Gasto[]) || [])
    setLoadingDatos(false)
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

  function abrirPago(club: { id: string; nombre: string; plan_mensual: number; proximo_vencimiento: string | null }) {
    const fecha = club.proximo_vencimiento ? new Date(`${club.proximo_vencimiento}T12:00:00`) : new Date()
    setPagoForm({
      monto: String(club.plan_mensual || ''),
      mes: fecha.getMonth() + 1,
      anio: fecha.getFullYear(),
      metodo: 'transferencia',
      notas: '',
      fecha: fechaChile(),
      concepto: 'mensualidad',
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
      fechaPago: pagoForm.fecha,
      concepto: pagoForm.concepto,
    })
    setGuardando(false)
    if (res?.error) { setError(res.error); return }
    setModalPago(null)
    await Promise.all([cargarDatos(), recargarClubes()])
    setMensaje(pagoForm.concepto === 'mensualidad'
      ? 'Pago registrado. El próximo vencimiento fue actualizado.'
      : 'Pago registrado. No corre el vencimiento: no es una mensualidad.')
  }

  async function confirmarGasto() {
    if (!gastoForm.monto) return
    setGuardando(true)
    setError('')
    setMensaje('')
    const res = await registrarGastoCmsports({
      fecha: gastoForm.fecha,
      monto: Number(gastoForm.monto),
      categoria: gastoForm.categoria,
      descripcion: gastoForm.descripcion,
      proveedor: gastoForm.proveedor,
    })
    setGuardando(false)
    if (res?.error) { setError(res.error); return }
    setModalGasto(false)
    setGastoForm({ fecha: fechaChile(), monto: '', categoria: '', descripcion: '', proveedor: '' })
    await cargarDatos()
    setMensaje('Gasto registrado.')
  }

  async function borrarGasto(gasto: Gasto) {
    if (!confirm(`¿Eliminar el gasto "${gasto.descripcion}" de ${formatCLP(gasto.monto)}?`)) return
    setError('')
    const res = await eliminarGastoCmsports({ gastoId: gasto.id })
    if (res?.error) { setError(res.error); return }
    await cargarDatos()
  }

  function pedirFactura(tipo: 'pagos' | 'gastos', id: string) {
    destinoFactura.current = { tipo, id }
    inputArchivo.current?.click()
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const destino = destinoFactura.current
    e.target.value = ''
    if (!file || !destino) return
    if (file.size > 10 * 1024 * 1024) { setError('El archivo supera los 10 MB'); return }

    setError('')
    setMensaje('')
    setSubiendo(destino.id)
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
      reader.readAsDataURL(file)
    }).catch(() => null)

    if (!base64) { setSubiendo(null); setError('No se pudo leer el archivo'); return }

    const res = await subirFacturaCmsports({ tipo: destino.tipo, id: destino.id, base64, nombreArchivo: file.name })
    setSubiendo(null)
    if (res?.error) { setError(String(res.error)); return }
    await cargarDatos()
    setMensaje('Factura guardada.')
  }

  async function abrirFactura(path: string) {
    // La pestaña se abre YA, dentro del clic, y recién después se le pone la
    // dirección: abrirla al volver del servidor la come el bloqueador de
    // ventanas emergentes.
    const ventana = window.open('', '_blank')
    const res = await urlFacturaCmsports({ path })
    if (res?.error || !res?.url) { ventana?.close(); setError(String(res?.error || 'No se pudo abrir la factura')); return }
    if (ventana) ventana.location.href = res.url
    else window.location.href = res.url
  }

  async function generarReportePDF() {
    setGenerandoPDF(true)
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const W = doc.internal.pageSize.getWidth()
    const fmt = formatCLP
    const hoy = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })

    doc.setFillColor(79, 70, 229); doc.rect(0, 0, W, 32, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text('CmSports — Reporte de Finanzas', 14, 20)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(hoy, W - 14, 20, { align: 'right' })

    let y = 44
    const { mrr: mrrTotal, activos: planesActivos, vencidos: pagosVencidos, totalClubes: totalPDF } = metricasPlanes(clubes)

    doc.setTextColor(40, 40, 40); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
    doc.text('Resumen', 14, y); y += 8
    autoTable(doc, {
      startY: y,
      head: [['Concepto', 'Valor']],
      body: [
        ['Ingresos históricos', fmt(resumen.ingresos)],
        ['Gastos históricos', fmt(resumen.egresos)],
        ['Balance', fmt(resumen.balance)],
        ['MRR total', fmt(mrrTotal)],
        ['Cobrado este mes', fmt(resumen.ingresosMes)],
        ['Gastado este mes', fmt(resumen.egresosMes)],
        ['Planes activos', `${planesActivos} (de ${totalPDF} clubes, el resto en prueba)`],
        ['Pagos vencidos', String(pagosVencidos)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
      margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 12

    doc.setFontSize(13); doc.setFont('helvetica', 'bold')
    doc.text('Suscripción por club', 14, y); y += 8
    autoTable(doc, {
      startY: y,
      head: [['Club', 'Plan mensual', 'Estado plan', 'Próx. vencimiento', 'Total pagado', 'Último pago']],
      body: clubes.map(c => {
        const ep = (c.estado_plan || 'prueba') as EstadoPlan
        const hist = resumen.porClub.get(c.id)
        return [
          c.nombre,
          c.plan_mensual > 0 ? fmt(c.plan_mensual) : 'Por definir',
          PLAN_COLOR[ep]?.label || ep,
          fechaCorta(c.proximo_vencimiento),
          fmt(hist?.total || 0),
          hist?.ultimo ? fechaCorta(hist.ultimo) : '—',
        ]
      }),
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      margin: { left: 14, right: 14 },
      styles: { fontSize: 9 },
    })
    y = (doc as any).lastAutoTable.finalY + 12

    if (pagos.length > 0) {
      doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('Ingresos — historial completo', 14, y); y += 8
      autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Club', 'Concepto', 'Período', 'Método', 'Monto']],
        body: pagos.map(p => [
          fechaCorta(p.fecha_pago),
          p.clubes?.nombre || '—',
          LABEL_CONCEPTO[p.concepto] || p.concepto,
          `${MESES[p.periodo_mes - 1]} ${p.periodo_anio}`,
          p.metodo || '—',
          fmt(p.monto),
        ]),
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9 },
      })
      y = (doc as any).lastAutoTable.finalY + 12
    }

    if (gastos.length > 0) {
      doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('Gastos', 14, y); y += 8
      autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Categoría', 'Descripción', 'Proveedor', 'Monto']],
        body: gastos.map(g => [fechaCorta(g.fecha), g.categoria, g.descripcion, g.proveedor || '—', fmt(g.monto)]),
        theme: 'striped',
        headStyles: { fillColor: [220, 38, 38] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9 },
      })
    }

    doc.save(`CmSports_Finanzas_${fechaChile()}.pdf`)
    setGenerandoPDF(false)
  }

  const resumen = resumenCmsports(pagos, gastos)
  const loading = loadingClubes || loadingDatos
  if (loading) return <div style={{ color: '#94a3b8', fontSize: 14, padding: 24 }}>Cargando...</div>

  const { mrr, vencidos } = metricasPlanes(clubes)

  // Celda de factura, igual para un ingreso y para un gasto.
  const celdaFactura = (tipo: 'pagos' | 'gastos', fila: { id: string; factura_path: string | null; factura_nombre: string | null }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {fila.factura_path ? (
        <>
          <button onClick={() => abrirFactura(fila.factura_path!)} title={fila.factura_nombre || 'Factura'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>
            <Download size={11} /> Descargar
          </button>
          <button onClick={() => pedirFactura(tipo, fila.id)} disabled={subiendo === fila.id} title="Reemplazar"
            style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 6px', color: '#64748b', cursor: 'pointer' }}>
            <Upload size={11} />
          </button>
        </>
      ) : (
        <button onClick={() => pedirFactura(tipo, fila.id)} disabled={subiendo === fila.id}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4f46e5', background: '#fff', border: '1px dashed #c7d2fe', borderRadius: 6, padding: '4px 8px', cursor: subiendo === fila.id ? 'wait' : 'pointer' }}>
          <Upload size={11} /> {subiendo === fila.id ? 'Subiendo…' : 'Subir'}
        </button>
      )}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Finanzas</h1>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>Lo que CmSports cobra a cada club y lo que gasta</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setError(''); setModalGasto(true) }} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: '#fff', color: '#dc2626',
            border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>
            <Plus size={15} /> Registrar gasto
          </button>
          <button onClick={generarReportePDF} disabled={generandoPDF} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            opacity: generandoPDF ? 0.6 : 1,
          }}>
            <FileDown size={15} /> {generandoPDF ? 'Generando...' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      {mensaje && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#dcfce7', color: '#15803d', fontSize: 13 }}>{mensaje}</div>}
      {error && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Ingresos históricos', value: fmtVista(resumen.ingresos), icon: TrendingUp, color: '#16a34a', pie: `${pagos.length} pago${pagos.length === 1 ? '' : 's'} registrado${pagos.length === 1 ? '' : 's'}` },
          { label: 'Gastos históricos', value: fmtVista(resumen.egresos), icon: TrendingDown, color: '#dc2626', pie: `${gastos.length} gasto${gastos.length === 1 ? '' : 's'} registrado${gastos.length === 1 ? '' : 's'}` },
          { label: 'Balance', value: fmtVista(resumen.balance), icon: Scale, color: resumen.balance >= 0 ? '#0891b2' : '#dc2626', pie: 'Ingresos menos gastos' },
          { label: 'MRR total', value: fmtVista(mrr), icon: Wallet, color: '#4f46e5', pie: 'Planes activos al mes' },
          { label: 'Este mes', value: fmtVista(resumen.ingresosMes), icon: TrendingUp, color: '#0891b2', pie: `Gastado: ${fmtVista(resumen.egresosMes)}` },
          { label: 'Pagos vencidos', value: String(vencidos), icon: AlertTriangle, color: '#dc2626', pie: 'Planes activos pasados de fecha' },
        ].map(m => (
          <div key={m.label} style={{ ...card, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <m.icon size={15} color={m.color} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{m.label}</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#0f172a' }}>{m.value}</div>
            <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4 }}>{m.pie}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
          Suscripción por club
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead><tr style={{ fontSize: 11, color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '8px 18px' }}>Club</th><th style={{ padding: '8px 18px' }}>Plan mensual</th>
              <th style={{ padding: '8px 18px' }}>Plan e inicio</th><th style={{ padding: '8px 18px' }}>Próximo vencimiento</th>
              <th style={{ padding: '8px 18px' }}>Total pagado</th>
              <th style={{ padding: '8px 18px' }}>Cobro</th><th style={{ padding: '8px 18px' }}></th>
            </tr></thead>
            <tbody>{clubes.map(c => {
              const vencido = planVencido(c.estado_plan, c.proximo_vencimiento)
              const estadoPlan = (c.estado_plan || 'prueba') as EstadoPlan
              const planStyle = PLAN_COLOR[estadoPlan] || PLAN_COLOR.prueba
              const cobroStyle = vencido ? ESTADO_COLOR.atrasado : ESTADO_COLOR.pagado
              const editando = editandoPlan === c.id
              const hist = resumen.porClub.get(c.id)
              return <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9', fontSize: 13, background: vencido ? '#fff7ed' : '#fff' }}>
                <td style={{ padding: '10px 18px', color: '#0f172a', fontWeight: 500 }}>{c.nombre}</td>
                <td style={{ padding: '10px 18px' }}>{editando ?
                  <input autoFocus type="number" min="0" value={planForm.monto} onChange={e => setPlanForm({ ...planForm, monto: e.target.value })} style={{ width: 105, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} /> :
                  <button onClick={() => { setError(''); setEditandoPlan(c.id); setPlanForm({ monto: String(c.plan_mensual || 0), estado: estadoPlan, fechaInicio: c.fecha_inicio_plan || '' }) }} style={{ border: 0, background: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {c.plan_mensual > 0 ? fmtVista(c.plan_mensual) : 'Por definir'} <Pencil size={11} color="#94a3b8" />
                  </button>}
                </td>
                <td style={{ padding: '10px 18px' }}>{editando ? <div style={{ display: 'grid', gap: 5 }}>
                  <select value={planForm.estado} onChange={e => setPlanForm({ ...planForm, estado: e.target.value as EstadoPlan })} style={{ padding: '5px 7px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11 }}>
                    <option value="prueba">Prueba</option><option value="activo">Activo</option><option value="suspendido">Suspendido</option><option value="cancelado">Cancelado</option>
                  </select>
                  <input type="date" value={planForm.fechaInicio} onChange={e => setPlanForm({ ...planForm, fechaInicio: e.target.value })} disabled={planForm.estado !== 'activo'} style={{ padding: '5px 7px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11 }} />
                </div> : <div><span style={{ background: planStyle.bg, color: planStyle.fg, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{planStyle.label}</span>
                  {c.fecha_inicio_plan && <div style={{ marginTop: 5, color: '#64748b', fontSize: 11 }}>Desde {fechaCorta(c.fecha_inicio_plan)}</div>}</div>}
                </td>
                <td style={{ padding: '10px 18px', color: vencido ? '#b91c1c' : '#64748b', fontWeight: vencido ? 700 : 400 }}>{fechaCorta(c.proximo_vencimiento)}</td>
                <td style={{ padding: '10px 18px' }}>
                  <div style={{ fontWeight: 700, color: '#16a34a' }}>{fmtVista(hist?.total || 0)}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                    {hist ? `${hist.pagos} pago${hist.pagos === 1 ? '' : 's'} · último ${fechaCorta(hist.ultimo)}` : 'Sin pagos aún'}
                  </div>
                </td>
                <td style={{ padding: '10px 18px' }}><span style={{ background: cobroStyle.bg, color: cobroStyle.fg, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{vencido ? 'Pago pendiente' : estadoPlan === 'activo' ? 'Al día' : 'Sin cobro'}</span></td>
                <td style={{ padding: '10px 18px', textAlign: 'right' }}>{editando ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button onClick={() => setEditandoPlan(null)} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={() => guardarPlan(c.id)} disabled={guardando} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: 0, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Guardar'}</button>
                </div> : <button onClick={() => abrirPago(c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#4f46e5', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}><Receipt size={12} /> Registrar pago</button>}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
          <span>Ingresos — historial completo</span>
          <span style={{ color: '#16a34a' }}>{fmtVista(resumen.ingresos)}</span>
        </div>
        {pagos.length === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: '#94a3b8' }}>Aún no hay pagos registrados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead><tr style={{ fontSize: 11, color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '8px 18px' }}>Fecha</th><th style={{ padding: '8px 18px' }}>Club</th>
                <th style={{ padding: '8px 18px' }}>Concepto</th><th style={{ padding: '8px 18px' }}>Período</th>
                <th style={{ padding: '8px 18px' }}>Método</th><th style={{ padding: '8px 18px' }}>Factura</th>
                <th style={{ padding: '8px 18px', textAlign: 'right' }}>Monto</th>
              </tr></thead>
              <tbody>
                {pagos.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9', fontSize: 13 }}>
                    <td style={{ padding: '10px 18px', color: '#64748b' }}>{fechaCorta(p.fecha_pago)}</td>
                    <td style={{ padding: '10px 18px', color: '#0f172a', fontWeight: 500 }}>{p.clubes?.nombre || '—'}</td>
                    <td style={{ padding: '10px 18px' }}>
                      <span style={{ background: p.concepto === 'mensualidad' ? '#eef2ff' : '#fef3c7', color: p.concepto === 'mensualidad' ? '#4338ca' : '#b45309', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        {LABEL_CONCEPTO[p.concepto] || p.concepto}
                      </span>
                    </td>
                    <td style={{ padding: '10px 18px', color: '#64748b' }}>{MESES[p.periodo_mes - 1]} {p.periodo_anio}</td>
                    <td style={{ padding: '10px 18px', color: '#64748b' }}>{p.metodo || '—'}</td>
                    <td style={{ padding: '10px 18px' }}>{celdaFactura('pagos', p)}</td>
                    <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{fmtVista(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
          <span>Gastos</span>
          <span style={{ color: '#dc2626' }}>{fmtVista(resumen.egresos)}</span>
        </div>
        {gastos.length === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: '#94a3b8' }}>Aún no hay gastos registrados. Con &quot;Registrar gasto&quot; arriba entra el primero.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead><tr style={{ fontSize: 11, color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '8px 18px' }}>Fecha</th><th style={{ padding: '8px 18px' }}>Categoría</th>
                <th style={{ padding: '8px 18px' }}>Descripción</th><th style={{ padding: '8px 18px' }}>Proveedor</th>
                <th style={{ padding: '8px 18px' }}>Factura</th>
                <th style={{ padding: '8px 18px', textAlign: 'right' }}>Monto</th><th style={{ padding: '8px 18px' }}></th>
              </tr></thead>
              <tbody>
                {gastos.map(g => (
                  <tr key={g.id} style={{ borderTop: '1px solid #f1f5f9', fontSize: 13 }}>
                    <td style={{ padding: '10px 18px', color: '#64748b' }}>{fechaCorta(g.fecha)}</td>
                    <td style={{ padding: '10px 18px' }}>
                      <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{g.categoria}</span>
                    </td>
                    <td style={{ padding: '10px 18px', color: '#0f172a' }}>{g.descripcion}</td>
                    <td style={{ padding: '10px 18px', color: '#64748b' }}>{g.proveedor || '—'}</td>
                    <td style={{ padding: '10px 18px' }}>{celdaFactura('gastos', g)}</td>
                    <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{fmtVista(g.monto)}</td>
                    <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                      <button onClick={() => borrarGasto(g)} title="Eliminar gasto"
                        style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 6px', color: '#dc2626', cursor: 'pointer' }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <input ref={inputArchivo} type="file" accept={ACEPTA_FACTURA} style={{ display: 'none' }} onChange={onArchivo} />

      {modalPago && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => setModalPago(null)}>
          <div style={{ ...card, padding: 20, width: 380, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Registrar pago</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>{modalPago.nombre}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Monto (CLP)" type="number" value={pagoForm.monto}
                onChange={e => setPagoForm({ ...pagoForm, monto: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <label style={{ fontSize: 11, color: '#64748b' }}>Fecha en que llegó la plata
                <input type="date" value={pagoForm.fecha} onChange={e => setPagoForm({ ...pagoForm, fecha: e.target.value })}
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              </label>
              <label style={{ fontSize: 11, color: '#64748b' }}>Concepto
                <select value={pagoForm.concepto} onChange={e => setPagoForm({ ...pagoForm, concepto: e.target.value as ConceptoPago })}
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }}>
                  {CONCEPTOS.map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                </select>
              </label>
              {pagoForm.concepto !== 'mensualidad' && (
                <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '7px 9px', lineHeight: 1.4 }}>
                  Un cobro que no es mensualidad no corre el próximo vencimiento del plan. El período sirve solo para saber a qué mes pertenece.
                </div>
              )}
              <label style={{ fontSize: 11, color: '#64748b' }}>Período que cubre
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <select value={pagoForm.mes} onChange={e => setPagoForm({ ...pagoForm, mes: Number(e.target.value) })}
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }}>
                    {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <input type="number" value={pagoForm.anio} onChange={e => setPagoForm({ ...pagoForm, anio: Number(e.target.value) })}
                    style={{ width: 90, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
                </div>
              </label>
              <select value={pagoForm.metodo} onChange={e => setPagoForm({ ...pagoForm, metodo: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }}>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="otro">Otro</option>
              </select>
              <input placeholder="Notas (opcional)" value={pagoForm.notas}
                onChange={e => setPagoForm({ ...pagoForm, notas: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                La factura se adjunta después, con el botón &quot;Subir&quot; de la fila en el historial.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModalPago(null)} style={{
                flex: 1, padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 7, fontSize: 12, color: '#64748b', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={confirmarPago} disabled={guardando} style={{
                flex: 1, padding: '8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none',
                borderRadius: 7, fontSize: 12, color: '#fff', cursor: 'pointer', opacity: guardando ? 0.6 : 1,
              }}>{guardando ? 'Guardando...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}

      {modalGasto && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => setModalGasto(false)}>
          <div style={{ ...card, padding: 20, width: 380, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Registrar gasto</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>Un gasto de CmSports, no de un club</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Monto (CLP)" type="number" value={gastoForm.monto}
                onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <label style={{ fontSize: 11, color: '#64748b' }}>Fecha
                <input type="date" value={gastoForm.fecha} onChange={e => setGastoForm({ ...gastoForm, fecha: e.target.value })}
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              </label>
              <input placeholder="Categoría (ej: Servidores y hosting)" list="categorias-gasto" value={gastoForm.categoria}
                onChange={e => setGastoForm({ ...gastoForm, categoria: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <datalist id="categorias-gasto">
                {CATEGORIAS_GASTO.map(c => <option key={c} value={c} />)}
              </datalist>
              <input placeholder="¿En qué se gastó?" value={gastoForm.descripcion}
                onChange={e => setGastoForm({ ...gastoForm, descripcion: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <input placeholder="Proveedor (opcional)" value={gastoForm.proveedor}
                onChange={e => setGastoForm({ ...gastoForm, proveedor: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                La boleta o factura se adjunta después, con el botón &quot;Subir&quot; de la fila.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModalGasto(false)} style={{
                flex: 1, padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 7, fontSize: 12, color: '#64748b', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={confirmarGasto} disabled={guardando} style={{
                flex: 1, padding: '8px', background: '#dc2626', border: 'none',
                borderRadius: 7, fontSize: 12, color: '#fff', cursor: 'pointer', opacity: guardando ? 0.6 : 1,
              }}>{guardando ? 'Guardando...' : 'Registrar gasto'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
