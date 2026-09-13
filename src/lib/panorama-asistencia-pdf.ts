// Los dos PDF del Panorama de asistencia: el masivo y el individual. Molde
// v2 (lib/pdf/papel.ts).
//
// POR QUÉ RECIBE LOS CALENDARIOS Y NO LOS TOTALES YA HECHOS. Porque el PDF
// tiene que decir exactamente lo mismo que la pantalla, y la única forma de
// garantizarlo es que los dos salgan de las mismas funciones. Si acá se
// recalculara "parecido", el día que alguien toque el criterio de una falta
// quedan diciendo cosas distintas y no hay manera de saber cuál miente.
//
// LOS DOS DOCUMENTOS RESPONDEN PREGUNTAS DISTINTAS:
//
//   Masivo      — "¿cómo viene el club?" Los números del período, hallazgos,
//                 el día a día en barras, cómo va cada grupo y el ranking
//                 completo. Es lo que se lleva a la reunión.
//
//   Individual  — "¿cómo viene este chico?" Una hoja por jugador, con su
//                 calendario y sus días uno por uno. Es lo que se le entrega
//                 al apoderado, y por eso va sin el ranking: nadie tiene por
//                 qué recibir un papel donde figura la asistencia de los
//                 hijos de otros.
//
// EL FILTRO MANDA. Los dos exportan el período y el grupo que estén elegidos
// en pantalla, no "todo". Un PDF que ignora el filtro que ves es un PDF que
// no es el que pediste.

import {
  conteoDelRango, resumenPorDia, resumenPorGrupo, ordenarPorRiesgo, filasDeJugadores,
  type CalendarioDeJugador,
} from '@/lib/domain/panoramaAsistencia'
import {
  TINTA, GRIS, GRIS_CLARO, VERDE, ROJO, AMBAR, BLANCO, FONDO, MARGEN,
  nuevoDocumento, portada, pieDePagina, asegurar, seccion, cifras, hallazgos, barras, columnas, anillo, tabla, trasTabla, barraEnCelda, nota, mezclar, marcaDelClub,
  type Marca, type RGB, type Tono,
} from '@/lib/pdf/papel'

export type MetaPanorama = {
  clubNombre: string
  marca?: Marca
  /** Cómo se llama el período elegido: "Semana del 4 al 8 de agosto", etc. */
  periodo: string
  desde: string
  hasta: string
  /** El grupo filtrado, si hay uno. null = todos. */
  grupo?: string | null
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS_CORTO = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}
function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}
function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10)
}
function diaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** El % como texto. `null` no es 0: es "todavía no hay nada resuelto". */
function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}%`
}

// Verde arriba de 85, ámbar hasta 70, rojo abajo. Los mismos cortes que usa la
// pantalla, para que un grupo que allá se ve rojo no salga verde en el papel.
function colorPorcentaje(v: number | null): RGB {
  if (v === null) return GRIS_CLARO
  if (v >= 85) return VERDE
  if (v >= 70) return AMBAR
  return ROJO
}

function subtitulo(meta: MetaPanorama): string {
  return `${meta.periodo}${meta.grupo ? ` · Grupo ${meta.grupo}` : ''}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fuente(doc: any, peso: 'normal' | 'semibold' | 'bold', tam: number, color: RGB) {
  const lista = doc.getFontList?.() ?? {}
  doc.setFont(lista.Inter ? 'Inter' : 'helvetica', lista.Inter ? peso : (peso === 'normal' ? 'normal' : 'bold'))
  doc.setFontSize(tam)
  doc.setTextColor(...color)
}

// ══════════════════════════════════════════════════════════════════════════
// MASIVO — el club en un vistazo
// ══════════════════════════════════════════════════════════════════════════

export async function exportarPanoramaPdf(cals: CalendarioDeJugador[], meta: MetaPanorama) {
  const marca = meta.marca ?? await marcaDelClub({ nombre: meta.clubNombre, logo_url: null })
  const { desde, hasta } = meta
  const total = conteoDelRango(cals, desde, hasta)
  const dias = resumenPorDia(cals, desde, hasta)
  const grupos = resumenPorGrupo(cals, desde, hasta)
  const ranking = ordenarPorRiesgo(filasDeJugadores(cals, desde, hasta))
  const cab = { titulo: 'Panorama de asistencia', subtitulo: subtitulo(meta), nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cab)
  let y = y0

  // Las listas sin pasar van como cifra propia y no sumadas a las faltas:
  // "nadie registró" y "faltó" son cosas distintas, y confundirlas hace que el
  // profe que no pasó lista aparezca como un grupo que no viene.
  y = cifras(doc, y, marca, [
    { etiqueta: 'Asistencia del período', valor: pct(total.porcentaje), detalle: `${total.presentes + total.ausentes} clases resueltas`, color: colorPorcentaje(total.porcentaje) },
    { etiqueta: 'Asistencias', valor: String(total.presentes), color: VERDE },
    { etiqueta: 'Faltas', valor: String(total.ausentes), color: ROJO },
    { etiqueta: 'Sin pasar lista', valor: total.pendientes ? String(total.pendientes) : '—', detalle: 'no cuentan como falta', color: GRIS },
  ])

  // ── Hallazgos ────────────────────────────────────────────────────────────
  const lista: Array<{ texto: string; tono: Tono }> = []
  const conClase = dias.filter(d => d.programados > 0)
  if (total.porcentaje !== null) lista.push({ texto: `En el período el club asistió al ${Math.round(total.porcentaje)}% de sus clases.`, tono: total.porcentaje >= 85 ? 'bien' : total.porcentaje >= 70 ? 'ojo' : 'mal' })
  const gruposBajos = grupos.filter(g => g.porcentaje !== null && g.porcentaje < 70)
  if (gruposBajos.length) lista.push({ texto: `${gruposBajos.length} grupo${gruposBajos.length === 1 ? ' está' : 's están'} bajo el 70%: ${gruposBajos.map(g => `${g.nombre} (${pct(g.porcentaje)})`).join(', ')}.`, tono: 'mal' })
  const enRiesgo = ranking.filter(f => f.porcentaje !== null && f.porcentaje < 70)
  if (enRiesgo.length) lista.push({ texto: `${enRiesgo.length} jugador${enRiesgo.length === 1 ? '' : 'es'} bajo el 70% de asistencia${enRiesgo.length <= 3 ? `: ${enRiesgo.map(f => f.jugador.nombre).join(', ')}` : ` (los primeros: ${enRiesgo.slice(0, 3).map(f => f.jugador.nombre).join(', ')})`}.`, tono: 'ojo' })
  if (conClase.length >= 2) {
    const peor = [...conClase].sort((a, b) => (a.porcentaje ?? 101) - (b.porcentaje ?? 101))[0]
    if (peor.porcentaje !== null && peor.porcentaje < 70) lista.push({ texto: `El día más flojo fue el ${peor.dia.toLowerCase()} ${fechaCorta(peor.fecha)}, con ${pct(peor.porcentaje)} de asistencia (${peor.ausentes} faltas).`, tono: 'info' })
  }
  if (total.pendientes > 0) lista.push({ texto: `Quedan ${total.pendientes} días vencidos sin pasar lista.`, tono: 'ojo' })
  if (lista.length) {
    y = seccion(doc, y, marca, 'Hallazgos del período')
    y = hallazgos(doc, y, lista)
  }

  // ── Día a día ───────────────────────────────────────────────────────────
  y = asegurar(doc, y, 60, marca, cab)
  y = seccion(doc, y, marca, 'Día a día', `${conClase.length} días con clase`)
  if (conClase.length === 0) {
    y = nota(doc, y, 'No hubo días con entrenamiento en este período.')
  } else {
    if (conClase.length <= 31) {
      const salto = Math.ceil(conClase.length / 14)
      y = columnas(doc, y + 2, conClase.map((d, i) => ({ etiqueta: i % salto === 0 ? fechaCorta(d.fecha) : '', valores: [d.presentes, d.ausentes] })), [{ nombre: 'Asistencias', color: VERDE }, { nombre: 'Faltas', color: ROJO }], { alto: 34 })
    }
    autoTable(doc, {
      ...tabla(marca, {
        tamano: 8, centradas: [2, 3, 4, 5], anchos: { 0: 22, 1: 18, 2: 18, 3: 20, 4: 20, 5: 24, 6: 36 },
        alParsear: d => {
          if (d.section !== 'body') return
          if (d.column.index === 4 && conClase[d.row.index]?.ausentes) d.cell.styles.textColor = ROJO
          if (d.column.index === 5) d.cell.styles.textColor = GRIS_CLARO
          if (d.column.index === 6) d.cell.styles.textColor = BLANCO
        },
        alDibujar: d => {
          if (d.section !== 'body' || d.column.index !== 6) return
          const v = conClase[d.row.index]?.porcentaje
          if (v !== null && v !== undefined) barraEnCelda(doc, d.cell, v, colorPorcentaje(v))
        },
      }),
      startY: y,
      head: [['Día', 'Fecha', 'Citados', 'Vinieron', 'Faltaron', 'Sin registrar', '%']],
      body: conClase.map(d => [d.dia, fechaCorta(d.fecha), String(d.programados), String(d.presentes), String(d.ausentes), d.pendientes > 0 ? String(d.pendientes) : '—', String(d.porcentaje ?? '')]),
    })
    y = trasTabla(doc)
  }

  // ── Por grupo ───────────────────────────────────────────────────────────
  y = asegurar(doc, y, 20 + grupos.length * 7.2, marca, cab)
  y = seccion(doc, y, marca, 'Por grupo', `${grupos.length} grupos`)
  if (grupos.length === 0) {
    y = nota(doc, y, 'Sin grupos con actividad en el período.')
  } else {
    const ordenados = [...grupos].sort((a, b) => (a.porcentaje ?? 101) - (b.porcentaje ?? 101))
    y = barras(doc, y, marca, ordenados.map(g => ({
      etiqueta: `${g.nombre} (${g.jugadores})`, valor: g.porcentaje ?? 0, texto: `${pct(g.porcentaje)} · ${g.presentes}/${g.presentes + g.ausentes}`, color: colorPorcentaje(g.porcentaje),
    })), { anchoEtiqueta: 62 })
  }

  // ── Ranking ─────────────────────────────────────────────────────────────
  // De peor a mejor: lo que hay que mirar va arriba. Nadie queda afuera —a
  // igual porcentaje manda quién faltó más veces, así el que faltó una sola
  // vez sobre una sola sesión no se mezcla con el que faltó veinte.
  y = asegurar(doc, y, 50, marca, cab)
  y = seccion(doc, y, marca, 'Jugador por jugador', 'de menor a mayor asistencia')
  if (ranking.length === 0) {
    y = nota(doc, y, 'Sin jugadores en el período.')
  } else {
    autoTable(doc, {
      ...tabla(marca, {
        tamano: 8, numericas: [0], centradas: [2, 3], anchos: { 0: 10, 2: 24, 3: 20, 4: 40 },
        alParsear: d => {
          if (d.section !== 'body') return
          if (d.column.index === 0) d.cell.styles.textColor = GRIS_CLARO
          if (d.column.index === 3 && ranking[d.row.index]?.ausentes) d.cell.styles.textColor = ROJO
          if (d.column.index === 4) d.cell.styles.textColor = BLANCO
        },
        alDibujar: d => {
          if (d.section !== 'body' || d.column.index !== 4) return
          const v = ranking[d.row.index]?.porcentaje
          if (v !== null && v !== undefined) barraEnCelda(doc, d.cell, v, colorPorcentaje(v))
        },
      }),
      startY: y,
      head: [['#', 'Jugador', 'Asistencias', 'Faltas', '%']],
      body: ranking.map((f, i) => [String(i + 1), f.jugador.nombre, String(f.presentes), String(f.ausentes), String(f.porcentaje ?? '')]),
    })
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Panorama de asistencia · ${subtitulo(meta)}`)
  doc.save(`panorama_asistencia_${desde}_a_${hasta}.pdf`)
}

// ══════════════════════════════════════════════════════════════════════════
// INDIVIDUAL — una hoja por jugador, para el apoderado
// ══════════════════════════════════════════════════════════════════════════

/**
 * El calendario del jugador en el período: semanas en columnas, lunes a
 * domingo en filas. Verde vino, rojo faltó, ámbar sin registrar, gris sin
 * clase. Devuelve el `y` donde sigue.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calendario(doc: any, y: number, x0: number, anchoMax: number, dias: CalendarioDeJugador['dias'], desde: string, hasta: string): number {
  const estadoPorDia = new Map(dias.map(d => [d.fecha, d]))
  const dow = (diaSemana(desde) + 6) % 7
  const inicio = sumarDias(desde, -dow)
  const fechas: string[] = []
  for (let d = inicio; d <= hasta; d = sumarDias(d, 1)) fechas.push(d)
  const semanas = Math.ceil(fechas.length / 7)
  const celda = Math.min(6.2, Math.floor(((anchoMax - 8) / semanas) * 10) / 10)
  const gap = 1
  const xg = x0 + 8
  const yg = y + 5
  fuente(doc, 'normal', 6.5, GRIS_CLARO)
  for (let f = 0; f < 7; f++) doc.text(DIAS_CORTO[f], x0 + 3, yg + f * (celda + gap) + celda * 0.72, { align: 'center' })
  let mesAnterior = ''
  fechas.forEach((iso, i) => {
    const col = Math.floor(i / 7), fila = i % 7
    const x = xg + col * (celda + gap), yy = yg + fila * (celda + gap)
    const mes = iso.slice(0, 7)
    if (fila === 0 && mes !== mesAnterior && (iso.slice(8, 10) <= '07' || i === 0)) {
      fuente(doc, 'semibold', 6.5, GRIS)
      doc.text(MESES_CORTO[Number(iso.slice(5, 7)) - 1], x, yg - 1.5)
      mesAnterior = mes
    }
    if (iso < desde || iso > hasta) return
    const d = estadoPorDia.get(iso)
    const tieneClase = !!d && d.bloques.length > 0
    let color: RGB = FONDO
    if (tieneClase && d) color = d.estado === 'presente' ? VERDE : d.estado === 'ausente' ? mezclar(ROJO, 0.3) : mezclar(AMBAR, 0.3)
    doc.setFillColor(...color); doc.setDrawColor(...color)
    doc.roundedRect(x, yy, celda, celda, 1, 1, 'F')
  })
  const yFin = yg + 7 * (celda + gap) + 4
  let lx = xg
  for (const [texto, color] of [['Vino', VERDE], ['Faltó', mezclar(ROJO, 0.3)], ['Sin registrar', mezclar(AMBAR, 0.3)], ['Sin clase', FONDO]] as Array<[string, RGB]>) {
    doc.setFillColor(...color); doc.setDrawColor(...color)
    doc.roundedRect(lx, yFin, 3, 3, 0.7, 0.7, 'F')
    fuente(doc, 'normal', 7.5, GRIS)
    doc.text(texto, lx + 4.5, yFin + 2.5)
    lx += 4.5 + doc.getTextWidth(texto) + 6
  }
  return yFin + 9
}

export async function exportarPanoramaIndividualPdf(cals: CalendarioDeJugador[], meta: MetaPanorama) {
  const marca = meta.marca ?? await marcaDelClub({ nombre: meta.clubNombre, logo_url: null })
  const { desde, hasta } = meta
  // Por nombre y no por porcentaje: es un lote de hojas para repartir, y se
  // busca por apellido. Ordenarlo por riesgo obligaría a hojearlo entero.
  const filas = filasDeJugadores(cals, desde, hasta)
    .sort((a, b) => a.jugador.nombre.localeCompare(b.jugador.nombre, 'es'))
  if (filas.length === 0) return

  const cabDe = (nombre: string) => ({ titulo: nombre, subtitulo: `Asistencia · ${subtitulo(meta)}`, nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` })
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cabDe(filas[0].jugador.nombre))
  const W = doc.internal.pageSize.getWidth()
  const porId = new Map(cals.map(c => [c.jugador.id, c]))

  filas.forEach((f, i) => {
    let y = i === 0 ? y0 : (doc.addPage(), portada(doc, marca, cabDe(f.jugador.nombre)))

    const dias = (porId.get(f.jugador.id)?.dias ?? [])
      .filter(d => d.fecha >= desde && d.fecha <= hasta)
      // Solo los días que le tocaba entrenar. Un día sin grupo asignado no es
      // una falta suya y meterlo en la hoja del apoderado solo confunde.
      .filter(d => d.bloques.length > 0)

    y = cifras(doc, y, marca, [
      { etiqueta: 'Su asistencia', valor: pct(f.porcentaje), detalle: `de ${f.presentes + f.ausentes} clases`, color: colorPorcentaje(f.porcentaje) },
      { etiqueta: 'Vino', valor: String(f.presentes), color: VERDE },
      { etiqueta: 'Faltó', valor: String(f.ausentes), color: ROJO },
      { etiqueta: 'Sin registrar', valor: dias.filter(d => d.estado === 'pendiente').length ? String(dias.filter(d => d.estado === 'pendiente').length) : '—', color: GRIS },
    ])

    y = seccion(doc, y, marca, 'Calendario', `${fechaLarga(desde)} al ${fechaLarga(hasta)}`)
    if (dias.length === 0) {
      y = nota(doc, y, 'No tenía entrenamientos programados en este período.')
      return
    }
    const anchoCal = W - 2 * MARGEN - 44
    const yCal = y
    y = calendario(doc, y, MARGEN, anchoCal, porId.get(f.jugador.id)?.dias ?? [], desde, hasta)
    if (f.porcentaje !== null) anillo(doc, W - MARGEN - 18, yCal + 16, 13, f.porcentaje, colorPorcentaje(f.porcentaje), 'asistencia')

    y = seccion(doc, y, marca, 'Sus días', `${dias.length} clases`)
    const etiqueta: Record<string, string> = { presente: 'Vino', ausente: 'Faltó', pendiente: 'Sin registrar' }
    autoTable(doc, {
      ...tabla(marca, {
        tamano: 8, anchos: { 0: 24, 1: 18, 3: 44 },
        alParsear: d => {
          if (d.section !== 'body' || d.column.index !== 3) return
          const e = dias[d.row.index]?.estado
          d.cell.styles.fontStyle = 'bold'
          d.cell.styles.textColor = e === 'presente' ? VERDE : e === 'ausente' ? ROJO : GRIS_CLARO
        },
      }),
      startY: y,
      head: [['Día', 'Fecha', 'Grupo', 'Estado']],
      body: dias.map(d => [
        d.dia,
        fechaCorta(d.fecha),
        d.bloques.join(', ') || '—',
        // La clase extra se anota al lado y no como un estado: no consume
        // sesión ni entra en el porcentaje, pero el apoderado tiene que verla
        // porque se le cobra aparte.
        (etiqueta[d.estado] ?? d.estado) + (d.extra ? '  + clase extra' : ''),
      ]),
    })
  })

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Asistencia individual · ${subtitulo(meta)}`)
  doc.save(`asistencia_individual_${desde}_a_${hasta}.pdf`)
}
