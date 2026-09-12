// "Programación oficial — Jornada N": el PDF que el club pega en el mural y
// manda al WhatsApp. Reproduce el formato de la hoja que Spinhouse ya usaba:
// una página por día, cada división con su rango de mesas, y la tabla
// Hora · Mesa · Partido · Árbitro. El pie trae las reglas del club.

import { encabezado, piePagina, estiloTabla, tituloSeccion, COLOR, MARGEN, type RGB, type LogoPdf } from '@/lib/pdf/estilo'

export interface JornadaParaPdf {
  numero: number
  dias: Array<{
    fecha: string | null
    divisiones: Array<{
      nombre: string
      mesas: number[]
      partidos: Array<{
        hora: string; mesa: number; jugadorA: string; jugadorB: string; arbitro: string | null
        estado?: string; setsA?: number | null; setsB?: number | null; parciales?: Array<[number, number]> | null
      }>
    }>
  }>
}

export interface MetaJornadaPdf {
  clubNombre: string
  ligaNombre: string
  /** Lo que va al pie: reglas, contacto, dirección. */
  pie?: string
  /** Logo del club, ya cargado con `cargarLogoPdf`. */
  logo?: LogoPdf | null
}

const AZUL: RGB = [37, 99, 235]

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "Sábado 12 de septiembre", desde una fecha ISO, sin pasar por zonas horarias. */
export function etiquetaDia(fechaISO: string | null): string {
  if (!fechaISO) return 'Fecha por definir'
  const [y, m, d] = fechaISO.split('-').map(Number)
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const nombre = DIAS[dia]
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d} de ${MESES[m - 1]}`
}

function rangoMesas(mesas: number[]): string {
  if (!mesas.length) return ''
  const ordenadas = [...mesas].sort((a, b) => a - b)
  const seguidas = ordenadas.every((m, i) => i === 0 || m === ordenadas[i - 1] + 1)
  if (ordenadas.length === 1) return `mesa ${ordenadas[0]}`
  return seguidas ? `mesas ${ordenadas[0]} a ${ordenadas[ordenadas.length - 1]}` : `mesas ${ordenadas.join(', ')}`
}

export async function descargarJornadaPdf(jornada: JornadaParaPdf, meta: MetaJornadaPdf) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()

  jornada.dias.forEach((dia, i) => {
    if (i > 0) doc.addPage()
    const horaInicio = dia.divisiones.flatMap(d => d.partidos.map(p => p.hora)).sort()[0]
    let y = encabezado(doc, {
      club: meta.clubNombre,
      titulo: `Programación oficial — Jornada ${jornada.numero}`,
      subtitulo: `${etiquetaDia(dia.fecha)}${horaInicio ? ` · desde las ${horaInicio} hrs` : ''}`,
      color: AZUL,
      logo: meta.logo,
    })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...COLOR.texto)
    doc.text(meta.ligaNombre.toUpperCase(), MARGEN, y)
    y += 8

    for (const div of dia.divisiones) {
      y = tituloSeccion(doc, y, `${div.nombre} — ${rangoMesas(div.mesas)}`, undefined, AZUL)
      autoTable(doc, {
        ...estiloTabla(AZUL),
        startY: y,
        head: [['Hora', 'Mesa', 'Partido', 'Árbitro']],
        body: div.partidos.map(p => [p.hora, String(p.mesa), `${p.jugadorA}  vs  ${p.jugadorB}`, p.arbitro ?? '—']),
        columnStyles: {
          0: { cellWidth: 16, halign: 'center' },
          1: { cellWidth: 14, halign: 'center' },
          2: { cellWidth: (W - 2 * MARGEN) - 16 - 14 - 52 },
          3: { cellWidth: 52 },
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = ((doc as any).lastAutoTable?.finalY ?? y) + 10
    }
  })

  piePagina(doc, meta.pie ?? `${meta.clubNombre} · ${meta.ligaNombre}`)
  doc.save(`Jornada ${jornada.numero} — ${meta.ligaNombre}.pdf`)
}

/**
 * Las planillas de mesa: una hoja por día y división, con sus mesas una
 * debajo de otra —cada mesa, sus partidos en orden— y casillas para que el
 * árbitro anote los sets, el ganador y firme. Compacta: la Honor entera
 * (3 mesas, 15 partidos) cabe en una carilla.
 */
export async function descargarPlanillasJornadaPdf(jornada: JornadaParaPdf, meta: MetaJornadaPdf) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const ancho = W - 2 * MARGEN
  let primera = true

  // Geometría: Hora | Partido (A / B en dos renglones) | S1..S5 | Sets | Ganador · firma
  const C_HORA = 12, C_SET = 9, C_SETS = 12
  const C_FIRMA = 40
  const C_PARTIDO = ancho - C_HORA - 5 * C_SET - C_SETS - C_FIRMA

  for (const dia of jornada.dias) {
    for (const div of dia.divisiones) {
      if (!div.partidos.length) continue
      if (!primera) doc.addPage()
      primera = false
      let y = encabezado(doc, {
        club: meta.clubNombre,
        titulo: `Planilla de resultados — Jornada ${jornada.numero}`,
        subtitulo: `${etiquetaDia(dia.fecha)} · ${div.nombre}`,
        color: AZUL,
        logo: meta.logo,
      })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...COLOR.tenue)
      doc.text('El árbitro anota los puntos de cada set, el total de sets y firma junto al ganador. Espera máxima 15 min → W.O. 3-0.', MARGEN, y - 4)

      const porMesa = new Map<number, JornadaParaPdf['dias'][number]['divisiones'][number]['partidos']>()
      for (const p of div.partidos) porMesa.set(p.mesa, [...(porMesa.get(p.mesa) ?? []), p])

      for (const [mesa, partidos] of [...porMesa.entries()].sort((a, b) => a[0] - b[0])) {
        const altoBloque = 7 + 6 + partidos.length * 11
        if (y + altoBloque > H - 20) {
          doc.addPage()
          y = encabezado(doc, { club: meta.clubNombre, titulo: `Planilla de resultados — Jornada ${jornada.numero}`, subtitulo: `${etiquetaDia(dia.fecha)} · ${div.nombre}`, color: AZUL, logo: meta.logo })
        }
        // Franja de la mesa.
        doc.setFillColor(...AZUL)
        doc.rect(MARGEN, y, ancho, 6.5, 'F')
        doc.setTextColor(...COLOR.blanco); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
        doc.text(`MESA ${mesa}`, MARGEN + 3, y + 4.6)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
        doc.text(`${partidos.length} partidos · ${partidos[0]?.hora ?? ''} a ${partidos[partidos.length - 1]?.hora ?? ''}`, W - MARGEN - 3, y + 4.6, { align: 'right' })
        y += 6.5

        autoTable(doc, {
          ...estiloTabla(AZUL),
          theme: 'grid',
          startY: y,
          margin: { left: MARGEN, right: MARGEN, bottom: 18 },
          head: [['Hora', 'Partido  ·  árbitro', 'S1', 'S2', 'S3', 'S4', 'S5', 'Sets', 'Ganador / firma']],
          body: [...partidos].sort((a, b) => a.hora.localeCompare(b.hora)).map(p => [
            p.hora,
            `${p.jugadorA}\nvs ${p.jugadorB}${p.arbitro ? `   ·   árb. ${p.arbitro}` : ''}`,
            '', '', '', '', '', '', '',
          ]),
          headStyles: { ...estiloTabla(AZUL).headStyles, fillColor: [226, 232, 240] as RGB, textColor: COLOR.texto, fontSize: 7, cellPadding: 1.5 },
          bodyStyles: { fontSize: 8, textColor: COLOR.texto, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, minCellHeight: 10.5, valign: 'middle' },
          alternateRowStyles: { fillColor: [255, 255, 255] as RGB },
          styles: { lineColor: [148, 163, 184] as RGB, lineWidth: 0.25, overflow: 'linebreak' as const },
          columnStyles: {
            0: { cellWidth: C_HORA, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: C_PARTIDO },
            2: { cellWidth: C_SET }, 3: { cellWidth: C_SET }, 4: { cellWidth: C_SET }, 5: { cellWidth: C_SET }, 6: { cellWidth: C_SET },
            7: { cellWidth: C_SETS },
            8: { cellWidth: C_FIRMA },
          },
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = ((doc as any).lastAutoTable?.finalY ?? y) + 5
      }
    }
  }

  piePagina(doc, meta.pie ?? `${meta.clubNombre} · ${meta.ligaNombre}`)
  doc.save(`Planillas Jornada ${jornada.numero} — ${meta.ligaNombre}.pdf`)
}

/**
 * Los resultados de la jornada: por día y división, cada partido con su
 * marcador (o W.O., o pendiente). Es lo que se manda al grupo cuando
 * termina el fin de semana.
 */
export async function descargarResultadosJornadaPdf(jornada: JornadaParaPdf, meta: MetaJornadaPdf) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()
  const VERDE: RGB = [5, 150, 105]

  const parciales = (p: JornadaParaPdf['dias'][number]['divisiones'][number]['partidos'][number]) =>
    p.parciales?.length ? p.parciales.map(([a, b]) => `${a}-${b}`).join(', ') : ''
  const marcador = (p: JornadaParaPdf['dias'][number]['divisiones'][number]['partidos'][number]) => {
    if (p.estado === 'walkover') return 'W.O.'
    if (p.estado === 'finalizado' && p.setsA != null && p.setsB != null) return `${p.setsA} - ${p.setsB}`
    return 'pendiente'
  }
  const ganador = (p: JornadaParaPdf['dias'][number]['divisiones'][number]['partidos'][number]) => {
    if (p.estado === 'finalizado' && p.setsA != null && p.setsB != null) return p.setsA > p.setsB ? p.jugadorA : p.jugadorB
    return ''
  }

  jornada.dias.forEach((dia, i) => {
    if (i > 0) doc.addPage()
    const total = dia.divisiones.reduce((t, d) => t + d.partidos.length, 0)
    const jugados = dia.divisiones.reduce((t, d) => t + d.partidos.filter(p => p.estado === 'finalizado' || p.estado === 'walkover').length, 0)
    let y = encabezado(doc, {
      club: meta.clubNombre,
      titulo: `Resultados — Jornada ${jornada.numero}`,
      subtitulo: `${etiquetaDia(dia.fecha)} · ${jugados} de ${total} partidos jugados`,
      color: VERDE,
      logo: meta.logo,
    })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...COLOR.texto)
    doc.text(meta.ligaNombre.toUpperCase(), MARGEN, y)
    y += 8

    for (const div of dia.divisiones) {
      y = tituloSeccion(doc, y, div.nombre, undefined, VERDE)
      autoTable(doc, {
        ...estiloTabla(VERDE),
        startY: y,
        head: [['Hora', 'Mesa', 'Partido', 'Sets', 'Parciales', 'Ganador']],
        body: div.partidos.map(p => [p.hora, String(p.mesa), `${p.jugadorA}  vs  ${p.jugadorB}`, marcador(p), parciales(p), ganador(p)]),
        columnStyles: {
          0: { cellWidth: 16, halign: 'center' },
          1: { cellWidth: 14, halign: 'center' },
          2: { cellWidth: (W - 2 * MARGEN) - 16 - 14 - 18 - 40 - 40 },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 40, fontSize: 7.5 },
          5: { cellWidth: 40 },
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = ((doc as any).lastAutoTable?.finalY ?? y) + 10
    }
  })

  piePagina(doc, `${meta.clubNombre} · ${meta.ligaNombre}`)
  doc.save(`Resultados Jornada ${jornada.numero} — ${meta.ligaNombre}.pdf`)
}
