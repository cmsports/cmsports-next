// "Programación oficial — Jornada N": el PDF que el club pega en el mural y
// manda al WhatsApp. Reproduce el formato de la hoja que Spinhouse ya usaba:
// una página por día, cada división con su rango de mesas, y la tabla
// Hora · Mesa · Partido · Árbitro. El pie trae las reglas del club.

import { encabezado, piePagina, estiloTabla, tituloSeccion, COLOR, MARGEN, type RGB } from '@/lib/pdf/estilo'

export interface JornadaParaPdf {
  numero: number
  dias: Array<{
    fecha: string | null
    divisiones: Array<{
      nombre: string
      mesas: number[]
      partidos: Array<{
        hora: string; mesa: number; jugadorA: string; jugadorB: string; arbitro: string | null
        estado?: string; setsA?: number | null; setsB?: number | null
      }>
    }>
  }>
}

export interface MetaJornadaPdf {
  clubNombre: string
  ligaNombre: string
  /** Lo que va al pie: reglas, contacto, dirección. */
  pie?: string
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
 * Las planillas de mesa: una hoja por mesa y día, con los partidos de esa
 * mesa en orden y casillas vacías para que el árbitro anote los sets, el
 * resultado y firme. Es el papel que se deja en cada mesa.
 */
export async function descargarPlanillasJornadaPdf(jornada: JornadaParaPdf, meta: MetaJornadaPdf) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()
  let primera = true

  for (const dia of jornada.dias) {
    // Cada mesa con su división (en una jornada una mesa es de una sola división).
    const porMesa = new Map<number, { division: string; partidos: JornadaParaPdf['dias'][number]['divisiones'][number]['partidos'] }>()
    for (const div of dia.divisiones) for (const p of div.partidos) {
      const m = porMesa.get(p.mesa) ?? { division: div.nombre, partidos: [] }
      m.partidos.push(p)
      porMesa.set(p.mesa, m)
    }
    for (const [mesa, { division, partidos }] of [...porMesa.entries()].sort((a, b) => a[0] - b[0])) {
      if (!primera) doc.addPage()
      primera = false
      let y = encabezado(doc, {
        club: meta.clubNombre,
        titulo: `Planilla de mesa ${mesa} — Jornada ${jornada.numero}`,
        subtitulo: `${etiquetaDia(dia.fecha)} · ${division}`,
        color: AZUL,
      })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...COLOR.texto)
      doc.text('El árbitro anota los sets de cada partido, marca el ganador y firma. Espera máxima 15 min → W.O. 3-0.', MARGEN, y)
      y += 6
      autoTable(doc, {
        ...estiloTabla(AZUL),
        startY: y,
        head: [['Hora', 'Jugador A', 'Jugador B', 'S1', 'S2', 'S3', 'S4', 'S5', 'Sets', 'Ganador', 'Árbitro / firma']],
        body: partidos.sort((a, b) => a.hora.localeCompare(b.hora)).map(p => [p.hora, p.jugadorA, p.jugadorB, '', '', '', '', '', '', '', p.arbitro ?? '']),
        theme: 'grid',
        styles: { ...estiloTabla(AZUL).styles, lineWidth: 0.3, minCellHeight: 12, valign: 'middle' },
        columnStyles: {
          0: { cellWidth: 13, halign: 'center' },
          1: { cellWidth: 34 },
          2: { cellWidth: 34 },
          3: { cellWidth: 9, halign: 'center' }, 4: { cellWidth: 9, halign: 'center' }, 5: { cellWidth: 9, halign: 'center' },
          6: { cellWidth: 9, halign: 'center' }, 7: { cellWidth: 9, halign: 'center' },
          8: { cellWidth: 12, halign: 'center' },
          9: { cellWidth: 22 },
          10: { cellWidth: (W - 2 * MARGEN) - 13 - 34 - 34 - 45 - 12 - 22 },
        },
      })
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
    })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...COLOR.texto)
    doc.text(meta.ligaNombre.toUpperCase(), MARGEN, y)
    y += 8

    for (const div of dia.divisiones) {
      y = tituloSeccion(doc, y, div.nombre, undefined, VERDE)
      autoTable(doc, {
        ...estiloTabla(VERDE),
        startY: y,
        head: [['Hora', 'Mesa', 'Partido', 'Resultado', 'Ganador']],
        body: div.partidos.map(p => [p.hora, String(p.mesa), `${p.jugadorA}  vs  ${p.jugadorB}`, marcador(p), ganador(p)]),
        columnStyles: {
          0: { cellWidth: 16, halign: 'center' },
          1: { cellWidth: 14, halign: 'center' },
          2: { cellWidth: (W - 2 * MARGEN) - 16 - 14 - 24 - 48 },
          3: { cellWidth: 24, halign: 'center' },
          4: { cellWidth: 48 },
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = ((doc as any).lastAutoTable?.finalY ?? y) + 10
    }
  })

  piePagina(doc, `${meta.clubNombre} · ${meta.ligaNombre}`)
  doc.save(`Resultados Jornada ${jornada.numero} — ${meta.ligaNombre}.pdf`)
}
