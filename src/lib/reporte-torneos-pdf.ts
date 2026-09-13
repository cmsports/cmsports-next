// Reporte de Torneos y ligas, versión 2 — la actividad competitiva del club.
//
//   1. Cómo estuvo el período: torneos, participantes, partidos, resultado.
//   2. Hallazgos.
//   3. Torneos del período, uno por fila: modalidad, inscritos, avance, campeón.
//   4. Balance por torneo: inscripciones, premios, otros gastos, resultado.
//   5. Ligas: divisiones, jugadores, fechas, avance.
//   6. Jugadores con más participación.

import type { Marca, Tono, RGB } from '@/lib/pdf/papel'
import {
  TINTA, GRIS, GRIS_CLARO, VERDE, ROJO, AMBAR, AZUL,
  prepararFuentes, portada, pieDePagina, asegurar, seccion, cifras, hallazgos, barras, columnas, tabla,
  barraEnCelda, colorDePorcentaje, pesos, nota,
} from '@/lib/pdf/papel'
import { modalidadDe, MODALIDAD_LABEL } from '@/lib/domain/modalidadTorneo'

export interface TorneoResumen {
  id: string
  nombre: string
  estado: string
  fase?: string | null
  tipo?: string | null
  formato?: string | null
  fecha_inicio?: string | null
  categoria?: string | null
  cuota_inscripcion?: number | null
  campeon?: string | null
  subcampeon?: string | null
  participantes: Array<{ id: string; nombre: string }>
  partidosTotal: number
  partidosJugados: number
}

export interface LigaResumen {
  id: string
  nombre: string
  estado: string
  divisiones: Array<{ nombre: string; jugadores: number }>
  fechas: number
  partidosTotal: number
  partidosJugados: number
}

export interface DatosTorneos {
  torneos: TorneoResumen[]
  ligas: LigaResumen[]
  /** Movimientos de torneos (por torneo_id) y de ligas (por categoría) del período. */
  movimientos: Array<{ tipo: string; monto: number; categoria: string; fecha: string; torneo_id?: string | null; descripcion?: string | null }>
  torneosPrev: number | null
  tituloPrev: string
}

export interface ArgsTorneos {
  marca: Marca
  periodo: string
  generado: string
  datos: DatosTorneos
}

const ESTADO: Record<string, { texto: string; color: RGB }> = {
  en_curso: { texto: 'En curso', color: AZUL },
  finalizado: { texto: 'Finalizado', color: VERDE },
  finalizada: { texto: 'Finalizada', color: VERDE },
  planificacion: { texto: 'En planificación', color: AMBAR },
  cancelado: { texto: 'Cancelado', color: ROJO },
  archivado: { texto: 'Archivado', color: GRIS },
}
const estadoDe = (e: string) => ESTADO[e] ?? { texto: e, color: GRIS }
const FASE: Record<string, string> = { inscripcion: 'inscripción', grupos: 'fase de grupos', llave: 'llave', eliminacion: 'llave', finalizado: 'finalizado' }
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const diaCorto = (iso?: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MESES_CORTO[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}` : '—')
const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0)

/** Nombre corto de la modalidad: "Grupos + llave", "Liguilla", … */
export function modalidadTexto(t: TorneoResumen): string {
  return MODALIDAD_LABEL[modalidadDe(t.formato)] + (t.tipo === 'interno' ? ' · interno' : '')
}

/** Ingresos, gastos y resultado de cada torneo y de las ligas. */
export function balancePorTorneo(p: DatosTorneos) {
  const porTorneo = new Map<string, { inscripciones: number; premios: number; otros: number }>()
  const ligas = { inscripciones: 0, premios: 0, otros: 0 }
  for (const m of p.movimientos) {
    const destino = m.torneo_id ? (porTorneo.get(m.torneo_id) ?? { inscripciones: 0, premios: 0, otros: 0 }) : ligas
    if (m.tipo === 'ingreso') destino.inscripciones += m.monto
    else if (m.categoria === 'premio_torneo' || m.categoria === 'premio_liga') destino.premios += m.monto
    else destino.otros += m.monto
    if (m.torneo_id) porTorneo.set(m.torneo_id, destino)
  }
  const filas = p.torneos.map(t => ({ nombre: t.nombre, ...(porTorneo.get(t.id) ?? { inscripciones: 0, premios: 0, otros: 0 }) }))
  if (ligas.inscripciones || ligas.premios || ligas.otros) filas.push({ nombre: 'Ligas', ...ligas })
  const conMovimiento = filas.filter(f => f.inscripciones || f.premios || f.otros)
  const total = conMovimiento.reduce((s, f) => ({ inscripciones: s.inscripciones + f.inscripciones, premios: s.premios + f.premios, otros: s.otros + f.otros }), { inscripciones: 0, premios: 0, otros: 0 })
  return { filas: conMovimiento, total, resultado: total.inscripciones - total.premios - total.otros }
}

/** Cuántos torneos jugó cada persona, de mayor a menor. */
export function participacion(p: DatosTorneos): Array<{ id: string; nombre: string; torneos: number }> {
  const conteo = new Map<string, { id: string; nombre: string; torneos: number }>()
  for (const t of p.torneos) {
    for (const j of t.participantes) {
      const c = conteo.get(j.id) ?? { id: j.id, nombre: j.nombre, torneos: 0 }
      c.torneos++
      conteo.set(j.id, c)
    }
  }
  return [...conteo.values()].sort((a, b) => b.torneos - a.torneos || a.nombre.localeCompare(b.nombre, 'es'))
}

export function analizarTorneos(p: DatosTorneos): Array<{ texto: string; tono: Tono }> {
  const lista: Array<{ texto: string; tono: Tono }> = []
  if (!p.torneos.length && !p.ligas.length) return [{ texto: 'No hubo torneos ni ligas en el período.', tono: 'neutro' }]

  const finalizados = p.torneos.filter(t => t.estado === 'finalizado')
  const enCurso = p.torneos.filter(t => t.estado === 'en_curso')
  const cancelados = p.torneos.filter(t => t.estado === 'cancelado')
  if (p.torneos.length) {
    const partes = [
      finalizados.length ? `${finalizados.length} finalizado${finalizados.length === 1 ? '' : 's'}` : '',
      enCurso.length ? `${enCurso.length} en curso` : '',
      cancelados.length ? `${cancelados.length} cancelado${cancelados.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(', ')
    const v = p.torneosPrev ? p.torneos.length - p.torneosPrev : null
    lista.push({
      texto: `Se organizaron ${p.torneos.length} torneo${p.torneos.length === 1 ? '' : 's'} (${partes})${v !== null && v !== 0 ? `, ${Math.abs(v)} ${v > 0 ? 'más' : 'menos'} que en ${p.tituloPrev}` : ''}.`,
      tono: v !== null && v < 0 ? 'ojo' : 'info',
    })
  }

  const jugadores = participacion(p)
  if (jugadores.length) {
    const repiten = jugadores.filter(j => j.torneos >= 2).length
    lista.push({
      texto: `${jugadores.length} jugador${jugadores.length === 1 ? '' : 'es'} distinto${jugadores.length === 1 ? '' : 's'} compitieron en torneos${repiten ? `; ${repiten} lo hicieron en más de uno` : ''}.`,
      tono: 'info',
    })
  }

  const pendientes = enCurso.filter(t => t.partidosTotal > 0 && t.partidosJugados < t.partidosTotal)
  for (const t of pendientes.slice(0, 2)) {
    lista.push({ texto: `${t.nombre} lleva ${pct(t.partidosJugados, t.partidosTotal)}% de sus partidos jugados (${t.partidosJugados} de ${t.partidosTotal}).`, tono: 'ojo' })
  }

  const chicos = p.torneos.filter(t => t.estado !== 'cancelado' && t.participantes.length > 0 && t.participantes.length < 8)
  if (chicos.length) {
    lista.push({ texto: `${chicos.length} torneo${chicos.length === 1 ? ' tuvo' : 's tuvieron'} menos de 8 inscritos${chicos.length === 1 ? ` (${chicos[0].nombre}, ${chicos[0].participantes.length})` : ''}.`, tono: 'ojo' })
  }

  const b = balancePorTorneo(p)
  if (b.filas.length) {
    lista.push({
      texto: b.resultado >= 0
        ? `La competencia dejó un resultado positivo de ${pesos(b.resultado)}: ${pesos(b.total.inscripciones)} en inscripciones contra ${pesos(b.total.premios + b.total.otros)} en premios y gastos.`
        : `La competencia cerró con pérdida de ${pesos(-b.resultado)}: los premios y gastos (${pesos(b.total.premios + b.total.otros)}) superaron a las inscripciones (${pesos(b.total.inscripciones)}).`,
      tono: b.resultado >= 0 ? 'bien' : 'mal',
    })
  } else if (p.torneos.some(t => (t.cuota_inscripcion ?? 0) > 0)) {
    lista.push({ texto: 'Ningún torneo del período tiene sus pagos subidos a Finanzas todavía.', tono: 'ojo' })
  }

  for (const l of p.ligas.filter(l => l.estado === 'en_curso').slice(0, 2)) {
    lista.push({ texto: `${l.nombre} lleva ${pct(l.partidosJugados, l.partidosTotal)}% de avance (${l.partidosJugados} de ${l.partidosTotal} partidos) con ${l.divisiones.reduce((s, d) => s + d.jugadores, 0)} jugadores en ${l.divisiones.length} divisi${l.divisiones.length === 1 ? 'ón' : 'ones'}.`, tono: 'info' })
  }
  return lista
}


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
export async function construirReporteTorneos(args: ArgsTorneos): Promise<any> {
  const { marca, datos: p } = args
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  await prepararFuentes(doc)
  const cab = { titulo: 'Reporte de torneos y ligas', subtitulo: args.periodo, nota: `Generado el ${args.generado}` }
  let y = portada(doc, marca, cab)

  const jugadores = participacion(p)
  const partidosJugados = p.torneos.reduce((s, t) => s + t.partidosJugados, 0) + p.ligas.reduce((s, l) => s + l.partidosJugados, 0)
  const partidosTotal = p.torneos.reduce((s, t) => s + t.partidosTotal, 0) + p.ligas.reduce((s, l) => s + l.partidosTotal, 0)
  const balance = balancePorTorneo(p)
  const finalizados = p.torneos.filter(t => t.estado === 'finalizado').length
  const enCurso = p.torneos.filter(t => t.estado === 'en_curso').length

  // ── 1. Cómo estuvo el período ────────────────────────────────────────────
  y = cifras(doc, y, marca, [
    { etiqueta: 'Torneos', valor: String(p.torneos.length), detalle: p.torneos.length ? `${finalizados} finalizados · ${enCurso} en curso` : 'ninguno en el período' },
    { etiqueta: 'Participantes', valor: jugadores.length ? String(jugadores.length) : '—', detalle: 'jugadores distintos', color: AZUL },
    { etiqueta: 'Partidos jugados', valor: partidosTotal ? String(partidosJugados) : '—', detalle: `de ${partidosTotal} programados`, color: VERDE },
    { etiqueta: 'Resultado', valor: balance.filas.length ? pesos(balance.resultado) : '—', detalle: 'neto de premios y gastos', color: balance.resultado >= 0 ? VERDE : ROJO },
  ])

  // ── 2. Hallazgos ─────────────────────────────────────────────────────────
  y = seccion(doc, y, marca, 'Hallazgos del período')
  y = hallazgos(doc, y, analizarTorneos(p))

  // ── 3. Torneos ───────────────────────────────────────────────────────────
  if (p.torneos.length) {
    y = asegurar(doc, y, 50, marca, cab)
    y = seccion(doc, y, marca, 'Torneos del período', `${p.torneos.length} torneo${p.torneos.length === 1 ? '' : 's'}`)
    autoTable(doc, {
      ...tabla(marca, { numericas: [3], anchos: { 1: 22, 2: 28, 3: 16, 4: 24, 5: 30, 6: 22 } }),
      startY: y,
      head: [['Torneo', 'Fecha', 'Modalidad', 'Inscritos', 'Avance', 'Campeón', 'Estado']],
      body: p.torneos.map(t => [
        t.nombre + (t.categoria ? `\n${t.categoria}` : ''), diaCorto(t.fecha_inicio), modalidadTexto(t), String(t.participantes.length),
        String(pct(t.partidosJugados, t.partidosTotal)), t.campeon || (t.estado === 'finalizado' ? '—' : (FASE[t.fase ?? ''] ? `en ${FASE[t.fase ?? '']}` : '—')), estadoDe(t.estado).texto,
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => {
        if (d.section === 'head' && d.column.index === 3) d.cell.styles.halign = 'right'
        if (d.section !== 'body') return
        const t = p.torneos[d.row.index]
        if (d.column.index === 4) d.cell.styles.textColor = [255, 255, 255]
        if (d.column.index === 6 && t) { d.cell.styles.textColor = estadoDe(t.estado).color; d.cell.styles.fontStyle = 'bold' }
        if (d.column.index === 5 && t && !t.campeon) d.cell.styles.textColor = GRIS_CLARO
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawCell: (d: any) => {
        lineaCabecera(marca)(d)
        if (d.section !== 'body' || d.column.index !== 4) return
        const t = p.torneos[d.row.index]
        if (!t || !t.partidosTotal) return
        const v = pct(t.partidosJugados, t.partidosTotal)
        barraEnCelda(doc, d.cell, v, v === 100 ? VERDE : marca.acento)
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10
  }

  // ── 4. Balance por torneo ────────────────────────────────────────────────
  if (balance.filas.length) {
    y = asegurar(doc, y, 60 + balance.filas.length * 8, marca, cab)
    y = seccion(doc, y, marca, 'Balance por torneo', 'según lo subido a Finanzas')
    if (balance.filas.length <= 8) {
      y = columnas(doc, y + 2, balance.filas.map(f => ({ etiqueta: f.nombre.length > 18 ? f.nombre.slice(0, 17) + '…' : f.nombre, valores: [f.inscripciones, f.premios + f.otros] })), [{ nombre: 'Inscripciones', color: VERDE }, { nombre: 'Premios y gastos', color: ROJO }], { alto: 34, formato: n => `$${Math.round(n / 1000)}k` })
    }
    autoTable(doc, {
      ...tabla(marca, { numericas: [1, 2, 3, 4], anchos: { 1: 30, 2: 28, 3: 28, 4: 30 } }),
      startY: y,
      head: [['Torneo', 'Inscripciones', 'Premios', 'Otros gastos', 'Resultado']],
      body: balance.filas.map(f => [f.nombre, pesos(f.inscripciones), f.premios ? pesos(f.premios) : '—', f.otros ? pesos(f.otros) : '—', pesos(f.inscripciones - f.premios - f.otros)]),
      foot: [['Total', pesos(balance.total.inscripciones), pesos(balance.total.premios), pesos(balance.total.otros), pesos(balance.resultado)]],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => {
        if (d.section === 'head' && [1, 2, 3, 4].includes(d.column.index)) d.cell.styles.halign = 'right'
        if (d.column.index !== 4 || d.section === 'head') return
        const f = balance.filas[d.row.index]
        const neto = d.section === 'foot' ? balance.resultado : f ? f.inscripciones - f.premios - f.otros : 0
        d.cell.styles.textColor = neto < 0 ? ROJO : VERDE
        d.cell.styles.fontStyle = 'bold'
      },
      didDrawCell: lineaCabecera(marca),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10
  }

  // ── 5. Ligas ─────────────────────────────────────────────────────────────
  if (p.ligas.length) {
    y = asegurar(doc, y, 50, marca, cab)
    y = seccion(doc, y, marca, 'Ligas', `${p.ligas.length} liga${p.ligas.length === 1 ? '' : 's'} del club`)
    autoTable(doc, {
      ...tabla(marca, { numericas: [2, 3, 4], anchos: { 1: 28, 2: 22, 3: 22, 4: 18, 5: 40 } }),
      startY: y,
      head: [['Liga', 'Estado', 'Divisiones', 'Jugadores', 'Fechas', 'Avance']],
      body: p.ligas.map(l => [l.nombre, estadoDe(l.estado).texto, String(l.divisiones.length), String(l.divisiones.reduce((s, d) => s + d.jugadores, 0)), String(l.fechas), String(pct(l.partidosJugados, l.partidosTotal))]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => {
        if (d.section === 'head' && [2, 3, 4].includes(d.column.index)) d.cell.styles.halign = 'right'
        if (d.section !== 'body') return
        const l = p.ligas[d.row.index]
        if (d.column.index === 1 && l) { d.cell.styles.textColor = estadoDe(l.estado).color; d.cell.styles.fontStyle = 'bold' }
        if (d.column.index === 5) d.cell.styles.textColor = [255, 255, 255]
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawCell: (d: any) => {
        lineaCabecera(marca)(d)
        if (d.section !== 'body' || d.column.index !== 5) return
        const l = p.ligas[d.row.index]
        if (!l || !l.partidosTotal) return
        const v = pct(l.partidosJugados, l.partidosTotal)
        barraEnCelda(doc, d.cell, v, v === 100 ? VERDE : marca.acento)
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 6
    const divisiones = p.ligas.flatMap(l => l.divisiones.map(d => ({ etiqueta: p.ligas.length > 1 ? `${l.nombre} · ${d.nombre}` : d.nombre, valor: d.jugadores })))
    if (divisiones.length > 1) {
      y = asegurar(doc, y, 12 + divisiones.length * 7.2, marca, cab)
      y = barras(doc, y, marca, divisiones.map(d => ({ ...d, texto: `${d.valor} jugadores` })), { titulo: 'Jugadores por división', anchoEtiqueta: 70 })
    }
    y = nota(doc, y, 'Las ligas se muestran completas, no por período: una liga abarca varios meses.')
  }

  // ── 6. Participación ─────────────────────────────────────────────────────
  if (jugadores.length) {
    const top = jugadores.slice(0, 10)
    y = asegurar(doc, y, 20 + top.length * 7.2, marca, cab)
    y = seccion(doc, y, marca, 'Jugadores con más participación', `${jugadores.length} en total`)
    y = barras(doc, y, marca, top.map(j => ({ etiqueta: j.nombre, valor: j.torneos, texto: `${j.torneos} torneo${j.torneos === 1 ? '' : 's'}`, color: colorDePorcentaje(pct(j.torneos, p.torneos.length)) })))
  }

  if (!p.torneos.length && !p.ligas.length) y = nota(doc, y, 'No hay nada más que mostrar.')

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Reporte de torneos y ligas · ${args.periodo}`)
  return doc
}

export async function descargarReporteTorneos(args: ArgsTorneos) {
  const doc = await construirReporteTorneos(args)
  doc.save(`Reporte de torneos y ligas — ${args.marca.club} — ${args.periodo}.pdf`)
}
