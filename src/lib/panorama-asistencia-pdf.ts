// Los dos PDF del Panorama de asistencia: el masivo y el individual.
//
// POR QUÉ RECIBE LOS CALENDARIOS Y NO LOS TOTALES YA HECHOS. Porque el PDF
// tiene que decir exactamente lo mismo que la pantalla, y la única forma de
// garantizarlo es que los dos salgan de las mismas funciones. Si acá se
// recalculara "parecido", el día que alguien toque el criterio de una falta
// quedan diciendo cosas distintas y no hay manera de saber cuál miente.
//
// LOS DOS DOCUMENTOS RESPONDEN PREGUNTAS DISTINTAS:
//
//   Masivo      — "¿cómo viene el club?" Una hoja: los números del período,
//                 el día a día, cómo va cada grupo y el ranking completo.
//                 Es lo que se lleva a la reunión.
//
//   Individual  — "¿cómo viene este chico?" Una hoja por jugador, con sus
//                 días uno por uno. Es lo que se le entrega al apoderado, y
//                 por eso va sin el ranking: nadie tiene por qué recibir un
//                 papel donde figura la asistencia de los hijos de otros.
//
// EL FILTRO MANDA. Los dos exportan el período y el grupo que estén elegidos
// en pantalla, no "todo". Un PDF que ignora el filtro que ves es un PDF que
// no es el que pediste.

import {
  conteoDelRango, resumenPorDia, resumenPorGrupo, ordenarPorRiesgo, filasDeJugadores,
  type CalendarioDeJugador,
} from '@/lib/domain/panoramaAsistencia'
import {
  encabezado, piePagina, estiloTabla, filaTarjetas, tituloSeccion, sinDatos,
  COLOR, MARGEN, type RGB,
} from '@/lib/pdf/estilo'

export type MetaPanorama = {
  clubNombre: string
  /** Cómo se llama el período elegido: "Semana del 4 al 8 de agosto", etc. */
  periodo: string
  desde: string
  hasta: string
  /** El grupo filtrado, si hay uno. null = todos. */
  grupo?: string | null
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** El % como texto. `null` no es 0: es "todavía no hay nada resuelto". */
function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}%`
}

// Verde arriba de 85, ámbar hasta 70, rojo abajo. Los mismos cortes que usa la
// pantalla, para que un grupo que allá se ve rojo no salga verde en el papel.
function colorPorcentaje(v: number | null): RGB {
  if (v === null) return COLOR.tenue
  if (v >= 85) return COLOR.verde
  if (v >= 70) return COLOR.ambar
  return COLOR.rojo
}

function subtitulo(meta: MetaPanorama): string {
  const g = meta.grupo ? `  ·  Grupo: ${meta.grupo}` : ''
  return `${meta.periodo}${g}  ·  Generado el ${new Date().toLocaleDateString('es-CL')}`
}

function pie(meta: MetaPanorama, que: string): string {
  const g = meta.grupo ? ` · ${meta.grupo}` : ''
  return `${meta.clubNombre || 'CmSports'} · ${que} · ${meta.periodo}${g}`
}

// ══════════════════════════════════════════════════════════════════════════
// MASIVO — una hoja resumen del club
// ══════════════════════════════════════════════════════════════════════════

export async function exportarPanoramaPdf(cals: CalendarioDeJugador[], meta: MetaPanorama) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const { desde, hasta } = meta
  const total   = conteoDelRango(cals, desde, hasta)
  const dias    = resumenPorDia(cals, desde, hasta)
  const grupos  = resumenPorGrupo(cals, desde, hasta)
  const ranking = ordenarPorRiesgo(filasDeJugadores(cals, desde, hasta))

  const doc = new jsPDF()
  let y = encabezado(doc, {
    club: meta.clubNombre,
    titulo: 'Panorama de asistencia',
    subtitulo: subtitulo(meta),
  })

  // Las listas sin pasar van como tarjeta propia y no sumadas a las faltas:
  // "nadie registró" y "faltó" son cosas distintas, y confundirlas hace que el
  // profe que no pasó lista aparezca como un grupo que no viene.
  y = filaTarjetas(doc, y, [
    { valor: pct(total.porcentaje), etiqueta: 'Asistencia del período', color: colorPorcentaje(total.porcentaje) },
    { valor: String(total.presentes), etiqueta: 'Asistencias', color: COLOR.verde },
    { valor: String(total.ausentes), etiqueta: 'Faltas', color: COLOR.rojo },
    { valor: String(total.pendientes), etiqueta: 'Sin pasar lista', color: COLOR.tenue },
  ])

  // ── Día a día ───────────────────────────────────────────────────────────
  y = tituloSeccion(doc, y, 'Día a día')
  const conClase = dias.filter(d => d.programados > 0)
  if (conClase.length === 0) {
    y = sinDatos(doc, y, 'No hubo días con entrenamiento en este período.')
  } else {
    const estilo = estiloTabla()
    autoTable(doc, {
      startY: y,
      head: [['Día', 'Fecha', 'Citados', 'Vinieron', 'Faltaron', 'Sin registrar', '%']],
      body: conClase.map(d => [
        d.dia, fechaCorta(d.fecha), String(d.programados),
        String(d.presentes), String(d.ausentes),
        d.pendientes > 0 ? String(d.pendientes) : '—',
        pct(d.porcentaje),
      ]),
      ...estilo,
      columnStyles: {
        2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' },
        5: { halign: 'center' }, 6: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 6) {
          data.cell.styles.textColor = colorPorcentaje(conClase[data.row.index].porcentaje)
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Por grupo ───────────────────────────────────────────────────────────
  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = MARGEN + 6 }
  y = tituloSeccion(doc, y, 'Por grupo')
  if (grupos.length === 0) {
    y = sinDatos(doc, y)
  } else {
    const estilo = estiloTabla()
    autoTable(doc, {
      startY: y,
      head: [['Grupo', 'Jugadores', 'Asistencias', 'Faltas', '%']],
      body: grupos.map(g => [
        g.nombre, String(g.jugadores), String(g.presentes), String(g.ausentes), pct(g.porcentaje),
      ]),
      ...estilo,
      columnStyles: {
        1: { halign: 'center' }, 2: { halign: 'center' },
        3: { halign: 'center' }, 4: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = colorPorcentaje(grupos[data.row.index].porcentaje)
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Ranking ─────────────────────────────────────────────────────────────
  // De peor a mejor: lo que hay que mirar va arriba. Nadie queda afuera —a
  // igual porcentaje manda quién faltó más veces, así el que faltó una sola
  // vez sobre una sola sesión no se mezcla con el que faltó veinte.
  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = MARGEN + 6 }
  y = tituloSeccion(doc, y, 'Jugador por jugador')
  if (ranking.length === 0) {
    y = sinDatos(doc, y)
  } else {
    const estilo = estiloTabla()
    autoTable(doc, {
      startY: y,
      head: [['#', 'Jugador', 'Asistencias', 'Faltas', '%']],
      body: ranking.map((f, i) => [
        String(i + 1), f.jugador.nombre, String(f.presentes), String(f.ausentes), pct(f.porcentaje),
      ]),
      ...estilo,
      columnStyles: {
        0: { halign: 'right', cellWidth: 10, textColor: COLOR.tenue },
        2: { halign: 'center' }, 3: { halign: 'center' },
        4: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = colorPorcentaje(ranking[data.row.index].porcentaje)
        }
      },
    })
  }

  piePagina(doc, pie(meta, 'Panorama de asistencia'))
  doc.save(`panorama_asistencia_${desde}_a_${hasta}.pdf`)
}

// ══════════════════════════════════════════════════════════════════════════
// INDIVIDUAL — una hoja por jugador
// ══════════════════════════════════════════════════════════════════════════

export async function exportarPanoramaIndividualPdf(cals: CalendarioDeJugador[], meta: MetaPanorama) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const { desde, hasta } = meta
  // Por nombre y no por porcentaje: es un lote de hojas para repartir, y se
  // busca por apellido. Ordenarlo por riesgo obligaría a hojearlo entero.
  const filas = filasDeJugadores(cals, desde, hasta)
    .sort((a, b) => a.jugador.nombre.localeCompare(b.jugador.nombre, 'es'))

  if (filas.length === 0) return

  const doc = new jsPDF()
  const porId = new Map(cals.map(c => [c.jugador.id, c]))

  filas.forEach((f, i) => {
    if (i > 0) doc.addPage()

    let y = encabezado(doc, {
      club: meta.clubNombre,
      titulo: f.jugador.nombre,
      subtitulo: subtitulo(meta),
    })

    y = filaTarjetas(doc, y, [
      { valor: pct(f.porcentaje), etiqueta: 'Su asistencia', color: colorPorcentaje(f.porcentaje) },
      { valor: String(f.presentes), etiqueta: 'Vino', color: COLOR.verde },
      { valor: String(f.ausentes), etiqueta: 'Faltó', color: COLOR.rojo },
    ])

    const dias = (porId.get(f.jugador.id)?.dias ?? [])
      .filter(d => d.fecha >= desde && d.fecha <= hasta)
      // Solo los días que le tocaba entrenar. Un día sin grupo asignado no es
      // una falta suya y meterlo en la hoja del apoderado solo confunde.
      .filter(d => d.bloques.length > 0)

    y = tituloSeccion(doc, y, 'Sus días')
    if (dias.length === 0) {
      sinDatos(doc, y, 'No tenía entrenamientos programados en este período.')
      return
    }

    const etiqueta: Record<string, string> = {
      presente: 'Vino', ausente: 'Faltó', pendiente: 'Sin registrar',
    }
    const estilo = estiloTabla()
    autoTable(doc, {
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
      ...estilo,
      columnStyles: { 3: { fontStyle: 'bold' } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const e = dias[data.row.index].estado
          data.cell.styles.textColor =
            e === 'presente' ? COLOR.verde : e === 'ausente' ? COLOR.rojo : COLOR.tenue
        }
      },
    })

    const fin = (doc as any).lastAutoTable.finalY + 8
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8)
    doc.setTextColor(...COLOR.tenue)
    doc.text(
      `Período: ${fechaLarga(desde)} al ${fechaLarga(hasta)}.`,
      MARGEN, fin, { maxWidth: doc.internal.pageSize.getWidth() - 2 * MARGEN },
    )
  })

  piePagina(doc, pie(meta, 'Asistencia individual'))
  doc.save(`asistencia_individual_${desde}_a_${hasta}.pdf`)
}
