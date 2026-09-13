// Informe financiero del torneo, sobre el molde v2 (lib/pdf/papel.ts):
// cifras del cierre, hallazgos, recaudación por medio de pago, jugadores y
// su estado de pago, premios, gastos de gestión y el balance.

import type { Marca, Tono } from '@/lib/pdf/papel'
import {
  TINTA, GRIS, VERDE, ROJO, AMBAR,
  nuevoDocumento, pieDePagina, asegurar, seccion, cifras, hallazgos, barras, tabla, trasTabla, aviso, pesos, mezclar,
} from '@/lib/pdf/papel'

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
  /** Fecha del torneo, para el subtítulo. */
  fecha?: string | null
}

/** Lo que el informe dice en frases. Separado para poder probarlo. */
export function analizarInforme(d: InformeFinanciero): Array<{ texto: string; tono: Tono }> {
  const totalPremios = d.premios.reduce((s, p) => s + (p.monto || 0), 0)
  const totalGastos = d.gastos.reduce((s, g) => s + (g.monto || 0), 0)
  const neto = d.recaudado - totalPremios - totalGastos
  const pendientes = d.jugadores.filter(j => j.estado === 'pendiente')
  const exentos = d.jugadores.filter(j => j.estado === 'exento')
  const lista: Array<{ texto: string; tono: Tono }> = []

  if (d.cuota <= 0) {
    lista.push({ texto: 'El torneo no tuvo cuota de inscripción.', tono: 'info' })
  } else {
    const pct = d.totalInscritos ? Math.round((d.pagados / d.totalInscritos) * 100) : 0
    lista.push({
      texto: `Pagaron ${d.pagados} de ${d.totalInscritos} inscritos (${pct}%)${pendientes.length ? `; quedan ${pesos(pendientes.length * d.cuota)} por cobrar a ${pendientes.length} jugador${pendientes.length === 1 ? '' : 'es'}` : ''}.`,
      tono: pendientes.length ? 'ojo' : 'bien',
    })
  }
  if (exentos.length) {
    lista.push({ texto: `${exentos.length} jugador${exentos.length === 1 ? ' se retiró y quedó exento' : 'es se retiraron y quedaron exentos'} de la cuota.`, tono: 'info' })
  }
  if (d.recaudado > 0) {
    const pctEfectivo = Math.round((d.recaudadoEfectivo / d.recaudado) * 100)
    lista.push({ texto: `El ${pctEfectivo}% de la recaudación entró en efectivo y el ${100 - pctEfectivo}% por transferencia.`, tono: 'info' })
  }
  if (totalPremios + totalGastos > 0) {
    lista.push({
      texto: neto >= 0
        ? `Descontados premios (${pesos(totalPremios)}) y gastos (${pesos(totalGastos)}), el torneo deja ${pesos(neto)} al club.`
        : `Los premios (${pesos(totalPremios)}) y gastos (${pesos(totalGastos)}) superan lo recaudado: el torneo cuesta ${pesos(-neto)} al club.`,
      tono: neto >= 0 ? 'bien' : 'mal',
    })
  }
  if (d.recaudadoPendienteSubir > 0) {
    lista.push({ texto: `Hay ${pesos(d.recaudadoPendienteSubir)} cobrados que todavía no se subieron a Finanzas.`, tono: 'mal' })
  }
  if (d.gastos.length && !d.gastosRegistradosEnFinanzas) {
    lista.push({ texto: 'Los gastos de gestión aún no están registrados en Finanzas: use "Guardar premios" para subirlos.', tono: 'ojo' })
  }
  return lista
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function construirInformeFinanciero(d: InformeFinanciero, marca: Marca): Promise<any> {
  const totalPremios = d.premios.reduce((s, p) => s + (p.monto || 0), 0)
  const totalGastos = d.gastos.reduce((s, g) => s + (g.monto || 0), 0)
  const neto = d.recaudado - totalPremios - totalGastos
  // `d.recaudado` cuenta TODO pago que se hizo alguna vez en este torneo,
  // incluido el de alguien que después se retiró (torneo_pagos no se toca al
  // sacar a un jugador: si ya pagó, la plata queda registrada a propósito).
  // El pendiente se cuenta directo de `d.jugadores`, que ya viene acotado a
  // quien sigue inscrito.
  const pendientes = d.jugadores.filter(j => j.estado === 'pendiente')
  const pendienteCobro = pendientes.length * d.cuota

  const cab = { titulo: 'Informe financiero', subtitulo: d.torneoNombre + (d.fecha ? ` · ${d.fecha}` : ''), nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cab)
  let y = y0

  // ── Cómo cerró ───────────────────────────────────────────────────────────
  y = cifras(doc, y, marca, [
    { etiqueta: 'Recaudado', valor: pesos(d.recaudado), detalle: `${d.pagados} de ${d.totalInscritos} pagaron`, color: VERDE },
    { etiqueta: 'Por cobrar', valor: pendienteCobro > 0 ? pesos(pendienteCobro) : 'Sin deuda', detalle: pendientes.length ? `${pendientes.length} jugador${pendientes.length === 1 ? '' : 'es'}` : 'todos al día', color: pendienteCobro > 0 ? AMBAR : VERDE },
    { etiqueta: 'Premios y gastos', valor: pesos(totalPremios + totalGastos), detalle: `${pesos(totalPremios)} en premios`, color: ROJO },
    { etiqueta: 'Resultado', valor: pesos(neto), detalle: 'queda para el club', color: neto >= 0 ? VERDE : ROJO },
  ])

  if (d.recaudadoPendienteSubir > 0) {
    y = aviso(doc, y, `Todavía hay ${pesos(d.recaudadoPendienteSubir)} recaudados sin subir a Finanzas.`)
  }

  y = seccion(doc, y, marca, 'Hallazgos')
  y = hallazgos(doc, y, analizarInforme(d))

  // ── Recaudación ──────────────────────────────────────────────────────────
  y = asegurar(doc, y, 45, marca, cab)
  y = seccion(doc, y, marca, 'Recaudación', d.cuota > 0 ? `cuota ${pesos(d.cuota)} por jugador` : 'sin cuota')
  if (d.recaudado > 0) {
    y = barras(doc, y, marca, [
      { etiqueta: 'Efectivo', valor: d.recaudadoEfectivo, texto: pesos(d.recaudadoEfectivo), color: VERDE },
      { etiqueta: 'Transferencia', valor: d.recaudadoTransferencia, texto: pesos(d.recaudadoTransferencia), color: mezclar(VERDE, 0.6) },
      ...(pendienteCobro > 0 ? [{ etiqueta: 'Por cobrar', valor: pendienteCobro, texto: pesos(pendienteCobro), color: AMBAR }] : []),
    ])
  }

  // ── Jugadores ────────────────────────────────────────────────────────────
  const etiqueta = (j: Jugador) => (j.estado === 'pagado' ? 'Pagado' : j.estado === 'exento' ? 'Exento' : 'Pendiente')
  const ordenados = [...d.jugadores].sort((a, b) => {
    const peso = { pendiente: 0, pagado: 1, exento: 2 }
    return peso[a.estado] - peso[b.estado] || a.nombre.localeCompare(b.nombre, 'es')
  })
  y = asegurar(doc, y, 40, marca, cab)
  y = seccion(doc, y, marca, 'Jugadores', `${d.jugadores.length} inscritos · ${d.pagados} pagados${pendientes.length ? ` · ${pendientes.length} pendientes` : ''}`)
  autoTable(doc, {
    ...tabla(marca, {
      numericas: [3], anchos: { 1: 28, 2: 32, 3: 28 },
      alParsear: data => {
        if (data.section !== 'body' || data.column.index !== 1) return
        const j = ordenados[data.row.index]
        data.cell.styles.textColor = j?.estado === 'pagado' ? VERDE : j?.estado === 'exento' ? GRIS : ROJO
        data.cell.styles.fontStyle = 'bold'
      },
    }),
    startY: y,
    head: [['Jugador', 'Estado', 'Medio de pago', 'Monto']],
    body: ordenados.map(j => [
      j.nombre, etiqueta(j),
      j.estado === 'pagado' ? (j.metodoPago === 'transferencia' ? 'Transferencia' : 'Efectivo') : '—',
      j.estado === 'pagado' ? pesos(d.cuota) : '—',
    ]),
    foot: [['Total recaudado', '', '', pesos(d.recaudado)]],
  })
  y = trasTabla(doc)

  // ── Premios ──────────────────────────────────────────────────────────────
  const premios = d.premios.filter(p => (p.monto || 0) > 0)
  if (premios.length) {
    const metodo = d.metodoPremio === 'transferencia' ? 'Transferencia' : 'Efectivo'
    y = asegurar(doc, y, 40, marca, cab)
    y = seccion(doc, y, marca, 'Premios entregados', `pagados en ${metodo.toLowerCase()}`)
    autoTable(doc, {
      ...tabla(marca, { numericas: [2], anchos: { 0: 44, 2: 30 } }),
      startY: y,
      head: [['Premio', 'Jugador', 'Monto']],
      body: premios.map(p => [p.lugar, p.nombre || '—', pesos(p.monto || 0)]),
      foot: [['Total premios', '', pesos(totalPremios)]],
    })
    y = trasTabla(doc)
  }

  // ── Gastos de gestión ────────────────────────────────────────────────────
  if (d.gastos.length) {
    y = asegurar(doc, y, 40, marca, cab)
    y = seccion(doc, y, marca, 'Gastos de gestión', d.gastosRegistradosEnFinanzas ? 'registrados en Finanzas' : 'sin registrar en Finanzas')
    autoTable(doc, {
      ...tabla(marca, { numericas: [1], anchos: { 1: 30 } }),
      startY: y,
      head: [['Gasto', 'Monto']],
      body: d.gastos.map(g => [g.tipo, pesos(g.monto)]),
      foot: [['Total gastos', pesos(totalGastos)]],
    })
    y = trasTabla(doc)
  }

  // ── Balance ──────────────────────────────────────────────────────────────
  y = asegurar(doc, y, 45, marca, cab)
  y = seccion(doc, y, marca, 'Balance')
  const filas: Array<[string, string]> = [
    ['Recaudado por inscripciones', pesos(d.recaudado)],
    ['Premios', `− ${pesos(totalPremios)}`],
    ['Gastos de gestión', `− ${pesos(totalGastos)}`],
  ]
  autoTable(doc, {
    ...tabla(marca, {
      numericas: [1], anchos: { 1: 40 },
      alParsear: data => {
        if (data.section === 'body' && data.column.index === 1) data.cell.styles.textColor = data.row.index === 0 ? VERDE : ROJO
        if (data.section === 'foot' && data.column.index === 1) data.cell.styles.textColor = neto >= 0 ? VERDE : ROJO
      },
    }),
    startY: y,
    head: [['Concepto', 'Monto']],
    body: filas,
    foot: [['Queda para el club', pesos(neto)]],
  })

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Informe financiero · ${d.torneoNombre}`)
  return doc
}

export async function descargarInformeFinancieroPdf(d: InformeFinanciero, marca: Marca) {
  const doc = await construirInformeFinanciero(d, marca)
  const nombre = d.torneoNombre.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').trim() || 'torneo'
  doc.save(`Informe financiero — ${nombre}.pdf`)
}
