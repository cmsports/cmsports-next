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
      partidos: Array<{ hora: string; mesa: number; jugadorA: string; jugadorB: string; arbitro: string | null }>
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
