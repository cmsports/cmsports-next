// PDF del ranking de una categoría — el que se imprime y se pega en el mural.
//
// Reproduce lo que se ve en /ranking: el podio arriba (con las fotos, si las
// hay) y abajo la tabla con todos. Mismo criterio de podio que la pantalla
// (solo si hay un ganador claro) y mismos puestos compartidos, para que el
// papel y la app nunca digan cosas distintas.
//
// Sin emoji: las fuentes del PDF no tienen las medallas ni el 🏓, y salen
// como cuadraditos. Donde la pantalla pone un emoji, acá va color y forma.

import type { Marca, RGB, LogoPdf } from '@/lib/pdf/papel'
import {
  TINTA, TEXTO, GRIS, GRIS_CLARO, LINEA, FONDO, BLANCO, MARGEN,
  nuevoDocumento, pieDePagina, asegurar, seccion, tabla, trasTabla, nota, parrafo, retrato,
} from '@/lib/pdf/papel'
import { cargarLogoPdf } from '@/lib/pdf/estilo'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'
import { enBonito } from '@/lib/domain/nombreJugador'
import { TABLA_PUNTAJE } from '@/lib/domain/puntajeTorneo'
import type { ResultadoJugadorRanking } from '@/lib/domain/rankingInterno'

const ORO: RGB = [217, 119, 6]
const PLATA: RGB = [100, 116, 139]
const BRONCE: RGB = [180, 83, 9]

export function generoLabel(genero: string | null): string {
  return genero === 'varones' ? 'Varones' : genero === 'damas' ? 'Damas' : genero === 'mixto' ? 'Mixto' : ''
}

type Meta = {
  marca: Marca
  /** Fecha del último "Reiniciar Ranking", si lo hubo: el ranking cuenta desde ahí. */
  reiniciadoEn?: string | null
  /** Foto por jugador (enlace ya firmado), para el podio. */
  fotos?: Record<string, string>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fuente(doc: any, peso: 'normal' | 'semibold' | 'bold', tam: number, color: RGB) {
  const lista = doc.getFontList?.() ?? {}
  doc.setFont(lista.Inter ? 'Inter' : 'helvetica', lista.Inter ? peso : (peso === 'normal' ? 'normal' : 'bold'))
  doc.setFontSize(tam)
  doc.setTextColor(...color)
}

/**
 * El podio: tres columnas, la del campeón al medio y más alta, cada una con
 * su retrato, nombre y puntos. Devuelve el `y` donde sigue el contenido.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function podio(doc: any, y: number, fotos: Record<string, LogoPdf | null>, oro: ResultadoJugadorRanking, plata?: ResultadoJugadorRanking, bronce?: ResultadoJugadorRanking): number {
  const W = doc.internal.pageSize.getWidth()
  const anchoCol = 46, gap = 8
  const columnas = [
    { fila: plata, alto: 16, color: PLATA },
    { fila: oro, alto: 26, color: ORO },
    { fila: bronce, alto: 10, color: BRONCE },
  ]
  const R = 9
  const altoCabeza = R * 2 + 16 // retrato + nombre + puntos
  const base = y + altoCabeza + 26
  const anchoTotal = columnas.length * anchoCol + (columnas.length - 1) * gap
  const x0 = (W - anchoTotal) / 2

  doc.setFillColor(...FONDO)
  doc.roundedRect(MARGEN, y - 4, W - 2 * MARGEN, base - y + 10, 3, 3, 'F')

  columnas.forEach((col, i) => {
    if (!col.fila) return
    const x = x0 + i * (anchoCol + gap)
    const cx = x + anchoCol / 2
    const tope = base - col.alto
    // Retrato, nombre y puntos, apilados sobre la columna.
    retrato(doc, cx, tope - 24, R, col.fila.nombre, fotos[col.fila.jugadorId] ?? null, col.color)
    fuente(doc, 'semibold', 8, TINTA)
    const nombre: string[] = doc.splitTextToSize(enBonito(col.fila.nombre), anchoCol - 2).slice(0, 2)
    doc.text(nombre, cx, tope - 10.5, { align: 'center' })
    fuente(doc, 'bold', 10, col.color)
    doc.text(`${col.fila.pts} pts`, cx, tope - 2.5 + (nombre.length - 1) * 0, { align: 'center' })
    // La columna.
    doc.setFillColor(...col.color)
    doc.roundedRect(x, tope, anchoCol, col.alto, 1.5, 1.5, 'F')
    fuente(doc, 'bold', col.alto > 20 ? 13 : 10, BLANCO)
    doc.text(`${col.fila.rank}°`, cx, tope + col.alto / 2 + (col.alto > 20 ? 4.5 : 3.5), { align: 'center' })
  })
  doc.setDrawColor(...LINEA); doc.setLineWidth(0.4)
  doc.line(x0 - 4, base, x0 + anchoTotal + 4, base)
  return base + 14
}

export async function exportarRankingPdf(
  ranking: { categoria: string; genero: string | null; filas: ResultadoJugadorRanking[] },
  meta: Meta,
) {
  if (ranking.filas.length === 0) return
  const gen = generoLabel(ranking.genero)
  const titulo = `Ranking ${categoriaLabel(ranking.categoria)}${gen ? ` · ${gen}` : ''}`
  // Una fecha sin hora se lee al mediodía para que no se corra un día por la zona horaria.
  const reinicio = meta.reiniciadoEn ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(meta.reiniciadoEn) ? meta.reiniciadoEn + 'T12:00:00' : meta.reiniciadoEn) : null
  const desde = reinicio ? `cuenta desde el ${reinicio.toLocaleDateString('es-CL')}` : null
  const cab = { titulo, subtitulo: `${ranking.filas.length} jugadores${desde ? ` · ${desde}` : ''}`, nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(meta.marca, cab)
  let y = y0

  // Mismo criterio que la pantalla: el podio solo tiene sentido con un ganador
  // claro. Si empatan varios arriba —pasa cuando casi todos se fueron en grupos
  // con los mismos 9 puntos— va la lista pareja y nada más.
  const oro = ranking.filas.filter(f => f.rank === 1)
  const plata = ranking.filas.filter(f => f.rank === 2)
  const bronce = ranking.filas.filter(f => f.rank === 3)
  const hayPodio = oro.length === 1 && plata.length <= 1 && bronce.length <= 1

  if (hayPodio) {
    const delPodio = [oro[0], plata[0], bronce[0]].filter(Boolean) as ResultadoJugadorRanking[]
    const fotos: Record<string, LogoPdf | null> = {}
    await Promise.all(delPodio.map(async f => { fotos[f.jugadorId] = await cargarLogoPdf(meta.fotos?.[f.jugadorId]) }))
    y = podio(doc, y, fotos, oro[0], plata[0], bronce[0])
  } else if (oro.length > 1) {
    y = parrafo(doc, y, `${oro.length} jugadores comparten el primer lugar con ${oro[0].pts} puntos.`, { color: GRIS })
  }

  // La tabla va SIEMPRE con todos, incluidos los del podio. En pantalla el
  // podio los saca de la lista porque están ahí arriba a la vista; en un papel
  // que se lee de corrido, que el 1° no aparezca en la tabla se lee como un
  // error de la tabla.
  y = seccion(doc, y, meta.marca, 'Tabla completa', `${ranking.filas.length} jugadores`)
  const maxPts = Math.max(1, ...ranking.filas.map(f => f.pts))
  autoTable(doc, {
    ...tabla(meta.marca, {
      centradas: [0, 2, 3], numericas: [4], anchos: { 0: 12, 2: 20, 3: 26, 4: 22, 5: 40 },
      alParsear: data => {
        if (data.section !== 'body') return
        const f = ranking.filas[data.row.index]
        const color = f?.rank === 1 ? ORO : f?.rank === 2 ? PLATA : f?.rank === 3 ? BRONCE : null
        if (data.column.index === 0) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.textColor = color ?? GRIS_CLARO }
        if (data.column.index === 4) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.textColor = TINTA }
        if (data.column.index === 5) data.cell.styles.textColor = BLANCO
      },
      alDibujar: data => {
        if (data.section !== 'body' || data.column.index !== 5) return
        const f = ranking.filas[data.row.index]
        if (!f) return
        const c = data.cell
        const w = c.width - 5
        doc.setFillColor(...FONDO)
        doc.roundedRect(c.x + 2.5, c.y + c.height / 2 - 1.3, w, 2.6, 0.8, 0.8, 'F')
        doc.setFillColor(...(f.rank === 1 ? ORO : f.rank === 2 ? PLATA : f.rank === 3 ? BRONCE : meta.marca.acento))
        doc.roundedRect(c.x + 2.5, c.y + c.height / 2 - 1.3, Math.max(0.8, (f.pts / maxPts) * w), 2.6, 0.8, 0.8, 'F')
      },
    }),
    startY: y,
    head: [['#', 'Jugador', 'Torneos', 'Ganados / perdidos', 'Puntos', '']],
    body: ranking.filas.map(f => [
      `${f.rank}°`,
      enBonito(f.nombre),
      f.torneos ? String(f.torneos) : '—',
      `${f.victorias} / ${f.derrotas}`,
      String(f.pts),
      '',
    ]),
  })
  y = trasTabla(doc)

  // La misma explicación que vive detrás del "?" en la pantalla. En el mural es
  // donde más falta hace: es lo primero que pregunta el que mira la tabla.
  y = asegurar(doc, y, 40, meta.marca, cab)
  y = seccion(doc, y, meta.marca, 'Cómo se calculan los puntos')
  fuente(doc, 'semibold', 8.5, TEXTO)
  const lineasPuntaje: string[] = doc.splitTextToSize(TABLA_PUNTAJE.map(t => `${t.puesto}: ${t.puntos}`).join('   ·   '), doc.internal.pageSize.getWidth() - 2 * MARGEN)
  doc.text(lineasPuntaje, MARGEN, y)
  y += lineasPuntaje.length * 4.6 + 2
  y = nota(doc, y,
    'Cada torneo reparte puntos según dónde terminó cada jugador, no por cuántos partidos ganó. '
    + 'El 3° y el 4° salen del partido por el tercer lugar; si no se jugó, los dos semifinalistas comparten 3-4. '
    + 'Los cuatro que caen en cuartos son todos 5-8. '
    + 'El que participa y no pasa de la fase de grupos igual suma, y perder no resta. '
    + 'Dos jugadores con los mismos puntos comparten puesto.')

  doc.setTextColor(...TINTA)
  pieDePagina(doc, meta.marca, `${titulo}${desde ? ` · ${desde}` : ''}`)

  const slug = `${ranking.categoria}${gen ? `_${gen}` : ''}`.replace(/[^a-zA-Z0-9]+/g, '_')
  doc.save(`ranking_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
