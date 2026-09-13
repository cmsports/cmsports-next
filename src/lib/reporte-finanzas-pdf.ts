// Reporte de Finanzas, versión 2 — el contable, para el tesorero.
//
//   1. Cómo cerró: resultado con margen, ingresos, gastos, por cobrar.
//   2. Estado de resultados por cuenta, comparado con el período anterior.
//   3. Evolución mensual (si el período abarca más de un mes).
//   4. Cuentas por cobrar: toda la deuda viva del club por antigüedad, y el
//      detalle por cuota.
//   5. Libro de movimientos del período, para cuadrar.

import type { Marca } from '@/lib/pdf/papel'
import {
  TINTA, GRIS, GRIS_CLARO, VERDE, ROJO, AMBAR,
  prepararFuentes, portada, pieDePagina, asegurar, seccion, cifras, barras, columnas, tabla, mezclar, pesos, nota,
} from '@/lib/pdf/papel'

export interface DatosFinanzas {
  ingresos: number
  gastos: number
  ingresosPrev: number
  gastosPrev: number
  tituloPrev: string
  desgloseIngresos: Record<string, number>
  desgloseGastos: Record<string, number>
  prevIngresos: Record<string, number>
  prevGastos: Record<string, number>
  porMes: Record<string, { ingresos: number; gastos: number }>
  porCobrar: Array<{ mes: number; anio: number; monto: number; estado: string; jugadores?: { nombre?: string | null; categoria?: string | null } | null }>
  totalPorCobrar: number
  movimientos: Array<{ fecha: string; tipo: string; categoria: string; descripcion?: string | null; monto: number }>
  finAnio: number
  finMes: number
}

export interface ArgsFinanzas {
  marca: Marca
  periodo: string
  generado: string
  datos: DatosFinanzas
  nombreCategoria: (c: string) => string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const variacion = (actual: number, previo: number): number | null => (previo ? Math.round(((actual - previo) / Math.abs(previo)) * 100) : null)
const textoVar = (v: number | null) => (v === null ? 'nuevo' : `${v >= 0 ? '+' : ''}${v}%`)
const pct = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : '—')


function lineaCabecera(marca: Marca) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data: any) => {
    if (data.section !== 'head') return
    const c = data.cell
    data.doc.setDrawColor(...marca.acento); data.doc.setLineWidth(0.5)
    data.doc.line(c.x, c.y + c.height, c.x + c.width, c.y + c.height)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function construirReporteFinanzas(args: ArgsFinanzas): Promise<any> {
  const { marca, datos: p, nombreCategoria } = args
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  await prepararFuentes(doc)
  const cab = { titulo: 'Reporte financiero', subtitulo: args.periodo, nota: `Generado el ${args.generado}` }
  let y = portada(doc, marca, cab)

  const balance = p.ingresos - p.gastos
  const balancePrev = p.ingresosPrev - p.gastosPrev
  const margen = p.ingresos > 0 ? Math.round((balance / p.ingresos) * 100) : 0

  // ── 1. Cómo cerró ────────────────────────────────────────────────────────
  y = cifras(doc, y, marca, [
    { etiqueta: 'Resultado', valor: pesos(balance), variacion: variacion(balance, balancePrev), detalle: `margen ${margen}%`, color: balance >= 0 ? VERDE : ROJO },
    { etiqueta: 'Ingresos', valor: pesos(p.ingresos), variacion: variacion(p.ingresos, p.ingresosPrev), detalle: `vs ${p.tituloPrev}`, color: VERDE },
    { etiqueta: 'Gastos', valor: pesos(p.gastos), variacion: variacion(p.gastos, p.gastosPrev), detalle: `vs ${p.tituloPrev}`, subirEsMalo: true, color: ROJO },
    { etiqueta: 'Por cobrar', valor: p.totalPorCobrar > 0 ? pesos(p.totalPorCobrar) : 'Sin deuda', detalle: p.porCobrar.length ? `${p.porCobrar.length} cuota${p.porCobrar.length === 1 ? '' : 's'} impaga${p.porCobrar.length === 1 ? '' : 's'}` : 'todo cobrado', color: p.totalPorCobrar > 0 ? AMBAR : VERDE },
  ])

  // ── 2. Estado de resultados ──────────────────────────────────────────────
  y = seccion(doc, y, marca, 'Estado de resultados', `comparado con ${p.tituloPrev}`)
  type Fila = { tipo: 'titulo' | 'linea' | 'subtotal'; celdas: string[]; ingreso: boolean; var?: number | null }
  const lineas = (cats: Record<string, number>, prev: Record<string, number>, base: number, ingreso: boolean): Fila[] =>
    Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => {
      const antes = prev[c] || 0
      const va = variacion(v, antes)
      return { tipo: 'linea', ingreso, var: va, celdas: [nombreCategoria(c), pesos(v), pct(v, base), antes ? pesos(antes) : '—', textoVar(va)] }
    })
  const filas: Fila[] = [
    { tipo: 'titulo', ingreso: true, celdas: ['Ingresos', '', '', '', ''] },
    ...lineas(p.desgloseIngresos, p.prevIngresos, p.ingresos, true),
    { tipo: 'subtotal', ingreso: true, var: variacion(p.ingresos, p.ingresosPrev), celdas: ['Total ingresos', pesos(p.ingresos), '100%', pesos(p.ingresosPrev), textoVar(variacion(p.ingresos, p.ingresosPrev))] },
    { tipo: 'titulo', ingreso: false, celdas: ['Gastos', '', '', '', ''] },
    ...lineas(p.desgloseGastos, p.prevGastos, p.gastos, false),
    { tipo: 'subtotal', ingreso: false, var: variacion(p.gastos, p.gastosPrev), celdas: ['Total gastos', pesos(p.gastos), '100%', pesos(p.gastosPrev), textoVar(variacion(p.gastos, p.gastosPrev))] },
  ]
  autoTable(doc, {
    ...tabla(marca, { numericas: [1, 2, 3, 4], anchos: { 1: 30, 2: 22, 3: 30, 4: 20 } }),
    startY: y,
    head: [['Cuenta', 'Monto', '% del total', p.tituloPrev, 'Var.']],
    body: filas.map(f => f.celdas),
    foot: [['Resultado del período', pesos(balance), `${margen}%`, pesos(balancePrev), textoVar(variacion(balance, balancePrev))]],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (d: any) => {
      if (d.section === 'head' && [1, 2, 3, 4].includes(d.column.index)) d.cell.styles.halign = 'right'
      if (d.section !== 'body') return
      const f = filas[d.row.index]
      if (!f) return
      if (f.tipo === 'titulo') {
        d.cell.styles.fillColor = mezclar(f.ingreso ? VERDE : ROJO, 0.08)
        d.cell.styles.textColor = f.ingreso ? VERDE : ROJO
        d.cell.styles.fontStyle = 'bold'
      } else if (f.tipo === 'subtotal') {
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.textColor = TINTA
      } else if (d.column.index === 0) {
        d.cell.styles.cellPadding = { top: 2.6, bottom: 2.6, left: 7, right: 2.5 }
      }
      if (d.column.index === 4 && f.tipo !== 'titulo') {
        const v = f.var ?? null
        // En ingresos subir es bueno; en gastos, malo.
        d.cell.styles.textColor = v === null ? GRIS_CLARO : v === 0 ? GRIS : (v > 0) === f.ingreso ? VERDE : ROJO
        if (v !== null && v !== 0) d.cell.styles.fontStyle = 'bold'
      }
    },
    didDrawCell: lineaCabecera(marca),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 10

  // ── 3. Evolución mensual ─────────────────────────────────────────────────
  const meses = Object.entries(p.porMes).sort()
  if (meses.length > 1) {
    y = asegurar(doc, y, 70 + meses.length * 7, marca, cab)
    y = seccion(doc, y, marca, 'Evolución mensual', `${meses.length} meses`)
    y = columnas(doc, y + 2, meses.map(([k, v]) => ({ etiqueta: `${MESES_CORTO[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`, valores: [v.ingresos, v.gastos] })), [{ nombre: 'Ingresos', color: VERDE }, { nombre: 'Gastos', color: ROJO }], { alto: 36, formato: n => `$${Math.round(n / 1000)}k` })
    autoTable(doc, {
      ...tabla(marca, { numericas: [1, 2, 3, 4], anchos: { 1: 32, 2: 32, 3: 32, 4: 22 } }),
      startY: y,
      head: [['Mes', 'Ingresos', 'Gastos', 'Resultado', 'Margen']],
      body: meses.map(([k, v]) => [`${cap(MESES[Number(k.slice(5, 7)) - 1])} ${k.slice(0, 4)}`, pesos(v.ingresos), pesos(v.gastos), pesos(v.ingresos - v.gastos), pct(v.ingresos - v.gastos, v.ingresos)]),
      foot: [['Total', pesos(p.ingresos), pesos(p.gastos), pesos(balance), `${margen}%`]],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => {
        if (d.section === 'head' && [1, 2, 3, 4].includes(d.column.index)) d.cell.styles.halign = 'right'
        if (d.column.index !== 3 || d.section === 'head') return
        const neto = d.section === 'foot' ? balance : (meses[d.row.index]?.[1].ingresos ?? 0) - (meses[d.row.index]?.[1].gastos ?? 0)
        d.cell.styles.textColor = neto < 0 ? ROJO : VERDE
        d.cell.styles.fontStyle = 'bold'
      },
      didDrawCell: lineaCabecera(marca),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10
  }

  // ── 4. Cuentas por cobrar ────────────────────────────────────────────────
  const refe = p.finAnio * 12 + p.finMes
  const edad = (m: { anio: number; mes: number }) => refe - (m.anio * 12 + m.mes)
  y = asegurar(doc, y, 60, marca, cab)
  y = seccion(doc, y, marca, 'Cuentas por cobrar', 'toda la deuda vigente del club, no solo la del período')
  if (!p.porCobrar.length) {
    y = nota(doc, y, 'No hay mensualidades pendientes de pago.')
  } else {
    const tramos = [
      { nombre: 'Del período en curso', min: 0, max: 0, color: AMBAR },
      { nombre: '1 mes de atraso', min: 1, max: 1, color: mezclar(ROJO, 0.7) },
      { nombre: '2 meses de atraso', min: 2, max: 2, color: mezclar(ROJO, 0.85) },
      { nombre: '3 meses o más', min: 3, max: 999, color: ROJO },
    ].map(t => {
      const filas = p.porCobrar.filter(m => { const e = edad(m); return e >= t.min && e <= t.max })
      return { ...t, filas, monto: filas.reduce((s, m) => s + (m.monto || 0), 0) }
    }).filter(t => t.filas.length)
    y = barras(doc, y, marca, tramos.map(t => ({ etiqueta: t.nombre, valor: t.monto, texto: `${pesos(t.monto)} · ${t.filas.length}`, color: t.color })), { titulo: 'Antigüedad de la deuda' })

    const TOPE = 40
    const orden = [...p.porCobrar].sort((a, b) => edad(b) - edad(a) || (a.jugadores?.nombre || '').localeCompare(b.jugadores?.nombre || '', 'es'))
    const visibles = orden.slice(0, TOPE)
    autoTable(doc, {
      ...tabla(marca, { numericas: [4], anchos: { 1: 26, 2: 30, 3: 22, 4: 26, 5: 22 } }),
      startY: y,
      head: [['Jugador', 'Categoría', 'Mes', 'Atraso', 'Monto', 'Estado']],
      body: visibles.map(m => {
        const e = edad(m)
        return [m.jugadores?.nombre || '—', m.jugadores?.categoria || '—', `${cap(MESES[m.mes - 1])} ${m.anio}`, e <= 0 ? 'en curso' : e === 1 ? '1 mes' : `${e} meses`, pesos(m.monto || 0), cap(m.estado)]
      }),
      foot: [[orden.length > TOPE ? `y ${orden.length - TOPE} cuotas más` : 'Total', '', '', '', pesos(p.totalPorCobrar), '']],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => {
        if (d.section === 'head' && d.column.index === 4) d.cell.styles.halign = 'right'
        if (d.section !== 'body') return
        if (d.column.index === 5) { d.cell.styles.textColor = visibles[d.row.index]?.estado === 'atrasado' ? ROJO : AMBAR; d.cell.styles.fontStyle = 'bold' }
        if (d.column.index === 3 && edad(visibles[d.row.index]) >= 2) d.cell.styles.textColor = ROJO
      },
      didDrawCell: lineaCabecera(marca),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10
  }

  // ── 5. Libro de movimientos ──────────────────────────────────────────────
  if (p.movimientos.length) {
    doc.addPage()
    y = portada(doc, marca, { ...cab, titulo: 'Libro de movimientos' })
    y = seccion(doc, y, marca, 'Todos los movimientos del período', `${p.movimientos.length} registros`)
    autoTable(doc, {
      ...tabla(marca, { numericas: [4], anchos: { 0: 22, 1: 18, 2: 36, 4: 28 } }),
      startY: y,
      head: [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto']],
      body: p.movimientos.map(m => [m.fecha.slice(8, 10) + '-' + m.fecha.slice(5, 7) + '-' + m.fecha.slice(0, 4), m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', nombreCategoria(m.categoria), m.descripcion || '—', (m.tipo === 'ingreso' ? '+' : '−') + pesos(m.monto)]),
      foot: [['', '', '', 'Resultado del período', pesos(balance)]],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => {
        if (d.section === 'head' && d.column.index === 4) d.cell.styles.halign = 'right'
        if (d.section === 'body' && (d.column.index === 1 || d.column.index === 4)) {
          d.cell.styles.textColor = p.movimientos[d.row.index]?.tipo === 'ingreso' ? VERDE : ROJO
          if (d.column.index === 4) d.cell.styles.fontStyle = 'bold'
        }
      },
      didDrawCell: lineaCabecera(marca),
    })
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Reporte financiero · ${args.periodo}`)
  return doc
}

export async function descargarReporteFinanzas(args: ArgsFinanzas) {
  const doc = await construirReporteFinanzas(args)
  doc.save(`Reporte financiero — ${args.marca.club} — ${args.periodo}.pdf`)
}


