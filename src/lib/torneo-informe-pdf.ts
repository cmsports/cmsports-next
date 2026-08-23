// Informe financiero del torneo en PDF, con jugadores, pagos, premios y
// gastos de gestión. Usa jspdf + jspdf-autotable (ya instalados).

import { COLOR, encabezado, piePagina, filaTarjetas, tituloSeccion, estiloTabla } from '@/lib/pdf/estilo'

// 'exento' es quien se retiró del torneo y no se le cobra (migración 192). Con
// un `pagado: boolean` esa persona salía como "Pendiente" en rojo, contando
// como deuda algo que el club ya decidió no cobrar.
type Jugador = { nombre: string; estado: 'pagado' | 'exento' | 'pendiente'; metodoPago?: string | null }
type Premio = { lugar: string; nombre?: string | null; monto?: number | null }
type Gasto = { tipo: string; monto: number }

export type InformeFinanciero = {
  torneoNombre: string
  cuota: number
  totalInscritos: number
  pagados: number
  recaudado: number
  recaudadoEfectivo: number
  recaudadoTransferencia: number
  recaudadoPendienteSubir: number
  jugadores: Jugador[]
  premios: Premio[]
  gastos: Gasto[]
  gastosRegistradosEnFinanzas: boolean
  metodoPremio?: 'efectivo' | 'transferencia'
}

const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')

export async function descargarInformeFinancieroPdf(d: InformeFinanciero) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()

  const totalPremios = d.premios.reduce((s, p) => s + (p.monto || 0), 0)
  const totalGastos = d.gastos.reduce((s, g) => s + (g.monto || 0), 0)
  const neto = d.recaudado - totalPremios - totalGastos
  // `d.recaudado` cuenta TODO pago que se hizo alguna vez en este torneo,
  // incluido el de alguien que después se retiró (torneo_pagos no se toca al
  // sacar a un jugador: si ya pagó, la plata queda registrada a propósito).
  // `d.proyectado - d.recaudado` mezclaba esa población histórica con la de
  // hoy y podía dar un "pendiente" negativo aunque no quedara nadie por
  // cobrar. Se cuenta directo de `d.jugadores`, que ya viene acotado a quien
  // sigue inscrito.
  const pendienteCobro = d.jugadores.filter(j => j.estado === 'pendiente').length * d.cuota

  let y = encabezado(doc, {
    club: d.torneoNombre,
    titulo: 'Informe financiero',
    subtitulo: `Generado el ${new Date().toLocaleDateString('es-CL')}`,
  })

  // ── Vistazo rápido ────────────────────────────────────────────────────
  y = filaTarjetas(doc, y, [
    { valor: fmt(d.recaudado), etiqueta: `Recaudado (${d.pagados}/${d.totalInscritos})`, color: COLOR.primario },
    { valor: fmt(pendienteCobro), etiqueta: 'Pendiente por cobrar', color: pendienteCobro > 0 ? COLOR.ambar : COLOR.verde },
    { valor: fmt(totalPremios + totalGastos), etiqueta: 'Premios + gastos', color: COLOR.rojo },
    { valor: fmt(neto), etiqueta: 'Queda para el club', color: neto >= 0 ? COLOR.verde : COLOR.rojo },
  ])

  if (d.recaudadoPendienteSubir > 0) {
    doc.setFillColor(...COLOR.ambarSuave)
    doc.roundedRect(14, y - 4, doc.internal.pageSize.getWidth() - 28, 9, 1.5, 1.5, 'F')
    doc.setTextColor(...COLOR.ambar); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    doc.text(`⚠ Todavía hay ${fmt(d.recaudadoPendienteSubir)} recaudados sin subir a Finanzas`, 18, y + 2)
    y += 11
  }

  // ── Recaudación ───────────────────────────────────────────────────────
  y = tituloSeccion(doc, y, 'Recaudación')
  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Detalle']],
    body: [
      ['Cuota por jugador', fmt(d.cuota)],
      ['Recaudado en efectivo', fmt(d.recaudadoEfectivo)],
      ['Recaudado por transferencia', fmt(d.recaudadoTransferencia)],
      ['Pendiente por cobrar', fmt(pendienteCobro)],
    ],
    ...estiloTabla(),
    columnStyles: { 1: { halign: 'right' } },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  // ── Jugadores y estado de pago ────────────────────────────────────────
  y = tituloSeccion(doc, y, 'Jugadores')
  autoTable(doc, {
    startY: y,
    head: [['Jugador', 'Estado', 'Método', 'Monto']],
    body: d.jugadores.map(j => [
      j.nombre,
      j.estado === 'pagado' ? 'Pagado' : j.estado === 'exento' ? 'Exento' : 'Pendiente',
      j.estado === 'pagado' ? (j.metodoPago === 'transferencia' ? 'Transferencia' : 'Efectivo') : '—',
      j.estado === 'pagado' ? fmt(d.cuota) : '—',
    ]),
    ...estiloTabla(),
    columnStyles: { 3: { halign: 'right' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 1) {
        data.cell.styles.textColor = data.cell.raw === 'Pagado' ? COLOR.verde
          : data.cell.raw === 'Exento' ? COLOR.ambar : COLOR.rojo
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  // ── Premios ───────────────────────────────────────────────────────────
  const metodoLabel = d.metodoPremio === 'transferencia' ? 'Transferencia' : 'Efectivo'
  const premiosBody = d.premios
    .filter(p => (p.monto || 0) > 0)
    .map(p => [p.lugar, p.nombre || '—', fmt(p.monto || 0), metodoLabel])
  if (premiosBody.length) {
    y = tituloSeccion(doc, y, 'Premios entregados')
    autoTable(doc, {
      startY: y,
      head: [['Premio', 'Jugador', 'Monto', 'Pago']],
      body: premiosBody,
      ...estiloTabla(COLOR.verde),
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'center' } },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Gastos de gestión ─────────────────────────────────────────────────
  if (d.gastos.length) {
    y = tituloSeccion(doc, y, 'Gastos de gestión')
    autoTable(doc, {
      startY: y,
      head: [['Gasto', 'Monto']],
      body: d.gastos.map(g => [g.tipo, fmt(g.monto)]),
      ...estiloTabla(COLOR.rojo),
      columnStyles: { 1: { halign: 'right' } },
    })
    y = (doc as any).lastAutoTable.finalY + 6
    if (!d.gastosRegistradosEnFinanzas) {
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...COLOR.rojo)
      doc.text('⚠ Estos gastos aún no se han registrado en Finanzas — usa "Guardar premios" para subirlos.', 14, y)
      y += 8
    } else {
      y += 2
    }
  }

  // ── Balance final ─────────────────────────────────────────────────────
  y = tituloSeccion(doc, y, 'Balance final')
  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Monto']],
    body: [
      ['Recaudado', fmt(d.recaudado)],
      ['− Premios', fmt(totalPremios)],
      ['− Gastos de gestión', fmt(totalGastos)],
      ['Queda para el club', fmt(neto)],
    ],
    theme: 'grid',
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: COLOR.primario, textColor: COLOR.blanco, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === 3) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = neto >= 0 ? COLOR.verde : COLOR.rojo
        data.cell.styles.fillColor = COLOR.fondoSuave
      }
    },
  })

  piePagina(doc, `${d.torneoNombre} · Informe financiero`)

  const nombre = d.torneoNombre.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').trim() || 'torneo'
  doc.save(`informe_financiero_${nombre.replace(/ /g, '_')}.pdf`)
}
