// Informe financiero del torneo en PDF (1-2 hojas), con jugadores, pagos,
// premios y gastos de gestión. Usa jspdf + jspdf-autotable (ya instalados).

type Jugador = { nombre: string; pagado: boolean }
type Premio = { lugar: string; nombre?: string | null; monto?: number | null }
type Gasto = { tipo: string; monto: number }

export type InformeFinanciero = {
  torneoNombre: string
  cuota: number
  totalInscritos: number
  pagados: number
  recaudado: number
  proyectado: number
  jugadores: Jugador[]
  premios: Premio[]
  gastos: Gasto[]
}

const MORADO: [number, number, number] = [79, 70, 229]
const VERDE: [number, number, number] = [22, 163, 74]
const ROJO: [number, number, number] = [220, 38, 38]
const GRIS: [number, number, number] = [100, 116, 139]

const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')

export async function descargarInformeFinancieroPdf(d: InformeFinanciero) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()

  // — Encabezado —
  doc.setFillColor(...MORADO); doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text('Informe financiero', 14, 13)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
  doc.text(d.torneoNombre, 14, 22)
  doc.setFontSize(9)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, W - 14, 22, { align: 'right' })

  // — Resumen de recaudación —
  const totalPremios = d.premios.reduce((s, p) => s + (p.monto || 0), 0)
  const totalGastos = d.gastos.reduce((s, g) => s + (g.monto || 0), 0)
  const neto = d.recaudado - totalPremios - totalGastos
  const pendienteCobro = d.proyectado - d.recaudado

  autoTable(doc, {
    startY: 38,
    head: [['Recaudación', 'Detalle']],
    body: [
      ['Inscritos', String(d.totalInscritos)],
      ['Cuota por jugador', fmt(d.cuota)],
      [`Pagaron (${d.pagados}/${d.totalInscritos})`, fmt(d.recaudado)],
      ['Pendiente por cobrar', fmt(pendienteCobro)],
    ],
    theme: 'striped',
    headStyles: { fillColor: MORADO },
    margin: { left: 14, right: 14 },
    columnStyles: { 1: { halign: 'right' } },
  })

  // — Jugadores y estado de pago —
  let y = (doc as any).lastAutoTable.finalY + 8
  autoTable(doc, {
    startY: y,
    head: [['Jugador', 'Estado', 'Monto']],
    body: d.jugadores.map(j => [j.nombre, j.pagado ? 'Pagado' : 'Pendiente', j.pagado ? fmt(d.cuota) : '—']),
    theme: 'striped',
    headStyles: { fillColor: MORADO },
    margin: { left: 14, right: 14 },
    columnStyles: { 2: { halign: 'right' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 1) {
        data.cell.styles.textColor = data.cell.raw === 'Pagado' ? VERDE : ROJO
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // — Premios —
  y = (doc as any).lastAutoTable.finalY + 8
  const premiosBody = d.premios
    .filter(p => (p.monto || 0) > 0 || p.nombre)
    .map(p => [p.lugar, p.nombre || '—', fmt(p.monto || 0)])
  if (premiosBody.length) {
    autoTable(doc, {
      startY: y,
      head: [['Premio', 'Jugador', 'Monto']],
      body: premiosBody,
      theme: 'striped',
      headStyles: { fillColor: VERDE },
      margin: { left: 14, right: 14 },
      columnStyles: { 2: { halign: 'right' } },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // — Gastos de gestión —
  if (d.gastos.length) {
    autoTable(doc, {
      startY: y,
      head: [['Gasto de gestión', 'Monto']],
      body: d.gastos.map(g => [g.tipo, fmt(g.monto)]),
      theme: 'striped',
      headStyles: { fillColor: ROJO },
      margin: { left: 14, right: 14 },
      columnStyles: { 1: { halign: 'right' } },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // — Balance final —
  autoTable(doc, {
    startY: y,
    head: [['Balance final', 'Monto']],
    body: [
      ['Recaudado', fmt(d.recaudado)],
      ['− Premios', fmt(totalPremios)],
      ['− Gastos de gestión', fmt(totalGastos)],
      ['Queda para el club', fmt(neto)],
    ],
    theme: 'grid',
    headStyles: { fillColor: MORADO },
    margin: { left: 14, right: 14 },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === 3) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = neto >= 0 ? VERDE : ROJO
        data.cell.styles.fillColor = [244, 247, 250]
      }
    },
  })

  // — Pie —
  const pc = doc.getNumberOfPages()
  for (let i = 1; i <= pc; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setTextColor(...GRIS)
    doc.text(`CmSports — ${d.torneoNombre} — Pág ${i} de ${pc}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
  }

  const nombre = d.torneoNombre.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').trim() || 'torneo'
  doc.save(`informe_financiero_${nombre.replace(/ /g, '_')}.pdf`)
}
