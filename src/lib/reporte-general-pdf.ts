// Reporte General del club, versión 2 — el que va al directorio.
//
// Responde cuatro preguntas, en este orden y sin relleno:
//   1. ¿Cómo cerró el período?        → cuatro cifras grandes con su variación
//   2. ¿Qué hay que mirar?            → los hallazgos (lo que el dato justifica)
//   3. ¿De dónde entra y a qué se va? → barras por categoría, y mes a mes
//   4. ¿Cómo viene la gente?          → asistencia, día a día de la semana,
//                                       a quién cobrarle y quién no viene
//
// Lo que no tiene dato no se imprime. Cincuenta filas iguales no son una
// tabla: son un total, y así se muestran.

import type { Marca, Tono } from '@/lib/pdf/papel'
import {
  MARGEN, TINTA, GRIS, VERDE, ROJO, AMBAR, AZUL,
  prepararFuentes, portada, pieDePagina, asegurar, seccion, cifras, hallazgos, barras, columnas, anillo,
  tabla, barraEnCelda, colorDePorcentaje, nota, mezclar, pesos,
} from '@/lib/pdf/papel'

export interface DatosGeneral {
  ingresos: number
  gastos: number
  ingresosPrev: number
  gastosPrev: number
  tituloPrev: string
  desgloseIngresos: Record<string, number>
  desgloseGastos: Record<string, number>
  movimientos: Array<{ tipo: string; monto: number; fecha: string }>
  jugadores: Array<{ id: string; nombre: string; estado: string; categoria: string | null }>
  activos: Array<{ id: string; nombre: string; categoria: string | null }>
  asistencias: Array<{ jugador_id: string; fecha: string }>
  asistPrev: number
  diasConAsist: number
  promedioAsist: number
  porDiaSemana: Record<number, number>
  mensualidades: Array<{ jugador_id: string; mes: number; anio: number; monto: number; estado: string }>
  morosos: Array<{ id: string; nombre: string; categoria: string | null }>
  torneos: Array<{ nombre: string }>
}

export interface AnalisisGeneral {
  balance: number
  balancePrev: number
  activos: number
  deudaPeriodo: number
  impagas: Array<{ jugador_id: string; mes: number; anio: number; monto: number }>
  cobranza: number
  asistPorJug: Map<string, number>
  sinVenir: Array<{ id: string; nombre: string; categoria: string | null }>
  morososQueVienen: number
  ocupacion: number
  hallazgos: Array<{ texto: string; tono: Tono }>
}

const abreviar = (t: string) => t.replace(/^(w{3})w+/, '$1')
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function variacion(actual: number, previo: number): number | null {
  if (!previo) return null
  return Math.round(((actual - previo) / Math.abs(previo)) * 100)
}

export interface ArgsGeneral {
  marca: Marca
  periodo: string
  generado: string
  datos: DatosGeneral
  analisis: AnalisisGeneral
  nombreCategoria: (c: string) => string
}

/** Arma el documento y lo devuelve (para descargar, o para mirarlo en pruebas). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function construirReporteGeneral(args: ArgsGeneral): Promise<any> {
  const { marca, datos: p, analisis: an, nombreCategoria } = args
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  await prepararFuentes(doc)
  const W = doc.internal.pageSize.getWidth()
  const cab = { titulo: 'Reporte general', subtitulo: args.periodo, nota: `Generado el ${args.generado}` }
  let y = portada(doc, marca, cab)

  // ── 1. Cómo cerró ────────────────────────────────────────────────────────
  const mesesConDato = new Set(p.movimientos.map(m => m.fecha.slice(0, 7))).size
  y = cifras(doc, y, marca, [
    { etiqueta: 'Resultado', valor: pesos(an.balance), variacion: variacion(an.balance, an.balancePrev), detalle: `vs ${abreviar(p.tituloPrev)}`, color: an.balance >= 0 ? VERDE : ROJO },
    { etiqueta: 'Ingresos', valor: pesos(p.ingresos), variacion: variacion(p.ingresos, p.ingresosPrev), detalle: `vs ${abreviar(p.tituloPrev)}`, color: VERDE },
    { etiqueta: 'Gastos', valor: pesos(p.gastos), variacion: variacion(p.gastos, p.gastosPrev), detalle: `vs ${abreviar(p.tituloPrev)}`, subirEsMalo: true, color: ROJO },
    an.deudaPeriodo > 0
      ? { etiqueta: 'Por cobrar', valor: pesos(an.deudaPeriodo), detalle: `${an.impagas.length} cuota${an.impagas.length === 1 ? '' : 's'} · ${p.morosos.length} jugador${p.morosos.length === 1 ? '' : 'es'}`, color: AMBAR }
      : { etiqueta: 'Cobranza', valor: an.cobranza ? `${an.cobranza}%` : '—', detalle: 'de lo emitido', color: VERDE },
  ])

  // ── 2. Qué hay que mirar ─────────────────────────────────────────────────
  y = seccion(doc, y, marca, 'Lo que hay que mirar', `comparado con ${p.tituloPrev}`)
  y = hallazgos(doc, y, an.hallazgos)

  // ── 3. La plata ──────────────────────────────────────────────────────────
  const topIng = Object.entries(p.desgloseIngresos).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const topGas = Object.entries(p.desgloseGastos).sort((a, b) => b[1] - a[1]).slice(0, 6)
  if (topIng.length || topGas.length) {
    const altoBarras = 6 + Math.max(topIng.length, topGas.length) * 7.2 + 4
    y = asegurar(doc, y, altoBarras + 12, marca, cab)
    y = seccion(doc, y, marca, 'La plata', an.activos ? `cada alumno deja ${pesos(p.ingresos / an.activos)} y cuesta ${pesos(p.gastos / an.activos)}` : undefined)
    const mitad = (W - 2 * MARGEN - 8) / 2
    const y0 = y
    let yI = y0, yG = y0
    if (topIng.length) yI = barras(doc, y0, marca, topIng.map(([c, v]) => ({ etiqueta: nombreCategoria(c), valor: v, texto: pesos(v), color: VERDE })), { x: MARGEN, ancho: mitad, titulo: 'De dónde entra' })
    if (topGas.length) yG = barras(doc, y0, marca, topGas.map(([c, v]) => ({ etiqueta: nombreCategoria(c), valor: v, texto: pesos(v), color: ROJO })), { x: MARGEN + mitad + 8, ancho: mitad, titulo: 'A qué se va' })
    y = Math.max(yI, yG) + 2
  }

  // Mes a mes, solo si el período abarca más de un mes.
  if (mesesConDato > 1) {
    const porMes = new Map<string, { ingresos: number; gastos: number }>()
    for (const m of p.movimientos) {
      const k = m.fecha.slice(0, 7)
      const f = porMes.get(k) ?? { ingresos: 0, gastos: 0 }
      if (m.tipo === 'ingreso') f.ingresos += m.monto; else f.gastos += m.monto
      porMes.set(k, f)
    }
    const cols = [...porMes.entries()].sort().map(([k, v]) => ({ etiqueta: `${MESES[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`, valores: [v.ingresos, v.gastos] }))
    y = asegurar(doc, y, 60, marca, cab)
    y = seccion(doc, y, marca, 'Mes a mes')
    y = columnas(doc, y + 2, cols, [{ nombre: 'Ingresos', color: VERDE }, { nombre: 'Gastos', color: ROJO }], { alto: 38, formato: n => `$${Math.round(n / 1000)}k` })
  }

  // ── 4. La gente ──────────────────────────────────────────────────────────
  y = asegurar(doc, y, 70, marca, cab)
  y = seccion(doc, y, marca, 'La gente', `${an.activos} activos de ${p.jugadores.length} fichas`)
  const asistencias = p.asistencias.length
  const cifrasGente = [
    { etiqueta: 'Asistencias', valor: asistencias ? String(asistencias) : '—', variacion: variacion(asistencias, p.asistPrev), detalle: `vs ${abreviar(p.tituloPrev)}`, color: AZUL },
    { etiqueta: 'Días con clase', valor: p.diasConAsist ? String(p.diasConAsist) : '—', detalle: p.promedioAsist ? `${p.promedioAsist} jugadores por clase` : undefined, color: AZUL },
    { etiqueta: 'No vinieron nunca', valor: an.sinVenir.length ? String(an.sinVenir.length) : '—', detalle: an.activos ? `${Math.round((an.sinVenir.length / an.activos) * 100)}% de los activos` : undefined, color: ROJO },
    { etiqueta: 'Torneos', valor: p.torneos.length ? String(p.torneos.length) : '—', detalle: p.torneos.slice(0, 2).map(t => t.nombre).join(' · '), color: AMBAR },
  ]
  y = cifras(doc, y, marca, cifrasGente)

  // Ocupación (anillo) y asistencias por día de la semana (barras), lado a lado.
  const dias = [1, 2, 3, 4, 5, 6, 0].map(d => ({ etiqueta: DIAS[d], valores: [p.porDiaSemana[d] ?? 0] })).filter(d => d.valores[0] > 0)
  if (asistencias > 0) {
    y = asegurar(doc, y, 50, marca, cab)
    const r = 13
    anillo(doc, MARGEN + r + 2, y + r + 2, r, an.ocupacion, colorDePorcentaje(an.ocupacion), 'ocupación por clase')
    if (dias.length) {
      const xTabla = MARGEN + r * 2 + 16
      const anchoTabla = W - MARGEN - xTabla
      // Barras de la semana, a mano (columnas() usa todo el ancho).
      const max = Math.max(1, ...dias.map(d => d.valores[0]))
      const gw = anchoTabla / dias.length
      const base = y + 30
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3); doc.line(xTabla, base, xTabla + anchoTabla, base)
      dias.forEach((d, i) => {
        const h = (d.valores[0] / max) * 24
        const bx = xTabla + i * gw + (gw - 8) / 2
        doc.setFillColor(...mezclar(marca.acento, d.valores[0] === max ? 1 : 0.55))
        doc.roundedRect(bx, base - h, 8, h, 1, 1, 'F')
        doc.setFont(doc.getFont().fontName, 'normal'); doc.setFontSize(7); doc.setTextColor(...GRIS)
        doc.text(String(d.valores[0]), bx + 4, base - h - 1.5, { align: 'center' })
        doc.text(d.etiqueta, bx + 4, base + 4.5, { align: 'center' })
      })
      doc.setFontSize(7); doc.setTextColor(...GRIS)
      doc.text('ASISTENCIAS POR DÍA DE LA SEMANA', xTabla, y + 1, { charSpace: 0.3 })
    }
    y += 42
  }

  // ── A quién cobrarle ─────────────────────────────────────────────────────
  if (an.impagas.length) {
    // Por categoría: cuántos deben y cuánto. La lista completa solo si es corta.
    const porJugador = new Map<string, { nombre: string; categoria: string; cuotas: number; monto: number }>()
    const nombreDe = new Map(p.jugadores.map(j => [j.id, j]))
    for (const m of an.impagas) {
      const j = nombreDe.get(m.jugador_id)
      const f = porJugador.get(m.jugador_id) ?? { nombre: j?.nombre ?? '—', categoria: j?.categoria ?? '—', cuotas: 0, monto: 0 }
      f.cuotas++; f.monto += m.monto || 0
      porJugador.set(m.jugador_id, f)
    }
    const deudores = [...porJugador.values()].sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, 'es'))
    const porCategoria = new Map<string, { jugadores: number; monto: number }>()
    for (const d of deudores) {
      const f = porCategoria.get(d.categoria) ?? { jugadores: 0, monto: 0 }
      f.jugadores++; f.monto += d.monto
      porCategoria.set(d.categoria, f)
    }
    y = asegurar(doc, y, 60, marca, cab)
    y = seccion(doc, y, marca, 'A quién cobrarle', `${pesos(an.deudaPeriodo)} en ${deudores.length} jugador${deudores.length === 1 ? '' : 'es'}`)
    y = barras(doc, y, marca, [...porCategoria.entries()].sort((a, b) => b[1].monto - a[1].monto).map(([c, f]) => ({
      etiqueta: `${c} · ${f.jugadores}`, valor: f.monto, texto: pesos(f.monto), color: AMBAR,
    })), { titulo: 'Por categoría' })
    const TOPE = 25
    const filas = deudores.slice(0, TOPE)
    autoTable(doc, {
      ...tabla(marca, { numericas: [2, 3], anchos: { 2: 22, 3: 30 } }),
      startY: y,
      head: [['Jugador', 'Categoría', 'Cuotas', 'Debe']],
      body: filas.map(d => [d.nombre, d.categoria, String(d.cuotas), pesos(d.monto)]),
      foot: deudores.length > TOPE
        ? [[`y ${deudores.length - TOPE} más`, '', String(an.impagas.length), pesos(an.deudaPeriodo)]]
        : [['Total', '', String(an.impagas.length), pesos(an.deudaPeriodo)]],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 4
    if (an.morososQueVienen) y = nota(doc, y, `${an.morososQueVienen} de ellos siguen viniendo a entrenar: se les puede cobrar en la cancha.`)
    y += 4
  }

  // ── Plantel y asistencia ─────────────────────────────────────────────────
  if (an.activos && p.diasConAsist > 0) {
    const filas = p.activos
      .map(j => ({ nombre: j.nombre, categoria: j.categoria ?? '—', clases: an.asistPorJug.get(j.id) ?? 0 }))
      .map(f => ({ ...f, pct: Math.round((f.clases / p.diasConAsist) * 100) }))
      .sort((a, b) => b.clases - a.clases || a.nombre.localeCompare(b.nombre, 'es'))
    y = asegurar(doc, y, 50, marca, cab)
    y = seccion(doc, y, marca, 'Plantel y asistencia', `${p.diasConAsist} días con clase`)
    autoTable(doc, {
      ...tabla(marca, { numericas: [3], anchos: { 0: 10, 3: 16, 4: 44 } }),
      startY: y,
      head: [['#', 'Jugador', 'Categoría', 'Clases', 'Asistencia']],
      body: filas.map((f, i) => [String(i + 1), f.nombre, f.categoria, String(f.clases), String(f.pct)]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) data.cell.text = ['']
        if (data.section === 'head' && data.column.index === 3) data.cell.styles.halign = 'right'
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawCell: (data: any) => {
        if (data.section === 'head') {
          const c = data.cell
          data.doc.setDrawColor(...marca.acento); data.doc.setLineWidth(0.5)
          data.doc.line(c.x, c.y + c.height, c.x + c.width, c.y + c.height)
        }
        if (data.section === 'body' && data.column.index === 4) {
          const pct = filas[data.row.index]?.pct ?? 0
          barraEnCelda(data.doc, data.cell, pct, colorDePorcentaje(pct))
        }
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 4
  } else if (an.activos) {
    y = asegurar(doc, y, 20, marca, cab)
    y = seccion(doc, y, marca, 'Plantel y asistencia')
    y = nota(doc, y, 'No hay asistencia registrada en el período.')
  }

  // Firma al pie de la última sección.
  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Reporte general · ${args.periodo}`)
  return doc
}

export async function descargarReporteGeneral(args: ArgsGeneral) {
  const doc = await construirReporteGeneral(args)
  doc.save(`Reporte general — ${args.marca.club} — ${args.periodo}.pdf`)
}
