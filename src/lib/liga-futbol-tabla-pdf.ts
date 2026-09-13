// PDF de la tabla de posiciones de una liga de fútbol — molde v2
// (lib/pdf/papel.ts): la tabla con los puntos en barra y el goleo al lado.

import { TINTA, GRIS_CLARO, VERDE, ROJO, nuevoDocumento, pieDePagina, seccion, tabla, barraEnCelda, marcaDelClub, type Marca } from '@/lib/pdf/papel'
import type { EquipoStats } from '@/lib/domain/liga-futbol'

export async function exportarTablaLigaFutbolPdf(
  ligaNombre: string,
  clubNombre: string,
  filas: EquipoStats[],
  equipoPorId: (id: string) => { nombre: string } | undefined,
  marcaDada?: Marca,
) {
  if (filas.length === 0) return
  const marca = marcaDada ?? await marcaDelClub({ nombre: clubNombre, logo_url: null })
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, {
    titulo: 'Tabla de posiciones',
    subtitulo: ligaNombre,
    nota: `Generado el ${new Date().toLocaleDateString('es-CL')}`,
  })
  let y = y0
  const maxPts = Math.max(1, ...filas.map(f => f.pts))

  y = seccion(doc, y, marca, 'Posiciones', `${filas.length} equipos`)
  autoTable(doc, {
    ...tabla(marca, {
      centradas: [0, 2, 3, 4, 5, 6, 7, 8], numericas: [9],
      anchos: { 0: 10, 2: 12, 3: 12, 4: 12, 5: 12, 6: 12, 7: 12, 8: 14, 9: 16, 10: 30 },
      alParsear: d => {
        if (d.section !== 'body') return
        const f = filas[d.row.index]
        if (d.column.index === 0) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = GRIS_CLARO }
        if (d.column.index === 8 && f) d.cell.styles.textColor = f.dg > 0 ? VERDE : f.dg < 0 ? ROJO : GRIS_CLARO
        if (d.column.index === 9) d.cell.styles.fontStyle = 'bold'
        if (d.column.index === 10) d.cell.styles.textColor = [255, 255, 255]
      },
      alDibujar: d => {
        if (d.section !== 'body' || d.column.index !== 10) return
        const f = filas[d.row.index]
        if (f) barraEnCelda(doc, d.cell, (f.pts / maxPts) * 100, marca.acento, null)
      },
    }),
    startY: y,
    head: [['#', 'Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS', '']],
    body: filas.map((row, i) => [
      String(i + 1),
      equipoPorId(row.equipoId)?.nombre || '—',
      String(row.pj), String(row.pg), String(row.pe), String(row.pp), String(row.gf), String(row.gc),
      row.dg > 0 ? `+${row.dg}` : String(row.dg),
      String(row.pts),
      '',
    ]),
  })

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, ligaNombre)
  const slug = ligaNombre.replace(/[^a-zA-Z0-9]+/g, '_')
  doc.save(`tabla_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
