// PDF de la tabla de posiciones de una división de liga, sobre el molde v2
// (lib/pdf/papel.ts): el podio en cifras, la tabla con los puntos en barra y
// la leyenda de las columnas.

import type { FilaRanking } from '@/lib/domain/liga'
import {
  TINTA, GRIS, GRIS_CLARO, VERDE, ROJO, BLANCO,
  nuevoDocumento, pieDePagina, seccion, cifras, tabla, trasTabla, barraEnCelda, nota, type Marca,
} from '@/lib/pdf/papel'

export async function descargarTablaDivisionPdf(args: {
  marca: Marca
  ligaNombre?: string | null
  nombreDivision: string
  ranking: FilaRanking[]
  nombreDe: (jugadorId: string) => string
}) {
  const { marca, ranking, nombreDe } = args
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, {
    titulo: `Tabla de posiciones · ${args.nombreDivision}`,
    subtitulo: args.ligaNombre ?? undefined,
    nota: `Generado el ${new Date().toLocaleDateString('es-CL')}`,
  })
  let y = y0
  const jugados = ranking.reduce((s, r) => s + r.pj, 0) / 2
  const top = ranking.slice(0, 3)

  y = cifras(doc, y, marca, [
    ...top.map((r, i) => ({ etiqueta: `${i + 1}° lugar`, valor: nombreDe(r.jugadorId), detalle: `${r.pts} pts · ${r.pg}-${r.pp}`, color: i === 0 ? marca.acento : GRIS })),
    { etiqueta: 'Partidos jugados', valor: String(Math.round(jugados)), detalle: `${ranking.length} jugadores` },
  ])

  const maxPts = Math.max(1, ...ranking.map(r => r.pts))
  y = seccion(doc, y, marca, 'Posiciones', `${ranking.length} jugadores`)
  autoTable(doc, {
    ...tabla(marca, {
      tamano: 8, centradas: [0, 2, 3, 4, 6, 7, 8, 9], numericas: [5],
      anchos: { 0: 10, 2: 12, 3: 12, 4: 12, 5: 14, 6: 12, 7: 12, 8: 14, 9: 14, 10: 26 },
      alParsear: d => {
        if (d.section !== 'body') return
        const r = ranking[d.row.index]
        if (d.column.index === 0) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = d.row.index < 3 ? marca.acento : GRIS_CLARO }
        if (d.column.index === 5) d.cell.styles.fontStyle = 'bold'
        if ((d.column.index === 8 || d.column.index === 9) && r) {
          const v = d.column.index === 8 ? r.ds : r.dp
          d.cell.styles.textColor = v > 0 ? VERDE : v < 0 ? ROJO : GRIS_CLARO
        }
        if (d.column.index === 10) d.cell.styles.textColor = BLANCO
      },
      alDibujar: d => {
        if (d.section !== 'body' || d.column.index !== 10) return
        const r = ranking[d.row.index]
        if (r) barraEnCelda(doc, d.cell, (r.pts / maxPts) * 100, marca.acento, null)
      },
    }),
    startY: y,
    head: [['#', 'Jugador', 'PJ', 'PG', 'PP', 'PTS', 'SF', 'SC', 'DS', 'DP', '']],
    body: ranking.map((r, i) => [
      String(i + 1), nombreDe(r.jugadorId), String(r.pj), String(r.pg), String(r.pp), String(r.pts), String(r.sf), String(r.sc),
      r.ds > 0 ? `+${r.ds}` : String(r.ds), r.dp > 0 ? `+${r.dp}` : String(r.dp), '',
    ]),
  })
  y = trasTabla(doc, 6)
  nota(doc, y, 'PJ jugados · PG ganados · PP perdidos · PTS puntos · SF sets a favor · SC sets en contra · DS diferencia de sets · DP diferencia de puntos. Desempate: puntos, partidos ganados, diferencia de sets, sets a favor, diferencia de puntos.')

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Tabla de posiciones · ${args.nombreDivision}`)
  doc.save(`tabla_${args.nombreDivision.replace(/\s+/g, '_')}.pdf`)
}
