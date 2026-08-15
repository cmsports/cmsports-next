// PDF del ranking de una categoría — el que se imprime y se pega en el mural.
//
// Reproduce lo que se ve en /ranking: el podio arriba y abajo la tabla con
// todos. Mismo criterio de podio que la pantalla (solo si hay un ganador claro)
// y mismos puestos compartidos, para que el papel y la app nunca digan cosas
// distintas.
//
// Sin emoji: las fuentes que trae jsPDF (helvetica y compañía) no tienen las
// medallas ni el 🏓, y salen como cuadraditos. Donde la pantalla pone un emoji,
// acá va color y tipografía.

import { encabezado, piePagina, estiloTabla, tituloSeccion, COLOR, MARGEN, tinte, type RGB } from '@/lib/pdf/estilo'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'
import { enBonito } from '@/lib/domain/nombreJugador'
import { TABLA_PUNTAJE } from '@/lib/domain/puntajeTorneo'
import type { ResultadoJugadorRanking } from '@/lib/domain/rankingInterno'

const ORO:    RGB = [245, 158, 11]
const PLATA:  RGB = [148, 163, 184]
const BRONCE: RGB = [194, 112, 58]
const INDIGO: RGB = [49, 46, 129]

export function generoLabel(genero: string | null): string {
  return genero === 'varones' ? 'Varones' : genero === 'damas' ? 'Damas' : genero === 'mixto' ? 'Mixto' : ''
}

type Meta = {
  clubNombre: string
  /** Fecha del último "Reiniciar Ranking", si lo hubo: el ranking cuenta desde ahí. */
  reiniciadoEn?: string | null
}

/**
 * Dibuja el podio: tres columnas al ras, la del campeón al medio y más alta.
 * Devuelve el `y` donde sigue el contenido.
 */
function podio(doc: any, y: number, oro: ResultadoJugadorRanking, plata?: ResultadoJugadorRanking, bronce?: ResultadoJugadorRanking): number {
  const W = doc.internal.pageSize.getWidth()
  const ALTO_CAJA = 62
  const anchoCol = 44
  const gap = 6
  const base = y + ALTO_CAJA - 8

  doc.setFillColor(...INDIGO)
  doc.roundedRect(MARGEN, y, W - 2 * MARGEN, ALTO_CAJA, 3, 3, 'F')

  doc.setTextColor(...tinte(INDIGO, 0.25))
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('PODIO', MARGEN + 6, y + 8)

  const columnas = [
    { fila: plata,  alto: 20, color: PLATA,  texto: [30, 41, 59] as RGB },
    { fila: oro,    alto: 32, color: ORO,    texto: [66, 32, 6] as RGB },
    { fila: bronce, alto: 14, color: BRONCE, texto: [255, 255, 255] as RGB },
  ]

  const anchoTotal = columnas.length * anchoCol + (columnas.length - 1) * gap
  const x0 = (W - anchoTotal) / 2

  columnas.forEach((col, i) => {
    if (!col.fila) return
    const x = x0 + i * (anchoCol + gap)
    const topeCol = base - col.alto

    // El nombre, arriba de su columna. Cortado a lo que entra: "Agustín Edison
    // Leonel Calderón Vera" no cabe en 44mm y empujaría a las otras dos.
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
    const nombre = doc.splitTextToSize(enBonito(col.fila.nombre), anchoCol - 2).slice(0, 2)
    doc.text(nombre, x + anchoCol / 2, topeCol - 3 - (nombre.length - 1) * 3, { align: 'center' })

    doc.setFillColor(...col.color)
    doc.roundedRect(x, topeCol, anchoCol, col.alto, 1.5, 1.5, 'F')

    doc.setTextColor(...col.texto)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(col.alto > 24 ? 15 : 11)
    doc.text(String(col.fila.pts), x + anchoCol / 2, topeCol + col.alto / 2 + 1, { align: 'center' })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5)
    doc.text(`${col.fila.rank}° LUGAR`, x + anchoCol / 2, topeCol + col.alto - 2.5, { align: 'center' })
  })

  return y + ALTO_CAJA + 10
}

export async function exportarRankingPdf(
  ranking: { categoria: string; genero: string | null; filas: ResultadoJugadorRanking[] },
  meta: Meta,
) {
  if (ranking.filas.length === 0) return

  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const gen = generoLabel(ranking.genero)
  const titulo = `Ranking ${categoriaLabel(ranking.categoria)}${gen ? ` · ${gen}` : ''}`

  let y = encabezado(doc, {
    club: meta.clubNombre,
    titulo,
    subtitulo: `Generado el ${new Date().toLocaleDateString('es-CL')}`,
  })

  // Mismo criterio que la pantalla: el podio solo tiene sentido con un ganador
  // claro. Si empatan varios arriba —pasa cuando casi todos se fueron en grupos
  // con los mismos 9 puntos— va la lista pareja y nada más.
  const oro    = ranking.filas.filter(f => f.rank === 1)
  const plata  = ranking.filas.filter(f => f.rank === 2)
  const bronce = ranking.filas.filter(f => f.rank === 3)
  const hayPodio = oro.length === 1 && plata.length <= 1 && bronce.length <= 1

  if (hayPodio) y = podio(doc, y, oro[0], plata[0], bronce[0])

  // La tabla va SIEMPRE con todos, incluidos los del podio. En pantalla el
  // podio los saca de la lista porque están ahí arriba a la vista; en un papel
  // que se lee de corrido, que el 1° no aparezca en la tabla se lee como un
  // error de la tabla.
  y = tituloSeccion(doc, y, `Tabla completa · ${ranking.filas.length} jugadores`)

  const estilo = estiloTabla()
  autoTable(doc, {
    startY: y,
    head: [['#', 'Jugador', 'Torneos', 'G', 'P', 'Puntos']],
    body: ranking.filas.map(f => [
      `${f.rank}°`,
      enBonito(f.nombre),
      f.torneos || '—',
      f.victorias,
      f.derrotas,
      f.pts,
    ]),
    ...estilo,
    columnStyles: {
      0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
    },
    // Las tres primeras filas con el color de su medalla, igual que el podio.
    didParseCell: (data: any) => {
      if (data.section !== 'body') return
      const rank = ranking.filas[data.row.index]?.rank
      const color = rank === 1 ? ORO : rank === 2 ? PLATA : rank === 3 ? BRONCE : null
      if (color) data.cell.styles.fillColor = tinte(color, 0.16)
    },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  // La misma explicación que vive detrás del "?" en la pantalla. En el mural es
  // donde más falta hace: es lo primero que pregunta el que mira la tabla.
  const ALTO_NOTA = 30
  if (y + ALTO_NOTA > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }

  doc.setFillColor(...COLOR.fondoSuave)
  doc.setDrawColor(...COLOR.borde); doc.setLineWidth(0.2)
  doc.roundedRect(MARGEN, y, doc.internal.pageSize.getWidth() - 2 * MARGEN, ALTO_NOTA, 2, 2, 'FD')

  doc.setTextColor(...COLOR.primarioOs)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text('Cómo se calculan los puntos', MARGEN + 5, y + 6)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.setTextColor(...COLOR.mutado)
  doc.text(TABLA_PUNTAJE.map(t => `${t.puesto}: ${t.puntos}`).join('   ·   '), MARGEN + 5, y + 12)
  doc.text(doc.splitTextToSize(
    'Cada torneo reparte puntos según dónde terminó cada jugador, no por cuántos partidos ganó. '
    + 'Los dos que caen en semifinales quedan 3-4 y se llevan lo mismo; los cuatro que caen en cuartos, 5-8. '
    + 'El que participa y no pasa de la fase de grupos igual suma, y perder no resta. '
    + 'Dos jugadores con los mismos puntos comparten puesto.',
    doc.internal.pageSize.getWidth() - 2 * MARGEN - 10,
  ), MARGEN + 5, y + 17)

  const desde = meta.reiniciadoEn
    ? ` · cuenta desde el ${new Date(meta.reiniciadoEn).toLocaleDateString('es-CL')}`
    : ''
  piePagina(doc, `${meta.clubNombre || 'CmSports'} · ${titulo}${desde}`)

  const slug = `${ranking.categoria}${gen ? `_${gen}` : ''}`.replace(/[^a-zA-Z0-9]+/g, '_')
  doc.save(`ranking_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
