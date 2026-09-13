// Los papeles de una fecha de la liga de mesa única (TableroFecha), sobre el
// molde v2 (lib/pdf/papel.ts):
//   · Por horario: qué se juega a qué hora, agrupado por bloque, para el mural.
//   · Por mesa: una planilla por mesa con casillas para los sets, el resultado
//     y el árbitro, para llevar a la mesa.
// Cada división conserva su color (colorPorNombre), el mismo que en pantalla.

import { colorPorNombre } from '@/lib/pdf/estilo'
import {
  TINTA, GRIS, GRIS_CLARO, BLANCO, LINEA, FONDO, MARGEN,
  nuevoDocumento, portada, pieDePagina, seccion, tabla, trasTabla, nota, mezclar, type Marca, type RGB,
} from '@/lib/pdf/papel'

export interface PartidoFechaPdf {
  bloqueHorario: string
  mesaNumero: number
  divisionNombre: string
  jugadorA: string
  jugadorB: string
  arbitro: string | null
}

export interface MetaFechaPdf {
  marca: Marca
  ligaNombre: string
  numero: number
  /** Fecha del día, si se conoce. */
  fecha?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fuente(doc: any, peso: 'normal' | 'semibold' | 'bold', tam: number, color: RGB) {
  const lista = doc.getFontList?.() ?? {}
  doc.setFont(lista.Inter ? 'Inter' : 'helvetica', lista.Inter ? peso : (peso === 'normal' ? 'normal' : 'bold'))
  doc.setFontSize(tam)
  doc.setTextColor(...color)
}

/** Programación por horario: un bloque de hora, sus partidos debajo. */
export async function descargarFechaPorHorarioPdf(partidos: PartidoFechaPdf[], meta: MetaFechaPdf) {
  const { marca } = meta
  const cab = { titulo: `Fecha ${meta.numero} · Programación por horario`, subtitulo: `${meta.ligaNombre}${meta.fecha ? ` · ${meta.fecha}` : ''}`, nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cab)
  let y = y0

  const orden = [...partidos].sort((a, b) => a.bloqueHorario.localeCompare(b.bloqueHorario) || a.mesaNumero - b.mesaNumero)
  if (!orden.length) {
    nota(doc, y, 'Todavía no hay partidos programados en esta fecha.')
  } else {
    const bloques = [...new Set(orden.map(p => p.bloqueHorario))]
    // Una fila-título por bloque, que ocupa todo el ancho: de un vistazo se
    // ve qué se juega a qué hora. Y sin columna Mesa: cada división juega
    // siempre en la misma mesa, así que "Mesa" y "División" serían el mismo
    // dato dos veces.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any[] = []
    const filaAPartido: (PartidoFechaPdf | null)[] = []
    for (const b of bloques) {
      const delBloque = orden.filter(p => p.bloqueHorario === b)
      body.push([{ content: `${b}   ·   ${delBloque.length} partido${delBloque.length !== 1 ? 's' : ''}`, colSpan: 5, styles: { fillColor: mezclar(marca.acento, 0.12), textColor: TINTA, fontStyle: 'bold', fontSize: 9.5, cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 } } }])
      filaAPartido.push(null)
      for (const p of delBloque) {
        body.push([p.divisionNombre, p.jugadorA, '', p.jugadorB, p.arbitro ?? '—'])
        filaAPartido.push(p)
      }
    }
    autoTable(doc, {
      ...tabla(marca, {
        tamano: 9.5, anchos: { 0: 34, 2: 11, 4: 38 },
        alParsear: d => {
          if (d.section !== 'body') return
          const p = filaAPartido[d.row.index]
          if (!p) return
          if (d.column.index === 0) { d.cell.styles.textColor = colorPorNombre(p.divisionNombre); d.cell.styles.fontStyle = 'bold' }
          if (d.column.index === 1 || d.column.index === 3) d.cell.styles.fontStyle = 'bold'
          if (d.column.index === 2) d.cell.styles.cellPadding = { top: 2.8, bottom: 2.8, left: 0, right: 0 }
          if (d.column.index === 4) d.cell.styles.textColor = p.arbitro ? GRIS : GRIS_CLARO
        },
        alDibujar: d => {
          if (d.section !== 'body' || d.column.index !== 2) return
          const p = filaAPartido[d.row.index]
          if (!p) return
          const cx = d.cell.x + d.cell.width / 2, cy = d.cell.y + d.cell.height / 2
          doc.setFillColor(...colorPorNombre(p.divisionNombre))
          doc.circle(cx, cy, 3.2, 'F')
          fuente(doc, 'bold', 6, BLANCO)
          doc.text('VS', cx, cy + 1, { align: 'center' })
        },
      }),
      startY: y,
      head: [['División', 'Jugador A', '', 'Jugador B', 'Árbitro']],
      body,
    })
    y = trasTabla(doc)
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `${meta.ligaNombre} · Fecha ${meta.numero} · por horario`)
  doc.save(`fecha${meta.numero}_horarios.pdf`)
}

/** Planillas por mesa: cada mesa con sus partidos y casillas para anotar. */
export async function descargarFechaPorMesaPdf(partidos: PartidoFechaPdf[], meta: MetaFechaPdf) {
  const { marca } = meta
  const cab = { titulo: `Fecha ${meta.numero} · Planillas por mesa`, subtitulo: `${meta.ligaNombre}${meta.fecha ? ` · ${meta.fecha}` : ''}`, nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cab)
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const ancho = W - 2 * MARGEN
  let y = y0

  const orden = [...partidos].sort((a, b) => a.mesaNumero - b.mesaNumero || a.bloqueHorario.localeCompare(b.bloqueHorario))
  if (!orden.length) {
    nota(doc, y, 'Todavía no hay partidos programados en esta fecha.')
  } else {
    y = nota(doc, y - 4, 'El árbitro anota los puntos de cada set, el resultado en sets y firma. Espera máxima 15 min → W.O. 3-0.')
    const C_HORA = 16, C_SET = 10, C_RES = 14, C_ARB = 32
    const C_JUG = ancho - C_HORA - 5 * C_SET - C_RES - C_ARB
    const mesas = [...new Set(orden.map(p => p.mesaNumero))]
    for (const mesa of mesas) {
      const delMesa = orden.filter(p => p.mesaNumero === mesa)
      const division = delMesa[0]?.divisionNombre ?? '—'
      const color = colorPorNombre(division)
      if (y + 14 + delMesa.length * 12 > H - 22) { doc.addPage(); y = portada(doc, marca, cab) }
      // Franja de la mesa con el color de su división: un color = una división.
      doc.setFillColor(...color)
      doc.roundedRect(MARGEN, y, ancho, 7, 1, 1, 'F')
      fuente(doc, 'bold', 9, BLANCO)
      doc.text(`MESA ${mesa}`, MARGEN + 3, y + 4.8)
      fuente(doc, 'normal', 8.5, BLANCO)
      doc.text(`·  ${division}`, MARGEN + 3 + doc.getTextWidth(`MESA ${mesa}`) + 3, y + 4.8)
      doc.text(`${delMesa.length} partido${delMesa.length !== 1 ? 's' : ''}`, W - MARGEN - 3, y + 4.8, { align: 'right' })
      y += 7
      autoTable(doc, {
        ...tabla(marca, {
          conGrilla: true, tamano: 8.5, centradas: [0, 2, 3, 4, 5, 6, 7],
          anchos: { 0: C_HORA, 1: C_JUG, 2: C_SET, 3: C_SET, 4: C_SET, 5: C_SET, 6: C_SET, 7: C_RES, 8: C_ARB },
          alParsear: d => {
            if (d.section !== 'body') return
            d.cell.styles.minCellHeight = 12; d.cell.styles.valign = 'middle'
            if (d.column.index === 0) d.cell.styles.fontStyle = 'bold'
            if (d.column.index === 1) d.cell.styles.fontStyle = 'bold'
            if (d.column.index === 8 && !delMesa[d.row.index]?.arbitro) d.cell.styles.textColor = GRIS_CLARO
          },
          alDibujar: d => {
            // Dos casillas por set (arriba A, abajo B), como en la planilla de papel.
            if (d.section !== 'body' || d.column.index < 2 || d.column.index > 7) return
            const c = d.cell
            doc.setDrawColor(...LINEA); doc.setLineWidth(0.2)
            doc.line(c.x + 1, c.y + c.height / 2, c.x + c.width - 1, c.y + c.height / 2)
          },
        }),
        startY: y,
        head: [['Hora', 'Partido', 'S1', 'S2', 'S3', 'S4', 'S5', 'Sets', 'Árbitro']],
        body: delMesa.map(p => [p.bloqueHorario, `${p.jugadorA}\n${p.jugadorB}`, '', '', '', '', '', '', p.arbitro ?? 'sin asignar']),
      })
      y = trasTabla(doc, 6)
    }
    // Observaciones y firma.
    if (y + 26 > H - 22) { doc.addPage(); y = portada(doc, marca, cab) }
    y = seccion(doc, y + 2, marca, 'Observaciones')
    doc.setFillColor(...FONDO)
    doc.roundedRect(MARGEN, y - 2, ancho, 20, 1.5, 1.5, 'F')
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.3)
    doc.line(MARGEN + 3, y + 5, W - MARGEN - 3, y + 5)
    doc.line(MARGEN + 3, y + 11, W - MARGEN - 3, y + 11)
    fuente(doc, 'normal', 7.5, GRIS)
    doc.text('Firma árbitro:', MARGEN + 3, y + 16.5)
    doc.line(MARGEN + 26, y + 17, MARGEN + 90, y + 17)
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `${meta.ligaNombre} · Fecha ${meta.numero} · por mesa`)
  doc.save(`fecha${meta.numero}_por_mesa.pdf`)
}
