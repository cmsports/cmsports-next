// Reporte de Asistencia, versión 2 — para el profesor y el administrador.
//
//   1. Cómo estuvo el período: asistencias, días con clase, promedio por
//      clase, asistencia promedio del plantel (cada jugador contra SUS días).
//   2. Hallazgos: lo que hay que mirar, en una frase cada uno.
//   3. Semana a semana (tendencia) y por día de la semana.
//   4. Por grupo: qué bloques se llenan y cuáles no.
//   5. Jugadores que requieren atención: los que van bajo el 50% o no vinieron.
//   6. Plantel completo, jugador por jugador, con su porcentaje.
//   7. Historial detallado (quién, qué día, qué bloque, qué sede), para archivo.

import type { Marca, Tono, RGB } from '@/lib/pdf/papel'
import {
  TINTA, GRIS, GRIS_CLARO, VERDE, ROJO, AMBAR, AZUL,
  prepararFuentes, portada, pieDePagina, asegurar, seccion, cifras, hallazgos, barras, columnas, anillo, tabla,
  barraEnCelda, colorDePorcentaje, mezclar, nota, MARGEN,
} from '@/lib/pdf/papel'

export interface JugadorActivo {
  id: string
  nombre: string
  categoria?: string | null
  /** Días de entrenamiento (0 = domingo … 6 = sábado). Vacío: se asume todos los días con clase. */
  dias: number[]
}

export interface DatosAsistencia {
  desde: string
  /** Último día que cuenta (el fin del período o hoy, lo que venga primero). */
  hasta: string
  totalAsist: number
  totalPrev: number | null
  tituloPrev: string
  porDia: Record<string, number>
  porDiaSemana: Record<number, number>
  activos: JugadorActivo[]
  porJugador: Record<string, { nombre: string; count: number }>
  historialDetallado: Array<{ jugadorNombre: string; fecha: string; bloqueNombre: string; horario: string; sede: string; inferido?: boolean; bloqueId?: string | null }>
}

export interface ArgsAsistencia {
  marca: Marca
  periodo: string
  generado: string
  datos: DatosAsistencia
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10)
}
function diaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`
const diaCorto = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES_CORTO[Number(iso.slice(5, 7)) - 1]}`
const variacion = (actual: number, previo: number | null): number | null => (previo ? Math.round(((actual - previo) / previo) * 100) : null)

/** Cuántos días de clase tuvo cada jugador en el período, según sus días. */
export function clasesEsperadas(j: JugadorActivo, desde: string, hasta: string, diasConClase: Set<number>): number {
  let n = 0
  const dias = j.dias.length ? new Set(j.dias) : diasConClase
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) if (dias.has(diaSemana(d))) n++
  return n
}

/** El plantel con su asistencia: clases, esperadas y porcentaje, de mayor a menor. */
export function evaluarPlantel(p: DatosAsistencia) {
  const diasConClase = new Set(Object.keys(p.porDia).map(diaSemana))
  return p.activos.map(j => {
    const clases = p.porJugador[j.id]?.count ?? 0
    const esperadas = clasesEsperadas(j, p.desde, p.hasta, diasConClase)
    // Si vino más veces de las esperadas (reemplazos, clases extra), 100%.
    const pct = esperadas > 0 ? Math.min(100, Math.round((clases / esperadas) * 100)) : (clases > 0 ? 100 : 0)
    return { ...j, clases, esperadas, pct }
  }).sort((a, b) => b.pct - a.pct || b.clases - a.clases || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Asistencias agrupadas por semana (lunes a domingo). */
export function porSemana(porDia: Record<string, number>, desde: string, hasta: string): Array<{ inicio: string; total: number }> {
  const dow = (diaSemana(desde) + 6) % 7
  const semanas: Array<{ inicio: string; total: number }> = []
  for (let ini = sumarDias(desde, -dow); ini <= hasta; ini = sumarDias(ini, 7)) {
    let total = 0
    for (let k = 0; k < 7; k++) total += porDia[sumarDias(ini, k)] ?? 0
    semanas.push({ inicio: ini, total })
  }
  return semanas
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

/** Los hallazgos del período, en frases. Separado para poder probarlo. */
export function analizarAsistencia(p: DatosAsistencia): Array<{ texto: string; tono: Tono }> {
  const plantel = evaluarPlantel(p)
  const lista: Array<{ texto: string; tono: Tono }> = []
  const diasUnicos = Object.keys(p.porDia).length
  if (!diasUnicos) return [{ texto: 'No se registró asistencia en el período.', tono: 'neutro' }]

  const v = variacion(p.totalAsist, p.totalPrev)
  if (v !== null && Math.abs(v) >= 10) {
    lista.push({ texto: `Las asistencias ${v > 0 ? 'subieron' : 'bajaron'} un ${Math.abs(v)}% respecto de ${p.tituloPrev} (${p.totalPrev} → ${p.totalAsist}).`, tono: v > 0 ? 'bien' : 'mal' })
  } else if (v !== null) {
    lista.push({ texto: `Las asistencias se mantuvieron en el nivel de ${p.tituloPrev} (${p.totalPrev} → ${p.totalAsist}).`, tono: 'info' })
  }

  const promedioPlantel = plantel.length ? Math.round(plantel.reduce((s, j) => s + j.pct, 0) / plantel.length) : 0
  if (plantel.length) {
    lista.push({
      texto: `La asistencia promedio del plantel fue ${promedioPlantel}% de las clases programadas para cada jugador.`,
      tono: promedioPlantel >= 75 ? 'bien' : promedioPlantel >= 50 ? 'ojo' : 'mal',
    })
  }

  const sinVenir = plantel.filter(j => j.clases === 0)
  if (sinVenir.length) {
    const nombres = sinVenir.slice(0, 3).map(j => j.nombre).join(', ')
    lista.push({ texto: `${sinVenir.length} jugador${sinVenir.length === 1 ? ' activo no asistió' : 'es activos no asistieron'} ni una vez${sinVenir.length <= 3 ? `: ${nombres}.` : ` (entre ellos ${nombres}).`}`, tono: 'mal' })
  }
  const bajos = plantel.filter(j => j.clases > 0 && j.pct < 50)
  if (bajos.length) {
    lista.push({ texto: `${bajos.length} jugador${bajos.length === 1 ? ' está' : 'es están'} bajo el 50% de asistencia y conviene conversar con ${bajos.length === 1 ? 'él o ella' : 'ellos'} antes de que se descuelguen.`, tono: 'ojo' })
  }

  const dias = Object.entries(p.porDiaSemana).map(([d, n]) => ({ d: Number(d), n })).filter(x => x.n > 0)
  if (dias.length >= 2) {
    const max = [...dias].sort((a, b) => b.n - a.n)[0]
    const min = [...dias].sort((a, b) => a.n - b.n)[0]
    lista.push({ texto: `El día más concurrido fue el ${DIAS[max.d].toLowerCase()} (${max.n} asistencias) y el menos concurrido el ${DIAS[min.d].toLowerCase()} (${min.n}).`, tono: 'info' })
  }

  const semanas = porSemana(p.porDia, p.desde, p.hasta).filter(s => s.total > 0)
  if (semanas.length >= 4) {
    const mitad = Math.floor(semanas.length / 2)
    const prim = semanas.slice(0, mitad).reduce((s, w) => s + w.total, 0) / mitad
    const seg = semanas.slice(mitad).reduce((s, w) => s + w.total, 0) / (semanas.length - mitad)
    const cambio = prim > 0 ? Math.round(((seg - prim) / prim) * 100) : 0
    if (Math.abs(cambio) >= 15) {
      lista.push({ texto: `La segunda mitad del período tuvo un ${Math.abs(cambio)}% ${cambio > 0 ? 'más' : 'menos'} de asistencias por semana que la primera.`, tono: cambio > 0 ? 'bien' : 'ojo' })
    }
  }
  return lista
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function construirReporteAsistencia(args: ArgsAsistencia): Promise<any> {
  const { marca, datos: p } = args
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  await prepararFuentes(doc)
  const W = doc.internal.pageSize.getWidth()
  const cab = { titulo: 'Reporte de asistencia', subtitulo: args.periodo, nota: `Generado el ${args.generado}` }
  let y = portada(doc, marca, cab)

  const plantel = evaluarPlantel(p)
  const diasUnicos = Object.keys(p.porDia).length
  const promedioClase = diasUnicos ? Math.round(p.totalAsist / diasUnicos) : 0
  const promedioPlantel = plantel.length ? Math.round(plantel.reduce((s, j) => s + j.pct, 0) / plantel.length) : 0
  const sinVenir = plantel.filter(j => j.clases === 0)

  // ── 1. Cómo estuvo el período ────────────────────────────────────────────
  y = cifras(doc, y, marca, [
    { etiqueta: 'Asistencias', valor: String(p.totalAsist), variacion: variacion(p.totalAsist, p.totalPrev), detalle: p.totalPrev !== null ? `vs ${p.tituloPrev}` : undefined },
    { etiqueta: 'Días con clase', valor: String(diasUnicos), detalle: diasUnicos ? `${diaCorto(p.desde)} – ${diaCorto(p.hasta)}` : undefined, color: AZUL },
    { etiqueta: 'Promedio por clase', valor: String(promedioClase), detalle: `sobre ${p.activos.length} activos`, color: VERDE },
    { etiqueta: 'Asistencia media', valor: plantel.length ? `${promedioPlantel}%` : '—', detalle: 'de sus clases programadas', color: colorDePorcentaje(promedioPlantel) },
  ])

  // ── 2. Hallazgos ─────────────────────────────────────────────────────────
  y = seccion(doc, y, marca, 'Hallazgos del período')
  y = hallazgos(doc, y, analizarAsistencia(p))

  if (!diasUnicos) {
    y = nota(doc, y, 'Sin asistencias registradas no hay nada más que mostrar.')
    pieDePagina(doc, marca, `Reporte de asistencia · ${args.periodo}`)
    return doc
  }

  // ── 3. Tendencia y día de la semana ──────────────────────────────────────
  // Las semanas vacías de los bordes (un período que parte en sábado, por
  // ejemplo) no dicen nada y se sacan.
  const todas = porSemana(p.porDia, p.desde, p.hasta)
  const primera = todas.findIndex(s => s.total > 0)
  const ultima = todas.length - [...todas].reverse().findIndex(s => s.total > 0)
  const semanas = primera >= 0 ? todas.slice(primera, ultima) : []
  if (semanas.length > 1) {
    y = asegurar(doc, y, 60, marca, cab)
    y = seccion(doc, y, marca, 'Semana a semana', `${semanas.length} semanas`)
    // Con muchas semanas las etiquetas se pisan: se muestra una de cada n.
    const salto = Math.ceil(semanas.length / 12)
    y = columnas(doc, y + 2, semanas.map((s, i) => ({ etiqueta: i % salto === 0 ? diaCorto(s.inicio) : '', valores: [s.total] })), [{ nombre: 'Asistencias por semana' , color: marca.acento }], { alto: 34 })
  }

  y = asegurar(doc, y, 62, marca, cab)
  y = seccion(doc, y, marca, 'Por día de la semana')
  const diasConClase = [1, 2, 3, 4, 5, 6, 0].filter(d => (p.porDiaSemana[d] ?? 0) > 0)
  const maxDia = Math.max(...diasConClase.map(d => p.porDiaSemana[d]))
  const yBarras = y
  const anchoBarras = W - 2 * MARGEN - 58
  y = barras(doc, y, marca, diasConClase.map(d => ({
    etiqueta: DIAS[d], valor: p.porDiaSemana[d],
    color: p.porDiaSemana[d] === maxDia ? marca.acento : mezclar(marca.acento, 0.45),
  })), { ancho: anchoBarras })
  // A la derecha, la ocupación media: cuánto del plantel viene a una clase típica.
  const ocupacion = p.activos.length ? Math.round((promedioClase / p.activos.length) * 100) : 0
  anillo(doc, W - MARGEN - 26, yBarras + 16, 13, ocupacion, colorDePorcentaje(ocupacion), 'del plantel por clase')
  y = Math.max(y, yBarras + 40)

  // ── 4. Por grupo ─────────────────────────────────────────────────────────
  const porGrupo = new Map<string, { nombre: string; sede: string; n: number }>()
  for (const h of p.historialDetallado) {
    if (!h.bloqueNombre || h.bloqueNombre === '—') continue
    const clave = `${h.bloqueNombre}|${h.horario}|${h.sede}`
    const g = porGrupo.get(clave) ?? { nombre: `${h.bloqueNombre}${h.horario ? ` · ${h.horario}` : ''}`, sede: h.sede, n: 0 }
    g.n++
    porGrupo.set(clave, g)
  }
  const grupos = [...porGrupo.values()].sort((a, b) => b.n - a.n)
  if (grupos.length) {
    y = asegurar(doc, y, 30 + Math.min(grupos.length, 12) * 7.2, marca, cab)
    y = seccion(doc, y, marca, 'Por grupo', `${grupos.length} grupos con asistencia`)
    const sedes = new Set(grupos.map(g => g.sede).filter(Boolean))
    y = barras(doc, y, marca, grupos.slice(0, 12).map(g => ({
      etiqueta: sedes.size > 1 && g.sede ? `${g.nombre} (${g.sede})` : g.nombre, valor: g.n, texto: `${g.n} · ${Math.round((g.n / p.totalAsist) * 100)}%`,
    })), { anchoEtiqueta: 78 })
    if (grupos.length > 12) y = nota(doc, y, `Se muestran los 12 grupos con más asistencia de ${grupos.length}.`)
  }

  // ── 5. Jugadores que requieren atención ──────────────────────────────────
  const atencion = plantel.filter(j => j.pct < 50).sort((a, b) => a.pct - b.pct || a.clases - b.clases || a.nombre.localeCompare(b.nombre, 'es'))
  y = asegurar(doc, y + 4, 50, marca, cab)
  y = seccion(doc, y, marca, 'Jugadores que requieren atención', atencion.length ? `${atencion.length} bajo el 50% · ${sinVenir.length} sin asistir` : undefined)
  if (!atencion.length) {
    y = nota(doc, y, 'Todo el plantel activo está sobre el 50% de asistencia.')
  } else {
    const TOPE = 25
    const visibles = atencion.slice(0, TOPE)
    autoTable(doc, {
      ...tabla(marca, { numericas: [2, 3], anchos: { 1: 32, 2: 20, 3: 22, 4: 40 } }),
      startY: y,
      head: [['Jugador', 'Categoría', 'Clases', 'Esperadas', 'Asistencia']],
      body: visibles.map(j => [j.nombre, j.categoria || '—', String(j.clases), String(j.esperadas), String(j.pct)]),
      foot: atencion.length > TOPE ? [[`y ${atencion.length - TOPE} más en la lista completa`, '', '', '', '']] : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => {
        if (d.section === 'head' && [2, 3].includes(d.column.index)) d.cell.styles.halign = 'right'
        if (d.section === 'body' && d.column.index === 4) d.cell.styles.textColor = [255, 255, 255]
        if (d.section === 'body' && d.column.index === 2 && visibles[d.row.index]?.clases === 0) { d.cell.styles.textColor = ROJO; d.cell.styles.fontStyle = 'bold' }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawCell: (d: any) => {
        lineaCabecera(marca)(d)
        if (d.section === 'body' && d.column.index === 4) barraEnCelda(doc, d.cell, visibles[d.row.index]?.pct ?? 0, colorDePorcentaje(visibles[d.row.index]?.pct ?? 0))
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10
  }

  // ── 6. Plantel completo ──────────────────────────────────────────────────
  if (plantel.length) {
    y = asegurar(doc, y, 90, marca, cab)
    y = seccion(doc, y, marca, 'Plantel completo', `${plantel.length} activos · ${diasUnicos} días con clase`)
    const distribucion: Array<{ etiqueta: string; valor: number; color: RGB }> = [
      { etiqueta: '75% o más', valor: plantel.filter(j => j.pct >= 75).length, color: VERDE },
      { etiqueta: 'Entre 50% y 74%', valor: plantel.filter(j => j.pct >= 50 && j.pct < 75).length, color: AMBAR },
      { etiqueta: 'Bajo 50%', valor: plantel.filter(j => j.pct > 0 && j.pct < 50).length, color: ROJO },
      { etiqueta: 'Sin asistir', valor: sinVenir.length, color: GRIS_CLARO },
    ]
    y = barras(doc, y, marca, distribucion.map(d => ({ ...d, texto: `${d.valor} · ${Math.round((d.valor / plantel.length) * 100)}%` })), { titulo: 'Distribución del plantel' })
    autoTable(doc, {
      ...tabla(marca, { numericas: [0, 3, 4], anchos: { 0: 10, 2: 32, 3: 20, 4: 22, 5: 40 } }),
      startY: y,
      head: [['#', 'Jugador', 'Categoría', 'Clases', 'Esperadas', 'Asistencia']],
      body: plantel.map((j, i) => [String(i + 1), j.nombre, j.categoria || '—', String(j.clases), String(j.esperadas), String(j.pct)]),
      foot: [['', 'Total', '', String(p.totalAsist), '', `${promedioPlantel}`]],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => {
        if (d.section === 'head' && [0, 3, 4].includes(d.column.index)) d.cell.styles.halign = 'right'
        if (d.column.index === 5 && d.section !== 'head') d.cell.styles.textColor = [255, 255, 255]
        if (d.section === 'body' && d.column.index === 0) d.cell.styles.textColor = GRIS_CLARO
        if (d.section === 'body' && d.column.index === 3 && plantel[d.row.index]?.clases === 0) { d.cell.styles.textColor = ROJO; d.cell.styles.fontStyle = 'bold' }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawCell: (d: any) => {
        lineaCabecera(marca)(d)
        if (d.column.index !== 5 || d.section === 'head') return
        const pct = d.section === 'foot' ? promedioPlantel : (plantel[d.row.index]?.pct ?? 0)
        barraEnCelda(doc, d.cell, pct, colorDePorcentaje(pct))
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 6
    y = nota(doc, y, 'Las clases esperadas se calculan con los días de entrenamiento que cada jugador tiene hoy. Quien vino más veces de las esperadas figura con 100%.')
  }

  // ── 7. Historial detallado ───────────────────────────────────────────────
  if (p.historialDetallado.length) {
    doc.addPage()
    y = portada(doc, marca, { ...cab, titulo: 'Historial de asistencia' })
    const filas = [...p.historialDetallado].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.jugadorNombre.localeCompare(b.jugadorNombre, 'es'))
    y = seccion(doc, y, marca, 'Quién, qué día, en qué grupo y en qué sede', `${filas.length} registros`)
    autoTable(doc, {
      ...tabla(marca, { anchos: { 1: 24, 3: 26, 4: 30 } }),
      startY: y,
      head: [['Jugador', 'Fecha', 'Grupo', 'Horario', 'Sede']],
      body: filas.map(f => [f.jugadorNombre, fechaCorta(f.fecha), f.bloqueNombre + (f.inferido && f.bloqueId ? ' (inferido)' : ''), f.horario, f.sede]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 1) d.cell.styles.textColor = GRIS },
      didDrawCell: lineaCabecera(marca),
    })
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Reporte de asistencia · ${args.periodo}`)
  return doc
}

export async function descargarReporteAsistencia(args: ArgsAsistencia) {
  const doc = await construirReporteAsistencia(args)
  doc.save(`Reporte de asistencia — ${args.marca.club} — ${args.periodo}.pdf`)
}
